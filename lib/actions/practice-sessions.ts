'use server'

import { revalidatePath } from 'next/cache'
import { cache } from 'react'
import { z } from 'zod'
import { dateInTimeZone } from '@/lib/date'
import { toCreateRpcArgs, toUpdateRpcArgs } from '@/lib/practice-payload'
import { attemptTrend, combinedChapterEvidence, withPracticeEligibility } from '@/lib/practice-analytics'
import type { PaperEvidence, PaperQuestionEvidence } from '@/lib/practice-analytics'
import {
  basePaperNumber,
  bestFullPaper,
  comparableComponentAnalytics,
  computePredictedExamMark,
  fullPaperCount,
  markWeightedPaperAverage,
  rankComponentEvidence,
} from '@/lib/practice-analytics'
import { getAuthenticatedContext } from '@/lib/supabase/authenticated'
import {
  dateWithinUserToday, PracticeCreateSchema, PracticeDeleteSchema,
  PracticeHistoryQuerySchema, PracticeSessionRowSchema, PracticeUpdateSchema,
} from '@/lib/validations/practice-sessions'
import type { AttemptTrendPoint, ChapterEvidence, PracticeFormSubjectOption, PracticeHistoryPage, PracticeRouteContext, PracticeSessionRead } from '@/types/practice-sessions'
import { getAllPapersWithSubjects, getPapersForSubject, getUntaggedPapers } from '@/lib/actions/papers'
import type { ChapterAccuracy } from '@/types'
import type { PaperStage } from '@/types/database'
import type { StatsSubjectData, StatsOverviewData, LogsSubjectData, SummaryStatItem, ComponentStatItem } from '@/lib/session-cache'
import type { TrendSubject } from '@/lib/practice-trend'
import type { IndicatorItem } from '@/components/papers/study-indicators'
import type { RawEnrollment } from '@/components/papers/async-study-indicators'

type MutationResult = { error?: string; sessionId?: string; deleted?: boolean }
type SessionWithItems = z.infer<typeof PracticeSessionRowSchema>
const mutationRowSchema = z.object({ id: z.string().uuid() })

function safeMutationError(code: string | undefined): string {
  if (code === 'P0005') return 'This subject or stage is not currently available.'
  if (code === 'P0008') return 'The selected paper is not on the current route.'
  if (code === 'P0006') return 'A chapter is not available for this item.'
  if (code === 'P0003' || code === 'P0007' || code === 'P0002') return 'Invalid practice session data.'
  if (code === '42501') return 'Not authorized to change this practice session.'
  return 'Could not save the practice session.'
}

function revalidatePracticeRoutes(subjectId: string) {
  revalidatePath('/dashboard')
  revalidatePath('/past-papers')
  revalidatePath('/logs')
  revalidatePath('/stats')
  revalidatePath(`/subjects/${subjectId}`)
}

async function validateUserDate(supabase: Awaited<ReturnType<typeof getAuthenticatedContext>>['supabase'], userId: string, date: string) {
  const { data, error } = await supabase.from('profiles').select('timezone').eq('id', userId).single()
  if (error || !data) return false
  return dateWithinUserToday(date, dateInTimeZone(new Date(), data.timezone))
}

export async function createPracticeSession(input: unknown): Promise<MutationResult> {
  const parsed = PracticeCreateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid practice session data.' }
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return { error: 'Not authenticated.' }
  if (!await validateUserDate(supabase, user.id, parsed.data.sessionDate)) return { error: 'Session date is after your local today, or your profile is unavailable.' }
  const { data, error } = await supabase.rpc('log_practice_session_atomic', toCreateRpcArgs(user.id, parsed.data))
  if (error || !data) return { error: safeMutationError(error?.code) }
  const result = mutationRowSchema.safeParse(data)
  if (!result.success) return { error: 'Could not confirm the saved practice session.' }
  revalidatePracticeRoutes(parsed.data.subjectId)
  return { sessionId: result.data.id }
}

export async function updatePracticeSession(input: unknown): Promise<MutationResult> {
  const parsed = PracticeUpdateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid practice session data.' }
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return { error: 'Not authenticated.' }
  const { data: owned } = await supabase.from('practice_sessions').select('subject_id').eq('id', parsed.data.sessionId).eq('user_id', user.id).maybeSingle()
  if (!owned) return { error: 'Practice session not found.' }
  if (!await validateUserDate(supabase, user.id, parsed.data.sessionDate)) return { error: 'Session date is after your local today, or your profile is unavailable.' }
  const { data, error } = await supabase.rpc('update_practice_session_atomic', toUpdateRpcArgs(user.id, parsed.data))
  if (error || !data) return { error: safeMutationError(error?.code) }
  const result = mutationRowSchema.safeParse(data)
  if (!result.success) return { error: 'Could not confirm the saved practice session.' }
  revalidatePracticeRoutes(owned.subject_id)
  return { sessionId: result.data.id }
}

export async function deletePracticeSession(input: unknown): Promise<MutationResult> {
  const parsed = PracticeDeleteSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid practice session ID.' }
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return { error: 'Not authenticated.' }
  const { data: owned } = await supabase.from('practice_sessions').select('subject_id').eq('id', parsed.data.sessionId).eq('user_id', user.id).maybeSingle()
  if (!owned) return { error: 'Practice session not found.' }
  const { data, error } = await supabase.rpc('delete_practice_session', { p_user_id: user.id, p_session_id: parsed.data.sessionId })
  if (error) return { error: safeMutationError(error.code) }
  if (data !== true) return { error: 'Practice session not found.' }
  revalidatePracticeRoutes(owned.subject_id)
  return { deleted: true }
}

// React cache lasts only for the current Server Component request. Include the
// authenticated client and owner so personalized route/evidence reads cannot be
// reused by another request, user, or subject. Never persist these results.
const routeContext = cache(async (supabase: Awaited<ReturnType<typeof getAuthenticatedContext>>['supabase'], userId: string, subjectId: string): Promise<PracticeRouteContext> => {
  const [enrollmentResult, subjectResult, chaptersResult, papersResult] = await Promise.all([
    supabase.from('user_subjects').select('id, subject_id, study_route, current_stage, is_archived').eq('user_id', userId).eq('subject_id', subjectId).maybeSingle(),
    supabase.from('subjects').select('code').eq('id', subjectId).maybeSingle(),
    supabase.from('chapters').select('id, subject_id, title, number, stage, component, is_active, chapter_papers(subject_paper_id)').eq('subject_id', subjectId)
      .order('number', { ascending: true }).order('id', { ascending: true }),
    supabase.from('subject_papers').select('id, subject_id, paper_number, name, stage_behavior, default_stage').eq('subject_id', subjectId),
  ])
  if (enrollmentResult.error || subjectResult.error || chaptersResult.error || papersResult.error) throw new Error('Could not load practice route.')
  const enrollment = enrollmentResult.data
  const selectionsResult = enrollment
    ? await supabase.from('subject_paper_selections').select('subject_paper_id, component_name, stage').eq('user_subject_id', enrollment.id)
    : { data: [], error: null }
  if (selectionsResult.error) throw new Error('Could not load practice route.')
  return {
    enrollment: enrollment ? {
      id: enrollment.id, subjectId: enrollment.subject_id, subjectCode: subjectResult.data?.code ?? null,
      studyRoute: enrollment.study_route, currentStage: enrollment.current_stage, isArchived: enrollment.is_archived,
    } : null,
    selections: (selectionsResult.data ?? []).map(row => ({ subjectPaperId: row.subject_paper_id, componentName: row.component_name, stage: row.stage })),
    chapters: (chaptersResult.data ?? []).map(row => ({
      id: row.id, subjectId: row.subject_id, title: row.title, number: row.number, stage: row.stage, component: row.component, isActive: row.is_active,
      paperIds: row.chapter_papers.map(link => link.subject_paper_id),
    })),
    papers: (papersResult.data ?? []).map(row => ({ id: row.id, subjectId: row.subject_id, paperNumber: row.paper_number, name: row.name,
      stageBehavior: row.stage_behavior, defaultStage: row.default_stage })),
  }
})

export async function getPracticeRouteContext(subjectId: string): Promise<PracticeRouteContext | null> {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return null
  return routeContext(supabase, user.id, subjectId)
}

function decorate(row: SessionWithItems, context: PracticeRouteContext): PracticeSessionRead {
  const { practice_session_items: children, ...session } = row
  return withPracticeEligibility({ ...session, items: children.map(({ practice_session_chapters: links, ...item }) => ({
    ...item, chapter_ids: links.map(link => link.chapter_id), eligible_for_readiness: false, eligibility_reason: 'inactive_route_or_stage' as const,
  })).sort((a, b) => a.item_order - b.item_order) }, context)
}

const sessionSelect = '*, practice_session_items(*, practice_session_chapters(chapter_id))'

export async function getPracticeSessionDetail(sessionId: string): Promise<PracticeSessionRead | null> {
  const parsed = PracticeDeleteSchema.safeParse({ sessionId })
  if (!parsed.success) return null
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return null
  const { data, error } = await supabase.from('practice_sessions').select(sessionSelect).eq('id', sessionId).eq('user_id', user.id).maybeSingle()
  if (error || !data) return null
  const row = PracticeSessionRowSchema.safeParse(data)
  if (!row.success) throw new Error('Could not load practice session.')
  return decorate(row.data, await routeContext(supabase, user.id, row.data.subject_id))
}

export async function getPracticeHistory(input: unknown = {}): Promise<PracticeHistoryPage> {
  const parsed = PracticeHistoryQuerySchema.safeParse(input)
  if (!parsed.success) return { sessions: [], total: 0, offset: 0, limit: 0 }
  const { supabase, user } = await getAuthenticatedContext()
  const offset = parsed.data.offset ?? 0
  const limit = parsed.data.limit ?? 50
  if (!user) return { sessions: [], total: 0, offset, limit }
  return readPracticeHistory(supabase, user.id, parsed.data)
}

async function readPracticeHistory(
  supabase: Awaited<ReturnType<typeof getAuthenticatedContext>>['supabase'],
  userId: string,
  input: z.infer<typeof PracticeHistoryQuerySchema>,
): Promise<PracticeHistoryPage> {
  const offset = input.offset ?? 0
  const limit = input.limit ?? 50
  let query = supabase.from('practice_sessions').select(sessionSelect, { count: 'exact' }).eq('user_id', userId)
  if (input.subjectId) query = query.eq('subject_id', input.subjectId)
  if (input.stage && input.stage !== 'all') query = query.eq('stage', input.stage)
  const { data, count, error } = await query.order('session_date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit - 1)
  if (error || !data) throw new Error('Could not load practice history.')
  const rows = z.array(PracticeSessionRowSchema).safeParse(data)
  if (!rows.success) throw new Error('Could not load practice history.')
  const contexts = new Map<string, PracticeRouteContext>()
  await Promise.all([...new Set(rows.data.map(row => row.subject_id))].map(async subjectId => {
    contexts.set(subjectId, await routeContext(supabase, userId, subjectId))
  }))
  return { sessions: rows.data.map(row => decorate(row, contexts.get(row.subject_id)!)), total: count ?? 0, offset, limit }
}

export async function getPracticeHistoryForSubject(subjectId: string, stage: 'as' | 'a2' | 'all' = 'all', offset = 0, limit = 50) {
  return getPracticeHistory({ subjectId, stage, offset, limit })
}

const allPracticeForSubject = cache(async (supabase: Awaited<ReturnType<typeof getAuthenticatedContext>>['supabase'], userId: string, subjectId?: string): Promise<PracticeSessionRead[]> => {
  const sessions: PracticeSessionRead[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await readPracticeHistory(supabase, userId, { ...(subjectId ? { subjectId } : {}), offset, limit: 100 })
    sessions.push(...page.sessions)
    if (offset + page.sessions.length >= page.total || page.sessions.length === 0) return sessions
  }
})

const allFullPapersForSubject = cache(async (supabase: Awaited<ReturnType<typeof getAuthenticatedContext>>['supabase'], userId: string, subjectId?: string): Promise<PaperEvidence[]> => {
  const papers: PaperEvidence[] = []
  for (let offset = 0; ; offset += 100) {
    let query = supabase.from('past_papers')
      .select('id, subject_id, stage, attempted_at, created_at, subject_paper_id, paper_number, score_raw, score_max, accuracy_pct')
      .eq('user_id', userId)
    if (subjectId) query = query.eq('subject_id', subjectId)
    const { data, error } = await query.order('id').range(offset, offset + 99)
    if (error || !data) throw new Error('Could not load full-paper evidence.')
    papers.push(...data)
    if (data.length < 100) return papers
  }
})

export async function getPracticeTrendForSubject(subjectId: string): Promise<AttemptTrendPoint[]> {
  if (!PracticeHistoryQuerySchema.safeParse({ subjectId }).success) return []
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return []
  const [papers, sessions, context] = await Promise.all([
    allFullPapersForSubject(supabase, user.id, subjectId), allPracticeForSubject(supabase, user.id, subjectId), routeContext(supabase, user.id, subjectId),
  ])
  return attemptTrend(papers, sessions, new Map([[subjectId, context]]))
}

export async function getPracticeOverview(subjectId?: string): Promise<{ sessions: PracticeSessionRead[]; trend: AttemptTrendPoint[] }> {
  if (subjectId && !PracticeHistoryQuerySchema.safeParse({ subjectId }).success) return { sessions: [], trend: [] }
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return { sessions: [], trend: [] }
  const [papers, sessions] = await Promise.all([allFullPapersForSubject(supabase, user.id, subjectId), allPracticeForSubject(supabase, user.id, subjectId)])
  const contexts = new Map<string, PracticeRouteContext>()
  await Promise.all([...new Set([...papers.map(paper => paper.subject_id), ...sessions.map(session => session.subject_id)])]
    .map(async id => contexts.set(id, await routeContext(supabase, user.id, id))))
  return { sessions, trend: attemptTrend(papers, sessions, contexts) }
}

export async function getPracticeFormCatalogue(): Promise<PracticeFormSubjectOption[]> {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return []
  const { data, error } = await supabase.from('user_subjects')
    .select('subject_id, study_route, is_archived, subjects(id, name, code)')
    .eq('user_id', user.id).eq('is_archived', false)
  if (error || !data) throw new Error('Could not load practice subjects.')
  const relatedSubject = z.object({ id: z.string().uuid(), name: z.string(), code: z.string() })
  const confirmed = data.flatMap(row => {
    const subject = relatedSubject.safeParse(Array.isArray(row.subjects) ? row.subjects[0] : row.subjects)
    return row.study_route !== 'unconfirmed' && subject.success
      ? [{ subjectId: row.subject_id, name: subject.data.name, code: subject.data.code }]
      : []
  })
  return Promise.all(confirmed.map(async row => ({
    id: row.subjectId, name: row.name, code: row.code,
    context: await routeContext(supabase, user.id, row.subjectId),
  })))
}

export async function getCombinedChapterEvidenceForSubject(subjectId: string): Promise<ChapterEvidence[]> {
  if (!PracticeHistoryQuerySchema.safeParse({ subjectId }).success) return []
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return []
  const [papers, sessions] = await Promise.all([allFullPapersForSubject(supabase, user.id, subjectId), allPracticeForSubject(supabase, user.id, subjectId)])
  const questions: PaperQuestionEvidence[] = []
  // The question table has no user_id; restrict every batch to IDs from the owner-scoped paper query.
  for (let start = 0; start < papers.length; start += 100) {
    const ids = papers.slice(start, start + 100).map(paper => paper.id)
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.from('paper_question_attempts')
        .select('id, marks_available, marks_obtained, chapter_id, chapter_ids')
        .in('paper_id', ids).order('id').range(offset, offset + 99)
      if (error || !data) throw new Error('Could not load chapter evidence.')
      questions.push(...data)
      if (data.length < 100) break
    }
  }
  return combinedChapterEvidence(questions, sessions)
}

/**
 * Loads high-level practice overview stats (trend, summary metrics, component ranking)
 * without waiting for heavy chapter breakdowns or readiness RPC computations.
 *
 * Runs user subject enrollments, full papers, and practice overview queries in parallel.
 * Avoids executing compute_readiness_score and paper_question_attempts queries during initial SSR.
 */
export async function getStatsOverviewData(subjectId?: string | null): Promise<StatsOverviewData> {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) throw new Error('Not authenticated')

  const activeSubjectId = subjectId || null

  const papersPromise = activeSubjectId ? getPapersForSubject(activeSubjectId) : getAllPapersWithSubjects()
  const [userSubjectsData, papers, practice] = await Promise.all([
    supabase
      .from('user_subjects')
      .select('id, subject_id, current_stage, study_route, is_archived, subjects(id, name, code, color_hex)')
      .eq('user_id', user.id)
      .eq('is_archived', false),
    papersPromise,
    getPracticeOverview(activeSubjectId ?? undefined),
  ])

  const enrollments = (userSubjectsData.data || []) as unknown as RawEnrollment[]
  const subjects = enrollments
    .map(e => e.subjects)
    .filter((s): s is { id: string; name: string; color_hex: string; code?: string | null } => Boolean(s))
    .map(s => ({ id: s.id, name: s.name, color_hex: s.color_hex ?? '#3b82f6', code: s.code }))

  const activeSubject = subjects.find(s => s.id === activeSubjectId)

  const avgScore = markWeightedPaperAverage(papers)
  const best = bestFullPaper(papers)
  const componentReferences = [...new Map(papers.filter(paper => paper.paper_number !== null).map(paper => [
    `${paper.subject_id}:${paper.stage}:${basePaperNumber(paper.paper_number)}`, paper,
  ])).values()]
  const componentStats: ComponentStatItem[] = rankComponentEvidence(componentReferences.map(reference => ({
    label: `${reference.subjects.name} · ${reference.stage?.toUpperCase() ?? 'Untagged'} · Paper ${basePaperNumber(reference.paper_number)}`,
    ...comparableComponentAnalytics(papers, reference),
  })))

  const summaryStats: SummaryStatItem[] = [
    { label: 'Papers logged', value: fullPaperCount(papers) },
    { label: 'Full-paper average', value: avgScore != null ? `${avgScore.toFixed(1)}%` : '—' },
    { label: 'Best full paper', value: best ? `${Number(best.accuracy_pct).toFixed(1)}%` : '—' },
  ]

  const trendSubjects: TrendSubject[] = [
    ...new Map(
      [
        ...subjects,
        ...papers.map(p => ({ id: p.subject_id, name: p.subjects.name, color_hex: '#3b82f6' })),
      ].map(s => [s.id, s])
    ).values(),
  ]

  return {
    subjectId: activeSubjectId,
    trend: practice.trend,
    trendSubjects,
    summaryStats,
    componentStats,
    activeSubjectName: activeSubject?.name ?? null,
    timestamp: Date.now(),
  }
}

export async function getStatsChapterAccuracy(subjectId?: string | null): Promise<ChapterAccuracy[]> {
  const activeSubjectId = subjectId || null
  if (!activeSubjectId) return []

  const { user } = await getAuthenticatedContext()
  if (!user) throw new Error('Not authenticated')

  const [chapterEvidence, activeContext] = await Promise.all([
    getCombinedChapterEvidenceForSubject(activeSubjectId),
    getPracticeRouteContext(activeSubjectId),
  ])

  const chapterTitles = new Map<string, { title: string; component: string | null }>(
    (activeContext?.chapters ?? []).map(ch => [ch.id, { title: ch.title ?? 'Chapter', component: ch.component }])
  )

  return chapterEvidence.map(row => ({
    chapter_id: row.chapterId,
    title: chapterTitles.get(row.chapterId)?.title ?? 'Chapter',
    component: chapterTitles.get(row.chapterId)?.component ?? null,
    total_obtained: row.raw,
    total_available: row.max,
    accuracy_pct: row.accuracyPct,
    attempt_count: row.attempts,
  }))
}

export async function getStatsStudyIndicators(subjectId?: string | null): Promise<IndicatorItem[]> {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) throw new Error('Not authenticated')

  const activeSubjectId = subjectId || null

  const papersPromise = activeSubjectId ? getPapersForSubject(activeSubjectId) : getAllPapersWithSubjects()
  const [userSubjectsData, papers, practice] = await Promise.all([
    supabase
      .from('user_subjects')
      .select('id, subject_id, current_stage, study_route, is_archived, subjects(id, name, code, color_hex)')
      .eq('user_id', user.id)
      .eq('is_archived', false),
    papersPromise,
    getPracticeOverview(activeSubjectId ?? undefined),
  ])

  const enrollments = (userSubjectsData.data || []) as unknown as RawEnrollment[]
  const activeEnrollment = enrollments.find(e => e.subject_id === activeSubjectId)
  const targetEnrollments = activeEnrollment ? [activeEnrollment] : enrollments

  const indicatorItems: IndicatorItem[] = (
    await Promise.all(
      targetEnrollments.map(async enrollment => {
        if (enrollment.study_route === 'unconfirmed') return []
        const sId = enrollment.subject_id
        const sName = enrollment.subjects?.name ?? 'Subject'
        const sCode = enrollment.subjects?.code ?? undefined
        const route = enrollment.study_route

        const context = await getPracticeRouteContext(sId)
        if (!context) return []

        const stages: PaperStage[] = route === 'as_only' ? ['as'] : ['as', 'a2']

        const itemsForEnrollment = await Promise.all(
          stages.map(async stage => {
            const isCurrent =
              enrollment.current_stage === 'full'
                ? true
                : enrollment.current_stage === stage
            const isLockedA2 = stage === 'a2' && enrollment.current_stage === 'as'

            const predicted = computePredictedExamMark(sId, stage, papers, practice.sessions, context)

            const hasRecordedHistory =
              practice.sessions.some(s => s.subject_id === sId && s.stage === stage) ||
              papers.some(p => p.subject_id === sId && p.stage === stage)

            let readinessScore: number | null = null
            if (!isLockedA2) {
              const rpcRes = await supabase.rpc('compute_readiness_score', {
                p_user_id: user.id,
                p_subject_id: sId,
                p_stage: stage,
              })
              readinessScore = typeof rpcRes.data === 'number' ? rpcRes.data : null
            }

            return {
              subjectId: sId,
              subjectName: sName,
              subjectCode: sCode,
              stage,
              isCurrentStage: isCurrent,
              isLockedA2,
              predicted,
              readinessScore,
              hasRecordedHistory,
            }
          })
        )

        return itemsForEnrollment
      })
    )
  ).flat()

  return indicatorItems
}

export async function getStatsSubjectData(subjectId: string | null): Promise<StatsSubjectData> {
  const [overview, chapterAccuracy, studyIndicators] = await Promise.all([
    getStatsOverviewData(subjectId),
    getStatsChapterAccuracy(subjectId),
    getStatsStudyIndicators(subjectId),
  ])

  return {
    ...overview,
    chapterAccuracy,
    studyIndicators,
  }
}
export async function getLogsSubjectData(
  subjectId: string | null,
  page: number = 1,
  pageSize: number = 50
): Promise<LogsSubjectData> {
  const { user } = await getAuthenticatedContext()
  if (!user) throw new Error('Not authenticated')

  const activeSubjectId = subjectId || null
  const pageParam = Math.max(1, page)
  const offset = (pageParam - 1) * pageSize

  const papersPromise = activeSubjectId ? getPapersForSubject(activeSubjectId) : getAllPapersWithSubjects()
  const untaggedPapersPromise = activeSubjectId
    ? getUntaggedPapers()
    : papersPromise.then(rows => rows.filter(paper => !paper.stage))

  const [papers, untaggedPapers, history] = await Promise.all([
    papersPromise,
    untaggedPapersPromise,
    getPracticeHistory({
      ...(activeSubjectId ? { subjectId: activeSubjectId } : {}),
      offset,
      limit: pageSize,
    }),
  ])

  return {
    subjectId: activeSubjectId,
    page: pageParam,
    pageSize,
    sessions: history.sessions,
    totalSessions: history.total,
    papers,
    untaggedPapers,
    timestamp: Date.now(),
  }
}
