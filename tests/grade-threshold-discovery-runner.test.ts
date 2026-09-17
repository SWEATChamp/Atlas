import { describe, expect, test, vi } from 'vitest'
import {
  normalizePublicationUrl,
  runGradeThresholdDiscovery,
} from '../lib/grade-thresholds/discovery-runner'
import { CambridgeFetchError } from '../lib/grade-thresholds/publication-discovery'
import { CAMBRIDGE_JUNE_2026_SOURCES } from '../lib/grade-thresholds/source-manifest'

describe('grade-threshold discovery runner', () => {
  const FIXED_DATE = new Date('2026-06-15T12:00:00.000Z')

  function notFound(): never {
    throw new CambridgeFetchError('HTTP status 404: Not Found', 'not_found', 404)
  }

  test('normalizePublicationUrl canonicalizes URLs deterministically', () => {
    expect(
      normalizePublicationUrl(
        'HTTPS://WWW.CAMBRIDGEINTERNATIONAL.ORG/Images/Test.pdf/',
      ),
    ).toBe('https://www.cambridgeinternational.org/Images/Test.pdf')
    expect(
      normalizePublicationUrl(
        'https://cambridgeinternational.org/path/?query=val',
      ),
    ).toBe('https://cambridgeinternational.org/path?query=val')
  })

  test('reports no_change when candidate matches June 2026 manifest baseline', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => FIXED_DATE,
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('june-2026')) {
            return {
              html: `
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[0].pdfUrl}">Mathematics (9709) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[1].pdfUrl}">Further Mathematics (9231) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[2].pdfUrl}">Physics (9702) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[3].pdfUrl}">Chemistry (9701) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[4].pdfUrl}">Computer Science (9618) - June 2026</a>
              `,
              finalUrl: url,
            }
          }
          notFound()
        }),
      },
    })

    expect(report.ok).toBe(true)
    expect(report.outcome).toBe('no_change')
    expect(report.manifestRequiredCount).toBe(0)
    expect(report.hasFailure).toBe(false)
    expect(report.sessionsChecked.length).toBe(5) // default 5-session window
  })

  test('ignores older historical candidates when newer baseline already exists', async () => {
    // Only March 2026 is discovered; June 2026 is baseline in manifest
    const report = await runGradeThresholdDiscovery({
      now: () => FIXED_DATE,
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('march-2026')) {
            return {
              html: `<a href="/Images/740001-mathematics-9709-march-2026.pdf">Mathematics (9709) - March 2026</a>`,
              finalUrl: url,
            }
          }
          notFound()
        }),
      },
    })

    expect(report.ok).toBe(true)
    expect(report.outcome).toBe('no_change')
    const maths = report.subjects.find((s) => s.syllabusCode === '9709')
    expect(maths?.status).toBe('unchanged')
  })

  test('detects changed URL in the same session and returns manifest_required', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => FIXED_DATE,
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('june-2026')) {
            return {
              html: `<a href="/Images/revised-9709-june-2026.pdf">Mathematics (9709) - June 2026</a>`,
              finalUrl: url,
            }
          }
          notFound()
        }),
      },
    })

    expect(report.ok).toBe(true)
    expect(report.outcome).toBe('manifest_required')
    expect(report.manifestRequiredCount).toBe(1)
    const maths = report.subjects.find((s) => s.syllabusCode === '9709')
    expect(maths?.status).toBe('manifest_required')
    expect(maths?.reason).toBe('same_session_url_changed')
  })

  test('detects newer examination session and returns manifest_required', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => FIXED_DATE,
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('november-2026')) {
            return {
              html: `<a href="/Images/770001-mathematics-9709-november-2026-grade-threshold-table.pdf">Mathematics (9709) - November 2026</a>`,
              finalUrl: url,
            }
          }
          notFound()
        }),
      },
    })

    expect(report.ok).toBe(true)
    expect(report.outcome).toBe('manifest_required')
    const maths = report.subjects.find((s) => s.syllabusCode === '9709')
    expect(maths?.status).toBe('manifest_required')
    expect(maths?.reason).toBe('newer_session_available')
  })

  test('treats legitimate omitted subjects as unavailable without failing', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => new Date('2026-03-15T12:00:00.000Z'),
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('march-2026')) {
            // March includes 9709, omits 9231
            return {
              html: `<a href="/Images/9709-march-2026.pdf">Mathematics (9709) - March 2026</a>`,
              finalUrl: url,
            }
          }
          notFound()
        }),
      },
    })

    const fm = report.subjects.find((s) => s.syllabusCode === '9231')
    expect(fm?.status).toBe('unavailable')
    expect(report.ok).toBe(true)
  })

  test('fails closed with timeout when a decisive newer session times out', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => FIXED_DATE,
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('november-2026')) {
            throw new CambridgeFetchError('Request timed out', 'timeout')
          }
          if (url.includes('june-2026')) {
            return {
              html: `<a href="${CAMBRIDGE_JUNE_2026_SOURCES[0].pdfUrl}">Mathematics (9709) - June 2026</a>`,
              finalUrl: url,
            }
          }
          notFound()
        }),
      },
    })

    expect(report.ok).toBe(false)
    expect(report.outcome).toBe('timeout')
    expect(report.hasFailure).toBe(true)
  })

  test('does not fail report when an older irrelevant archive session fails', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => FIXED_DATE,
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('june-2025')) {
            throw new CambridgeFetchError('Older session 500 error', 'check_failed', 500)
          }
          if (url.includes('june-2026')) {
            return {
              html: `
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[0].pdfUrl}">Mathematics (9709) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[1].pdfUrl}">Further Mathematics (9231) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[2].pdfUrl}">Physics (9702) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[3].pdfUrl}">Chemistry (9701) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[4].pdfUrl}">Computer Science (9618) - June 2026</a>
              `,
              finalUrl: url,
            }
          }
          notFound()
        }),
      },
    })

    expect(report.ok).toBe(true)
    expect(report.outcome).toBe('no_change')
  })

  test('ignores November 2025 and March 2026 failures beside a June 2026 reviewed baseline', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => FIXED_DATE,
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('november-2025') || url.includes('march-2026')) {
            throw new CambridgeFetchError('Historic session 500 error', 'check_failed', 500)
          }
          if (url.includes('june-2026')) {
            return {
              html: `
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[0].pdfUrl}">Mathematics (9709) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[1].pdfUrl}">Further Mathematics (9231) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[2].pdfUrl}">Physics (9702) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[3].pdfUrl}">Chemistry (9701) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[4].pdfUrl}">Computer Science (9618) - June 2026</a>
              `,
              finalUrl: url,
            }
          }
          notFound()
        }),
      },
    })

    expect(report.ok).toBe(true)
    expect(report.outcome).toBe('no_change')
    expect(report.hasFailure).toBe(false)
  })

  test('fails closed when a June 2026 session equal to baseline fails', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => FIXED_DATE,
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('june-2026')) {
            throw new CambridgeFetchError('June 2026 500 error', 'check_failed', 500)
          }
          notFound()
        }),
      },
    })

    expect(report.ok).toBe(false)
    expect(report.outcome).toBe('check_failed')
    expect(report.hasFailure).toBe(true)
    const maths = report.subjects.find((s) => s.syllabusCode === '9709')
    expect(maths?.status).toBe('check_failed')
    expect(maths?.issueCode).toBe('check_failed')
  })

  test('fails closed with check_failed when a newer November 2026 session is ambiguous', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => FIXED_DATE,
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('november-2026')) {
            return {
              html: `
                <a href="/Images/770001-mathematics-9709-november-2026.pdf">Mathematics (9709) - November 2026</a>
                <a href="/Images/770002-mathematics-9709-november-2026.pdf">Mathematics (9709) - November 2026</a>
              `,
              finalUrl: url,
            }
          }
          if (url.includes('june-2026')) {
            return {
              html: `
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[0].pdfUrl}">Mathematics (9709) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[1].pdfUrl}">Further Mathematics (9231) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[2].pdfUrl}">Physics (9702) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[3].pdfUrl}">Chemistry (9701) - June 2026</a>
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[4].pdfUrl}">Computer Science (9618) - June 2026</a>
              `,
              finalUrl: url,
            }
          }
          notFound()
        }),
      },
    })

    expect(report.ok).toBe(false)
    expect(report.outcome).toBe('check_failed')
    expect(report.hasFailure).toBe(true)
    const maths = report.subjects.find((s) => s.syllabusCode === '9709')
    expect(maths?.status).toBe('check_failed')
    expect(maths?.issueCode).toBe('ambiguous_links')
  })

  test('returns unavailable outcome when every supported subject is legitimately unavailable and no failures exist', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => FIXED_DATE,
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async () => notFound()),
      },
    })

    expect(report.ok).toBe(true)
    expect(report.outcome).toBe('unavailable')
    expect(report.subjects.length).toBe(5)
    expect(report.subjects.every((s) => s.status === 'unavailable')).toBe(true)
  })

  test('returns no_change for a mixture of unchanged and unavailable subjects', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => FIXED_DATE,
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('june-2026')) {
            return {
              // Only 9709 is present on the page; others are absent
              html: `<a href="${CAMBRIDGE_JUNE_2026_SOURCES[0].pdfUrl}">Mathematics (9709) - June 2026</a>`,
              finalUrl: url,
            }
          }
          notFound()
        }),
      },
    })

    expect(report.ok).toBe(true)
    expect(report.outcome).toBe('no_change')
    const maths = report.subjects.find((s) => s.syllabusCode === '9709')
    const physics = report.subjects.find((s) => s.syllabusCode === '9702')
    expect(maths?.status).toBe('unchanged')
    expect(physics?.status).toBe('unavailable')
  })

  test('June 2026 decisive check_failed followed by November 2026 timeout produces timeout', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => FIXED_DATE,
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('june-2026')) {
            throw new CambridgeFetchError('June 2026 upstream 500 error', 'check_failed', 500)
          }
          if (url.includes('november-2026')) {
            throw new CambridgeFetchError('November 2026 request timed out', 'timeout')
          }
          notFound()
        }),
      },
    })

    expect(report.ok).toBe(false)
    expect(report.outcome).toBe('timeout')
    expect(report.hasFailure).toBe(true)
    const maths = report.subjects.find((s) => s.syllabusCode === '9709')
    expect(maths?.status).toBe('check_failed')
    expect(maths?.issueCode).toBe('timeout')
  })

  test('a decisive timeout is not masked by another non-timeout failure on a different subject or session', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => FIXED_DATE,
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('june-2026')) {
            // Mathematics is valid, but Physics has invalid link
            return {
              html: `
                <a href="${CAMBRIDGE_JUNE_2026_SOURCES[0].pdfUrl}">Mathematics (9709) - June 2026</a>
                <a href="https://unapproved.example.com/Physics.pdf">Physics (9702) - June 2026</a>
              `,
              finalUrl: url,
            }
          }
          if (url.includes('november-2026')) {
            throw new CambridgeFetchError('November 2026 timed out', 'timeout')
          }
          notFound()
        }),
      },
    })

    expect(report.ok).toBe(false)
    expect(report.outcome).toBe('timeout')
    expect(report.hasFailure).toBe(true)
    // Physics has decisive timeout from November 2026 which overrides June 2026 invalid_link/unapproved_host
    const physics = report.subjects.find((s) => s.syllabusCode === '9702')
    expect(physics?.status).toBe('check_failed')
    expect(physics?.issueCode).toBe('timeout')
  })
})
