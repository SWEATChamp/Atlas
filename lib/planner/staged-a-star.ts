/**
 * Milestone 5: Target-Grade Marks Planner - Staged A* through E Pathway & AS Contribution
 *
 * Implements pure evaluation of Staged A Level routes targeting A* through E:
 * - Without a verified official weighted AS mark, derives a provisional AS benchmark from
 *   the validated official carry-forward weighting share:
 *     estimatedAsContribution = Math.ceil(officialCombinedTarget * carryForwardWeightingShare)
 *   labeled as an "Atlas Estimate (Provisional AS Benchmark)".
 * - Remaining A2 marks required:
 *     remainingA2Required = officialCombinedTarget - officialWeightedAsContribution.
 * - Detects when remaining A2 requirement exceeds the available weighted A2 maximum.
 *
 * Trust & schema boundary:
 * - Callers cannot supply verifiedAsContribution over the public server-action boundary.
 * - The server action queries subject_stage_results server-side and constructs
 *   VerifiedOfficialWeightedAsContribution only for an unambiguous row owned by the
 *   signed-in user's active enrollment with stage = 'as', result_type = 'actual',
 *   carry_forward = true, exact carried exam_year/exam_series, and exact score_maximum
 *   matching the selected official carry-forward token contract.
 */

import {
  weightedMark,
  type StagedAStarBreakdown,
  type StagedAStarEstimateContribution,
  type StagedAStarVerifiedContribution,
  type VerifiedOfficialWeightedAsContribution,
  type WeightedMark,
} from './types'

export interface EvaluateStagedAStarParams {
  readonly officialCombinedTarget: WeightedMark
  readonly a2MaximumWeightedMark: WeightedMark | null
  readonly carryForwardWeightingShare: number
  readonly verifiedAsContribution?: VerifiedOfficialWeightedAsContribution | null
}

/**
 * Pure evaluation of Staged A Level target requirements across A* through E.
 * Derives provisional AS contribution strictly from the validated official
 * carry-forward weighting share (no assumed fallback) when no verified
 * weighted AS mark is supplied.
 */
export function evaluateStagedAStar(
  params: EvaluateStagedAStarParams
): StagedAStarBreakdown {
  const {
    officialCombinedTarget,
    a2MaximumWeightedMark,
    carryForwardWeightingShare,
    verifiedAsContribution,
  } = params

  if (
    !Number.isFinite(carryForwardWeightingShare) ||
    carryForwardWeightingShare <= 0 ||
    carryForwardWeightingShare >= 1
  ) {
    throw new TypeError(
      `Expected carryForwardWeightingShare strictly between 0 and 1, got ${carryForwardWeightingShare}`
    )
  }

  if (verifiedAsContribution && verifiedAsContribution.kind === 'verified_official_weighted_as_mark') {
    const contribution = verifiedAsContribution.weightedMark
    const remainingA2Required = weightedMark(
      Math.max(0, officialCombinedTarget - contribution)
    )
    const isMathematicallyPossible =
      a2MaximumWeightedMark !== null ? remainingA2Required <= a2MaximumWeightedMark : null

    const result: StagedAStarVerifiedContribution = {
      kind: 'verified_official',
      officialWeightedAsContribution: contribution,
      remainingA2Required,
      a2MaximumWeightedMark,
      isMathematicallyPossible,
    }
    return result
  }

  // Provisional Atlas AS estimate derived strictly from official carry-forward weighting share
  const estimatedAsContribution = weightedMark(
    Math.ceil(officialCombinedTarget * carryForwardWeightingShare)
  )
  const remainingA2Required = weightedMark(
    Math.max(0, officialCombinedTarget - estimatedAsContribution)
  )
  const isMathematicallyPossible =
    a2MaximumWeightedMark !== null ? remainingA2Required <= a2MaximumWeightedMark : null

  const result: StagedAStarEstimateContribution = {
    kind: 'estimated_halfway',
    estimatedAsContribution,
    remainingA2Required,
    a2MaximumWeightedMark,
    isMathematicallyPossible,
  }
  return result
}
