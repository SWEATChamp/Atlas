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

// ─── Milestone 5 Slice 2B: Carry-Forward Evidence Contracts ──────────────────

/**
 * Reusable non-empty readonly tuple type ensuring at least one element.
 */
export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

/**
 * Official document source provenance for syllabus entry option
 * and carry-forward evidence documents.
 */
export interface OfficialDocumentSourceProvenance {
  readonly documentTitle: string
  readonly issuer: string
  readonly sourceUrl: string
  readonly checksumSha256: string
  readonly pageLocator: string
  readonly publicationOrEffectiveDate?: string
  readonly reviewerIdentity: string
  readonly reviewTimestamp: string
  readonly evidenceVersion: string
}

/**
 * Explicit examination-session identity for sitting and carried-from sessions.
 * Never infer series or session from raw token characters or digits.
 */
export interface ExamSessionIdentity {
  readonly year: number
  readonly series: CambridgeSeries
  readonly qualificationTitle: string
  readonly syllabusCode: string
}

/**
 * Confirmed territory scope modeled as explicit alternatives with non-empty lists:
 * - administrative-zone scope with a non-empty zone list;
 * - territory scope with a non-empty territory list;
 * - explicitly documented global scope.
 * Cannot consist of two empty arrays.
 */
export type ConfirmedTerritoryScope =
  | {
      readonly scopeBasis: 'administrative_zone'
      readonly administrativeZones: NonEmptyReadonlyArray<string>
      readonly includedTerritories?: readonly string[]
      readonly scopeDeclaration: string
      readonly notes?: string
    }
  | {
      readonly scopeBasis: 'territory'
      readonly includedTerritories: NonEmptyReadonlyArray<string>
      readonly administrativeZones?: readonly string[]
      readonly scopeDeclaration: string
      readonly notes?: string
    }
  | {
      readonly scopeBasis: 'global'
      readonly scopeDeclaration: string
      readonly notes?: string
    }

/**
 * Explicit territory and administrative scope for source evidence.
 * Describes only what the evidence source covers; does not evaluate student-specific state.
 */
export type TerritoryScope =
  | ({ readonly status: 'confirmed' } & ConfirmedTerritoryScope)
  | {
      readonly status: 'unresolved'
      readonly reportedZonesOrTerritories?: readonly string[]
      readonly reason: string
    }
  | {
      readonly status: 'unsupported'
      readonly reason: string
    }

/**
 * Discriminated union representing the review and authorization state
 * of a carry-forward evidence record.
 */
export type CarryForwardEvidenceRecord =
  | {
      readonly status: 'confirmed'
      readonly id: string
      readonly syllabusCode: string
      readonly entryOptionCode: string
      readonly combinationKey: string
      readonly rawCarryForwardToken: string
      readonly sittingSession: ExamSessionIdentity
      readonly carriedFromSession: ExamSessionIdentity
      readonly sittingComponents: NonEmptyReadonlyArray<string>
      readonly carriedAsComponents: NonEmptyReadonlyArray<string>
      readonly applicablePaperVariants?: NonEmptyReadonlyArray<string>
      readonly territoryScope: Extract<TerritoryScope, { readonly status: 'confirmed' }>
      readonly provenance: OfficialDocumentSourceProvenance
      readonly authorization: {
        readonly authorizedBy: string
        readonly authorizedAt: string
        readonly notes?: string
      }
    }
  | {
      readonly status: 'unresolved'
      readonly id: string
      readonly syllabusCode: string
      readonly entryOptionCode: string
      readonly combinationKey: string
      readonly rawCarryForwardToken: string
      readonly sittingSession: ExamSessionIdentity
      readonly candidateCarriedFromSessions?: readonly ExamSessionIdentity[]
      readonly territoryScope: Extract<TerritoryScope, { readonly status: 'unresolved' }> | null
      readonly unresolvedReasons: readonly string[]
      readonly provisionalProvenance?: Partial<OfficialDocumentSourceProvenance>
    }
  | {
      readonly status: 'ambiguous'
      readonly id: string
      readonly syllabusCode: string
      readonly entryOptionCode: string
      readonly combinationKey: string
      readonly rawCarryForwardToken: string
      readonly sittingSession: ExamSessionIdentity
      readonly candidateMappings: readonly {
        readonly candidateId: string
        readonly carriedFromSession: ExamSessionIdentity
        readonly carriedAsComponents: readonly string[]
        readonly sourceProvenance: Partial<OfficialDocumentSourceProvenance>
        readonly ambiguityDetail: string
      }[]
      readonly ambiguityReason: string
    }
  | {
      readonly status: 'unsupported'
      readonly id: string
      readonly syllabusCode: string
      readonly entryOptionCode: string
      readonly combinationKey: string
      readonly rawCarryForwardToken: string
      readonly sittingSession: ExamSessionIdentity
      readonly unsupportedReason: string
      readonly territoryScope?: Extract<TerritoryScope, { readonly status: 'unsupported' }>
      readonly documentedAlternative?: string
    }
  | {
      readonly status: 'rejected'
      readonly id: string
      readonly syllabusCode: string
      readonly entryOptionCode: string
      readonly combinationKey: string
      readonly rawCarryForwardToken: string
      readonly sittingSession: ExamSessionIdentity
      readonly rejectionReason: string
      readonly rejectedBy: string
      readonly rejectedAt: string
      readonly auditProvenance?: Partial<OfficialDocumentSourceProvenance>
    }
  | {
      readonly status: 'no_evidence'
      readonly syllabusCode: string
      readonly entryOptionCode?: string
      readonly combinationKey: string
      readonly rawCarryForwardToken: string
      readonly sittingSession: ExamSessionIdentity
      readonly explanation: string
    }

/**
 * Reusable type alias for verified, confirmed carry-forward evidence records.
 */
export type ConfirmedCarryForwardEvidenceRecord = Extract<
  CarryForwardEvidenceRecord,
  { readonly status: 'confirmed' }
>

/**
 * Group of carry-forward option mappings for a syllabus and sitting session.
 * Preserves every mapping independently without collapsing records by token value.
 */
export interface CarryForwardOptionGroup {
  readonly groupId: string
  readonly syllabusCode: string
  readonly sittingSession: ExamSessionIdentity
  readonly mappings: readonly CarryForwardEvidenceRecord[]
}
