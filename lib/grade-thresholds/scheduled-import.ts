import 'server-only'

import {
  MINIMUM_CRON_SECRET_LENGTH,
  verifyCronAuthorization,
  type CronAuthorizationResult,
} from './cron-auth'
import {
  downloadCambridgePdf,
  runGradeThresholdImportPipeline,
  type DownloadCambridgePdfOptions,
  type GradeThresholdPersistence,
  type ImportPipelineResult,
  type RunImportPipelineOptions,
} from './import-pipeline'
import { CAMBRIDGE_JUNE_2026_SOURCES } from './source-manifest'
import { sha256Hex } from './parser'
import type { CambridgeThresholdSource } from './types'
import {
  CAMBRIDGE_WEIGHTING_SOURCE,
  type CambridgeWeightingSourceManifest,
} from './weighting-source'
import {
  discoverCambridgePublications,
  type DiscoverPublicationsOptions,
  type PublicationDiscoveryReport,
} from './publication-discovery'

export {
  MINIMUM_CRON_SECRET_LENGTH,
  verifyCronAuthorization,
  type CronAuthorizationResult,
}

export type ScheduledSourceCheckStatus =
  | 'unchanged'
  | 'pending_review'
  | 'change_detected'
  | 'manifest_required'
  | 'unavailable'
  | 'ambiguous'
  | 'invalid_link'
  | 'check_failed'
  | 'unknown_subject'

export interface ScheduledSourceCheck {
  syllabusCode: string
  year: number
  series: CambridgeThresholdSource['series']
  status: ScheduledSourceCheckStatus
  observedChecksumSha256?: string
  storedPublicationId?: string
}

export interface ScheduledWeightingCheck {
  status: Exclude<ScheduledSourceCheckStatus, 'unknown_subject' | 'manifest_required'>
  observedChecksumSha256?: string
  reviewedSubjects: number
  pendingSubjects: number
  missingSubjects: number
}

export interface SanitizedImportAudit {
  runId: string
  status: ImportPipelineResult['status']
  stats: ImportPipelineResult['stats']
  weighting?: {
    status: NonNullable<ImportPipelineResult['weighting']>['status']
    issueCodes: string[]
  }
  publications: Array<{
    syllabusCode: string
    year: number
    series: CambridgeThresholdSource['series']
    status: ImportPipelineResult['publications'][number]['status']
    revisionNumber?: number
    publicationId?: string
    issueCodes: string[]
  }>
}

export interface ScheduledImportReport {
  ok: boolean
  outcome: 'no_change' | 'review_required' | 'partial_failure' | 'failed'
  checkedAt: string
  sourceChecks: ScheduledSourceCheck[]
  weightingCheck?: ScheduledWeightingCheck
  discovery?: PublicationDiscoveryReport
  importAudit?: SanitizedImportAudit
}

export interface RunScheduledImportOptions {
  persistence: GradeThresholdPersistence
  sources?: readonly CambridgeThresholdSource[]
  includeWeighting?: boolean
  weightingSource?: CambridgeWeightingSourceManifest
  downloadPdf?: (
    url: string,
    options?: DownloadCambridgePdfOptions,
  ) => Promise<{ bytes: Uint8Array; contentType: string }>
  runPipeline?: (
    options: RunImportPipelineOptions,
  ) => Promise<ImportPipelineResult>
  discoverPublications?: (
    options?: DiscoverPublicationsOptions,
  ) => Promise<PublicationDiscoveryReport>
  discoveryOptions?: DiscoverPublicationsOptions
  enableDiscovery?: boolean
  now?: () => Date
}

export interface HandleScheduledImportRequestOptions {
  cronSecret: string | undefined
  execute: () => Promise<ScheduledImportReport>
}

export function sanitizeImportAudit(
  result: ImportPipelineResult,
): SanitizedImportAudit {
  return {
    runId: result.runId,
    status: result.status,
    stats: result.stats,
    weighting: result.weighting
      ? {
          status: result.weighting.status,
          issueCodes: result.weighting.issues.map((issue) => issue.code),
        }
      : undefined,
    publications: result.publications.map((publication) => ({
      syllabusCode: publication.syllabusCode,
      year: publication.year,
      series: publication.series,
      status: publication.status,
      revisionNumber: publication.revisionNumber,
      publicationId: publication.publicationId,
      issueCodes: publication.issues.map((issue) => issue.code),
    })),
  }
}

/**
 * Checks configured, independently reviewed Cambridge sources and only invokes
 * the mutating importer when a checksum is not already stored. Publications
 * are always staged for review; this boundary can never auto-publish them.
 */
function normalizeCambridgeUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return url.trim().replace(/\/+$/, '').toLowerCase()
  }
}

export async function runScheduledGradeThresholdImport(
  options: RunScheduledImportOptions,
): Promise<ScheduledImportReport> {
  const persistence = options.persistence
  const sources = options.sources ?? CAMBRIDGE_JUNE_2026_SOURCES
  const includeWeighting = options.includeWeighting ?? true
  const weightingSource = options.weightingSource ?? CAMBRIDGE_WEIGHTING_SOURCE
  const download = options.downloadPdf ?? downloadCambridgePdf
  const runPipeline = options.runPipeline ?? runGradeThresholdImportPipeline
  const checkedAt = (options.now ?? (() => new Date()))().toISOString()

  const shouldDiscover =
    options.enableDiscovery ??
    (options.discoverPublications !== undefined || options.sources === undefined)
  const discover =
    options.discoverPublications ?? discoverCambridgePublications

  let discoveryReport: PublicationDiscoveryReport | undefined
  if (shouldDiscover) {
    try {
      discoveryReport = await discover({
        now: options.now,
        ...options.discoveryOptions,
      })
    } catch {
      discoveryReport = {
        checkedAt,
        sessionsChecked: [],
        subjects: [],
        hasDiscoveryFailure: true,
      }
    }
  }

  const downloadCache = new Map<
    string,
    Promise<{ bytes: Uint8Array; contentType: string }>
  >()
  const cachedDownload = (url: string) => {
    let pending = downloadCache.get(url)
    if (!pending) {
      pending = download(url)
      downloadCache.set(url, pending)
    }
    return pending
  }

  const subjectCache = new Map<
    string,
    ReturnType<GradeThresholdPersistence['getSubjectBySyllabus']>
  >()
  const getSubject = (syllabusCode: string) => {
    let pending = subjectCache.get(syllabusCode)
    if (!pending) {
      pending = persistence.getSubjectBySyllabus(syllabusCode)
      subjectCache.set(syllabusCode, pending)
    }
    return pending
  }

  const sourceChecks = await Promise.all(
    sources.map(async (source): Promise<ScheduledSourceCheck> => {
      try {
        const [{ bytes }, subject] = await Promise.all([
          cachedDownload(source.pdfUrl),
          getSubject(source.syllabusCode),
        ])
        const observedChecksumSha256 = sha256Hex(bytes)

        if (!subject) {
          return {
            syllabusCode: source.syllabusCode,
            year: source.year,
            series: source.series,
            status: 'unknown_subject',
            observedChecksumSha256,
          }
        }

        const stored = await persistence.findPublicationByChecksum(
          subject.id,
          source.year,
          source.series,
          observedChecksumSha256,
        )
        const matchesConfiguredChecksum =
          observedChecksumSha256 === source.expectedChecksumSha256
        const isPublished =
          stored?.publicationStatus === 'published' && stored.isActive

        return {
          syllabusCode: source.syllabusCode,
          year: source.year,
          series: source.series,
          status: !matchesConfiguredChecksum
            ? stored
              ? 'pending_review'
              : 'change_detected'
            : !stored
              ? 'change_detected'
              : isPublished
                ? 'unchanged'
                : 'pending_review',
          observedChecksumSha256,
          storedPublicationId: stored?.id,
        }
      } catch (err) {
        const isUnavailable =
          err instanceof Error && err.message.includes('HTTP status 404')
        return {
          syllabusCode: source.syllabusCode,
          year: source.year,
          series: source.series,
          status: isUnavailable ? 'unavailable' : 'check_failed',
        }
      }
    }),
  )

  if (discoveryReport) {
    for (const subject of discoveryReport.subjects) {
      if (subject.latestPublication) {
        const candidate = subject.latestPublication
        const matchingSource = sources.find(
          (s) =>
            s.syllabusCode === candidate.syllabusCode &&
            s.year === candidate.year &&
            s.series === candidate.series &&
            normalizeCambridgeUrl(s.pdfUrl) === normalizeCambridgeUrl(candidate.pdfUrl) &&
            normalizeCambridgeUrl(s.indexUrl) === normalizeCambridgeUrl(candidate.indexUrl),
        )
        if (!matchingSource) {
          sourceChecks.push({
            syllabusCode: candidate.syllabusCode,
            year: candidate.year,
            series: candidate.series,
            status: 'manifest_required',
          })
        }
      }

      for (const session of subject.checkedSessions) {
        if (
          session.status === 'ambiguous' ||
          session.status === 'invalid_link' ||
          session.status === 'check_failed'
        ) {
          const isManifestSource = sources.some(
            (s) =>
              s.syllabusCode === subject.syllabusCode &&
              s.year === session.year &&
              s.series === session.series,
          )
          // Never overwrite manifest source checks with discovery statuses
          if (!isManifestSource) {
            const existingCheck = sourceChecks.find(
              (c) =>
                c.syllabusCode === subject.syllabusCode &&
                c.year === session.year &&
                c.series === session.series,
            )
            if (existingCheck) {
              existingCheck.status = session.status
            } else {
              sourceChecks.push({
                syllabusCode: subject.syllabusCode,
                year: session.year,
                series: session.series,
                status: session.status,
              })
            }
          }
        }
      }
    }
  }

  let weightingCheck: ScheduledWeightingCheck | undefined
  if (includeWeighting) {
    try {
      const { bytes } = await cachedDownload(weightingSource.pdfUrl)
      const observedChecksumSha256 = sha256Hex(bytes)
      const matchesConfiguredChecksum =
        observedChecksumSha256 === weightingSource.expectedChecksumSha256
      let reviewedSubjects = 0
      let pendingSubjects = 0
      let missingSubjects = 0

      for (const source of sources) {
        const subject = await getSubject(source.syllabusCode)
        if (!subject) {
          missingSubjects += 1
          continue
        }

        const stored = await persistence.getWeightingSource(
          subject.id,
          source.year,
          source.series,
          observedChecksumSha256,
        )
        if (!stored) {
          missingSubjects += 1
        } else if (stored.reviewStatus === 'approved') {
          reviewedSubjects += 1
        } else {
          pendingSubjects += 1
        }
      }

      weightingCheck = {
        status:
          !matchesConfiguredChecksum && missingSubjects === 0
            ? 'pending_review'
            : missingSubjects > 0
            ? 'change_detected'
            : pendingSubjects > 0
              ? 'pending_review'
              : 'unchanged',
        observedChecksumSha256,
        reviewedSubjects,
        pendingSubjects,
        missingSubjects,
      }
    } catch {
      weightingCheck = {
        status: 'check_failed',
        reviewedSubjects: 0,
        pendingSubjects: 0,
        missingSubjects: sources.length,
      }
    }
  }

  const hasDiscoveryFailure = Boolean(
    discoveryReport?.hasDiscoveryFailure ||
    discoveryReport?.subjects.some(
      (s) =>
        s.status === 'check_failed' ||
        s.checkedSessions.some((cs) => cs.status === 'check_failed'),
    ),
  )

  if (hasDiscoveryFailure) {
    return {
      ok: false,
      outcome: 'failed',
      checkedAt,
      sourceChecks,
      weightingCheck,
      discovery: discoveryReport,
    }
  }

  const manifestSourceChecks = sourceChecks.filter((check) =>
    check.status !== 'manifest_required' &&
    sources.some(
      (s) =>
        s.syllabusCode === check.syllabusCode &&
        s.year === check.year &&
        s.series === check.series,
    ),
  )

  const requiresManifestImport =
    manifestSourceChecks.some((check) =>
      ['change_detected', 'check_failed', 'unknown_subject'].includes(
        check.status,
      ),
    ) ||
    (weightingCheck !== undefined &&
      ['change_detected', 'check_failed'].includes(weightingCheck.status))

  const hasPendingReview =
    sourceChecks.some((check) =>
      ['pending_review', 'manifest_required', 'ambiguous', 'invalid_link'].includes(
        check.status,
      ),
    ) ||
    weightingCheck?.status === 'pending_review' ||
    Boolean(
      discoveryReport?.subjects.some((s) =>
        ['ambiguous', 'invalid_link'].includes(s.status),
      ),
    )

  if (!requiresManifestImport) {
    return {
      ok: true,
      outcome: hasPendingReview ? 'review_required' : 'no_change',
      checkedAt,
      sourceChecks,
      weightingCheck,
      discovery: discoveryReport,
    }
  }

  const pipelineResult = await runPipeline({
    triggerKind: 'scheduled',
    persistence,
    sources,
    includeWeighting,
    weightingSource,
    downloadPdf: cachedDownload,
    autoPublish: false,
  })
  const importAudit = sanitizeImportAudit(pipelineResult)

  return {
    ok: pipelineResult.status === 'succeeded',
    outcome:
      pipelineResult.status === 'succeeded'
        ? 'review_required'
        : pipelineResult.status === 'partial'
          ? 'partial_failure'
          : 'failed',
    checkedAt,
    sourceChecks,
    weightingCheck,
    discovery: discoveryReport,
    importAudit,
  }
}

export async function handleScheduledGradeThresholdRequest(
  request: Request,
  options: HandleScheduledImportRequestOptions,
): Promise<Response> {
  const authorization = verifyCronAuthorization(
    request.headers.get('authorization'),
    options.cronSecret,
  )

  if (authorization === 'misconfigured') {
    return Response.json(
      { ok: false, error: 'cron_not_configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (authorization === 'unauthorized') {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const report = await options.execute()
    const status = report.outcome === 'review_required' ? 202 : report.ok ? 200 : 500
    return Response.json(report, {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch {
    return Response.json(
      { ok: false, error: 'scheduled_import_failed' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      },
    )
  }
}
