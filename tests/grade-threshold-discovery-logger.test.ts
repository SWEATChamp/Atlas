import { describe, expect, test, vi } from 'vitest'
import {
  buildDiscoverySuccessLog,
  buildDiscoveryErrorLog,
  emitDiscoveryStructuredLog,
} from '../lib/grade-thresholds/discovery-logger'
import type { DiscoveryRunnerReport } from '../lib/grade-thresholds/discovery-runner'

describe('grade-threshold discovery logger', () => {
  test('buildDiscoverySuccessLog builds sanitized structured log without URLs or credentials', () => {
    const mockReport: DiscoveryRunnerReport = {
      ok: true,
      outcome: 'manifest_required',
      checkedAt: '2026-06-15T12:00:00.000Z',
      sessionsChecked: [{ year: 2026, series: 'june' }, { year: 2026, series: 'november' }],
      subjects: [
        {
          syllabusCode: '9709',
          syllabusName: 'Mathematics',
          status: 'manifest_required',
          candidate: {
            year: 2026,
            series: 'november',
            pdfUrl: 'https://www.cambridgeinternational.org/Images/sensitive-candidate-1.pdf',
            indexUrl: 'https://www.cambridgeinternational.org/test-index',
          },
        },
        {
          syllabusCode: '9702',
          syllabusName: 'Physics',
          status: 'unchanged',
        },
        {
          syllabusCode: '9701',
          syllabusName: 'Chemistry',
          status: 'check_failed',
          issueCode: 'unexpected_index_structure',
        },
      ],
      manifestRequiredCount: 1,
      hasFailure: false,
    }

    const logEvent = buildDiscoverySuccessLog(mockReport, 200, 123.45)
    expect(logEvent).toEqual({
      event: 'grade_threshold_discovery_executed',
      schemaVersion: 1,
      ok: true,
      outcome: 'manifest_required',
      status: 200,
      durationMs: 123,
      sessionsCheckedCount: 2,
      manifestRequiredCount: 1,
      hasFailure: false,
      subjectStatusCounts: {
        unchanged: 1,
        manifest_required: 1,
        unavailable: 0,
        check_failed: 1,
      },
      affectedSyllabusCodes: ['9701', '9709'],
      issueCodes: ['unexpected_index_structure'],
    })

    const serialized = JSON.stringify(logEvent)
    expect(serialized).not.toContain('sensitive-candidate')
    expect(serialized).not.toContain('test-index')
    expect(serialized).not.toContain('https://')
    expect(serialized).not.toContain('.pdf')
  })

  test('buildDiscoveryErrorLog builds sanitized error event', () => {
    const logEvent = buildDiscoveryErrorLog(456.78)
    expect(logEvent).toEqual({
      event: 'grade_threshold_discovery_executed',
      schemaVersion: 1,
      ok: false,
      outcome: 'unexpected_error',
      status: 502,
      durationMs: 457,
      hasFailure: true,
      errorKind: 'unexpected_exception',
    })
  })

  test('emitDiscoveryStructuredLog routes to console.info or console.error cleanly', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      // 1. Success outcome routes to console.info
      const successEvent = buildDiscoverySuccessLog(
        {
          ok: true,
          outcome: 'no_change',
          sessionsChecked: [],
          manifestRequiredCount: 0,
          hasFailure: false,
          subjects: [],
        },
        200,
        10,
      )
      emitDiscoveryStructuredLog(successEvent)
      expect(infoSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).not.toHaveBeenCalled()

      infoSpy.mockClear()
      errorSpy.mockClear()

      // 2. Failure outcome routes to console.error
      const failureEvent = buildDiscoveryErrorLog(15)
      emitDiscoveryStructuredLog(failureEvent)
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(infoSpy).not.toHaveBeenCalled()
    } finally {
      infoSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })

  test('hardens against adversarial inputs, credentials, URLs, newlines, and prototype keys', () => {
    const adversarialReport = {
      ok: false,
      outcome: 'check_failed' as const,
      sessionsChecked: [1],
      manifestRequiredCount: 0,
      hasFailure: true,
      subjects: [
        {
          syllabusCode: 'https://evil.example/secret',
          status: 'Bearer exposed-secret',
          issueCode: 'postgresql://user:password@host/database',
        },
        {
          syllabusCode: 'malicious\ncode',
          status: 'unknown_status_value',
          issueCode: 'another\nnewline',
        },
        {
          syllabusCode: '__proto__',
          status: '__proto__',
          issueCode: '__proto__',
        },
        {
          syllabusCode: '9709',
          status: 'invalid_status_here',
        },
      ],
    }

    const logEvent = buildDiscoverySuccessLog(adversarialReport, 502, 99.9)
    const serialized = JSON.stringify(logEvent)

    // Assert that none of those raw strings appears in the event or serialized JSON
    expect(serialized).not.toContain('https://evil.example/secret')
    expect(serialized).not.toContain('Bearer exposed-secret')
    expect(serialized).not.toContain('postgresql://user:password@host/database')
    expect(serialized).not.toContain('\n')
    expect(serialized).not.toContain('malicious')
    expect(serialized).not.toContain('another')

    // Assert that unknown_syllabus and unknown_issue appear
    expect(logEvent.affectedSyllabusCodes).toContain('unknown_syllabus')
    expect(logEvent.affectedSyllabusCodes).toContain('9709')
    expect(logEvent.issueCodes).toContain('unknown_issue')

    // Assert that check_failed is incremented for all invalid statuses
    expect(logEvent.subjectStatusCounts.check_failed).toBe(4)
    expect(logEvent.subjectStatusCounts.unchanged).toBe(0)
    expect(logEvent.subjectStatusCounts.manifest_required).toBe(0)
    expect(logEvent.subjectStatusCounts.unavailable).toBe(0)

    // Assert no exception or prototype-key behaviour occurs
    expect(Object.prototype.hasOwnProperty.call(logEvent, '__proto__')).toBe(false)
    expect(logEvent.affectedSyllabusCodes).not.toContain('__proto__')
    expect(logEvent.issueCodes).not.toContain('__proto__')
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()
  })
})
