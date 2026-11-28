import type {
  CambridgeSeries,
  CambridgeThresholdSource,
  PdfExtraction,
  ParserIssue,
  ComponentThreshold,
  CombinationThreshold,
  ComponentGrade,
} from './types'
import { sha256Hex, parseCambridgeThresholdPdf } from './parser'
import { extractPdfTextItems } from './pdf-extraction'
import { CAMBRIDGE_THRESHOLD_SOURCES } from './source-manifest'
import {
  buildGradeThresholdCompletenessReport,
  type GradeThresholdCompletenessReport,
  type ObservedPublicationCounts,
  type SubjectCompletenessInput,
} from './completeness-report'
import {
  CAMBRIDGE_WEIGHTING_SOURCE,
  getExpectedWeightingRowsForSession,
  isWeightingManifestCoveringSession,
  parseCambridgeWeightingPdf,
  validateWeightingManifest,
  type CambridgeWeightingSourceManifest,
  type ParsedWeightingPublication,
} from './weighting-source'

import { APPROVED_CAMBRIDGE_HOSTS } from './cambridge-host-policy'
export { APPROVED_CAMBRIDGE_HOSTS }

export const DEFAULT_MAX_PDF_BYTES = 50 * 1024 * 1024 // 50 MB

export interface DownloadCambridgePdfOptions {
  maxBytes?: number
  maxRedirects?: number
  fetchFn?: typeof fetch
}

/**
 * Downloads a Cambridge PDF securely with protocol checks, host allowlisting,
 * redirect limits, content-type verification, Content-Length validation, and
 * streaming chunk size enforcement.
 */
export async function downloadCambridgePdf(
  url: string,
  options?: DownloadCambridgePdfOptions,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_PDF_BYTES
  const maxRedirects = options?.maxRedirects ?? 3
  const fetchFn = options?.fetchFn ?? fetch

  let currentUrl = url
  let redirects = 0

  while (true) {
    const parsed = new URL(currentUrl)
    if (parsed.protocol !== 'https:') {
      throw new Error(`Insecure protocol "${parsed.protocol}" not allowed; must be https:`)
    }
    if (!APPROVED_CAMBRIDGE_HOSTS.has(parsed.hostname)) {
      throw new Error(`Unapproved host "${parsed.hostname}"; only Cambridge hosts are permitted`)
    }

    const response = await fetchFn(currentUrl, {
      method: 'GET',
      redirect: 'manual',
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        throw new Error(`Redirect response missing Location header from ${currentUrl}`)
      }
      redirects++
      if (redirects > maxRedirects) {
        throw new Error(`Too many redirects (limit ${maxRedirects})`)
      }
      currentUrl = new URL(location, currentUrl).toString()
      continue
    }

    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status} ${response.statusText} from ${currentUrl}`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    const mimeType = contentType.split(';', 1)[0].trim().toLowerCase()
    if (mimeType !== 'application/pdf') {
      throw new Error(`Invalid content type "${contentType}"; expected application/pdf`)
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength !== null) {
      const parsedLength = Number(contentLength)
      if (!Number.isFinite(parsedLength) || !Number.isInteger(parsedLength) || parsedLength < 0) {
        throw new Error(`Malformed content-length "${contentLength}"`)
      }
      if (parsedLength > maxBytes) {
        throw new Error(`Content length ${parsedLength} exceeds maximum limit of ${maxBytes} bytes`)
      }
    }

    // Stream chunks with immediate byte limit enforcement
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let totalBytes = 0

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            totalBytes += value.byteLength
            if (totalBytes > maxBytes) {
              await reader.cancel()
              throw new Error(`Downloaded bytes ${totalBytes} exceed maximum limit of ${maxBytes} bytes`)
            }
            chunks.push(value)
          }
        }
      } catch (err) {
        await reader.cancel().catch(() => {})
        throw err
      }

      const bytes = new Uint8Array(totalBytes)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }

      return { bytes, contentType }
    }

    // Fallback if response.body is not a ReadableStream (e.g. node / mock environments)
    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error(`Downloaded bytes ${arrayBuffer.byteLength} exceed maximum limit of ${maxBytes} bytes`)
    }

    return {
      bytes: new Uint8Array(arrayBuffer),
      contentType,
    }
  }
}

export interface ExistingPublicationInfo {
  id: string
  revisionNumber: number
  checksumSha256: string
  publicationStatus: string
  isActive: boolean
}

export interface WeightingEntryInfo {
  id: string
  rawToken: string
  tokenKind: 'component_variant' | 'carry_forward'
  rawMaximum: number
  weightedMaximum: number
  officialWeightingFactor: number
  sourcePage: number
}

export interface WeightingSourceInfo {
  id: string
  reviewStatus: string
  entries: Map<string, WeightingEntryInfo> // rawToken -> entry
}

export interface StagedTokenParams {
  tokenPosition: number
  rawToken: string
  tokenKind: 'component_variant' | 'carry_forward' | 'special' | 'unresolved'
  resolvedComponentVariantId?: string | null
  resolvedComponentCode?: string | null
  stage?: 'as' | 'a2' | null
  maximumMark?: number | null
  weightingFactor?: number | null
  weightingEntryId?: string | null
  carryForwardMappingStatus?: 'unreviewed' | 'approved' | 'rejected' | null
  mappingReviewedBy?: string | null
  mappingReviewedAt?: string | null
  sourceTokenMetadata?: Record<string, unknown>
}

export interface StagedCombinationParams {
  canonicalKey: string
  officialOptionLabel?: string | null
  officialSourceLabel?: string | null
  qualificationLevel: 'as' | 'a_level'
  routeType: 'as_only' | 'staged' | 'full_level' | 'other'
  maximumMark: number
  weightingBasis: 'raw_total' | 'weighted_total'
  plannerEligibility: 'unreviewed' | 'eligible' | 'unsupported' | 'ambiguous'
  atlasRouteId?: string | null
  reviewMetadata?: Record<string, unknown>
  marks: Array<{ grade: string; thresholdMark: number }>
  tokens: StagedTokenParams[]
}

export interface StagedVariantParams {
  componentCode: string
  rawMaximumMark: number
  subjectPaperId: string | null
  sourceLabel?: string | null
  sourceRowMetadata?: Record<string, unknown>
  marks: Array<{ grade: ComponentGrade; thresholdMark: number }>
}

export interface CreateImportRunParams {
  triggerKind: 'scheduled' | 'manual' | 'backfill' | 'retry'
  parserVersion: string
}

export interface UpdateImportRunParams {
  status: 'running' | 'validating' | 'succeeded' | 'partial' | 'failed'
  aggregateSummary: Record<string, unknown>
  finishedAt?: string
}

export interface StagePublicationParams {
  runId: string
  subjectId: string
  year: number
  series: CambridgeSeries
  officialIndexUrl: string
  officialPdfUrl: string
  sourceChecksumSha256: string
  revisionNumber: number
  revisesPublicationId?: string
  parserVersion: string
  sourceMetadata?: Record<string, unknown>
}

export interface StagedPublicationBundleParams {
  publication: StagePublicationParams
  variants: StagedVariantParams[]
  combinations: StagedCombinationParams[]
  issues: RecordImportIssueParams[]
  autoPublish?: boolean
}

export interface StageWeightingSourceParams {
  subjectId: string
  documentYear: number
  examSeries: CambridgeSeries
  officialDocumentUrl: string
  sourceChecksumSha256: string
  sourceLabel: string
  sourceMetadata?: Record<string, unknown>
  entries: Array<{
    rawToken: string
    tokenKind: 'component_variant' | 'carry_forward'
    rawMaximum: number
    weightedMaximum: number
    officialWeightingFactor: number
    sourcePage: number
    sourceRowLabel?: string | null
  }>
}

export interface RecordImportIssueParams {
  runId: string
  publicationId?: string | null
  severity: 'info' | 'warning' | 'error'
  issueCode: string
  message: string
  recordReference?: Record<string, unknown>
}

export interface GradeThresholdPersistence {
  createImportRun(params: CreateImportRunParams): Promise<string>
  updateImportRun(runId: string, params: UpdateImportRunParams): Promise<void>

  getSubjectBySyllabus(syllabusCode: string): Promise<{ id: string; syllabusCode: string } | null>
  getSubjectPaper(subjectId: string, paperNumber: number): Promise<{ id: string; paperNumber: number; defaultStage?: 'as' | 'a2' } | null>
  getActivePublication(subjectId: string, year: number, series: CambridgeSeries): Promise<ExistingPublicationInfo | null>
  getLatestPublication(subjectId: string, year: number, series: CambridgeSeries): Promise<ExistingPublicationInfo | null>
  findPublicationByChecksum(subjectId: string, year: number, series: CambridgeSeries, checksumSha256: string): Promise<ExistingPublicationInfo | null>

  stagePublicationBundle(bundle: StagedPublicationBundleParams): Promise<string>

  getWeightingSource(subjectId: string, year: number, series: CambridgeSeries, checksumSha256: string): Promise<WeightingSourceInfo | null>
  stageWeightingSource(params: StageWeightingSourceParams): Promise<WeightingSourceInfo>
  approveWeightingSource(sourceId: string, reviewedBy: string, reviewedAt?: string): Promise<string>

  recordImportIssue(params: RecordImportIssueParams): Promise<void>
  publishPublication(publicationId: string): Promise<string>
  inspectPublicationCompleteness?(
    subjectId: string,
    year: number,
    series: CambridgeSeries,
  ): Promise<ObservedPublicationCounts | null>
}

export interface PublicationAuditResult {
  syllabusCode: string
  year: number
  series: CambridgeSeries
  status: 'published' | 'staged' | 'duplicate' | 'failed'
  checksumSha256: string
  revisionNumber?: number
  publicationId?: string
  issues: readonly ParserIssue[]
}

export interface ImportPipelineResult {
  runId: string
  status: 'succeeded' | 'partial' | 'failed'
  startedAt: string
  completedAt: string
  stats: {
    totalDiscovered: number
    totalStaged: number
    totalPublished: number
    totalDuplicate: number
    totalFailed: number
  }
  weighting?: {
    checksumSha256: string
    status: 'imported' | 'already_present' | 'invalid'
    issues: readonly { code: string; message: string }[]
  }
  publications: PublicationAuditResult[]
  awaitingReview?: boolean
  publicationDisposition?: 'published' | 'review_required' | 'failed' | 'unchanged'
  completenessReport?: GradeThresholdCompletenessReport
}

export interface RunImportPipelineOptions {
  triggerKind?: 'scheduled' | 'manual' | 'backfill' | 'retry'
  persistence: GradeThresholdPersistence
  sources?: readonly CambridgeThresholdSource[]
  includeWeighting?: boolean
  weightingSource?: CambridgeWeightingSourceManifest
  weightingSources?: readonly CambridgeWeightingSourceManifest[]
  downloadPdf?: (url: string) => Promise<{ bytes: Uint8Array; contentType: string }>
  extractPdfText?: (bytes: Uint8Array) => Promise<PdfExtraction>
  autoPublish?: boolean
  parserVersion?: string
}

const NON_STANDARD_SUBJECT_COMPONENTS: Readonly<Record<string, ReadonlySet<string>>> = {
  '9709': new Set(['50', '58', '59', '60', '68', '69']),
  '9231': new Set(['50', '51', '60', '61']),
  '9702': new Set(['50', '60']),
  '9701': new Set(['50', '60']),
  '9618': new Set(['50', '60']),
}

function resolveStandardPaperNumber(syllabusCode: string, componentCode: string): number | null {
  if (NON_STANDARD_SUBJECT_COMPONENTS[syllabusCode]?.has(componentCode)) {
    return null
  }
  const paperNum = parseInt(componentCode[0], 10)
  return Number.isNaN(paperNum) ? null : paperNum
}

/**
 * Administrative static source inspection boundary.
 *
 * Checks configured Cambridge sources against the persistence store without mutating
 * database state. Student requests must never invoke this function.
 */
export async function inspectConfiguredThresholdSources(params: {
  persistence: GradeThresholdPersistence
  sources?: readonly CambridgeThresholdSource[]
  includeWeighting?: boolean
  weightingSource?: CambridgeWeightingSourceManifest
}): Promise<{
  thresholdSources: Array<{
    syllabusCode: string
    year: number
    series: CambridgeSeries
    pdfUrl: string
    expectedChecksumSha256: string
    activePublication: ExistingPublicationInfo | null
  }>
  weightingSource?: {
    pdfUrl: string
    expectedChecksumSha256: string
  }
}> {
  const sources = params.sources ?? CAMBRIDGE_THRESHOLD_SOURCES
  const thresholdSources: Array<{
    syllabusCode: string
    year: number
    series: CambridgeSeries
    pdfUrl: string
    expectedChecksumSha256: string
    activePublication: ExistingPublicationInfo | null
  }> = []

  for (const source of sources) {
    const subject = await params.persistence.getSubjectBySyllabus(source.syllabusCode)
    let activePublication: ExistingPublicationInfo | null = null
    if (subject) {
      activePublication = await params.persistence.getActivePublication(
        subject.id,
        source.year,
        source.series,
      )
    }
    thresholdSources.push({
      syllabusCode: source.syllabusCode,
      year: source.year,
      series: source.series,
      pdfUrl: source.pdfUrl,
      expectedChecksumSha256: source.expectedChecksumSha256,
      activePublication,
    })
  }

  return {
    thresholdSources,
    weightingSource:
      params.includeWeighting && params.weightingSource
        ? {
            pdfUrl: params.weightingSource.pdfUrl,
            expectedChecksumSha256: params.weightingSource.expectedChecksumSha256,
          }
        : undefined,
  }
}

/**
 * Executes the Cambridge grade threshold import pipeline.
 *
 * Administrative / background job only. Never exposed to unauthenticated or student calls.
 */
export async function runGradeThresholdImportPipeline(
  options: RunImportPipelineOptions,
): Promise<ImportPipelineResult> {
  const triggerKind = options.triggerKind ?? 'manual'
  const persistence = options.persistence
  const sources = options.sources ?? CAMBRIDGE_THRESHOLD_SOURCES
  const download = options.downloadPdf ?? downloadCambridgePdf
  const extract = options.extractPdfText ?? extractPdfTextItems
  // Safe default: do not auto-publish staged documents without explicit administrative instruction
  const autoPublish = options.autoPublish ?? false
  const includeWeighting = options.includeWeighting ?? true
  const weightingManifests: readonly CambridgeWeightingSourceManifest[] =
    options.weightingSources ??
    [options.weightingSource ?? CAMBRIDGE_WEIGHTING_SOURCE]
  const parserVersion = options.parserVersion ?? 'v1'

  const startedAt = new Date().toISOString()
  const runId = await persistence.createImportRun({ triggerKind, parserVersion })

  let totalDiscovered = sources.length
  let totalStaged = 0
  let totalPublished = 0
  let totalDuplicate = 0
  let totalFailed = 0

  const publications: PublicationAuditResult[] = []
  let weightingAudit: ImportPipelineResult['weighting']

  // Track session-scoped weighting sources: `${subjectId}:${year}:${series}` -> WeightingSourceInfo
  const weightingSourcesBySessionSubject = new Map<string, WeightingSourceInfo>()
  const weightingManifestBySession = new Map<string, CambridgeWeightingSourceManifest>()

  const distinctSessions = new Map<string, { year: number; series: CambridgeSeries }>()
  for (const s of sources) {
    distinctSessions.set(`${s.year}:${s.series}`, { year: s.year, series: s.series })
  }

  if (includeWeighting) {
    for (const session of distinctSessions.values()) {
      const candidateManifest = weightingManifests.find((m) =>
        m.coveredSeries.includes(`${session.series}-${session.year}`),
      )
      if (!candidateManifest) {
        // Session has no reviewed weighting manifest; never backfill from another session (e.g. June 2026)
        continue
      }

      const manifestIssues = validateWeightingManifest(candidateManifest, session)
      if (manifestIssues.length > 0 || !isWeightingManifestCoveringSession(candidateManifest, session.year, session.series)) {
        weightingAudit = {
          checksumSha256: candidateManifest.expectedChecksumSha256,
          status: 'invalid',
          issues: manifestIssues,
        }
        await persistence.recordImportIssue({
          runId,
          issueCode: 'weighting-source-invalid',
          severity: 'error',
          message: `Weighting manifest metadata is invalid for ${session.series} ${session.year}.`,
          recordReference: { session, issues: manifestIssues },
        })
        totalFailed += 1
        continue
      }

      const matchingManifest = candidateManifest
      weightingManifestBySession.set(`${session.year}:${session.series}`, matchingManifest)
      totalDiscovered += 1

      try {
        const { bytes, contentType } = await download(matchingManifest.pdfUrl)
        const checksum = sha256Hex(bytes)

        const parsedWeighting: ParsedWeightingPublication = await parseCambridgeWeightingPdf(
          bytes,
          contentType,
          extract,
          matchingManifest.expectedChecksumSha256,
          { manifest: matchingManifest, targetSession: session },
        )

        if (parsedWeighting.validation.status !== 'valid') {
          weightingAudit = {
            checksumSha256: checksum,
            status: 'invalid',
            issues: parsedWeighting.validation.issues,
          }
          await persistence.recordImportIssue({
            runId,
            issueCode: 'weighting-source-invalid',
            severity: 'error',
            message: `Official weighting source document failed structural validation for ${session.series} ${session.year}.`,
            recordReference: { session, issues: parsedWeighting.validation.issues },
          })
          totalFailed += 1
        } else {
          const expectedMap = getExpectedWeightingRowsForSession(
            matchingManifest,
            session.year,
            session.series,
          )
          const relevantSyllabusCodes = new Set([
            ...Object.keys(expectedMap),
            ...sources
              .filter((s) => s.year === session.year && s.series === session.series)
              .map((s) => s.syllabusCode),
          ])

          for (const syllabusCode of relevantSyllabusCodes) {
            const subject = await persistence.getSubjectBySyllabus(syllabusCode)
            if (!subject) continue

            const existing = await persistence.getWeightingSource(
              subject.id,
              session.year,
              session.series,
              checksum,
            )

            const sessionKey = `${subject.id}:${session.year}:${session.series}`
            if (existing) {
              weightingSourcesBySessionSubject.set(sessionKey, existing)
            } else {
              const subjectRows = parsedWeighting.rows.filter(
                (r) =>
                  r.syllabusCode === syllabusCode &&
                  r.year === session.year &&
                  r.series === session.series,
              )
              if (subjectRows.length === 0) continue

              const matchingSource = sources.find(
                (s) =>
                  s.syllabusCode === syllabusCode &&
                  s.year === session.year &&
                  s.series === session.series,
              )
              const carryTokens = new Set(matchingSource?.carryForwardTokens ?? [])

              const entriesPayload = subjectRows.map((r) => {
                const tokenKind: 'component_variant' | 'carry_forward' = carryTokens.has(r.component)
                  ? 'carry_forward'
                  : 'component_variant'

                return {
                  rawToken: r.component,
                  tokenKind,
                  rawMaximum: r.maximumRawMark,
                  weightedMaximum: r.maximumWeightedMark,
                  officialWeightingFactor: r.factor,
                  sourcePage: r.source.page,
                  sourceRowLabel: r.source.reconstructedRow,
                }
              })

              const staged = await persistence.stageWeightingSource({
                subjectId: subject.id,
                documentYear: session.year,
                examSeries: session.series,
                officialDocumentUrl: matchingManifest.pdfUrl,
                sourceChecksumSha256: checksum,
                sourceLabel: `${matchingManifest.title} (${session.series} ${session.year})`,
                entries: entriesPayload,
              })

              weightingSourcesBySessionSubject.set(sessionKey, staged)
            }
          }

          weightingAudit = {
            checksumSha256: checksum,
            status: 'imported',
            issues: [],
          }
        }
      } catch (err) {
        totalFailed += 1
        const message = err instanceof Error ? err.message : String(err)
        weightingAudit = {
          checksumSha256: 'unknown',
          status: 'invalid',
          issues: [{ code: 'download-or-parse-failed', message }],
        }
        await persistence.recordImportIssue({
          runId,
          issueCode: 'weighting-source-failed',
          severity: 'error',
          message: `Failed to download or parse weighting source: ${message}`,
          recordReference: { session, error: message },
        })
      }
    }
  }

  const completenessObservations = new Map<string, ObservedPublicationCounts>()
  const pendingAutoPublishCandidates: Array<{ publicationId: string; pubIndex: number }> = []

  // Step 2: Process Threshold Publications
  for (const source of sources) {
    const sourceKey = `${source.syllabusCode}:${source.year}:${source.series}`
    try {
      const subject = await persistence.getSubjectBySyllabus(source.syllabusCode)
      if (!subject) {
        totalFailed += 1
        publications.push({
          syllabusCode: source.syllabusCode,
          year: source.year,
          series: source.series,
          status: 'failed',
          checksumSha256: 'unknown',
          issues: [{ code: 'wrong-identity', message: `Unknown syllabus code ${source.syllabusCode}` }],
        })
        continue
      }

      // Download original bytes
      const { bytes, contentType } = await download(source.pdfUrl)
      const checksumSha256 = sha256Hex(bytes)

      // Hash-first duplicate detection: identical checksum is a clean no-op
      const existingSameChecksum = await persistence.findPublicationByChecksum(
        subject.id,
        source.year,
        source.series,
        checksumSha256,
      )

      if (existingSameChecksum) {
        totalDuplicate += 1
        publications.push({
          syllabusCode: source.syllabusCode,
          year: source.year,
          series: source.series,
          status: 'duplicate',
          checksumSha256,
          revisionNumber: existingSameChecksum.revisionNumber,
          publicationId: existingSameChecksum.id,
          issues: [],
        })
        if (persistence.inspectPublicationCompleteness) {
          const observed = await persistence.inspectPublicationCompleteness(
            subject.id,
            source.year,
            source.series,
          )
          if (observed) completenessObservations.set(sourceKey, observed)
        }
        continue
      }

      // Check latest existing publication for revision lineage (covers active, staged, rejected, and superseded)
      const latestPub = await persistence.getLatestPublication(subject.id, source.year, source.series)
      const revisionNumber = latestPub ? latestPub.revisionNumber + 1 : 1
      const revisesPublicationId = latestPub ? latestPub.id : undefined

      // Parse PDF
      const parseResult = await parseCambridgeThresholdPdf(
        bytes,
        source,
        {
          contentType,
          extract,
        },
      )

      if (parseResult.status !== 'parsed') {
        totalDuplicate += 1
        publications.push({
          syllabusCode: source.syllabusCode,
          year: source.year,
          series: source.series,
          status: 'duplicate',
          checksumSha256,
          issues: [],
        })
        continue
      }

      const parsedPub = parseResult.publication
      const hasErrors = parsedPub.validation.status !== 'valid'

      // Defer auto-publishing until the entire batch completes without partial failures.
      // Any changed-checksum revision (revisionNumber > 1) MUST remain staged for separate administrative review.
      const eligibleForAutoPublish =
        autoPublish && revisionNumber === 1 && !revisesPublicationId && !hasErrors

      // Stage component variants
      const componentRows = parsedPub.rows.filter((r): r is ComponentThreshold => r.kind === 'component')
      const componentMaxMap = new Map<string, number>()
      const stagedVariants: StagedVariantParams[] = []
      const stageIssues: RecordImportIssueParams[] = []

      for (const row of componentRows) {
        componentMaxMap.set(row.component, row.maximumRawMark)
        const paperNum = resolveStandardPaperNumber(source.syllabusCode, row.component)
        const paper = paperNum !== null ? await persistence.getSubjectPaper(subject.id, paperNum) : null

        if (!paper) {
          stageIssues.push({
            runId,
            severity: 'info',
            issueCode: 'unmapped-subject-paper',
            message: `Component variant ${row.component} does not have a pre-mapped Atlas subject paper.`,
            recordReference: { component: row.component, syllabus: source.syllabusCode },
          })
        }

        stagedVariants.push({
          componentCode: row.component,
          rawMaximumMark: row.maximumRawMark, // Use real maximumRawMark! Never hardcode 100!
          subjectPaperId: paper?.id ?? null,
          sourceLabel: row.source.reconstructedRow,
          marks: (Object.entries(row.thresholds) as [ComponentGrade, number][]).map(([grade, thresholdMark]) => ({
            grade,
            thresholdMark,
          })),
        })
      }

      // Stage combinations with session-scoped weighting only
      const combinationRows = parsedPub.rows.filter((r): r is CombinationThreshold => r.kind === 'combination')
      const stagedCombinations: StagedCombinationParams[] = []
      const sessionKey = `${subject.id}:${source.year}:${source.series}`
      const subjectWeighting = weightingSourcesBySessionSubject.get(sessionKey)
      const isSubjectWeightingApproved = subjectWeighting?.reviewStatus === 'approved'

      if (includeWeighting && !weightingManifestBySession.has(`${source.year}:${source.series}`)) {
        stageIssues.push({
          runId,
          severity: 'info',
          issueCode: 'weighting-session-uncovered',
          message: `No reviewed official weighting manifest covers ${source.series} ${source.year}; tokens remain unweighted.`,
          recordReference: { syllabus: source.syllabusCode, year: source.year, series: source.series },
        })
      }

      for (const row of combinationRows) {
        const routeType = row.section === 'as-level'
          ? 'as_only'
          : (row.section === 'a-level-staged' ? 'staged' : (row.section === 'a-level-linear' ? 'full_level' : 'other'))
        const qualificationLevel = row.section === 'as-level' ? 'as' : 'a_level'

        const tokens: StagedTokenParams[] = []
        for (let idx = 0; idx < row.components.length; idx++) {
          const c = row.components[idx]
          let tokenKind: StagedTokenParams['tokenKind'] = 'unresolved'
          if (c.kind === 'component_variant') tokenKind = 'component_variant'
          else if (c.kind === 'carry_forward') tokenKind = 'carry_forward'
          else if (c.kind === 'special') tokenKind = 'special'

          // Resolve stage strictly through explicit mappings; NO digit heuristics
          let stage: 'as' | 'a2' | null = null
          if (row.section === 'as-level') {
            stage = 'as'
          } else if (tokenKind === 'carry_forward') {
            stage = 'as'
          } else if (
            row.section === 'a-level-staged' &&
            tokenKind === 'component_variant'
          ) {
            stage = 'a2'
          } else if (
            row.section === 'a-level-linear' &&
            tokenKind === 'component_variant'
          ) {
            const paperNum = resolveStandardPaperNumber(source.syllabusCode, c.raw)
            const paper = paperNum !== null ? await persistence.getSubjectPaper(subject.id, paperNum) : null
            stage = paper?.defaultStage ?? null
          }

          // Real maximum mark: from variant if component_variant, or from weighting entry
          let maximumMark: number | null = null
          if (tokenKind === 'component_variant') {
            maximumMark = componentMaxMap.get(c.raw) ?? null
          }

          // Weighting link: evaluate STORED review_status strictly for matching session
          const weightingEntry = isSubjectWeightingApproved ? subjectWeighting?.entries.get(c.raw) : undefined
          let weightingFactor: number | null = null
          let weightingEntryId: string | null = null

          if (weightingEntry && isSubjectWeightingApproved) {
            if (
              weightingEntry.tokenKind === tokenKind &&
              (maximumMark === null || weightingEntry.rawMaximum === maximumMark)
            ) {
              weightingFactor = weightingEntry.officialWeightingFactor
              weightingEntryId = weightingEntry.id
              if (maximumMark === null) {
                maximumMark = weightingEntry.rawMaximum
              }
            }
          }

          tokens.push({
            tokenPosition: idx + 1,
            rawToken: c.raw,
            tokenKind,
            resolvedComponentVariantId: null,
            resolvedComponentCode: tokenKind === 'component_variant' ? c.raw : null,
            stage,
            maximumMark,
            weightingFactor,
            weightingEntryId,
            carryForwardMappingStatus: tokenKind === 'carry_forward' ? 'unreviewed' : null,
          })
        }

        stagedCombinations.push({
          canonicalKey: row.combination.replace(/\s+/g, ''),
          officialOptionLabel: row.combination,
          officialSourceLabel: row.source.reconstructedRow,
          qualificationLevel,
          routeType,
          maximumMark: row.maximumMark,
          weightingBasis: 'weighted_total',
          plannerEligibility: 'unreviewed', // Staged combinations default to unreviewed
          atlasRouteId: null,
          marks: Object.entries(row.thresholds)
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
            .map(([grade, thresholdMark]) => ({ grade, thresholdMark })),
          tokens,
        })
      }

      // Record any parse or validation issues
      for (const issue of parsedPub.validation.issues) {
        stageIssues.push({
          runId,
          issueCode: issue.code,
          severity: hasErrors ? 'error' : 'warning',
          message: issue.message,
          recordReference: { page: issue.page, row: issue.reconstructedRow },
        })
      }

      // Atomic publication bundle staging inside single database transaction (autoPublish withheld until batch completes cleanly)
      const bundle: StagedPublicationBundleParams = {
        publication: {
          runId,
          subjectId: subject.id,
          year: source.year,
          series: source.series,
          officialIndexUrl: source.indexUrl,
          officialPdfUrl: source.pdfUrl,
          sourceChecksumSha256: checksumSha256,
          revisionNumber,
          revisesPublicationId,
          parserVersion,
        },
        variants: stagedVariants,
        combinations: stagedCombinations,
        issues: stageIssues,
        autoPublish: false,
      }

      const stagedPubId = await persistence.stagePublicationBundle(bundle)

      const componentMarksCount = stagedVariants.reduce((sum, v) => sum + v.marks.length, 0)
      const combTokensCount = stagedCombinations.reduce((sum, c) => sum + c.tokens.length, 0)
      const combMarksCount = stagedCombinations.reduce((sum, c) => sum + c.marks.length, 0)
      completenessObservations.set(sourceKey, {
        subjectId: subject.id,
        publicationId: stagedPubId,
        revisionNumber,
        publicationStatus: 'staged',
        isActive: false,
        checksumSha256,
        sectionCounts: {
          component: componentRows.length,
          'a-level-linear': combinationRows.filter((c) => c.section === 'a-level-linear').length,
          'a-level-staged': combinationRows.filter((c) => c.section === 'a-level-staged').length,
          'as-level': combinationRows.filter((c) => c.section === 'as-level').length,
        },
        tableCounts: {
          componentVariants: stagedVariants.length,
          componentMarks: componentMarksCount,
          combinations: stagedCombinations.length,
          combinationTokens: combTokensCount,
          combinationMarks: combMarksCount,
          weightingEntries: subjectWeighting?.entries.size,
        },
        weightingReviewStatus: subjectWeighting?.reviewStatus,
        openErrorCount: hasErrors ? parsedPub.validation.issues.length : 0,
        issueCodes: parsedPub.validation.issues.map((i) => i.code),
      })

      if (hasErrors) {
        totalFailed += 1
        publications.push({
          syllabusCode: source.syllabusCode,
          year: source.year,
          series: source.series,
          status: 'failed',
          checksumSha256,
          revisionNumber,
          publicationId: stagedPubId,
          issues: parsedPub.validation.issues,
        })
      } else {
        totalStaged += 1
        const pubIndex = publications.length
        publications.push({
          syllabusCode: source.syllabusCode,
          year: source.year,
          series: source.series,
          status: 'staged',
          checksumSha256,
          revisionNumber,
          publicationId: stagedPubId,
          issues: [],
        })
        if (eligibleForAutoPublish) {
          pendingAutoPublishCandidates.push({ publicationId: stagedPubId, pubIndex })
        }
      }
    } catch (err) {
      totalFailed += 1
      const message = err instanceof Error ? err.message : String(err)
      publications.push({
        syllabusCode: source.syllabusCode,
        year: source.year,
        series: source.series,
        status: 'failed',
        checksumSha256: 'unknown',
        issues: [{ code: 'wrong-identity', message }],
      })
      await persistence.recordImportIssue({
        runId,
        issueCode: 'publication-staging-failed',
        severity: 'error',
        message: `Failed to stage publication: ${message}`,
        recordReference: { syllabus: source.syllabusCode, error: message },
      })
    }
  }

  // Fail closed on multi-source batches: never sequentially auto-publish across subjects.
  // Preserve single-source auto-publication when clean, and report activation errors accurately.
  const withheldMultiSourceIndices = new Set<number>()
  if (autoPublish && pendingAutoPublishCandidates.length > 0) {
    if (sources.length > 1) {
      for (const candidate of pendingAutoPublishCandidates) {
        withheldMultiSourceIndices.add(candidate.pubIndex)
      }
      await persistence.recordImportIssue({
        runId,
        issueCode:
          totalFailed === 0
            ? 'multi-source-review-required'
            : 'partial-failure-publication-withheld',
        severity: 'warning',
        message:
          totalFailed === 0
            ? 'Multi-source import batch staged validated subjects without sequential auto-publication; administrative review and activation are required.'
            : 'Withheld publication of staged datasets because one or more batch items failed validation or staging.',
        recordReference: {
          withheldPublicationIds: pendingAutoPublishCandidates.map((c) => c.publicationId),
        },
      })
    } else if (totalFailed > 0) {
      withheldMultiSourceIndices.add(pendingAutoPublishCandidates[0].pubIndex)
      await persistence.recordImportIssue({
        runId,
        issueCode: 'partial-failure-publication-withheld',
        severity: 'warning',
        message:
          'Withheld publication of staged dataset because one or more batch items failed validation or staging.',
        recordReference: {
          withheldPublicationIds: pendingAutoPublishCandidates.map((c) => c.publicationId),
        },
      })
    } else {
      const candidate = pendingAutoPublishCandidates[0]
      try {
        await persistence.publishPublication(candidate.publicationId)
        totalPublished += 1
        publications[candidate.pubIndex] = {
          ...publications[candidate.pubIndex],
          status: 'published',
        }
        const pub = publications[candidate.pubIndex]
        const sourceKey = `${pub.syllabusCode}:${pub.year}:${pub.series}`
        const obs = completenessObservations.get(sourceKey)
        if (obs) {
          completenessObservations.set(sourceKey, {
            ...obs,
            publicationStatus: 'published',
            isActive: true,
          })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        totalFailed += 1
        const existingPub = publications[candidate.pubIndex]
        publications[candidate.pubIndex] = {
          ...existingPub,
          status: 'failed',
          issues: [
            ...existingPub.issues,
            { code: 'publication-activation-failed', message },
          ],
        }
        const sourceKey = `${existingPub.syllabusCode}:${existingPub.year}:${existingPub.series}`
        const obs = completenessObservations.get(sourceKey)
        if (obs) {
          completenessObservations.set(sourceKey, {
            ...obs,
            publicationStatus: 'staged',
            isActive: false,
            openErrorCount: (obs.openErrorCount ?? 0) + 1,
            issueCodes: [...(obs.issueCodes ?? []), 'publication-activation-failed'],
          })
        }
        await persistence.recordImportIssue({
          runId,
          publicationId: candidate.publicationId,
          issueCode: 'publication-activation-failed',
          severity: 'error',
          message: `Failed to activate staged publication: ${message}`,
          recordReference: { publicationId: candidate.publicationId, error: message },
        })
      }
    }
  }

  const completenessInputs: SubjectCompletenessInput[] = sources.map((source, idx) => {
    const sourceKey = `${source.syllabusCode}:${source.year}:${source.series}`
    const pubAudit = publications.find(
      (p) => p.syllabusCode === source.syllabusCode && p.year === source.year && p.series === source.series,
    )
    const sessionManifest = weightingManifestBySession.get(`${source.year}:${source.series}`)
    const expectedWeightingRows = sessionManifest
      ? getExpectedWeightingRowsForSession(sessionManifest, source.year, source.series)[source.syllabusCode]
      : undefined
    const pubIndex = pubAudit ? publications.indexOf(pubAudit) : idx
    return {
      source,
      observed: completenessObservations.get(sourceKey) ?? null,
      invalid: pubAudit?.status === 'failed',
      awaitingMultiSourceReview: withheldMultiSourceIndices.has(pubIndex),
      weightingCovered: !includeWeighting || Boolean(sessionManifest),
      reviewRequired:
        (pubAudit?.status === 'staged' &&
          ((pubAudit.revisionNumber ?? 1) > 1 || withheldMultiSourceIndices.has(pubIndex))) ||
        (pubAudit?.status === 'staged' && !autoPublish && sources.length > 1),
      issueCodes: pubAudit?.issues.map((i) => i.code),
      expectedWeightingEntries: expectedWeightingRows,
    }
  })
  const completenessReport = buildGradeThresholdCompletenessReport(completenessInputs)

  const awaitingReview =
    publications.some((p) => p.status === 'staged') ||
    withheldMultiSourceIndices.size > 0 ||
    completenessReport.totalsByState.staged > 0 ||
    completenessReport.totalsByState.review_required > 0

  const completedAt = new Date().toISOString()
  const overallStatus =
    totalFailed === 0
      ? 'succeeded'
      : totalPublished > 0 || totalStaged > 0
        ? 'partial'
        : 'failed'

  const publicationDisposition: ImportPipelineResult['publicationDisposition'] =
    totalFailed > 0 && totalStaged === 0 && totalPublished === 0
      ? 'failed'
      : awaitingReview
        ? 'review_required'
        : totalPublished > 0 && totalFailed === 0
          ? 'published'
          : totalFailed > 0
            ? 'failed'
            : 'unchanged'

  const stats = {
    totalDiscovered,
    totalStaged,
    totalPublished,
    totalDuplicate,
    totalFailed,
  }

  await persistence.updateImportRun(runId, {
    status: overallStatus,
    aggregateSummary: {
      stats,
      publications,
      weighting: weightingAudit,
      awaitingReview,
      publicationDisposition,
      completenessReport,
    },
    finishedAt: completedAt,
  })

  return {
    runId,
    status: overallStatus,
    startedAt,
    completedAt,
    stats,
    weighting: weightingAudit,
    publications,
    awaitingReview,
    publicationDisposition,
    completenessReport,
  }
}
