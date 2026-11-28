/**
 * Milestone 5: Target-Grade Marks Planner - Constrained Mark Allocation
 *
 * Implements pure deterministic constrained mark allocation:
 * - A* is treated strictly as an overall-combination threshold; paper-level A* allocations
 *   are labeled "Atlas estimate".
 * - Component floors: target-grade component benchmarks (Grade A benchmarks used as floors for A*).
 * - Component weighting: requires complete official source-backed weighting for every component.
 * - If weighting is missing, per-paper allocation is marked unavailable while overall benchmark remains visible.
 * - Allocates additional marks above floors proportionally according to headroom and student baselines.
 * - Full internal precision; rounds final raw targets upward (ceil) and rechecks weighted total.
 * - Mathematical impossibility detection when required marks exceed combination maximum or component headroom.
 * - Safety margins (+3, +5, or custom percentage) capped at combination maximum.
 */

import {
  rawMark,
  weightedMark,
  type RawMark,
  type SafetyMarginOption,
  type WeightedMark,
  type WeightingFactor,
} from './types'

export interface AllocationComponentInput {
  readonly subjectPaperId: string
  readonly componentPaperNumber: number
  readonly componentName: string
  readonly floorRawMark: RawMark | null
  readonly maxRawMark: RawMark | null
  readonly weightingFactor: WeightingFactor | null
  readonly studentBaselineRawMark: RawMark | null
}

export interface AllocationResult {
  readonly isMathematicallyPossible: boolean
  readonly impossibleReason?: string
  readonly adjustedCombinedTarget: WeightedMark
  readonly roundedPaperTargets: ReadonlyMap<string, RawMark> // subjectPaperId -> RawMark
  readonly unroundedPaperTargets: ReadonlyMap<string, number>
  readonly totalWeightedAllocated: WeightedMark
  readonly totalFloorWeighted: WeightedMark
  readonly additionalWeightedRequired: WeightedMark
}

/**
 * Apply safety margin to a combined target mark, capping at combination maximum.
 */
export function applySafetyMarginToCombinedTarget(
  officialCombinedTarget: WeightedMark,
  combinationMax: WeightedMark,
  margin: SafetyMarginOption
): WeightedMark {
  let adjusted = officialCombinedTarget as number

  if (margin.type === 'plus_3') {
    adjusted += 3
  } else if (margin.type === 'plus_5') {
    adjusted += 5
  } else if (margin.type === 'percentage') {
    const extra = (officialCombinedTarget * margin.percentageValue) / 100
    adjusted = Math.ceil(adjusted + extra)
  }

  const capped = Math.min(combinationMax, Math.max(officialCombinedTarget, adjusted))
  return weightedMark(capped)
}

/**
 * Run deterministic constrained allocation of combined target marks across components.
 */
export function allocateComponentMarks(params: {
  readonly targetCombinedMark: WeightedMark
  readonly combinationMaxMark: WeightedMark
  readonly components: readonly AllocationComponentInput[]
  readonly isAStar: boolean
}): AllocationResult {
  const { targetCombinedMark, combinationMaxMark, components } = params

  // 1. Check for complete weighting, floors, and maximums
  const hasMissingWeighting = components.some((c) => c.weightingFactor === null)
  if (hasMissingWeighting) {
    return {
      isMathematicallyPossible: false,
      impossibleReason: 'Missing official weighting factors for one or more components',
      adjustedCombinedTarget: targetCombinedMark,
      roundedPaperTargets: new Map(),
      unroundedPaperTargets: new Map(),
      totalWeightedAllocated: weightedMark(0),
      totalFloorWeighted: weightedMark(0),
      additionalWeightedRequired: weightedMark(0),
    }
  }

  const hasMissingThresholdOrMax = components.some(
    (c) => c.floorRawMark === null || c.maxRawMark === null
  )
  if (hasMissingThresholdOrMax) {
    return {
      isMathematicallyPossible: false,
      impossibleReason: 'Missing official threshold or maximum mark for one or more components',
      adjustedCombinedTarget: targetCombinedMark,
      roundedPaperTargets: new Map(),
      unroundedPaperTargets: new Map(),
      totalWeightedAllocated: weightedMark(0),
      totalFloorWeighted: weightedMark(0),
      additionalWeightedRequired: weightedMark(0),
    }
  }

  type ValidatedComponent = {
    readonly subjectPaperId: string
    readonly componentPaperNumber: number
    readonly componentName: string
    readonly floorRawMark: RawMark
    readonly maxRawMark: RawMark
    readonly weightingFactor: WeightingFactor
    readonly studentBaselineRawMark: RawMark | null
  }

  const validComponents = components as readonly ValidatedComponent[]

  // 2. Check maximum possible combined score
  let maxPossibleWeighted = 0
  let floorWeightedTotal = 0

  for (const c of validComponents) {
    const factor = c.weightingFactor
    maxPossibleWeighted += factor * c.maxRawMark
    floorWeightedTotal += factor * c.floorRawMark
  }

  if (targetCombinedMark > maxPossibleWeighted || targetCombinedMark > combinationMaxMark) {
    return {
      isMathematicallyPossible: false,
      impossibleReason: `Target mark (${targetCombinedMark}) exceeds the maximum possible score (${Math.min(
        maxPossibleWeighted,
        combinationMaxMark
      )})`,
      adjustedCombinedTarget: targetCombinedMark,
      roundedPaperTargets: new Map(),
      unroundedPaperTargets: new Map(),
      totalWeightedAllocated: weightedMark(0),
      totalFloorWeighted: weightedMark(floorWeightedTotal),
      additionalWeightedRequired: weightedMark(
        Math.max(0, targetCombinedMark - floorWeightedTotal)
      ),
    }
  }

  const additionalWeightedRequired = Math.max(0, targetCombinedMark - floorWeightedTotal)
  const unroundedPaperTargets = new Map<string, number>()

  if (additionalWeightedRequired <= 1e-9) {
    // Floor marks alone satisfy or exceed the target
    const roundedPaperTargets = new Map<string, RawMark>()
    let totalWeighted = 0

    for (const c of validComponents) {
      unroundedPaperTargets.set(c.subjectPaperId, c.floorRawMark)
      roundedPaperTargets.set(c.subjectPaperId, rawMark(c.floorRawMark))
      totalWeighted += c.weightingFactor * c.floorRawMark
    }

    return {
      isMathematicallyPossible: true,
      adjustedCombinedTarget: targetCombinedMark,
      roundedPaperTargets,
      unroundedPaperTargets,
      totalWeightedAllocated: weightedMark(totalWeighted),
      totalFloorWeighted: weightedMark(floorWeightedTotal),
      additionalWeightedRequired: weightedMark(0),
    }
  }

  // Check remaining weighted headroom above floors
  let totalHeadroomWeighted = 0
  for (const c of validComponents) {
    const headroomRaw = Math.max(0, c.maxRawMark - c.floorRawMark)
    totalHeadroomWeighted += c.weightingFactor * headroomRaw
  }

  if (additionalWeightedRequired > totalHeadroomWeighted + 1e-6) {
    return {
      isMathematicallyPossible: false,
      impossibleReason: `Additional weighted marks required (${additionalWeightedRequired.toFixed(
        1
      )}) exceed total remaining component headroom (${totalHeadroomWeighted.toFixed(1)})`,
      adjustedCombinedTarget: targetCombinedMark,
      roundedPaperTargets: new Map(),
      unroundedPaperTargets: new Map(),
      totalWeightedAllocated: weightedMark(0),
      totalFloorWeighted: weightedMark(floorWeightedTotal),
      additionalWeightedRequired: weightedMark(additionalWeightedRequired),
    }
  }

  // 3. Constrained water-filling / bounded proportional allocation
  // Weighting per component combines:
  // - demonstrated headroom student baseline above floor
  // - component remaining headroom
  const allocatedAddlRaw = new Map<string, number>()
  for (const c of validComponents) {
    allocatedAddlRaw.set(c.subjectPaperId, 0)
  }

  let remainingWeightedToDistribute = additionalWeightedRequired
  const activeComponentIds = new Set(validComponents.map((c) => c.subjectPaperId))

  // Up to validComponents.length iterations to saturate bounded components
  for (let iter = 0; iter < validComponents.length && activeComponentIds.size > 0; iter++) {
    let totalCapacityWeight = 0
    const capacities = new Map<string, number>()

    for (const c of validComponents) {
      if (!activeComponentIds.has(c.subjectPaperId)) continue

      const maxAddl = Math.max(0, c.maxRawMark - c.floorRawMark)
      const currentAddl = allocatedAddlRaw.get(c.subjectPaperId) ?? 0
      const remainingRawHeadroom = Math.max(0, maxAddl - currentAddl)

      if (remainingRawHeadroom <= 1e-9) {
        activeComponentIds.delete(c.subjectPaperId)
        continue
      }

      // Affinity weighting:
      // If student has a baseline above floor, give weight to demonstrated strength
      let affinity = 1.0
      if (c.studentBaselineRawMark !== null && c.studentBaselineRawMark > c.floorRawMark) {
        affinity += (c.studentBaselineRawMark - c.floorRawMark) / (c.maxRawMark - c.floorRawMark || 1)
      }

      const capacity = remainingRawHeadroom * affinity * c.weightingFactor
      capacities.set(c.subjectPaperId, capacity)
      totalCapacityWeight += capacity
    }

    if (totalCapacityWeight <= 1e-9 || remainingWeightedToDistribute <= 1e-9) {
      break
    }

    let newlySaturated = false
    const roundAllocations = new Map<string, number>()

    for (const c of validComponents) {
      if (!activeComponentIds.has(c.subjectPaperId)) continue

      const capacity = capacities.get(c.subjectPaperId) ?? 0
      const shareOfWeighted = remainingWeightedToDistribute * (capacity / totalCapacityWeight)
      const addlRaw = shareOfWeighted / c.weightingFactor

      const maxAddl = Math.max(0, c.maxRawMark - c.floorRawMark)
      const currentAddl = allocatedAddlRaw.get(c.subjectPaperId) ?? 0
      const remainingRawHeadroom = Math.max(0, maxAddl - currentAddl)

      if (addlRaw >= remainingRawHeadroom) {
        roundAllocations.set(c.subjectPaperId, remainingRawHeadroom)
        activeComponentIds.delete(c.subjectPaperId)
        newlySaturated = true
      } else {
        roundAllocations.set(c.subjectPaperId, addlRaw)
      }
    }

    let weightedDistributedThisRound = 0
    for (const [id, addl] of roundAllocations.entries()) {
      const c = validComponents.find((item) => item.subjectPaperId === id)!
      allocatedAddlRaw.set(id, (allocatedAddlRaw.get(id) ?? 0) + addl)
      weightedDistributedThisRound += addl * c.weightingFactor
    }

    remainingWeightedToDistribute = Math.max(
      0,
      remainingWeightedToDistribute - weightedDistributedThisRound
    )

    if (!newlySaturated || remainingWeightedToDistribute <= 1e-9) {
      break
    }
  }

  // 4. Record unrounded targets and perform upward ceiling rounding
  const roundedPaperTargets = new Map<string, RawMark>()
  let roundedWeightedTotal = 0

  for (const c of validComponents) {
    const addl = allocatedAddlRaw.get(c.subjectPaperId) ?? 0
    const unroundedRaw = Math.min(c.maxRawMark, c.floorRawMark + addl)
    unroundedPaperTargets.set(c.subjectPaperId, unroundedRaw)

    // Final raw targets rounded upward
    const rounded = Math.min(c.maxRawMark, Math.ceil(unroundedRaw))
    roundedPaperTargets.set(c.subjectPaperId, rawMark(rounded))
    roundedWeightedTotal += c.weightingFactor * rounded
  }

  // 5. Recheck: ensure rounded targets still meet the combined target
  if (roundedWeightedTotal < targetCombinedMark - 1e-6) {
    // Increment the component with largest remaining headroom
    const sortedByHeadroom = [...validComponents].sort((a, b) => {
      const aRemaining = a.maxRawMark - (roundedPaperTargets.get(a.subjectPaperId) ?? 0)
      const bRemaining = b.maxRawMark - (roundedPaperTargets.get(b.subjectPaperId) ?? 0)
      return bRemaining - aRemaining
    })

    for (const c of sortedByHeadroom) {
      const current = roundedPaperTargets.get(c.subjectPaperId) ?? c.floorRawMark
      if (current < c.maxRawMark) {
        const next = Math.min(c.maxRawMark, current + 1)
        roundedPaperTargets.set(c.subjectPaperId, rawMark(next))
        roundedWeightedTotal += c.weightingFactor * (next - current)
        if (roundedWeightedTotal >= targetCombinedMark - 1e-6) {
          break
        }
      }
    }
  }

  return {
    isMathematicallyPossible: true,
    adjustedCombinedTarget: targetCombinedMark,
    roundedPaperTargets,
    unroundedPaperTargets,
    totalWeightedAllocated: weightedMark(roundedWeightedTotal),
    totalFloorWeighted: weightedMark(floorWeightedTotal),
    additionalWeightedRequired: weightedMark(additionalWeightedRequired),
  }
}
