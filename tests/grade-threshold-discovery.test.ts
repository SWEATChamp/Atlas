import { describe, expect, test, vi } from 'vitest'
import {
  buildSeriesIndexUrl,
  compareSessions,
  discoverCambridgePublications,
  fetchCambridgeIndexHtml,
  generateRollingDiscoverySessions,
  getCurrentCalendarSession,
  linkMatchesSubject,
  nextSession,
  parseCambridgeIndexLinks,
  previousSession,
  runScheduledGradeThresholdImport,
  validateLinkSubjectIdentity,
  type ExamSession,
  type GradeThresholdPersistence,
} from '../lib/grade-thresholds/server'
import * as clientExports from '../lib/grade-thresholds'
import { sha256Hex, type CambridgeThresholdSource } from '../lib/grade-thresholds'

const DUMMY_HTML_JUNE_2026 = `
<!DOCTYPE html>
<html>
<head><title>June 2026 Grade Threshold Tables</title></head>
<body>
  <div class="content">
    <ul>
      <li><a href="/Images/750001-mathematics-9709-june-2026-grade-threshold-table.pdf">Mathematics (9709) - June 2026</a></li>
      <li><a href="https://www.cambridgeinternational.org/Images/750002-further-mathematics-9231-june-2026-grade-threshold-table.pdf">Further Mathematics (9231) - June 2026</a></li>
      <li><a href="/Images/750003-physics-9702-june-2026-grade-threshold-table.pdf">Physics (9702) - June 2026</a></li>
      <li><a href="/Images/750004-chemistry-9701-june-2026-grade-threshold-table.pdf">Chemistry (9701) - June 2026</a></li>
      <li><a href="/Images/750005-computer-science-9618-june-2026-grade-threshold-table.pdf">Computer Science (9618) - June 2026</a></li>
    </ul>
  </div>
</body>
</html>
`

const DUMMY_HTML_MARCH_2026_OMITS_9231 = `
<!DOCTYPE html>
<html>
<head><title>March 2026 Grade Threshold Tables</title></head>
<body>
  <div class="content">
    <ul>
      <!-- March includes 9709, 9701, 9702, but omits 9231 and 9618 -->
      <li><a href="/Images/748001-mathematics-9709-march-2026-grade-threshold-table.pdf">Mathematics (9709) - March 2026</a></li>
      <li><a href="/Images/748002-physics-9702-march-2026-grade-threshold-table.pdf">Physics (9702) - March 2026</a></li>
      <li><a href="/Images/748003-chemistry-9701-march-2026-grade-threshold-table.pdf">Chemistry (9701) - March 2026</a></li>
      <!-- Asset ID collision edge case: asset number contains 9709, but subject is Environmental Management 8291 -->
      <li><a href="/Images/749709-environmental-management-as-level-8291-march-2026-grade-threshold-table.pdf">Environmental Management (8291) - March 2026</a></li>
    </ul>
  </div>
</body>
</html>
`

const DUMMY_HTML_AMBIGUOUS_LINKS = `
<!DOCTYPE html>
<html>
<head><title>Ambiguous Index</title></head>
<body>
  <ul>
    <li><a href="/Images/750001-mathematics-9709-june-2026-table-a.pdf">Mathematics (9709) - June 2026 Link A</a></li>
    <li><a href="/Images/750002-mathematics-9709-june-2026-table-b.pdf">Mathematics (9709) - June 2026 Link B</a></li>
  </ul>
</body>
</html>
`

const DUMMY_HTML_NOVEMBER_2026_AMBIGUOUS_LINKS = `
<!DOCTYPE html>
<html>
<head><title>Ambiguous November Index</title></head>
<body>
  <ul>
    <li><a href="/Images/760001-mathematics-9709-november-2026-table-a.pdf">Mathematics (9709) - November 2026 Link A</a></li>
    <li><a href="/Images/760002-mathematics-9709-november-2026-table-b.pdf">Mathematics (9709) - November 2026 Link B</a></li>
  </ul>
</body>
</html>
`

const DUMMY_HTML_INVALID_LINKS = `
<!DOCTYPE html>
<html>
<head><title>Invalid Links Index</title></head>
<body>
  <ul>
    <li><a href="http://www.cambridgeinternational.org/Images/insecure-maths-9709-june-2026.pdf">Mathematics (9709) - June 2026 Insecure HTTP</a></li>
    <li><a href="https://external-untrusted-mirror.com/Images/fake-physics-9702-june-2026.pdf">Physics (9702) - June 2026 Third Party</a></li>
  </ul>
</body>
</html>
`

const DUMMY_PDF_BYTES = new TextEncoder().encode('%PDF-1.5 test fixture')

function createTestPersistence(publicationStatus: 'published' | 'staged' | null = 'published') {
  const checksum = sha256Hex(DUMMY_PDF_BYTES)
  return {
    createImportRun: vi.fn(),
    updateImportRun: vi.fn(),
    getSubjectBySyllabus: vi.fn(async (code: string) => ({
      id: `subject-${code}`,
      syllabusCode: code,
    })),
    getSubjectPaper: vi.fn(),
    getActivePublication: vi.fn(),
    getLatestPublication: vi.fn(),
    findPublicationByChecksum: vi.fn(async () =>
      publicationStatus
        ? {
            id: 'publication-1',
            revisionNumber: 1,
            checksumSha256: checksum,
            publicationStatus,
            isActive: publicationStatus === 'published',
          }
        : null,
    ),
    stagePublicationBundle: vi.fn(),
    getWeightingSource: vi.fn(),
    stageWeightingSource: vi.fn(),
    approveWeightingSource: vi.fn(),
    recordImportIssue: vi.fn(),
    publishPublication: vi.fn(),
  } satisfies GradeThresholdPersistence
}

describe('Grade Threshold Publication Discovery', () => {
  describe('compareSessions, nextSession, previousSession', () => {
    test('orders sessions chronologically by year then series', () => {
      const s2025Nov: ExamSession = { year: 2025, series: 'november' }
      const s2026Mar: ExamSession = { year: 2026, series: 'march' }
      const s2026Jun: ExamSession = { year: 2026, series: 'june' }
      const s2026Nov: ExamSession = { year: 2026, series: 'november' }

      expect(compareSessions(s2025Nov, s2026Mar)).toBeLessThan(0)
      expect(compareSessions(s2026Mar, s2026Jun)).toBeLessThan(0)
      expect(compareSessions(s2026Jun, s2026Nov)).toBeLessThan(0)
      expect(compareSessions(s2026Nov, s2026Jun)).toBeGreaterThan(0)
      expect(compareSessions(s2026Jun, { year: 2026, series: 'june' })).toBe(0)
    })

    test('increments and decrements sessions correctly across year boundaries', () => {
      expect(nextSession({ year: 2026, series: 'march' })).toEqual({ year: 2026, series: 'june' })
      expect(nextSession({ year: 2026, series: 'june' })).toEqual({ year: 2026, series: 'november' })
      expect(nextSession({ year: 2026, series: 'november' })).toEqual({ year: 2027, series: 'march' })

      expect(previousSession({ year: 2027, series: 'march' })).toEqual({ year: 2026, series: 'november' })
      expect(previousSession({ year: 2026, series: 'november' })).toEqual({ year: 2026, series: 'june' })
      expect(previousSession({ year: 2026, series: 'june' })).toEqual({ year: 2026, series: 'march' })
    })
  })

  describe('generateRollingDiscoverySessions across year transitions and future dates', () => {
    test('determines focal session accurately throughout the calendar', () => {
      expect(getCurrentCalendarSession(new Date('2026-01-15T00:00:00.000Z'))).toEqual({
        year: 2026,
        series: 'march',
      })
      expect(getCurrentCalendarSession(new Date('2026-04-30T23:59:59.000Z'))).toEqual({
        year: 2026,
        series: 'march',
      })
      expect(getCurrentCalendarSession(new Date('2026-05-01T00:00:00.000Z'))).toEqual({
        year: 2026,
        series: 'june',
      })
      expect(getCurrentCalendarSession(new Date('2026-08-31T23:59:59.000Z'))).toEqual({
        year: 2026,
        series: 'june',
      })
      expect(getCurrentCalendarSession(new Date('2026-09-01T00:00:00.000Z'))).toEqual({
        year: 2026,
        series: 'november',
      })
      expect(getCurrentCalendarSession(new Date('2026-12-31T23:59:59.000Z'))).toEqual({
        year: 2026,
        series: 'november',
      })
    })

    test('generates bounded rolling window covering past and future sessions at year transitions', () => {
      // Transition from Dec 31 to Jan 1
      const dec31 = new Date('2026-12-31T23:59:59.000Z')
      const sessionsDec31 = generateRollingDiscoverySessions(dec31)
      expect(sessionsDec31).toEqual([
        { year: 2025, series: 'november' },
        { year: 2026, series: 'march' },
        { year: 2026, series: 'june' },
        { year: 2026, series: 'november' },
        { year: 2027, series: 'march' },
      ])

      const jan1 = new Date('2027-01-01T00:00:00.000Z')
      const sessionsJan1 = generateRollingDiscoverySessions(jan1)
      expect(sessionsJan1).toEqual([
        { year: 2026, series: 'march' },
        { year: 2026, series: 'june' },
        { year: 2026, series: 'november' },
        { year: 2027, series: 'march' },
        { year: 2027, series: 'june' },
      ])
    })

    test('continues rolling discovery after March 2027 into June 2027 and 2028', () => {
      // In April 2027: future session includes June 2027
      const apr2027 = new Date('2027-04-15T00:00:00.000Z')
      const sessionsApr = generateRollingDiscoverySessions(apr2027)
      expect(sessionsApr.some((s) => s.year === 2027 && s.series === 'june')).toBe(true)

      // In July 2027: current session is June 2027, future is November 2027
      const jul2027 = new Date('2027-07-15T00:00:00.000Z')
      const sessionsJul = generateRollingDiscoverySessions(jul2027)
      expect(sessionsJul).toEqual([
        { year: 2026, series: 'june' },
        { year: 2026, series: 'november' },
        { year: 2027, series: 'march' },
        { year: 2027, series: 'june' },
        { year: 2027, series: 'november' },
      ])

      // In May 2028: discovers June 2028
      const may2028 = new Date('2028-05-15T00:00:00.000Z')
      const sessionsMay = generateRollingDiscoverySessions(may2028)
      expect(sessionsMay).toEqual([
        { year: 2027, series: 'june' },
        { year: 2027, series: 'november' },
        { year: 2028, series: 'march' },
        { year: 2028, series: 'june' },
        { year: 2028, series: 'november' },
      ])
    })
  })

  describe('buildSeriesIndexUrl', () => {
    test('generates canonical HTTPS Cambridge index URL', () => {
      const url = buildSeriesIndexUrl({ year: 2026, series: 'june' })
      expect(url).toBe(
        'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/grade-threshold-tables/june-2026/',
      )
    })
  })

  describe('parseCambridgeIndexLinks', () => {
    test('parses and resolves relative links to allowlisted host', () => {
      const baseUrl = 'https://www.cambridgeinternational.org/grade-threshold-tables/june-2026/'
      const links = parseCambridgeIndexLinks(DUMMY_HTML_JUNE_2026, baseUrl)

      expect(links.length).toBe(5)
      const math = links.find((l) => l.resolvedUrl.includes('mathematics-9709'))
      expect(math).toBeDefined()
      expect(math?.isValidCandidate).toBe(true)
      expect(math?.resolvedUrl).toBe(
        'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2026-grade-threshold-table.pdf',
      )
      expect(math?.anchorText).toContain('Mathematics (9709)')
    })

    test('flags insecure HTTP and unapproved hosts as invalid with stable issue codes', () => {
      const baseUrl = 'https://www.cambridgeinternational.org/grade-threshold-tables/june-2026/'
      const links = parseCambridgeIndexLinks(DUMMY_HTML_INVALID_LINKS, baseUrl)

      const insecure = links.find((l) => l.anchorText.includes('9709'))
      expect(insecure?.isValidCandidate).toBe(false)
      expect(insecure?.invalidReason).toBe('insecure_protocol')

      const thirdParty = links.find((l) => l.anchorText.includes('9702'))
      expect(thirdParty?.isValidCandidate).toBe(false)
      expect(thirdParty?.invalidReason).toBe('unapproved_host')
    })

    test('deduplicates identical links on the same page', () => {
      const duplicateHtml = `
        <a href="/Images/table.pdf">Table</a>
        <a href="/Images/table.pdf">Table Duplicate</a>
      `
      const links = parseCambridgeIndexLinks(
        duplicateHtml,
        'https://www.cambridgeinternational.org/test/',
      )
      expect(links.length).toBe(1)
    })
  })

  describe('validateLinkSubjectIdentity: independent consistency evidence', () => {
    const june2026Session: ExamSession = { year: 2026, series: 'june' }
    const mathSubject = { syllabusCode: '9709', syllabusName: 'Mathematics' }

    test('accepts link when all evidence (year, series, syllabus code, subject name) is consistent', () => {
      const link = {
        rawHref: '/Images/750001-mathematics-9709-june-2026-grade-threshold-table.pdf',
        resolvedUrl:
          'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2026-grade-threshold-table.pdf',
        anchorText: 'Cambridge International A Level Mathematics (9709) - June 2026',
        isValidCandidate: true,
      }
      const result = validateLinkSubjectIdentity(link, mathSubject, june2026Session)
      expect(result).toEqual({
        matches: true,
        isTargetClaim: true,
      })
    })

    test('treats CMS asset ID collision as an unrelated link without poisoning target subject', () => {
      const collidingLink = {
        rawHref: '/Images/749709-environmental-management-as-level-8291-june-2026.pdf',
        resolvedUrl:
          'https://www.cambridgeinternational.org/Images/749709-environmental-management-as-level-8291-june-2026.pdf',
        anchorText: 'Environmental Management (8291) - June 2026',
        isValidCandidate: true,
      }
      const result = validateLinkSubjectIdentity(collidingLink, mathSubject, june2026Session)
      expect(result.matches).toBe(false)
      expect(result.isTargetClaim).toBe(false)
      expect(result.mismatchReason).toBeUndefined()
    })

    test('rejects target code with a contradictory subject title as mismatched_subject', () => {
      const contradictoryTitle = {
        rawHref: '/Images/750001-environmental-management-9709-june-2026.pdf',
        resolvedUrl:
          'https://www.cambridgeinternational.org/Images/750001-environmental-management-9709-june-2026.pdf',
        anchorText: 'Environmental Management (9709) - June 2026',
        isValidCandidate: true,
      }
      const result = validateLinkSubjectIdentity(contradictoryTitle, mathSubject, june2026Session)
      expect(result).toEqual({
        matches: false,
        isTargetClaim: true,
        mismatchReason: 'mismatched_subject',
      })
    })

    test('rejects only a target-code link with the wrong year', () => {
      const wrongYear = {
        rawHref: '/Images/750001-mathematics-9709-june-2025.pdf',
        resolvedUrl: 'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2025.pdf',
        anchorText: 'Mathematics (9709) - June 2025',
        isValidCandidate: true,
      }
      expect(validateLinkSubjectIdentity(wrongYear, mathSubject, june2026Session)).toEqual({
        matches: false,
        isTargetClaim: true,
        mismatchReason: 'mismatched_session',
      })
    })

    test('rejects only a target-code link with the wrong series', () => {
      const wrongSeries = {
        rawHref: '/Images/750001-mathematics-9709-november-2026.pdf',
        resolvedUrl: 'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-november-2026.pdf',
        anchorText: 'Mathematics (9709) - November 2026',
        isValidCandidate: true,
      }
      expect(validateLinkSubjectIdentity(wrongSeries, mathSubject, june2026Session)).toEqual({
        matches: false,
        isTargetClaim: true,
        mismatchReason: 'mismatched_session',
      })
    })

    test('rejects link with correct filename year/series but wrong anchor year or series', () => {
      // Correct filename (june-2026), wrong anchor year (2025)
      const wrongAnchorYear = {
        rawHref: '/Images/750001-mathematics-9709-june-2026.pdf',
        resolvedUrl: 'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2026.pdf',
        anchorText: 'Mathematics (9709) - June 2025',
        isValidCandidate: true,
      }
      expect(validateLinkSubjectIdentity(wrongAnchorYear, mathSubject, june2026Session)).toEqual({
        matches: false,
        isTargetClaim: true,
        mismatchReason: 'mismatched_session',
      })

      // Correct filename (june-2026), wrong anchor series (november)
      const wrongAnchorSeries = {
        rawHref: '/Images/750001-mathematics-9709-june-2026.pdf',
        resolvedUrl: 'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2026.pdf',
        anchorText: 'Mathematics (9709) - November 2026',
        isValidCandidate: true,
      }
      expect(validateLinkSubjectIdentity(wrongAnchorSeries, mathSubject, june2026Session)).toEqual({
        matches: false,
        isTargetClaim: true,
        mismatchReason: 'mismatched_session',
      })
    })

    test('rejects link with wrong filename year/series even if anchor is correct', () => {
      // Wrong filename series (march-2026), correct anchor (June 2026)
      const wrongFilename = {
        rawHref: '/Images/748001-mathematics-9709-march-2026.pdf',
        resolvedUrl: 'https://www.cambridgeinternational.org/Images/748001-mathematics-9709-march-2026.pdf',
        anchorText: 'Mathematics (9709) - June 2026',
        isValidCandidate: true,
      }
      expect(validateLinkSubjectIdentity(wrongFilename, mathSubject, june2026Session)).toEqual({
        matches: false,
        isTargetClaim: true,
        mismatchReason: 'mismatched_session',
      })
    })

    test('rejects link with completely missing year or series evidence', () => {
      const missingEvidence = {
        rawHref: '/Images/mathematics-9709-grade-threshold.pdf',
        resolvedUrl: 'https://www.cambridgeinternational.org/Images/mathematics-9709-grade-threshold.pdf',
        anchorText: 'Mathematics (9709) Table',
        isValidCandidate: true,
      }
      expect(validateLinkSubjectIdentity(missingEvidence, mathSubject, june2026Session)).toEqual({
        matches: false,
        isTargetClaim: true,
        mismatchReason: 'mismatched_session',
      })
    })

    test('rejects link with multiple conflicting years or series', () => {
      const conflictingYears = {
        rawHref: '/Images/750001-mathematics-9709-june-2026.pdf',
        resolvedUrl: 'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2026.pdf',
        anchorText: 'Mathematics (9709) - June 2026 superseded by 2025',
        isValidCandidate: true,
      }
      expect(validateLinkSubjectIdentity(conflictingYears, mathSubject, june2026Session)).toEqual({
        matches: false,
        isTargetClaim: true,
        mismatchReason: 'mismatched_session',
      })
    })

    test('distinguishes Mathematics from Further Mathematics and rejects cross-title contradictions', () => {
      const furtherMathSubject = { syllabusCode: '9231', syllabusName: 'Further Mathematics' }

      // Anchor says "Further Mathematics", but code is 9709 (Mathematics): contradictory title
      const crossAnchorFurther = {
        rawHref: '/Images/750001-further-mathematics-9709-june-2026.pdf',
        resolvedUrl: 'https://www.cambridgeinternational.org/Images/750001-further-mathematics-9709-june-2026.pdf',
        anchorText: 'Further Mathematics (9709) - June 2026',
        isValidCandidate: true,
      }
      expect(validateLinkSubjectIdentity(crossAnchorFurther, mathSubject, june2026Session)).toEqual({
        matches: false,
        isTargetClaim: true,
        mismatchReason: 'mismatched_subject',
      })

      // Slug says "further-mathematics", checking 9709: rejected
      const crossSlugFurther = {
        rawHref: '/Images/750001-further-mathematics-9709-june-2026.pdf',
        resolvedUrl: 'https://www.cambridgeinternational.org/Images/750001-further-mathematics-9709-june-2026.pdf',
        anchorText: 'Mathematics (9709) - June 2026',
        isValidCandidate: true,
      }
      expect(validateLinkSubjectIdentity(crossSlugFurther, mathSubject, june2026Session)).toEqual({
        matches: false,
        isTargetClaim: true,
        mismatchReason: 'mismatched_subject',
      })

      // Checking 9231 (Further Mathematics), but anchor says "Mathematics (9231)" without Further: rejected
      const crossAnchorPlainMath = {
        rawHref: '/Images/750002-mathematics-9231-june-2026.pdf',
        resolvedUrl: 'https://www.cambridgeinternational.org/Images/750002-mathematics-9231-june-2026.pdf',
        anchorText: 'Mathematics (9231) - June 2026',
        isValidCandidate: true,
      }
      expect(validateLinkSubjectIdentity(crossAnchorPlainMath, furtherMathSubject, june2026Session)).toEqual({
        matches: false,
        isTargetClaim: true,
        mismatchReason: 'mismatched_subject',
      })

      // Checking 9709, but anchor says "Physics (9709)": rejected
      const crossAnchorPhysics = {
        rawHref: '/Images/750001-physics-9709-june-2026.pdf',
        resolvedUrl: 'https://www.cambridgeinternational.org/Images/750001-physics-9709-june-2026.pdf',
        anchorText: 'Physics (9709) - June 2026',
        isValidCandidate: true,
      }
      expect(validateLinkSubjectIdentity(crossAnchorPhysics, mathSubject, june2026Session)).toEqual({
        matches: false,
        isTargetClaim: true,
        mismatchReason: 'mismatched_subject',
      })
    })

    test('backwards compatible linkMatchesSubject helper functions correctly', () => {
      const link = {
        rawHref: '/Images/750001-mathematics-9709-june-2026.pdf',
        resolvedUrl: 'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2026.pdf',
        anchorText: 'Mathematics (9709) - June 2026',
        isValidCandidate: true,
      }
      expect(linkMatchesSubject(link, '9709', june2026Session)).toBe(true)
      expect(linkMatchesSubject(link, '9701', june2026Session)).toBe(false)
    })
  })

  describe('fetchCambridgeIndexHtml streaming, byte caps, and adversarial errors', () => {
    test('rejects unapproved host', async () => {
      await expect(
        fetchCambridgeIndexHtml('https://evil-cambridge.com/tables/'),
      ).rejects.toThrow('Unapproved host')
    })

    test('rejects insecure HTTP protocol', async () => {
      await expect(
        fetchCambridgeIndexHtml('http://www.cambridgeinternational.org/tables/'),
      ).rejects.toThrow('Insecure protocol')
    })

    test('rejects non-html Content-Type', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response('{}', {
          headers: { 'content-type': 'application/json' },
        })
      }) as unknown as typeof fetch

      await expect(
        fetchCambridgeIndexHtml(
          'https://www.cambridgeinternational.org/tables/',
          { fetchFn: mockFetch },
        ),
      ).rejects.toThrow('expected text/html')
    })

    test('rejects malformed and negative Content-Length headers', async () => {
      const malformedHeaders = ['abc', '-100', '12.5', '1e5']

      for (const val of malformedHeaders) {
        const mockFetch = vi.fn(async () => {
          return new Response('<html></html>', {
            headers: {
              'content-type': 'text/html',
              'content-length': val,
            },
          })
        }) as unknown as typeof fetch

        await expect(
          fetchCambridgeIndexHtml(
            'https://www.cambridgeinternational.org/tables/',
            { fetchFn: mockFetch },
          ),
        ).rejects.toThrow('Malformed Content-Length')
      }
    })

    test('rejects Content-Length declared exceeding maxBytes', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response('<html></html>', {
          headers: {
            'content-type': 'text/html',
            'content-length': '2000',
          },
        })
      }) as unknown as typeof fetch

      await expect(
        fetchCambridgeIndexHtml(
          'https://www.cambridgeinternational.org/tables/',
          { fetchFn: mockFetch, maxBytes: 1000 },
        ),
      ).rejects.toThrow('exceeds maximum limit')
    })

    test('cancels and rejects streamed overflow without Content-Length header', async () => {
      let cancelled = false
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array(600))
        },
        cancel() {
          cancelled = true
        },
      })

      const mockFetch = vi.fn(async () => {
        return new Response(stream, {
          headers: { 'content-type': 'text/html' },
        })
      }) as unknown as typeof fetch

      await expect(
        fetchCambridgeIndexHtml(
          'https://www.cambridgeinternational.org/tables/',
          { fetchFn: mockFetch, maxBytes: 1000 },
        ),
      ).rejects.toThrow('Streamed byte length')

      expect(cancelled).toBe(true)
    })

    test('enforces byte cap on UTF-8 multibyte characters exceeding byte limit', async () => {
      // 4-byte emoji: length in string is 2 (surrogate pair) or 1 code point, but 4 raw UTF-8 bytes
      const emoji = '📘' // 4 bytes in UTF-8
      const emojiContent = emoji.repeat(300) // 1200 bytes, but character count is 300 or 600

      const mockFetch = vi.fn(async () => {
        return new Response(emojiContent, {
          headers: { 'content-type': 'text/html' },
        })
      }) as unknown as typeof fetch

      await expect(
        fetchCambridgeIndexHtml(
          'https://www.cambridgeinternational.org/tables/',
          { fetchFn: mockFetch, maxBytes: 1000 },
        ),
      ).rejects.toThrow('exceeds maximum limit')
    })

    test('aborts and throws timeout when response stream stalls during body read', async () => {
      // Stream that enqueues one chunk then stalls forever
      const stalledStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('<html>'))
          // Intentionally stall without enqueueing more or closing
        },
      })

      const mockFetch = vi.fn(async () => {
        return new Response(stalledStream, {
          headers: { 'content-type': 'text/html' },
        })
      }) as unknown as typeof fetch

      await expect(
        fetchCambridgeIndexHtml(
          'https://www.cambridgeinternational.org/tables/',
          { fetchFn: mockFetch, timeoutMs: 50 },
        ),
      ).rejects.toThrow('timed out')
    })

    test('correctly classifies 404 and 410 as not_found and gone', async () => {
      const mock404 = vi.fn(async () => new Response('Not Found', { status: 404 })) as unknown as typeof fetch
      const mock410 = vi.fn(async () => new Response('Gone', { status: 410 })) as unknown as typeof fetch

      await expect(
        fetchCambridgeIndexHtml('https://www.cambridgeinternational.org/tables/404', { fetchFn: mock404 }),
      ).rejects.toThrow('HTTP status 404: Not Found')

      await expect(
        fetchCambridgeIndexHtml('https://www.cambridgeinternational.org/tables/410', { fetchFn: mock410 }),
      ).rejects.toThrow('HTTP status 410: Gone')
    })

    test('handles redirects to allowlisted hosts and rejects loops', async () => {
      let count = 0
      const mockFetch = vi.fn(async () => {
        count++
        if (count === 1) {
          return new Response(null, {
            status: 301,
            headers: { location: 'https://cambridgeinternational.org/final/' },
          })
        }
        return new Response('<html>Success</html>', {
          headers: { 'content-type': 'text/html' },
        })
      }) as unknown as typeof fetch

      const res = await fetchCambridgeIndexHtml(
        'https://www.cambridgeinternational.org/initial/',
        { fetchFn: mockFetch, maxRedirects: 3 },
      )
      expect(res.html).toContain('Success')
      expect(res.finalUrl).toBe('https://cambridgeinternational.org/final/')
    })
  })

  describe('discoverCambridgePublications', () => {
    test('rejects redirected index URL that resolves to the wrong exam session', async () => {
      // Request was for March 2027, but Cambridge redirected to November 2026
      const mockFetch = vi.fn(async () => ({
        html: DUMMY_HTML_JUNE_2026,
        finalUrl: 'https://www.cambridgeinternational.org/grade-threshold-tables/november-2026/',
      }))

      const report = await discoverCambridgePublications({
        sessions: [{ year: 2027, series: 'march' }],
        fetchIndexHtml: mockFetch,
      })

      expect(report.hasDiscoveryFailure).toBe(true)
      const math = report.subjects.find((s) => s.syllabusCode === '9709')
      expect(math?.status).toBe('check_failed')
      expect(math?.issueCode).toBe('mismatched_session')
    })

    test('newer ambiguous session cannot be hidden by older available candidate', async () => {
      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('june-2026')) {
          return { html: DUMMY_HTML_JUNE_2026, finalUrl: url }
        }
        if (url.includes('november-2026')) {
          return { html: DUMMY_HTML_NOVEMBER_2026_AMBIGUOUS_LINKS, finalUrl: url }
        }
        throw new Error('HTTP status 404: Not Found')
      })

      const report = await discoverCambridgePublications({
        sessions: [
          { year: 2026, series: 'june' },
          { year: 2026, series: 'november' },
        ],
        fetchIndexHtml: mockFetch,
      })

      const math = report.subjects.find((s) => s.syllabusCode === '9709')
      // June 2026 was available, but newer November 2026 was ambiguous!
      // The subject MUST be flagged as ambiguous, NOT available!
      expect(math?.status).toBe('ambiguous')
      expect(math?.issueCode).toBe('ambiguous_links')
      expect(math?.latestPublication).toBeUndefined()
    })

    test('newer failed session cannot be hidden by older available candidate', async () => {
      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('june-2026')) {
          return { html: DUMMY_HTML_JUNE_2026, finalUrl: url }
        }
        if (url.includes('november-2026')) {
          throw new Error('500 Internal Server Error')
        }
        throw new Error('HTTP status 404: Not Found')
      })

      const report = await discoverCambridgePublications({
        sessions: [
          { year: 2026, series: 'june' },
          { year: 2026, series: 'november' },
        ],
        fetchIndexHtml: mockFetch,
      })

      const math = report.subjects.find((s) => s.syllabusCode === '9709')
      expect(math?.status).toBe('check_failed')
      expect(math?.latestPublication).toBeUndefined()
      expect(report.hasDiscoveryFailure).toBe(true)
    })

    test('handles missing subjects in intermediate sessions without blocking other subjects', async () => {
      const mockFetch = vi.fn(async () => ({
        html: DUMMY_HTML_MARCH_2026_OMITS_9231,
        finalUrl: buildSeriesIndexUrl({ year: 2026, series: 'march' }),
      }))

      const report = await discoverCambridgePublications({
        sessions: [{ year: 2026, series: 'march' }],
        fetchIndexHtml: mockFetch,
      })

      const math = report.subjects.find((s) => s.syllabusCode === '9709')
      expect(math?.status).toBe('available')
      expect(math?.latestPublication?.series).toBe('march')

      const furtherMath = report.subjects.find((s) => s.syllabusCode === '9231')
      expect(furtherMath?.status).toBe('unavailable')
      expect(furtherMath?.latestPublication).toBeUndefined()
    })

    test('identifies ambiguous links for June 2026 session', async () => {
      const mockFetch = vi.fn(async () => ({
        html: DUMMY_HTML_AMBIGUOUS_LINKS,
        finalUrl: buildSeriesIndexUrl({ year: 2026, series: 'june' }),
      }))

      const report = await discoverCambridgePublications({
        sessions: [{ year: 2026, series: 'june' }],
        fetchIndexHtml: mockFetch,
      })

      const math = report.subjects.find((s) => s.syllabusCode === '9709')
      expect(math?.status).toBe('ambiguous')
      expect(math?.issueCode).toBe('ambiguous_links')
    })

    test('sanitized report contains stable issue codes and zero raw error strings or stacks', async () => {
      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('june-2026')) {
          return { html: DUMMY_HTML_INVALID_LINKS, finalUrl: buildSeriesIndexUrl({ year: 2026, series: 'june' }) }
        }
        throw new Error('Secret internal db error: connect ECONNREFUSED 10.0.0.1:5432')
      })

      const report = await discoverCambridgePublications({
        sessions: [
          { year: 2026, series: 'june' },
          { year: 2026, series: 'november' },
        ],
        fetchIndexHtml: mockFetch,
      })

      const reportJson = JSON.stringify(report)
      expect(reportJson).not.toContain('ECONNREFUSED')
      expect(reportJson).not.toContain('10.0.0.1')
      expect(reportJson).not.toContain('Secret internal db error')

      const math = report.subjects.find((s) => s.syllabusCode === '9709')
      expect(math?.checkedSessions.some((s) => s.issueCode === 'insecure_protocol')).toBe(true)
      expect(math?.checkedSessions.some((s) => s.issueCode === 'check_failed')).toBe(true)
    })

    test('rejects index URL with session text in query, fragment, or slug prefix instead of exact path segment', async () => {
      const adversarialUrls = [
        'https://www.cambridgeinternational.org/grade-threshold-tables/?session=june-2026',
        'https://www.cambridgeinternational.org/grade-threshold-tables/#june-2026',
        'https://www.cambridgeinternational.org/grade-threshold-tables/june-2026-news/',
        'https://www.cambridgeinternational.org/grade-threshold-tables/archive-june-2026/',
      ]

      for (const finalUrl of adversarialUrls) {
        const mockFetch = vi.fn(async () => ({
          html: DUMMY_HTML_JUNE_2026,
          finalUrl,
        }))

        const report = await discoverCambridgePublications({
          sessions: [{ year: 2026, series: 'june' }],
          fetchIndexHtml: mockFetch,
        })

        expect(report.hasDiscoveryFailure).toBe(true)
        const math = report.subjects.find((s) => s.syllabusCode === '9709')
        expect(math?.status).toBe('check_failed')
        expect(math?.issueCode).toBe('mismatched_session')
      }
    })

    test('rejects /news/june-2026/ and /archive/june-2026/ against canonical pathname', async () => {
      for (const finalUrl of [
        'https://www.cambridgeinternational.org/news/june-2026/',
        'https://www.cambridgeinternational.org/archive/june-2026/',
      ]) {
        const mockFetch = vi.fn(async () => ({
          html: DUMMY_HTML_JUNE_2026,
          finalUrl,
        }))

        const report = await discoverCambridgePublications({
          sessions: [{ year: 2026, series: 'june' }],
          fetchIndexHtml: mockFetch,
        })

        expect(report.hasDiscoveryFailure).toBe(true)
        const math = report.subjects.find((s) => s.syllabusCode === '9709')
        expect(math?.status).toBe('check_failed')
        expect(math?.issueCode).toBe('mismatched_session')
      }
    })

    test('accepts exact canonical pathname on both approved Cambridge hosts with optional query/fragments', async () => {
      const canonicalUrls = [
        'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/grade-threshold-tables/june-2026/',
        'https://cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/grade-threshold-tables/june-2026/',
        'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/grade-threshold-tables/june-2026/?ref=direct#overview',
      ]

      for (const finalUrl of canonicalUrls) {
        const mockFetch = vi.fn(async () => ({
          html: DUMMY_HTML_JUNE_2026,
          finalUrl,
        }))

        const report = await discoverCambridgePublications({
          sessions: [{ year: 2026, series: 'june' }],
          fetchIndexHtml: mockFetch,
        })

        expect(report.hasDiscoveryFailure).toBe(false)
        const math = report.subjects.find((s) => s.syllabusCode === '9709')
        expect(math?.status).toBe('available')
        expect(math?.latestPublication?.pdfUrl).toContain('750001-mathematics-9709')
      }
    })

    test('unrelated wrong-session PDFs must not poison an omitted subject', async () => {
      const htmlWithUnrelatedWrongSession = `
        <!DOCTYPE html>
        <html>
        <head><title>March 2026 Grade Threshold Tables</title></head>
        <body>
          <ul>
            <!-- Physics link claiming 9702 has the wrong year (2025) -->
            <li><a href="/Images/748002-physics-9702-march-2025.pdf">Physics (9702) - March 2025</a></li>
            <!-- Chemistry link is valid for March 2026 -->
            <li><a href="/Images/748003-chemistry-9701-march-2026.pdf">Chemistry (9701) - March 2026</a></li>
            <!-- Further Mathematics 9231 is completely omitted -->
          </ul>
        </body>
        </html>
      `
      const mockFetch = vi.fn(async () => ({
        html: htmlWithUnrelatedWrongSession,
        finalUrl: buildSeriesIndexUrl({ year: 2026, series: 'march' }),
      }))

      const report = await discoverCambridgePublications({
        sessions: [{ year: 2026, series: 'march' }],
        fetchIndexHtml: mockFetch,
      })

      // Physics claims 9702 with wrong year -> check_failed
      const physics = report.subjects.find((s) => s.syllabusCode === '9702')
      expect(physics?.status).toBe('check_failed')
      expect(physics?.issueCode).toBe('mismatched_session')

      // Chemistry is valid -> available
      const chemistry = report.subjects.find((s) => s.syllabusCode === '9701')
      expect(chemistry?.status).toBe('available')

      // Further Mathematics (9231) was omitted. The wrong-session Physics link MUST NOT poison it!
      const furtherMath = report.subjects.find((s) => s.syllabusCode === '9231')
      expect(furtherMath?.status).toBe('unavailable')
      expect(furtherMath?.latestPublication).toBeUndefined()
    })

    test('valid target link plus contradictory target-claiming link on same index fails closed', async () => {
      const htmlContradictorySameIndex = `
        <!DOCTYPE html>
        <html>
        <head><title>June 2026 Grade Threshold Tables</title></head>
        <body>
          <ul>
            <!-- Valid June 2026 Mathematics link -->
            <li><a href="/Images/750001-mathematics-9709-june-2026.pdf">Mathematics (9709) - June 2026</a></li>
            <!-- Contradictory link claiming 9709 but with series November 2026 -->
            <li><a href="/Images/750002-mathematics-9709-november-2026.pdf">Mathematics (9709) - November 2026</a></li>
          </ul>
        </body>
        </html>
      `
      const mockFetch = vi.fn(async () => ({
        html: htmlContradictorySameIndex,
        finalUrl: buildSeriesIndexUrl({ year: 2026, series: 'june' }),
      }))

      const report = await discoverCambridgePublications({
        sessions: [{ year: 2026, series: 'june' }],
        fetchIndexHtml: mockFetch,
      })

      // Must FAIL CLOSED: do not accept the valid link when a contradictory link for the same subject is present
      const math = report.subjects.find((s) => s.syllabusCode === '9709')
      expect(math?.status).toBe('check_failed')
      expect(math?.issueCode).toBe('mismatched_session')
      expect(math?.latestPublication).toBeUndefined()
      expect(report.hasDiscoveryFailure).toBe(true)
    })

    test('treats successfully fetched index page with zero PDF links as unexpected_index_structure', async () => {
      const emptyHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>June 2026 Grade Threshold Tables</title></head>
        <body>
          <p>Announcements only. No PDF tables have been uploaded yet.</p>
          <a href="/news/june-2026-update">Read update</a>
        </body>
        </html>
      `
      const mockFetch = vi.fn(async () => ({
        html: emptyHtml,
        finalUrl: buildSeriesIndexUrl({ year: 2026, series: 'june' }),
      }))

      const report = await discoverCambridgePublications({
        sessions: [{ year: 2026, series: 'june' }],
        fetchIndexHtml: mockFetch,
      })

      expect(report.hasDiscoveryFailure).toBe(true)
      const math = report.subjects.find((s) => s.syllabusCode === '9709')
      expect(math?.status).toBe('check_failed')
      expect(math?.issueCode).toBe('unexpected_index_structure')
    })
  })

  describe('runScheduledGradeThresholdImport integration & unmanifested safety', () => {
    test('same syllabus/year/series with a DIFFERENT discovered PDF URL is flagged manifest_required', async () => {
      const persistence = createTestPersistence('published')
      const runPipeline = vi.fn()
      const downloadPdf = vi.fn(async () => ({
        bytes: DUMMY_PDF_BYTES,
        contentType: 'application/pdf',
      }))

      const existingJuneSource: CambridgeThresholdSource = {
        syllabusCode: '9709',
        syllabusName: 'Mathematics',
        qualificationTitle: 'Cambridge International AS & A Level Mathematics (9709)',
        year: 2026,
        series: 'june',
        indexUrl: 'https://www.cambridgeinternational.org/grade-threshold-tables/june-2026/',
        pdfUrl: 'https://www.cambridgeinternational.org/Images/old-maths-750001.pdf',
        expectedChecksumSha256: sha256Hex(DUMMY_PDF_BYTES),
        expectedIdentityLines: [],
        carryForwardTokens: [],
        carryForwardTokenBasis: 'reviewed-structural-mapping',
        expectedStructure: {
          pageCount: 1,
          rowCounts: { component: 0, 'a-level-linear': 0, 'a-level-staged': 0, 'as-level': 0 },
        },
        goldenFixtures: [],
      }

      // Discovery found a NEW, DIFFERENT PDF URL for the SAME June 2026 session!
      const mockDiscover = vi.fn(async () => ({
        checkedAt: '2026-09-12T12:00:00.000Z',
        sessionsChecked: [{ year: 2026, series: 'june' as const }],
        hasDiscoveryFailure: false,
        subjects: [
          {
            syllabusCode: '9709',
            syllabusName: 'Mathematics',
            status: 'available' as const,
            latestPublication: {
              syllabusCode: '9709',
              syllabusName: 'Mathematics',
              year: 2026,
              series: 'june' as const,
              indexUrl: existingJuneSource.indexUrl,
              pdfUrl: 'https://www.cambridgeinternational.org/Images/new-revised-maths-999999.pdf',
            },
            checkedSessions: [
              {
                year: 2026,
                series: 'june' as const,
                indexUrl: existingJuneSource.indexUrl,
                status: 'available' as const,
                pdfUrl: 'https://www.cambridgeinternational.org/Images/new-revised-maths-999999.pdf',
              },
            ],
          },
        ],
      }))

      const report = await runScheduledGradeThresholdImport({
        persistence,
        sources: [existingJuneSource],
        includeWeighting: false,
        downloadPdf,
        runPipeline,
        discoverPublications: mockDiscover,
      })

      // Must be flagged as manifest_required because the discovered URL differs from reviewed manifest!
      const check = report.sourceChecks.find((c) => c.status === 'manifest_required')
      expect(check).toBeDefined()
      expect(check?.syllabusCode).toBe('9709')
      expect(report.outcome).toBe('review_required')
      expect(report.ok).toBe(true)

      // Strict safety: runPipeline must NOT be invoked for unmanifested candidate URLs!
      expect(runPipeline).not.toHaveBeenCalled()
      // downloadPdf was called ONLY for the manifested source, NEVER for the new unreviewed candidate URL
      expect(downloadPdf).toHaveBeenCalledTimes(1)
      expect(downloadPdf).toHaveBeenCalledWith(existingJuneSource.pdfUrl)
    })

    test('discovery failure does not return no_change and does not invoke pipeline', async () => {
      const persistence = createTestPersistence('published')
      const runPipeline = vi.fn()
      const downloadPdf = vi.fn(async () => ({
        bytes: DUMMY_PDF_BYTES,
        contentType: 'application/pdf',
      }))

      const existingSource: CambridgeThresholdSource = {
        syllabusCode: '9709',
        syllabusName: 'Mathematics',
        qualificationTitle: 'Cambridge International AS & A Level Mathematics (9709)',
        year: 2026,
        series: 'june',
        indexUrl: 'https://www.cambridgeinternational.org/grade-threshold-tables/june-2026/',
        pdfUrl: 'https://www.cambridgeinternational.org/Images/math.pdf',
        expectedChecksumSha256: sha256Hex(DUMMY_PDF_BYTES),
        expectedIdentityLines: [],
        carryForwardTokens: [],
        carryForwardTokenBasis: 'reviewed-structural-mapping',
        expectedStructure: {
          pageCount: 1,
          rowCounts: { component: 0, 'a-level-linear': 0, 'a-level-staged': 0, 'as-level': 0 },
        },
        goldenFixtures: [],
      }

      // Mock discovery returning check_failed
      const mockDiscover = vi.fn(async () => ({
        checkedAt: '2026-09-12T12:00:00.000Z',
        sessionsChecked: [{ year: 2026, series: 'november' as const }],
        hasDiscoveryFailure: true,
        subjects: [
          {
            syllabusCode: '9709',
            syllabusName: 'Mathematics',
            status: 'check_failed' as const,
            issueCode: 'timeout' as const,
            checkedSessions: [
              {
                year: 2026,
                series: 'november' as const,
                indexUrl: 'https://www.cambridgeinternational.org/november-2026/',
                status: 'check_failed' as const,
                issueCode: 'timeout' as const,
              },
            ],
          },
        ],
      }))

      const report = await runScheduledGradeThresholdImport({
        persistence,
        sources: [existingSource],
        includeWeighting: false,
        downloadPdf,
        runPipeline,
        discoverPublications: mockDiscover,
      })

      // Must be ok: false and outcome: 'failed', NOT 'no_change'!
      expect(report.ok).toBe(false)
      expect(report.outcome).toBe('failed')
      expect(report.sourceChecks.some((c) => c.status === 'check_failed')).toBe(true)

      // Pipeline MUST NOT be invoked merely because discovery failed!
      expect(runPipeline).not.toHaveBeenCalled()
    })

    test('discovery failure for same session as manifest source does not overwrite manifest check and does not invoke pipeline', async () => {
      const persistence = createTestPersistence('published')
      const runPipeline = vi.fn()
      const downloadPdf = vi.fn(async () => ({
        bytes: DUMMY_PDF_BYTES,
        contentType: 'application/pdf',
      }))

      const existingSource: CambridgeThresholdSource = {
        syllabusCode: '9709',
        syllabusName: 'Mathematics',
        qualificationTitle: 'Cambridge International AS & A Level Mathematics (9709)',
        year: 2026,
        series: 'june',
        indexUrl: 'https://www.cambridgeinternational.org/grade-threshold-tables/june-2026/',
        pdfUrl: 'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2026.pdf',
        expectedChecksumSha256: sha256Hex(DUMMY_PDF_BYTES),
        expectedIdentityLines: [],
        carryForwardTokens: [],
        carryForwardTokenBasis: 'reviewed-structural-mapping',
        expectedStructure: {
          pageCount: 1,
          rowCounts: { component: 0, 'a-level-linear': 0, 'a-level-staged': 0, 'as-level': 0 },
        },
        goldenFixtures: [],
      }

      // Mock discovery that checks the SAME June 2026 session but experiences a discovery failure
      const mockDiscover = vi.fn(async () => ({
        checkedAt: '2026-09-12T12:00:00.000Z',
        sessionsChecked: [{ year: 2026, series: 'june' as const }],
        hasDiscoveryFailure: true,
        subjects: [
          {
            syllabusCode: '9709',
            syllabusName: 'Mathematics',
            status: 'check_failed' as const,
            issueCode: 'unexpected_index_structure' as const,
            checkedSessions: [
              {
                year: 2026,
                series: 'june' as const,
                indexUrl: existingSource.indexUrl,
                status: 'check_failed' as const,
                issueCode: 'unexpected_index_structure' as const,
              },
            ],
          },
        ],
      }))

      const report = await runScheduledGradeThresholdImport({
        persistence,
        sources: [existingSource],
        includeWeighting: false,
        downloadPdf,
        runPipeline,
        discoverPublications: mockDiscover,
      })

      // Finding 4 verification:
      // 1. Manifest source check for 9709 MUST NOT be overwritten by the discovery failure status
      const mathCheck = report.sourceChecks.find((c) => c.syllabusCode === '9709')
      expect(mathCheck).toBeDefined()
      expect(mathCheck?.status).toBe('unchanged')

      // 2. Report outcome must be failed (due to discovery failure), NOT no_change and NOT review_required
      expect(report.ok).toBe(false)
      expect(report.outcome).toBe('failed')

      // 3. Pipeline MUST NOT be called because requiresManifestImport remains false!
      expect(runPipeline).not.toHaveBeenCalled()

      // 4. Staging must not occur
      expect(persistence.stagePublicationBundle).not.toHaveBeenCalled()

      // 5. PDF download called ONLY for manifested source
      expect(downloadPdf).toHaveBeenCalledTimes(1)
      expect(downloadPdf).toHaveBeenCalledWith(existingSource.pdfUrl)
    })

    test('mismatch propagation through the scheduled importer with zero pipeline, candidate-download, and staging calls', async () => {
      const persistence = createTestPersistence('published')
      const runPipeline = vi.fn()
      const downloadPdf = vi.fn(async () => ({
        bytes: DUMMY_PDF_BYTES,
        contentType: 'application/pdf',
      }))

      const existingSource: CambridgeThresholdSource = {
        syllabusCode: '9709',
        syllabusName: 'Mathematics',
        qualificationTitle: 'Cambridge International AS & A Level Mathematics (9709)',
        year: 2026,
        series: 'june',
        indexUrl: buildSeriesIndexUrl({ year: 2026, series: 'june' }),
        pdfUrl: 'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2026.pdf',
        expectedChecksumSha256: sha256Hex(DUMMY_PDF_BYTES),
        expectedIdentityLines: [],
        carryForwardTokens: [],
        carryForwardTokenBasis: 'reviewed-structural-mapping',
        expectedStructure: {
          pageCount: 1,
          rowCounts: { component: 0, 'a-level-linear': 0, 'a-level-staged': 0, 'as-level': 0 },
        },
        goldenFixtures: [],
      }

      // Contradictory target-claiming link on June 2026 index page (e.g. claims 9709 but with wrong series november)
      const mockDiscover = vi.fn(async () => ({
        checkedAt: '2026-09-12T12:00:00.000Z',
        sessionsChecked: [{ year: 2026, series: 'june' as const }],
        hasDiscoveryFailure: true,
        subjects: [
          {
            syllabusCode: '9709',
            syllabusName: 'Mathematics',
            status: 'check_failed' as const,
            issueCode: 'mismatched_session' as const,
            checkedSessions: [
              {
                year: 2026,
                series: 'june' as const,
                indexUrl: existingSource.indexUrl,
                status: 'check_failed' as const,
                issueCode: 'mismatched_session' as const,
                pdfUrl: 'https://www.cambridgeinternational.org/Images/contradictory-9709-november.pdf',
              },
            ],
          },
        ],
      }))

      const report = await runScheduledGradeThresholdImport({
        persistence,
        sources: [existingSource],
        includeWeighting: false,
        downloadPdf,
        runPipeline,
        discoverPublications: mockDiscover,
      })

      // Verification:
      // 1. Report fails and blocks review
      expect(report.ok).toBe(false)
      expect(report.outcome).toBe('failed')

      // 2. Manifest source check for 9709 remains 'unchanged' (not overwritten)
      const mathCheck = report.sourceChecks.find((c) => c.syllabusCode === '9709')
      expect(mathCheck?.status).toBe('unchanged')

      // 3. Zero pipeline calls
      expect(runPipeline).not.toHaveBeenCalled()

      // 4. Zero candidate downloads (downloadPdf called ONLY once for manifested source)
      expect(downloadPdf).toHaveBeenCalledTimes(1)
      expect(downloadPdf).toHaveBeenCalledWith(existingSource.pdfUrl)

      // 5. Zero staging calls
      expect(persistence.stagePublicationBundle).not.toHaveBeenCalled()
    })

    test('discovery failure plus manifested change_detected asserts zero pipeline and zero staging', async () => {
      // Manifest source has changed on Cambridge (new bytes not matching stored publication)
      const newBytes = new TextEncoder().encode('%PDF-1.5 new changed content')
      const persistence = createTestPersistence(null) // No publication stored for this checksum -> change_detected
      const runPipeline = vi.fn()
      const downloadPdf = vi.fn(async () => ({
        bytes: newBytes,
        contentType: 'application/pdf',
      }))

      const existingSource: CambridgeThresholdSource = {
        syllabusCode: '9709',
        syllabusName: 'Mathematics',
        qualificationTitle: 'Cambridge International AS & A Level Mathematics (9709)',
        year: 2026,
        series: 'june',
        indexUrl: buildSeriesIndexUrl({ year: 2026, series: 'june' }),
        pdfUrl: 'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2026.pdf',
        expectedChecksumSha256: sha256Hex(DUMMY_PDF_BYTES), // Manifest expected old checksum
        expectedIdentityLines: [],
        carryForwardTokens: [],
        carryForwardTokenBasis: 'reviewed-structural-mapping',
        expectedStructure: {
          pageCount: 1,
          rowCounts: { component: 0, 'a-level-linear': 0, 'a-level-staged': 0, 'as-level': 0 },
        },
        goldenFixtures: [],
      }

      // But discovery simultaneously fails on Cambridge index
      const mockDiscover = vi.fn(async () => ({
        checkedAt: '2026-09-12T12:00:00.000Z',
        sessionsChecked: [{ year: 2026, series: 'june' as const }],
        hasDiscoveryFailure: true,
        subjects: [
          {
            syllabusCode: '9709',
            syllabusName: 'Mathematics',
            status: 'check_failed' as const,
            issueCode: 'timeout' as const,
            checkedSessions: [
              {
                year: 2026,
                series: 'june' as const,
                indexUrl: existingSource.indexUrl,
                status: 'check_failed' as const,
                issueCode: 'timeout' as const,
              },
            ],
          },
        ],
      }))

      const report = await runScheduledGradeThresholdImport({
        persistence,
        sources: [existingSource],
        includeWeighting: false,
        downloadPdf,
        runPipeline,
        discoverPublications: mockDiscover,
      })

      // Fail-closed verification:
      expect(report.ok).toBe(false)
      expect(report.outcome).toBe('failed')

      // Preserves manifest check status so operators see pending change_detected
      const mathCheck = report.sourceChecks.find((c) => c.syllabusCode === '9709')
      expect(mathCheck?.status).toBe('change_detected')

      // Unconditionally blocks pipeline and staging
      expect(runPipeline).not.toHaveBeenCalled()
      expect(persistence.stagePublicationBundle).not.toHaveBeenCalled()

      // downloadPdf called only for manifested source, zero candidate downloads
      expect(downloadPdf).toHaveBeenCalledTimes(1)
      expect(downloadPdf).toHaveBeenCalledWith(existingSource.pdfUrl)
    })

    test('discovery failure plus manifested check_failed asserts zero pipeline and zero staging', async () => {
      const persistence = createTestPersistence('published')
      const runPipeline = vi.fn()
      // Manifest PDF download fails with network error -> check_failed
      const downloadPdf = vi.fn(async (url: string) => {
        if (url.includes('750001')) {
          throw new Error('500 Internal Server Error downloading manifest PDF')
        }
        return { bytes: DUMMY_PDF_BYTES, contentType: 'application/pdf' }
      })

      const existingSource: CambridgeThresholdSource = {
        syllabusCode: '9709',
        syllabusName: 'Mathematics',
        qualificationTitle: 'Cambridge International AS & A Level Mathematics (9709)',
        year: 2026,
        series: 'june',
        indexUrl: buildSeriesIndexUrl({ year: 2026, series: 'june' }),
        pdfUrl: 'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2026.pdf',
        expectedChecksumSha256: sha256Hex(DUMMY_PDF_BYTES),
        expectedIdentityLines: [],
        carryForwardTokens: [],
        carryForwardTokenBasis: 'reviewed-structural-mapping',
        expectedStructure: {
          pageCount: 1,
          rowCounts: { component: 0, 'a-level-linear': 0, 'a-level-staged': 0, 'as-level': 0 },
        },
        goldenFixtures: [],
      }

      const mockDiscover = vi.fn(async () => ({
        checkedAt: '2026-09-12T12:00:00.000Z',
        sessionsChecked: [{ year: 2026, series: 'june' as const }],
        hasDiscoveryFailure: true,
        subjects: [
          {
            syllabusCode: '9709',
            syllabusName: 'Mathematics',
            status: 'check_failed' as const,
            issueCode: 'network_error' as const,
            checkedSessions: [
              {
                year: 2026,
                series: 'june' as const,
                indexUrl: existingSource.indexUrl,
                status: 'check_failed' as const,
                issueCode: 'network_error' as const,
              },
            ],
          },
        ],
      }))

      const report = await runScheduledGradeThresholdImport({
        persistence,
        sources: [existingSource],
        includeWeighting: false,
        downloadPdf,
        runPipeline,
        discoverPublications: mockDiscover,
      })

      expect(report.ok).toBe(false)
      expect(report.outcome).toBe('failed')

      const mathCheck = report.sourceChecks.find((c) => c.syllabusCode === '9709')
      expect(mathCheck?.status).toBe('check_failed')

      expect(runPipeline).not.toHaveBeenCalled()
      expect(persistence.stagePublicationBundle).not.toHaveBeenCalled()
    })

    test('discovery failure plus weighting change_detected asserts zero pipeline and zero staging', async () => {
      const newWeightingBytes = new TextEncoder().encode('%PDF-1.5 new weighting source')
      const persistence = createTestPersistence('published')
      const runPipeline = vi.fn()
      const downloadPdf = vi.fn(async (url: string) => {
        if (url.includes('weighting')) {
          return { bytes: newWeightingBytes, contentType: 'application/pdf' }
        }
        return { bytes: DUMMY_PDF_BYTES, contentType: 'application/pdf' }
      })

      const existingSource: CambridgeThresholdSource = {
        syllabusCode: '9709',
        syllabusName: 'Mathematics',
        qualificationTitle: 'Cambridge International AS & A Level Mathematics (9709)',
        year: 2026,
        series: 'june',
        indexUrl: buildSeriesIndexUrl({ year: 2026, series: 'june' }),
        pdfUrl: 'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2026.pdf',
        expectedChecksumSha256: sha256Hex(DUMMY_PDF_BYTES),
        expectedIdentityLines: [],
        carryForwardTokens: [],
        carryForwardTokenBasis: 'reviewed-structural-mapping',
        expectedStructure: {
          pageCount: 1,
          rowCounts: { component: 0, 'a-level-linear': 0, 'a-level-staged': 0, 'as-level': 0 },
        },
        goldenFixtures: [],
      }

      const mockDiscover = vi.fn(async () => ({
        checkedAt: '2026-09-12T12:00:00.000Z',
        sessionsChecked: [{ year: 2026, series: 'june' as const }],
        hasDiscoveryFailure: true,
        subjects: [
          {
            syllabusCode: '9709',
            syllabusName: 'Mathematics',
            status: 'check_failed' as const,
            issueCode: 'unexpected_index_structure' as const,
            checkedSessions: [],
          },
        ],
      }))

      const report = await runScheduledGradeThresholdImport({
        persistence,
        sources: [existingSource],
        includeWeighting: true,
        downloadPdf,
        runPipeline,
        discoverPublications: mockDiscover,
      })

      expect(report.ok).toBe(false)
      expect(report.outcome).toBe('failed')
      expect(report.weightingCheck?.status).toBe('change_detected')

      expect(runPipeline).not.toHaveBeenCalled()
      expect(persistence.stagePublicationBundle).not.toHaveBeenCalled()
      expect(persistence.stageWeightingSource).not.toHaveBeenCalled()
    })

    test('discovery failure plus weighting check_failed asserts zero pipeline and zero staging', async () => {
      const persistence = createTestPersistence('published')
      const runPipeline = vi.fn()
      const downloadPdf = vi.fn(async (url: string) => {
        if (url.includes('weighting')) {
          throw new Error('404 Not Found fetching weighting PDF')
        }
        return { bytes: DUMMY_PDF_BYTES, contentType: 'application/pdf' }
      })

      const existingSource: CambridgeThresholdSource = {
        syllabusCode: '9709',
        syllabusName: 'Mathematics',
        qualificationTitle: 'Cambridge International AS & A Level Mathematics (9709)',
        year: 2026,
        series: 'june',
        indexUrl: buildSeriesIndexUrl({ year: 2026, series: 'june' }),
        pdfUrl: 'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2026.pdf',
        expectedChecksumSha256: sha256Hex(DUMMY_PDF_BYTES),
        expectedIdentityLines: [],
        carryForwardTokens: [],
        carryForwardTokenBasis: 'reviewed-structural-mapping',
        expectedStructure: {
          pageCount: 1,
          rowCounts: { component: 0, 'a-level-linear': 0, 'a-level-staged': 0, 'as-level': 0 },
        },
        goldenFixtures: [],
      }

      const mockDiscover = vi.fn(async () => ({
        checkedAt: '2026-09-12T12:00:00.000Z',
        sessionsChecked: [{ year: 2026, series: 'june' as const }],
        hasDiscoveryFailure: true,
        subjects: [
          {
            syllabusCode: '9709',
            syllabusName: 'Mathematics',
            status: 'check_failed' as const,
            issueCode: 'timeout' as const,
            checkedSessions: [],
          },
        ],
      }))

      const report = await runScheduledGradeThresholdImport({
        persistence,
        sources: [existingSource],
        includeWeighting: true,
        downloadPdf,
        runPipeline,
        discoverPublications: mockDiscover,
      })

      expect(report.ok).toBe(false)
      expect(report.outcome).toBe('failed')
      expect(report.weightingCheck?.status).toBe('check_failed')

      expect(runPipeline).not.toHaveBeenCalled()
      expect(persistence.stagePublicationBundle).not.toHaveBeenCalled()
      expect(persistence.stageWeightingSource).not.toHaveBeenCalled()
    })

    test('control case: legitimate manifested change still invokes pipeline when discovery succeeds', async () => {
      const newBytes = new TextEncoder().encode('%PDF-1.5 new changed content')
      const persistence = createTestPersistence(null) // Checksum not in DB -> change_detected
      const runPipeline = vi.fn(async () => ({
        runId: 'run-control-1',
        status: 'succeeded' as const,
        startedAt: '2026-09-12T12:00:00.000Z',
        completedAt: '2026-09-12T12:00:01.000Z',
        stats: {
          totalDiscovered: 1,
          totalStaged: 1,
          totalPublished: 0,
          totalDuplicate: 0,
          totalFailed: 0,
        },
        publications: [
          {
            syllabusCode: '9709',
            year: 2026,
            series: 'june' as const,
            status: 'staged' as const,
            checksumSha256: sha256Hex(newBytes),
            revisionNumber: 1,
            publicationId: 'pub-staged-1',
            issues: [],
          },
        ],
      }))
      const downloadPdf = vi.fn(async () => ({
        bytes: newBytes,
        contentType: 'application/pdf',
      }))

      const existingSource: CambridgeThresholdSource = {
        syllabusCode: '9709',
        syllabusName: 'Mathematics',
        qualificationTitle: 'Cambridge International AS & A Level Mathematics (9709)',
        year: 2026,
        series: 'june',
        indexUrl: buildSeriesIndexUrl({ year: 2026, series: 'june' }),
        pdfUrl: 'https://www.cambridgeinternational.org/Images/750001-mathematics-9709-june-2026.pdf',
        expectedChecksumSha256: sha256Hex(DUMMY_PDF_BYTES),
        expectedIdentityLines: [],
        carryForwardTokens: [],
        carryForwardTokenBasis: 'reviewed-structural-mapping',
        expectedStructure: {
          pageCount: 1,
          rowCounts: { component: 0, 'a-level-linear': 0, 'a-level-staged': 0, 'as-level': 0 },
        },
        goldenFixtures: [],
      }

      // Discovery succeeds cleanly with zero failures
      const mockDiscover = vi.fn(async () => ({
        checkedAt: '2026-09-12T12:00:00.000Z',
        sessionsChecked: [{ year: 2026, series: 'june' as const }],
        hasDiscoveryFailure: false,
        subjects: [
          {
            syllabusCode: '9709',
            syllabusName: 'Mathematics',
            status: 'available' as const,
            latestPublication: {
              syllabusCode: '9709',
              syllabusName: 'Mathematics',
              year: 2026,
              series: 'june' as const,
              indexUrl: existingSource.indexUrl,
              pdfUrl: existingSource.pdfUrl,
            },
            checkedSessions: [],
          },
        ],
      }))

      const report = await runScheduledGradeThresholdImport({
        persistence,
        sources: [existingSource],
        includeWeighting: false,
        downloadPdf,
        runPipeline,
        discoverPublications: mockDiscover,
      })

      // Verification of control case:
      // Discovery succeeded, so legitimate manifest change successfully triggers pipeline
      expect(runPipeline).toHaveBeenCalledTimes(1)
      expect(runPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerKind: 'scheduled',
          autoPublish: false,
        }),
      )
      expect(report.ok).toBe(true)
      expect(report.outcome).toBe('review_required')
      expect(report.importAudit).toBeDefined()
      expect(report.importAudit?.runId).toBe('run-control-1')
    })
  })

  describe('Server-only isolation and exports', () => {
    test('client entrypoint does not leak discovery or server exports', () => {
      expect('discoverCambridgePublications' in clientExports).toBe(false)
      expect('fetchCambridgeIndexHtml' in clientExports).toBe(false)
      expect('parseCambridgeIndexLinks' in clientExports).toBe(false)
      expect('runScheduledGradeThresholdImport' in clientExports).toBe(false)
      expect('generateRollingDiscoverySessions' in clientExports).toBe(false)
      expect('CambridgeFetchError' in clientExports).toBe(false)
    })
  })
})
