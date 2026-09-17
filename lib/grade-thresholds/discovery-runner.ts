import 'server-only'

import {
  discoverCambridgePublications,
  compareSessions,
  type DiscoverPublicationsOptions,
  type DiscoveredPublicationCandidate,
  type DiscoveryIssueCode,
  type ExamSession,
  type PublicationDiscoveryReport,
} from './publication-discovery'
import {
  CAMBRIDGE_THRESHOLD_SOURCES,
  getNewestReviewedThresholdSource,
} from './source-manifest'
import type { CambridgeThresholdSource } from './types'

export type DiscoveryRunnerOutcome =
  | 'no_change'
  | 'manifest_required'
  | 'unavailable'
  | 'check_failed'
  | 'timeout'

export type SubjectComparisonStatus =
  | 'unchanged'
  | 'manifest_required'
  | 'unavailable'
  | 'check_failed'

export type ManifestRequiredReason =
  | 'newer_session_available'
  | 'same_session_url_changed'
  | 'unmanifested_subject'

export interface SubjectComparisonResult {
  syllabusCode: string
  syllabusName: string
  status: SubjectComparisonStatus
  reason?: ManifestRequiredReason
  candidate?: {
    year: number
    series: string
    pdfUrl: string
    indexUrl: string
  }
  baseline?: {
    year: number
    series: string
    pdfUrl: string
  }
  issueCode?: DiscoveryIssueCode
}

export interface DiscoveryRunnerReport {
  ok: boolean
  outcome: DiscoveryRunnerOutcome
  checkedAt: string
  sessionsChecked: ExamSession[]
  subjects: SubjectComparisonResult[]
  manifestRequiredCount: number
  hasFailure: boolean
}

export interface RunGradeThresholdDiscoveryOptions {
  discoveryOptions?: DiscoverPublicationsOptions
  manifestSources?: readonly CambridgeThresholdSource[]
  now?: () => Date
}

export function normalizePublicationUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname.replace(/\/+$/, '')
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`
  } catch {
    return url.trim().replace(/\/+$/, '')
  }
}

/**
 * Executes Cambridge publication discovery in a strictly read-only, non-mutating
 * execution boundary and cross-references candidate links against the reviewed
 * manifest registry.
 *
 * Never downloads PDFs or touches database persistence.
 */
export async function runGradeThresholdDiscovery(
  options?: RunGradeThresholdDiscoveryOptions,
): Promise<DiscoveryRunnerReport> {
  const manifestSources = options?.manifestSources ?? CAMBRIDGE_THRESHOLD_SOURCES
  const nowFn = options?.now ?? (() => new Date())
  const checkedAt = nowFn().toISOString()

  const discoveryReport: PublicationDiscoveryReport = await discoverCambridgePublications({
    now: nowFn,
    ...options?.discoveryOptions,
  })

  const subjectResults: SubjectComparisonResult[] = []
  let manifestRequiredCount = 0
  let hasTimeout = false
  let hasOtherFailure = false

  for (const subject of discoveryReport.subjects) {
    const baseline = getNewestReviewedThresholdSource(subject.syllabusCode, manifestSources)
    const candidate: DiscoveredPublicationCandidate | undefined = subject.latestPublication

    // Determine the relevant threshold session as the chronologically newer of
    // candidate and baseline. Failures strictly older than this reference are ignored;
    // failures equal to or newer fail closed.
    const candidateSession: ExamSession | undefined = candidate
      ? { year: candidate.year, series: candidate.series }
      : undefined
    const baselineSession: ExamSession | undefined = baseline
      ? { year: baseline.year, series: baseline.series }
      : undefined

    let relevantThresholdSession: ExamSession | undefined
    if (candidateSession && baselineSession) {
      relevantThresholdSession =
        compareSessions(candidateSession, baselineSession) >= 0
          ? candidateSession
          : baselineSession
    } else {
      relevantThresholdSession = candidateSession ?? baselineSession
    }

    let decisiveIssueCode: DiscoveryIssueCode | undefined
    for (const sessionItem of subject.checkedSessions) {
      if (
        sessionItem.status === 'check_failed' ||
        sessionItem.status === 'invalid_link' ||
        sessionItem.status === 'ambiguous'
      ) {
        const isNewerThanBaselineOrCandidate =
          !relevantThresholdSession ||
          compareSessions(
            { year: sessionItem.year, series: sessionItem.series },
            relevantThresholdSession,
          ) >= 0

        if (isNewerThanBaselineOrCandidate) {
          const sessionIssue: DiscoveryIssueCode =
            sessionItem.issueCode ??
            (sessionItem.status === 'ambiguous' ? 'ambiguous_links' : 'check_failed')

          if (sessionIssue === 'timeout') {
            decisiveIssueCode = 'timeout'
          } else if (decisiveIssueCode !== 'timeout') {
            decisiveIssueCode = decisiveIssueCode ?? sessionIssue
          }
        }
      }
    }

    if (decisiveIssueCode) {
      if (decisiveIssueCode === 'timeout') {
        hasTimeout = true
      } else {
        hasOtherFailure = true
      }
      subjectResults.push({
        syllabusCode: subject.syllabusCode,
        syllabusName: subject.syllabusName,
        status: 'check_failed',
        issueCode: decisiveIssueCode,
        candidate: candidate
          ? {
              year: candidate.year,
              series: candidate.series,
              pdfUrl: candidate.pdfUrl,
              indexUrl: candidate.indexUrl,
            }
          : undefined,
        baseline: baseline
          ? {
              year: baseline.year,
              series: baseline.series,
              pdfUrl: baseline.pdfUrl,
            }
          : undefined,
      })
      continue
    }

    if (!candidate) {
      // No candidate found on any checked session, and no newer decisive failure
      subjectResults.push({
        syllabusCode: subject.syllabusCode,
        syllabusName: subject.syllabusName,
        status: 'unavailable',
        baseline: baseline
          ? {
              year: baseline.year,
              series: baseline.series,
              pdfUrl: baseline.pdfUrl,
            }
          : undefined,
      })
      continue
    }

    // Candidate found: compare against newest reviewed baseline
    if (!baseline) {
      manifestRequiredCount += 1
      subjectResults.push({
        syllabusCode: subject.syllabusCode,
        syllabusName: subject.syllabusName,
        status: 'manifest_required',
        reason: 'unmanifested_subject',
        candidate: {
          year: candidate.year,
          series: candidate.series,
          pdfUrl: candidate.pdfUrl,
          indexUrl: candidate.indexUrl,
        },
      })
      continue
    }

    const cmp = compareSessions(
      { year: candidate.year, series: candidate.series },
      { year: baseline.year, series: baseline.series },
    )

    if (cmp > 0) {
      manifestRequiredCount += 1
      subjectResults.push({
        syllabusCode: subject.syllabusCode,
        syllabusName: subject.syllabusName,
        status: 'manifest_required',
        reason: 'newer_session_available',
        candidate: {
          year: candidate.year,
          series: candidate.series,
          pdfUrl: candidate.pdfUrl,
          indexUrl: candidate.indexUrl,
        },
        baseline: {
          year: baseline.year,
          series: baseline.series,
          pdfUrl: baseline.pdfUrl,
        },
      })
    } else if (cmp === 0) {
      const candidateNormUrl = normalizePublicationUrl(candidate.pdfUrl)
      const baselineNormUrl = normalizePublicationUrl(baseline.pdfUrl)

      if (candidateNormUrl === baselineNormUrl) {
        subjectResults.push({
          syllabusCode: subject.syllabusCode,
          syllabusName: subject.syllabusName,
          status: 'unchanged',
          candidate: {
            year: candidate.year,
            series: candidate.series,
            pdfUrl: candidate.pdfUrl,
            indexUrl: candidate.indexUrl,
          },
          baseline: {
            year: baseline.year,
            series: baseline.series,
            pdfUrl: baseline.pdfUrl,
          },
        })
      } else {
        manifestRequiredCount += 1
        subjectResults.push({
          syllabusCode: subject.syllabusCode,
          syllabusName: subject.syllabusName,
          status: 'manifest_required',
          reason: 'same_session_url_changed',
          candidate: {
            year: candidate.year,
            series: candidate.series,
            pdfUrl: candidate.pdfUrl,
            indexUrl: candidate.indexUrl,
          },
          baseline: {
            year: baseline.year,
            series: baseline.series,
            pdfUrl: baseline.pdfUrl,
          },
        })
      }
    } else {
      // Candidate is older than reviewed baseline (e.g. November 2025 link when baseline is June 2026).
      // Older historical links do not trigger alerts when a newer baseline exists.
      subjectResults.push({
        syllabusCode: subject.syllabusCode,
        syllabusName: subject.syllabusName,
        status: 'unchanged',
        candidate: {
          year: candidate.year,
          series: candidate.series,
          pdfUrl: candidate.pdfUrl,
          indexUrl: candidate.indexUrl,
        },
        baseline: {
          year: baseline.year,
          series: baseline.series,
          pdfUrl: baseline.pdfUrl,
        },
      })
    }
  }

  let outcome: DiscoveryRunnerOutcome
  let ok = true

  if (hasTimeout) {
    outcome = 'timeout'
    ok = false
  } else if (hasOtherFailure) {
    outcome = 'check_failed'
    ok = false
  } else if (manifestRequiredCount > 0) {
    outcome = 'manifest_required'
    ok = true
  } else if (
    subjectResults.length > 0 &&
    subjectResults.every((subject) => subject.status === 'unavailable')
  ) {
    outcome = 'unavailable'
    ok = true
  } else {
    outcome = 'no_change'
    ok = true
  }

  return {
    ok,
    outcome,
    checkedAt,
    sessionsChecked: discoveryReport.sessionsChecked,
    subjects: subjectResults,
    manifestRequiredCount,
    hasFailure: hasTimeout || hasOtherFailure,
  }
}
