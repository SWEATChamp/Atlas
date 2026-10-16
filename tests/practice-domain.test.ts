import { describe, expect, it } from 'vitest'
import { PracticeCreateSchema, PracticeUpdateSchema, dateWithinUserToday } from '@/lib/validations/practice-sessions'
import { toCreateRpcArgs, toUpdateRpcArgs } from '@/lib/practice-payload'
import {
  attemptTrend, bestFullPaper, combinedChapterEvidence, comparableComponentAnalytics, comparableFullPapers, fullPaperCount,
  eligiblePracticeChapterIds, eligiblePracticeLoggingChapterIds, latestFullPaper, markWeightedPaperAverage, officialThresholdPaperInputs, predictionPaperInputs,
  rankComponentEvidence, summarizeEvidence, withPracticeEligibility,
} from '@/lib/practice-analytics'
import type { PaperEvidence } from '@/lib/practice-analytics'
import type { PracticeRouteContext, PracticeSessionRead } from '@/types/practice-sessions'

const uid = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`
const subjectId = uid(1)
const paperId = uid(2)
const otherPaperId = uid(3)
const chapterId = uid(4)
const otherChapterId = uid(5)
const userId = uid(6)
const base = { subjectId, stage: 'as' as const, sessionDate: '2026-10-13', items: [{ itemOrder: 1, marksObtained: 4, marksAvailable: 5, provenanceMode: 'none' as const, chapterIds: [chapterId] }] }

const context: PracticeRouteContext = {
  enrollment: { id: uid(7), subjectId, subjectCode: '9709', studyRoute: 'staged', currentStage: 'as', isArchived: false },
  selections: [{ subjectPaperId: paperId, componentName: 'Pure 1', stage: 'as' }],
  chapters: [
    { id: chapterId, subjectId, stage: 'as', component: 'Pure 1', isActive: true, paperIds: [paperId] },
    { id: otherChapterId, subjectId, stage: 'route_dependent', component: 'Pure 1', isActive: true, paperIds: [paperId] },
  ],
  papers: [{ id: paperId, subjectId, paperNumber: 1 }, { id: otherPaperId, subjectId, paperNumber: 2 }],
}

function session(items: { id: string; marks_obtained: number; marks_available: number; subject_paper_id: string | null; chapter_ids: string[] }[]): PracticeSessionRead {
  return {
    id: uid(9), user_id: userId, subject_id: subjectId, stage: 'as', session_date: '2026-10-13', title: null,
    duration_mins: null, notes: null, total_score_raw: items.reduce((sum, item) => sum + item.marks_obtained, 0),
    total_score_max: items.reduce((sum, item) => sum + item.marks_available, 0), accuracy_pct: 50,
    subject_paper_id: null, paper_number: null, exam_year: null, exam_series: null, exam_variant: null,
    source_label: null, created_at: '2026-10-13T12:00:00Z', updated_at: '2026-10-13T12:00:00Z',
    items: items.map((item, index) => ({
      ...item, session_id: uid(9), item_order: index + 1, question_label: null, provenance_mode: 'none',
      paper_number: null, exam_year: null, exam_series: null, exam_variant: null, source_label: null,
      notes: null, created_at: '2026-10-13T12:00:00Z', eligible_for_readiness: false,
      eligibility_reason: 'inactive_route_or_stage' as const,
    })), eligible_score_raw: 0, eligible_score_max: 0, eligible_for_readiness: false, route_status: 'historical',
  }
}

const papers: PaperEvidence[] = [
  { id: uid(20), subject_id: subjectId, stage: 'as', attempted_at: '2026-10-13', created_at: '2026-10-13T10:00:00Z', subject_paper_id: paperId, paper_number: 12, score_raw: 40, score_max: 50, accuracy_pct: 80 },
  { id: uid(21), subject_id: subjectId, stage: 'as', attempted_at: '2026-10-13', created_at: '2026-10-13T11:00:00Z', subject_paper_id: paperId, paper_number: 13, score_raw: 50, score_max: 100, accuracy_pct: 50 },
  { id: uid(22), subject_id: subjectId, stage: 'a2', attempted_at: '2026-10-12', created_at: '2026-10-12T11:00:00Z', subject_paper_id: otherPaperId, paper_number: 22, score_raw: 90, score_max: 100, accuracy_pct: 90 },
]

describe('component comparison minimum evidence and ties', () => {
  const component = (label: string, markWeightedAccuracyPct: number | null, count = 2) => ({ label, count, markWeightedAccuracyPct })

  it('leaves equal scores neutral regardless of component name or display order', () => {
    const rows = [component('Zoology', 60), component('Algebra', 60)]
    expect(rankComponentEvidence(rows).map(row => row.ranking)).toEqual(['tied', 'tied'])
    expect(rankComponentEvidence([...rows].reverse()).map(row => row.ranking)).toEqual(['tied', 'tied'])
  })

  it('does not rank zero or invalid evidence, even alongside qualifying components', () => {
    const rows = [component('No attempts', null, 0), component('Missing score', null),
      component('NaN', Number.NaN), component('Infinite', Infinity), component('Negative', -1), component('Over maximum', 101),
      component('Invalid count', 10, 2.5), component('Weak', 40), component('Strong', 80)]
    expect(rankComponentEvidence(rows).map(row => row.ranking)).toEqual([null, null, null, null, null, null, null, 'weakest', 'strongest'])
  })

  it('requires two attempts per component and does not let a single attempt affect extrema', () => {
    expect(rankComponentEvidence([component('One low attempt', 10, 1), component('Weak', 40), component('Strong', 80), component('One high attempt', 100, 1)])
      .map(row => row.ranking)).toEqual([null, 'weakest', 'strongest', null])
  })

  it('leaves all components unranked when fewer than two qualify', () => {
    expect(rankComponentEvidence([])).toEqual([])
    expect(rankComponentEvidence([component('Only component', 60)]).map(row => row.ranking)).toEqual([null])
    expect(rankComponentEvidence([component('Qualifies', 60), component('One attempt', 90, 1), component('Empty', null, 0)])
      .map(row => row.ranking)).toEqual([null, null, null])
  })

  it('ranks genuinely distinct valid scores without using their display positions', () => {
    expect(rankComponentEvidence([component('Strong', 90), component('Weak', 30), component('Middle', 60)])
      .map(row => row.ranking)).toEqual(['strongest', 'weakest', null])
  })

  it('keeps a tied extremum neutral while allowing the other unique extremum', () => {
    expect(rankComponentEvidence([component('A', 40), component('B', 40), component('C', 80)])
      .map(row => row.ranking)).toEqual(['tied', 'tied', 'strongest'])
    expect(rankComponentEvidence([component('A', 40), component('B', 80), component('C', 80)])
      .map(row => row.ranking)).toEqual(['weakest', 'tied', 'tied'])
  })

  it('retains measured zero percent as valid evidence rather than confusing it with no attempts', () => {
    expect(rankComponentEvidence([component('Measured zero', 0), component('Measured full marks', 100)])
      .map(row => row.ranking)).toEqual(['weakest', 'strongest'])
  })

  it('counts only valid comparable full-paper attempts toward eligibility', () => {
    const otherComponent = [1, 2].map(index => ({ ...papers[0], id: uid(60 + index), subject_paper_id: otherPaperId, paper_number: 22, score_raw: 45 }))
    const invalid = [{ score_raw: 0, score_max: 0 }, { score_raw: 40, score_max: Infinity },
      { score_raw: Number.NaN, score_max: 50 }, { score_raw: -1, score_max: 50 }, { score_raw: 51, score_max: 50 }]
      .map((marks, index) => ({ ...papers[1], id: uid(70 + index), ...marks }))
    const evidence = [papers[0], ...invalid, ...otherComponent]
    const rows = [papers[0], otherComponent[0]].map(reference => comparableComponentAnalytics(evidence, reference))
    expect(rows.map(row => row.count)).toEqual([1, 2])
    expect(rankComponentEvidence(rows).map(row => row.ranking)).toEqual([null, null])
  })
})

describe('practice validation and atomic RPC mapping', () => {
  it('accepts strict valid payloads and maps whole provenance bundles', () => {
    const input = { ...base, provenance: { subjectPaperId: paperId, examYear: 2025, examSeries: 'may_jun' as const }, items: [
      { itemOrder: 1, marksObtained: 4, marksAvailable: 5, provenanceMode: 'inherit' as const, chapterIds: [chapterId] },
      { itemOrder: 2, marksObtained: 2, marksAvailable: 5, provenanceMode: 'override' as const, provenance: { sourceLabel: 'Self-made' }, questionLabel: null, chapterIds: [chapterId, otherChapterId] },
      { itemOrder: 3, marksObtained: 1, marksAvailable: 2, provenanceMode: 'none' as const, provenance: { sourceLabel: 'Unattributed' }, chapterIds: [otherChapterId] },
    ] }
    const parsed = PracticeCreateSchema.parse(input)
    const args = toCreateRpcArgs(userId, parsed)
    expect(args.p_session_provenance).toEqual({ subject_paper_id: paperId, exam_year: 2025, exam_series: 'may_jun' })
    expect(args.p_items[0]).not.toHaveProperty('provenance')
    expect(args.p_items[1]).toHaveProperty('provenance', { source_label: 'Self-made' })
    expect(args.p_items[2]).toHaveProperty('provenance', { source_label: 'Unattributed' })
    expect(args.p_items[1].chapter_ids).toEqual([chapterId, otherChapterId])
    const updateFields = { sessionDate: input.sessionDate, provenance: input.provenance, items: input.items }
    expect(toUpdateRpcArgs(userId, PracticeUpdateSchema.parse({ ...updateFields, sessionId: uid(30) })).p_items).toEqual(args.p_items)
  })

  it('requires chapter selections on every new or replacement question without changing historical read eligibility', () => {
    const missingChapters = { itemOrder: 1, marksObtained: 4, marksAvailable: 5, provenanceMode: 'none' as const }
    for (const chapterIds of [undefined, []]) {
      const items = [{ ...missingChapters, ...(chapterIds === undefined ? {} : { chapterIds }) }]
      expect(PracticeCreateSchema.safeParse({ ...base, items }).success).toBe(false)
      expect(PracticeUpdateSchema.safeParse({ sessionId: uid(30), sessionDate: base.sessionDate, items }).success).toBe(false)
    }
    const secondUnmappedQuestion = PracticeCreateSchema.safeParse({ ...base, items: [base.items[0], { ...missingChapters, itemOrder: 2, chapterIds: [] }] })
    expect(secondUnmappedQuestion.success).toBe(false)
    if (!secondUnmappedQuestion.success) expect(secondUnmappedQuestion.error.issues[0].path).toEqual(['items', 1, 'chapterIds'])
    const historical = withPracticeEligibility(session([
      { id: uid(31), marks_obtained: 4, marks_available: 5, subject_paper_id: null, chapter_ids: [] },
    ]), context)
    expect(historical.eligible_score_raw).toBe(4)
    expect(historical.eligible_score_max).toBe(5)
  })

  for (const [candidate, label] of [
    [{ ...base, unknown: true }, 'unknown key'],
    [{ ...base, sessionDate: '2026-02-30' }, 'impossible date'],
    [{ ...base, sessionDate: '1989-12-31' }, 'before lower date'],
    [{ ...base, title: 'x'.repeat(101) }, 'long title'],
    [{ ...base, durationMins: 0 }, 'short duration'],
    [{ ...base, items: [{ ...base.items[0], itemOrder: 2 }] }, 'gap in order'],
    [{ ...base, items: [{ ...base.items[0], marksObtained: 6 }] }, 'over-scored item'],
    [{ ...base, items: [{ ...base.items[0], marksAvailable: 1001 }] }, 'overlarge item'],
    [{ ...base, items: [{ ...base.items[0], chapterIds: [chapterId, chapterId] }] }, 'duplicate chapter'],
    [{ ...base, items: [{ ...base.items[0], chapterIds: ['not-a-chapter-id'] }] }, 'invalid chapter UUID'],
    [{ ...base, items: [{ ...base.items[0], questionLabel: 'x'.repeat(51) }] }, 'long question label'],
    [{ ...base, items: [{ ...base.items[0], provenanceMode: 'inherit' }] }, 'inherit without parent'],
    [{ ...base, items: [{ ...base.items[0], provenanceMode: 'override', provenance: {} }] }, 'empty override'],
    [{ ...base, items: [{ ...base.items[0], provenanceMode: 'none', provenance: { paperNumber: 1 } }] }, 'none with paper'],
    [{ ...base, provenance: { examYear: 2025.5 } }, 'fractional year'],
    [{ ...base, provenance: { examVariant: 10 } }, 'variant bound'],
    [{ ...base, provenance: { subjectPaperId: 'not-uuid' } }, 'invalid uuid'],
    [{ ...base, items: Array.from({ length: 11 }, (_, index) => ({ itemOrder: index + 1, marksObtained: 0, marksAvailable: 1000, provenanceMode: 'none', chapterIds: [chapterId] })) }, 'session maximum'],
    [{ ...base, items: [{ ...base.items[0], marksObtained: 1.5 }] }, 'fractional score'],
    [{ ...base, items: [{ ...base.items[0], notes: 'x'.repeat(1001) }] }, 'long item notes'],
  ] as [unknown, string][]) {
    it(`rejects ${label}`, () => expect(PracticeCreateSchema.safeParse(candidate).success).toBe(false))
  }

  it('checks local-day cutoff separately from date syntax', () => {
    expect(dateWithinUserToday('2026-10-14', '2026-10-13')).toBe(false)
    expect(dateWithinUserToday('2026-10-13', '2026-10-13')).toBe(true)
  })
})

describe('full-paper-only selectors and practice analytics', () => {
  it('permits explicit off-route chapter logging as history without widening current-route readiness', () => {
    const mechanics = uid(80)
    const mechanicsChapter = uid(81)
    const offRoute: PracticeRouteContext = { ...context,
      papers: [...context.papers, { id: mechanics, subjectId, paperNumber: 4, stageBehavior: 'route_dependent', defaultStage: 'as' }],
      chapters: [...context.chapters, { id: mechanicsChapter, subjectId, stage: 'route_dependent', component: 'Mechanics', isActive: true, paperIds: [mechanics] }],
    }
    expect(eligiblePracticeLoggingChapterIds(offRoute, 'as', mechanics)).toEqual([mechanicsChapter])
    expect(eligiblePracticeLoggingChapterIds(offRoute, 'as', null)).not.toContain(mechanicsChapter)
    expect(eligiblePracticeChapterIds(offRoute, 'as', mechanics)).not.toContain(mechanicsChapter)
    const historical = withPracticeEligibility(session([{ id: uid(82), marks_obtained: 5, marks_available: 5,
      subject_paper_id: mechanics, chapter_ids: [mechanicsChapter] }]), offRoute)
    expect(historical.items[0].eligibility_reason).toBe('off_route_paper')
    expect(historical.eligible_score_max).toBe(0)
    const trend = attemptTrend([], [historical], new Map([[subjectId, offRoute]]))
    expect(summarizeEvidence(trend).lifetime.raw).toBe(5)
    expect(summarizeEvidence(trend).currentRoute.raw).toBe(0)
    expect(combinedChapterEvidence([], [historical])).toEqual([])
  })

  it('retains source-stage, subject, active-chapter and A2 locks for off-route logging', () => {
    const offRoute: PracticeRouteContext = { ...context,
      papers: [{ id: otherPaperId, subjectId, paperNumber: 2, stageBehavior: 'fixed_as', defaultStage: 'as' }],
      chapters: [{ ...context.chapters[0], paperIds: [otherPaperId] },
        { ...context.chapters[0], id: uid(83), isActive: false, paperIds: [otherPaperId] },
        { ...context.chapters[0], id: uid(84), subjectId: uid(99), paperIds: [otherPaperId] },
        { ...context.chapters[0], id: uid(85), stage: 'a2', paperIds: [otherPaperId] }],
    }
    expect(eligiblePracticeLoggingChapterIds(offRoute, 'as', otherPaperId)).toEqual([chapterId])
    expect(eligiblePracticeLoggingChapterIds(offRoute, 'a2', otherPaperId)).toEqual([])
    expect(eligiblePracticeLoggingChapterIds({ ...offRoute, enrollment: { ...offRoute.enrollment!, currentStage: 'a2' } }, 'a2', otherPaperId)).toEqual([])
    expect(eligiblePracticeLoggingChapterIds(offRoute, 'as', uid(99))).toEqual([])
    const remapped = { ...offRoute, selections: [{ subjectPaperId: otherPaperId, componentName: 'Pure 2', stage: 'a2' as const }] }
    expect(eligiblePracticeLoggingChapterIds(remapped, 'as', otherPaperId)).toEqual([])
    const fixedA2 = { ...offRoute, papers: [{ ...offRoute.papers[0], stageBehavior: 'fixed_a2' as const, defaultStage: 'a2' as const }] }
    expect(eligiblePracticeLoggingChapterIds(fixedA2, 'as', otherPaperId)).toEqual([])
  })

  it('keeps Statistics 2 practice as history for a Mathematics Mechanics plus Statistics 1 route', () => {
    const p4 = uid(90), p5 = uid(91), p6 = uid(92), statistics2 = uid(93)
    const maths: PracticeRouteContext = { ...context,
      enrollment: { ...context.enrollment!, currentStage: 'full', studyRoute: 'full_level' },
      selections: [{ subjectPaperId: p4, componentName: 'Mechanics', stage: 'as' },
        { subjectPaperId: p5, componentName: 'Statistics 1', stage: 'a2' }],
      papers: [{ id: p4, subjectId, paperNumber: 4, stageBehavior: 'route_dependent', defaultStage: 'as' },
        { id: p5, subjectId, paperNumber: 5, stageBehavior: 'route_dependent', defaultStage: 'as' },
        { id: p6, subjectId, paperNumber: 6, stageBehavior: 'fixed_a2', defaultStage: 'a2' }],
      chapters: [{ id: statistics2, subjectId, stage: 'a2', component: 'Statistics 2', isActive: true, paperIds: [p6] }],
    }
    expect(eligiblePracticeLoggingChapterIds(maths, 'a2', p6)).toEqual([statistics2])
    const historical = withPracticeEligibility({ ...session([{ id: uid(94), marks_obtained: 8, marks_available: 10,
      subject_paper_id: p6, chapter_ids: [statistics2] }]), stage: 'a2' }, maths)
    expect(historical).toMatchObject({ route_status: 'historical', eligible_score_raw: 0, eligible_score_max: 0 })
    expect(historical.items[0].eligibility_reason).toBe('off_route_paper')
    const summaries = summarizeEvidence(attemptTrend([], [historical], new Map([[subjectId, maths]])))
    expect(summaries.lifetime).toMatchObject({ raw: 8, max: 10 })
    expect(summaries.currentRoute).toMatchObject({ raw: 0, max: 0 })
    expect(combinedChapterEvidence([], [historical])).toEqual([])
  })

  it('preserves science P3 and P5 logging exceptions without unlocking A2', () => {
    const science: PracticeRouteContext = { ...context, enrollment: { ...context.enrollment!, subjectCode: '9702' },
      selections: [], papers: [{ id: otherPaperId, subjectId, paperNumber: 3, stageBehavior: 'fixed_as', defaultStage: 'as' }],
    }
    expect(eligiblePracticeLoggingChapterIds(science, 'as', otherPaperId)).toEqual([chapterId])
    const p5: PracticeRouteContext = { ...science,
      papers: [{ id: otherPaperId, subjectId, paperNumber: 5, stageBehavior: 'fixed_a2', defaultStage: 'a2' }],
    }
    expect(eligiblePracticeLoggingChapterIds(p5, 'a2', otherPaperId)).toEqual([])
    expect(eligiblePracticeLoggingChapterIds({ ...p5, enrollment: { ...p5.enrollment!, currentStage: 'a2' } }, 'a2', otherPaperId)).toEqual([chapterId])
  })

  it('uses mark weighting, variant-equivalent components, stage, best/latest and only full papers for prediction/threshold inputs', () => {
    expect(fullPaperCount(papers)).toBe(3)
    expect(markWeightedPaperAverage(papers)).toBeCloseTo(72, 4)
    expect(latestFullPaper(papers)?.id).toBe(uid(21))
    expect(bestFullPaper(papers)?.id).toBe(uid(22))
    expect(comparableFullPapers(papers, papers[0]).map(p => p.id)).toEqual([uid(21), uid(20)])
    expect(comparableComponentAnalytics(papers, papers[0])).toMatchObject({ count: 2, markWeightedAccuracyPct: 60, averageRaw: 45, averageMax: 75, latest: { id: uid(21) }, best: { id: uid(20) } })
    expect(predictionPaperInputs(papers, subjectId, 'as')).toHaveLength(2)
    expect(officialThresholdPaperInputs(papers, subjectId, 'a2')).toHaveLength(1)
    expect(comparableFullPapers([...papers, { ...papers[0], id: uid(23), subject_id: uid(99) }], papers[0])).toHaveLength(2)
    expect(comparableFullPapers([...papers, { ...papers[0], id: uid(24), stage: 'a2' }], papers[0])).toHaveLength(2)
  })

  it('marks same-stage off-route and inaccessible chapter evidence historical without losing lifetime history', () => {
    const source = session([
      { id: uid(31), marks_obtained: 4, marks_available: 5, subject_paper_id: paperId, chapter_ids: [chapterId, chapterId] },
      { id: uid(32), marks_obtained: 1, marks_available: 5, subject_paper_id: otherPaperId, chapter_ids: [chapterId] },
      { id: uid(33), marks_obtained: 2, marks_available: 5, subject_paper_id: paperId, chapter_ids: ['other'] },
    ])
    const decorated = withPracticeEligibility(source, context)
    expect(decorated.items.map(item => item.eligibility_reason)).toEqual(['eligible', 'off_route_paper', 'inaccessible_chapter'])
    expect([decorated.eligible_score_raw, decorated.eligible_score_max, decorated.route_status]).toEqual([4, 5, 'current'])
    const trend = attemptTrend(papers, [decorated], new Map([[subjectId, context]]))
    expect(trend.filter(point => point.attemptDate === '2026-10-13')).toHaveLength(3)
    expect(summarizeEvidence(trend).lifetime).toMatchObject({ attempts: 4, raw: 187, max: 265 })
    expect(summarizeEvidence(trend).currentRoute).toMatchObject({ attempts: 3, raw: 94, max: 155 })
  })

  it('counts each mapped practice item and full-paper child once per distinct chapter, excluding historical practice', () => {
    const decorated = withPracticeEligibility(session([
      { id: uid(31), marks_obtained: 4, marks_available: 5, subject_paper_id: paperId, chapter_ids: [chapterId, chapterId] },
      { id: uid(32), marks_obtained: 1, marks_available: 5, subject_paper_id: otherPaperId, chapter_ids: [chapterId] },
    ]), context)
    const combined = combinedChapterEvidence([{ id: uid(40), chapter_id: chapterId, chapter_ids: [chapterId, chapterId], marks_obtained: 2, marks_available: 10 }], [decorated])
    expect(combined).toEqual([{ chapterId, raw: 6, max: 15, attempts: 2, accuracyPct: 40, weakTopic: true, fullPaperAttempts: 1, practiceItems: 1 }])
  })

  it('honors A2 locks and route-dependent fallback/remaps', () => {
    const input = session([{ id: uid(31), marks_obtained: 3, marks_available: 5, subject_paper_id: null, chapter_ids: [otherChapterId] }])
    expect(withPracticeEligibility(input, context).eligible_for_readiness).toBe(true)
    const remapped = { ...context, selections: [{ subjectPaperId: null, componentName: 'Other', stage: 'as' as const }] }
    expect(withPracticeEligibility(input, remapped).eligible_for_readiness).toBe(false)
    const locked = { ...context, enrollment: { ...context.enrollment!, currentStage: 'as' as const } }
    expect(withPracticeEligibility({ ...input, stage: 'a2' }, locked).eligible_for_readiness).toBe(false)
  })

  it('allows P5 A2 access to AS foundations only for Physics and Chemistry', () => {
    const p5 = uid(50)
    const source = session([{ id: uid(51), marks_obtained: 3, marks_available: 5, subject_paper_id: p5, chapter_ids: [chapterId] }])
    const science: PracticeRouteContext = {
      ...context,
      enrollment: { ...context.enrollment!, subjectCode: '9702', currentStage: 'a2' },
      selections: [{ subjectPaperId: p5, componentName: 'Planning', stage: 'a2' }],
      papers: [{ id: p5, subjectId, paperNumber: 5 }],
    }
    expect(withPracticeEligibility({ ...source, stage: 'a2' }, science).eligible_for_readiness).toBe(true)
    expect(withPracticeEligibility({ ...source, stage: 'a2' }, { ...science, enrollment: { ...science.enrollment!, subjectCode: '9709' } }).eligible_for_readiness).toBe(false)
  })
})
