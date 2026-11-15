/**
 * Milestone 5: Target-Grade Marks Planner - Staged A* Pathway & AS Contribution
 *
 * Implements pure evaluation of the Staged A Level route targeting A*:
 * - Without a verified official weighted AS mark, uses:
 *     estimatedAsContribution = Math.ceil(officialCombinedTarget / 2)
 *   labeled as an "Atlas estimate (halfway benchmark)".
 * - Remaining A2 marks required:
 *     remainingA2Required = officialCombinedTarget - officialWeightedAsContribution.
 * - Detects when remaining A2 requirement exceeds the available weighted A2 maximum.
 *
 * Schema boundary:
 * Existing subject_stage_results.score_obtained does not distinguish whether a stored value
 * is officially weighted raw, ordinary raw, percentage, or PUM.
 * Database rows from subject_stage_results are NOT fed into this adapter.
 * The typed adapter VerifiedOfficialWeightedAsContribution is provided for explicitly verified
 * values (tested in unit tests, ready for future approved schema changes).
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
  readonly a2MaximumWeightedMark: WeightedMark
  readonly verifiedAsContribution?: VerifiedOfficialWeightedAsContribution | null
}

/**
 * Pure evaluation of Staged A* target requirements.
 */
export function evaluateStagedAStar(
  params: EvaluateStagedAStarParams
): StagedAStarBreakdown {
  const { officialCombinedTarget, a2MaximumWeightedMark, verifiedAsContribution } = params

  if (verifiedAsContribution && verifiedAsContribution.kind === 'verified_official_weighted_as_mark') {
    const contribution = verifiedAsContribution.weightedMark
    const remainingA2Required = weightedMark(
      Math.max(0, officialCombinedTarget - contribution)
    )
    const isMathematicallyPossible = remainingA2Required <= a2MaximumWeightedMark

    const result: StagedAStarVerifiedContribution = {
      kind: 'verified_official',
      officialWeightedAsContribution: contribution,
      remainingA2Required,
      a2MaximumWeightedMark,
      isMathematicallyPossible,
    }
    return result
  }

  // Fallback / default: Estimated halfway AS contribution
  const estimatedAsContribution = weightedMark(Math.ceil(officialCombinedTarget / 2))
  const remainingA2Required = weightedMark(
    Math.max(0, officialCombinedTarget - estimatedAsContribution)
  )
  const isMathematicallyPossible = remainingA2Required <= a2MaximumWeightedMark

  const result: StagedAStarEstimateContribution = {
    kind: 'estimated_halfway',
    estimatedAsContribution,
    remainingA2Required,
    a2MaximumWeightedMark,
    isMathematicallyPossible,
  }
  return result
}
