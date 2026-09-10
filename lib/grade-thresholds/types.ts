export const CAMBRIDGE_SERIES = ['march', 'june', 'november'] as const
export type CambridgeSeries = (typeof CAMBRIDGE_SERIES)[number]

export const THRESHOLD_SECTIONS = [
  'component',
  'a-level-linear',
  'a-level-staged',
  'as-level',
] as const
export type ThresholdSection = (typeof THRESHOLD_SECTIONS)[number]

export type ComponentGrade = 'A' | 'B' | 'C' | 'D' | 'E'
export type ALevelGrade = 'A*' | ComponentGrade
export type ASLevelGrade = 'a' | 'b' | 'c' | 'd' | 'e'
export type ThresholdGrade = ALevelGrade | ASLevelGrade

export interface PdfTextItem {
  readonly page: number
  readonly text: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface ReconstructedRow {
  readonly page: number
  readonly y: number
  readonly text: string
  readonly rawTokens: readonly string[]
}

export interface SourceLocation {
  readonly page: number
  readonly reconstructedRow: string
  readonly rawTokens: readonly string[]
}

export interface OfficialWeightingProvenance {
  readonly syllabusCode: string
  readonly year: number
  readonly series: CambridgeSeries
  readonly documentChecksumSha256: string
  readonly sourceUrl: string
  readonly componentFactors: readonly {
    readonly rawToken: string
    readonly factor: number
  }[]
}

export interface ComponentThreshold {
  readonly kind: 'component'
  readonly component: string
  readonly maximumRawMark: number
  readonly thresholds: Readonly<Record<ComponentGrade, number>>
  readonly officialWeighting: OfficialWeightingProvenance | null
  readonly source: SourceLocation
}

export interface CombinationToken {
  readonly raw: string
  readonly kind: 'component_variant' | 'carry_forward' | 'special' | 'unresolved'
}

export interface CombinationThreshold {
  readonly kind: 'combination'
  readonly section: Exclude<ThresholdSection, 'component'>
  readonly combination: string
  readonly components: readonly CombinationToken[]
  readonly maximumMark: number
  readonly maximumMarkBasis: 'weighted'
  readonly thresholds: Readonly<Partial<Record<ThresholdGrade, number>>>
  readonly officialWeighting: OfficialWeightingProvenance | null
  readonly source: SourceLocation
}

export type ParsedThresholdRow = ComponentThreshold | CombinationThreshold

export type ParserIssueCode =
  | 'checksum-mismatch'
  | 'conflicting-duplicate'
  | 'golden-fixture-mismatch'
  | 'malformed-columns'
  | 'missing-section'
  | 'non-monotonic-thresholds'
  | 'non-pdf-metadata'
  | 'not-pdf'
  | 'out-of-range-threshold'
  | 'row-count-mismatch'
  | 'unresolved-combination-token'
  | 'unexpected-numerical-row'
  | 'wrong-grade-count'
  | 'wrong-identity'
  | 'wrong-page-count'

export interface ParserIssue {
  readonly code: ParserIssueCode
  readonly message: string
  readonly page?: number
  readonly reconstructedRow?: string
}

export type ValidationState =
  | { readonly status: 'valid'; readonly issues: readonly [] }
  | { readonly status: 'invalid'; readonly issues: readonly ParserIssue[] }

export interface ParsedThresholdPublication {
  readonly syllabusCode: string
  readonly syllabusName: string
  readonly year: number
  readonly series: CambridgeSeries
  readonly checksumSha256: string
  readonly pageCount: number
  readonly rows: readonly ParsedThresholdRow[]
  readonly validation: ValidationState
}

export interface StructuralExpectations {
  readonly pageCount: number
  readonly rowCounts: Readonly<Record<ThresholdSection, number>>
}

export interface ComponentGoldenFixture {
  readonly kind: 'component'
  readonly component: string
  readonly maximumMark: number
  readonly thresholds: Readonly<Record<ComponentGrade, number>>
}

export interface CombinationGoldenFixture {
  readonly kind: 'combination'
  readonly section: Exclude<ThresholdSection, 'component'>
  readonly combination: string
  readonly maximumMark: number
  readonly thresholds: Readonly<Partial<Record<ThresholdGrade, number>>>
}

export type GoldenFixture = ComponentGoldenFixture | CombinationGoldenFixture

export interface CambridgeThresholdSource {
  readonly syllabusCode: string
  readonly syllabusName: string
  readonly qualificationTitle: string
  readonly year: number
  readonly series: CambridgeSeries
  readonly indexUrl: string
  readonly pdfUrl: string
  readonly expectedChecksumSha256: string
  readonly expectedIdentityLines: readonly string[]
  readonly carryForwardTokens: readonly string[]
  readonly carryForwardTokenBasis: 'reviewed-structural-mapping'
  readonly expectedStructure: StructuralExpectations
  readonly goldenFixtures: readonly GoldenFixture[]
}

export interface PdfExtraction {
  readonly pageCount: number
  readonly items: readonly PdfTextItem[]
}

export type ThresholdParseResult =
  | { readonly status: 'duplicate'; readonly checksumSha256: string }
  | { readonly status: 'parsed'; readonly publication: ParsedThresholdPublication }

export interface ImportedPublicationIdentity {
  readonly syllabusCode: string
  readonly year: number
  readonly series: CambridgeSeries
  readonly checksumSha256: string
}

export interface ThresholdParseOptions {
  readonly alreadyImportedPublications?: readonly ImportedPublicationIdentity[]
  readonly contentType: string
  readonly extract: (bytes: Uint8Array) => Promise<PdfExtraction>
}
