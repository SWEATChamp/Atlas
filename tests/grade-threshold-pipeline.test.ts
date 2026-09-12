import { describe, expect, test, vi } from 'vitest'
import {
  CAMBRIDGE_WEIGHTING_SOURCE,
  downloadCambridgePdf,
  inspectConfiguredThresholdSources,
  runGradeThresholdImportPipeline,
  sha256Hex,
  type CambridgeSeries,
  type CambridgeThresholdSource,
  type CreateImportRunParams,
  type ExistingPublicationInfo,
  type GradeThresholdPersistence,
  type RecordImportIssueParams,
  type StagedCombinationParams,
  type StagedPublicationBundleParams,
  type StagedVariantParams,
  type StageWeightingSourceParams,
  type UpdateImportRunParams,
  type WeightingEntryInfo,
  type WeightingSourceInfo,
} from '../lib/grade-thresholds'
import {
  SYNTHETIC_SOURCE,
  createSyntheticWeightingExtraction,
  validCoordinateExtraction,
} from './fixtures/grade-threshold-coordinates'

class InMemoryGradeThresholdPersistence implements GradeThresholdPersistence {
  runs: Array<{
    id: string
    triggerKind: string
    parserVersion: string
    status: string
    aggregateSummary: Record<string, unknown>
    finishedAt?: string
  }> = []
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
  issues: Array<{
    id: string
    runId: string
    publicationId?: string | null
    issueCode: string
    severity: string
    message: string
    recordReference?: Record<string, unknown>
  }> = []

  subjects = new Map<string, { id: string; syllabusCode: string }>([
    ['0000', { id: 'subj-0000', syllabusCode: '0000' }],
    ['9709', { id: 'subj-9709', syllabusCode: '9709' }],
    ['9231', { id: 'subj-9231', syllabusCode: '9231' }],
    ['9702', { id: 'subj-9702', syllabusCode: '9702' }],
    ['9701', { id: 'subj-9701', syllabusCode: '9701' }],
    ['9618', { id: 'subj-9618', syllabusCode: '9618' }],
  ])

  subjectPapers = new Map<
    string,
    Array<{ id: string; paperNumber: number; defaultStage: 'as' | 'a2' }>
  >([
    [
      'subj-0000',
      [
        { id: 'p-0-1', paperNumber: 1, defaultStage: 'as' },
        { id: 'p-0-2', paperNumber: 2, defaultStage: 'as' },
        { id: 'p-0-3', paperNumber: 3, defaultStage: 'a2' },
        { id: 'p-0-4', paperNumber: 4, defaultStage: 'a2' },
        { id: 'p-0-5', paperNumber: 5, defaultStage: 'a2' },
      ],
    ],
    [
      'subj-9709',
      [
        { id: 'p-9709-1', paperNumber: 1, defaultStage: 'as' },
        { id: 'p-9709-2', paperNumber: 2, defaultStage: 'as' },
        { id: 'p-9709-3', paperNumber: 3, defaultStage: 'a2' },
        { id: 'p-9709-4', paperNumber: 4, defaultStage: 'a2' },
        { id: 'p-9709-5', paperNumber: 5, defaultStage: 'a2' },
        { id: 'p-9709-6', paperNumber: 6, defaultStage: 'a2' },
      ],
    ],
  ])

  failPhase?: 'publication' | 'variants' | 'combinations' | 'tokens' | 'weighting' | 'publish'

  async createImportRun(params: CreateImportRunParams): Promise<string> {
    const id = `run-${this.runs.length + 1}`
    this.runs.push({
      id,
      triggerKind: params.triggerKind,
      parserVersion: params.parserVersion,
      status: 'running',
      aggregateSummary: {},
    })
    return id
  }

  async updateImportRun(runId: string, params: UpdateImportRunParams): Promise<void> {
    const run = this.runs.find((r) => r.id === runId)
    if (run) {
      run.status = params.status
      run.aggregateSummary = params.aggregateSummary
      run.finishedAt = params.finishedAt
    }
  }

  async getSubjectBySyllabus(
    syllabusCode: string,
  ): Promise<{ id: string; syllabusCode: string } | null> {
    return this.subjects.get(syllabusCode) ?? null
  }

  async getSubjectPaper(
    subjectId: string,
    paperNumber: number,
  ): Promise<{ id: string; paperNumber: number; defaultStage?: 'as' | 'a2' } | null> {
    const papers = this.subjectPapers.get(subjectId) ?? []
    return papers.find((p) => p.paperNumber === paperNumber) ?? null
  }

  async getActivePublication(
    subjectId: string,
    year: number,
    series: CambridgeSeries,
  ): Promise<ExistingPublicationInfo | null> {
    const pub = this.publications.find(
      (p) =>
        p.subjectId === subjectId &&
        p.year === year &&
        p.series === series &&
        p.isActive,
    )
    if (!pub) return null
    return {
      id: pub.id,
      revisionNumber: pub.revisionNumber,
      checksumSha256: pub.checksumSha256,
      publicationStatus: pub.publicationStatus,
      isActive: pub.isActive,
    }
  }

  async getLatestPublication(
    subjectId: string,
    year: number,
    series: CambridgeSeries,
  ): Promise<ExistingPublicationInfo | null> {
    const matching = this.publications
      .filter((p) => p.subjectId === subjectId && p.year === year && p.series === series)
      .sort((a, b) => b.revisionNumber - a.revisionNumber)

    if (matching.length === 0) return null
    const pub = matching[0]
    return {
      id: pub.id,
      revisionNumber: pub.revisionNumber,
      checksumSha256: pub.checksumSha256,
      publicationStatus: pub.publicationStatus,
      isActive: pub.isActive,
    }
  }

  async findPublicationByChecksum(
    subjectId: string,
    year: number,
    series: CambridgeSeries,
    checksumSha256: string,
  ): Promise<ExistingPublicationInfo | null> {
    const pub = this.publications.find(
      (p) =>
        p.subjectId === subjectId &&
        p.year === year &&
        p.series === series &&
        p.checksumSha256 === checksumSha256,
    )
    if (!pub) return null
    return {
      id: pub.id,
      revisionNumber: pub.revisionNumber,
      checksumSha256: pub.checksumSha256,
      publicationStatus: pub.publicationStatus,
      isActive: pub.isActive,
    }
  }

  async stagePublicationBundle(bundle: StagedPublicationBundleParams): Promise<string> {
    const pubSnapshot = [...this.publications]
    const varSnapshot = [...this.variants]
    const comboSnapshot = [...this.combinations]
    const issueSnapshot = [...this.issues]

    try {
      if (this.failPhase === 'publication') {
        throw new Error('Simulated failure during stagePublication')
      }
      const pubId = `pub-${this.publications.length + 1}`
      this.publications.push({
        id: pubId,
        runId: bundle.publication.runId,
        subjectId: bundle.publication.subjectId,
        year: bundle.publication.year,
        series: bundle.publication.series,
        checksumSha256: bundle.publication.sourceChecksumSha256,
        revisionNumber: bundle.publication.revisionNumber,
        revisesPublicationId: bundle.publication.revisesPublicationId,
        publicationStatus: 'staged',
        isActive: false,
      })

      if (this.failPhase === 'variants') {
        throw new Error('Simulated failure during stageComponentVariants')
      }
      const variantMap = new Map<string, string>()
      for (const v of bundle.variants) {
        const id = `var-${this.variants.length + 1}`
        this.variants.push({ id, publicationId: pubId, params: v })
        variantMap.set(v.componentCode, id)
      }

      if (this.failPhase === 'combinations') {
        throw new Error('Simulated failure during stageCombinations')
      }
      if (this.failPhase === 'tokens') {
        throw new Error('Simulated failure during token insertion')
      }
      for (const combo of bundle.combinations) {
        for (const token of combo.tokens) {
          if (!token.resolvedComponentVariantId && token.tokenKind === 'component_variant') {
            token.resolvedComponentVariantId =
              variantMap.get(token.resolvedComponentCode ?? token.rawToken) ?? null
          }
        }
        const id = `combo-${this.combinations.length + 1}`
        this.combinations.push({ id, publicationId: pubId, params: combo })
      }

      for (const issue of bundle.issues) {
        this.issues.push({ id: `issue-${this.issues.length + 1}`, publicationId: pubId, ...issue })
      }

      if (bundle.autoPublish) {
        if (bundle.publication.revisionNumber > 1 || bundle.publication.revisesPublicationId) {
          throw new Error('Auto-publish is not permitted for revisions greater than 1')
        }
        await this.publishPublication(pubId)
      }
      return pubId
    } catch (err) {
      this.publications = pubSnapshot
      this.variants = varSnapshot
      this.combinations = comboSnapshot
      this.issues = issueSnapshot
      throw err
    }
  }

  async approveWeightingSource(
    sourceId: string,
    reviewedBy: string,
    reviewedAt?: string,
  ): Promise<string> {
    const ws = this.weightingSources.find((w) => w.id === sourceId)
    if (!ws) throw new Error('Weighting source not found')
    if (ws.reviewStatus !== 'unreviewed') {
      throw new Error(
        `Only unreviewed weighting sources can be approved (current status: ${ws.reviewStatus})`,
      )
    }
    ws.reviewStatus = 'approved'
    ws.reviewedBy = reviewedBy
    ws.reviewedAt = reviewedAt ?? new Date().toISOString()
    return ws.id
  }

  async getWeightingSource(
    subjectId: string,
    year: number,
    series: CambridgeSeries,
    checksumSha256: string,
  ): Promise<WeightingSourceInfo | null> {
    const ws = this.weightingSources.find(
      (w) =>
        w.subjectId === subjectId &&
        w.year === year &&
        w.series === series &&
        w.checksumSha256 === checksumSha256,
    )
    if (!ws) return null
    return { id: ws.id, reviewStatus: ws.reviewStatus, entries: ws.entries }
  }

  async stageWeightingSource(
    params: StageWeightingSourceParams,
  ): Promise<WeightingSourceInfo> {
    if (this.failPhase === 'weighting') {
      throw new Error('Simulated failure during stageWeightingSource')
    }
    const id = `weight-src-${this.weightingSources.length + 1}`
    const entriesMap = new Map<string, WeightingEntryInfo>()
    for (const e of params.entries) {
      const entryId = `entry-${entriesMap.size + 1}`
      entriesMap.set(e.rawToken, {
        id: entryId,
        rawToken: e.rawToken,
        tokenKind: e.tokenKind,
        rawMaximum: e.rawMaximum,
        weightedMaximum: e.weightedMaximum,
        officialWeightingFactor: e.officialWeightingFactor,
        sourcePage: e.sourcePage,
      })
    }
    const ws = {
      id,
      subjectId: params.subjectId,
      year: params.documentYear,
      series: params.examSeries,
      checksumSha256: params.sourceChecksumSha256,
      reviewStatus: 'unreviewed' as const,
      reviewedBy: null,
      reviewedAt: null,
      entries: entriesMap,
    }
    this.weightingSources.push(ws)
    return { id, reviewStatus: 'unreviewed', entries: entriesMap }
  }

  async recordImportIssue(params: RecordImportIssueParams): Promise<void> {
    this.issues.push({ id: `issue-${this.issues.length + 1}`, ...params })
  }

  async publishPublication(publicationId: string): Promise<string> {
    if (this.failPhase === 'publish') {
      throw new Error('Simulated failure during publishPublication')
    }
    const target = this.publications.find((p) => p.id === publicationId)
    if (!target) throw new Error('Publication not found')

    for (const p of this.publications) {
      if (
        p.subjectId === target.subjectId &&
        p.year === target.year &&
        p.series === target.series &&
        p.id !== target.id
      ) {
        if (p.isActive) {
          p.isActive = false
          p.publicationStatus = 'superseded'
        } else if (p.publicationStatus === 'staged' && p.revisionNumber < target.revisionNumber) {
          p.publicationStatus = 'superseded'
        }
      }
    }

    target.isActive = true
    target.publicationStatus = 'published'
    return target.id
  }
}

describe('secure Cambridge PDF downloader', () => {
  test('rejects non-HTTPS URLs', async () => {
    await expect(
      downloadCambridgePdf('http://www.cambridgeinternational.org/test.pdf'),
    ).rejects.toThrow(/Insecure protocol "http:" not allowed/)
  })

  test('rejects unapproved hostnames', async () => {
    await expect(
      downloadCambridgePdf('https://unapproved.test/test.pdf'),
    ).rejects.toThrow(/Unapproved host "unapproved.test"/)
  })

  test('rejects non-PDF Content-Type', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      arrayBuffer: async () => new ArrayBuffer(10),
    })) as unknown as typeof fetch

    await expect(
      downloadCambridgePdf('https://www.cambridgeinternational.org/page.html', {
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow(/Invalid content type "text\/html"/)
  })

  test('rejects malformed and negative Content-Length headers', async () => {
    const mockFetchMalformed = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/pdf',
        'content-length': 'not-a-number',
      }),
      arrayBuffer: async () => new ArrayBuffer(10),
    })) as unknown as typeof fetch

    await expect(
      downloadCambridgePdf('https://www.cambridgeinternational.org/test.pdf', {
        fetchFn: mockFetchMalformed,
      }),
    ).rejects.toThrow(/Malformed content-length "not-a-number"/)

    const mockFetchNegative = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/pdf',
        'content-length': '-500',
      }),
      arrayBuffer: async () => new ArrayBuffer(10),
    })) as unknown as typeof fetch

    await expect(
      downloadCambridgePdf('https://www.cambridgeinternational.org/test.pdf', {
        fetchFn: mockFetchNegative,
      }),
    ).rejects.toThrow(/Malformed content-length "-500"/)
  })

  test('rejects payloads exceeding byte limit via Content-Length and streaming chunks', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/pdf',
        'content-length': '200',
      }),
      arrayBuffer: async () => new ArrayBuffer(200),
    })) as unknown as typeof fetch

    await expect(
      downloadCambridgePdf('https://www.cambridgeinternational.org/large.pdf', {
        maxBytes: 100,
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow(/Content length 200 exceeds maximum limit of 100 bytes/)

    // Streaming chunk limit enforcement without Content-Length
    const mockFetchStreaming = vi.fn(async () => {
      const chunk1 = new Uint8Array(60)
      const chunk2 = new Uint8Array(60)
      let step = 0
      const stream = new ReadableStream({
        pull(controller) {
          if (step === 0) {
            controller.enqueue(chunk1)
            step++
          } else if (step === 1) {
            controller.enqueue(chunk2)
            step++
          } else {
            controller.close()
          }
        },
      })
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        body: stream,
      }
    }) as unknown as typeof fetch

    await expect(
      downloadCambridgePdf('https://www.cambridgeinternational.org/stream.pdf', {
        maxBytes: 100,
        fetchFn: mockFetchStreaming,
      }),
    ).rejects.toThrow(/Downloaded bytes 120 exceed maximum limit of 100 bytes/)
  })

  test('enforces redirect security and redirect limits', async () => {
    let callCount = 0
    const mockFetch = vi.fn(async () => {
      callCount++
      return {
        status: 302,
        headers: new Headers({
          location: `https://www.cambridgeinternational.org/hop${callCount}.pdf`,
        }),
      }
    }) as unknown as typeof fetch

    await expect(
      downloadCambridgePdf('https://www.cambridgeinternational.org/start.pdf', {
        maxRedirects: 2,
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow(/Too many redirects/)
  })
})

describe('grade threshold import pipeline', () => {
  const validPdfBytes = new TextEncoder().encode('%PDF-1.5 synthetic content')
  const validChecksum = sha256Hex(validPdfBytes)

  const testSource: CambridgeThresholdSource = {
    ...SYNTHETIC_SOURCE,
    pdfUrl: 'https://www.cambridgeinternational.org/Images/test.pdf',
    expectedChecksumSha256: validChecksum,
  }

  test('successfully imports and stages publication without auto-publishing by default', async () => {
    const persistence = new InMemoryGradeThresholdPersistence()

    const downloadPdf = vi.fn(async () => ({
      bytes: validPdfBytes,
      contentType: 'application/pdf',
    }))

    const extractPdfText = vi.fn(async () => validCoordinateExtraction())

    // autoPublish defaults to false
    const result = await runGradeThresholdImportPipeline({
      triggerKind: 'manual',
      persistence,
      sources: [testSource],
      includeWeighting: false,
      downloadPdf,
      extractPdfText,
    })

    expect(result.status).toBe('succeeded')
    expect(result.stats).toEqual({
      totalDiscovered: 1,
      totalStaged: 1,
      totalPublished: 0,
      totalDuplicate: 0,
      totalFailed: 0,
    })
    expect(result.publications).toHaveLength(1)
    expect(result.publications[0].status).toBe('staged')
    expect(result.publications[0].revisionNumber).toBe(1)

    // Verify DB state: staged, NOT published, NOT active
    expect(persistence.publications).toHaveLength(1)
    expect(persistence.publications[0].publicationStatus).toBe('staged')
    expect(persistence.publications[0].isActive).toBe(false)
    expect(persistence.variants.length).toBeGreaterThan(0)
    expect(persistence.combinations.length).toBeGreaterThan(0)

    // Verify real maximumRawMark is used (not hardcoded 100)
    const variant1 = persistence.variants.find((v) => v.params.componentCode === '11')
    expect(variant1?.params.rawMaximumMark).toBe(75) // Synthetic row 11 has max 75!

    // Verify combination weightingBasis is weighted_total
    const combo1 = persistence.combinations[0]
    expect(combo1.params.weightingBasis).toBe('weighted_total')
    expect(combo1.params.plannerEligibility).toBe('unreviewed')

    // Verify combination token characteristics
    const token1 = combo1.params.tokens[0]
    expect(token1.tokenKind).toBe('component_variant')
    expect(token1.maximumMark).toBe(75) // Matches component rawMaximumMark!
    expect(token1.carryForwardMappingStatus).toBeNull() // NULL for non-carry-forward!
  })

  test('explicit autoPublish: true activates valid publication', async () => {
    const persistence = new InMemoryGradeThresholdPersistence()

    const downloadPdf = vi.fn(async () => ({
      bytes: validPdfBytes,
      contentType: 'application/pdf',
    }))
    const extractPdfText = vi.fn(async () => validCoordinateExtraction())

    const result = await runGradeThresholdImportPipeline({
      triggerKind: 'manual',
      persistence,
      sources: [testSource],
      includeWeighting: false,
      downloadPdf,
      extractPdfText,
      autoPublish: true,
    })

    expect(result.status).toBe('succeeded')
    expect(result.stats.totalPublished).toBe(1)
    expect(result.publications[0].status).toBe('published')
    expect(persistence.publications[0].publicationStatus).toBe('published')
    expect(persistence.publications[0].isActive).toBe(true)
  })

  test('detects identical checksum rediscovery as a clean no-op without re-staging', async () => {
    const persistence = new InMemoryGradeThresholdPersistence()

    // Pre-seeded publication with same checksum
    persistence.publications.push({
      id: 'pre-seeded-pub',
      runId: 'run-0',
      subjectId: 'subj-0000',
      year: 2026,
      series: 'june',
      checksumSha256: validChecksum,
      revisionNumber: 1,
      publicationStatus: 'published',
      isActive: true,
    })

    const downloadPdf = vi.fn(async () => ({
      bytes: validPdfBytes,
      contentType: 'application/pdf',
    }))
    const extractPdfText = vi.fn<() => Promise<never>>()

    const result = await runGradeThresholdImportPipeline({
      triggerKind: 'scheduled',
      persistence,
      sources: [testSource],
      includeWeighting: false,
      downloadPdf,
      extractPdfText,
    })

    expect(result.status).toBe('succeeded')
    expect(result.stats).toEqual({
      totalDiscovered: 1,
      totalStaged: 0,
      totalPublished: 0,
      totalDuplicate: 1,
      totalFailed: 0,
    })
    expect(result.publications[0].status).toBe('duplicate')
    // Extraction must never be invoked for an identical checksum duplicate
    expect(extractPdfText).not.toHaveBeenCalled()
  })

  test('creates an append-only staged revision when source checksum changes without auto-activating', async () => {
    const persistence = new InMemoryGradeThresholdPersistence()

    // Pre-existing published revision 1
    persistence.publications.push({
      id: 'pub-v1',
      runId: 'run-0',
      subjectId: 'subj-0000',
      year: 2026,
      series: 'june',
      checksumSha256: 'old-checksum-sha256',
      revisionNumber: 1,
      publicationStatus: 'published',
      isActive: true,
    })

    const downloadPdf = vi.fn(async () => ({
      bytes: validPdfBytes,
      contentType: 'application/pdf',
    }))
    const extractPdfText = vi.fn(async () => validCoordinateExtraction())

    const result = await runGradeThresholdImportPipeline({
      persistence,
      sources: [testSource],
      includeWeighting: false,
      downloadPdf,
      extractPdfText,
      autoPublish: false, // Default
    })

    expect(result.status).toBe('succeeded')
    expect(result.publications[0].status).toBe('staged')
    expect(result.publications[0].revisionNumber).toBe(2)

    // Predecessor remains active until new revision is published; new revision is staged
    const v1 = persistence.publications.find((p) => p.id === 'pub-v1')
    const v2 = persistence.publications.find(
      (p) => p.id === result.publications[0].publicationId,
    )
    expect(v1?.isActive).toBe(true)
    expect(v1?.publicationStatus).toBe('published')
    expect(v2?.isActive).toBe(false)
    expect(v2?.publicationStatus).toBe('staged')
    expect(v2?.revisesPublicationId).toBe('pub-v1')
  })

  test('handles unmapped subject paper gracefully with nullable subjectPaperId and info issue', async () => {
    const persistence = new InMemoryGradeThresholdPersistence()
    // Clear subject papers so component variants have no matching paper
    persistence.subjectPapers.clear()

    const downloadPdf = vi.fn(async () => ({
      bytes: validPdfBytes,
      contentType: 'application/pdf',
    }))
    const extractPdfText = vi.fn(async () => validCoordinateExtraction())

    const result = await runGradeThresholdImportPipeline({
      persistence,
      sources: [testSource],
      includeWeighting: false,
      downloadPdf,
      extractPdfText,
    })

    expect(result.status).toBe('succeeded')
    expect(persistence.variants.length).toBeGreaterThan(0)
    // Every variant has subjectPaperId === null
    for (const v of persistence.variants) {
      expect(v.params.subjectPaperId).toBeNull()
    }
    // Recorded info issues for unmapped subject paper
    expect(
      persistence.issues.some((i) => i.issueCode === 'unmapped-subject-paper'),
    ).toBe(true)
  })

  test('deep rollback testing: rolls back state when failure occurs at any staging phase', async () => {
    const phases: Array<InMemoryGradeThresholdPersistence['failPhase']> = [
      'publication',
      'variants',
      'combinations',
      'tokens',
    ]

    for (const phase of phases) {
      const persistence = new InMemoryGradeThresholdPersistence()
      persistence.failPhase = phase

      const downloadPdf = vi.fn(async () => ({
        bytes: validPdfBytes,
        contentType: 'application/pdf',
      }))
      const extractPdfText = vi.fn(async () => validCoordinateExtraction())

      const result = await runGradeThresholdImportPipeline({
        persistence,
        sources: [testSource],
        includeWeighting: false,
        downloadPdf,
        extractPdfText,
      })

      expect(result.status).toBe('failed')
      expect(result.stats.totalFailed).toBe(1)
      expect(result.stats.totalStaged).toBe(0)
      // Working state rolled back: zero orphaned publications, variants, or combinations!
      expect(persistence.publications).toHaveLength(0)
      expect(persistence.variants).toHaveLength(0)
      expect(persistence.combinations).toHaveLength(0)
    }
  })

  test('stages weighting source as unreviewed without reviewer metadata', async () => {
    const persistence = new InMemoryGradeThresholdPersistence()

    const downloadPdf = vi.fn(async (url: string) => {
      if (url.includes('weighting')) {
        return {
          bytes: new TextEncoder().encode('%PDF-1.5 fake weighting content'),
          contentType: 'application/pdf',
        }
      }
      return {
        bytes: validPdfBytes,
        contentType: 'application/pdf',
      }
    })

    const extractPdfText = vi.fn(async (bytes: Uint8Array) => {
      const text = new TextDecoder().decode(bytes)
      if (text.includes('weighting')) {
        return createSyntheticWeightingExtraction()
      }
      return validCoordinateExtraction()
    })

    const customWeightingSource = {
      ...CAMBRIDGE_WEIGHTING_SOURCE,
      expectedChecksumSha256: sha256Hex(
        new TextEncoder().encode('%PDF-1.5 fake weighting content'),
      ),
    }

    const result = await runGradeThresholdImportPipeline({
      persistence,
      sources: [testSource],
      includeWeighting: true,
      weightingSource: customWeightingSource,
      downloadPdf,
      extractPdfText,
      // No weightingReviewMetadata provided!
    })

    expect(result.status).toBe('succeeded')
    expect(result.weighting?.status).toBe('imported')
    expect(persistence.weightingSources.length).toBeGreaterThan(0)

    // Must be unreviewed!
    for (const ws of persistence.weightingSources) {
      expect(ws.reviewStatus).toBe('unreviewed')
      expect(ws.reviewedBy).toBeNull()
      expect(ws.reviewedAt).toBeNull()
    }
  })

  test('newly imported weighting sources are always staged as unreviewed, and importer options cannot implicitly approve them', async () => {
    const persistence = new InMemoryGradeThresholdPersistence()

    const downloadPdf = vi.fn(async (url: string) => {
      if (url.includes('weighting')) {
        return {
          bytes: new TextEncoder().encode('%PDF-1.5 fake weighting content'),
          contentType: 'application/pdf',
        }
      }
      return {
        bytes: validPdfBytes,
        contentType: 'application/pdf',
      }
    })

    const extractPdfText = vi.fn(async (bytes: Uint8Array) => {
      const text = new TextDecoder().decode(bytes)
      if (text.includes('weighting')) {
        return createSyntheticWeightingExtraction()
      }
      return validCoordinateExtraction()
    })

    const customWeightingSource = {
      ...CAMBRIDGE_WEIGHTING_SOURCE,
      expectedChecksumSha256: sha256Hex(
        new TextEncoder().encode('%PDF-1.5 fake weighting content'),
      ),
    }

    // Run ordinary import pipeline - no weightingReviewMetadata exists on options
    const result = await runGradeThresholdImportPipeline({
      persistence,
      sources: [testSource],
      includeWeighting: true,
      weightingSource: customWeightingSource,
      downloadPdf,
      extractPdfText,
    })

    expect(result.status).toBe('succeeded')
    expect(persistence.weightingSources.length).toBeGreaterThan(0)

    // EVERY newly imported weighting source MUST initially be 'unreviewed'
    for (const ws of persistence.weightingSources) {
      expect(ws.reviewStatus).toBe('unreviewed')
      expect(ws.reviewedBy).toBeNull()
      expect(ws.reviewedAt).toBeNull()
    }

    // Second import run on same data still leaves existing weighting source unreviewed (never implicitly approved)
    await runGradeThresholdImportPipeline({
      persistence,
      sources: [testSource],
      includeWeighting: true,
      weightingSource: customWeightingSource,
      downloadPdf,
      extractPdfText,
    })

    for (const ws of persistence.weightingSources) {
      expect(ws.reviewStatus).toBe('unreviewed')
    }

    // Approval occurs ONLY through the separate administrative operation
    const wsToApprove = persistence.weightingSources[0]
    await persistence.approveWeightingSource(wsToApprove.id, 'admin@atlas.edu', '2026-09-10T12:00:00Z')
    expect(wsToApprove.reviewStatus).toBe('approved')
    expect(wsToApprove.reviewedBy).toBe('admin@atlas.edu')
    expect(wsToApprove.reviewedAt).toBe('2026-09-10T12:00:00Z')
  })

  test('inspectConfiguredThresholdSources boundary checks available publications without mutating database', async () => {
    const persistence = new InMemoryGradeThresholdPersistence()
    const discovery = await inspectConfiguredThresholdSources({
      persistence,
      sources: [testSource],
    })

    expect(discovery.thresholdSources).toHaveLength(1)
    expect(discovery.thresholdSources[0].syllabusCode).toBe('0000')
    expect(discovery.thresholdSources[0].activePublication).toBeNull()
    // No database mutation during discovery
    expect(persistence.runs).toHaveLength(0)
    expect(persistence.publications).toHaveLength(0)
  })

  test('regression: autoPublish: true does not publish or supersede a changed-checksum revision (N > 1)', async () => {
    const persistence = new InMemoryGradeThresholdPersistence()

    // Pre-existing published revision 1
    persistence.publications.push({
      id: 'pub-v1',
      runId: 'run-0',
      subjectId: 'subj-0000',
      year: 2026,
      series: 'june',
      checksumSha256: 'initial-checksum-sha256',
      revisionNumber: 1,
      publicationStatus: 'published',
      isActive: true,
    })

    const downloadPdf = vi.fn(async () => ({
      bytes: validPdfBytes,
      contentType: 'application/pdf',
    }))
    const extractPdfText = vi.fn(async () => validCoordinateExtraction())

    // Caller explicitly requests autoPublish: true on an import that encounters a changed checksum
    const result = await runGradeThresholdImportPipeline({
      persistence,
      sources: [testSource],
      includeWeighting: false,
      downloadPdf,
      extractPdfText,
      autoPublish: true, // Requested!
    })

    expect(result.status).toBe('succeeded')
    expect(result.stats.totalStaged).toBe(1)
    expect(result.stats.totalPublished).toBe(0) // MUST NOT be auto-published!
    expect(result.publications[0].status).toBe('staged') // MUST remain staged!
    expect(result.publications[0].revisionNumber).toBe(2)

    // Predecessor remains active and published; revision 2 remains staged and inactive
    const v1 = persistence.publications.find((p) => p.id === 'pub-v1')
    const v2 = persistence.publications.find(
      (p) => p.id === result.publications[0].publicationId,
    )
    expect(v1?.isActive).toBe(true)
    expect(v1?.publicationStatus).toBe('published')
    expect(v2?.isActive).toBe(false)
    expect(v2?.publicationStatus).toBe('staged')
    expect(v2?.revisesPublicationId).toBe('pub-v1')
  })

  test('existing approved weighting source is reused across import runs without resupplying reviewer metadata', async () => {
    const persistence = new InMemoryGradeThresholdPersistence()

    // Pre-stage approved weighting source for subj-0000
    const weightingChecksum = sha256Hex(new TextEncoder().encode('%PDF-1.5 pre-existing weighting'))
    const customWeightingSource = {
      ...CAMBRIDGE_WEIGHTING_SOURCE,
      expectedChecksumSha256: weightingChecksum,
    }

    const wsEntries = new Map<string, WeightingEntryInfo>()
    wsEntries.set('11', {
      id: 'entry-11',
      rawToken: '11',
      tokenKind: 'component_variant',
      rawMaximum: 75,
      weightedMaximum: 75,
      officialWeightingFactor: 1.0,
      sourcePage: 1,
    })

    persistence.weightingSources.push({
      id: 'ws-pre-approved',
      subjectId: 'subj-0000',
      year: 2026,
      series: 'june',
      checksumSha256: weightingChecksum,
      reviewStatus: 'approved',
      reviewedBy: 'pre-reviewer@atlas.edu',
      reviewedAt: '2026-09-01T00:00:00Z',
      entries: wsEntries,
    })

    const downloadPdf = vi.fn(async (url: string) => {
      if (url.includes('weighting')) {
        return {
          bytes: new TextEncoder().encode('%PDF-1.5 pre-existing weighting'),
          contentType: 'application/pdf',
        }
      }
      return {
        bytes: validPdfBytes,
        contentType: 'application/pdf',
      }
    })

    const extractPdfText = vi.fn(async (bytes: Uint8Array) => {
      const text = new TextDecoder().decode(bytes)
      if (text.includes('weighting')) {
        return createSyntheticWeightingExtraction()
      }
      return validCoordinateExtraction()
    })

    // Import run WITHOUT passing weightingReviewMetadata
    const result = await runGradeThresholdImportPipeline({
      persistence,
      sources: [testSource],
      includeWeighting: true,
      weightingSource: customWeightingSource,
      downloadPdf,
      extractPdfText,
      // weightingReviewMetadata omitted!
    })

    expect(result.status).toBe('succeeded')
    // Combination token for component '11' MUST be linked because stored reviewStatus is 'approved'
    const combo = persistence.combinations[0]
    const token11 = combo.params.tokens.find((t) => t.rawToken === '11')
    expect(token11?.weightingEntryId).toBe('entry-11')
    expect(token11?.weightingFactor).toBe(1.0)
  })

  test('unreviewed weighting source does not link to combination tokens', async () => {
    const persistence = new InMemoryGradeThresholdPersistence()

    const weightingChecksum = sha256Hex(new TextEncoder().encode('%PDF-1.5 unreviewed weighting'))
    const customWeightingSource = {
      ...CAMBRIDGE_WEIGHTING_SOURCE,
      expectedChecksumSha256: weightingChecksum,
    }

    const wsEntries = new Map<string, WeightingEntryInfo>()
    wsEntries.set('11', {
      id: 'entry-11-unreviewed',
      rawToken: '11',
      tokenKind: 'component_variant',
      rawMaximum: 75,
      weightedMaximum: 75,
      officialWeightingFactor: 1.0,
      sourcePage: 1,
    })

    persistence.weightingSources.push({
      id: 'ws-unreviewed',
      subjectId: 'subj-0000',
      year: 2026,
      series: 'june',
      checksumSha256: weightingChecksum,
      reviewStatus: 'unreviewed',
      entries: wsEntries,
    })

    const downloadPdf = vi.fn(async (url: string) => {
      if (url.includes('weighting')) {
        return {
          bytes: new TextEncoder().encode('%PDF-1.5 unreviewed weighting'),
          contentType: 'application/pdf',
        }
      }
      return {
        bytes: validPdfBytes,
        contentType: 'application/pdf',
      }
    })

    const extractPdfText = vi.fn(async (bytes: Uint8Array) => {
      const text = new TextDecoder().decode(bytes)
      if (text.includes('weighting')) {
        return createSyntheticWeightingExtraction()
      }
      return validCoordinateExtraction()
    })

    const result = await runGradeThresholdImportPipeline({
      persistence,
      sources: [testSource],
      includeWeighting: true,
      weightingSource: customWeightingSource,
      downloadPdf,
      extractPdfText,
      // weightingReviewMetadata omitted
    })

    expect(result.status).toBe('succeeded')
    // Token must NOT be linked because source reviewStatus is 'unreviewed'
    const combo = persistence.combinations[0]
    const token11 = combo.params.tokens.find((t) => t.rawToken === '11')
    expect(token11?.weightingEntryId).toBeNull()
    expect(token11?.weightingFactor).toBeNull()
  })

  test('weighting approval boundary: approveWeightingSource strictly enforces unreviewed -> approved transition', async () => {
    const persistence = new InMemoryGradeThresholdPersistence()
    const ws = await persistence.stageWeightingSource({
      subjectId: 'subj-0000',
      documentYear: 2026,
      examSeries: 'june',
      officialDocumentUrl: 'https://www.cambridgeinternational.org/factors.pdf',
      sourceChecksumSha256: 'test-ws-checksum',
      sourceLabel: 'Mathematics Component Weighting',
      entries: [],
    })
    expect(ws.reviewStatus).toBe('unreviewed')

    // First approval succeeds
    await persistence.approveWeightingSource(ws.id, 'reviewer@atlas.edu', '2026-09-10T12:00:00Z')
    const approvedWs = await persistence.getWeightingSource('subj-0000', 2026, 'june', 'test-ws-checksum')
    expect(approvedWs?.reviewStatus).toBe('approved')

    // Second approval attempt fails because source is already approved
    await expect(
      persistence.approveWeightingSource(ws.id, 'another-reviewer@atlas.edu'),
    ).rejects.toThrow(/Only unreviewed weighting sources can be approved/)
  })

  test('complete revision lifecycle: revision 2 staged/rejected, revision 3 arrives, and later approved revision safely supersedes active publication', async () => {
    const persistence = new InMemoryGradeThresholdPersistence()

    const extractPdfText = vi.fn(async () => validCoordinateExtraction())

    // 1. Initial release: Revision 1 published and active
    persistence.publications.push({
      id: 'pub-r1',
      runId: 'run-1',
      subjectId: 'subj-0000',
      year: 2026,
      series: 'june',
      checksumSha256: 'checksum-v1',
      revisionNumber: 1,
      publicationStatus: 'published',
      isActive: true,
    })

    // 2. Checksum 2 arrives: autoPublish requested, but revision 2 must remain staged
    const pdf2Bytes = new TextEncoder().encode('%PDF-1.5 checksum-v2')
    const checksumV2 = sha256Hex(pdf2Bytes)
    const sourceV2: CambridgeThresholdSource = {
      ...testSource,
      expectedChecksumSha256: checksumV2,
    }
    const downloadV2 = vi.fn(async () => ({
      bytes: pdf2Bytes,
      contentType: 'application/pdf',
    }))

    const resultV2 = await runGradeThresholdImportPipeline({
      persistence,
      sources: [sourceV2],
      includeWeighting: false,
      downloadPdf: downloadV2,
      extractPdfText,
      autoPublish: true,
    })

    expect(resultV2.status).toBe('succeeded')
    expect(resultV2.publications[0].status).toBe('staged')
    expect(resultV2.publications[0].revisionNumber).toBe(2)

    const r1 = persistence.publications.find((p) => p.id === 'pub-r1')!
    const r2 = persistence.publications.find((p) => p.id === resultV2.publications[0].publicationId)!
    expect(r1.isActive).toBe(true)
    expect(r1.publicationStatus).toBe('published')
    expect(r2.isActive).toBe(false)
    expect(r2.publicationStatus).toBe('staged')
    expect(r2.revisesPublicationId).toBe('pub-r1')

    // Scenario A/B: Revision 2 remains staged, or is explicitly rejected by an admin
    r2.publicationStatus = 'rejected'

    // 3. Checksum 3 arrives: pipeline must inspect latest revision across active/staged/rejected/superseded
    const pdf3Bytes = new TextEncoder().encode('%PDF-1.5 checksum-v3')
    const checksumV3 = sha256Hex(pdf3Bytes)
    const sourceV3: CambridgeThresholdSource = {
      ...testSource,
      expectedChecksumSha256: checksumV3,
    }
    const downloadV3 = vi.fn(async () => ({
      bytes: pdf3Bytes,
      contentType: 'application/pdf',
    }))

    const resultV3 = await runGradeThresholdImportPipeline({
      persistence,
      sources: [sourceV3],
      includeWeighting: false,
      downloadPdf: downloadV3,
      extractPdfText,
      autoPublish: true, // Should still be rejected because revisionNumber > 1
    })

    expect(resultV3.status).toBe('succeeded')
    expect(resultV3.publications[0].status).toBe('staged')
    expect(resultV3.publications[0].revisionNumber).toBe(3) // Correctly allocated 3!

    const r3 = persistence.publications.find((p) => p.id === resultV3.publications[0].publicationId)!
    expect(r3.isActive).toBe(false)
    expect(r3.publicationStatus).toBe('staged')
    expect(r3.revisesPublicationId).toBe(r2.id) // Correctly chains to revision 2!

    // Verify append-only history is preserved
    expect(persistence.publications).toHaveLength(3)

    // 4. Administrative review and approval: publish revision 3
    await persistence.publishPublication(r3.id)

    // Revision 3 is now published and active
    expect(r3.isActive).toBe(true)
    expect(r3.publicationStatus).toBe('published')

    // Revision 1 is superseded
    expect(r1.isActive).toBe(false)
    expect(r1.publicationStatus).toBe('superseded')

    // Revision 2 remains rejected
    expect(r2.isActive).toBe(false)
    expect(r2.publicationStatus).toBe('rejected')

    // All 3 revisions remain in storage intact
    expect(persistence.publications).toHaveLength(3)
    expect(persistence.publications.map((p) => p.revisionNumber)).toEqual([1, 2, 3])
  })
})
