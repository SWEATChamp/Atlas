import { describe, expect, test, vi } from 'vitest'
import {
  handleScheduledGradeThresholdRequest,
  runScheduledGradeThresholdImport,
  verifyCronAuthorization,
  type GradeThresholdPersistence,
  type ImportPipelineResult,
} from '../lib/grade-thresholds/server'
import { sha256Hex, type CambridgeThresholdSource } from '../lib/grade-thresholds'

const CRON_SECRET = 'atlas-cron-secret-for-tests'
const PDF_BYTES = new TextEncoder().encode('%PDF-1.5 scheduled import fixture')
const SOURCE: CambridgeThresholdSource = {
  syllabusCode: '9709',
  syllabusName: 'Mathematics',
  qualificationTitle: 'Cambridge International AS & A Level Mathematics (9709)',
  year: 2026,
  series: 'june',
  indexUrl: 'https://www.cambridgeinternational.org/example-index',
  pdfUrl: 'https://www.cambridgeinternational.org/Images/example.pdf',
  expectedChecksumSha256: sha256Hex(PDF_BYTES),
  expectedIdentityLines: [],
  carryForwardTokens: [],
  carryForwardTokenBasis: 'reviewed-structural-mapping',
  expectedStructure: {
    pageCount: 1,
    rowCounts: {
      component: 0,
      'a-level-linear': 0,
      'a-level-staged': 0,
      'as-level': 0,
    },
  },
  goldenFixtures: [],
}

function createPersistence(params?: {
  publicationStatus?: 'published' | 'staged' | null
}) {
  const checksum = sha256Hex(PDF_BYTES)
  const publicationStatus =
    params && 'publicationStatus' in params
      ? params.publicationStatus
      : 'published'

  return {
    createImportRun: vi.fn(),
    updateImportRun: vi.fn(),
    getSubjectBySyllabus: vi.fn(async () => ({
      id: 'subject-9709',
      syllabusCode: '9709',
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

function pipelineResult(
  status: ImportPipelineResult['status'],
): ImportPipelineResult {
  return {
    runId: 'run-1',
    status,
    startedAt: '2026-09-11T12:00:00.000Z',
    completedAt: '2026-09-11T12:00:01.000Z',
    stats: {
      totalDiscovered: 1,
      totalStaged: status === 'succeeded' ? 1 : 0,
      totalPublished: 0,
      totalDuplicate: 0,
      totalFailed: status === 'succeeded' ? 0 : 1,
    },
    publications: [
      {
        syllabusCode: '9709',
        year: 2026,
        series: 'june',
        status: status === 'succeeded' ? 'staged' : 'failed',
        checksumSha256: sha256Hex(PDF_BYTES),
        revisionNumber: 2,
        publicationId: 'publication-2',
        issues:
          status === 'succeeded'
            ? []
            : [{ code: 'checksum-mismatch', message: 'sensitive detail omitted' }],
      },
    ],
  }
}

describe('scheduled grade-threshold import boundary', () => {
  test('fails closed when CRON_SECRET is missing, short, or incorrect', () => {
    expect(verifyCronAuthorization(null, undefined)).toBe('misconfigured')
    expect(verifyCronAuthorization('Bearer short', 'short')).toBe('misconfigured')
    expect(verifyCronAuthorization('Bearer incorrect-secret-value', CRON_SECRET)).toBe(
      'unauthorized',
    )
    expect(verifyCronAuthorization(`Bearer ${CRON_SECRET}`, CRON_SECRET)).toBe(
      'authorized',
    )
  })

  test('does not execute any work for an unauthorized request', async () => {
    const execute = vi.fn()
    const response = await handleScheduledGradeThresholdRequest(
      new Request('https://atlas.example/api/cron/grade-thresholds'),
      { cronSecret: CRON_SECRET, execute },
    )

    expect(response.status).toBe(401)
    expect(execute).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'unauthorized',
    })
  })

  test('returns a true no-change result without creating an import run', async () => {
    const persistence = createPersistence()
    const runPipeline = vi.fn()
    const downloadPdf = vi.fn(async () => ({
      bytes: PDF_BYTES,
      contentType: 'application/pdf',
    }))

    const report = await runScheduledGradeThresholdImport({
      persistence,
      sources: [SOURCE],
      includeWeighting: false,
      downloadPdf,
      runPipeline,
      now: () => new Date('2026-09-11T12:00:00.000Z'),
    })

    expect(report).toMatchObject({
      ok: true,
      outcome: 'no_change',
      checkedAt: '2026-09-11T12:00:00.000Z',
      sourceChecks: [{ syllabusCode: '9709', status: 'unchanged' }],
    })
    expect(runPipeline).not.toHaveBeenCalled()
    expect(persistence.createImportRun).not.toHaveBeenCalled()
  })

  test('requires review when Cambridge bytes drift from the configured manifest', async () => {
    const persistence = createPersistence()
    const runPipeline = vi.fn()
    const sourceWithStaleManifest = {
      ...SOURCE,
      expectedChecksumSha256: '0'.repeat(64),
    }

    const report = await runScheduledGradeThresholdImport({
      persistence,
      sources: [sourceWithStaleManifest],
      includeWeighting: false,
      downloadPdf: async () => ({
        bytes: PDF_BYTES,
        contentType: 'application/pdf',
      }),
      runPipeline,
    })

    expect(report.outcome).toBe('review_required')
    expect(report.sourceChecks[0].status).toBe('pending_review')
    expect(runPipeline).not.toHaveBeenCalled()
  })

  test('treats an approved weighting source as unchanged and reuses its download', async () => {
    const persistence = createPersistence()
    vi.mocked(persistence.getWeightingSource).mockResolvedValue({
      id: 'weighting-source-1',
      reviewStatus: 'approved',
      entries: new Map(),
    })
    const runPipeline = vi.fn()
    const downloadPdf = vi.fn(async () => ({
      bytes: PDF_BYTES,
      contentType: 'application/pdf',
    }))

    const report = await runScheduledGradeThresholdImport({
      persistence,
      sources: [SOURCE],
      weightingSource: {
        title: 'Test weighting source',
        pdfUrl: SOURCE.pdfUrl,
        expectedChecksumSha256: sha256Hex(PDF_BYTES),
        expectedPageCount: 1,
        createdOn: '2026-09-11',
        coveredSeries: ['june-2026'],
        june2026ExpectedRows: { '9709': 0 },
        june2026GoldenFactors: [],
      },
      downloadPdf,
      runPipeline,
    })

    expect(report.outcome).toBe('no_change')
    expect(report.weightingCheck).toMatchObject({
      status: 'unchanged',
      reviewedSubjects: 1,
      pendingSubjects: 0,
      missingSubjects: 0,
    })
    expect(downloadPdf).toHaveBeenCalledTimes(1)
    expect(runPipeline).not.toHaveBeenCalled()
  })

  test('reports an existing staged revision without importing it again', async () => {
    const persistence = createPersistence({ publicationStatus: 'staged' })
    const runPipeline = vi.fn()

    const report = await runScheduledGradeThresholdImport({
      persistence,
      sources: [SOURCE],
      includeWeighting: false,
      downloadPdf: async () => ({
        bytes: PDF_BYTES,
        contentType: 'application/pdf',
      }),
      runPipeline,
    })

    expect(report.outcome).toBe('review_required')
    expect(report.sourceChecks[0].status).toBe('pending_review')
    expect(runPipeline).not.toHaveBeenCalled()
  })

  test('stages a newly detected checksum with auto-publication disabled', async () => {
    const persistence = createPersistence({ publicationStatus: null })
    const downloadPdf = vi.fn(async () => ({
      bytes: PDF_BYTES,
      contentType: 'application/pdf',
    }))
    const runPipeline = vi.fn(async (options) => {
      await options.downloadPdf?.(SOURCE.pdfUrl)
      expect(options.autoPublish).toBe(false)
      expect(options.triggerKind).toBe('scheduled')
      return pipelineResult('succeeded')
    })

    const report = await runScheduledGradeThresholdImport({
      persistence,
      sources: [SOURCE],
      includeWeighting: false,
      downloadPdf,
      runPipeline,
    })

    expect(report.ok).toBe(true)
    expect(report.outcome).toBe('review_required')
    expect(report.importAudit?.runId).toBe('run-1')
    expect(downloadPdf).toHaveBeenCalledTimes(1)
  })

  test('returns only sanitized issue codes when an import fails', async () => {
    const persistence = createPersistence({ publicationStatus: null })
    const report = await runScheduledGradeThresholdImport({
      persistence,
      sources: [SOURCE],
      includeWeighting: false,
      downloadPdf: async () => ({
        bytes: PDF_BYTES,
        contentType: 'application/pdf',
      }),
      runPipeline: async () => pipelineResult('failed'),
    })

    expect(report.ok).toBe(false)
    expect(report.outcome).toBe('failed')
    expect(report.importAudit?.publications[0].issueCodes).toEqual([
      'checksum-mismatch',
    ])
    expect(JSON.stringify(report)).not.toContain('sensitive detail omitted')
  })

  test('maps a review-required report to HTTP 202 with no-store headers', async () => {
    const response = await handleScheduledGradeThresholdRequest(
      new Request('https://atlas.example/api/cron/grade-thresholds', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
      {
        cronSecret: CRON_SECRET,
        execute: async () => ({
          ok: true,
          outcome: 'review_required',
          checkedAt: '2026-09-11T12:00:00.000Z',
          sourceChecks: [],
        }),
      },
    )

    expect(response.status).toBe(202)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })
})
