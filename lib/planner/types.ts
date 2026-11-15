/**
 * Milestone 5: Target-Grade Marks Planner - Types & Domain Models
 *
 * Strongly typed pure domain models and branded numeric primitives.
 * Raw marks, weighted marks, percentages, grades, and PUMs are distinct branded types.
 */

import type { PaperStage, TargetGrade } from '@/types/database'

// ─── Branded Numeric Types ───────────────────────────────────────────────────

declare const BrandSymbol: unique symbol
export type Brand<T, B extends string> = T & { readonly [BrandSymbol]: B }

export type RawMark = Brand<number, 'RawMark'>
export type WeightedMark = Brand<number, 'WeightedMark'>
export type Percentage = Brand<number, 'Percentage'>
export type Pum = Brand<number, 'Pum'>
export type WeightingFactor = Brand<number, 'WeightingFactor'>

export function rawMark(n: number): RawMark {
  if (!Number.isFinite(n)) throw new TypeError(`Expected finite number for RawMark, got ${n}`)
  return n as RawMark
}

export function weightedMark(n: number): WeightedMark {
  if (!Number.isFinite(n)) throw new TypeError(`Expected finite number for WeightedMark, got ${n}`)
  return n as WeightedMark
}

export function percentage(n: number): Percentage {
  if (!Number.isFinite(n)) throw new TypeError(`Expected finite number for Percentage, got ${n}`)
  return n as Percentage
}

export function pum(n: number): Pum {
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new TypeError(`Expected PUM between 0 and 100, got ${n}`)
  }
  return n as Pum
}

export function weightingFactor(n: number): WeightingFactor {
  if (!Number.isFinite(n) || n <= 0) {
    throw new TypeError(`Expected positive weighting factor, got ${n}`)
  }
  return n as WeightingFactor
}

// ─── Cambridge Examination Series ────────────────────────────────────────────

export type CambridgeExamSeries = 'march' | 'june' | 'november'

export interface ExamSessionSpec {
  readonly year: number
  readonly series: CambridgeExamSeries
}

// ─── Provenance & Benchmark Metadata ─────────────────────────────────────────

export type BenchmarkSourceKind = 'official_exact' | 'atlas_estimate_ceiling_average'

export type FallbackReason =
  | 'intended_series_unpublished'
  | 'incompatible_variants_or_options'

export interface ThresholdProvenance {
  readonly publicationId: string
  readonly examYear: number
  readonly examSeries: CambridgeExamSeries
  readonly officialIndexUrl: string
  readonly officialPdfUrl: string
  readonly officialPublishedOn: string | null
  readonly publishedAt: string | null
  readonly isFallback: boolean
  readonly fallbackReason?: FallbackReason
  readonly intendedYear: number
  readonly intendedSeries: CambridgeExamSeries
}

// ─── Component Variant Targets ───────────────────────────────────────────────

export interface ComponentVariantBenchmark {
  readonly subjectPaperId: string
  readonly componentPaperNumber: number
  readonly componentName: string
  readonly stage: PaperStage
  readonly sourceKind: BenchmarkSourceKind | null
  readonly targetVariantCode: string | null // null = unknown variant, ceiling average used
  readonly rawMaximumMark: RawMark | null
  readonly targetGradeFloorMark: RawMark | null
  readonly officialWeightingFactor: WeightingFactor | null
  readonly includedVariants: readonly string[] // e.g. ['11', '12', '13']
}

// ─── Full-Paper Evidence Per Component ───────────────────────────────────────

export type PerformanceTrend = 'improving' | 'declining' | 'stable'

export interface FullPaperAttemptEvidence {
  readonly attemptCount: number
  readonly latestRawScore: RawMark | null
  readonly latestRawMax: RawMark | null
  readonly officialMax: RawMark | null
  readonly latestNormalizedScore: RawMark | null
  readonly latestAttemptDate: string | null
  readonly latestHistoricalGrade: string | null
  readonly unweightedLifetimeAverage: RawMark | null
  readonly recencyWeightedBaseline: RawMark | null
  readonly variability: RawMark | null // Sample std deviation
  readonly trend: PerformanceTrend
  readonly trendDelta: number // slope in raw marks
  readonly hasSufficientSample: boolean // >= 2 comparable attempts
  readonly rollingPredictedScore: RawMark | null
}

// ─── Paper Plan Result ───────────────────────────────────────────────────────

export interface VariantOption {
  readonly variantCode: string
  readonly label: string
}

export interface PaperPlanResult {
  readonly subjectPaperId: string
  readonly componentPaperNumber: number
  readonly componentName: string
  readonly stage: PaperStage
  readonly targetVariantChoice: string | 'unknown'
  readonly sourceKind: BenchmarkSourceKind | null
  readonly rawMaximumMark: RawMark | null
  readonly benchmarkFloorMark: RawMark | null
  readonly requiredMark: RawMark | null
  readonly requiredMarkWithSafetyMargin: RawMark | null
  readonly isAllocationAvailable: boolean
  readonly allocationUnavailableReason?: string
  readonly officialWeightingFactor: WeightingFactor | null
  readonly evidence: FullPaperAttemptEvidence
  readonly latestGap: RawMark | null // benchmark/requiredMark - latestScore
  readonly lifetimeAverageGap: RawMark | null
  readonly baselineGap: RawMark | null
  readonly includedVariants: readonly string[]
  readonly availableVariants: readonly VariantOption[]
  readonly hasApprovedAverage: boolean
  readonly variantError?: string
  readonly isAStarEstimate: boolean
}

// ─── Staged A* Domain ───────────────────────────────────────────────────────

export interface StagedAStarEstimateContribution {
  readonly kind: 'estimated_halfway'
  readonly estimatedAsContribution: WeightedMark // ceil(T / 2)
  readonly remainingA2Required: WeightedMark // T - estimatedAsContribution
  readonly a2MaximumWeightedMark: WeightedMark
  readonly isMathematicallyPossible: boolean
}

export interface VerifiedOfficialWeightedAsContribution {
  readonly kind: 'verified_official_weighted_as_mark'
  readonly weightedMark: WeightedMark
  readonly maxWeightedMark: WeightedMark
}

export interface StagedAStarVerifiedContribution {
  readonly kind: 'verified_official'
  readonly officialWeightedAsContribution: WeightedMark
  readonly remainingA2Required: WeightedMark
  readonly a2MaximumWeightedMark: WeightedMark
  readonly isMathematicallyPossible: boolean
}

export type StagedAStarBreakdown =
  | StagedAStarEstimateContribution
  | StagedAStarVerifiedContribution

// ─── Safety Margin Configuration ─────────────────────────────────────────────

export type SafetyMarginOption =
  | { readonly type: 'none' }
  | { readonly type: 'plus_3'; readonly marks: 3 }
  | { readonly type: 'plus_5'; readonly marks: 5 }
  | { readonly type: 'percentage'; readonly percentageValue: number }

// ─── Subject-Level Plan Summary ──────────────────────────────────────────────

export interface SubjectLevelPlanSummary {
  readonly subjectId: string
  readonly subjectName: string
  readonly subjectCode: string | null
  readonly colorHex: string
  readonly studyRoute: string
  readonly targetGrade: TargetGrade
  readonly officialCombinedTarget: WeightedMark | null
  readonly combinedMaximumMark: WeightedMark | null
  readonly estimatedCombinedMark: WeightedMark | null
  readonly marksStillNeeded: WeightedMark | null
  readonly latestComparableGrade: string | null
  readonly rollingPredictedGrade: string | null
  readonly stagedBreakdown: StagedAStarBreakdown | null
  readonly provenance: ThresholdProvenance
  readonly perPaperAllocationEligible: boolean
  readonly safetyMargin: SafetyMarginOption
  readonly adjustedCombinedTarget: WeightedMark | null
  readonly resolvedOptionCode: string | null
  readonly isOptionResolved: boolean
  readonly overallThresholdUnavailableReason?: string
  readonly estimatedCombinedUnavailableReason?: string
  readonly safetyMarginImpossible?: boolean
  readonly safetyMarginImpossibleReason?: string
}

// ─── Discriminated Planner Result Union ──────────────────────────────────────

export type PlannerResult =
  | {
      readonly status: 'available'
      readonly summary: SubjectLevelPlanSummary
      readonly paperPlans: readonly PaperPlanResult[]
    }
  | {
      readonly status: 'unconfirmed-route'
      readonly message: string
    }
  | {
      readonly status: 'no-target-grade'
      readonly message: string
    }
  | {
      readonly status: 'no-exam-session'
      readonly message: string
    }
  | {
      readonly status: 'no-approved-combination'
      readonly message: string
      readonly route: string
      readonly subjectCode: string | null
    }
  | {
      readonly status: 'missing-weighting'
      readonly summary: SubjectLevelPlanSummary
      readonly paperPlans: readonly PaperPlanResult[]
      readonly message: string
    }
  | {
      readonly status: 'threshold-unavailable'
      readonly message: string
      readonly reason: string
    }
  | {
      readonly status: 'impossible-target'
      readonly summary: SubjectLevelPlanSummary
      readonly message: string
      readonly reason: string
    }
  | {
      readonly status: 'partial-paper-coverage'
      readonly message: string
      readonly unconfiguredPaperNames: readonly string[]
    }
  | {
      readonly status: 'query-failure'
      readonly message: string
      readonly error: string
    }

// ─── Milestone 5 Slice 2B: Carry-Forward Planner Resolution Types ──────────

import type {
  ConfirmedCarryForwardEvidenceRecord,
  NonEmptyReadonlyArray,
} from '@/lib/grade-thresholds/types'

export type {
  NonEmptyReadonlyArray,
  OfficialDocumentSourceProvenance,
  ExamSessionIdentity,
  ConfirmedTerritoryScope,
  TerritoryScope,
  CarryForwardEvidenceRecord,
  ConfirmedCarryForwardEvidenceRecord,
  CarryForwardOptionGroup,
} from '@/lib/grade-thresholds/types'

/**
 * Policy provenance backing a calendar validity assessment.
 */
export interface PolicyProvenance {
  readonly policyDocumentTitle: string
  readonly policyPublisher: string
  readonly policyUrl?: string
  readonly policyLocator?: string
  readonly publishedOrEffectiveDate?: string
}

/**
 * Outcome of a source-backed calendar validity assessment.
 */
export type CalendarValidityOutcome =
  | {
      readonly status: 'within_window'
      readonly withinWindowReason: string
    }
  | {
      readonly status: 'stale'
      readonly staleReason: string
    }

/**
 * Discriminated union of calendar validity calculation bases.
 * Requires either an elapsed-month count or both exact evaluated session dates.
 * It is impossible to construct an assessment with neither basis.
 */
export type CalendarValidityMeasurement =
  | {
      readonly measurementBasis: 'elapsed_months'
      readonly elapsedMonths: number
    }
  | {
      readonly measurementBasis: 'exact_dates'
      readonly evaluatedDates: {
        readonly carriedFromSessionDate: string
        readonly targetSittingSessionDate: string
      }
      readonly derivedElapsedMonths?: number
    }

/**
 * Source-backed calendar validity assessment.
 * Evaluates calendar months or exact evaluated dates against policy provenance,
 * rather than inferring validity from session counts.
 * Session identities are maintained canonically on confirmed evidence or at the
 * stale-outcome boundary to prevent contradictory duplication.
 */
export type CalendarValidityAssessment = CalendarValidityMeasurement & {
  readonly maximumAllowedMonths: number
  readonly policyProvenance: PolicyProvenance
  readonly outcome: CalendarValidityOutcome
}

/**
 * Discriminated union of planner-facing resolution outcomes for staged
 * carry-forward evidence evaluation.
 *
 * Types only — no runtime integration or evaluation logic in Slice 2B.
 * Strongly enforces branded numeric types: raw marks and weighted marks
 * are strictly non-interchangeable.
 */
export type CarryForwardPlannerResolution =
  | {
      readonly status: 'resolved_compatible'
      readonly confirmedEvidence: ConfirmedCarryForwardEvidenceRecord
      readonly studentTerritoryOrZone: string
      readonly officialWeightedAsContribution: WeightedMark
      readonly maxWeightedAsContribution: WeightedMark
      readonly calendarValidity: CalendarValidityAssessment & {
        readonly outcome: Extract<CalendarValidityOutcome, { readonly status: 'within_window' }>
      }
    }
  | {
      readonly status: 'territory_mismatch'
      readonly confirmedEvidence: ConfirmedCarryForwardEvidenceRecord
      readonly studentTerritoryOrZone: string
      readonly mismatchReason: string
    }
  | {
      readonly status: 'territory_scope_unresolved'
      readonly syllabusCode: string
      readonly entryOptionCode?: string
      readonly combinationKey?: string
      readonly studentTerritoryOrZone: string
      readonly reason: string
      readonly detail?: string
    }
  | {
      readonly status: 'ambiguous_historical_result'
      readonly syllabusCode: string
      readonly entryOptionCode?: string
      readonly candidateHistoricalSessions: readonly ExamSessionSpec[]
      readonly ambiguityReason: string
      readonly message: string
    }
  | {
      readonly status: 'stale_outside_validity_window'
      readonly syllabusCode: string
      readonly entryOptionCode?: string
      readonly historicalSession: ExamSessionSpec
      readonly targetSittingSession: ExamSessionSpec
      readonly calendarValidity: CalendarValidityAssessment & {
        readonly outcome: Extract<CalendarValidityOutcome, { readonly status: 'stale' }>
      }
      readonly reason: string
    }
  | {
      readonly status: 'missing_official_weighted_as_contribution'
      readonly syllabusCode: string
      readonly entryOptionCode: string
      readonly carriedFromSession: ExamSessionSpec
      readonly carriedAsComponents: NonEmptyReadonlyArray<string>
      readonly rawMarkProvided?: RawMark
      readonly reason: string
    }
  | {
      readonly status: 'unsupported_option_or_combination'
      readonly syllabusCode: string
      readonly entryOptionCode?: string
      readonly combinationKey?: string
      readonly rawCarryForwardToken?: string
      readonly reason: string
      readonly unsupportedScope?: string
    }
