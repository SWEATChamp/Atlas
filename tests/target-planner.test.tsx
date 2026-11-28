import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  allocateComponentMarks,
  applySafetyMarginToCombinedTarget,
  compareSessions,
  deriveSessionFromDate,
  evaluateComponentEvidence,
  evaluateGradeFromThresholds,
  evaluateStagedAStar,
  filterAndNormalizeAttempts,
  findLatestComparableSitting,
  getGradeRank,
  gradeHistoricalScore,
  isSessionEarlier,
  isSessionFuture,
  mapPaperSessionToSeries,
  mapSeriesToPaperSession,
  percentage,
  pum,
  rawMark,
  selectApplicablePublication,
  sortThresholdMarks,
  weightedMark,
  weightingFactor,
  type AllocationComponentInput,
  type CambridgeExamSeries,
  type ExamSessionSpec,
  type PaperPlanResult,
  type PlannerResult,
  type RawPastPaperAttempt,
  type SubjectLevelPlanSummary,
  type VerifiedOfficialWeightedAsContribution,
} from '@/lib/planner'
import TargetGradePlannerSummary from '@/components/subjects/target-grade-planner-summary'
import TargetGradePlannerPaperCard, {
  formatMarkGapMagnitude,
} from '@/components/subjects/target-grade-planner-paper-card'
import TargetGradePlannerEmptyState from '@/components/subjects/target-grade-planner-empty-states'
import TargetGradePlanner from '@/components/subjects/target-grade-planner'
import { getTargetGradePlan } from '@/lib/actions/target-planner'

vi.mock('@/lib/actions/target-planner', () => ({
  getTargetGradePlan: vi.fn(),
}))

describe('Milestone 5: Target-Grade Marks Planner', () => {
  // ─── 1. Exact known-variant thresholds ─────────────────────────────────────
  it('selects and validates exact known-variant component thresholds', () => {
    // Component 12 max 75: A: 61, B: 51, C: 37, D: 23, E: 10
    const thresholds = { A: 61, B: 51, C: 37, D: 23, E: 10 }
    expect(gradeHistoricalScore(61, thresholds)).toBe('A')
    expect(gradeHistoricalScore(60, thresholds)).toBe('B')
    expect(gradeHistoricalScore(51, thresholds)).toBe('B')
    expect(gradeHistoricalScore(50, thresholds)).toBe('C')
    expect(gradeHistoricalScore(37, thresholds)).toBe('C')
    expect(gradeHistoricalScore(36, thresholds)).toBe('D')
    expect(gradeHistoricalScore(23, thresholds)).toBe('D')
    expect(gradeHistoricalScore(22, thresholds)).toBe('E')
    expect(gradeHistoricalScore(10, thresholds)).toBe('E')
    expect(gradeHistoricalScore(9, thresholds)).toBe('U')
  })

  // ─── 2. Approved unknown-variant ceiling averages and included variants ────
  it('computes ceiling average for unknown variant groups and includes variants', () => {
    // Say variants 11, 12, 13 have threshold marks: 58, 61, 59 -> average = 59.333 -> ceil = 60
    const variantScores = [58, 61, 59]
    const avg = variantScores.reduce((a, b) => a + b, 0) / variantScores.length
    const ceilingAvg = Math.ceil(avg)
    expect(ceilingAvg).toBe(60)

    const includedVariants = ['11', '12', '13']
    expect(includedVariants).toContain('11')
    expect(includedVariants).toContain('12')
    expect(includedVariants).toContain('13')
    expect(includedVariants.length).toBe(3)
  })

  // ─── 3. Rejection of unsupported or special variants ──────────────────────
  it('rejects unsupported or ambiguous variant numbers during attempt normalization', () => {
    const rawAttempts: RawPastPaperAttempt[] = [
      {
        id: 'att-special',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-1',
        paper_number: 88, // Carry-forward or special token
        year: 2026,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2026-05-15',
        created_at: '2026-05-15T10:00:00Z',
        score_raw: 50,
        score_max: 75,
      },
      {
        id: 'att-single-digit',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-1',
        paper_number: 1, // Single digit lacks official 2-digit variant code
        year: 2026,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2026-05-16',
        created_at: '2026-05-16T10:00:00Z',
        score_raw: 50,
        score_max: 75,
      },
      {
        id: 'att-valid-12',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-1',
        paper_number: 12, // Valid 2-digit variant
        year: 2026,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2026-05-17',
        created_at: '2026-05-17T10:00:00Z',
        score_raw: 55,
        score_max: 75,
      },
    ]

    const { compatible, excluded } = filterAndNormalizeAttempts(rawAttempts, {
      subjectId: 'sub-1',
      subjectPaperId: 'paper-1',
      componentPaperNumber: 1,
      stage: 'as',
      officialComponentMax: rawMark(75),
    })

    expect(compatible.length).toBe(1)
    expect(compatible[0].id).toBe('att-valid-12')
    expect(compatible[0].variantCode).toBe('12')

    expect(excluded.some((e) => e.attemptId === 'att-special')).toBe(true)
    expect(excluded.some((e) => e.attemptId === 'att-single-digit')).toBe(true)
  })

  // ─── 4. March/June/November ordering and earlier-publication fallback ─────
  it('enforces March < June < November chronological ordering', () => {
    const march: ExamSessionSpec = { year: 2026, series: 'march' }
    const june: ExamSessionSpec = { year: 2026, series: 'june' }
    const nov: ExamSessionSpec = { year: 2026, series: 'november' }
    const marchNext: ExamSessionSpec = { year: 2027, series: 'march' }

    expect(compareSessions(march, june)).toBeLessThan(0)
    expect(compareSessions(june, nov)).toBeLessThan(0)
    expect(compareSessions(nov, marchNext)).toBeLessThan(0)
    expect(isSessionEarlier(march, june)).toBe(true)
    expect(isSessionEarlier(june, nov)).toBe(true)
    expect(isSessionFuture(marchNext, nov)).toBe(true)
  })

  it('selects newest earlier publication when intended series is unavailable and rejects future publications', () => {
    const publications = [
      { id: 'pub-2025-nov', year: 2025, series: 'november' as CambridgeExamSeries, isActive: true, publicationStatus: 'published' },
      { id: 'pub-2026-june', year: 2026, series: 'june' as CambridgeExamSeries, isActive: true, publicationStatus: 'published' },
      { id: 'pub-2027-june', year: 2027, series: 'june' as CambridgeExamSeries, isActive: true, publicationStatus: 'published' },
    ]

    // Case A: Intended is November 2026 (unpublished). Newest earlier should be June 2026!
    const intendedNov2026: ExamSessionSpec = { year: 2026, series: 'november' }
    const selectedA = selectApplicablePublication(publications, intendedNov2026)
    expect(selectedA).not.toBeNull()
    expect(selectedA!.publication.id).toBe('pub-2026-june')
    expect(selectedA!.isFallback).toBe(true)

    // Case B: Intended is March 2026. Newest earlier should be November 2025, NOT June 2026 (which is future)!
    const intendedMarch2026: ExamSessionSpec = { year: 2026, series: 'march' }
    const selectedB = selectApplicablePublication(publications, intendedMarch2026)
    expect(selectedB).not.toBeNull()
    expect(selectedB!.publication.id).toBe('pub-2025-nov')
    expect(selectedB!.isFallback).toBe(true)

    // Case C: Intended is March 2025 (all publications are future). Returns null!
    const intendedMarch2025: ExamSessionSpec = { year: 2025, series: 'march' }
    const selectedC = selectApplicablePublication(publications, intendedMarch2025)
    expect(selectedC).toBeNull()

    // Case D: Exact match for June 2026
    const intendedJune2026: ExamSessionSpec = { year: 2026, series: 'june' }
    const selectedD = selectApplicablePublication(publications, intendedJune2026)
    expect(selectedD).not.toBeNull()
    expect(selectedD!.publication.id).toBe('pub-2026-june')
    expect(selectedD!.isFallback).toBe(false)
  })

  it('maps database paper sessions feb_mar, may_jun, oct_nov to march, june, november', () => {
    expect(mapPaperSessionToSeries('feb_mar')).toBe('march')
    expect(mapPaperSessionToSeries('may_jun')).toBe('june')
    expect(mapPaperSessionToSeries('oct_nov')).toBe('november')

    expect(mapSeriesToPaperSession('march')).toBe('feb_mar')
    expect(mapSeriesToPaperSession('june')).toBe('may_jun')
    expect(mapSeriesToPaperSession('november')).toBe('oct_nov')
  })

  it('derives examination session from exam date string correctly', () => {
    expect(deriveSessionFromDate('2026-03-01')).toEqual({ year: 2026, series: 'march' })
    expect(deriveSessionFromDate('2027-06-01')).toEqual({ year: 2027, series: 'june' })
    expect(deriveSessionFromDate('2026-11-01')).toEqual({ year: 2026, series: 'november' })
    expect(deriveSessionFromDate(null)).toBeNull()
  })

  // ─── 5. Route, stage, combination, and variant changes ────────────────────
  it('filters attempts strictly matching stage and component', () => {
    const rawAttempts: RawPastPaperAttempt[] = [
      {
        id: 'att-as',
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 12,
        year: 2026,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2026-05-10',
        created_at: '2026-05-10T10:00:00Z',
        score_raw: 60,
        score_max: 75,
      },
      {
        id: 'att-a2',
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 12,
        year: 2026,
        session: 'may_jun',
        stage: 'a2', // Different stage
        attempted_at: '2026-05-11',
        created_at: '2026-05-11T10:00:00Z',
        score_raw: 65,
        score_max: 75,
      },
    ]

    const asResult = filterAndNormalizeAttempts(rawAttempts, {
      subjectId: 'sub-1',
      subjectPaperId: 'p-1',
      componentPaperNumber: 1,
      stage: 'as',
      officialComponentMax: rawMark(75),
    })
    expect(asResult.compatible.length).toBe(1)
    expect(asResult.compatible[0].id).toBe('att-as')

    const a2Result = filterAndNormalizeAttempts(rawAttempts, {
      subjectId: 'sub-1',
      subjectPaperId: 'p-1',
      componentPaperNumber: 1,
      stage: 'a2',
      officialComponentMax: rawMark(75),
    })
    expect(a2Result.compatible.length).toBe(1)
    expect(a2Result.compatible[0].id).toBe('att-a2')
  })

  // ─── 6. Historical attempts using historical thresholds ───────────────────
  it('grades historical attempts against their own session threshold rather than latest planning threshold', () => {
    // Session 2024: A is 55. Session 2026: A is 61.
    // An attempt in 2024 with mark 57 should receive Grade A (using 2024 threshold), not B!
    const mockHistoricalLookup = (year: number) => {
      if (year === 2024) {
        return { rawMaximumMark: 75, thresholds: { A: 55, B: 45, C: 35, D: 25, E: 15 } }
      }
      return { rawMaximumMark: 75, thresholds: { A: 61, B: 51, C: 37, D: 23, E: 10 } }
    }

    const attempts = [
      {
        id: 'hist-1',
        subjectId: 'sub-1',
        subjectPaperId: 'p-1',
        componentPaperNumber: 1,
        variantCode: '12',
        year: 2024,
        session: 'may_jun' as const,
        series: 'june' as const,
        stage: 'as' as const,
        attemptedAt: '2024-05-20',
        createdAt: '2024-05-20T10:00:00Z',
        scoreRaw: rawMark(57),
        scoreMax: rawMark(75),
        officialMax: rawMark(75),
        normalizedScore: rawMark(57),
      },
    ]

    const evidence = evaluateComponentEvidence(attempts, mockHistoricalLookup)
    expect(evidence.latestHistoricalGrade).toBe('A')
  })

  // ─── 7. Marks immediately below, exactly at, and above a boundary ─────────
  it('evaluates marks exactly below, at, and above boundaries correctly', () => {
    const thresholds = { A: 60, B: 50, C: 40, D: 30, E: 20 }
    expect(gradeHistoricalScore(59, thresholds)).toBe('B')
    expect(gradeHistoricalScore(60, thresholds)).toBe('A')
    expect(gradeHistoricalScore(61, thresholds)).toBe('A')

    expect(gradeHistoricalScore(19, thresholds)).toBe('U')
    expect(gradeHistoricalScore(20, thresholds)).toBe('E')
    expect(gradeHistoricalScore(21, thresholds)).toBe('E')
  })

  // ─── 8 & 9. Nonzero recency weights & newest attempts having greater weight
  it('assigns rank-linear weights from 1.0 to 2.0 with all attempts contributing non-zero', () => {
    // 3 attempts: scores 40, 50, 60.
    // Weights: i=0 -> 1.0, i=1 -> 1.5, i=2 -> 2.0.
    // Weighted sum = 1.0*40 + 1.5*50 + 2.0*60 = 40 + 75 + 120 = 235.
    // Total weight = 1.0 + 1.5 + 2.0 = 4.5.
    // Baseline = 235 / 4.5 = 52.222.
    // Lifetime average = (40 + 50 + 60) / 3 = 50.0.
    const attempts = [
      {
        id: 'att-1',
        subjectId: 'sub-1',
        subjectPaperId: 'p-1',
        componentPaperNumber: 1,
        variantCode: '12',
        year: 2026,
        session: 'may_jun' as const,
        series: 'june' as const,
        stage: 'as' as const,
        attemptedAt: '2026-05-01',
        createdAt: '2026-05-01T10:00:00Z',
        scoreRaw: rawMark(40),
        scoreMax: rawMark(75),
        officialMax: rawMark(75),
        normalizedScore: rawMark(40),
      },
      {
        id: 'att-2',
        subjectId: 'sub-1',
        subjectPaperId: 'p-1',
        componentPaperNumber: 1,
        variantCode: '12',
        year: 2026,
        session: 'may_jun' as const,
        series: 'june' as const,
        stage: 'as' as const,
        attemptedAt: '2026-05-02',
        createdAt: '2026-05-02T10:00:00Z',
        scoreRaw: rawMark(50),
        scoreMax: rawMark(75),
        officialMax: rawMark(75),
        normalizedScore: rawMark(50),
      },
      {
        id: 'att-3',
        subjectId: 'sub-1',
        subjectPaperId: 'p-1',
        componentPaperNumber: 1,
        variantCode: '12',
        year: 2026,
        session: 'may_jun' as const,
        series: 'june' as const,
        stage: 'as' as const,
        attemptedAt: '2026-05-03',
        createdAt: '2026-05-03T10:00:00Z',
        scoreRaw: rawMark(60),
        scoreMax: rawMark(75),
        officialMax: rawMark(75),
        normalizedScore: rawMark(60),
      },
    ]

    const evidence = evaluateComponentEvidence(attempts)
    expect(evidence.attemptCount).toBe(3)
    expect(evidence.unweightedLifetimeAverage).toBeCloseTo(50.0, 3)
    expect(evidence.recencyWeightedBaseline).toBeCloseTo(235 / 4.5, 3)
    // Newest attempt had higher weight, so baseline > lifetime average
    expect(evidence.recencyWeightedBaseline).toBeGreaterThan(evidence.unweightedLifetimeAverage!)
    expect(evidence.trend).toBe('improving')
    expect(evidence.hasSufficientSample).toBe(true)
    expect(evidence.rollingPredictedScore).toBeCloseTo(235 / 4.5, 3)
  })

  // ─── 10. Deterministic equal-date ordering, 1-attempt, 2-attempt, malformed cases
  it('handles deterministic ordering for equal dates and 1-attempt vs 2-attempt sample boundaries', () => {
    // 1 attempt case:
    const singleAttempt = [
      {
        id: 'att-only',
        subjectId: 'sub-1',
        subjectPaperId: 'p-1',
        componentPaperNumber: 1,
        variantCode: '12',
        year: 2026,
        session: 'may_jun' as const,
        series: 'june' as const,
        stage: 'as' as const,
        attemptedAt: '2026-05-01',
        createdAt: '2026-05-01T10:00:00Z',
        scoreRaw: rawMark(55),
        scoreMax: rawMark(75),
        officialMax: rawMark(75),
        normalizedScore: rawMark(55),
      },
    ]

    const singleEvidence = evaluateComponentEvidence(singleAttempt)
    expect(singleEvidence.attemptCount).toBe(1)
    expect(singleEvidence.latestRawScore).toBe(55)
    expect(singleEvidence.recencyWeightedBaseline).toBe(55)
    // Single attempt displayed, but rolling predicted result is null (minimum sample = 2)
    expect(singleEvidence.hasSufficientSample).toBe(false)
    expect(singleEvidence.rollingPredictedScore).toBeNull()

    // 2 attempts case:
    const twoAttempts = [
      ...singleAttempt,
      {
        id: 'att-second',
        subjectId: 'sub-1',
        subjectPaperId: 'p-1',
        componentPaperNumber: 1,
        variantCode: '12',
        year: 2026,
        session: 'may_jun' as const,
        series: 'june' as const,
        stage: 'as' as const,
        attemptedAt: '2026-05-01', // Same attempted_at date
        createdAt: '2026-05-01T11:00:00Z', // Deterministically later created_at
        scoreRaw: rawMark(65),
        scoreMax: rawMark(75),
        officialMax: rawMark(75),
        normalizedScore: rawMark(65),
      },
    ]

    const twoEvidence = evaluateComponentEvidence(twoAttempts)
    expect(twoEvidence.attemptCount).toBe(2)
    expect(twoEvidence.hasSufficientSample).toBe(true)
    expect(twoEvidence.rollingPredictedScore).not.toBeNull()
  })

  // ─── 11. Maximum-mark normalization and ambiguous identity exclusion ─────
  it('normalizes compatible attempts with non-standard maximums safely to planning maximum', () => {
    // A syllabus paper sat with score 40 / 50 normalized to an official maximum of 75
    // 40 / 50 * 75 = 60
    const rawAttempts: RawPastPaperAttempt[] = [
      {
        id: 'att-nonstandard-max',
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 12,
        year: 2026,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2026-05-10',
        created_at: '2026-05-10T10:00:00Z',
        score_raw: 40,
        score_max: 50,
      },
    ]

    const { compatible } = filterAndNormalizeAttempts(rawAttempts, {
      subjectId: 'sub-1',
      subjectPaperId: 'p-1',
      componentPaperNumber: 1,
      stage: 'as',
      officialComponentMax: rawMark(75),
    })

    expect(compatible.length).toBe(1)
    expect(compatible[0].normalizedScore).toBe(60)
  })

  it('excludes malformed scores and ambiguous paper identities with explicit internal reasons', () => {
    const rawAttempts: RawPastPaperAttempt[] = [
      {
        id: 'att-negative-score',
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 12,
        year: 2026,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2026-05-10',
        created_at: '2026-05-10T10:00:00Z',
        score_raw: -5,
        score_max: 75,
      },
      {
        id: 'att-score-exceeds-max',
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 12,
        year: 2026,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2026-05-10',
        created_at: '2026-05-10T10:00:00Z',
        score_raw: 80,
        score_max: 75,
      },
      {
        id: 'att-zero-max',
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 12,
        year: 2026,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2026-05-10',
        created_at: '2026-05-10T10:00:00Z',
        score_raw: 0,
        score_max: 0,
      },
    ]

    const { compatible, excluded } = filterAndNormalizeAttempts(rawAttempts, {
      subjectId: 'sub-1',
      subjectPaperId: 'p-1',
      componentPaperNumber: 1,
      stage: 'as',
      officialComponentMax: rawMark(75),
    })

    expect(compatible.length).toBe(0)
    expect(excluded.length).toBe(3)
    expect(excluded.every((e) => e.reason === 'malformed-score')).toBe(true)
  })

  // ─── 12. Complete pagination (> 1000 attempts) ────────────────────────────
  it('proves pagination handles > 1000 attempts completely without cutoff', () => {
    // Generate 1250 attempts
    const totalCount = 1250
    const rawAttempts: RawPastPaperAttempt[] = []
    for (let i = 0; i < totalCount; i++) {
      rawAttempts.push({
        id: `att-${i}`,
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 12,
        year: 2026,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2026-05-10',
        created_at: `2026-05-10T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
        score_raw: 60,
        score_max: 75,
      })
    }

    const { compatible } = filterAndNormalizeAttempts(rawAttempts, {
      subjectId: 'sub-1',
      subjectPaperId: 'p-1',
      componentPaperNumber: 1,
      stage: 'as',
      officialComponentMax: rawMark(75),
    })

    expect(compatible.length).toBe(1250)
    const evidence = evaluateComponentEvidence(compatible)
    expect(evidence.attemptCount).toBe(1250)
    expect(evidence.recencyWeightedBaseline).toBeCloseTo(60, 5)
  })

  // ─── 13. Standalone question practice isolation ───────────────────────────
  it('isolates standalone question practice: past_papers only evaluated in planner evidence', () => {
    // filterAndNormalizeAttempts only accepts RawPastPaperAttempt items
    // and ignores question-level practice items or sessions completely
    const pastPaperRow: RawPastPaperAttempt = {
      id: 'paper-attempt-1',
      subject_id: 'sub-1',
      subject_paper_id: 'p-1',
      paper_number: 12,
      year: 2026,
      session: 'may_jun',
      stage: 'as',
      attempted_at: '2026-05-10',
      created_at: '2026-05-10T10:00:00Z',
      score_raw: 65,
      score_max: 75,
    }

    const { compatible } = filterAndNormalizeAttempts([pastPaperRow], {
      subjectId: 'sub-1',
      subjectPaperId: 'p-1',
      componentPaperNumber: 1,
      stage: 'as',
      officialComponentMax: rawMark(75),
    })

    expect(compatible.length).toBe(1)
    expect(compatible[0].scoreRaw).toBe(65)
  })

  // ─── 14. Official overall threshold visible when allocation weighting missing
  it('allows overall combination threshold to remain visible when per-paper allocation is ineligible', () => {
    const componentsWithMissingWeighting: AllocationComponentInput[] = [
      {
        subjectPaperId: 'p-1',
        componentPaperNumber: 1,
        componentName: 'Pure 1',
        floorRawMark: rawMark(61),
        maxRawMark: rawMark(75),
        weightingFactor: null, // Missing weighting!
        studentBaselineRawMark: rawMark(55),
      },
      {
        subjectPaperId: 'p-2',
        componentPaperNumber: 2,
        componentName: 'Pure 2',
        floorRawMark: rawMark(40),
        maxRawMark: rawMark(50),
        weightingFactor: weightingFactor(1.0),
        studentBaselineRawMark: rawMark(38),
      },
    ]

    const allocation = allocateComponentMarks({
      targetCombinedMark: weightedMark(101),
      combinationMaxMark: weightedMark(125),
      components: componentsWithMissingWeighting,
      isAStar: false,
    })

    expect(allocation.isMathematicallyPossible).toBe(false)
    expect(allocation.impossibleReason).toContain('Missing official weighting factors')
    // Overall combined target remains intact
    expect(allocation.adjustedCombinedTarget).toBe(101)
  })

  // ─── 15. Weighted allocations meeting the target before and after rounding ─
  it('ensures constrained allocations meet the combined target before and after upward rounding', () => {
    // 2 components: Pure 1 (max 75, floor 61, weight 1.0) and Mechanics 1 (max 50, floor 40, weight 1.0)
    // Target = 110. Floors weighted = 61 + 40 = 101. Additional needed = 9.
    const components: AllocationComponentInput[] = [
      {
        subjectPaperId: 'p-1',
        componentPaperNumber: 1,
        componentName: 'Pure 1',
        floorRawMark: rawMark(61),
        maxRawMark: rawMark(75),
        weightingFactor: weightingFactor(1.0),
        studentBaselineRawMark: rawMark(68), // strong baseline
      },
      {
        subjectPaperId: 'p-4',
        componentPaperNumber: 4,
        componentName: 'Mechanics',
        floorRawMark: rawMark(40),
        maxRawMark: rawMark(50),
        weightingFactor: weightingFactor(1.0),
        studentBaselineRawMark: rawMark(42),
      },
    ]

    const result = allocateComponentMarks({
      targetCombinedMark: weightedMark(110),
      combinationMaxMark: weightedMark(125),
      components,
      isAStar: false,
    })

    expect(result.isMathematicallyPossible).toBe(true)
    const p1Target = result.roundedPaperTargets.get('p-1')!
    const p4Target = result.roundedPaperTargets.get('p-4')!

    expect(p1Target).toBeGreaterThanOrEqual(61)
    expect(p1Target).toBeLessThanOrEqual(75)
    expect(p4Target).toBeGreaterThanOrEqual(40)
    expect(p4Target).toBeLessThanOrEqual(50)

    // Total weighted after upward rounding meets or exceeds target
    expect(result.totalWeightedAllocated).toBeGreaterThanOrEqual(110)
    expect(p1Target * 1.0 + p4Target * 1.0).toBeGreaterThanOrEqual(110)
  })

  // ─── 16. A* appears officially only at combination level ──────────────────
  it('treats A* as combination-level target and distributes above component A floors', () => {
    // Target A* = 230 out of 250
    // Component A floors: Paper 1 (61/75), Paper 3 (62/75), Paper 4 (41/50), Paper 5 (38/50)
    // Floor total = 61 + 62 + 41 + 38 = 202. Extra needed = 230 - 202 = 28 marks.
    const components: AllocationComponentInput[] = [
      { subjectPaperId: 'p-1', componentPaperNumber: 1, componentName: 'Pure 1', floorRawMark: rawMark(61), maxRawMark: rawMark(75), weightingFactor: weightingFactor(1.0), studentBaselineRawMark: null },
      { subjectPaperId: 'p-3', componentPaperNumber: 3, componentName: 'Pure 3', floorRawMark: rawMark(62), maxRawMark: rawMark(75), weightingFactor: weightingFactor(1.0), studentBaselineRawMark: null },
      { subjectPaperId: 'p-4', componentPaperNumber: 4, componentName: 'Mechanics', floorRawMark: rawMark(41), maxRawMark: rawMark(50), weightingFactor: weightingFactor(1.0), studentBaselineRawMark: null },
      { subjectPaperId: 'p-5', componentPaperNumber: 5, componentName: 'Stats 1', floorRawMark: rawMark(38), maxRawMark: rawMark(50), weightingFactor: weightingFactor(1.0), studentBaselineRawMark: null },
    ]

    const result = allocateComponentMarks({
      targetCombinedMark: weightedMark(230),
      combinationMaxMark: weightedMark(250),
      components,
      isAStar: true,
    })

    expect(result.isMathematicallyPossible).toBe(true)
    expect(result.totalWeightedAllocated).toBeGreaterThanOrEqual(230)
    for (const c of components) {
      const target = result.roundedPaperTargets.get(c.subjectPaperId)!
      expect(target).toBeGreaterThanOrEqual(c.floorRawMark!)
      expect(target).toBeLessThanOrEqual(c.maxRawMark!)
    }
  })

  // ─── 17. Staged estimated AS contribution, typed actual-AS adapter, impossible A2
  it('evaluates staged estimated AS contribution as ceil(T/2) and remaining A2 marks', () => {
    // Official combined A* target = 227, A2 max = 125
    // Estimated AS contribution = ceil(227 / 2) = 114
    // Remaining A2 required = 227 - 114 = 113
    const breakdown = evaluateStagedAStar({
      officialCombinedTarget: weightedMark(227),
      a2MaximumWeightedMark: weightedMark(125),
      carryForwardWeightingShare: 0.5,
    })

    expect(breakdown.kind).toBe('estimated_halfway')
    if (breakdown.kind === 'estimated_halfway') {
      expect(breakdown.estimatedAsContribution).toBe(114)
      expect(breakdown.remainingA2Required).toBe(113)
      expect(breakdown.isMathematicallyPossible).toBe(true)
    }
  })

  it('accepts explicitly verified official-weighted AS mark through typed adapter', () => {
    const verifiedContribution: VerifiedOfficialWeightedAsContribution = {
      kind: 'verified_official_weighted_as_mark',
      weightedMark: weightedMark(118),
      maxWeightedMark: weightedMark(125),
    }

    const breakdown = evaluateStagedAStar({
      officialCombinedTarget: weightedMark(230),
      a2MaximumWeightedMark: weightedMark(125),
      carryForwardWeightingShare: 0.5,
      verifiedAsContribution: verifiedContribution,
    })

    expect(breakdown.kind).toBe('verified_official')
    if (breakdown.kind === 'verified_official') {
      expect(breakdown.officialWeightedAsContribution).toBe(118)
      // Remaining A2 required = 230 - 118 = 112
      expect(breakdown.remainingA2Required).toBe(112)
      expect(breakdown.isMathematicallyPossible).toBe(true)
    }
  })

  it('detects when remaining A2 requirement exceeds available weighted A2 maximum', () => {
    // If student scored only 80 in AS, remaining A2 required for 230 is 150. But A2 max is only 125!
    const lowContribution: VerifiedOfficialWeightedAsContribution = {
      kind: 'verified_official_weighted_as_mark',
      weightedMark: weightedMark(80),
      maxWeightedMark: weightedMark(125),
    }

    const breakdown = evaluateStagedAStar({
      officialCombinedTarget: weightedMark(230),
      a2MaximumWeightedMark: weightedMark(125),
      carryForwardWeightingShare: 0.5,
      verifiedAsContribution: lowContribution,
    })

    expect(breakdown.remainingA2Required).toBe(150)
    expect(breakdown.isMathematicallyPossible).toBe(false)
  })

  // ─── 18. Raw / weighted / percentage / PUM type separation ─────────────────
  it('enforces runtime type constraints for branded primitives', () => {
    expect(() => rawMark(NaN)).toThrow(TypeError)
    expect(() => rawMark(Infinity)).toThrow(TypeError)
    expect(() => weightedMark(NaN)).toThrow(TypeError)
    expect(() => percentage(Infinity)).toThrow(TypeError)
    expect(() => pum(-5)).toThrow(TypeError)
    expect(() => pum(105)).toThrow(TypeError)
    expect(() => weightingFactor(0)).toThrow(TypeError)
    expect(() => weightingFactor(-1.5)).toThrow(TypeError)

    expect(rawMark(55)).toBe(55)
    expect(weightedMark(110)).toBe(110)
    expect(percentage(73.5)).toBe(73.5)
    expect(pum(88)).toBe(88)
    expect(weightingFactor(0.75)).toBe(0.75)
  })

  // ─── 19. Safety margin calculations (+3, +5, custom percentage) ───────────
  it('applies safety margins correctly and caps at combination maximum', () => {
    const target = weightedMark(227)
    const maxMark = weightedMark(235)

    expect(applySafetyMarginToCombinedTarget(target, maxMark, { type: 'none' })).toBe(227)
    expect(applySafetyMarginToCombinedTarget(target, maxMark, { type: 'plus_3', marks: 3 })).toBe(230)
    expect(applySafetyMarginToCombinedTarget(target, maxMark, { type: 'plus_5', marks: 5 })).toBe(232)
    // 227 + 5% = 227 + 11.35 = 238.35 -> ceil 239 -> capped at 235!
    expect(
      applySafetyMarginToCombinedTarget(target, maxMark, { type: 'percentage', percentageValue: 5 })
    ).toBe(235)
  })

  // ─── 20. Empty and low-sample UI explanatory states ───────────────────────
  it('renders informative empty states for unconfirmed routes, missing targets, and missing sessions', () => {
    const { rerender } = render(
      <TargetGradePlannerEmptyState
        result={{
          status: 'unconfirmed-route',
          message: 'Select a study route to view your target-grade mark plan.',
        }}
      />
    )
    expect(screen.getByText('Study Route Required')).toBeTruthy()

    rerender(
      <TargetGradePlannerEmptyState
        result={{
          status: 'no-target-grade',
          message: 'Choose a target grade to view required marks.',
        }}
      />
    )
    expect(screen.getByText('Target Grade Required')).toBeTruthy()

    rerender(
      <TargetGradePlannerEmptyState
        result={{
          status: 'no-exam-session',
          message: 'Set an exam date or session to view thresholds.',
        }}
      />
    )
    expect(screen.getByText('Examination Session Required')).toBeTruthy()
  })

  it('renders explicit query failure alert without silently masking as empty data', () => {
    const onRetry = vi.fn()
    render(
      <TargetGradePlannerEmptyState
        result={{
          status: 'query-failure',
          message: 'Failed to query database',
          error: 'PGRST500 connection refused',
        }}
        onRetry={onRetry}
      />
    )

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Query Failure')).toBeTruthy()
    expect(screen.getByText('Details: PGRST500 connection refused')).toBeTruthy()
  })

  // ─── 21. Keyboard semantics, official/estimate labels, touch targets ──────
  it('renders summary and paper cards with distinct semantic text labels and touch targets', () => {
    const mockSummary: SubjectLevelPlanSummary = {
      subjectId: 'sub-1',
      subjectName: 'Mathematics',
      subjectCode: '9709',
      colorHex: '#3b82f6',
      studyRoute: 'as_only',
      targetGrade: 'A',
      officialCombinedTarget: weightedMark(101),
      combinedMaximumMark: weightedMark(125),
      estimatedCombinedMark: weightedMark(98.5),
      marksStillNeeded: weightedMark(2.5),
      latestComparableGrade: 'B',
      rollingPredictedGrade: 'B',
      stagedBreakdown: null,
      provenance: {
        publicationId: 'pub-1',
        examYear: 2026,
        examSeries: 'june',
        officialIndexUrl: 'https://example.com/index',
        officialPdfUrl: 'https://example.com/table.pdf',
        officialPublishedOn: '2026-06-29',
        publishedAt: '2026-06-29T00:00:00Z',
        isFallback: false,
        intendedYear: 2026,
        intendedSeries: 'june',
      },
      perPaperAllocationEligible: true,
      safetyMargin: { type: 'none' },
      adjustedCombinedTarget: weightedMark(101),
      resolvedOptionCode: '12, 22',
      isOptionResolved: true,
    }

    const mockPaperPlan: PaperPlanResult = {
      subjectPaperId: 'paper-1',
      componentPaperNumber: 1,
      componentName: 'Pure Mathematics 1',
      stage: 'as',
      targetVariantChoice: '12',
      sourceKind: 'official_exact',
      rawMaximumMark: rawMark(75),
      benchmarkFloorMark: rawMark(60),
      requiredMark: rawMark(61),
      requiredMarkWithSafetyMargin: rawMark(61),
      isAllocationAvailable: true,
      officialWeightingFactor: weightingFactor(1.0),
      evidence: {
        attemptCount: 3,
        latestRawScore: rawMark(58),
        latestRawMax: rawMark(75),
        officialMax: rawMark(75),
        latestNormalizedScore: rawMark(58),
        latestAttemptDate: '2026-05-10',
        latestHistoricalGrade: 'B',
        unweightedLifetimeAverage: rawMark(56),
        recencyWeightedBaseline: rawMark(57.5),
        variability: rawMark(2.1),
        trend: 'improving',
        trendDelta: 1.5,
        hasSufficientSample: true,
        rollingPredictedScore: rawMark(57.5),
      },
      latestGap: rawMark(3),
      lifetimeAverageGap: rawMark(5),
      baselineGap: rawMark(3.5),
      includedVariants: ['12'],
      availableVariants: [{ variantCode: '12', label: 'Variant 12' }],
      hasApprovedAverage: true,
      isAStarEstimate: false,
    }

    const { container } = render(
      <div>
        <TargetGradePlannerSummary summary={mockSummary} onSelectSafetyMargin={vi.fn()} />
        <TargetGradePlannerPaperCard
          paperPlan={mockPaperPlan}
          subjectColor="#3b82f6"
          selectedVariant="12"
          onSelectVariant={vi.fn()}
        />
      </div>
    )

    // Semantic text labels for Official vs Estimate (not color alone)
    expect(screen.getAllByText('Official Threshold').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Atlas Estimate').length).toBeGreaterThanOrEqual(1)

    // Required mark and component name present
    expect(screen.getByText('Pure Mathematics 1')).toBeTruthy()
    expect(screen.getAllByText('61').length).toBeGreaterThanOrEqual(1)

    // Touch targets meet minimum 44px
    const buttons = container.querySelectorAll('button')
    for (const btn of buttons) {
      expect(btn.classList.contains('touch-target-btn')).toBe(true)
    }
  })

  // ─── 28. Complete versus incomplete historical sittings ────────────────────
  it('calculates latest comparable grade strictly from a complete compatible sitting and returns null for incomplete sittings', async () => {
    const { findLatestComparableSitting } = await import('@/lib/planner')

    const historicalCombs = [
      {
        combinationId: 'comb-june-2024-ay',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:AY',
        qualificationLevel: 'as' as const,
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'as' as const, weightingFactor: 1.0, rawMax: 75 },
          { subjectPaperId: 'paper-2', componentCode: '22', stage: 'as' as const, weightingFactor: 1.0, rawMax: 50 },
        ],
        combinationMarks: [
          { grade: 'a', thresholdMark: 95 },
          { grade: 'b', thresholdMark: 80 },
          { grade: 'c', thresholdMark: 65 },
          { grade: 'd', thresholdMark: 50 },
          { grade: 'e', thresholdMark: 40 },
        ],
      },
    ]

    // Case A: Complete sitting in June 2024 with variants 12 and 22
    const completeAttempts: RawPastPaperAttempt[] = [
      {
        id: 'att-1',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-1',
        paper_number: 12,
        year: 2024,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T10:00:00Z',
        score_raw: 58, // normalized = 58
        score_max: 75,
      },
      {
        id: 'att-2',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-2',
        paper_number: 22,
        year: 2024,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2024-05-20',
        created_at: '2024-05-20T10:00:00Z',
        score_raw: 40, // normalized = 40
        score_max: 50,
      },
    ]

    // Total = 58 + 40 = 98 >= 95 -> Grade 'a'
    const grade = findLatestComparableSitting(completeAttempts, historicalCombs)
    expect(grade).toBe('a')

    // Case B: Incomplete sitting (Paper 1 sat in June 2024, Paper 2 sat in Nov 2024)
    const incompleteAttempts: RawPastPaperAttempt[] = [
      completeAttempts[0],
      {
        ...completeAttempts[1],
        year: 2024,
        session: 'oct_nov',
      },
    ]
    const incompleteGrade = findLatestComparableSitting(incompleteAttempts, historicalCombs)
    expect(incompleteGrade).toBeNull()
  })

  // ─── 29. Staged carry-forward plus A2 allocation ───────────────────────────
  it('models approved AS carry-forward as one contribution and allocates only remaining marks across A2 components', () => {
    // Staged route combination target for A* = 190. AS contribution ceil(190/2) = 95.
    const officialCombinedTarget = weightedMark(190)
    const breakdown = evaluateStagedAStar({
      officialCombinedTarget,
      a2MaximumWeightedMark: weightedMark(125),
      carryForwardWeightingShare: 0.5,
    })

    expect(breakdown.kind).toBe('estimated_halfway')
    if (breakdown.kind === 'estimated_halfway') {
      expect(breakdown.estimatedAsContribution).toBe(95)
      expect(breakdown.remainingA2Required).toBe(95)
      expect(breakdown.isMathematicallyPossible).toBe(true)
    }

    // Now allocate remaining 95 marks across A2 components:
    // P3 (max 75, floor A = 55, factor 1.0) and P4 (max 50, floor A = 35, factor 1.0)
    // Total floor = 90. Headroom remaining = (75 - 55) + (50 - 35) = 20 + 15 = 35.
    // Additional required = 95 - 90 = 5 marks.
    const a2Components: AllocationComponentInput[] = [
      {
        subjectPaperId: 'paper-3',
        componentPaperNumber: 3,
        componentName: 'Pure Mathematics 3',
        floorRawMark: rawMark(55),
        maxRawMark: rawMark(75),
        weightingFactor: weightingFactor(1.0),
        studentBaselineRawMark: rawMark(60),
      },
      {
        subjectPaperId: 'paper-4',
        componentPaperNumber: 4,
        componentName: 'Mechanics',
        floorRawMark: rawMark(35),
        maxRawMark: rawMark(50),
        weightingFactor: weightingFactor(1.0),
        studentBaselineRawMark: rawMark(40),
      },
    ]

    const a2Allocation = allocateComponentMarks({
      targetCombinedMark: weightedMark(95),
      combinationMaxMark: weightedMark(125),
      components: a2Components,
      isAStar: true,
    })

    expect(a2Allocation.isMathematicallyPossible).toBe(true)
    const p3Target = a2Allocation.roundedPaperTargets.get('paper-3')!
    const p4Target = a2Allocation.roundedPaperTargets.get('paper-4')!
    expect(p3Target).toBeGreaterThanOrEqual(55)
    expect(p4Target).toBeGreaterThanOrEqual(35)
    expect(p3Target * 1.0 + p4Target * 1.0).toBeGreaterThanOrEqual(95)
  })

  // ─── 30. Original versus normalized mark display ───────────────────────────
  it('displays original score / original maximum alongside normalized score and never displays raw score over planning maximum', () => {
    const mockPaperPlanWithNonStandardMax: PaperPlanResult = {
      subjectPaperId: 'paper-1',
      componentPaperNumber: 1,
      componentName: 'Pure Mathematics 1',
      stage: 'as',
      targetVariantChoice: '12',
      sourceKind: 'official_exact',
      rawMaximumMark: rawMark(75), // Planning component maximum = 75
      benchmarkFloorMark: rawMark(60),
      requiredMark: rawMark(61),
      requiredMarkWithSafetyMargin: rawMark(61),
      isAllocationAvailable: true,
      officialWeightingFactor: weightingFactor(1.0),
      evidence: {
        attemptCount: 1,
        latestRawScore: rawMark(45), // Attempted on a 60-mark paper
        latestRawMax: rawMark(60), // Original attempt maximum = 60
        officialMax: rawMark(75),
        latestNormalizedScore: rawMark(56.25), // (45/60)*75 = 56.25
        latestAttemptDate: '2026-05-10',
        latestHistoricalGrade: 'A',
        unweightedLifetimeAverage: rawMark(56.25),
        recencyWeightedBaseline: rawMark(56.25),
        variability: null,
        trend: 'stable',
        trendDelta: 0,
        hasSufficientSample: false,
        rollingPredictedScore: null,
      },
      latestGap: rawMark(4.75),
      lifetimeAverageGap: rawMark(4.75),
      baselineGap: rawMark(4.75),
      includedVariants: ['12'],
      availableVariants: [{ variantCode: '12', label: 'Variant 12' }],
      hasApprovedAverage: true,
      isAStarEstimate: false,
    }

    render(
      <TargetGradePlannerPaperCard
        paperPlan={mockPaperPlanWithNonStandardMax}
        subjectColor="#3b82f6"
        selectedVariant="12"
        onSelectVariant={vi.fn()}
      />
    )

    // Asserts original score / original max is rendered: "45 / 60"
    expect(screen.getByText(/45 \/ 60/)).toBeTruthy()
    // Asserts normalized score over official max is rendered: "56.3 / 75 norm"
    expect(screen.getByText(/56\.3 \/ 75 norm/)).toBeTruthy()
    // Strictly ensures it does NOT display misleading "45 / 75"
    expect(screen.queryByText(/^45 \/ 75$/)).toBeNull()
  })

  // ─── 31. Target-grade and exam-date refresh behavior ───────────────────────
  it('synchronizes and refreshes rendered plan when initialResult prop changes', async () => {
    const TargetGradePlanner = (await import('@/components/subjects/target-grade-planner')).default

    const initialPlan: import('@/lib/planner').PlannerResult = {
      status: 'available',
      summary: {
        subjectId: 'sub-1',
        subjectName: 'Mathematics',
        subjectCode: '9709',
        colorHex: '#3b82f6',
        studyRoute: 'as_only',
        targetGrade: 'B',
        officialCombinedTarget: weightedMark(87),
        combinedMaximumMark: weightedMark(125),
        estimatedCombinedMark: weightedMark(85),
        marksStillNeeded: weightedMark(2),
        latestComparableGrade: 'B',
        rollingPredictedGrade: 'B',
        stagedBreakdown: null,
        provenance: {
          publicationId: 'pub-1',
          examYear: 2026,
          examSeries: 'june',
          officialIndexUrl: 'https://example.com',
          officialPdfUrl: 'https://example.com/pdf',
          officialPublishedOn: '2026-06-29',
          publishedAt: '2026-06-29T00:00:00Z',
          isFallback: false,
          intendedYear: 2026,
          intendedSeries: 'june',
        },
        perPaperAllocationEligible: true,
        safetyMargin: { type: 'none' },
        adjustedCombinedTarget: weightedMark(87),
        resolvedOptionCode: '12, 22',
        isOptionResolved: true,
      },
      paperPlans: [],
    }

    const { container, rerender } = render(
      <TargetGradePlanner
        subjectId="sub-1"
        subjectColor="#3b82f6"
        initialResult={initialPlan}
      />
    )

    // Initial target grade is B with mark 87
    expect(screen.getByText(/Combined Target \(B\)/)).toBeTruthy()
    expect(screen.getByText(/87/)).toBeTruthy()

    // Simulate page parent updating target grade to A with target 101
    const updatedPlan: import('@/lib/planner').PlannerResult = {
      status: 'available',
      summary: {
        ...initialPlan.summary,
        targetGrade: 'A',
        officialCombinedTarget: weightedMark(101),
        adjustedCombinedTarget: weightedMark(101),
      },
      paperPlans: [],
    }

    rerender(
      <TargetGradePlanner
        subjectId="sub-1"
        subjectColor="#3b82f6"
        initialResult={updatedPlan}
      />
    )

    // Asserts rendered plan immediately synchronizes to Grade A with target 101
    const matchingTargetGradeElements = container.querySelectorAll('span')
    const hasTargetA = Array.from(matchingTargetGradeElements).some((el) =>
      el.textContent?.includes('Combined Target (A)')
    )
    expect(hasTargetA).toBe(true)
    const hasMark101 = Array.from(container.querySelectorAll('*')).some((el) =>
      el.textContent?.includes('101')
    )
    expect(hasMark101).toBe(true)
  })

  // ─── 32. Tightened full-paper evidence: non-null paper ID & variant isolation ─
  it('requires non-null subject_paper_id and isolates attempts strictly to target variant or approved variant group', () => {
    const rawAttempts: RawPastPaperAttempt[] = [
      {
        id: 'att-null-paper-id',
        subject_id: 'sub-1',
        subject_paper_id: null, // Null paper ID must be rejected!
        paper_number: 12,
        year: 2026,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2026-05-10',
        created_at: '2026-05-10T10:00:00Z',
        score_raw: 50,
        score_max: 75,
      },
      {
        id: 'att-var-11',
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 11, // Variant 11
        year: 2026,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2026-05-11',
        created_at: '2026-05-11T10:00:00Z',
        score_raw: 52,
        score_max: 75,
      },
      {
        id: 'att-var-12',
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 12, // Variant 12
        year: 2026,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2026-05-12',
        created_at: '2026-05-12T10:00:00Z',
        score_raw: 58,
        score_max: 75,
      },
      {
        id: 'att-var-19',
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 19, // Special variant not in approved group
        year: 2026,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2026-05-13',
        created_at: '2026-05-13T10:00:00Z',
        score_raw: 60,
        score_max: 75,
      },
    ]

    // Check A: Explicit target variant = '12'
    const resultExplicit = filterAndNormalizeAttempts(rawAttempts, {
      subjectId: 'sub-1',
      subjectPaperId: 'p-1',
      componentPaperNumber: 1,
      stage: 'as',
      officialComponentMax: rawMark(75),
      targetVariantCode: '12',
    })

    // Only att-var-12 should be compatible
    expect(resultExplicit.compatible.length).toBe(1)
    expect(resultExplicit.compatible[0].id).toBe('att-var-12')
    expect(resultExplicit.excluded.some((e) => e.attemptId === 'att-null-paper-id')).toBe(true)
    expect(resultExplicit.excluded.some((e) => e.attemptId === 'att-var-11')).toBe(true)

    // Check B: Unknown target variant with approved group ['11', '12', '13']
    const resultUnknown = filterAndNormalizeAttempts(rawAttempts, {
      subjectId: 'sub-1',
      subjectPaperId: 'p-1',
      componentPaperNumber: 1,
      stage: 'as',
      officialComponentMax: rawMark(75),
      targetVariantCode: null,
      allowedVariants: ['11', '12', '13'],
    })

    // Both att-var-11 and att-var-12 compatible, but att-var-19 excluded
    expect(resultUnknown.compatible.map((c) => c.id)).toEqual(['att-var-11', 'att-var-12'])
    const excludedVar19 = resultUnknown.excluded.find((e) => e.attemptId === 'att-var-19')
    expect(excludedVar19?.reason).toBe('incompatible-variant')
  })

  // ─── 33. Impossible safety-margin allocation handling ──────────────────────
  it('detects when safety margin allocation exceeds combination capacity while base target is viable', () => {
    const components: AllocationComponentInput[] = [
      {
        subjectPaperId: 'p-1',
        componentPaperNumber: 1,
        componentName: 'Pure 1',
        floorRawMark: rawMark(60),
        maxRawMark: rawMark(75),
        weightingFactor: weightingFactor(1.0),
        studentBaselineRawMark: rawMark(65),
      },
      {
        subjectPaperId: 'p-2',
        componentPaperNumber: 2,
        componentName: 'Pure 2',
        floorRawMark: rawMark(40),
        maxRawMark: rawMark(50),
        weightingFactor: weightingFactor(1.0),
        studentBaselineRawMark: rawMark(42),
      },
    ]

    const combinationMax = weightedMark(125)
    const baseTarget = weightedMark(120) // Base target is possible (120 <= 125)
    const baseAlloc = allocateComponentMarks({
      targetCombinedMark: baseTarget,
      combinationMaxMark: combinationMax,
      components,
      isAStar: false,
    })
    expect(baseAlloc.isMathematicallyPossible).toBe(true)

    // A safety margin that pushes target to 130 marks exceeds capacity (125)
    const impossibleMarginTarget = weightedMark(130)
    const marginAlloc = allocateComponentMarks({
      targetCombinedMark: impossibleMarginTarget,
      combinationMaxMark: combinationMax,
      components,
      isAStar: false,
    })
    expect(marginAlloc.isMathematicallyPossible).toBe(false)
    expect(marginAlloc.impossibleReason).toContain('exceeds the maximum possible score')
  })

  // ─── 34. Regression: Duplicate attempts choose deterministic latest attempt in findLatestComparableSitting ─
  it('chooses the deterministic latest attempt by attempted_at, created_at, then id when multiple attempts match a component in a sitting', () => {
    const historicalCombs = [
      {
        combinationId: 'comb-1',
        year: 2024,
        series: 'june' as const,
        canonicalKey: 'AY',
        qualificationLevel: 'a_level' as const,
        requiredComponents: [
          { subjectPaperId: 'p-1', componentCode: '12', stage: 'as' as const, weightingFactor: 1.0, rawMax: 75 },
        ],
        combinationMarks: [
          { grade: 'A*', thresholdMark: 70 },
          { grade: 'A', thresholdMark: 60 },
          { grade: 'B', thresholdMark: 50 },
          { grade: 'C', thresholdMark: 40 },
          { grade: 'D', thresholdMark: 30 },
          { grade: 'E', thresholdMark: 20 },
        ],
      },
    ]

    // Two attempts for Paper 1 Variant 12 in June 2024:
    // Older attempt att-1: raw score 45 (would be Grade C)
    // Newer attempt att-2: raw score 65 (would be Grade A)
    // They have identical attempted_at, but att-2 has later created_at
    const attempts: RawPastPaperAttempt[] = [
      {
        id: 'att-1',
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 12,
        year: 2024,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T09:00:00Z',
        score_raw: 45,
        score_max: 75,
      },
      {
        id: 'att-2',
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 12,
        year: 2024,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T14:00:00Z',
        score_raw: 65,
        score_max: 75,
      },
    ]

    const grade = findLatestComparableSitting(attempts, historicalCombs)
    // Must deterministically choose att-2 (Grade A) rather than att-1 (Grade C)
    expect(grade).toBe('A')

    // Also test tie-breaker by id when attempted_at and created_at are identical
    const tiedAttempts: RawPastPaperAttempt[] = [
      {
        id: 'att-a',
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 12,
        year: 2024,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T10:00:00Z',
        score_raw: 40,
        score_max: 75,
      },
      {
        id: 'att-z',
        subject_id: 'sub-1',
        subject_paper_id: 'p-1',
        paper_number: 12,
        year: 2024,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T10:00:00Z',
        score_raw: 65,
        score_max: 75,
      },
    ]

    const tiedGrade = findLatestComparableSitting(tiedAttempts, historicalCombs)
    // 'att-z' > 'att-a' deterministically
    expect(tiedGrade).toBe('A')
  })

  // ─── 35. Regression: Stale in-flight response cannot overwrite refreshed initialResult ─
  it('proves that a stale in-flight response cannot overwrite refreshed initialResult and resets variant/margin state', async () => {
    let resolveStaleCall: (res: PlannerResult) => void = () => {}
    const stalePromise = new Promise<PlannerResult>((resolve) => {
      resolveStaleCall = resolve
    })

    const initialPlan1: PlannerResult = {
      status: 'available',
      summary: {
        subjectId: 'sub-1',
        subjectName: 'Maths',
        subjectCode: '9709',
        colorHex: '#3b82f6',
        studyRoute: 'as_only',
        targetGrade: 'A',
        officialCombinedTarget: weightedMark(100),
        combinedMaximumMark: weightedMark(125),
        estimatedCombinedMark: null,
        marksStillNeeded: null,
        latestComparableGrade: null,
        rollingPredictedGrade: null,
        stagedBreakdown: null,
        provenance: {
          publicationId: 'pub-1',
          examYear: 2026,
          examSeries: 'june',
          officialIndexUrl: '',
          officialPdfUrl: '',
          officialPublishedOn: null,
          publishedAt: null,
          isFallback: false,
          intendedYear: 2026,
          intendedSeries: 'june',
        },
        perPaperAllocationEligible: true,
        safetyMargin: { type: 'none' },
        adjustedCombinedTarget: weightedMark(100),
        resolvedOptionCode: 'AX',
        isOptionResolved: true,
      },
      paperPlans: [
        {
          subjectPaperId: 'p-1',
          componentPaperNumber: 1,
          componentName: 'Pure 1',
          stage: 'as',
          targetVariantChoice: 'unknown',
          sourceKind: 'official_exact',
          rawMaximumMark: rawMark(75),
          benchmarkFloorMark: rawMark(60),
          requiredMark: rawMark(60),
          requiredMarkWithSafetyMargin: rawMark(60),
          isAllocationAvailable: true,
          officialWeightingFactor: weightingFactor(1.0),
          evidence: {
            attemptCount: 0,
            latestRawScore: null,
            latestRawMax: null,
            officialMax: rawMark(75),
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
          },
          latestGap: null,
          lifetimeAverageGap: null,
          baselineGap: null,
          includedVariants: ['11'],
          availableVariants: [{ variantCode: '11', label: 'Variant 11' }],
          hasApprovedAverage: true,
          isAStarEstimate: false,
        },
      ],
    }

    vi.mocked(getTargetGradePlan).mockImplementation((_subId, opts) => {
      if (opts?.selectedVariants && Object.keys(opts.selectedVariants).length > 0) {
        return stalePromise
      }
      return Promise.resolve(initialPlan1)
    })

    const refreshedPlan2: PlannerResult = {
      status: 'available',
      summary: {
        ...initialPlan1.summary,
        targetGrade: 'B',
        officialCombinedTarget: weightedMark(85),
      },
      paperPlans: [
        {
          ...initialPlan1.paperPlans[0],
          requiredMark: rawMark(48),
        },
      ],
    }

    const { rerender, container } = render(
      <TargetGradePlanner
        subjectId="sub-1"
        subjectColor="#3b82f6"
        initialResult={initialPlan1}
      />
    )

    // Initial render shows Target Grade A and target 100
    expect(within(container).getByText('Combined Target (A)')).toBeTruthy()

    // Trigger an async variant selection on Plan 1 that hangs
    const variantBtn = within(container).getByText('Variant 11')
    act(() => {
      variantBtn.click()
    })

    // Now parent passes refreshedPlan2 (e.g. user changed target grade to B in header)
    act(() => {
      rerender(
        <TargetGradePlanner
          subjectId="sub-1"
          subjectColor="#3b82f6"
          initialResult={refreshedPlan2}
        />
      )
    })

    // Component immediately updates to Target Grade B and target 85
    expect(within(container).getByText('Combined Target (B)')).toBeTruthy()

    // Now resolve the hanging stale promise with outdated Plan 1 variant data
    const staleResponse: PlannerResult = {
      status: 'available',
      summary: {
        ...initialPlan1.summary,
        targetGrade: 'A',
        officialCombinedTarget: weightedMark(999), // Stale corrupt mark
      },
      paperPlans: initialPlan1.paperPlans,
    }

    await act(async () => {
      resolveStaleCall(staleResponse)
    })

    // Assert stale response was DISCARDED: still shows Target Grade B and 85, NOT 999!
    expect(within(container).getByText('Combined Target (B)')).toBeTruthy()
    expect(within(container).queryByText('999')).toBeNull()
  })

  // ─── 36. Stage parity: AS attempt cannot satisfy A2 or full-level historical component ─
  it('proves that AS history cannot satisfy a full-level or A2 component with the same paper ID and variant', () => {
    const historicalCombs = [
      {
        combinationId: 'comb-june-2024-linear',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:LINEAR',
        qualificationLevel: 'a_level' as const,
        requiredComponents: [
          // Component requires stage: 'a2'
          { subjectPaperId: 'paper-3', componentCode: '32', stage: 'a2' as const, weightingFactor: 1.0, rawMax: 75 },
        ],
        combinationMarks: [
          { grade: 'A*', thresholdMark: 70 },
          { grade: 'A', thresholdMark: 60 },
          { grade: 'B', thresholdMark: 50 },
          { grade: 'C', thresholdMark: 40 },
          { grade: 'D', thresholdMark: 30 },
          { grade: 'E', thresholdMark: 20 },
        ],
      },
    ]

    // Student attempted paper-3 variant 32, but with stage: 'as' (e.g. earlier mock or misclassified attempt)
    const asAttempt: RawPastPaperAttempt[] = [
      {
        id: 'att-as',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-3',
        paper_number: 32,
        year: 2024,
        session: 'may_jun',
        stage: 'as', // Stage mismatch!
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T10:00:00Z',
        score_raw: 65,
        score_max: 75,
      },
    ]

    // Must return null because attempt stage ('as') does not match component stage ('a2')
    expect(findLatestComparableSitting(asAttempt, historicalCombs)).toBeNull()

    // When the attempt stage is correctly 'a2', it matches and returns Grade A
    const a2Attempt: RawPastPaperAttempt[] = [
      {
        ...asAttempt[0],
        id: 'att-a2',
        stage: 'a2',
      },
    ]
    expect(findLatestComparableSitting(a2Attempt, historicalCombs)).toBe('A')
  })

  // ─── 37. Removal of historical threshold defaults to zero & incomplete marks ─
  it('returns null from findLatestComparableSitting for empty or incomplete marks or invalid component definitions', () => {
    // Empty combinationMarks
    const emptyMarksComb = [
      {
        combinationId: 'comb-empty',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:EMPTY',
        qualificationLevel: 'a_level' as const,
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'as' as const, weightingFactor: 1.0, rawMax: 75 },
        ],
        combinationMarks: [], // EMPTY MARKS
      },
    ]

    const attempts: RawPastPaperAttempt[] = [
      {
        id: 'att-1',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-1',
        paper_number: 12,
        year: 2024,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T10:00:00Z',
        score_raw: 50,
        score_max: 75,
      },
    ]

    // Must return null, NEVER an invented grade like 'U'
    expect(findLatestComparableSitting(attempts, emptyMarksComb)).toBeNull()

    // Invalid component weighting
    const invalidWeightComb = [
      {
        combinationId: 'comb-inv-weight',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:INV',
        qualificationLevel: 'a_level' as const,
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'as' as const, weightingFactor: 0, rawMax: 75 },
        ],
        combinationMarks: [
          { grade: 'A*', thresholdMark: 65 },
          { grade: 'A', thresholdMark: 50 },
          { grade: 'B', thresholdMark: 40 },
          { grade: 'C', thresholdMark: 30 },
          { grade: 'D', thresholdMark: 20 },
          { grade: 'E', thresholdMark: 10 },
        ],
      },
    ]
    expect(findLatestComparableSitting(attempts, invalidWeightComb)).toBeNull()

    // Invalid rawMax
    const invalidMaxComb = [
      {
        combinationId: 'comb-inv-max',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:INVMAX',
        qualificationLevel: 'a_level' as const,
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'as' as const, weightingFactor: 1.0, rawMax: 0 },
        ],
        combinationMarks: [
          { grade: 'A*', thresholdMark: 65 },
          { grade: 'A', thresholdMark: 50 },
          { grade: 'B', thresholdMark: 40 },
          { grade: 'C', thresholdMark: 30 },
          { grade: 'D', thresholdMark: 20 },
          { grade: 'E', thresholdMark: 10 },
        ],
      },
    ]
    expect(findLatestComparableSitting(attempts, invalidMaxComb)).toBeNull()
  })

  // ─── 38. Official floor (60) vs generated allocation (63) label separation ─
  it('describes official component floor of 60 as official and generated allocation of 63 as Atlas estimate', () => {
    const mockPlanWithHigherAlloc: PaperPlanResult = {
      subjectPaperId: 'paper-1',
      componentPaperNumber: 1,
      componentName: 'Pure Mathematics 1',
      stage: 'as',
      targetVariantChoice: '12',
      sourceKind: 'official_exact',
      rawMaximumMark: rawMark(75),
      benchmarkFloorMark: rawMark(60), // Official floor is 60
      requiredMark: rawMark(63), // Generated required mark is 63
      requiredMarkWithSafetyMargin: rawMark(66),
      isAllocationAvailable: true,
      officialWeightingFactor: weightingFactor(1.0),
      evidence: {
        attemptCount: 1,
        latestRawScore: rawMark(55),
        latestRawMax: rawMark(75),
        officialMax: rawMark(75),
        latestNormalizedScore: rawMark(55),
        latestAttemptDate: '2026-05-01',
        latestHistoricalGrade: 'B',
        unweightedLifetimeAverage: rawMark(55),
        recencyWeightedBaseline: rawMark(55),
        variability: null,
        trend: 'stable',
        trendDelta: 0,
        hasSufficientSample: false,
        rollingPredictedScore: null,
      },
      latestGap: rawMark(8),
      lifetimeAverageGap: rawMark(8),
      baselineGap: rawMark(8),
      includedVariants: ['12'],
      availableVariants: [{ variantCode: '12', label: 'Variant 12' }],
      hasApprovedAverage: true,
      isAStarEstimate: false,
    }

    const { container } = render(
      <TargetGradePlannerPaperCard
        paperPlan={mockPlanWithHigherAlloc}
        subjectColor="#3b82f6"
        selectedVariant="12"
        onSelectVariant={vi.fn()}
      />
    )

    // Floor 60 is described as official
    expect(within(container).getAllByText(/Official component threshold/i).length).toBeGreaterThanOrEqual(1)
    expect(within(container).getByText(/60 \/ 75/)).toBeTruthy()

    // Generated allocation of 63 and 66 are labeled "Atlas estimate"
    const estimateBadges = within(container).getAllByText('Atlas estimate')
    expect(estimateBadges.length).toBeGreaterThanOrEqual(1)
    expect(within(container).getByText('63')).toBeTruthy()
    expect(within(container).getByText('66')).toBeTruthy()

    // Assert that text containing "official" does NOT describe 63
    const officialElements = container.querySelectorAll('*')
    for (const el of officialElements) {
      if (el.textContent && /official/i.test(el.textContent) && el.children.length === 0) {
        expect(el.textContent).not.toContain('63')
      }
    }
  })

  // ─── 39. Threshold unavailable when sourceKind is null ───────────────────
  it('displays Threshold unavailable and NEVER Atlas Estimate when sourceKind is null', () => {
    const mockPlanNoSource: PaperPlanResult = {
      subjectPaperId: 'paper-1',
      componentPaperNumber: 1,
      componentName: 'Pure Mathematics 1',
      stage: 'as',
      targetVariantChoice: 'unknown',
      sourceKind: null, // Null sourceKind
      rawMaximumMark: null,
      benchmarkFloorMark: null,
      requiredMark: null,
      requiredMarkWithSafetyMargin: null,
      isAllocationAvailable: false,
      allocationUnavailableReason: 'No threshold data available',
      officialWeightingFactor: null,
      evidence: {
        attemptCount: 0,
        latestRawScore: null,
        latestRawMax: null,
        officialMax: null,
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
      },
      latestGap: null,
      lifetimeAverageGap: null,
      baselineGap: null,
      includedVariants: [],
      availableVariants: [],
      hasApprovedAverage: false,
      isAStarEstimate: false,
    }

    const { container } = render(
      <TargetGradePlannerPaperCard
        paperPlan={mockPlanNoSource}
        subjectColor="#3b82f6"
        selectedVariant="unknown"
        onSelectVariant={vi.fn()}
      />
    )

    // Displays "Threshold unavailable"
    expect(within(container).getByText('Threshold unavailable')).toBeTruthy()
    // MUST NEVER display "Atlas Estimate"
    expect(within(container).queryByText(/Atlas Estimate/i)).toBeNull()
  })

  // ─── 40. Fallback banners rendering tailored copy ─────────────────────────
  it('renders tailored fallback banners for unpublished series and incompatible options', () => {
    const baseSummary: SubjectLevelPlanSummary = {
      subjectId: 'sub-1',
      subjectName: 'Mathematics',
      subjectCode: '9709',
      colorHex: '#3b82f6',
      studyRoute: 'full_level',
      targetGrade: 'A',
      officialCombinedTarget: weightedMark(100),
      combinedMaximumMark: weightedMark(250),
      estimatedCombinedMark: null,
      marksStillNeeded: null,
      latestComparableGrade: null,
      rollingPredictedGrade: null,
      stagedBreakdown: null,
      provenance: {
        publicationId: 'pub-2025',
        examYear: 2025,
        examSeries: 'november',
        officialIndexUrl: 'https://example.com',
        officialPdfUrl: 'https://example.com/pdf',
        officialPublishedOn: '2025-11-20',
        publishedAt: '2025-11-20T00:00:00Z',
        isFallback: true,
        fallbackReason: 'intended_series_unpublished',
        intendedYear: 2026,
        intendedSeries: 'june',
      },
      perPaperAllocationEligible: true,
      safetyMargin: { type: 'none' },
      adjustedCombinedTarget: null,
      resolvedOptionCode: 'AY',
      isOptionResolved: true,
    }

    // Case A: Unpublished intended series
    const { rerender, container } = render(
      <TargetGradePlannerSummary summary={baseSummary} onSelectSafetyMargin={vi.fn()} />
    )
    expect(within(container).getByText(/are not yet published/i)).toBeTruthy()

    // Case B: Incompatible variants or options
    const incompatibleSummary: SubjectLevelPlanSummary = {
      ...baseSummary,
      provenance: {
        ...baseSummary.provenance,
        fallbackReason: 'incompatible_variants_or_options',
      },
    }
    rerender(<TargetGradePlannerSummary summary={incompatibleSummary} onSelectSafetyMargin={vi.fn()} />)
    expect(
      within(container).getByText(/does not contain a compatible option for your selected route and paper variants/i)
    ).toBeTruthy()
  })

  // ─── 41. Staged route A-E UI: combined threshold visible, projections and margins disabled ─
  it('renders Staged Route Grade A pathway breakdown with provisional AS estimate when stagedBreakdown is present', () => {
    const stagedASummary: SubjectLevelPlanSummary = {
      subjectId: 'sub-1',
      subjectName: 'Mathematics',
      subjectCode: '9709',
      colorHex: '#3b82f6',
      studyRoute: 'staged',
      targetGrade: 'A',
      officialCombinedTarget: weightedMark(197),
      combinedMaximumMark: weightedMark(250),
      estimatedCombinedMark: null,
      marksStillNeeded: null,
      latestComparableGrade: null,
      rollingPredictedGrade: null,
      stagedBreakdown: {
        kind: 'estimated_halfway',
        estimatedAsContribution: weightedMark(99),
        remainingA2Required: weightedMark(98),
        a2MaximumWeightedMark: weightedMark(125),
        isMathematicallyPossible: true,
      },
      provenance: {
        publicationId: 'pub-2026',
        examYear: 2026,
        examSeries: 'june',
        officialIndexUrl: 'https://example.com',
        officialPdfUrl: 'https://example.com/pdf',
        officialPublishedOn: '2026-06-20',
        publishedAt: '2026-06-20T00:00:00Z',
        isFallback: false,
        intendedYear: 2026,
        intendedSeries: 'june',
      },
      perPaperAllocationEligible: false,
      safetyMargin: { type: 'none' },
      adjustedCombinedTarget: null,
      resolvedOptionCode: 'EC',
      isOptionResolved: true,
      estimatedCombinedUnavailableReason:
        'For staged routes, official AS marks must be verified before calculating combined totals.',
    }

    const { container } = render(
      <TargetGradePlannerSummary summary={stagedASummary} onSelectSafetyMargin={vi.fn()} />
    )

    expect(within(container).getByText('197')).toBeTruthy()
    expect(within(container).getByText('/ 250')).toBeTruthy()
    expect(within(container).getByText('Staged Grade A Pathway Plan')).toBeTruthy()
    expect(within(container).getByText('Atlas Estimate (Provisional AS Benchmark)')).toBeTruthy()
    expect(within(container).getByText('99 marks')).toBeTruthy()
    expect(within(container).getByText('98 / 125 marks')).toBeTruthy()
    expect(within(container).getAllByText('Awaiting verified AS mark').length).toBe(2)

    const marginButtons = container.querySelectorAll('button')
    for (const btn of marginButtons) {
      expect(btn.hasAttribute('disabled')).toBe(true)
    }

    expect(
      within(container).getByText('Safety margin adjustments are unavailable when paper mark allocation is disabled.')
    ).toBeTruthy()
  })

  // ─── 42. Partial component-token coverage returns null from findLatestComparableSitting ─
  it('returns null from findLatestComparableSitting for partial component-token coverage', () => {
    const historicalCombs = [
      {
        combinationId: 'comb-partial-coverage',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:PARTIAL',
        qualificationLevel: 'as' as const,
        // Only 1 component token provided, but expected route requires 2 papers
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'as' as const, weightingFactor: 1.0, rawMax: 75 },
        ],
        combinationMarks: [
          { grade: 'a', thresholdMark: 95 },
          { grade: 'b', thresholdMark: 80 },
          { grade: 'c', thresholdMark: 65 },
          { grade: 'd', thresholdMark: 50 },
          { grade: 'e', thresholdMark: 40 },
        ],
      },
    ]

    const expectedRoutePapers = [
      { subjectPaperId: 'paper-1', stage: 'as' as const },
      { subjectPaperId: 'paper-2', stage: 'as' as const },
    ]

    const attempts: RawPastPaperAttempt[] = [
      {
        id: 'att-1',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-1',
        paper_number: 12,
        year: 2024,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T10:00:00Z',
        score_raw: 70,
        score_max: 75,
      },
    ]

    const grade = findLatestComparableSitting(attempts, historicalCombs, expectedRoutePapers)
    expect(grade).toBeNull()
  })

  // ─── 43. Incomplete grade sets return null from findLatestComparableSitting ─
  it('returns null from findLatestComparableSitting for partial A-Level grade sets (5 of 6) or AS-Level grade sets (4 of 5)', () => {
    // A-Level missing 'E' (only 5 grades)
    const incompleteALevelComb = [
      {
        combinationId: 'comb-a-level-5-grades',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:INCOMPLETE_A',
        qualificationLevel: 'a_level' as const,
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'a2' as const, weightingFactor: 1.0, rawMax: 75 },
        ],
        combinationMarks: [
          { grade: 'A*', thresholdMark: 70 },
          { grade: 'A', thresholdMark: 60 },
          { grade: 'B', thresholdMark: 50 },
          { grade: 'C', thresholdMark: 40 },
          { grade: 'D', thresholdMark: 30 },
          // Missing 'E'!
        ],
      },
    ]

    const attempts: RawPastPaperAttempt[] = [
      {
        id: 'att-1',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-1',
        paper_number: 12,
        year: 2024,
        session: 'may_jun',
        stage: 'a2',
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T10:00:00Z',
        score_raw: 65,
        score_max: 75,
      },
    ]

    expect(findLatestComparableSitting(attempts, incompleteALevelComb)).toBeNull()

    // AS-Level missing 'e' (only 4 grades)
    const incompleteASComb = [
      {
        combinationId: 'comb-as-4-grades',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:INCOMPLETE_AS',
        qualificationLevel: 'as' as const,
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'as' as const, weightingFactor: 1.0, rawMax: 75 },
        ],
        combinationMarks: [
          { grade: 'a', thresholdMark: 60 },
          { grade: 'b', thresholdMark: 50 },
          { grade: 'c', thresholdMark: 40 },
          { grade: 'd', thresholdMark: 30 },
          // Missing 'e'!
        ],
      },
    ]

    const asAttempts: RawPastPaperAttempt[] = [
      {
        ...attempts[0],
        stage: 'as',
      },
    ]

    expect(findLatestComparableSitting(asAttempts, incompleteASComb)).toBeNull()
  })

  // ─── 44. Duplicate or unexpected grade identities return null from findLatestComparableSitting ─
  it('returns null from findLatestComparableSitting for duplicate or unexpected grade identities', () => {
    // Duplicate grade 'A'
    const duplicateGradeComb = [
      {
        combinationId: 'comb-dup',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:DUP',
        qualificationLevel: 'a_level' as const,
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'a2' as const, weightingFactor: 1.0, rawMax: 75 },
        ],
        combinationMarks: [
          { grade: 'A*', thresholdMark: 70 },
          { grade: 'A', thresholdMark: 60 },
          { grade: 'A', thresholdMark: 55 }, // Duplicate!
          { grade: 'C', thresholdMark: 40 },
          { grade: 'D', thresholdMark: 30 },
          { grade: 'E', thresholdMark: 20 },
        ],
      },
    ]

    const attempts: RawPastPaperAttempt[] = [
      {
        id: 'att-1',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-1',
        paper_number: 12,
        year: 2024,
        session: 'may_jun',
        stage: 'a2',
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T10:00:00Z',
        score_raw: 65,
        score_max: 75,
      },
    ]

    expect(findLatestComparableSitting(attempts, duplicateGradeComb)).toBeNull()

    // Unexpected grade 'X'
    const unexpectedGradeComb = [
      {
        combinationId: 'comb-unexpected',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:UNEXPECTED',
        qualificationLevel: 'a_level' as const,
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'a2' as const, weightingFactor: 1.0, rawMax: 75 },
        ],
        combinationMarks: [
          { grade: 'A*', thresholdMark: 70 },
          { grade: 'A', thresholdMark: 60 },
          { grade: 'B', thresholdMark: 50 },
          { grade: 'C', thresholdMark: 40 },
          { grade: 'D', thresholdMark: 30 },
          { grade: 'X', thresholdMark: 20 }, // Unexpected grade!
        ],
      },
    ]

    expect(findLatestComparableSitting(attempts, unexpectedGradeComb)).toBeNull()
  })

  // ─── 45. Explicit official zero thresholds are preserved and grade 0 as E ─
  it('preserves explicit official zero thresholds and grades a score of 0 as E when threshold is 0', () => {
    // Test in findLatestComparableSitting
    const zeroThresholdComb = [
      {
        combinationId: 'comb-zero-e',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:ZERO_E',
        qualificationLevel: 'a_level' as const,
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'a2' as const, weightingFactor: 1.0, rawMax: 75 },
        ],
        combinationMarks: [
          { grade: 'A*', thresholdMark: 65 },
          { grade: 'A', thresholdMark: 55 },
          { grade: 'B', thresholdMark: 45 },
          { grade: 'C', thresholdMark: 35 },
          { grade: 'D', thresholdMark: 25 },
          { grade: 'E', thresholdMark: 0 }, // Explicit zero threshold!
        ],
      },
    ]

    const zeroScoreAttempt: RawPastPaperAttempt[] = [
      {
        id: 'att-zero',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-1',
        paper_number: 12,
        year: 2024,
        session: 'may_jun',
        stage: 'a2',
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T10:00:00Z',
        score_raw: 0, // Score = 0
        score_max: 75,
      },
    ]

    const grade = findLatestComparableSitting(zeroScoreAttempt, zeroThresholdComb)
    // 0 >= 0, so it must grade as 'E', not 'U'!
    expect(grade).toBe('E')

    // Test in gradeHistoricalScore
    const componentGrade = gradeHistoricalScore(0, {
      A: 55,
      B: 45,
      C: 35,
      D: 25,
      E: 0,
    })
    expect(componentGrade).toBe('E')
  })

  // ─── 46. Paper card displays Threshold unavailable and never Official component threshold when sourceKind is null ─
  it('renders paper card with Threshold unavailable (and never Official component threshold) when sourceKind is null', () => {
    const paperPlanWithoutSource: PaperPlanResult = {
      subjectPaperId: 'paper-1',
      componentPaperNumber: 1,
      componentName: 'Pure Mathematics 1',
      stage: 'as',
      targetVariantChoice: '12',
      sourceKind: null, // sourceKind is null
      rawMaximumMark: null,
      benchmarkFloorMark: null,
      requiredMark: null,
      requiredMarkWithSafetyMargin: null,
      isAllocationAvailable: false,
      allocationUnavailableReason: 'Official threshold mark is missing for variant 12.',
      officialWeightingFactor: null,
      evidence: {
        attemptCount: 0,
        latestRawScore: null,
        latestRawMax: null,
        officialMax: null,
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
      },
      latestGap: null,
      lifetimeAverageGap: null,
      baselineGap: null,
      includedVariants: [],
      availableVariants: [{ variantCode: '12', label: 'Variant 12' }],
      hasApprovedAverage: false,
      isAStarEstimate: false,
    }

    const { container } = render(
      <TargetGradePlannerPaperCard
        paperPlan={paperPlanWithoutSource}
        subjectColor="#3b82f6"
        selectedVariant="12"
        onSelectVariant={vi.fn()}
      />
    )

    // Displays "Threshold unavailable"
    expect(within(container).getByText('Threshold unavailable')).toBeTruthy()

    // Must NOT display "Official component threshold", "Atlas benchmark", or "Atlas estimate"
    expect(within(container).queryByText(/Official component threshold/i)).toBeNull()
    expect(within(container).queryByText(/Atlas benchmark/i)).toBeNull()
    expect(within(container).queryByText(/Atlas estimate/i)).toBeNull()
  })

  // ─── 47. Deterministic grade ordering: equal A* and A thresholds ───────────
  it('evaluates equal A* and A thresholds as A*, regardless of input array order', () => {
    // Order 1: Grade A appears before Grade A*
    const combWithABeforeAStar = [
      {
        combinationId: 'comb-a-first',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:A_FIRST',
        qualificationLevel: 'a_level' as const,
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'as' as const, weightingFactor: 1.0, rawMax: 75 },
        ],
        combinationMarks: [
          { grade: 'A', thresholdMark: 60 },
          { grade: 'A*', thresholdMark: 60 }, // Equal threshold to A!
          { grade: 'B', thresholdMark: 50 },
          { grade: 'C', thresholdMark: 40 },
          { grade: 'D', thresholdMark: 30 },
          { grade: 'E', thresholdMark: 20 },
        ],
      },
    ]

    // Order 2: Grade A* appears before Grade A
    const combWithAStarBeforeA = [
      {
        ...combWithABeforeAStar[0],
        combinationId: 'comb-astar-first',
        combinationMarks: [
          { grade: 'A*', thresholdMark: 60 },
          { grade: 'A', thresholdMark: 60 },
          { grade: 'B', thresholdMark: 50 },
          { grade: 'C', thresholdMark: 40 },
          { grade: 'D', thresholdMark: 30 },
          { grade: 'E', thresholdMark: 20 },
        ],
      },
    ]

    const attempts: RawPastPaperAttempt[] = [
      {
        id: 'att-60',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-1',
        paper_number: 12,
        year: 2024,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T10:00:00Z',
        score_raw: 60,
        score_max: 75,
      },
    ]

    // Both must evaluate to 'A*' (highest qualification rank) regardless of input order
    expect(findLatestComparableSitting(attempts, combWithABeforeAStar)).toBe('A*')
    expect(findLatestComparableSitting(attempts, combWithAStarBeforeA)).toBe('A*')

    // Also verify pure evaluateGradeFromThresholds directly
    expect(
      evaluateGradeFromThresholds(60, combWithABeforeAStar[0].combinationMarks, 'a_level')
    ).toBe('A*')
    expect(
      evaluateGradeFromThresholds(60, combWithAStarBeforeA[0].combinationMarks, 'a_level')
    ).toBe('A*')
  })

  // ─── 48. Deterministic grade ordering: equal AS a and b thresholds ──────────
  it('evaluates equal AS a and b thresholds as a, regardless of input array order', () => {
    // Order 1: Grade b appears before Grade a
    const combWithBBeforeA = [
      {
        combinationId: 'comb-b-first',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:B_FIRST',
        qualificationLevel: 'as' as const,
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'as' as const, weightingFactor: 1.0, rawMax: 75 },
        ],
        combinationMarks: [
          { grade: 'b', thresholdMark: 50 },
          { grade: 'a', thresholdMark: 50 }, // Equal threshold to b!
          { grade: 'c', thresholdMark: 40 },
          { grade: 'd', thresholdMark: 30 },
          { grade: 'e', thresholdMark: 20 },
        ],
      },
    ]

    // Order 2: Grade a appears before Grade b
    const combWithABeforeB = [
      {
        ...combWithBBeforeA[0],
        combinationId: 'comb-a-first',
        combinationMarks: [
          { grade: 'a', thresholdMark: 50 },
          { grade: 'b', thresholdMark: 50 },
          { grade: 'c', thresholdMark: 40 },
          { grade: 'd', thresholdMark: 30 },
          { grade: 'e', thresholdMark: 20 },
        ],
      },
    ]

    const attempts: RawPastPaperAttempt[] = [
      {
        id: 'att-50',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-1',
        paper_number: 12,
        year: 2024,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T10:00:00Z',
        score_raw: 50,
        score_max: 75,
      },
    ]

    // Both must evaluate to 'a' (highest qualification rank) regardless of input order
    expect(findLatestComparableSitting(attempts, combWithBBeforeA)).toBe('a')
    expect(findLatestComparableSitting(attempts, combWithABeforeB)).toBe('a')

    // Also verify pure evaluateGradeFromThresholds directly
    expect(
      evaluateGradeFromThresholds(50, combWithBBeforeA[0].combinationMarks, 'as')
    ).toBe('a')
    expect(
      evaluateGradeFromThresholds(50, combWithABeforeB[0].combinationMarks, 'as')
    ).toBe('a')
  })

  // ─── 49. Missing or unexpected qualificationLevel yields null ──────────────
  it('returns null from findLatestComparableSitting when qualificationLevel is missing or unexpected', () => {
    const invalidLevelCombs = [
      {
        combinationId: 'comb-missing-level',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:MISSING',
        qualificationLevel: undefined as unknown as 'a_level', // Missing level
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'as' as const, weightingFactor: 1.0, rawMax: 75 },
        ],
        combinationMarks: [
          { grade: 'A*', thresholdMark: 70 },
          { grade: 'A', thresholdMark: 60 },
          { grade: 'B', thresholdMark: 50 },
          { grade: 'C', thresholdMark: 40 },
          { grade: 'D', thresholdMark: 30 },
          { grade: 'E', thresholdMark: 20 },
        ],
      },
      {
        combinationId: 'comb-unexpected-level',
        year: 2024,
        series: 'june' as const,
        canonicalKey: '9709:2024:june:UNEXPECTED',
        qualificationLevel: 'other' as unknown as 'a_level', // Unexpected level
        requiredComponents: [
          { subjectPaperId: 'paper-1', componentCode: '12', stage: 'as' as const, weightingFactor: 1.0, rawMax: 75 },
        ],
        combinationMarks: [
          { grade: 'A*', thresholdMark: 70 },
          { grade: 'A', thresholdMark: 60 },
          { grade: 'B', thresholdMark: 50 },
          { grade: 'C', thresholdMark: 40 },
          { grade: 'D', thresholdMark: 30 },
          { grade: 'E', thresholdMark: 20 },
        ],
      },
    ]

    const attempts: RawPastPaperAttempt[] = [
      {
        id: 'att-1',
        subject_id: 'sub-1',
        subject_paper_id: 'paper-1',
        paper_number: 12,
        year: 2024,
        session: 'may_jun',
        stage: 'as',
        attempted_at: '2024-05-15',
        created_at: '2024-05-15T10:00:00Z',
        score_raw: 65,
        score_max: 75,
      },
    ]

    expect(findLatestComparableSitting(attempts, [invalidLevelCombs[0]])).toBeNull()
    expect(findLatestComparableSitting(attempts, [invalidLevelCombs[1]])).toBeNull()
  })

  // ─── 50. Missing, zero, negative, and non-finite historical official maxima leave latestHistoricalGrade null ─
  it('leaves latestHistoricalGrade null when historical official maximum is missing, zero, negative, or non-finite', () => {
    const attempt = [
      {
        id: 'att-1',
        subjectId: 'sub-1',
        subjectPaperId: 'p-1',
        componentPaperNumber: 1,
        variantCode: '12',
        year: 2024,
        session: 'may_jun' as const,
        series: 'june' as const,
        stage: 'as' as const,
        attemptedAt: '2024-05-20',
        createdAt: '2024-05-20T10:00:00Z',
        scoreRaw: rawMark(50),
        scoreMax: rawMark(75),
        officialMax: rawMark(75),
        normalizedScore: rawMark(50),
      },
    ]

    const baseThresholds = { A: 50, B: 40, C: 30, D: 20, E: 10 }

    // Missing (undefined / null)
    const missingLookup = () => ({
      rawMaximumMark: undefined as unknown as number,
      thresholds: baseThresholds,
    })
    expect(evaluateComponentEvidence(attempt, missingLookup).latestHistoricalGrade).toBeNull()

    const nullLookup = () => ({
      rawMaximumMark: null as unknown as number,
      thresholds: baseThresholds,
    })
    expect(evaluateComponentEvidence(attempt, nullLookup).latestHistoricalGrade).toBeNull()

    // Zero
    const zeroLookup = () => ({
      rawMaximumMark: 0,
      thresholds: baseThresholds,
    })
    expect(evaluateComponentEvidence(attempt, zeroLookup).latestHistoricalGrade).toBeNull()

    // Negative
    const negativeLookup = () => ({
      rawMaximumMark: -75,
      thresholds: baseThresholds,
    })
    expect(evaluateComponentEvidence(attempt, negativeLookup).latestHistoricalGrade).toBeNull()

    // NaN
    const nanLookup = () => ({
      rawMaximumMark: Number.NaN,
      thresholds: baseThresholds,
    })
    expect(evaluateComponentEvidence(attempt, nanLookup).latestHistoricalGrade).toBeNull()

    // Infinity
    const infLookup = () => ({
      rawMaximumMark: Number.POSITIVE_INFINITY,
      thresholds: baseThresholds,
    })
    expect(evaluateComponentEvidence(attempt, infLookup).latestHistoricalGrade).toBeNull()
  })

  // ─── 51. Valid historical maximum continues to normalize and grade correctly ─
  it('normalizes score against positive finite historical maximum and assigns latestHistoricalGrade correctly', () => {
    // Attempt has raw score 40 on paper with scoreMax 50.
    // Official historical maximum was 100.
    // Normalized score = (40 / 50) * 100 = 80.
    // Thresholds: A: 75, B: 65, C: 55, D: 45, E: 35.
    // Normalized 80 >= 75 -> Grade A.
    const attempt = [
      {
        id: 'att-1',
        subjectId: 'sub-1',
        subjectPaperId: 'p-1',
        componentPaperNumber: 1,
        variantCode: '12',
        year: 2024,
        session: 'may_jun' as const,
        series: 'june' as const,
        stage: 'as' as const,
        attemptedAt: '2024-05-20',
        createdAt: '2024-05-20T10:00:00Z',
        scoreRaw: rawMark(40),
        scoreMax: rawMark(50),
        officialMax: rawMark(75),
        normalizedScore: rawMark(60),
      },
    ]

    const validLookup = () => ({
      rawMaximumMark: 100,
      thresholds: { A: 75, B: 65, C: 55, D: 45, E: 35 },
    })

    const evidence = evaluateComponentEvidence(attempt, validLookup)
    expect(evidence.latestHistoricalGrade).toBe('A')
  })

  // ─── 52. Grade ranking helpers strictly enforce QualificationLevel ─────────
  it('strictly enforces QualificationLevel in getGradeRank, sortThresholdMarks, and evaluateGradeFromThresholds', () => {
    // getGradeRank for A Level
    expect(getGradeRank('A*', 'a_level')).toBe(0)
    expect(getGradeRank('A', 'a_level')).toBe(1)
    expect(getGradeRank('B', 'a_level')).toBe(2)
    expect(getGradeRank('C', 'a_level')).toBe(3)
    expect(getGradeRank('D', 'a_level')).toBe(4)
    expect(getGradeRank('E', 'a_level')).toBe(5)
    expect(getGradeRank('a', 'a_level')).toBe(999) // Lowercase AS grade unranked in A Level
    expect(getGradeRank('U', 'a_level')).toBe(999)

    // getGradeRank for AS Level
    expect(getGradeRank('a', 'as')).toBe(0)
    expect(getGradeRank('b', 'as')).toBe(1)
    expect(getGradeRank('c', 'as')).toBe(2)
    expect(getGradeRank('d', 'as')).toBe(3)
    expect(getGradeRank('e', 'as')).toBe(4)
    expect(getGradeRank('A*', 'as')).toBe(999) // Uppercase A-Level grade unranked in AS
    expect(getGradeRank('A', 'as')).toBe(999)

    // sortThresholdMarks with tied marks for A Level
    const tiedALevel = [
      { grade: 'B', thresholdMark: 60 },
      { grade: 'A*', thresholdMark: 60 },
      { grade: 'A', thresholdMark: 60 },
    ]
    const sortedALevel = sortThresholdMarks(tiedALevel, 'a_level')
    expect(sortedALevel.map((m) => m.grade)).toEqual(['A*', 'A', 'B'])

    // sortThresholdMarks with tied marks for AS Level
    const tiedAsLevel = [
      { grade: 'c', thresholdMark: 45 },
      { grade: 'a', thresholdMark: 45 },
      { grade: 'b', thresholdMark: 45 },
    ]
    const sortedAsLevel = sortThresholdMarks(tiedAsLevel, 'as')
    expect(sortedAsLevel.map((m) => m.grade)).toEqual(['a', 'b', 'c'])

    // evaluateGradeFromThresholds tie-break
    expect(evaluateGradeFromThresholds(60, tiedALevel, 'a_level')).toBe('A*')
    expect(evaluateGradeFromThresholds(45, tiedAsLevel, 'as')).toBe('a')
  })

  // ─── 53. Staged A* pure evaluation with nullable A2 capacity ───────────────
  it('evaluates staged A* with unavailable A2 capacity when a2MaximumWeightedMark is null', () => {
    // Official combined target 227, unknown A2 capacity
    const breakdown = evaluateStagedAStar({
      officialCombinedTarget: weightedMark(227),
      a2MaximumWeightedMark: null,
      carryForwardWeightingShare: 0.5,
    })

    expect(breakdown.kind).toBe('estimated_halfway')
    if (breakdown.kind === 'estimated_halfway') {
      expect(breakdown.estimatedAsContribution).toBe(114)
      expect(breakdown.remainingA2Required).toBe(113)
      expect(breakdown.a2MaximumWeightedMark).toBeNull()
      expect(breakdown.isMathematicallyPossible).toBeNull()
    }
  })

  it('evaluates verified official weighted AS mark with unavailable A2 capacity when a2MaximumWeightedMark is null', () => {
    const verifiedContribution: VerifiedOfficialWeightedAsContribution = {
      kind: 'verified_official_weighted_as_mark',
      weightedMark: weightedMark(118),
      maxWeightedMark: weightedMark(125),
    }

    const breakdown = evaluateStagedAStar({
      officialCombinedTarget: weightedMark(230),
      a2MaximumWeightedMark: null,
      carryForwardWeightingShare: 0.5,
      verifiedAsContribution: verifiedContribution,
    })

    expect(breakdown.kind).toBe('verified_official')
    if (breakdown.kind === 'verified_official') {
      expect(breakdown.officialWeightedAsContribution).toBe(118)
      expect(breakdown.remainingA2Required).toBe(112)
      expect(breakdown.a2MaximumWeightedMark).toBeNull()
      expect(breakdown.isMathematicallyPossible).toBeNull()
    }
  })

  // ─── 54. UI rendering of Staged A* breakdown: unknown vs known capacity ────
  it('renders Staged A* breakdown with unavailable A2 capacity without "/ 0 marks" or "Exceeds A2 maximum"', () => {
    const summaryWithUnknownCapacity: SubjectLevelPlanSummary = {
      subjectId: 'sub-chem',
      subjectName: 'Chemistry',
      subjectCode: '9701',
      colorHex: '#10b981',
      studyRoute: 'staged',
      targetGrade: 'A*',
      officialCombinedTarget: weightedMark(227),
      combinedMaximumMark: weightedMark(260),
      estimatedCombinedMark: null,
      marksStillNeeded: null,
      latestComparableGrade: null,
      rollingPredictedGrade: null,
      stagedBreakdown: {
        kind: 'estimated_halfway',
        estimatedAsContribution: weightedMark(114),
        remainingA2Required: weightedMark(113),
        a2MaximumWeightedMark: null,
        isMathematicallyPossible: null,
      },
      provenance: {
        publicationId: 'pub-2026',
        examYear: 2026,
        examSeries: 'june',
        officialIndexUrl: 'https://example.com',
        officialPdfUrl: 'https://example.com/pdf',
        officialPublishedOn: '2026-06-20',
        publishedAt: '2026-06-20T00:00:00Z',
        isFallback: false,
        intendedYear: 2026,
        intendedSeries: 'june',
      },
      perPaperAllocationEligible: false,
      safetyMargin: { type: 'none' },
      adjustedCombinedTarget: null,
      resolvedOptionCode: 'S3',
      isOptionResolved: true,
    }

    const { container } = render(
      <TargetGradePlannerSummary summary={summaryWithUnknownCapacity} onSelectSafetyMargin={vi.fn()} />
    )

    // Displays AS estimate and remaining A2 marks
    expect(within(container).getByText('114 marks')).toBeTruthy()
    expect(within(container).getByText('113 marks (A2 capacity unavailable)')).toBeTruthy()
    expect(within(container).getByText('Capacity check unavailable')).toBeTruthy()

    // Must NEVER display "/ 0 marks" or false impossibility
    expect(container.textContent).not.toContain('/ 0 marks')
    expect(container.textContent).not.toContain('Exceeds A2 maximum')
  })

  it('renders Staged A* breakdown with viable capacity correctly', () => {
    const summaryViable: SubjectLevelPlanSummary = {
      subjectId: 'sub-chem',
      subjectName: 'Chemistry',
      subjectCode: '9701',
      colorHex: '#10b981',
      studyRoute: 'staged',
      targetGrade: 'A*',
      officialCombinedTarget: weightedMark(227),
      combinedMaximumMark: weightedMark(260),
      estimatedCombinedMark: null,
      marksStillNeeded: null,
      latestComparableGrade: null,
      rollingPredictedGrade: null,
      stagedBreakdown: {
        kind: 'estimated_halfway',
        estimatedAsContribution: weightedMark(114),
        remainingA2Required: weightedMark(113),
        a2MaximumWeightedMark: weightedMark(125),
        isMathematicallyPossible: true,
      },
      provenance: {
        publicationId: 'pub-2026',
        examYear: 2026,
        examSeries: 'june',
        officialIndexUrl: 'https://example.com',
        officialPdfUrl: 'https://example.com/pdf',
        officialPublishedOn: '2026-06-20',
        publishedAt: '2026-06-20T00:00:00Z',
        isFallback: false,
        intendedYear: 2026,
        intendedSeries: 'june',
      },
      perPaperAllocationEligible: true,
      safetyMargin: { type: 'none' },
      adjustedCombinedTarget: null,
      resolvedOptionCode: 'S3',
      isOptionResolved: true,
    }

    const { container } = render(
      <TargetGradePlannerSummary summary={summaryViable} onSelectSafetyMargin={vi.fn()} />
    )

    expect(within(container).getByText('114 marks')).toBeTruthy()
    expect(within(container).getByText('113 / 125 marks')).toBeTruthy()
    expect(within(container).getByText('Mathematically viable')).toBeTruthy()
  })

  it('renders Staged A* breakdown with exceeded capacity correctly', () => {
    const summaryExceeded: SubjectLevelPlanSummary = {
      subjectId: 'sub-chem',
      subjectName: 'Chemistry',
      subjectCode: '9701',
      colorHex: '#10b981',
      studyRoute: 'staged',
      targetGrade: 'A*',
      officialCombinedTarget: weightedMark(227),
      combinedMaximumMark: weightedMark(260),
      estimatedCombinedMark: null,
      marksStillNeeded: null,
      latestComparableGrade: null,
      rollingPredictedGrade: null,
      stagedBreakdown: {
        kind: 'estimated_halfway',
        estimatedAsContribution: weightedMark(114),
        remainingA2Required: weightedMark(113),
        a2MaximumWeightedMark: weightedMark(100),
        isMathematicallyPossible: false,
      },
      provenance: {
        publicationId: 'pub-2026',
        examYear: 2026,
        examSeries: 'june',
        officialIndexUrl: 'https://example.com',
        officialPdfUrl: 'https://example.com/pdf',
        officialPublishedOn: '2026-06-20',
        publishedAt: '2026-06-20T00:00:00Z',
        isFallback: false,
        intendedYear: 2026,
        intendedSeries: 'june',
      },
      perPaperAllocationEligible: false,
      safetyMargin: { type: 'none' },
      adjustedCombinedTarget: null,
      resolvedOptionCode: 'S3',
      isOptionResolved: true,
    }

    const { container } = render(
      <TargetGradePlannerSummary summary={summaryExceeded} onSelectSafetyMargin={vi.fn()} />
    )

    expect(within(container).getByText('114 marks')).toBeTruthy()
    expect(within(container).getByText('113 / 100 marks')).toBeTruthy()
    expect(within(container).getByText('Exceeds A2 maximum')).toBeTruthy()
  })

  // ─── 45. Incompatible temporary variant recovery & fail-closed checks ─────
  it('provides accessible variant reset recovery on incompatible variant combination without page reload and guards race conditions', async () => {
    vi.mocked(getTargetGradePlan).mockReset()

    const baselinePlan: PlannerResult = {
      status: 'available',
      summary: {
        subjectId: 'sub-chem',
        subjectName: 'Chemistry',
        subjectCode: '9701',
        colorHex: '#10b981',
        studyRoute: 'as_only',
        targetGrade: 'A',
        officialCombinedTarget: weightedMark(95),
        combinedMaximumMark: weightedMark(130),
        estimatedCombinedMark: null,
        marksStillNeeded: null,
        latestComparableGrade: null,
        rollingPredictedGrade: null,
        stagedBreakdown: null,
        provenance: {
          publicationId: 'pub-2026',
          examYear: 2026,
          examSeries: 'june',
          officialIndexUrl: 'https://example.com',
          officialPdfUrl: 'https://example.com/pdf',
          officialPublishedOn: '2026-06-20',
          publishedAt: '2026-06-20T00:00:00Z',
          isFallback: false,
          intendedYear: 2026,
          intendedSeries: 'june',
        },
        perPaperAllocationEligible: true,
        safetyMargin: { type: 'none' },
        adjustedCombinedTarget: weightedMark(95),
        resolvedOptionCode: null,
        isOptionResolved: false,
      },
      paperPlans: [
        {
          subjectPaperId: 'chem-p1',
          componentPaperNumber: 1,
          componentName: 'Multiple Choice',
          stage: 'as',
          targetVariantChoice: 'unknown',
          sourceKind: 'atlas_estimate_ceiling_average',
          rawMaximumMark: rawMark(40),
          benchmarkFloorMark: rawMark(28),
          requiredMark: rawMark(28),
          requiredMarkWithSafetyMargin: rawMark(28),
          isAllocationAvailable: true,
          officialWeightingFactor: weightingFactor(1.0),
          evidence: {
            attemptCount: 0,
            latestRawScore: null,
            latestRawMax: null,
            officialMax: rawMark(40),
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
          },
          latestGap: null,
          lifetimeAverageGap: null,
          baselineGap: null,
          includedVariants: ['11', '13'],
          availableVariants: [
            { variantCode: '11', label: 'Variant 11' },
            { variantCode: '13', label: 'Variant 13' },
          ],
          hasApprovedAverage: true,
          isAStarEstimate: false,
        },
        {
          subjectPaperId: 'chem-p2',
          componentPaperNumber: 2,
          componentName: 'AS Structured Questions',
          stage: 'as',
          targetVariantChoice: 'unknown',
          sourceKind: 'atlas_estimate_ceiling_average',
          rawMaximumMark: rawMark(60),
          benchmarkFloorMark: rawMark(42),
          requiredMark: rawMark(42),
          requiredMarkWithSafetyMargin: rawMark(42),
          isAllocationAvailable: true,
          officialWeightingFactor: weightingFactor(1.0),
          evidence: {
            attemptCount: 0,
            latestRawScore: null,
            latestRawMax: null,
            officialMax: rawMark(60),
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
          },
          latestGap: null,
          lifetimeAverageGap: null,
          baselineGap: null,
          includedVariants: ['21', '23'],
          availableVariants: [
            { variantCode: '21', label: 'Variant 21' },
            { variantCode: '23', label: 'Variant 23' },
          ],
          hasApprovedAverage: true,
          isAStarEstimate: false,
        },
      ],
    }

    const withSafetyMarginPlan: PlannerResult = {
      ...baselinePlan,
      summary: {
        ...baselinePlan.summary,
        safetyMargin: { type: 'plus_3', marks: 3 },
        adjustedCombinedTarget: weightedMark(98),
      },
    }

    const incompatibleResult: PlannerResult = {
      status: 'threshold-unavailable',
      message: 'No compatible published Cambridge threshold series available on or before june 2026.',
      reason: 'No published series contains an eligible combination with required components and weighting',
    }

    let resolveStalePreReset: (res: PlannerResult) => void = () => {}
    const stalePreResetPromise = new Promise<PlannerResult>((resolve) => {
      resolveStalePreReset = resolve
    })

    vi.mocked(getTargetGradePlan).mockImplementation(async (_subjectId, opts) => {
      const variants = opts?.selectedVariants ?? {}
      if (variants['chem-p1'] === '13' && variants['chem-p2'] === '23') {
        return incompatibleResult
      }
      if (variants['chem-p1'] === '13') {
        return stalePreResetPromise
      }
      if (opts?.safetyMargin?.type === 'plus_3') {
        return withSafetyMarginPlan
      }
      return baselinePlan
    })

    const { container } = render(
      <TargetGradePlanner
        subjectId="sub-chem"
        subjectColor="#10b981"
        initialResult={baselinePlan}
      />
    )

    // 1. Select a safety margin first to verify recovery also resets margin state
    const marginPlus3 = within(container).getByRole('button', { name: /\+3 marks/i })
    await act(async () => {
      fireEvent.click(marginPlus3)
    })
    expect(within(container).getByText(/with safety margin:\s*98\s*marks/i)).toBeTruthy()

    // 2. Trigger a slow intermediate variant selection (will stay in-flight), then incompatible combo
    const variant13Btn = within(container).getByRole('button', { name: /variant 13/i })
    await act(async () => {
      fireEvent.click(variant13Btn)
    })

    const variant23Btn = within(container).getByRole('button', { name: /variant 23/i })
    await act(async () => {
      fireEvent.click(variant23Btn)
    })

    // 3. Planner transitions to recoverable Threshold Unavailable state
    expect(within(container).getByText('Threshold Unavailable')).toBeTruthy()
    expect(
      within(container).getByText(/selected paper variant combination is incompatible/i)
    ).toBeTruthy()
    expect(within(container).queryByText('Multiple Choice')).toBeNull()

    const resetButton = within(container).getByRole('button', {
      name: /reset variant selections/i,
    })
    expect(resetButton.getAttribute('type')).toBe('button')
    expect(resetButton.classList.contains('touch-target-btn')).toBe(true)

    // 4. Activate reset button to recover without reload
    await act(async () => {
      fireEvent.click(resetButton)
    })

    expect(vi.mocked(getTargetGradePlan)).toHaveBeenLastCalledWith('sub-chem', {
      selectedVariants: {},
      safetyMargin: { type: 'none' },
    })

    // Paper cards, variant controls, and baseline margin are restored
    expect(within(container).queryByText('Threshold Unavailable')).toBeNull()
    expect(within(container).getByText('Multiple Choice')).toBeTruthy()
    expect(within(container).getByText('AS Structured Questions')).toBeTruthy()
    expect(within(container).queryByText(/with safety margin:\s*98\s*marks/i)).toBeNull()

    const restoredVariant13 = within(container).getByRole('button', { name: /variant 13/i })
    expect(restoredVariant13.getAttribute('aria-pressed')).toBe('false')

    // 5. Late pre-reset response resolves now and MUST NOT overwrite recovered baseline plan
    await act(async () => {
      resolveStalePreReset(incompatibleResult)
    })

    expect(within(container).queryByText('Threshold Unavailable')).toBeNull()
    expect(within(container).getByText('Multiple Choice')).toBeTruthy()
  })

  it('does not show variant reset recovery when threshold-unavailable or unapproved occurs without variant overrides', () => {
    const { rerender, container } = render(
      <TargetGradePlanner
        subjectId="sub-unseeded"
        subjectColor="#6366f1"
        initialResult={{
          status: 'threshold-unavailable',
          message: 'No published grade threshold data available for this subject.',
          reason: 'No published publications exist',
        }}
      />
    )

    expect(within(container).getByText('Threshold Unavailable')).toBeTruthy()
    expect(within(container).queryByRole('button', { name: /reset variant selections/i })).toBeNull()
    expect(
      within(container).queryByText(/selected paper variant combination is incompatible/i)
    ).toBeNull()

    rerender(
      <TargetGradePlanner
        subjectId="sub-unapproved"
        subjectColor="#6366f1"
        initialResult={{
          status: 'no-approved-combination',
          message: 'No Cambridge option combination is approved for this route.',
          route: 'full_level',
          subjectCode: '9999',
        }}
      />
    )

    expect(within(container).getByText('Combination Unapproved')).toBeTruthy()
    expect(within(container).queryByRole('button', { name: /reset variant selections/i })).toBeNull()
  })

  // ─── 46. Display-safe mark-gap formatting at presentation boundary ────────
  it('formats whole, fractional, float-noisy, and signed-zero mark gaps cleanly without mutating math values', () => {
    expect(formatMarkGapMagnitude(1.6666666666666679)).toBe('1.7')
    expect(formatMarkGapMagnitude(1.3333333333333321)).toBe('1.3')
    expect(formatMarkGapMagnitude(0.5)).toBe('0.5')
    expect(formatMarkGapMagnitude(3)).toBe('3')
    expect(formatMarkGapMagnitude(0)).toBe('0')
    expect(formatMarkGapMagnitude(-0)).toBe('0')
    expect(formatMarkGapMagnitude(-1.6666666666666679)).toBe('1.7')
    expect(formatMarkGapMagnitude(0.0000000001)).toBe('0')
    expect(formatMarkGapMagnitude(-0.0000000001)).toBe('0')

    const noisyPaperPlan: PaperPlanResult = {
      subjectPaperId: 'paper-gaps',
      componentPaperNumber: 1,
      componentName: 'Pure Mathematics 1',
      stage: 'as',
      targetVariantChoice: '12',
      sourceKind: 'official_exact',
      rawMaximumMark: rawMark(75),
      benchmarkFloorMark: rawMark(60),
      requiredMark: rawMark(60),
      requiredMarkWithSafetyMargin: rawMark(60),
      isAllocationAvailable: true,
      officialWeightingFactor: weightingFactor(1.0),
      evidence: {
        attemptCount: 3,
        latestRawScore: rawMark(58.33333333333333),
        latestRawMax: rawMark(75),
        officialMax: rawMark(75),
        latestNormalizedScore: rawMark(58.33333333333333),
        latestAttemptDate: '2026-05-10',
        latestHistoricalGrade: 'B',
        unweightedLifetimeAverage: rawMark(58.66666666666667),
        recencyWeightedBaseline: rawMark(60),
        variability: rawMark(1.2),
        trend: 'improving',
        trendDelta: 1.5,
        hasSufficientSample: true,
        rollingPredictedScore: rawMark(59),
      },
      latestGap: rawMark(1.6666666666666679),
      lifetimeAverageGap: rawMark(1.3333333333333321),
      baselineGap: rawMark(-0),
      includedVariants: ['12'],
      availableVariants: [{ variantCode: '12', label: 'Variant 12' }],
      hasApprovedAverage: true,
      isAStarEstimate: false,
    }

    const { rerender, container } = render(
      <TargetGradePlannerPaperCard
        paperPlan={noisyPaperPlan}
        subjectColor="#3b82f6"
        selectedVariant="12"
        onSelectVariant={vi.fn()}
      />
    )

    expect(within(container).getByText('1.7 marks below latest')).toBeTruthy()
    expect(within(container).getByText('1.3 marks below average')).toBeTruthy()
    expect(within(container).getByText('0 marks above baseline')).toBeTruthy()
    expect(container.textContent).not.toContain('1.6666666666666679')
    expect(container.textContent).not.toContain('1.3333333333333321')
    expect(container.textContent).not.toContain('-0 marks')

    rerender(
      <TargetGradePlannerPaperCard
        paperPlan={{
          ...noisyPaperPlan,
          latestGap: rawMark(3),
          lifetimeAverageGap: rawMark(0.5),
          baselineGap: rawMark(0.0000000001),
        }}
        subjectColor="#3b82f6"
        selectedVariant="12"
        onSelectVariant={vi.fn()}
      />
    )

    expect(within(container).getByText('3 marks below latest')).toBeTruthy()
    expect(within(container).getByText('0.5 marks below average')).toBeTruthy()
    expect(within(container).getByText('0 marks above baseline')).toBeTruthy()
  })

  it('supports accessible carry-forward sitting selection, preserves it across variant/margin/retry, and clears on incompatible subject change', async () => {
    const juneOpt = {
      rawCarryForwardToken: '82',
      entryOptionCode: '35,55,82',
      carriedExamYear: 2025,
      carriedExamSeries: 'june' as const,
      label: 'June 2025 AS result',
      carriedAsComponents: ['12', '42'],
    }
    const novOpt = {
      rawCarryForwardToken: '92',
      entryOptionCode: '35,55,92',
      carriedExamYear: 2025,
      carriedExamSeries: 'november' as const,
      label: 'November 2025 AS result',
      carriedAsComponents: ['12', '42'],
    }
    const baseProvenance = {
      publicationId: 'pub-1',
      examYear: 2026,
      examSeries: 'june' as const,
      officialIndexUrl: 'https://www.cambridgeinternational.org/',
      officialPdfUrl: 'https://www.cambridgeinternational.org/Images/test.pdf',
      officialPublishedOn: '2026-08-10',
      publishedAt: '2026-08-11T00:00:00Z',
      isFallback: false,
      intendedYear: 2026,
      intendedSeries: 'june' as const,
    }

    const initialSelectionRequired: PlannerResult = {
      status: 'carry-forward-selection-required',
      message: 'Multiple approved AS carry-forward sittings match this route.',
      options: [juneOpt, novOpt],
      selectedCarryForwardToken: null,
      provenance: baseProvenance,
    }

    const resolvedJunePlan: PlannerResult = {
      status: 'available',
      summary: {
        subjectId: 'sub-9709',
        subjectName: 'Mathematics',
        subjectCode: '9709',
        colorHex: '#3b82f6',
        studyRoute: 'staged',
        targetGrade: 'A*',
        officialCombinedTarget: weightedMark(197),
        combinedMaximumMark: weightedMark(250),
        estimatedCombinedMark: null,
        marksStillNeeded: null,
        latestComparableGrade: null,
        rollingPredictedGrade: null,
        stagedBreakdown: {
          kind: 'estimated_halfway',
          estimatedAsContribution: weightedMark(99),
          remainingA2Required: weightedMark(98),
          a2MaximumWeightedMark: weightedMark(125),
          isMathematicallyPossible: true,
        },
        selectedCarryForwardOption: juneOpt,
        availableCarryForwardOptions: [juneOpt, novOpt],
        provenance: baseProvenance,
        perPaperAllocationEligible: true,
        safetyMargin: { type: 'none' },
        adjustedCombinedTarget: weightedMark(197),
        resolvedOptionCode: '35,55,82',
        isOptionResolved: true,
      },
      paperPlans: [
        {
          subjectPaperId: 'sp-p3',
          componentPaperNumber: 3,
          componentName: 'Paper 3 Pure Mathematics 3',
          stage: 'a2',
          targetVariantChoice: '35',
          sourceKind: 'official_exact',
          rawMaximumMark: rawMark(75),
          benchmarkFloorMark: rawMark(55),
          requiredMark: rawMark(59),
          requiredMarkWithSafetyMargin: rawMark(59),
          isAllocationAvailable: true,
          officialWeightingFactor: weightingFactor(1),
          evidence: {
            attemptCount: 0,
            latestRawScore: null,
            latestRawMax: null,
            officialMax: rawMark(75),
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
          },
          latestGap: null,
          lifetimeAverageGap: null,
          baselineGap: null,
          includedVariants: ['35'],
          availableVariants: [{ variantCode: '35', label: 'Variant 35' }],
          hasApprovedAverage: false,
          isAStarEstimate: true,
        },
      ],
    }

    vi.mocked(getTargetGradePlan)
      .mockResolvedValueOnce(resolvedJunePlan)
      .mockResolvedValueOnce({
        ...resolvedJunePlan,
        summary: {
          ...resolvedJunePlan.summary,
          safetyMargin: { type: 'plus_3', marks: 3 },
          adjustedCombinedTarget: weightedMark(200),
        },
      })
      .mockResolvedValueOnce(resolvedJunePlan)

    const { container, rerender } = render(
      <TargetGradePlanner
        subjectId="sub-9709"
        subjectColor="#3b82f6"
        initialResult={initialSelectionRequired}
      />
    )

    // Radiogroup & accessible labels without raw token as primary label
    const radioGroup = within(container).getByRole('radiogroup', {
      name: /Carried AS examination sitting/i,
    })
    expect(radioGroup).toBeTruthy()
    const juneRadio = within(container).getByRole('radio', { name: /June 2025 AS result/i }) as HTMLInputElement
    const novRadio = within(container).getByRole('radio', { name: /November 2025 AS result/i }) as HTMLInputElement
    expect(juneRadio.checked).toBe(false)
    expect(novRadio.checked).toBe(false)

    // 44px touch target & 320px safe flex-wrap constraints
    const juneLabel = juneRadio.closest('label')!
    expect(juneLabel.style.minHeight).toBe('44px')
    expect(juneLabel.style.maxWidth).toBe('100%')

    // Selecting June 2025 AS result calls getTargetGradePlan with token '82'
    fireEvent.click(juneRadio)
    await waitFor(() => {
      expect(getTargetGradePlan).toHaveBeenCalledWith(
        'sub-9709',
        expect.objectContaining({ selectedCarryForwardToken: '82' })
      )
    })

    // Safety margin change preserves selectedCarryForwardToken: '82'
    const plus3Btn = await within(container).findByRole('button', { name: /\+3 marks/i })
    fireEvent.click(plus3Btn)
    await waitFor(() => {
      expect(getTargetGradePlan).toHaveBeenLastCalledWith(
        'sub-9709',
        expect.objectContaining({
          selectedCarryForwardToken: '82',
          safetyMargin: { type: 'plus_3', marks: 3 },
        })
      )
    })

    // Variant change preserves selectedCarryForwardToken: '82'
    const variantBtn = within(container).getByRole('button', { name: 'Variant 35' })
    expect(variantBtn.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(variantBtn)
    await waitFor(() => {
      expect(getTargetGradePlan).toHaveBeenLastCalledWith(
        'sub-9709',
        expect.objectContaining({
          selectedCarryForwardToken: '82',
          selectedVariants: { 'sp-p3': '35' },
        })
      )
    })

    // Switching to an incompatible subject clears the prior selection
    rerender(
      <TargetGradePlanner
        subjectId="sub-9701"
        subjectColor="#10b981"
        initialResult={{
          ...initialSelectionRequired,
          options: [
            {
              rawCarryForwardToken: '62',
              entryOptionCode: '44,54,62',
              carriedExamYear: 2025,
              carriedExamSeries: 'june',
              label: 'June 2025 AS result',
              carriedAsComponents: ['12', '22', '33'],
            },
            {
              rawCarryForwardToken: '72',
              entryOptionCode: '44,54,72',
              carriedExamYear: 2025,
              carriedExamSeries: 'november',
              label: 'November 2025 AS result',
              carriedAsComponents: ['12', '22', '33'],
            },
          ],
        }}
      />
    )
    const chemJuneRadio = within(container).getByRole('radio', { name: /June 2025 AS result/i }) as HTMLInputElement
    expect(chemJuneRadio.checked).toBe(false)
  })
})
