import { createHash } from 'node:crypto'
import type {
  CambridgeSeries,
  CambridgeThresholdSource,
  CombinationThreshold,
  ComponentGrade,
  ComponentThreshold,
  PdfExtraction,
} from './types'
import { parseCambridgeThresholdPdf, sha256Hex } from './parser'
import { extractPdfTextItems } from './pdf-extraction'
import { CAMBRIDGE_JUNE_2026_SOURCES } from './source-manifest'
import {
  CAMBRIDGE_WEIGHTING_SOURCE,
  parseCambridgeWeightingPdf,
  type CambridgeWeightingSourceManifest,
  type WeightingFactorRow,
} from './weighting-source'

const UUID_NS_OID = Buffer.from('6ba7b8129dad11d180b400c04fd430c8', 'hex')

export function uuidv5Oid(name: string): string {
  const hash = createHash('sha1').update(UUID_NS_OID).update(name, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export interface CanonicalImportRun {
  readonly id: string
  readonly triggerKind: string
  readonly parserVersion: string
  readonly status: string
}

export interface CanonicalPublication {
  readonly id: string
  readonly importRunId: string
  readonly subjectCode: string
  readonly examYear: number
  readonly examSeries: CambridgeSeries
  readonly officialIndexUrl: string
  readonly officialPdfUrl: string
  readonly checksumSha256: string
  readonly revisionNumber: number
  readonly publicationStatus: string
  readonly isActive: boolean
}

export interface CanonicalWeightingSource {
  readonly id: string
  readonly subjectCode: string
  readonly documentYear: number
  readonly examSeries: CambridgeSeries
  readonly officialDocumentUrl: string
  readonly checksumSha256: string
  readonly reviewStatus: string
}

export interface CanonicalWeightingEntry {
  readonly id: string
  readonly weightingSourceId: string
  readonly rawToken: string
  readonly tokenKind: 'component_variant' | 'carry_forward'
  readonly rawMaximum: number
  readonly weightedMaximum: number
  readonly officialWeightingFactor: string
  readonly sourcePage: number
}

export interface CanonicalComponentVariant {
  readonly id: string
  readonly publicationId: string
  readonly componentCode: string
  readonly rawMaximumMark: number
  readonly subjectPaperId: string | null
}

export interface CanonicalComponentMark {
  readonly variantId: string
  readonly grade: ComponentGrade
  readonly thresholdMark: number
}

export interface CanonicalBenchmarkGroup {
  readonly id: string
  readonly publicationId: string
  readonly subjectPaperId: string
  readonly componentGrade: string
  readonly rawMaximumMark: number
  readonly approvalStatus: string
}

export interface CanonicalBenchmarkMember {
  readonly groupId: string
  readonly componentVariantId: string
}

export interface CanonicalCombination {
  readonly id: string
  readonly publicationId: string
  readonly canonicalKey: string
  readonly qualificationLevel: 'as' | 'a_level'
  readonly routeType: 'as_only' | 'staged' | 'full_level' | 'other'
  readonly maximumMark: number
  readonly weightingBasis: 'raw_total' | 'weighted_total'
  readonly plannerEligibility: 'unreviewed' | 'eligible' | 'unsupported' | 'ambiguous'
  readonly atlasRouteId: string | null
}

export interface CanonicalCombinationToken {
  readonly id: string
  readonly combinationId: string
  readonly tokenPosition: number
  readonly rawToken: string
  readonly tokenKind: 'component_variant' | 'carry_forward' | 'special' | 'unresolved'
  readonly stage: 'as' | 'a2' | null
  readonly resolvedComponentVariantId: string | null
  readonly maximumMark: number | null
  readonly weightingFactor: string | null
  readonly weightingEntryId: string | null
  readonly carryForwardMappingStatus: string | null
}

export interface CanonicalCombinationMark {
  readonly id: string
  readonly combinationId: string
  readonly grade: string
  readonly thresholdMark: number
}

export interface CanonicalCatalogueDataset {
  readonly importRuns: readonly CanonicalImportRun[]
  readonly publications: readonly CanonicalPublication[]
  readonly weightingSources: readonly CanonicalWeightingSource[]
  readonly weightingEntries: readonly CanonicalWeightingEntry[]
  readonly componentVariants: readonly CanonicalComponentVariant[]
  readonly componentMarks: readonly CanonicalComponentMark[]
  readonly benchmarkGroups: readonly CanonicalBenchmarkGroup[]
  readonly benchmarkMembers: readonly CanonicalBenchmarkMember[]
  readonly combinations: readonly CanonicalCombination[]
  readonly combinationTokens: readonly CanonicalCombinationToken[]
  readonly combinationMarks: readonly CanonicalCombinationMark[]
}

export interface SubjectReconciliationSummary {
  readonly syllabusCode: string
  readonly weightingEntries: number
  readonly componentVariants: number
  readonly componentMarks: number
  readonly combinations: number
  readonly combinationTokens: number
  readonly combinationMarks: number
  readonly eligible: number
  readonly unreviewed: number
  readonly unsupported: number
}

export interface CanonicalCatalogueManifest {
  readonly manifestSha256: string
  readonly countsByTable: Readonly<Record<keyof CanonicalCatalogueDataset, number>>
  readonly totalRows: number
  readonly countsBySubject: Readonly<Record<string, SubjectReconciliationSummary>>
  readonly dataset: CanonicalCatalogueDataset
}

export interface ReconciliationMismatch {
  readonly target: 'source' | 'seed' | 'validator'
  readonly table: string
  readonly key: string
  readonly message: string
}

export interface ReconciliationProfileConfig {
  readonly importRun: CanonicalImportRun
  readonly publicationMetaBySubject: Readonly<Record<string, { id: string; weightingSourceId: string }>>
  readonly existingWeightingEntries: Readonly<Record<string, { id: string }>>
  readonly existingVariants: Readonly<Record<string, { id: string }>>
  readonly existingCombinations: Readonly<Record<string, {
    id: string
    weightingBasis: 'raw_total' | 'weighted_total'
    plannerEligibility: 'unreviewed' | 'eligible' | 'unsupported' | 'ambiguous'
    atlasRouteId: string | null
    tokenIds: readonly string[]
    markIds: Readonly<Record<string, string>>
  }>>
  readonly specialComponentsBySubject: Readonly<Record<string, ReadonlySet<string>>>
  readonly paperMaxBySubject: Readonly<Record<string, Readonly<Record<number, { id: string; max: number }>>>>
  readonly atlasRoutesBySubject: Readonly<Record<string, readonly {
    id: string
    routeType: 'as_only' | 'full_level'
    stages: Readonly<Record<number, 'as' | 'a2'>>
  }[]>>
  readonly benchmarkGroup?: {
    readonly id: string
    readonly syllabusCode: string
    readonly paperNumber: number
    readonly componentGrade: ComponentGrade
    readonly rawMaximumMark: number
    readonly memberComponents: readonly string[]
  }
}

export const JUNE_2026_RECONCILIATION_PROFILE: ReconciliationProfileConfig = {
  importRun: {
    id: '00000000-0000-4000-8000-000000000010',
    triggerKind: 'manual',
    parserVersion: '1.0.0',
    status: 'succeeded',
  },
  publicationMetaBySubject: {
    '9701': { id: '00000000-0000-4000-8000-000000000021', weightingSourceId: '00000000-0000-4000-8000-000000000031' },
    '9702': { id: '00000000-0000-4000-8000-000000000022', weightingSourceId: '00000000-0000-4000-8000-000000000032' },
    '9709': { id: '00000000-0000-4000-8000-000000000023', weightingSourceId: '00000000-0000-4000-8000-000000000033' },
    '9231': { id: '00000000-0000-4000-8000-000000000024', weightingSourceId: '00000000-0000-4000-8000-000000000034' },
    '9618': { id: '00000000-0000-4000-8000-000000000025', weightingSourceId: '00000000-0000-4000-8000-000000000035' },
  },
  existingWeightingEntries: {
    '9701:12': { id: '00000000-0000-4000-8000-000000000041' },
    '9701:22': { id: '00000000-0000-4000-8000-000000000042' },
    '9701:33': { id: '00000000-0000-4000-8000-000000000043' },
    '9702:12': { id: '00000000-0000-4000-8000-000000000044' },
    '9702:22': { id: '00000000-0000-4000-8000-000000000045' },
    '9702:33': { id: '00000000-0000-4000-8000-000000000046' },
    '9702:42': { id: '00000000-0000-4000-8000-000000000047' },
    '9702:52': { id: '00000000-0000-4000-8000-000000000048' },
    '9709:35': { id: '00000000-0000-4000-8000-000000000049' },
    '9709:55': { id: '00000000-0000-4000-8000-00000000004a' },
    '9709:82': { id: '00000000-0000-4000-8000-00000000004b' },
  },
  existingVariants: {
    '9701:12': { id: '00000000-0000-4000-8000-000000000081' },
    '9701:22': { id: '00000000-0000-4000-8000-000000000082' },
    '9701:33': { id: '00000000-0000-4000-8000-000000000083' },
    '9702:12': { id: '00000000-0000-4000-8000-000000000084' },
    '9702:22': { id: '00000000-0000-4000-8000-000000000085' },
    '9702:33': { id: '00000000-0000-4000-8000-000000000086' },
    '9702:42': { id: '00000000-0000-4000-8000-000000000087' },
    '9702:52': { id: '00000000-0000-4000-8000-000000000088' },
    '9709:35': { id: '00000000-0000-4000-8000-000000000089' },
    '9709:55': { id: '00000000-0000-4000-8000-00000000008a' },
    '9709:11': { id: '00000000-0000-4000-8000-00000000008b' },
    '9709:12': { id: '00000000-0000-4000-8000-00000000008c' },
    '9709:13': { id: '00000000-0000-4000-8000-00000000008d' },
  },
  existingCombinations: {
    '9701:as-level:12,22,33': {
      id: '00000000-0000-4000-8000-0000000000c1',
      weightingBasis: 'raw_total',
      plannerEligibility: 'eligible',
      atlasRouteId: uuidv5Oid('svr-9701-as-standard'),
      tokenIds: [
        '00000000-0000-4000-8000-0000000000d1',
        '00000000-0000-4000-8000-0000000000d2',
        '00000000-0000-4000-8000-0000000000d3',
      ],
      markIds: {
        a: '00000000-0000-4000-8000-0000000000e1',
        b: '00000000-0000-4000-8000-0000000000e2',
        c: '00000000-0000-4000-8000-0000000000e3',
        d: '00000000-0000-4000-8000-0000000000e4',
        e: '00000000-0000-4000-8000-0000000000e5',
      },
    },
    '9702:a-level-linear:12,22,33,42,52': {
      id: '00000000-0000-4000-8000-0000000000c2',
      weightingBasis: 'raw_total',
      plannerEligibility: 'eligible',
      atlasRouteId: uuidv5Oid('svr-9702-full-standard'),
      tokenIds: [
        '00000000-0000-4000-8000-0000000000d4',
        '00000000-0000-4000-8000-0000000000d5',
        '00000000-0000-4000-8000-0000000000d6',
        '00000000-0000-4000-8000-0000000000d7',
        '00000000-0000-4000-8000-0000000000d8',
      ],
      markIds: {
        'A*': '00000000-0000-4000-8000-0000000000e6',
        A: '00000000-0000-4000-8000-0000000000e7',
        B: '00000000-0000-4000-8000-0000000000e8',
        C: '00000000-0000-4000-8000-0000000000e9',
        D: '00000000-0000-4000-8000-0000000000ea',
        E: '00000000-0000-4000-8000-0000000000eb',
      },
    },
    '9709:a-level-staged:35,55,82': {
      id: '00000000-0000-4000-8000-0000000000c3',
      weightingBasis: 'raw_total',
      plannerEligibility: 'eligible',
      atlasRouteId: uuidv5Oid('svr-9709-staged-mech-stats'),
      tokenIds: [
        '00000000-0000-4000-8000-0000000000d9',
        '00000000-0000-4000-8000-0000000000da',
        '00000000-0000-4000-8000-0000000000db',
      ],
      markIds: {
        'A*': '00000000-0000-4000-8000-0000000000ec',
        A: '00000000-0000-4000-8000-0000000000ed',
        B: '00000000-0000-4000-8000-0000000000ee',
        C: '00000000-0000-4000-8000-0000000000ef',
        D: '00000000-0000-4000-8000-0000000000f0',
        E: '00000000-0000-4000-8000-0000000000f1',
      },
    },
  },
  specialComponentsBySubject: {
    '9709': new Set(['50', '58', '59', '60', '68', '69']),
    '9231': new Set(['50', '51', '60', '61']),
    '9702': new Set(['50', '60']),
    '9701': new Set(['50', '60']),
    '9618': new Set(['50', '60']),
  },
  paperMaxBySubject: {
    '9709': {
      1: { id: uuidv5Oid('sp-9709-1'), max: 75 },
      2: { id: uuidv5Oid('sp-9709-2'), max: 50 },
      3: { id: uuidv5Oid('sp-9709-3'), max: 75 },
      4: { id: uuidv5Oid('sp-9709-4'), max: 50 },
      5: { id: uuidv5Oid('sp-9709-5'), max: 50 },
      6: { id: uuidv5Oid('sp-9709-6'), max: 50 },
    },
    '9231': {
      1: { id: uuidv5Oid('sp-9231-1'), max: 75 },
      2: { id: uuidv5Oid('sp-9231-2'), max: 75 },
      3: { id: uuidv5Oid('sp-9231-3'), max: 50 },
      4: { id: uuidv5Oid('sp-9231-4'), max: 50 },
    },
    '9702': {
      1: { id: uuidv5Oid('sp-9702-1'), max: 40 },
      2: { id: uuidv5Oid('sp-9702-2'), max: 60 },
      3: { id: uuidv5Oid('sp-9702-3'), max: 40 },
      4: { id: uuidv5Oid('sp-9702-4'), max: 100 },
      5: { id: uuidv5Oid('sp-9702-5'), max: 30 },
    },
    '9701': {
      1: { id: uuidv5Oid('sp-9701-1'), max: 40 },
      2: { id: uuidv5Oid('sp-9701-2'), max: 60 },
      3: { id: uuidv5Oid('sp-9701-3'), max: 40 },
      4: { id: uuidv5Oid('sp-9701-4'), max: 100 },
      5: { id: uuidv5Oid('sp-9701-5'), max: 30 },
    },
    '9618': {
      1: { id: uuidv5Oid('sp-9618-1'), max: 75 },
      2: { id: uuidv5Oid('sp-9618-2'), max: 75 },
      3: { id: uuidv5Oid('sp-9618-3'), max: 75 },
      4: { id: uuidv5Oid('sp-9618-4'), max: 75 },
    },
  },
  atlasRoutesBySubject: {
    '9709': [
      { id: uuidv5Oid('svr-9709-as-p1-p2'), routeType: 'as_only', stages: { 1: 'as', 2: 'as' } },
      { id: uuidv5Oid('svr-9709-as-p1-m1'), routeType: 'as_only', stages: { 1: 'as', 4: 'as' } },
      { id: uuidv5Oid('svr-9709-as-p1-s1'), routeType: 'as_only', stages: { 1: 'as', 5: 'as' } },
      { id: uuidv5Oid('svr-9709-full-mech-stats'), routeType: 'full_level', stages: { 1: 'as', 4: 'as', 3: 'a2', 5: 'a2' } },
      { id: uuidv5Oid('svr-9709-full-stats-double'), routeType: 'full_level', stages: { 1: 'as', 5: 'as', 3: 'a2', 6: 'a2' } },
    ],
    '9231': [
      { id: uuidv5Oid('svr-9231-as-fp1-fm'), routeType: 'as_only', stages: { 1: 'as', 3: 'as' } },
      { id: uuidv5Oid('svr-9231-as-fp1-fps'), routeType: 'as_only', stages: { 1: 'as', 4: 'as' } },
      { id: uuidv5Oid('svr-9231-full-all'), routeType: 'full_level', stages: { 1: 'as', 3: 'as', 2: 'a2', 4: 'a2' } },
    ],
    '9702': [
      { id: uuidv5Oid('svr-9702-as-standard'), routeType: 'as_only', stages: { 1: 'as', 2: 'as', 3: 'as' } },
      { id: uuidv5Oid('svr-9702-full-standard'), routeType: 'full_level', stages: { 1: 'as', 2: 'as', 3: 'as', 4: 'a2', 5: 'a2' } },
    ],
    '9701': [
      { id: uuidv5Oid('svr-9701-as-standard'), routeType: 'as_only', stages: { 1: 'as', 2: 'as', 3: 'as' } },
      { id: uuidv5Oid('svr-9701-full-standard'), routeType: 'full_level', stages: { 1: 'as', 2: 'as', 3: 'as', 4: 'a2', 5: 'a2' } },
    ],
    '9618': [
      { id: uuidv5Oid('svr-9618-as-standard'), routeType: 'as_only', stages: { 1: 'as', 2: 'as' } },
      { id: uuidv5Oid('svr-9618-full-standard'), routeType: 'full_level', stages: { 1: 'as', 2: 'as', 3: 'a2', 4: 'a2' } },
    ],
  },
  benchmarkGroup: {
    id: '00000000-0000-4000-8000-000000000061',
    syllabusCode: '9709',
    paperNumber: 1,
    componentGrade: 'A',
    rawMaximumMark: 75,
    memberComponents: ['11', '12', '13'],
  },
}

const DEFAULT_SUBJECT_ORDER = ['9701', '9702', '9709', '9231', '9618'] as const

function sortCanonicalDataset(dataset: CanonicalCatalogueDataset): CanonicalCatalogueDataset {
  return {
    importRuns: [...dataset.importRuns].sort((a, b) => a.id.localeCompare(b.id)),
    publications: [...dataset.publications].sort((a, b) => a.id.localeCompare(b.id)),
    weightingSources: [...dataset.weightingSources].sort((a, b) => a.id.localeCompare(b.id)),
    weightingEntries: [...dataset.weightingEntries].sort((a, b) => a.id.localeCompare(b.id)),
    componentVariants: [...dataset.componentVariants].sort((a, b) => a.id.localeCompare(b.id)),
    componentMarks: [...dataset.componentMarks].sort((a, b) =>
      a.variantId !== b.variantId ? a.variantId.localeCompare(b.variantId) : a.grade.localeCompare(b.grade),
    ),
    benchmarkGroups: [...dataset.benchmarkGroups].sort((a, b) => a.id.localeCompare(b.id)),
    benchmarkMembers: [...dataset.benchmarkMembers].sort((a, b) =>
      a.groupId !== b.groupId
        ? a.groupId.localeCompare(b.groupId)
        : a.componentVariantId.localeCompare(b.componentVariantId),
    ),
    combinations: [...dataset.combinations].sort((a, b) => a.id.localeCompare(b.id)),
    combinationTokens: [...dataset.combinationTokens].sort((a, b) => a.id.localeCompare(b.id)),
    combinationMarks: [...dataset.combinationMarks].sort((a, b) => a.id.localeCompare(b.id)),
  }
}

export function buildManifestFromDataset(
  datasetInput: CanonicalCatalogueDataset,
): CanonicalCatalogueManifest {
  const dataset = sortCanonicalDataset(datasetInput)
  const countsByTable: Record<keyof CanonicalCatalogueDataset, number> = {
    importRuns: dataset.importRuns.length,
    publications: dataset.publications.length,
    weightingSources: dataset.weightingSources.length,
    weightingEntries: dataset.weightingEntries.length,
    componentVariants: dataset.componentVariants.length,
    componentMarks: dataset.componentMarks.length,
    benchmarkGroups: dataset.benchmarkGroups.length,
    benchmarkMembers: dataset.benchmarkMembers.length,
    combinations: dataset.combinations.length,
    combinationTokens: dataset.combinationTokens.length,
    combinationMarks: dataset.combinationMarks.length,
  }
  const totalRows = Object.values(countsByTable).reduce((sum, count) => sum + count, 0)

  const pubCodeById = new Map<string, string>(dataset.publications.map((p) => [p.id, p.subjectCode]))
  const wsCodeById = new Map<string, string>(dataset.weightingSources.map((w) => [w.id, w.subjectCode]))
  const variantCodeById = new Map<string, string>()
  for (const v of dataset.componentVariants) {
    const code = pubCodeById.get(v.publicationId)
    if (code) variantCodeById.set(v.id, code)
  }
  const comboById = new Map<string, CanonicalCombination>(dataset.combinations.map((c) => [c.id, c]))

  const countsBySubject: Record<string, SubjectReconciliationSummary> = {}
  const codes = [...new Set(dataset.publications.map((p) => p.subjectCode))].sort()
  for (const code of codes) {
    const subjCombos = dataset.combinations.filter((c) => pubCodeById.get(c.publicationId) === code)
    countsBySubject[code] = {
      syllabusCode: code,
      weightingEntries: dataset.weightingEntries.filter((w) => wsCodeById.get(w.weightingSourceId) === code).length,
      componentVariants: dataset.componentVariants.filter((v) => pubCodeById.get(v.publicationId) === code).length,
      componentMarks: dataset.componentMarks.filter((m) => variantCodeById.get(m.variantId) === code).length,
      combinations: subjCombos.length,
      combinationTokens: dataset.combinationTokens.filter(
        (t) => pubCodeById.get(comboById.get(t.combinationId)?.publicationId ?? '') === code,
      ).length,
      combinationMarks: dataset.combinationMarks.filter(
        (m) => pubCodeById.get(comboById.get(m.combinationId)?.publicationId ?? '') === code,
      ).length,
      eligible: subjCombos.filter((c) => c.plannerEligibility === 'eligible').length,
      unreviewed: subjCombos.filter((c) => c.plannerEligibility === 'unreviewed').length,
      unsupported: subjCombos.filter((c) => c.plannerEligibility === 'unsupported').length,
    }
  }

  const manifestSha256 = sha256Hex(
    new TextEncoder().encode(JSON.stringify({ countsByTable, totalRows, countsBySubject, dataset })),
  )

  return {
    manifestSha256,
    countsByTable,
    totalRows,
    countsBySubject,
    dataset,
  }
}

export async function reconcileSourcesToCatalogueManifest(options: {
  readonly sources?: readonly CambridgeThresholdSource[]
  readonly thresholdPdfs: Readonly<Record<string, { readonly bytes: Uint8Array; readonly contentType?: string }>>
  readonly weightingManifest?: CambridgeWeightingSourceManifest
  readonly weightingPdf: { readonly bytes: Uint8Array; readonly contentType?: string }
  readonly extractPdfText?: (bytes: Uint8Array) => Promise<PdfExtraction>
  readonly profile?: ReconciliationProfileConfig
}): Promise<{ ok: true; manifest: CanonicalCatalogueManifest } | { ok: false; issues: readonly ReconciliationMismatch[] }> {
  const sources = options.sources ?? CAMBRIDGE_JUNE_2026_SOURCES
  const weightingManifest = options.weightingManifest ?? CAMBRIDGE_WEIGHTING_SOURCE
  const extract = options.extractPdfText ?? extractPdfTextItems
  const profile = options.profile ?? JUNE_2026_RECONCILIATION_PROFILE
  const issues: ReconciliationMismatch[] = []

  const firstSource = sources[0]
  if (!firstSource) {
    return { ok: false, issues: [{ target: 'source', table: 'sources', key: '*', message: 'No threshold sources provided.' }] }
  }

  const parsedWeighting = await parseCambridgeWeightingPdf(
    options.weightingPdf.bytes,
    options.weightingPdf.contentType ?? 'application/pdf',
    extract,
    weightingManifest.expectedChecksumSha256,
    { manifest: weightingManifest, targetSession: { year: firstSource.year, series: firstSource.series } },
  )

  if (parsedWeighting.validation.status !== 'valid') {
    for (const issue of parsedWeighting.validation.issues) {
      issues.push({
        target: 'source',
        table: 'grade_threshold_weighting_sources',
        key: `${firstSource.year}:${firstSource.series}`,
        message: `[${issue.code}] ${issue.message}`,
      })
    }
  }

  const orderedSources = [...sources].sort((a, b) => {
    const ai = DEFAULT_SUBJECT_ORDER.indexOf(a.syllabusCode as (typeof DEFAULT_SUBJECT_ORDER)[number])
    const bi = DEFAULT_SUBJECT_ORDER.indexOf(b.syllabusCode as (typeof DEFAULT_SUBJECT_ORDER)[number])
    if (ai !== -1 && bi !== -1) return ai - bi
    return a.syllabusCode.localeCompare(b.syllabusCode)
  })

  const publications: CanonicalPublication[] = []
  const weightingSources: CanonicalWeightingSource[] = []
  const weightingEntries: CanonicalWeightingEntry[] = []
  const componentVariants: CanonicalComponentVariant[] = []
  const componentMarks: CanonicalComponentMark[] = []
  const benchmarkGroups: CanonicalBenchmarkGroup[] = []
  const benchmarkMembers: CanonicalBenchmarkMember[] = []
  const combinations: CanonicalCombination[] = []
  const combinationTokens: CanonicalCombinationToken[] = []
  const combinationMarks: CanonicalCombinationMark[] = []

  const weLookup = new Map<string, CanonicalWeightingEntry>()
  const varLookup = new Map<string, CanonicalComponentVariant>()

  for (const source of orderedSources) {
    const code = source.syllabusCode
    const meta = profile.publicationMetaBySubject[code]
    if (!meta) {
      issues.push({ target: 'source', table: 'profile', key: code, message: `Missing deterministic publication IDs for ${code}.` })
      continue
    }

    const pdfInput = options.thresholdPdfs[code]
    if (!pdfInput) {
      issues.push({ target: 'source', table: 'grade_threshold_publications', key: code, message: `Missing local PDF input for syllabus ${code}.` })
      continue
    }

    const parsedPubRes = await parseCambridgeThresholdPdf(pdfInput.bytes, source, {
      contentType: pdfInput.contentType ?? 'application/pdf',
      extract,
    })

    if (parsedPubRes.status !== 'parsed') {
      issues.push({ target: 'source', table: 'grade_threshold_publications', key: code, message: `Unexpected duplicate status for ${code}.` })
      continue
    }

    const parsedPub = parsedPubRes.publication
    if (parsedPub.validation.status !== 'valid') {
      for (const issue of parsedPub.validation.issues) {
        issues.push({
          target: 'source',
          table: 'grade_threshold_publications',
          key: code,
          message: `[${issue.code}] ${issue.message}`,
        })
      }
      continue
    }

    publications.push({
      id: meta.id,
      importRunId: profile.importRun.id,
      subjectCode: code,
      examYear: source.year,
      examSeries: source.series,
      officialIndexUrl: source.indexUrl,
      officialPdfUrl: source.pdfUrl,
      checksumSha256: parsedPub.checksumSha256,
      revisionNumber: 1,
      publicationStatus: 'published',
      isActive: true,
    })

    weightingSources.push({
      id: meta.weightingSourceId,
      subjectCode: code,
      documentYear: source.year,
      examSeries: source.series,
      officialDocumentUrl: weightingManifest.pdfUrl,
      checksumSha256: parsedWeighting.checksumSha256,
      reviewStatus: 'approved',
    })

    const carrySet = new Set(source.carryForwardTokens)
    const subjWeightRows: readonly WeightingFactorRow[] = parsedWeighting.rows.filter((r) => r.syllabusCode === code)
    for (const r of subjWeightRows) {
      const tokenKind: 'component_variant' | 'carry_forward' = carrySet.has(r.component) ? 'carry_forward' : 'component_variant'
      const ex = profile.existingWeightingEntries[`${code}:${r.component}`]
      const entry: CanonicalWeightingEntry = {
        id: ex ? ex.id : uuidv5Oid(`m5-j26-we-${code}-${r.component}-${tokenKind}`),
        weightingSourceId: meta.weightingSourceId,
        rawToken: r.component,
        tokenKind,
        rawMaximum: r.maximumRawMark,
        weightedMaximum: r.maximumWeightedMark,
        officialWeightingFactor: r.factor.toFixed(8),
        sourcePage: r.source.page,
      }
      weightingEntries.push(entry)
      weLookup.set(`${code}:${r.component}`, entry)
    }

    const specialSet = profile.specialComponentsBySubject[code] ?? new Set<string>()
    const compRows = parsedPub.rows.filter((r): r is ComponentThreshold => r.kind === 'component')
    for (const c of compRows) {
      const k = `${code}:${c.component}`
      const ex = profile.existingVariants[k]
      const isSpecial = specialSet.has(c.component)
      const paperNum = Number(c.component[0])
      const stdPaper = !isSpecial ? profile.paperMaxBySubject[code]?.[paperNum] : undefined
      if (stdPaper && stdPaper.max !== c.maximumRawMark) {
        issues.push({
          target: 'source',
          table: 'grade_threshold_component_variants',
          key: k,
          message: `Paper ${paperNum} raw max mismatch: parsed ${c.maximumRawMark}, expected ${stdPaper.max}.`,
        })
      }
      const variant: CanonicalComponentVariant = {
        id: ex ? ex.id : uuidv5Oid(`m5-j26-cv-${code}-${c.component}`),
        publicationId: meta.id,
        componentCode: c.component,
        rawMaximumMark: c.maximumRawMark,
        subjectPaperId: stdPaper ? stdPaper.id : null,
      }
      componentVariants.push(variant)
      varLookup.set(k, variant)
      for (const grade of ['A', 'B', 'C', 'D', 'E'] as const) {
        componentMarks.push({
          variantId: variant.id,
          grade,
          thresholdMark: c.thresholds[grade],
        })
      }
    }

    const comboRows = parsedPub.rows.filter((r): r is CombinationThreshold => r.kind === 'combination')
    const subjectRoutes = profile.atlasRoutesBySubject[code] ?? []
    for (const c of comboRows) {
      const canonicalKey = c.combination.replace(/\s+/g, '')
      const lookupKey = `${code}:${c.section}:${canonicalKey}`
      const ex = profile.existingCombinations[lookupKey]
      const qualLevel: 'as' | 'a_level' = c.section === 'as-level' ? 'as' : 'a_level'
      const routeType: 'as_only' | 'staged' | 'full_level' =
        c.section === 'as-level' ? 'as_only' : c.section === 'a-level-staged' ? 'staged' : 'full_level'
      const hasSpecial = c.components.some((t) => specialSet.has(t.raw))

      let eligibility: CanonicalCombination['plannerEligibility'] = 'unreviewed'
      let atlasRouteId: string | null = null
      let matchedRoute: (typeof subjectRoutes)[number] | undefined
      let comboId: string
      let weightingBasis: CanonicalCombination['weightingBasis']

      if (ex) {
        comboId = ex.id
        weightingBasis = ex.weightingBasis
        eligibility = ex.plannerEligibility
        atlasRouteId = ex.atlasRouteId
        if (routeType !== 'staged' && atlasRouteId) {
          matchedRoute = subjectRoutes.find((r) => r.id === atlasRouteId)
        }
      } else {
        comboId = uuidv5Oid(`m5-j26-combo-${code}-${c.section}-${canonicalKey}`)
        weightingBasis = 'weighted_total'
        if (hasSpecial) {
          eligibility = 'unsupported'
          atlasRouteId = null
        } else if (c.section === 'a-level-staged') {
          eligibility = 'unreviewed'
          atlasRouteId = null
        } else {
          const paperSet = new Set(c.components.map((t) => Number(t.raw[0])))
          matchedRoute = subjectRoutes.find((r) => {
            const routePapers = Object.keys(r.stages).map(Number)
            return r.routeType === routeType && routePapers.length === c.components.length && routePapers.every((p) => paperSet.has(p))
          })
          if (matchedRoute) {
            eligibility = 'eligible'
            atlasRouteId = matchedRoute.id
          } else {
            eligibility = 'unsupported'
            atlasRouteId = null
          }
        }
      }

      combinations.push({
        id: comboId,
        publicationId: meta.id,
        canonicalKey,
        qualificationLevel: qualLevel,
        routeType,
        maximumMark: c.maximumMark,
        weightingBasis,
        plannerEligibility: eligibility,
        atlasRouteId,
      })

      for (let idx = 0; idx < c.components.length; idx++) {
        const t = c.components[idx]
        const pos = idx + 1
        const tokenId = ex ? ex.tokenIds[idx] : uuidv5Oid(`m5-j26-tok-${code}-${c.section}-${canonicalKey}-${pos}-${t.raw}`)
        const isCf = t.kind === 'carry_forward'
        const resolvedVar = !isCf ? varLookup.get(`${code}:${t.raw}`) : undefined
        const we = weLookup.get(`${code}:${t.raw}`)
        if (!we) {
          issues.push({
            target: 'source',
            table: 'grade_threshold_weighting_entries',
            key: `${code}:${t.raw}`,
            message: `Missing official weighting entry for combination token ${code}:${t.raw}.`,
          })
          continue
        }
        let stage: 'as' | 'a2' | null = null
        if (isCf) stage = 'as'
        else if (c.section === 'a-level-staged') stage = 'a2'
        else if (matchedRoute) stage = matchedRoute.stages[Number(t.raw[0])] ?? null

        combinationTokens.push({
          id: tokenId,
          combinationId: comboId,
          tokenPosition: pos,
          rawToken: t.raw,
          tokenKind: t.kind,
          stage,
          resolvedComponentVariantId: resolvedVar ? resolvedVar.id : null,
          maximumMark: resolvedVar ? resolvedVar.rawMaximumMark : we.rawMaximum,
          weightingFactor: we.officialWeightingFactor,
          weightingEntryId: we.id,
          carryForwardMappingStatus: isCf ? (ex ? 'approved' : 'unreviewed') : null,
        })
      }

      const gradeOrder = qualLevel === 'as' ? ['a', 'b', 'c', 'd', 'e'] : ['A*', 'A', 'B', 'C', 'D', 'E']
      for (const grade of gradeOrder) {
        const markVal = c.thresholds[grade as keyof typeof c.thresholds]
        if (typeof markVal !== 'number') {
          issues.push({
            target: 'source',
            table: 'grade_threshold_combination_marks',
            key: `${lookupKey}:${grade}`,
            message: `Missing grade threshold mark for ${lookupKey} grade ${grade}.`,
          })
          continue
        }
        combinationMarks.push({
          id: ex ? ex.markIds[grade] : uuidv5Oid(`m5-j26-cm-${code}-${c.section}-${canonicalKey}-${grade}`),
          combinationId: comboId,
          grade,
          thresholdMark: markVal,
        })
      }
    }
  }

  if (profile.benchmarkGroup) {
    const bg = profile.benchmarkGroup
    const pubMeta = profile.publicationMetaBySubject[bg.syllabusCode]
    const paperMeta = profile.paperMaxBySubject[bg.syllabusCode]?.[bg.paperNumber]
    if (pubMeta && paperMeta) {
      benchmarkGroups.push({
        id: bg.id,
        publicationId: pubMeta.id,
        subjectPaperId: paperMeta.id,
        componentGrade: bg.componentGrade,
        rawMaximumMark: bg.rawMaximumMark,
        approvalStatus: 'approved',
      })
      for (const comp of bg.memberComponents) {
        const variant = varLookup.get(`${bg.syllabusCode}:${comp}`)
        if (!variant) {
          issues.push({
            target: 'source',
            table: 'grade_threshold_variant_benchmark_members',
            key: `${bg.syllabusCode}:${comp}`,
            message: `Missing benchmark member variant ${bg.syllabusCode}:${comp}.`,
          })
        } else {
          benchmarkMembers.push({ groupId: bg.id, componentVariantId: variant.id })
        }
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    manifest: buildManifestFromDataset({
      importRuns: [profile.importRun],
      publications,
      weightingSources,
      weightingEntries,
      componentVariants,
      componentMarks,
      benchmarkGroups,
      benchmarkMembers,
      combinations,
      combinationTokens,
      combinationMarks,
    }),
  }
}

// ─── SQL Seed & Validator Parsers ───────────────────────────────────────────

function splitSqlTuples(valuesBlock: string): string[][] {
  const tuples: string[][] = []
  let i = 0
  const n = valuesBlock.length

  while (i < n) {
    while (i < n && valuesBlock[i] !== '(') {
      if (valuesBlock[i] === '-' && valuesBlock[i + 1] === '-') {
        while (i < n && valuesBlock[i] !== '\n') i++
      } else {
        i++
      }
    }
    if (i >= n) break
    i++ // skip '('
    const fields: string[] = []
    let field = ''
    let inStr = false
    let parenDepth = 0

    while (i < n) {
      const ch = valuesBlock[i]
      if (inStr) {
        if (ch === "'" && valuesBlock[i + 1] === "'") {
          field += "''"
          i += 2
          continue
        }
        if (ch === "'") {
          inStr = false
        }
        field += ch
        i++
        continue
      }
      if (ch === "'") {
        inStr = true
        field += ch
        i++
        continue
      }
      if (ch === '(') {
        parenDepth++
        field += ch
        i++
        continue
      }
      if (ch === ')') {
        if (parenDepth === 0) {
          fields.push(field.trim())
          i++
          break
        }
        parenDepth--
        field += ch
        i++
        continue
      }
      if (ch === ',' && parenDepth === 0) {
        fields.push(field.trim())
        field = ''
        i++
        continue
      }
      field += ch
      i++
    }
    tuples.push(fields)
  }

  return tuples
}

const SQL_TYPE_CAST_RE = /::[a-z0-9_\s]+(?:\(\s*\d+(?:\s*,\s*\d+)?\s*\))?$/i

function unquoteSqlLiteral(token: string): string | null {
  const trimmed = token.trim()
  if (/^NULL(?:::[a-z0-9_\s]+(?:\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)?$/i.test(trimmed)) return null
  const withoutCast = trimmed.replace(SQL_TYPE_CAST_RE, '').trim()
  const hexMatch = withoutCast.match(/^decode\(\s*'([0-9a-f]+)'\s*,\s*'hex'\s*\)$/i)
  if (hexMatch) return hexMatch[1].toLowerCase()
  const strMatch = withoutCast.match(/^'([\s\S]*)'$/)
  if (strMatch) return strMatch[1].replace(/''/g, "'")
  return withoutCast
}

function resolveUuidExpression(token: string): string | null {
  const trimmed = token.trim()
  if (/^NULL(?:::[a-z0-9_\s]+(?:\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)?$/i.test(trimmed)) return null
  const withoutCast = trimmed.replace(SQL_TYPE_CAST_RE, '').trim()
  const str = unquoteSqlLiteral(withoutCast)
  if (str && /^[0-9a-f-]{36}$/i.test(str)) return str.toLowerCase()
  const v5Match = withoutCast.match(/^extensions\.uuid_generate_v5\(\s*extensions\.uuid_ns_oid\(\)\s*,\s*'([^']+)'\s*\)$/i)
  if (v5Match) return uuidv5Oid(v5Match[1])
  if (withoutCast === 'v_subj_9701') return '9701'
  if (withoutCast === 'v_subj_9702') return '9702'
  if (withoutCast === 'v_subj_9709') return '9709'
  if (withoutCast === 'v_subj_9231') return '9231'
  if (withoutCast === 'v_subj_9618') return '9618'
  const synthMatch = withoutCast.match(/^v_subj_([a-z0-9_]+)$/i)
  if (synthMatch) return synthMatch[1]
  return str
}

function parseSqlNumber(token: string): number {
  const clean = unquoteSqlLiteral(token) ?? token
  return Number(clean)
}

function parseSqlBoolean(token: string): boolean {
  const clean = (unquoteSqlLiteral(token) ?? token).toUpperCase()
  return clean === 'TRUE' || clean === 'T'
}

function extractInsertValuesBlocks(sql: string, tableName: string): string[][] {
  const escaped = tableName.replace(/\./g, '\\.')
  const regex = new RegExp(
    `INSERT\\s+INTO\\s+${escaped}\\s*\\([\\s\\S]*?\\)\\s*VALUES\\s*([\\s\\S]*?)\\s*(?:ON\\s+CONFLICT|;)`,
    'gi',
  )
  const allTuples: string[][] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(sql)) !== null) {
    allTuples.push(...splitSqlTuples(match[1]))
  }
  return allTuples
}

export function parseDurableSeedSql(sql: string): CanonicalCatalogueManifest {
  const importRuns: CanonicalImportRun[] = extractInsertValuesBlocks(
    sql,
    'public.grade_threshold_import_runs',
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    triggerKind: unquoteSqlLiteral(f[1])!,
    parserVersion: unquoteSqlLiteral(f[2])!,
    status: unquoteSqlLiteral(f[3])!,
  }))

  const publications: CanonicalPublication[] = extractInsertValuesBlocks(
    sql,
    'public.grade_threshold_publications',
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    importRunId: resolveUuidExpression(f[1])!,
    subjectCode: resolveUuidExpression(f[2])!,
    examYear: parseSqlNumber(f[3]),
    examSeries: unquoteSqlLiteral(f[4]) as CambridgeSeries,
    officialIndexUrl: unquoteSqlLiteral(f[5])!,
    officialPdfUrl: unquoteSqlLiteral(f[6])!,
    checksumSha256: unquoteSqlLiteral(f[7])!,
    revisionNumber: parseSqlNumber(f[9]),
    publicationStatus: unquoteSqlLiteral(f[10])!,
    isActive: parseSqlBoolean(f[11]),
  }))

  const weightingSources: CanonicalWeightingSource[] = extractInsertValuesBlocks(
    sql,
    'public.grade_threshold_weighting_sources',
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    subjectCode: resolveUuidExpression(f[1])!,
    documentYear: parseSqlNumber(f[2]),
    examSeries: unquoteSqlLiteral(f[3]) as CambridgeSeries,
    officialDocumentUrl: unquoteSqlLiteral(f[5])!,
    checksumSha256: unquoteSqlLiteral(f[6])!,
    reviewStatus: unquoteSqlLiteral(f[7])!,
  }))

  const weightingEntries: CanonicalWeightingEntry[] = extractInsertValuesBlocks(
    sql,
    'public.grade_threshold_weighting_entries',
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    weightingSourceId: resolveUuidExpression(f[1])!,
    rawToken: unquoteSqlLiteral(f[2])!,
    tokenKind: unquoteSqlLiteral(f[3]) as 'component_variant' | 'carry_forward',
    rawMaximum: parseSqlNumber(f[4]),
    weightedMaximum: parseSqlNumber(f[5]),
    officialWeightingFactor: parseSqlNumber(f[6]).toFixed(8),
    sourcePage: parseSqlNumber(f[7]),
  }))

  const componentVariants: CanonicalComponentVariant[] = extractInsertValuesBlocks(
    sql,
    'public.grade_threshold_component_variants',
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    publicationId: resolveUuidExpression(f[1])!,
    componentCode: unquoteSqlLiteral(f[2])!,
    rawMaximumMark: parseSqlNumber(f[3]),
    subjectPaperId: resolveUuidExpression(f[4]),
  }))

  const componentMarks: CanonicalComponentMark[] = extractInsertValuesBlocks(
    sql,
    'public.grade_threshold_component_marks',
  ).map((f) => ({
    variantId: resolveUuidExpression(f[0])!,
    grade: unquoteSqlLiteral(f[1]) as ComponentGrade,
    thresholdMark: parseSqlNumber(f[2]),
  }))

  const benchmarkGroups: CanonicalBenchmarkGroup[] = extractInsertValuesBlocks(
    sql,
    'public.grade_threshold_variant_benchmark_groups',
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    publicationId: resolveUuidExpression(f[1])!,
    subjectPaperId: resolveUuidExpression(f[2])!,
    componentGrade: unquoteSqlLiteral(f[3])!,
    rawMaximumMark: parseSqlNumber(f[4]),
    approvalStatus: unquoteSqlLiteral(f[5])!,
  }))

  const benchmarkMembers: CanonicalBenchmarkMember[] = extractInsertValuesBlocks(
    sql,
    'public.grade_threshold_variant_benchmark_members',
  ).map((f) => ({
    groupId: resolveUuidExpression(f[0])!,
    componentVariantId: resolveUuidExpression(f[1])!,
  }))

  const combinations: CanonicalCombination[] = extractInsertValuesBlocks(
    sql,
    'public.grade_threshold_combinations',
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    publicationId: resolveUuidExpression(f[1])!,
    canonicalKey: unquoteSqlLiteral(f[2])!,
    qualificationLevel: unquoteSqlLiteral(f[5]) as 'as' | 'a_level',
    routeType: unquoteSqlLiteral(f[6]) as CanonicalCombination['routeType'],
    maximumMark: parseSqlNumber(f[7]),
    weightingBasis: unquoteSqlLiteral(f[8]) as CanonicalCombination['weightingBasis'],
    plannerEligibility: unquoteSqlLiteral(f[9]) as CanonicalCombination['plannerEligibility'],
    atlasRouteId: resolveUuidExpression(f[10]),
  }))

  const combinationTokens: CanonicalCombinationToken[] = extractInsertValuesBlocks(
    sql,
    'public.grade_threshold_combination_tokens',
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    combinationId: resolveUuidExpression(f[1])!,
    tokenPosition: parseSqlNumber(f[2]),
    rawToken: unquoteSqlLiteral(f[3])!,
    tokenKind: unquoteSqlLiteral(f[4]) as CanonicalCombinationToken['tokenKind'],
    stage: unquoteSqlLiteral(f[5]) as 'as' | 'a2' | null,
    resolvedComponentVariantId: resolveUuidExpression(f[6]),
    maximumMark: f[7] && unquoteSqlLiteral(f[7]) !== null ? parseSqlNumber(f[7]) : null,
    weightingFactor:
      f[8] && unquoteSqlLiteral(f[8]) !== null ? parseSqlNumber(f[8]).toFixed(8) : null,
    weightingEntryId: resolveUuidExpression(f[9]),
    carryForwardMappingStatus: unquoteSqlLiteral(f[10]),
  }))

  const combinationMarks: CanonicalCombinationMark[] = extractInsertValuesBlocks(
    sql,
    'public.grade_threshold_combination_marks',
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    combinationId: resolveUuidExpression(f[1])!,
    grade: unquoteSqlLiteral(f[2])!,
    thresholdMark: parseSqlNumber(f[3]),
  }))

  return buildManifestFromDataset({
    importRuns,
    publications,
    weightingSources,
    weightingEntries,
    componentVariants,
    componentMarks,
    benchmarkGroups,
    benchmarkMembers,
    combinations,
    combinationTokens,
    combinationMarks,
  })
}

export interface ParsedValidatorSqlResult {
  readonly manifest: CanonicalCatalogueManifest
  readonly perSubjectExpectedCounts: Readonly<Record<string, {
    readonly weightingEntries: number
    readonly componentVariants: number
    readonly componentMarks: number
    readonly combinations: number
    readonly combinationTokens: number
    readonly combinationMarks: number
  }>>
}

function extractValidatorValuesSection(sql: string, sectionMarkerRegex: RegExp): string[][] {
  const sectionMatch = sql.match(sectionMarkerRegex)
  if (!sectionMatch || sectionMatch.index === undefined) return []
  const slice = sql.slice(sectionMatch.index)
  const valuesMatch = slice.match(/FROM\s*\(\s*VALUES\s*([\s\S]*?)\)\s*AS\s+v\(/i)
  if (!valuesMatch) return []
  return splitSqlTuples(valuesMatch[1])
}

export function parseCatalogueValidatorSql(sql: string): ParsedValidatorSqlResult {
  // Table 1 is a single-row CTE (`WITH expected AS (SELECT ...)`)
  const runMatch = sql.match(
    /-- ── 1\. Table 1:[\s\S]*?WITH expected AS \(\s*SELECT\s*([\s\S]*?)\)\s*,\s*actual/i,
  )
  const importRuns: CanonicalImportRun[] = []
  if (runMatch) {
    const f = splitSqlTuples(`(${runMatch[1]})`)[0] ?? []
    if (f.length >= 4) {
      importRuns.push({
        id: resolveUuidExpression(f[0].replace(/\s+AS\s+id$/i, ''))!,
        triggerKind: unquoteSqlLiteral(f[1].replace(/\s+AS\s+trigger_kind$/i, ''))!,
        parserVersion: unquoteSqlLiteral(f[2].replace(/\s+AS\s+parser_version$/i, ''))!,
        status: unquoteSqlLiteral(f[3].replace(/\s+AS\s+status$/i, ''))!,
      })
    }
  }

  const publications: CanonicalPublication[] = extractValidatorValuesSection(
    sql,
    /-- ── 2\. Table 2:/,
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    importRunId: resolveUuidExpression(f[1])!,
    subjectCode: resolveUuidExpression(f[2])!,
    examYear: parseSqlNumber(f[3]),
    examSeries: unquoteSqlLiteral(f[4]) as CambridgeSeries,
    officialIndexUrl: unquoteSqlLiteral(f[5])!,
    officialPdfUrl: unquoteSqlLiteral(f[6])!,
    checksumSha256: unquoteSqlLiteral(f[7])!,
    revisionNumber: parseSqlNumber(f[9]),
    publicationStatus: unquoteSqlLiteral(f[10])!,
    isActive: parseSqlBoolean(f[11]),
  }))

  const weightingSources: CanonicalWeightingSource[] = extractValidatorValuesSection(
    sql,
    /-- ── 3\. Table 3:/,
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    subjectCode: resolveUuidExpression(f[1])!,
    documentYear: parseSqlNumber(f[2]),
    examSeries: unquoteSqlLiteral(f[3]) as CambridgeSeries,
    officialDocumentUrl: unquoteSqlLiteral(f[5])!,
    checksumSha256: unquoteSqlLiteral(f[6])!,
    reviewStatus: unquoteSqlLiteral(f[7])!,
  }))

  const weightingEntries: CanonicalWeightingEntry[] = extractValidatorValuesSection(
    sql,
    /-- ── 4\. Table 4:/,
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    weightingSourceId: resolveUuidExpression(f[1])!,
    rawToken: unquoteSqlLiteral(f[2])!,
    tokenKind: unquoteSqlLiteral(f[3]) as 'component_variant' | 'carry_forward',
    rawMaximum: parseSqlNumber(f[4]),
    weightedMaximum: parseSqlNumber(f[5]),
    officialWeightingFactor: parseSqlNumber(f[6]).toFixed(8),
    sourcePage: parseSqlNumber(f[7]),
  }))

  const componentVariants: CanonicalComponentVariant[] = extractValidatorValuesSection(
    sql,
    /-- ── 5\. Table 5:/,
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    publicationId: resolveUuidExpression(f[1])!,
    componentCode: unquoteSqlLiteral(f[2])!,
    rawMaximumMark: parseSqlNumber(f[3]),
    subjectPaperId: resolveUuidExpression(f[4]),
  }))

  const componentMarks: CanonicalComponentMark[] = extractValidatorValuesSection(
    sql,
    /-- ── 6\. Table 6:/,
  ).map((f) => ({
    variantId: resolveUuidExpression(f[0])!,
    grade: unquoteSqlLiteral(f[1]) as ComponentGrade,
    thresholdMark: parseSqlNumber(f[2]),
  }))

  const bgMatch = sql.match(
    /-- ── 7\. Table 7:[\s\S]*?WITH expected AS \(\s*SELECT\s*([\s\S]*?)\)\s*,\s*actual/i,
  )
  const benchmarkGroups: CanonicalBenchmarkGroup[] = []
  if (bgMatch) {
    const f = splitSqlTuples(`(${bgMatch[1]})`)[0] ?? []
    if (f.length >= 6) {
      benchmarkGroups.push({
        id: resolveUuidExpression(f[0].replace(/\s+AS\s+id$/i, ''))!,
        publicationId: resolveUuidExpression(f[1].replace(/\s+AS\s+publication_id$/i, ''))!,
        subjectPaperId: resolveUuidExpression(f[2].replace(/\s+AS\s+subject_paper_id$/i, ''))!,
        componentGrade: unquoteSqlLiteral(f[3].replace(/\s+AS\s+component_grade$/i, ''))!,
        rawMaximumMark: parseSqlNumber(f[4].replace(/\s+AS\s+raw_maximum_mark$/i, '')),
        approvalStatus: unquoteSqlLiteral(f[5].replace(/\s+AS\s+approval_status$/i, ''))!,
      })
    }
  }

  const benchmarkMembers: CanonicalBenchmarkMember[] = extractValidatorValuesSection(
    sql,
    /-- ── 8\. Table 8:/,
  ).map((f) => ({
    groupId: resolveUuidExpression(f[0])!,
    componentVariantId: resolveUuidExpression(f[1])!,
  }))

  const combinations: CanonicalCombination[] = extractValidatorValuesSection(
    sql,
    /-- ── 9\. Table 9:/,
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    publicationId: resolveUuidExpression(f[1])!,
    canonicalKey: unquoteSqlLiteral(f[2])!,
    qualificationLevel: unquoteSqlLiteral(f[5]) as 'as' | 'a_level',
    routeType: unquoteSqlLiteral(f[6]) as CanonicalCombination['routeType'],
    maximumMark: parseSqlNumber(f[7]),
    weightingBasis: unquoteSqlLiteral(f[8]) as CanonicalCombination['weightingBasis'],
    plannerEligibility: unquoteSqlLiteral(f[9]) as CanonicalCombination['plannerEligibility'],
    atlasRouteId: resolveUuidExpression(f[10]),
  }))

  const combinationTokens: CanonicalCombinationToken[] = extractValidatorValuesSection(
    sql,
    /-- ── 10\. Table 10:/,
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    combinationId: resolveUuidExpression(f[1])!,
    tokenPosition: parseSqlNumber(f[2]),
    rawToken: unquoteSqlLiteral(f[3])!,
    tokenKind: unquoteSqlLiteral(f[4]) as CanonicalCombinationToken['tokenKind'],
    stage: unquoteSqlLiteral(f[5]) as 'as' | 'a2' | null,
    resolvedComponentVariantId: resolveUuidExpression(f[6]),
    maximumMark: f[7] && unquoteSqlLiteral(f[7]) !== null ? parseSqlNumber(f[7]) : null,
    weightingFactor:
      f[8] && unquoteSqlLiteral(f[8]) !== null ? parseSqlNumber(f[8]).toFixed(8) : null,
    weightingEntryId: resolveUuidExpression(f[9]),
    carryForwardMappingStatus: unquoteSqlLiteral(f[10]),
  }))

  const combinationMarks: CanonicalCombinationMark[] = extractValidatorValuesSection(
    sql,
    /-- ── 11\. Table 11:/,
  ).map((f) => ({
    id: resolveUuidExpression(f[0])!,
    combinationId: resolveUuidExpression(f[1])!,
    grade: unquoteSqlLiteral(f[2])!,
    thresholdMark: parseSqlNumber(f[3]),
  }))

  const perSubjectTuples = extractValidatorValuesSection(sql, /expected_subject_counts AS/)
  const perSubjectExpectedCounts: Record<string, {
    weightingEntries: number
    componentVariants: number
    componentMarks: number
    combinations: number
    combinationTokens: number
    combinationMarks: number
  }> = {}
  for (const f of perSubjectTuples) {
    const code = unquoteSqlLiteral(f[0])
    if (!code) continue
    perSubjectExpectedCounts[code] = {
      weightingEntries: parseSqlNumber(f[1]),
      componentVariants: parseSqlNumber(f[2]),
      componentMarks: parseSqlNumber(f[3]),
      combinations: parseSqlNumber(f[4]),
      combinationTokens: parseSqlNumber(f[5]),
      combinationMarks: parseSqlNumber(f[6]),
    }
  }

  return {
    manifest: buildManifestFromDataset({
      importRuns,
      publications,
      weightingSources,
      weightingEntries,
      componentVariants,
      componentMarks,
      benchmarkGroups,
      benchmarkMembers,
      combinations,
      combinationTokens,
      combinationMarks,
    }),
    perSubjectExpectedCounts,
  }
}

export function diffCanonicalManifests(
  expected: CanonicalCatalogueManifest,
  actual: CanonicalCatalogueManifest,
  target: 'seed' | 'validator',
): ReconciliationMismatch[] {
  const issues: ReconciliationMismatch[] = []
  const tables = Object.keys(expected.dataset) as Array<keyof CanonicalCatalogueDataset>

  const keyFor = (table: keyof CanonicalCatalogueDataset, row: Record<string, unknown>): string => {
    if (table === 'componentMarks') return `${String(row.variantId)}:${String(row.grade)}`
    if (table === 'benchmarkMembers') return `${String(row.groupId)}:${String(row.componentVariantId)}`
    return String(row.id)
  }

  for (const table of tables) {
    const expRows = expected.dataset[table] as unknown as readonly Record<string, unknown>[]
    const actRows = actual.dataset[table] as unknown as readonly Record<string, unknown>[]
    const expMap = new Map<string, string>()
    const actMap = new Map<string, string>()

    for (const r of expRows) {
      const k = keyFor(table, r)
      if (expMap.has(k)) {
        issues.push({ target, table, key: k, message: `Duplicate expected key ${k} in ${table}.` })
      }
      expMap.set(k, JSON.stringify(r))
    }

    for (const r of actRows) {
      const k = keyFor(table, r)
      if (actMap.has(k)) {
        issues.push({ target, table, key: k, message: `Duplicate actual key ${k} in ${table}.` })
      }
      actMap.set(k, JSON.stringify(r))
    }

    for (const [k, expJson] of expMap.entries()) {
      const actJson = actMap.get(k)
      if (!actJson) {
        issues.push({ target, table, key: k, message: `Missing row ${k} in ${target} ${table}.` })
      } else if (actJson !== expJson) {
        issues.push({
          target,
          table,
          key: k,
          message: `Value mismatch at ${k} in ${target} ${table}: expected ${expJson}, found ${actJson}.`,
        })
      }
    }

    for (const k of actMap.keys()) {
      if (!expMap.has(k)) {
        issues.push({ target, table, key: k, message: `Unexpected extra row ${k} in ${target} ${table}.` })
      }
    }
  }

  return issues
}

export async function reconcileCatalogueArtifacts(options: {
  readonly sources?: readonly CambridgeThresholdSource[]
  readonly thresholdPdfs: Readonly<Record<string, { readonly bytes: Uint8Array; readonly contentType?: string }>>
  readonly weightingManifest?: CambridgeWeightingSourceManifest
  readonly weightingPdf: { readonly bytes: Uint8Array; readonly contentType?: string }
  readonly seedSql: string
  readonly validatorSql?: string
  readonly extractPdfText?: (bytes: Uint8Array) => Promise<PdfExtraction>
  readonly profile?: ReconciliationProfileConfig
}): Promise<{
  readonly ok: boolean
  readonly sourceManifest?: CanonicalCatalogueManifest
  readonly seedManifest: CanonicalCatalogueManifest
  readonly validatorManifest?: CanonicalCatalogueManifest
  readonly issues: readonly ReconciliationMismatch[]
}> {
  const sourceRes = await reconcileSourcesToCatalogueManifest({
    sources: options.sources,
    thresholdPdfs: options.thresholdPdfs,
    weightingManifest: options.weightingManifest,
    weightingPdf: options.weightingPdf,
    extractPdfText: options.extractPdfText,
    profile: options.profile,
  })
  const seedManifest = parseDurableSeedSql(options.seedSql)

  if (!sourceRes.ok) {
    return {
      ok: false,
      seedManifest,
      issues: sourceRes.issues,
    }
  }

  const issues: ReconciliationMismatch[] = [
    ...diffCanonicalManifests(sourceRes.manifest, seedManifest, 'seed'),
  ]

  let validatorManifest: CanonicalCatalogueManifest | undefined
  if (options.validatorSql !== undefined) {
    const parsedValidator = parseCatalogueValidatorSql(options.validatorSql)
    validatorManifest = parsedValidator.manifest
    issues.push(...diffCanonicalManifests(sourceRes.manifest, validatorManifest, 'validator'))

    for (const [code, summary] of Object.entries(sourceRes.manifest.countsBySubject)) {
      const valSubj = parsedValidator.perSubjectExpectedCounts[code]
      if (!valSubj) {
        issues.push({
          target: 'validator',
          table: 'expected_subject_counts',
          key: code,
          message: `Missing per-subject expected count tuple for ${code} in validator SQL.`,
        })
        continue
      }
      if (
        valSubj.weightingEntries !== summary.weightingEntries ||
        valSubj.componentVariants !== summary.componentVariants ||
        valSubj.componentMarks !== summary.componentMarks ||
        valSubj.combinations !== summary.combinations ||
        valSubj.combinationTokens !== summary.combinationTokens ||
        valSubj.combinationMarks !== summary.combinationMarks
      ) {
        issues.push({
          target: 'validator',
          table: 'expected_subject_counts',
          key: code,
          message: `Validator expected_subject_counts mismatch for ${code}.`,
        })
      }
    }
  }

  return {
    ok: issues.length === 0,
    sourceManifest: sourceRes.manifest,
    seedManifest,
    validatorManifest,
    issues,
  }
}
