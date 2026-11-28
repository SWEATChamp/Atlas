import { describe, expect, test, vi } from 'vitest'
import {
  CAMBRIDGE_JUNE_2026_SOURCES,
  CAMBRIDGE_THRESHOLD_SOURCES,
  CAMBRIDGE_WEIGHTING_SOURCE,
  buildGradeThresholdCompletenessReport,
  formatWeightingSeriesKey,
  formatWeightingSeriesLabel,
  getExpectedWeightingRowsForSession,
  inspectConfiguredThresholdSources,
  isWeightingManifestCoveringSession,
  parseCambridgeWeightingItems,
  parseCambridgeWeightingPdf,
  runGradeThresholdImportPipeline,
  sha256Hex,
  validateWeightingManifest,
  type CambridgeSeries,
  type CambridgeThresholdSource,
  type CambridgeWeightingSourceManifest,
  type CreateImportRunParams,
  type ExistingPublicationInfo,
  type GradeThresholdPersistence,
  type ObservedPublicationCounts,
  type PdfExtraction,
  type PdfTextItem,
  type RecordImportIssueParams,
  type StageWeightingSourceParams,
  type StagedCombinationParams,
  type StagedPublicationBundleParams,
  type StagedVariantParams,
  type UpdateImportRunParams,
  type WeightingEntryInfo,
  type WeightingSourceInfo,
} from '../lib/grade-thresholds'
import { runGradeThresholdDiscovery } from '../lib/grade-thresholds/discovery-runner'
import { runScheduledGradeThresholdImport } from '../lib/grade-thresholds/scheduled-import'
import { CambridgeFetchError } from '../lib/grade-thresholds/publication-discovery'
import {
  createSyntheticWeightingExtraction,
  validCoordinateExtraction,
} from './fixtures/grade-threshold-coordinates'

const VALID_PDF_BYTES = new TextEncoder().encode('%PDF-1.5 completeness regression bytes')
const VALID_CHECKSUM = sha256Hex(VALID_PDF_BYTES)

const line = (page: number, y: number, tokens: readonly string[]): PdfTextItem[] =>
  tokens.map((text, index) => ({ page, text, x: 40 + index * 70, y, width: 60, height: 10 }))

function makeSyntheticSource(
  syllabusCode: string,
  syllabusName: string,
  year: number,
  series: CambridgeSeries,
  componentCount: number = 2,
  checksum: string = VALID_CHECKSUM,
): CambridgeThresholdSource {
  const cap = series.charAt(0).toUpperCase() + series.slice(1)
  return {
    syllabusCode,
    syllabusName,
    qualificationTitle: `Cambridge International AS & A Level ${syllabusName} (${syllabusCode})`,
    year,
    series,
    indexUrl: `https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-level/grade-threshold-tables/${series}-${year}/`,
    pdfUrl: `https://www.cambridgeinternational.org/Images/${syllabusCode}-${series}-${year}.pdf`,
    expectedChecksumSha256: checksum,
    expectedIdentityLines: [
      `Grade thresholds – ${cap} ${year}`,
      `Cambridge International AS & A Level ${syllabusName} (${syllabusCode})`,
    ],
    carryForwardTokens: [],
    carryForwardTokenBasis: 'reviewed-structural-mapping',
    expectedStructure: {
      pageCount: 1,
      rowCounts: {
        component: componentCount,
        'a-level-linear': 1,
        'a-level-staged': 1,
        'as-level': 1,
      },
      expectedTokenCount: 5,
    },
    goldenFixtures: [
      {
        kind: 'component',
        component: '12',
        maximumMark: 75,
        thresholds: { A: 60, B: 52, C: 44, D: 36, E: 28 },
      },
      {
        kind: 'combination',
        section: 'as-level',
        combination: '12, 22',
        maximumMark: 125,
        thresholds: { a: 100, b: 87, c: 74, d: 61, e: 48 },
      },
    ],
  }
}

function makeExtractionForSession(
  syllabusCode: string,
  syllabusName: string,
  year: number,
  series: CambridgeSeries,
  extraComponents: Array<{ component: string; max: number }> = [],
): PdfExtraction {
  const cap = series.charAt(0).toUpperCase() + series.slice(1)
  const items: PdfTextItem[] = [
    ...line(1, 780, [`Grade thresholds – ${cap} ${year}`]),
    ...line(1, 760, [`Cambridge International AS & A Level ${syllabusName} (${syllabusCode})`]),
    ...line(1, 740, ['Component grade thresholds']),
    ...line(1, 720, ['Component', 'Maximum raw', 'mark A B C D E']),
    ...line(1, 700, ['Component', '12', '75', '60', '52', '44', '36', '28']),
    ...line(1, 680, ['Component', '22', '50', '40', '35', '30', '25', '20']),
  ]

  let nextY = 660
  for (const extra of extraComponents) {
    items.push(...line(1, nextY, ['Component', extra.component, String(extra.max), '45', '38', '31', '24', '17']))
    nextY -= 20
  }

  items.push(
    ...line(1, nextY - 20, ['Cambridge International A Level (linear assessment)']),
    ...line(1, nextY - 40, ['Combination of', 'components', 'Maximum weighted', 'mark', 'A* A B C D E']),
    ...line(1, nextY - 60, ['12, 22', '125', '110', '100', '87', '74', '61', '48']),
    ...line(1, nextY - 80, ['Cambridge International A Level (staged assessment)']),
    ...line(1, nextY - 100, ['Combination of', 'components', 'Maximum weighted', 'mark', 'A* A B C D E']),
    ...line(1, nextY - 120, ['22', '125', '110', '100', '87', '74', '61', '48']),
    ...line(1, nextY - 140, ['Cambridge International AS Level']),
    ...line(1, nextY - 160, ['Combination of', 'components', 'Maximum weighted', 'mark', 'a b c d e']),
    ...line(1, nextY - 180, ['12, 22', '125', '100', '87', '74', '61', '48']),
  )

  return { pageCount: 1, items }
}

class RegressionPersistence implements GradeThresholdPersistence {
  runs: Array<{ id: string; triggerKind: string; status: string; aggregateSummary: Record<string, unknown> }> = []
  publications: Array<{
    id: string
    runId: string
    subjectId: string
    year: number
    series: CambridgeSeries
    checksumSha256: string
    revisionNumber: number
    revisesPublicationId?: string
    publicationStatus: string
    isActive: boolean
  }> = []
  variants: Array<{ id: string; publicationId: string; params: StagedVariantParams }> = []
  combinations: Array<{ id: string; publicationId: string; params: StagedCombinationParams }> = []
  weightingSources: Array<{
    id: string
    subjectId: string
    year: number
    series: CambridgeSeries
    checksumSha256: string
    reviewStatus: string
    reviewedBy?: string | null
    reviewedAt?: string | null
    entries: Map<string, WeightingEntryInfo>
  }> = []
  issues: RecordImportIssueParams[] = []
  observedOverrides = new Map<string, ObservedPublicationCounts>()

  subjects = new Map([
    ['9709', { id: 'subj-9709', syllabusCode: '9709' }],
    ['9231', { id: 'subj-9231', syllabusCode: '9231' }],
    ['9702', { id: 'subj-9702', syllabusCode: '9702' }],
    ['9701', { id: 'subj-9701', syllabusCode: '9701' }],
    ['9618', { id: 'subj-9618', syllabusCode: '9618' }],
    ['0000', { id: 'subj-0000', syllabusCode: '0000' }],
  ])

  papers = new Map<string, Array<{ id: string; paperNumber: number; defaultStage: 'as' | 'a2' }>>([
    ['subj-9709', [
      { id: 'sp-9709-1', paperNumber: 1, defaultStage: 'as' },
      { id: 'sp-9709-2', paperNumber: 2, defaultStage: 'as' },
      { id: 'sp-9709-3', paperNumber: 3, defaultStage: 'a2' },
      { id: 'sp-9709-4', paperNumber: 4, defaultStage: 'a2' },
      { id: 'sp-9709-5', paperNumber: 5, defaultStage: 'as' },
      { id: 'sp-9709-6', paperNumber: 6, defaultStage: 'a2' },
    ]],
    ['subj-9231', [
      { id: 'sp-9231-1', paperNumber: 1, defaultStage: 'as' },
      { id: 'sp-9231-2', paperNumber: 2, defaultStage: 'a2' },
      { id: 'sp-9231-3', paperNumber: 3, defaultStage: 'as' },
      { id: 'sp-9231-4', paperNumber: 4, defaultStage: 'a2' },
    ]],
    ['subj-9702', [
      { id: 'sp-9702-1', paperNumber: 1, defaultStage: 'as' },
      { id: 'sp-9702-2', paperNumber: 2, defaultStage: 'as' },
      { id: 'sp-9702-3', paperNumber: 3, defaultStage: 'as' },
      { id: 'sp-9702-4', paperNumber: 4, defaultStage: 'a2' },
      { id: 'sp-9702-5', paperNumber: 5, defaultStage: 'a2' },
    ]],
    ['subj-9701', [
      { id: 'sp-9701-1', paperNumber: 1, defaultStage: 'as' },
      { id: 'sp-9701-2', paperNumber: 2, defaultStage: 'as' },
      { id: 'sp-9701-3', paperNumber: 3, defaultStage: 'as' },
      { id: 'sp-9701-4', paperNumber: 4, defaultStage: 'a2' },
      { id: 'sp-9701-5', paperNumber: 5, defaultStage: 'a2' },
    ]],
    ['subj-9618', [
      { id: 'sp-9618-1', paperNumber: 1, defaultStage: 'as' },
      { id: 'sp-9618-2', paperNumber: 2, defaultStage: 'as' },
      { id: 'sp-9618-3', paperNumber: 3, defaultStage: 'a2' },
      { id: 'sp-9618-4', paperNumber: 4, defaultStage: 'a2' },
    ]],
    ['subj-0000', [
      { id: 'sp-0-1', paperNumber: 1, defaultStage: 'as' },
      { id: 'sp-0-2', paperNumber: 2, defaultStage: 'as' },
    ]],
  ])

  async createImportRun(params: CreateImportRunParams): Promise<string> {
    const id = `run-${this.runs.length + 1}`
    this.runs.push({ id, triggerKind: params.triggerKind, status: 'running', aggregateSummary: {} })
    return id
  }

  async updateImportRun(runId: string, params: UpdateImportRunParams): Promise<void> {
    const run = this.runs.find((r) => r.id === runId)
    if (run) {
      run.status = params.status
      run.aggregateSummary = params.aggregateSummary
    }
  }

  async getSubjectBySyllabus(syllabusCode: string) {
    return this.subjects.get(syllabusCode) ?? null
  }

  async getSubjectPaper(subjectId: string, paperNumber: number) {
    return this.papers.get(subjectId)?.find((p) => p.paperNumber === paperNumber) ?? null
  }

  async getActivePublication(subjectId: string, year: number, series: CambridgeSeries): Promise<ExistingPublicationInfo | null> {
    const pub = this.publications.find((p) => p.subjectId === subjectId && p.year === year && p.series === series && p.isActive)
    return pub ? { id: pub.id, revisionNumber: pub.revisionNumber, checksumSha256: pub.checksumSha256, publicationStatus: pub.publicationStatus, isActive: pub.isActive } : null
  }

  async getLatestPublication(subjectId: string, year: number, series: CambridgeSeries): Promise<ExistingPublicationInfo | null> {
    const pubs = this.publications.filter((p) => p.subjectId === subjectId && p.year === year && p.series === series)
    if (pubs.length === 0) return null
    const latest = [...pubs].sort((a, b) => b.revisionNumber - a.revisionNumber)[0]
    return { id: latest.id, revisionNumber: latest.revisionNumber, checksumSha256: latest.checksumSha256, publicationStatus: latest.publicationStatus, isActive: latest.isActive }
  }

  async findPublicationByChecksum(subjectId: string, year: number, series: CambridgeSeries, checksumSha256: string): Promise<ExistingPublicationInfo | null> {
    const pub = this.publications.find((p) => p.subjectId === subjectId && p.year === year && p.series === series && p.checksumSha256 === checksumSha256)
    return pub ? { id: pub.id, revisionNumber: pub.revisionNumber, checksumSha256: pub.checksumSha256, publicationStatus: pub.publicationStatus, isActive: pub.isActive } : null
  }

  async stagePublicationBundle(bundle: StagedPublicationBundleParams): Promise<string> {
    const id = `pub-${this.publications.length + 1}`
    this.publications.push({
      id,
      runId: bundle.publication.runId,
      subjectId: bundle.publication.subjectId,
      year: bundle.publication.year,
      series: bundle.publication.series,
      checksumSha256: bundle.publication.sourceChecksumSha256,
      revisionNumber: bundle.publication.revisionNumber,
      revisesPublicationId: bundle.publication.revisesPublicationId ?? undefined,
      publicationStatus: bundle.autoPublish ? 'published' : 'staged',
      isActive: Boolean(bundle.autoPublish),
    })
    for (const v of bundle.variants) {
      this.variants.push({ id: `var-${this.variants.length + 1}`, publicationId: id, params: v })
    }
    for (const c of bundle.combinations) {
      this.combinations.push({ id: `comb-${this.combinations.length + 1}`, publicationId: id, params: c })
    }
    for (const issue of bundle.issues) {
      this.issues.push({ ...issue, publicationId: id })
    }
    return id
  }

  async getWeightingSource(subjectId: string, year: number, series: CambridgeSeries, checksumSha256: string): Promise<WeightingSourceInfo | null> {
    const ws = this.weightingSources.find((w) => w.subjectId === subjectId && w.year === year && w.series === series && w.checksumSha256 === checksumSha256)
    return ws ? { id: ws.id, reviewStatus: ws.reviewStatus, entries: ws.entries } : null
  }

  async stageWeightingSource(params: StageWeightingSourceParams): Promise<WeightingSourceInfo> {
    const id = `ws-${this.weightingSources.length + 1}`
    const entries = new Map<string, WeightingEntryInfo>()
    for (const e of params.entries) {
      entries.set(e.rawToken, {
        id: `we-${entries.size + 1}`,
        rawToken: e.rawToken,
        tokenKind: e.tokenKind,
        rawMaximum: e.rawMaximum,
        weightedMaximum: e.weightedMaximum,
        officialWeightingFactor: e.officialWeightingFactor,
        sourcePage: e.sourcePage,
      })
    }
    this.weightingSources.push({
      id,
      subjectId: params.subjectId,
      year: params.documentYear,
      series: params.examSeries,
      checksumSha256: params.sourceChecksumSha256,
      reviewStatus: 'unreviewed',
      entries,
    })
    return { id, reviewStatus: 'unreviewed', entries }
  }

  async approveWeightingSource(sourceId: string, reviewedBy: string, reviewedAt?: string): Promise<string> {
    const ws = this.weightingSources.find((w) => w.id === sourceId)
    if (ws) {
      ws.reviewStatus = 'approved'
      ws.reviewedBy = reviewedBy
      ws.reviewedAt = reviewedAt ?? new Date().toISOString()
    }
    return sourceId
  }

  async recordImportIssue(issue: RecordImportIssueParams): Promise<void> {
    this.issues.push(issue)
  }

  async publishPublication(publicationId: string): Promise<string> {
    const pub = this.publications.find((p) => p.id === publicationId)
    if (!pub) return publicationId
    for (const other of this.publications) {
      if (other.subjectId === pub.subjectId && other.year === pub.year && other.series === pub.series) {
        other.isActive = false
      }
    }
    pub.publicationStatus = 'published'
    pub.isActive = true
    return publicationId
  }

  async inspectPublicationCompleteness(
    syllabusCode: string,
    year: number,
    series: CambridgeSeries,
  ): Promise<ObservedPublicationCounts | null> {
    return this.observedOverrides.get(`${syllabusCode}:${year}:${series}`) ?? null
  }
}

describe('June 2026 five-subject threshold completeness & monitoring hardening', () => {
  test('June 2026 manifest reconciles all five MVP subjects and exact structural expectations', () => {
    expect(CAMBRIDGE_JUNE_2026_SOURCES).toHaveLength(5)
    expect(CAMBRIDGE_THRESHOLD_SOURCES).toHaveLength(5)

    const byCode = Object.fromEntries(
      CAMBRIDGE_JUNE_2026_SOURCES.map((s) => [s.syllabusCode, s.expectedStructure]),
    )

    expect(byCode['9709']?.rowCounts).toEqual({
      component: 30,
      'a-level-linear': 10,
      'a-level-staged': 27,
      'as-level': 15,
    })
    expect(byCode['9709']?.expectedTokenCount).toBe(141)

    expect(byCode['9231']?.rowCounts).toEqual({
      component: 20,
      'a-level-linear': 5,
      'a-level-staged': 26,
      'as-level': 10,
    })
    expect(byCode['9231']?.expectedTokenCount).toBe(112)

    expect(byCode['9702']?.rowCounts).toEqual({
      component: 25,
      'a-level-linear': 8,
      'a-level-staged': 20,
      'as-level': 8,
    })
    expect(byCode['9702']?.expectedTokenCount).toBe(118)

    expect(byCode['9701']?.rowCounts).toEqual({
      component: 25,
      'a-level-linear': 8,
      'a-level-staged': 20,
      'as-level': 8,
    })
    expect(byCode['9701']?.expectedTokenCount).toBe(118)

    expect(byCode['9618']?.rowCounts).toEqual({
      component: 14,
      'a-level-linear': 4,
      'a-level-staged': 11,
      'as-level': 4,
    })
    expect(byCode['9618']?.expectedTokenCount).toBe(53)

    const totalVariants = Object.values(byCode).reduce((sum, e) => sum + e.rowCounts.component, 0)
    const totalCombos = Object.values(byCode).reduce(
      (sum, e) => sum + e.rowCounts['a-level-linear'] + e.rowCounts['a-level-staged'] + e.rowCounts['as-level'],
      0,
    )
    const totalTokens = Object.values(byCode).reduce((sum, e) => sum + (e.expectedTokenCount ?? 0), 0)
    expect(totalVariants).toBe(114)
    expect(totalCombos).toBe(184)
    expect(totalTokens).toBe(542)
  })

  test('guards non-standard components (50/51/58/59/60/61/68/69) against false subjectPaperId linkage', async () => {
    const persistence = new RegressionPersistence()
    const fmSource = makeSyntheticSource('9231', 'Further Mathematics', 2026, 'june', 6)

    const result = await runGradeThresholdImportPipeline({
      persistence,
      sources: [fmSource],
      includeWeighting: false,
      downloadPdf: async () => ({ bytes: VALID_PDF_BYTES, contentType: 'application/pdf' }),
      extractPdfText: async () =>
        makeExtractionForSession('9231', 'Further Mathematics', 2026, 'june', [
          { component: '50', max: 75 },
          { component: '51', max: 75 },
          { component: '60', max: 75 },
          { component: '61', max: 75 },
        ]),
    })

    expect(result.status).toBe('succeeded')
    const byComp = Object.fromEntries(
      persistence.variants.map((v) => [v.params.componentCode, v.params.subjectPaperId]),
    )
    expect(byComp['12']).toBe('sp-9231-1')
    expect(byComp['22']).toBe('sp-9231-2')
    expect(byComp['50']).toBeNull()
    expect(byComp['51']).toBeNull()
    expect(byComp['60']).toBeNull()
    expect(byComp['61']).toBeNull()

    // In 9709 Mathematics, Paper 51 IS standard Paper 5 while 50/58/59/60/68/69 are special.
    const mathPersistence = new RegressionPersistence()
    const mathSource = makeSyntheticSource('9709', 'Mathematics', 2026, 'june', 5)
    const mathResult = await runGradeThresholdImportPipeline({
      persistence: mathPersistence,
      sources: [mathSource],
      includeWeighting: false,
      downloadPdf: async () => ({ bytes: VALID_PDF_BYTES, contentType: 'application/pdf' }),
      extractPdfText: async () =>
        makeExtractionForSession('9709', 'Mathematics', 2026, 'june', [
          { component: '51', max: 50 },
          { component: '58', max: 75 },
          { component: '69', max: 75 },
        ]),
    })
    expect(mathResult.status).toBe('succeeded')
    const mathByComp = Object.fromEntries(
      mathPersistence.variants.map((v) => [v.params.componentCode, v.params.subjectPaperId]),
    )
    expect(mathByComp['51']).toBe('sp-9709-5')
    expect(mathByComp['58']).toBeNull()
    expect(mathByComp['69']).toBeNull()
  })

  test('withholds batch autoPublish when any subject in the batch fails validation (no mixed published state)', async () => {
    const persistence = new RegressionPersistence()
    const goodSource = makeSyntheticSource('9709', 'Mathematics', 2026, 'june', 2)
    const badSource = makeSyntheticSource('9618', 'Computer Science', 2026, 'june', 2, '0'.repeat(64))

    const result = await runGradeThresholdImportPipeline({
      persistence,
      sources: [goodSource, badSource],
      includeWeighting: false,
      autoPublish: true,
      downloadPdf: async () => ({ bytes: VALID_PDF_BYTES, contentType: 'application/pdf' }),
      extractPdfText: async () => makeExtractionForSession('9709', 'Mathematics', 2026, 'june'),
    })

    expect(result.status).toBe('partial')
    expect(result.stats.totalStaged).toBe(1)
    expect(result.stats.totalFailed).toBe(1)
    expect(result.stats.totalPublished).toBe(0)
    expect(persistence.publications[0]?.publicationStatus).toBe('staged')
    expect(persistence.publications[0]?.isActive).toBe(false)
    expect(
      persistence.issues.some((i) => i.issueCode === 'partial-failure-publication-withheld'),
    ).toBe(true)
    expect(result.completenessReport?.overallStatus).toBe('incomplete')
  })

  test('session-aware weighting never applies June 2026 manifest to future November 2026 thresholds', async () => {
    expect(formatWeightingSeriesKey(2026, 'june')).toBe('june-2026')
    expect(formatWeightingSeriesLabel(2026, 'november')).toBe('November 2026')
    expect(isWeightingManifestCoveringSession(CAMBRIDGE_WEIGHTING_SOURCE, 2026, 'june')).toBe(true)
    expect(isWeightingManifestCoveringSession(CAMBRIDGE_WEIGHTING_SOURCE, 2026, 'november')).toBe(false)
    expect(getExpectedWeightingRowsForSession(CAMBRIDGE_WEIGHTING_SOURCE, 2026, 'november')).toEqual({})

    const novSource = makeSyntheticSource('0000', 'Synthetic', 2026, 'november', 2, VALID_CHECKSUM)
    const novExtraction = makeExtractionForSession('0000', 'Synthetic', 2026, 'november')
    const juneExtraction = validCoordinateExtraction()
    void juneExtraction

    // Direct parseCambridgeWeightingPdf targeting November 2026 MUST fail identity check on June 2026 manifest
    const wBytes = new TextEncoder().encode('%PDF-1.5 weighting nov test')
    const wChecksum = sha256Hex(wBytes)
    const novParse = await parseCambridgeWeightingPdf(
      wBytes,
      'application/pdf',
      async () => createSyntheticWeightingExtraction(),
      wChecksum,
      { targetSession: { year: 2026, series: 'november' } },
    )
    expect(novParse.validation.status).toBe('invalid')
    expect(novParse.validation.issues.some((i) => i.code === 'wrong-identity')).toBe(true)

    // Import pipeline running November 2026 skips June 2026 weighting without borrowing or linking it
    const persistence = new RegressionPersistence()
    persistence.weightingSources.push({
      id: 'ws-june-approved',
      subjectId: 'subj-0000',
      year: 2026,
      series: 'june',
      checksumSha256: CAMBRIDGE_WEIGHTING_SOURCE.expectedChecksumSha256,
      reviewStatus: 'approved',
      reviewedBy: 'admin@atlas.edu',
      reviewedAt: '2026-08-01T00:00:00Z',
      entries: new Map([
        ['12', { id: 'e12', rawToken: '12', tokenKind: 'component_variant', rawMaximum: 75, weightedMaximum: 75, officialWeightingFactor: 1, sourcePage: 1 }],
      ]),
    })

    const downloadPdf = vi.fn(async (url: string) => {
      expect(url).not.toContain('206341-syllabus-component-weighting-factors')
      return { bytes: VALID_PDF_BYTES, contentType: 'application/pdf' }
    })

    const importRes = await runGradeThresholdImportPipeline({
      persistence,
      sources: [novSource],
      includeWeighting: true,
      downloadPdf,
      extractPdfText: async () => novExtraction,
    })

    expect(importRes.status).toBe('succeeded')
    expect(persistence.combinations[0]?.params.tokens.every((t) => t.weightingFactor === null)).toBe(true)
    expect(persistence.issues.some((i) => i.issueCode === 'weighting-session-uncovered')).toBe(true)

    // Scheduled import check with published November 2026 source must mark weighting uncovered without June mismatch noise
    for (const pub of persistence.publications) {
      pub.publicationStatus = 'published'
      pub.isActive = true
    }
    const scheduledDownload = vi.fn(async (url: string) => {
      expect(url).not.toContain('206341-syllabus-component-weighting-factors')
      return { bytes: VALID_PDF_BYTES, contentType: 'application/pdf' }
    })
    const scheduled = await runScheduledGradeThresholdImport({
      persistence,
      sources: [novSource],
      includeWeighting: true,
      downloadPdf: scheduledDownload,
    })
    expect(scheduled.ok).toBe(true)
    expect(scheduled.outcome).toBe('no_change')
    expect(scheduled.weightingCheck).toBeUndefined()
    expect(scheduledDownload).toHaveBeenCalledTimes(1)

    // Future threshold session without weighting data MUST surface review_required / unavailable allocation in completenessReport
    const futureReport = buildGradeThresholdCompletenessReport([
      {
        source: novSource,
        observed: {
          subjectId: 'subj-0000',
          publicationId: 'pub-nov-1',
          revisionNumber: 1,
          publicationStatus: 'published',
          isActive: true,
          checksumSha256: VALID_CHECKSUM,
          sectionCounts: { component: 2, 'a-level-linear': 1, 'a-level-staged': 1, 'as-level': 1 },
          tableCounts: {
            componentVariants: 2,
            componentMarks: 10,
            combinations: 3,
            combinationTokens: 5,
            combinationMarks: 17,
          },
        },
        weightingCovered: false,
      },
    ])
    expect(futureReport.overallStatus).toBe('action_required')
    expect(futureReport.subjects[0]?.status).toBe('review_required')
    expect(futureReport.subjects[0]?.actionRequired).toMatch(/allocation is unavailable/i)
  })

  test('enforces fail-closed multi-source batch publication (autoPublish withheld) and reports single-source activation failure', async () => {
    // 1. Valid 5-source batch with autoPublish: true stages all 5, publishes 0, never calls publishPublication
    const fiveSources = ['9709', '9231', '9702', '9701', '9618'].map((code) =>
      makeSyntheticSource(code, `Subject ${code}`, 2026, 'june', 2),
    )

    const multiPersistence = new RegressionPersistence()
    const multiPublishSpy = vi.spyOn(multiPersistence, 'publishPublication')
    const namesByCode: Record<string, string> = {
      '9709': 'Subject 9709',
      '9231': 'Subject 9231',
      '9702': 'Subject 9702',
      '9701': 'Subject 9701',
      '9618': 'Subject 9618',
    }
    const urlToCode = new Map(fiveSources.map((s) => [s.pdfUrl, s.syllabusCode]))
    const bytesByCode = new Map(
      Object.keys(namesByCode).map((code) => [
        code,
        new TextEncoder().encode(`%PDF-1.5 multi-${code}`),
      ]),
    )
    const fiveSourcesUnique = fiveSources.map((s) => ({
      ...s,
      expectedChecksumSha256: sha256Hex(bytesByCode.get(s.syllabusCode)!),
    }))
    const multiResult = await runGradeThresholdImportPipeline({
      persistence: multiPersistence,
      sources: fiveSourcesUnique,
      includeWeighting: false,
      autoPublish: true,
      downloadPdf: async (url) => ({
        bytes: bytesByCode.get(urlToCode.get(url)!)!,
        contentType: 'application/pdf',
      }),
      extractPdfText: async (bytes) => {
        const tag = new TextDecoder().decode(bytes)
        const code = tag.split('multi-')[1]
        return makeExtractionForSession(code, `Subject ${code}`, 2026, 'june')
      },
    })

    expect(multiResult.status).toBe('succeeded')
    expect(multiResult.awaitingReview).toBe(true)
    expect(multiResult.publicationDisposition).toBe('review_required')
    expect(multiResult.stats.totalStaged).toBe(5)
    expect(multiResult.stats.totalPublished).toBe(0)
    expect(multiPublishSpy).not.toHaveBeenCalled()
    expect(multiPersistence.publications).toHaveLength(5)
    expect(multiPersistence.publications.every((p) => p.publicationStatus === 'staged' && !p.isActive)).toBe(true)
    expect(multiPersistence.issues.some((i) => i.issueCode === 'multi-source-review-required')).toBe(true)
    expect(multiResult.completenessReport?.overallStatus).toBe('action_required')
    expect(multiResult.completenessReport?.totalsByState.review_required).toBe(5)

    // Scheduled-import inspection on staged multi-source data must report review_required, not no_change
    const stagedScheduled = await runScheduledGradeThresholdImport({
      persistence: multiPersistence,
      sources: fiveSourcesUnique,
      includeWeighting: false,
      enableDiscovery: false,
      downloadPdf: async (url) => ({
        bytes: bytesByCode.get(urlToCode.get(url)!)!,
        contentType: 'application/pdf',
      }),
    })
    expect(stagedScheduled.outcome).toBe('review_required')

    // 2. Single-source safe auto-publish still succeeds cleanly when safe
    const okSinglePersistence = new RegressionPersistence()
    const okSingleRes = await runGradeThresholdImportPipeline({
      persistence: okSinglePersistence,
      sources: [fiveSourcesUnique[0]],
      includeWeighting: false,
      autoPublish: true,
      downloadPdf: async () => ({
        bytes: bytesByCode.get('9709')!,
        contentType: 'application/pdf',
      }),
      extractPdfText: async () => makeExtractionForSession('9709', 'Subject 9709', 2026, 'june'),
    })
    expect(okSingleRes.status).toBe('succeeded')
    expect(okSingleRes.stats.totalPublished).toBe(1)
    expect(okSingleRes.awaitingReview).toBe(false)
    expect(okSingleRes.publicationDisposition).toBe('published')
    expect(okSinglePersistence.publications[0]?.publicationStatus).toBe('published')
    expect(okSinglePersistence.publications[0]?.isActive).toBe(true)

    // 3. Single-source publishPublication throwing is reported accurately without fake published count/status
    const failingPublishPersistence = new RegressionPersistence()
    vi.spyOn(failingPublishPersistence, 'publishPublication').mockRejectedValueOnce(
      new Error('Simulated DB error activating publication'),
    )
    const failPublishRes = await runGradeThresholdImportPipeline({
      persistence: failingPublishPersistence,
      sources: [fiveSourcesUnique[0]],
      includeWeighting: false,
      autoPublish: true,
      downloadPdf: async () => ({
        bytes: bytesByCode.get('9709')!,
        contentType: 'application/pdf',
      }),
      extractPdfText: async () => makeExtractionForSession('9709', 'Subject 9709', 2026, 'june'),
    })

    expect(failPublishRes.status).toBe('partial')
    expect(failPublishRes.stats.totalPublished).toBe(0)
    expect(failPublishRes.stats.totalFailed).toBe(1)
    expect(failPublishRes.publications[0]?.status).toBe('failed')
    expect(
      failPublishRes.publications[0]?.issues.some((i) => i.code === 'publication-activation-failed'),
    ).toBe(true)
    expect(failingPublishPersistence.publications[0]?.publicationStatus).toBe('staged')
    expect(failingPublishPersistence.publications[0]?.isActive).toBe(false)
    expect(failPublishRes.completenessReport?.subjects[0]?.status).toBe('invalid')
  })

  test('weighting manifest rejects missing, empty, or wrong session identity without weakening custom manifests', async () => {
    // 1. Default manifest only claims reconciled june-2026 with exact 190 rows
    expect(CAMBRIDGE_WEIGHTING_SOURCE.coveredSeries).toEqual(['june-2026'])
    expect(Object.values(CAMBRIDGE_WEIGHTING_SOURCE.june2026ExpectedRows).reduce((a, b) => a + b, 0)).toBe(190)
    expect(isWeightingManifestCoveringSession(CAMBRIDGE_WEIGHTING_SOURCE, 2025, 'november')).toBe(false)
    expect(isWeightingManifestCoveringSession(CAMBRIDGE_WEIGHTING_SOURCE, 2026, 'march')).toBe(false)

    // 2. Covered session missing its expected-row map fails both coverage helper and validator
    const missingMapManifest: CambridgeWeightingSourceManifest = {
      ...CAMBRIDGE_WEIGHTING_SOURCE,
      coveredSeries: ['june-2026', 'november-2026'],
    }
    expect(isWeightingManifestCoveringSession(missingMapManifest, 2026, 'november')).toBe(false)
    expect(validateWeightingManifest(missingMapManifest, { year: 2026, series: 'june' }).some((i) => i.code === 'row-count-mismatch')).toBe(true)

    // 3. Covered session with empty {} expected-row map fails cleanly
    const emptyMapManifest: CambridgeWeightingSourceManifest = {
      ...CAMBRIDGE_WEIGHTING_SOURCE,
      coveredSeries: ['june-2026', 'november-2026'],
      expectedRowsBySession: {
        'june-2026': CAMBRIDGE_WEIGHTING_SOURCE.june2026ExpectedRows,
        'november-2026': {},
      },
    }
    expect(isWeightingManifestCoveringSession(emptyMapManifest, 2026, 'november')).toBe(false)
    const emptyParsed = parseCambridgeWeightingItems(createSyntheticWeightingExtraction(), CAMBRIDGE_WEIGHTING_SOURCE.expectedChecksumSha256, {
      manifest: emptyMapManifest,
      targetSession: { year: 2026, series: 'november' },
    })
    expect(emptyParsed.validation.status).toBe('invalid')

    // 4. Custom/cloned manifest with empty expectedIdentityLines or missing session header fails wrong-identity
    const emptyIdentityManifest: CambridgeWeightingSourceManifest = {
      ...CAMBRIDGE_WEIGHTING_SOURCE,
      expectedIdentityLines: [],
    }
    const emptyIdentityRes = parseCambridgeWeightingItems(
      createSyntheticWeightingExtraction(),
      CAMBRIDGE_WEIGHTING_SOURCE.expectedChecksumSha256,
      { manifest: emptyIdentityManifest, targetSession: { year: 2026, series: 'june' } },
    )
    expect(emptyIdentityRes.validation.status).toBe('invalid')
    expect(emptyIdentityRes.validation.issues.some((i) => i.code === 'wrong-identity')).toBe(true)

    const wBytes = new TextEncoder().encode('%PDF-1.5 wrong header test')
    const wSha = sha256Hex(wBytes)
    const novManifest: CambridgeWeightingSourceManifest = {
      ...CAMBRIDGE_WEIGHTING_SOURCE,
      expectedChecksumSha256: wSha,
      coveredSeries: ['november-2026'],
      expectedRowsBySession: { 'november-2026': { '9709': 1 } },
    }
    const wrongHeaderRes = await parseCambridgeWeightingPdf(
      wBytes,
      'application/pdf',
      async () => ({
        pageCount: 91,
        items: [{ page: 1, x: 50, y: 800, width: 200, height: 12, text: 'Syllabus component weighting factors March 2026' }],
      }),
      wSha,
      { manifest: novManifest, targetSession: { year: 2026, series: 'november' } },
    )
    expect(wrongHeaderRes.validation.status).toBe('invalid')
    expect(wrongHeaderRes.validation.issues.some((i) => i.code === 'wrong-identity')).toBe(true)
  })

  test('completenessReport accurately surfaces missing, staged, invalid, review_required, and published states', () => {
    const [math, fm, phys, chem, cs] = CAMBRIDGE_JUNE_2026_SOURCES
    const report = buildGradeThresholdCompletenessReport(
      [
        {
          source: math,
          observed: {
            subjectId: 'subj-9709',
            publicationId: 'pub-9709',
            revisionNumber: 1,
            publicationStatus: 'published',
            isActive: true,
            checksumSha256: math.expectedChecksumSha256,
            sectionCounts: math.expectedStructure.rowCounts,
            tableCounts: {
              componentVariants: 30,
              componentMarks: 150,
              combinations: 52,
              combinationTokens: 141,
              combinationMarks: 297,
              weightingEntries: 48,
            },
            weightingReviewStatus: 'approved',
          },
          expectedWeightingEntries: 48,
        },
        {
          source: fm,
          observed: {
            subjectId: 'subj-9231',
            publicationId: 'pub-9231',
            revisionNumber: 1,
            publicationStatus: 'staged',
            isActive: false,
            checksumSha256: fm.expectedChecksumSha256,
            sectionCounts: fm.expectedStructure.rowCounts,
            tableCounts: {
              componentVariants: 20,
              componentMarks: 100,
              combinations: 41,
              combinationTokens: 112,
              combinationMarks: 236,
              weightingEntries: 40,
            },
          },
          expectedWeightingEntries: 40,
        },
        {
          source: phys,
          observed: null,
        },
        {
          source: chem,
          observed: {
            subjectId: 'subj-9701',
            publicationId: 'pub-9701',
            revisionNumber: 1,
            publicationStatus: 'published',
            isActive: true,
            checksumSha256: chem.expectedChecksumSha256,
            sectionCounts: { component: 24, 'a-level-linear': 8, 'a-level-staged': 20, 'as-level': 8 }, // off by 1!
            tableCounts: {
              componentVariants: 24,
              componentMarks: 120,
              combinations: 36,
              combinationTokens: 118,
              combinationMarks: 208,
            },
          },
        },
        {
          source: cs,
          observed: {
            subjectId: 'subj-9618',
            publicationId: 'pub-9618',
            revisionNumber: 2,
            publicationStatus: 'staged',
            isActive: false,
            checksumSha256: 'f'.repeat(64),
            sectionCounts: cs.expectedStructure.rowCounts,
            tableCounts: {
              componentVariants: 14,
              componentMarks: 70,
              combinations: 19,
              combinationTokens: 53,
              combinationMarks: 110,
            },
          },
          reviewRequired: true,
        },
      ],
      () => new Date('2026-11-26T12:00:00Z'),
    )

    expect(report.generatedAt).toBe('2026-11-26T12:00:00.000Z')
    expect(report.overallStatus).toBe('incomplete')
    expect(report.totalsByState).toEqual({
      published: 1,
      staged: 1,
      missing: 1,
      invalid: 1,
      review_required: 1,
    })

    const byCode = Object.fromEntries(report.subjects.map((s) => [s.syllabusCode, s]))
    expect(byCode['9709']?.status).toBe('published')
    expect(byCode['9709']?.persistedTables.combinationTokens.matches).toBe(true)
    expect(byCode['9231']?.status).toBe('staged')
    expect(byCode['9702']?.status).toBe('missing')
    expect(byCode['9701']?.status).toBe('invalid')
    expect(byCode['9701']?.sections.component.matches).toBe(false)
    expect(byCode['9618']?.status).toBe('review_required')
  })

  test('inspectConfiguredThresholdSources reads all five subjects without mutating', async () => {
    const persistence = new RegressionPersistence()
    const inspection = await inspectConfiguredThresholdSources({ persistence, includeWeighting: true })
    expect(inspection.thresholdSources).toHaveLength(5)
    expect(inspection.thresholdSources.map((s) => s.syllabusCode)).toEqual([
      '9709',
      '9231',
      '9702',
      '9701',
      '9618',
    ])
    expect(persistence.runs).toHaveLength(0)
    expect(persistence.publications).toHaveLength(0)
  })

  test('discovery omits March subjects absent from manifest without false positive and stays read-only', async () => {
    const report = await runGradeThresholdDiscovery({
      now: () => new Date('2026-06-15T12:00:00.000Z'),
      discoveryOptions: {
        fetchIndexHtml: vi.fn(async (url: string) => {
          if (url.includes('march-2026')) {
            return {
              html: `
                <a href="/Images/740001-mathematics-9709-march-2026.pdf">Mathematics (9709) - March 2026</a>
                <a href="/Images/740002-further-mathematics-9231-march-2026.pdf">Further Mathematics (9231) - March 2026</a>
                <a href="/Images/740003-accounting-9706-march-2026.pdf">Accounting (9706) - March 2026</a>
              `,
              finalUrl: url,
            }
          }
          throw new CambridgeFetchError('HTTP 404', 'not_found', 404)
        }),
      },
    })

    expect(report.ok).toBe(true)
    expect(report.outcome).toBe('no_change')
    expect(report.subjects).toHaveLength(5)
    expect(report.subjects.some((s) => s.syllabusCode === '9706')).toBe(false)
  })
})
