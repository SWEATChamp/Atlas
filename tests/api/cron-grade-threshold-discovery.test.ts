import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { handleDiscoveryRequest } from '../../app/api/cron/grade-threshold-discovery/route'
import {
  GET as mutatingRouteGet,
  handleMutatingImportRequest,
} from '../../app/api/cron/grade-thresholds/route'
import type { DiscoveryRunnerReport } from '../../lib/grade-thresholds/discovery-runner'

describe('grade-threshold discovery route and credential isolation', () => {
  const CRON_SECRET = 'atlas-discovery-secret-12345'
  const IMPORT_SECRET = 'atlas-mutating-secret-1234567'

  const originalEnv = process.env

  let consoleInfoSpy: ReturnType<typeof vi.spyOn> | undefined
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.CRON_SECRET
    delete process.env.GRADE_THRESHOLD_IMPORT_SECRET
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    consoleInfoSpy?.mockRestore()
    consoleErrorSpy?.mockRestore()
  })

  test('returns 503 cron_not_configured when CRON_SECRET is absent or too short', async () => {
    const req = new Request('https://atlas.example/api/cron/grade-threshold-discovery')
    const res1 = await handleDiscoveryRequest(req)
    expect(res1.status).toBe(503)
    const body1 = await res1.json()
    expect(body1).toEqual({ ok: false, error: 'cron_not_configured' })
    expect(res1.headers.get('cache-control')).toBe('no-store')

    const res2 = await handleDiscoveryRequest(req, { cronSecret: 'short' })
    expect(res2.status).toBe(503)
  })

  test('returns 401 unauthorized when authorization header is missing or incorrect', async () => {
    process.env.CRON_SECRET = CRON_SECRET

    const reqNoAuth = new Request('https://atlas.example/api/cron/grade-threshold-discovery')
    const resNoAuth = await handleDiscoveryRequest(reqNoAuth)
    expect(resNoAuth.status).toBe(401)
    expect(await resNoAuth.json()).toEqual({ ok: false, error: 'unauthorized' })

    const reqBadAuth = new Request('https://atlas.example/api/cron/grade-threshold-discovery', {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    const resBadAuth = await handleDiscoveryRequest(reqBadAuth)
    expect(resBadAuth.status).toBe(401)
  })

  test('returns 200 no_change when discovery runner finds no new candidates', async () => {
    const mockReport: DiscoveryRunnerReport = {
      ok: true,
      outcome: 'no_change',
      checkedAt: '2026-06-15T12:00:00.000Z',
      sessionsChecked: [{ year: 2026, series: 'june' }],
      subjects: [
        {
          syllabusCode: '9709',
          syllabusName: 'Mathematics',
          status: 'unchanged',
        },
      ],
      manifestRequiredCount: 0,
      hasFailure: false,
    }

    const req = new Request('https://atlas.example/api/cron/grade-threshold-discovery', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const res = await handleDiscoveryRequest(req, {
      cronSecret: CRON_SECRET,
      runner: async () => mockReport,
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    const body = await res.json()
    expect(body.outcome).toBe('no_change')
    expect(body.ok).toBe(true)
  })

  test('returns 200 manifest_required when discovery finds candidates requiring review', async () => {
    const mockReport: DiscoveryRunnerReport = {
      ok: true,
      outcome: 'manifest_required',
      checkedAt: '2026-06-15T12:00:00.000Z',
      sessionsChecked: [{ year: 2026, series: 'november' }],
      subjects: [
        {
          syllabusCode: '9709',
          syllabusName: 'Mathematics',
          status: 'manifest_required',
          reason: 'newer_session_available',
          candidate: {
            year: 2026,
            series: 'november',
            pdfUrl: 'https://www.cambridgeinternational.org/Images/test.pdf',
            indexUrl: 'https://www.cambridgeinternational.org/test',
          },
        },
      ],
      manifestRequiredCount: 1,
      hasFailure: false,
    }

    const req = new Request('https://atlas.example/api/cron/grade-threshold-discovery', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const res = await handleDiscoveryRequest(req, {
      cronSecret: CRON_SECRET,
      runner: async () => mockReport,
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.outcome).toBe('manifest_required')
    expect(body.manifestRequiredCount).toBe(1)
  })

  test('returns 200 unavailable when discovery runner finds all subjects unavailable', async () => {
    const mockReport: DiscoveryRunnerReport = {
      ok: true,
      outcome: 'unavailable',
      checkedAt: '2026-06-15T12:00:00.000Z',
      sessionsChecked: [{ year: 2026, series: 'june' }],
      subjects: [
        {
          syllabusCode: '9709',
          syllabusName: 'Mathematics',
          status: 'unavailable',
        },
      ],
      manifestRequiredCount: 0,
      hasFailure: false,
    }

    const req = new Request('https://atlas.example/api/cron/grade-threshold-discovery', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const res = await handleDiscoveryRequest(req, {
      cronSecret: CRON_SECRET,
      runner: async () => mockReport,
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.outcome).toBe('unavailable')
  })

  test('returns 502 check_failed when discovery runner encounters non-timeout upstream failure', async () => {
    const mockReport: DiscoveryRunnerReport = {
      ok: false,
      outcome: 'check_failed',
      checkedAt: '2026-06-15T12:00:00.000Z',
      sessionsChecked: [{ year: 2026, series: 'june' }],
      subjects: [],
      manifestRequiredCount: 0,
      hasFailure: true,
    }

    const req = new Request('https://atlas.example/api/cron/grade-threshold-discovery', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const res = await handleDiscoveryRequest(req, {
      cronSecret: CRON_SECRET,
      runner: async () => mockReport,
    })

    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.outcome).toBe('check_failed')
  })

  test('returns 504 when discovery runner encounters upstream timeout', async () => {
    const mockReport: DiscoveryRunnerReport = {
      ok: false,
      outcome: 'timeout',
      checkedAt: '2026-06-15T12:00:00.000Z',
      sessionsChecked: [{ year: 2026, series: 'june' }],
      subjects: [],
      manifestRequiredCount: 0,
      hasFailure: true,
    }

    const req = new Request('https://atlas.example/api/cron/grade-threshold-discovery', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const res = await handleDiscoveryRequest(req, {
      cronSecret: CRON_SECRET,
      runner: async () => mockReport,
    })

    expect(res.status).toBe(504)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.outcome).toBe('timeout')
  })

  test('duplicate read-only requests produce consistent responses with no side-effects', async () => {
    const mockReport: DiscoveryRunnerReport = {
      ok: true,
      outcome: 'no_change',
      checkedAt: '2026-06-15T12:00:00.000Z',
      sessionsChecked: [{ year: 2026, series: 'june' }],
      subjects: [],
      manifestRequiredCount: 0,
      hasFailure: false,
    }

    const req1 = new Request('https://atlas.example/api/cron/grade-threshold-discovery', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const req2 = new Request('https://atlas.example/api/cron/grade-threshold-discovery', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })

    const res1 = await handleDiscoveryRequest(req1, { cronSecret: CRON_SECRET, runner: async () => mockReport })
    const res2 = await handleDiscoveryRequest(req2, { cronSecret: CRON_SECRET, runner: async () => mockReport })

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(await res1.json()).toEqual(await res2.json())
  })

  test('enforces strict credential separation between discovery and mutating routes', async () => {
    // Scenario 1: Only CRON_SECRET is set in environment (expected future state of discovery activation)
    process.env.CRON_SECRET = CRON_SECRET
    delete process.env.GRADE_THRESHOLD_IMPORT_SECRET

    // Discovery route with CRON_SECRET is authorized
    const discReq = new Request('https://atlas.example/api/cron/grade-threshold-discovery', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const discRes = await handleDiscoveryRequest(discReq, {
      cronSecret: process.env.CRON_SECRET,
      runner: async () => ({
        ok: true,
        outcome: 'no_change',
        checkedAt: '',
        sessionsChecked: [],
        subjects: [],
        manifestRequiredCount: 0,
        hasFailure: false,
      }),
    })
    expect(discRes.status).toBe(200)

    // Mutating route with CRON_SECRET fails closed with 503 cron_not_configured
    const mutReqWithCronSecret = new Request('https://atlas.example/api/cron/grade-thresholds', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    const mutRes1 = await mutatingRouteGet(mutReqWithCronSecret)
    expect(mutRes1.status).toBe(503)
    expect(await mutRes1.json()).toEqual({ ok: false, error: 'cron_not_configured' })

    // Scenario 2: GRADE_THRESHOLD_IMPORT_SECRET authorizes mutating route only with injected mock executor
    delete process.env.CRON_SECRET
    process.env.GRADE_THRESHOLD_IMPORT_SECRET = IMPORT_SECRET

    const mockImportExecutor = vi.fn(async () => ({
      ok: true,
      outcome: 'no_change' as const,
      checkedAt: '2026-06-15T12:00:00.000Z',
      sourceChecks: [],
      discovery: {
        checkedAt: '2026-06-15T12:00:00.000Z',
        sessionsChecked: [],
        subjects: [],
        hasDiscoveryFailure: false,
      },
    }))

    const mutReqWithImportSecret = new Request('https://atlas.example/api/cron/grade-thresholds', {
      headers: { authorization: `Bearer ${IMPORT_SECRET}` },
    })

    const mutResAuthorized = await handleMutatingImportRequest(mutReqWithImportSecret, {
      secret: IMPORT_SECRET,
      execute: mockImportExecutor,
    })
    expect(mutResAuthorized.status).toBe(200)
    expect(mockImportExecutor).toHaveBeenCalledTimes(1)

    // Unauthorized request to mutating route does not invoke executor
    const mutReqBadAuth = new Request('https://atlas.example/api/cron/grade-thresholds', {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    const mutResUnauthorized = await handleMutatingImportRequest(mutReqBadAuth, {
      secret: IMPORT_SECRET,
      execute: mockImportExecutor,
    })
    expect(mutResUnauthorized.status).toBe(401)
    expect(mockImportExecutor).toHaveBeenCalledTimes(1) // not called again

    // Discovery route with GRADE_THRESHOLD_IMPORT_SECRET fails closed with 503 (since CRON_SECRET is unset)
    const discReqWithImportSecret = new Request('https://atlas.example/api/cron/grade-threshold-discovery', {
      headers: { authorization: `Bearer ${IMPORT_SECRET}` },
    })
    const discRes2 = await handleDiscoveryRequest(discReqWithImportSecret)
    expect(discRes2.status).toBe(503)

    // Even if discovery has CRON_SECRET, providing GRADE_THRESHOLD_IMPORT_SECRET returns 401 unauthorized
    const discRes3 = await handleDiscoveryRequest(discReqWithImportSecret, { cronSecret: CRON_SECRET })
    expect(discRes3.status).toBe(401)
  })

  test('emits sanitized structured logs for authorized runs and suppresses logs for unauthorized runs', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      // 1. Authorized success emits single-line JSON to console.info
      const mockSuccessReport: DiscoveryRunnerReport = {
        ok: true,
        outcome: 'no_change',
        checkedAt: '2026-06-15T12:00:00.000Z',
        sessionsChecked: [{ year: 2026, series: 'june' }],
        subjects: [{ syllabusCode: '9709', syllabusName: 'Maths', status: 'unchanged' }],
        manifestRequiredCount: 0,
        hasFailure: false,
      }

      const authReq = new Request('https://atlas.example/api/cron/grade-threshold-discovery', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      })
      const successRes = await handleDiscoveryRequest(authReq, {
        cronSecret: CRON_SECRET,
        runner: async () => mockSuccessReport,
      })

      expect(successRes.status).toBe(200)
      expect(infoSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).not.toHaveBeenCalled()

      const successLog = JSON.parse(infoSpy.mock.calls[0][0])
      expect(successLog.event).toBe('grade_threshold_discovery_executed')
      expect(successLog.ok).toBe(true)
      expect(successLog.outcome).toBe('no_change')
      expect(successLog.status).toBe(200)
      expect(typeof successLog.durationMs).toBe('number')

      infoSpy.mockClear()
      errorSpy.mockClear()

      // 2. Failure or unexpected runner exception emits sanitized error log to console.error
      const failingReq = new Request('https://atlas.example/api/cron/grade-threshold-discovery', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      })
      const errorRes = await handleDiscoveryRequest(failingReq, {
        cronSecret: CRON_SECRET,
        runner: async () => {
          throw new Error('Sensitive stack trace and DB URL: postgresql://admin:secret@host/db')
        },
      })

      expect(errorRes.status).toBe(502)
      expect(infoSpy).not.toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledTimes(1)

      const rawErrorLog = errorSpy.mock.calls[0][0]
      const parsedErrorLog = JSON.parse(rawErrorLog)
      expect(parsedErrorLog.event).toBe('grade_threshold_discovery_executed')
      expect(parsedErrorLog.ok).toBe(false)
      expect(parsedErrorLog.outcome).toBe('unexpected_error')
      expect(parsedErrorLog.errorKind).toBe('unexpected_exception')

      // Assert absence of raw exception message, stack, URL, or credentials
      expect(rawErrorLog).not.toContain('Sensitive stack trace')
      expect(rawErrorLog).not.toContain('postgresql://')
      expect(rawErrorLog).not.toContain('secret@host')

      infoSpy.mockClear()
      errorSpy.mockClear()

      // 3. Unauthorized request produces zero structured logs
      const unauthReq = new Request('https://atlas.example/api/cron/grade-threshold-discovery', {
        headers: { authorization: 'Bearer invalid-token' },
      })
      const unauthRes = await handleDiscoveryRequest(unauthReq, {
        cronSecret: CRON_SECRET,
        runner: async () => mockSuccessReport,
      })

      expect(unauthRes.status).toBe(401)
      expect(infoSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      infoSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })
})
