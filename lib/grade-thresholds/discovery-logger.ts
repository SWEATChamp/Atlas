import 'server-only'

export type DiscoveryRunnerOutcome =
  | 'no_change'
  | 'manifest_required'
  | 'unavailable'
  | 'check_failed'
  | 'timeout'

export interface DiscoveryLoggerInputReport {
  ok: boolean
  outcome: DiscoveryRunnerOutcome
  sessionsChecked: Array<unknown>
  manifestRequiredCount: number
  hasFailure: boolean
  subjects: Array<{
    syllabusCode: unknown
    status: unknown
    issueCode?: unknown
  }>
}

export interface DiscoveryLogEvent {
  event: 'grade_threshold_discovery_executed'
  schemaVersion: 1
  ok: boolean
  outcome: DiscoveryRunnerOutcome
  status: number
  durationMs: number
  sessionsCheckedCount: number
  manifestRequiredCount: number
  hasFailure: boolean
  subjectStatusCounts: {
    unchanged: number
    manifest_required: number
    unavailable: number
    check_failed: number
  }
  affectedSyllabusCodes: string[]
  issueCodes: string[]
}

export interface DiscoveryErrorLogEvent {
  event: 'grade_threshold_discovery_executed'
  schemaVersion: 1
  ok: false
  outcome: 'unexpected_error'
  status: 502
  durationMs: number
  hasFailure: true
  errorKind: 'unexpected_exception'
}

export type DiscoveryStructuredLog = DiscoveryLogEvent | DiscoveryErrorLogEvent

const ALLOWED_SYLLABUS_CODES = new Set([
  '9709',
  '9231',
  '9702',
  '9701',
  '9618',
])

const ALLOWED_ISSUE_CODES = new Set([
  'not_found',
  'gone',
  'timeout',
  'network_error',
  'unapproved_host',
  'insecure_protocol',
  'too_many_redirects',
  'invalid_content_type',
  'oversized_content',
  'malformed_content_length',
  'mismatched_session',
  'mismatched_subject',
  'ambiguous_links',
  'unexpected_index_structure',
  'check_failed',
])

function sanitizeSyllabusCode(code: unknown): string {
  if (typeof code === 'string' && ALLOWED_SYLLABUS_CODES.has(code)) {
    return code
  }
  return 'unknown_syllabus'
}

function sanitizeIssueCode(issue: unknown): string {
  if (typeof issue === 'string' && ALLOWED_ISSUE_CODES.has(issue)) {
    return issue
  }
  return 'unknown_issue'
}

export function buildDiscoverySuccessLog(
  report: DiscoveryLoggerInputReport,
  status: number,
  durationMs: number,
): DiscoveryLogEvent {
  const subjectStatusCounts = {
    unchanged: 0,
    manifest_required: 0,
    unavailable: 0,
    check_failed: 0,
  }

  const affectedCodesSet = new Set<string>()
  const issueCodesSet = new Set<string>()

  if (Array.isArray(report.subjects)) {
    for (const subject of report.subjects) {
      if (!subject) continue
      const sanitizedSyllabus = sanitizeSyllabusCode(subject.syllabusCode)

      switch (subject.status) {
        case 'unchanged':
          subjectStatusCounts.unchanged += 1
          break
        case 'manifest_required':
          subjectStatusCounts.manifest_required += 1
          affectedCodesSet.add(sanitizedSyllabus)
          if (subject.issueCode !== undefined && subject.issueCode !== null) {
            issueCodesSet.add(sanitizeIssueCode(subject.issueCode))
          }
          break
        case 'unavailable':
          subjectStatusCounts.unavailable += 1
          affectedCodesSet.add(sanitizedSyllabus)
          if (subject.issueCode !== undefined && subject.issueCode !== null) {
            issueCodesSet.add(sanitizeIssueCode(subject.issueCode))
          }
          break
        case 'check_failed':
          subjectStatusCounts.check_failed += 1
          affectedCodesSet.add(sanitizedSyllabus)
          if (subject.issueCode !== undefined && subject.issueCode !== null) {
            issueCodesSet.add(sanitizeIssueCode(subject.issueCode))
          }
          break
        default:
          subjectStatusCounts.check_failed += 1
          affectedCodesSet.add(sanitizedSyllabus)
          issueCodesSet.add('unknown_issue')
          break
      }
    }
  }

  return {
    event: 'grade_threshold_discovery_executed',
    schemaVersion: 1,
    ok: report.ok,
    outcome: report.outcome,
    status,
    durationMs: Math.max(0, Math.round(durationMs)),
    sessionsCheckedCount: Array.isArray(report.sessionsChecked)
      ? report.sessionsChecked.length
      : 0,
    manifestRequiredCount: report.manifestRequiredCount,
    hasFailure: report.hasFailure,
    subjectStatusCounts,
    affectedSyllabusCodes: Array.from(affectedCodesSet).sort(),
    issueCodes: Array.from(issueCodesSet).sort(),
  }
}

export function buildDiscoveryErrorLog(durationMs: number): DiscoveryErrorLogEvent {
  return {
    event: 'grade_threshold_discovery_executed',
    schemaVersion: 1,
    ok: false,
    outcome: 'unexpected_error',
    status: 502,
    durationMs: Math.max(0, Math.round(durationMs)),
    hasFailure: true,
    errorKind: 'unexpected_exception',
  }
}

export function emitDiscoveryStructuredLog(logData: DiscoveryStructuredLog): void {
  const line = JSON.stringify(logData)
  if (logData.ok && logData.outcome !== 'check_failed' && logData.outcome !== 'timeout') {
    console.info(line)
  } else {
    console.error(line)
  }
}
