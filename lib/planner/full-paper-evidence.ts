/**
 * Milestone 5: Target-Grade Marks Planner - Full-Paper Evidence & Analytics
 *
 * Implements pure evaluation of compatible full-paper attempts:
 * - Strictly processes past_papers rows only; practice_sessions are completely isolated.
 * - Validates scores, components, stages, variants, and positive maximums.
 * - Normalizes marks to official planning component maximums:
 *     normalizedScore = (score_raw / score_max) * official_component_max.
 * - Rank-linear recency weighting: 1.0 (oldest) to 2.0 (newest); single attempt receives 1.0.
 * - Deterministic tie-breaking: attempted_at ASC, created_at ASC, id ASC.
 * - Keeps separate: latest result, unweighted lifetime average, recency-weighted baseline,
 *   attempt count, variability (sample std dev), trend, and predicted result.
 * - Conservative minimum sample of 2 attempts required for rolling predicted results.
 * - Historical attempts graded against their own session's threshold, never latest planning threshold.
 */

import type { PaperSession, PaperStage } from '@/types/database'
import { mapPaperSessionToSeries } from './series'
import {
  rawMark,
  type CambridgeExamSeries,
  type FullPaperAttemptEvidence,
  type PerformanceTrend,
  type RawMark,
} from './types'

export type AttemptExclusionReason =
  | 'malformed-score'
  | 'incompatible-subject'
  | 'incompatible-stage'
  | 'missing-component-mapping'
  | 'missing-variant'
  | 'incompatible-variant'
  | 'invalid-maximum'

export interface RawPastPaperAttempt {
  readonly id: string
  readonly subject_id: string
  readonly subject_paper_id: string | null
  readonly paper_number: number | null
  readonly year: number
  readonly session: PaperSession
  readonly stage: PaperStage | null
  readonly attempted_at: string
  readonly created_at: string
  readonly score_raw: number
  readonly score_max: number
}

export interface ValidatedCompatibleAttempt {
  readonly id: string
  readonly subjectId: string
  readonly subjectPaperId: string
  readonly componentPaperNumber: number // base number 1..9
  readonly variantCode: string // e.g. "12", "42"
  readonly year: number
  readonly session: PaperSession
  readonly series: CambridgeExamSeries
  readonly stage: PaperStage
  readonly attemptedAt: string
  readonly createdAt: string
  readonly scoreRaw: RawMark
  readonly scoreMax: RawMark
  readonly officialMax: RawMark
  readonly normalizedScore: RawMark
}

export interface ExcludedAttemptRecord {
  readonly attemptId: string
  readonly reason: AttemptExclusionReason
  readonly details: string
}

export interface HistoricalVariantThresholdLookup {
  readonly rawMaximumMark: number
  readonly thresholds: {
    readonly A: number
    readonly B: number
    readonly C: number
    readonly D: number
    readonly E: number
  }
}

export type HistoricalThresholdGetter = (
  year: number,
  series: CambridgeExamSeries,
  variantCode: string
) => HistoricalVariantThresholdLookup | null

/**
 * Extract component base paper number (e.g. 12 -> 1, 42 -> 4, 1 -> 1).
 */
export function basePaperNumber(number: number | null): number | null {
  if (number === null) return null
  if (number >= 11 && number <= 99) {
    return Math.floor(number / 10)
  }
  if (number >= 1 && number <= 9) {
    return number
  }
  return null
}

/**
 * Extract 2-digit variant code from paper_number (e.g. 12 -> "12").
 * Single digit without variant returns null (ambiguous variant).
 */
export function extractVariantCode(
  number: number | null,
  expectedComponentNumber?: number
): string | null {
  if (number === null) return null
  if (number >= 11 && number <= 99 && number % 10 >= 1 && number % 10 <= 9) {
    if (
      expectedComponentNumber !== undefined &&
      Math.floor(number / 10) !== expectedComponentNumber
    ) {
      return null
    }
    return String(number)
  }
  return null
}

/**
 * Filter, validate, and normalize past_papers attempts for a specific component.
 */
export function filterAndNormalizeAttempts(
  attempts: readonly RawPastPaperAttempt[],
  target: {
    readonly subjectId: string
    readonly subjectPaperId: string
    readonly componentPaperNumber: number
    readonly stage: PaperStage
    readonly officialComponentMax: RawMark | null
    readonly targetVariantCode?: string | null
    readonly allowedVariants?: readonly string[]
  }
): {
  readonly compatible: readonly ValidatedCompatibleAttempt[]
  readonly excluded: readonly ExcludedAttemptRecord[]
} {
  const compatible: ValidatedCompatibleAttempt[] = []
  const excluded: ExcludedAttemptRecord[] = []

  for (const a of attempts) {
    // 1. Subject match
    if (a.subject_id !== target.subjectId) {
      excluded.push({
        attemptId: a.id,
        reason: 'incompatible-subject',
        details: `Attempt subject ${a.subject_id} does not match target ${target.subjectId}`,
      })
      continue
    }

    // 2. Stage match
    if (!a.stage || a.stage !== target.stage) {
      excluded.push({
        attemptId: a.id,
        reason: 'incompatible-stage',
        details: `Attempt stage ${a.stage} does not match target component stage ${target.stage}`,
      })
      continue
    }

    // 3. Score validity
    if (
      !Number.isFinite(a.score_raw) ||
      !Number.isFinite(a.score_max) ||
      a.score_max <= 0 ||
      a.score_raw < 0 ||
      a.score_raw > a.score_max
    ) {
      excluded.push({
        attemptId: a.id,
        reason: 'malformed-score',
        details: `Invalid score raw=${a.score_raw}, max=${a.score_max}`,
      })
      continue
    }

    // 4. Exact non-null subject_paper_id and component base number match
    if (!a.subject_paper_id || a.subject_paper_id !== target.subjectPaperId) {
      excluded.push({
        attemptId: a.id,
        reason: 'missing-component-mapping',
        details: `Attempt paper id ${a.subject_paper_id} does not match target paper id ${target.subjectPaperId}`,
      })
      continue
    }

    const baseNumber = basePaperNumber(a.paper_number)
    if (baseNumber !== target.componentPaperNumber) {
      excluded.push({
        attemptId: a.id,
        reason: 'missing-component-mapping',
        details: `Attempt paper ${a.paper_number} base number ${baseNumber} does not match target component ${target.componentPaperNumber}`,
      })
      continue
    }

    // 5. Variant identity check: must be valid 2-digit variant for this component
    const variantCode = extractVariantCode(a.paper_number, target.componentPaperNumber)
    if (!variantCode) {
      excluded.push({
        attemptId: a.id,
        reason: 'missing-variant',
        details: `Attempt paper number ${a.paper_number} is not an official 2-digit variant for component ${target.componentPaperNumber}`,
      })
      continue
    }

    // Variant targeting check
    if (target.targetVariantCode && variantCode !== target.targetVariantCode) {
      excluded.push({
        attemptId: a.id,
        reason: 'incompatible-variant',
        details: `Attempt variant ${variantCode} does not match target variant ${target.targetVariantCode}`,
      })
      continue
    }

    if (
      !target.targetVariantCode &&
      target.allowedVariants &&
      target.allowedVariants.length > 0 &&
      !target.allowedVariants.includes(variantCode)
    ) {
      excluded.push({
        attemptId: a.id,
        reason: 'incompatible-variant',
        details: `Attempt variant ${variantCode} not in approved variant group [${target.allowedVariants.join(', ')}]`,
      })
      continue
    }

    // 6. Year and session validity
    if (!a.year || a.year < 1990 || a.year > 2100 || !a.session) {
      excluded.push({
        attemptId: a.id,
        reason: 'invalid-maximum',
        details: `Attempt year ${a.year} or session ${a.session} is invalid`,
      })
      continue
    }

    // 7. Normalization to planning component maximum
    if (target.officialComponentMax === null) {
      excluded.push({
        attemptId: a.id,
        reason: 'invalid-maximum',
        details: 'Planning component maximum mark is unavailable',
      })
      continue
    }

    const normalized = (a.score_raw / a.score_max) * target.officialComponentMax

    compatible.push({
      id: a.id,
      subjectId: a.subject_id,
      subjectPaperId: target.subjectPaperId,
      componentPaperNumber: target.componentPaperNumber,
      variantCode,
      year: a.year,
      session: a.session,
      series: mapPaperSessionToSeries(a.session),
      stage: a.stage,
      attemptedAt: a.attempted_at,
      createdAt: a.created_at,
      scoreRaw: rawMark(a.score_raw),
      scoreMax: rawMark(a.score_max),
      officialMax: target.officialComponentMax,
      normalizedScore: rawMark(normalized),
    })
  }

  // Deterministic chronological ordering: oldest first (for recency weighting)
  compatible.sort(
    (a, b) =>
      a.attemptedAt.localeCompare(b.attemptedAt) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id)
  )

  return { compatible, excluded }
}

/**
 * Grade a historical raw mark against its session's component thresholds.
 */
export function gradeHistoricalScore(
  rawScore: number,
  thresholds: HistoricalVariantThresholdLookup['thresholds']
): string {
  if (rawScore >= thresholds.A) return 'A'
  if (rawScore >= thresholds.B) return 'B'
  if (rawScore >= thresholds.C) return 'C'
  if (rawScore >= thresholds.D) return 'D'
  if (rawScore >= thresholds.E) return 'E'
  return 'U'
}

/**
 * Compute performance analytics and recency-weighted baseline from compatible attempts.
 *
 * Recency weighting formula:
 * - Sort attempts chronologically from oldest (i = 0) to newest (i = N - 1).
 * - For N = 1: weight = 1.0.
 * - For N > 1: weight w_i = 1.0 + (i / (N - 1)) * 1.0 (linear from 1.0 for oldest to 2.0 for newest).
 * - recencyWeightedBaseline = sum(w_i * normalizedScore_i) / sum(w_i).
 * - unweightedLifetimeAverage = sum(normalizedScore_i) / N.
 * - Sample std deviation variability = sqrt( sum((normalizedScore_i - lifetimeAvg)^2) / (N - 1) ).
 * - Trend: linear regression slope across attempt indices.
 * - Rolling predicted score: requires >= 2 attempts (conservative sample constraint).
 */
export function evaluateComponentEvidence(
  attempts: readonly ValidatedCompatibleAttempt[],
  getHistoricalThresholds?: HistoricalThresholdGetter,
  officialComponentMax?: RawMark | null
): FullPaperAttemptEvidence {
  const n = attempts.length

  if (n === 0) {
    return {
      attemptCount: 0,
      latestRawScore: null,
      latestRawMax: null,
      officialMax: officialComponentMax ?? null,
      latestNormalizedScore: null,
      latestAttemptDate: null,
      latestHistoricalGrade: null,
      unweightedLifetimeAverage: null,
      recencyWeightedBaseline: null,
      variability: null,
      trend: 'stable',
      trendDelta: 0,
      hasSufficientSample: false,
      rollingPredictedScore: null,
    }
  }

  const latest = attempts[n - 1]
  let latestGrade: string | null = null

  if (getHistoricalThresholds) {
    const historical = getHistoricalThresholds(latest.year, latest.series, latest.variantCode)
    if (historical) {
      const rawMax = historical.rawMaximumMark
      if (
        rawMax !== undefined &&
        rawMax !== null &&
        Number.isFinite(rawMax) &&
        rawMax > 0
      ) {
        // Normalize historical attempt against historical component maximum
        const normalizedHistoricalScore =
          (latest.scoreRaw / latest.scoreMax) * rawMax
        latestGrade = gradeHistoricalScore(normalizedHistoricalScore, historical.thresholds)
      }
    }
  }

  if (n === 1) {
    return {
      attemptCount: 1,
      latestRawScore: latest.scoreRaw,
      latestRawMax: latest.scoreMax,
      officialMax: latest.officialMax,
      latestNormalizedScore: latest.normalizedScore,
      latestAttemptDate: latest.attemptedAt,
      latestHistoricalGrade: latestGrade,
      unweightedLifetimeAverage: latest.normalizedScore,
      recencyWeightedBaseline: latest.normalizedScore,
      variability: null,
      trend: 'stable',
      trendDelta: 0,
      hasSufficientSample: false, // 1 attempt displayed, but predicted grade requires >= 2
      rollingPredictedScore: null,
    }
  }

  // Calculate rank-linear recency weights
  let weightedSum = 0
  let totalWeight = 0
  let rawSum = 0

  for (let i = 0; i < n; i++) {
    const weight = 1.0 + i / (n - 1)
    const score = attempts[i].normalizedScore
    weightedSum += weight * score
    totalWeight += weight
    rawSum += score
  }

  const recencyWeightedBaseline = rawMark(weightedSum / totalWeight)
  const unweightedLifetimeAverage = rawMark(rawSum / n)

  // Sample standard deviation
  let varianceSum = 0
  for (let i = 0; i < n; i++) {
    const diff = attempts[i].normalizedScore - unweightedLifetimeAverage
    varianceSum += diff * diff
  }
  const sampleStdDev = Math.sqrt(varianceSum / (n - 1))
  const variability = rawMark(sampleStdDev)

  // Trend: linear regression slope
  // index i = 0 .. n - 1, meanIndex = (n - 1) / 2
  const meanIndex = (n - 1) / 2
  let numerator = 0
  let denominator = 0

  for (let i = 0; i < n; i++) {
    const dx = i - meanIndex
    const dy = attempts[i].normalizedScore - unweightedLifetimeAverage
    numerator += dx * dy
    denominator += dx * dx
  }

  const slope = denominator > 0 ? numerator / denominator : 0
  let trend: PerformanceTrend = 'stable'
  if (slope > 0.5) trend = 'improving'
  else if (slope < -0.5) trend = 'declining'

  return {
    attemptCount: n,
    latestRawScore: latest.scoreRaw,
    latestRawMax: latest.scoreMax,
    officialMax: latest.officialMax,
    latestNormalizedScore: latest.normalizedScore,
    latestAttemptDate: latest.attemptedAt,
    latestHistoricalGrade: latestGrade,
    unweightedLifetimeAverage,
    recencyWeightedBaseline,
    variability,
    trend,
    trendDelta: Math.round(slope * 100) / 100,
    hasSufficientSample: true,
    rollingPredictedScore: recencyWeightedBaseline,
  }
}

// ─── Complete Historical Sitting Evaluation ──────────────────────────────────

export type QualificationLevel = 'a_level' | 'as'

export const A_LEVEL_GRADES: readonly string[] = ['A*', 'A', 'B', 'C', 'D', 'E'] as const
export const AS_LEVEL_GRADES: readonly string[] = ['a', 'b', 'c', 'd', 'e'] as const

/**
 * Return qualification rank order index for a Cambridge grade.
 * Rank 0 is highest (A* for A Level, a for AS Level).
 * Requires an explicit QualificationLevel without guessing.
 */
export function getGradeRank(grade: string, qualificationLevel: QualificationLevel): number {
  if (qualificationLevel === 'as') {
    const idx = AS_LEVEL_GRADES.indexOf(grade)
    return idx >= 0 ? idx : 999
  }
  if (qualificationLevel === 'a_level') {
    const idx = A_LEVEL_GRADES.indexOf(grade)
    return idx >= 0 ? idx : 999
  }
  return 999
}

/**
 * Sort grade threshold entries deterministically:
 * 1. By threshold mark descending (highest requirement first).
 * 2. When thresholds are equal, by qualification rank order (e.g. A* before A, a before b).
 * Does NOT rely on database row order or input array order.
 * Requires an explicit QualificationLevel.
 */
export function sortThresholdMarks<T extends { grade: string; thresholdMark: number }>(
  marks: readonly T[],
  qualificationLevel: QualificationLevel
): T[] {
  return [...marks].sort((a, b) => {
    if (b.thresholdMark !== a.thresholdMark) {
      return b.thresholdMark - a.thresholdMark
    }
    return getGradeRank(a.grade, qualificationLevel) - getGradeRank(b.grade, qualificationLevel)
  })
}

/**
 * Evaluate a student's total mark against a list of grade threshold marks.
 * Deterministically breaks ties using qualification rank order.
 * Requires an explicit QualificationLevel.
 */
export function evaluateGradeFromThresholds(
  mark: number,
  marks: ReadonlyArray<{ grade: string; thresholdMark: number }>,
  qualificationLevel: QualificationLevel
): string | null {
  if (marks.length === 0) return null
  const sorted = sortThresholdMarks(marks, qualificationLevel)
  for (const m of sorted) {
    if (mark >= m.thresholdMark) {
      return m.grade
    }
  }
  return 'U'
}

export interface HistoricalCombinationDefinition {
  readonly combinationId: string
  readonly year: number
  readonly series: CambridgeExamSeries
  readonly canonicalKey: string
  readonly qualificationLevel: QualificationLevel
  readonly expectedRoutePapers?: ReadonlyArray<{
    readonly subjectPaperId: string
    readonly stage: PaperStage
  }>
  readonly requiredComponents: ReadonlyArray<{
    readonly subjectPaperId: string
    readonly componentCode: string
    readonly stage: PaperStage
    readonly weightingFactor: number
    readonly rawMax: number
  }>
  readonly combinationMarks: ReadonlyArray<{
    readonly grade: string
    readonly thresholdMark: number
  }>
}

/**
 * Calculate the latest comparable grade exclusively from a complete compatible historical sitting.
 * A complete sitting requires valid attempts for all required components of an eligible combination
 * within the same examination sitting (year and series), graded against that sitting's overall threshold.
 */
export function findLatestComparableSitting(
  allAttempts: readonly RawPastPaperAttempt[],
  historicalCombinations: readonly HistoricalCombinationDefinition[],
  expectedRoutePapers?: ReadonlyArray<{
    readonly subjectPaperId: string
    readonly stage: PaperStage
  }>
): string | null {
  const seriesOrder: Record<CambridgeExamSeries, number> = {
    november: 3,
    june: 2,
    march: 1,
  }

  const sortedCombinations = [...historicalCombinations].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    return seriesOrder[b.series] - seriesOrder[a.series]
  })

  for (const comb of sortedCombinations) {
    // 1. Require component tokens to match complete expected route paper/stage set
    const routeSet = expectedRoutePapers ?? comb.expectedRoutePapers
    if (routeSet) {
      if (comb.requiredComponents.length !== routeSet.length) continue
      const matchesRoute = routeSet.every((rp) =>
        comb.requiredComponents.some(
          (c) => c.subjectPaperId === rp.subjectPaperId && c.stage === rp.stage
        )
      )
      if (!matchesRoute) continue
    } else {
      if (comb.requiredComponents.length === 0) continue
    }

    // 2. Validate component weighting and maximums
    const hasInvalidComponent = comb.requiredComponents.some(
      (c) =>
        !Number.isFinite(c.rawMax) ||
        c.rawMax <= 0 ||
        !Number.isFinite(c.weightingFactor) ||
        c.weightingFactor <= 0
    )
    if (hasInvalidComponent) continue

    // 3. Validate qualification level and exact grade set identities
    if (comb.qualificationLevel !== 'a_level' && comb.qualificationLevel !== 'as') {
      continue
    }

    const isALevel = comb.qualificationLevel === 'a_level'
    const expectedGrades = isALevel ? A_LEVEL_GRADES : AS_LEVEL_GRADES

    if (comb.combinationMarks.length !== expectedGrades.length) {
      continue
    }

    const seenGrades = new Set<string>()
    let marksValid = true

    for (const m of comb.combinationMarks) {
      if (!expectedGrades.includes(m.grade)) {
        marksValid = false
        break
      }
      if (seenGrades.has(m.grade)) {
        marksValid = false // Reject duplicate marks
        break
      }
      seenGrades.add(m.grade)

      // Reject missing, non-finite, or negative marks (0 is valid)
      if (!Number.isFinite(m.thresholdMark) || m.thresholdMark < 0) {
        marksValid = false
        break
      }
    }

    if (!marksValid || seenGrades.size !== expectedGrades.length) {
      continue
    }

    let hasAll = true
    let totalWeighted = 0

    for (const comp of comb.requiredComponents) {
      const matchingAttempts = allAttempts.filter((a) => {
        if (a.year !== comb.year) return false
        if (mapPaperSessionToSeries(a.session) !== comb.series) return false
        if (a.subject_paper_id !== comp.subjectPaperId) return false
        // Requirement 2: Strict stage parity (attempt.stage === comp.stage)
        if (a.stage !== comp.stage) return false
        const variant = extractVariantCode(a.paper_number)
        if (variant !== comp.componentCode) return false
        if (
          !Number.isFinite(a.score_raw) ||
          !Number.isFinite(a.score_max) ||
          a.score_max <= 0 ||
          a.score_raw < 0 ||
          a.score_raw > a.score_max
        ) {
          return false
        }
        return true
      })

      if (matchingAttempts.length === 0) {
        hasAll = false
        break
      }

      // Deterministic selection: when multiple attempts match, select the latest by attempted_at, created_at, id
      matchingAttempts.sort(
        (a, b) =>
          b.attempted_at.localeCompare(a.attempted_at) ||
          b.created_at.localeCompare(a.created_at) ||
          b.id.localeCompare(a.id)
      )

      const latestAttempt = matchingAttempts[0]
      const normalized = (latestAttempt.score_raw / latestAttempt.score_max) * comp.rawMax
      totalWeighted += normalized * comp.weightingFactor
    }

    if (hasAll) {
      const achievedGrade = evaluateGradeFromThresholds(
        totalWeighted,
        comb.combinationMarks,
        comb.qualificationLevel
      )
      return achievedGrade ?? 'U'
    }
  }

  return null
}
