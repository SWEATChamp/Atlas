'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dateInTimeZone } from '@/lib/date'
import { toCreateRpcArgs, toUpdateRpcArgs } from '@/lib/practice-payload'
import { attemptTrend, combinedChapterEvidence, withPracticeEligibility } from '@/lib/practice-analytics'
import type { PaperEvidence, PaperQuestionEvidence } from '@/lib/practice-analytics'
import { getAuthenticatedContext } from '@/lib/supabase/authenticated'
import {
  dateWithinUserToday, PracticeCreateSchema, PracticeDeleteSchema,
  PracticeHistoryQuerySchema, PracticeSessionRowSchema, PracticeUpdateSchema,
} from '@/lib/validations/practice-sessions'
import type { AttemptTrendPoint, ChapterEvidence, PracticeFormSubjectOption, PracticeHistoryPage, PracticeRouteContext, PracticeSessionRead } from '@/types/practice-sessions'

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

async function routeContext(supabase: Awaited<ReturnType<typeof getAuthenticatedContext>>['supabase'], userId: string, subjectId: string): Promise<PracticeRouteContext> {
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
  let query = supabase.from('practice_sessions').select(sessionSelect, { count: 'exact' }).eq('user_id', user.id)
  if (parsed.data.subjectId) query = query.eq('subject_id', parsed.data.subjectId)
  if (parsed.data.stage && parsed.data.stage !== 'all') query = query.eq('stage', parsed.data.stage)
  const { data, count, error } = await query.order('session_date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit - 1)
  if (error || !data) throw new Error('Could not load practice history.')
  const rows = z.array(PracticeSessionRowSchema).safeParse(data)
  if (!rows.success) throw new Error('Could not load practice history.')
  const contexts = new Map<string, PracticeRouteContext>()
  await Promise.all([...new Set(rows.data.map(row => row.subject_id))].map(async subjectId => {
    contexts.set(subjectId, await routeContext(supabase, user.id, subjectId))
  }))
  return { sessions: rows.data.map(row => decorate(row, contexts.get(row.subject_id)!)), total: count ?? 0, offset, limit }
}

export async function getPracticeHistoryForSubject(subjectId: string, stage: 'as' | 'a2' | 'all' = 'all', offset = 0, limit = 50) {
  return getPracticeHistory({ subjectId, stage, offset, limit })
}

async function allPracticeForSubject(subjectId?: string): Promise<PracticeSessionRead[]> {
  const sessions: PracticeSessionRead[] = []
  for (let offset = 0; ; offset += 100) {
    const page = await getPracticeHistory({ ...(subjectId ? { subjectId } : {}), offset, limit: 100 })
    sessions.push(...page.sessions)
    if (offset + page.sessions.length >= page.total || page.sessions.length === 0) return sessions
  }
}

async function allFullPapersForSubject(subjectId?: string): Promise<PaperEvidence[]> {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return []
  const papers: PaperEvidence[] = []
  for (let offset = 0; ; offset += 100) {
    let query = supabase.from('past_papers')
      .select('id, subject_id, stage, attempted_at, created_at, subject_paper_id, paper_number, score_raw, score_max, accuracy_pct')
      .eq('user_id', user.id)
    if (subjectId) query = query.eq('subject_id', subjectId)
    const { data, error } = await query.order('id').range(offset, offset + 99)
    if (error || !data) throw new Error('Could not load full-paper evidence.')
    papers.push(...data)
    if (data.length < 100) return papers
  }
}

export async function getPracticeTrendForSubject(subjectId: string): Promise<AttemptTrendPoint[]> {
  if (!PracticeHistoryQuerySchema.safeParse({ subjectId }).success) return []
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return []
  const [papers, sessions, context] = await Promise.all([
    allFullPapersForSubject(subjectId), allPracticeForSubject(subjectId), routeContext(supabase, user.id, subjectId),
  ])
  return attemptTrend(papers, sessions, new Map([[subjectId, context]]))
}

export async function getPracticeOverview(subjectId?: string): Promise<{ sessions: PracticeSessionRead[]; trend: AttemptTrendPoint[] }> {
  if (subjectId && !PracticeHistoryQuerySchema.safeParse({ subjectId }).success) return { sessions: [], trend: [] }
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return { sessions: [], trend: [] }
  const [papers, sessions] = await Promise.all([allFullPapersForSubject(subjectId), allPracticeForSubject(subjectId)])
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
  const [papers, sessions] = await Promise.all([allFullPapersForSubject(subjectId), allPracticeForSubject(subjectId)])
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return []
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
