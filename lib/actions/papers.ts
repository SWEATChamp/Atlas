'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedContext } from '@/lib/supabase/authenticated'
import { validateAssignPaperStageInput } from '@/lib/validations/papers'
import type { 
  PaperWithSubject, 
  PaperWithQuestions, 
  ChapterAccuracy,
} from '@/types'

export async function getAllPapersWithSubjects(): Promise<PaperWithSubject[]> {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return []

  const { data, error } = await supabase
    .from('past_papers')
    .select(`
      *,
      subjects!inner ( name, color_hex, code )
    `)
    .eq('user_id', user.id)
    .order('attempted_at', { ascending: false })

  if (error) return []
  return data as unknown as PaperWithSubject[]
}

export async function getPapersForSubject(subjectId: string): Promise<PaperWithSubject[]> {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return []

  const { data, error } = await supabase
    .from('past_papers')
    .select(`
      *,
      subjects!inner ( name, color_hex, code )
    `)
    .eq('user_id', user.id)
    .eq('subject_id', subjectId)
    .order('attempted_at', { ascending: false })

  if (error) return []
  return data as unknown as PaperWithSubject[]
}

export async function getPaperDetail(paperId: string): Promise<PaperWithQuestions | null> {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return null

  const { data, error } = await supabase
    .from('past_papers')
    .select(`
      *,
      subjects ( name, color_hex, code ),
      paper_question_attempts (
        *,
        chapters ( title, component )
      )
    `)
    .eq('id', paperId)
    .eq('user_id', user.id)
    .single()

  if (error || !data) return null
  return data as unknown as PaperWithQuestions
}

export async function getChapterAccuracy(subjectId: string): Promise<ChapterAccuracy[]> {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return []

  // Step 1: get paper IDs for this user+subject (fast indexed lookup)
  const { data: paperRows } = await supabase
    .from('past_papers')
    .select('id')
    .eq('user_id', user.id)
    .eq('subject_id', subjectId)

  if (!paperRows || paperRows.length === 0) return []
  const paperIds = paperRows.map(p => p.id)

  // Step 2: get question attempts for those papers
  const { data, error } = await supabase
    .from('paper_question_attempts')
    .select('marks_available, marks_obtained, chapter_id, chapters!inner(title, component)')
    .in('paper_id', paperIds)

  if (error || !data) return []

  const stats: Record<string, ChapterAccuracy> = {}
  type AttemptRow = {
    marks_available: number
    marks_obtained: number
    chapter_id: string | null
    chapters: { title: string; component: string } | null
  }
  for (const row of (data as unknown as AttemptRow[])) {
    if (!row.chapter_id || !row.chapters) continue
    const cid = row.chapter_id
    if (!stats[cid]) {
      stats[cid] = { chapter_id: cid, title: row.chapters.title, component: row.chapters.component, total_obtained: 0, total_available: 0, accuracy_pct: 0, attempt_count: 0 }
    }
    stats[cid].total_obtained  += row.marks_obtained
    stats[cid].total_available += row.marks_available
    stats[cid].attempt_count  += 1
  }

  return Object.values(stats)
    .map(s => ({ ...s, accuracy_pct: s.total_available > 0 ? (s.total_obtained / s.total_available) * 100 : 0 }))
    .sort((a, b) => a.accuracy_pct - b.accuracy_pct)
}

export interface QuestionInput {
  questionNumber: string
  chapterId: string | null
  marksObtained: number
  marksAvailable: number
}

export interface LogPaperInput {
  subjectId: string
  subjectPaperId?: string | null
  year: number
  session: 'feb_mar' | 'may_jun' | 'oct_nov'
  paperNumber: number
  variant: number
  stage: 'as' | 'a2'
  attemptedAt: string
  timeTakenMins?: number
  notes?: string
  questions: QuestionInput[]
}

const LogPaperSchema = z.object({
  subjectId: z.string().uuid(),
  subjectPaperId: z.string().uuid().nullable().optional(),
  year: z.number().int().min(1990).max(2100),
  session: z.enum(['feb_mar', 'may_jun', 'oct_nov']),
  paperNumber: z.number().int().min(1).max(9),
  variant: z.number().int().min(1).max(9),
  stage: z.enum(['as', 'a2']),
  attemptedAt: z.string(),
  timeTakenMins: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  questions: z.array(
    z.object({
      questionNumber: z.string().min(1),
      chapterId: z.string().uuid().nullable(),
      marksObtained: z.number().int().min(0),
      marksAvailable: z.number().int().min(1),
    })
  ),
})

export async function logPaper(data: LogPaperInput): Promise<{ error?: string; paperId?: string }> {
  const parsed = LogPaperSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid paper data' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Check enrollment stage access
  const { data: enrollment } = await supabase
    .from('user_subjects')
    .select('study_route, current_stage')
    .eq('user_id', user.id)
    .eq('subject_id', data.subjectId)
    .eq('is_archived', false)
    .single()

  if (!enrollment || enrollment.study_route === 'unconfirmed') {
    return { error: 'Please confirm your study route before logging papers.' }
  }

  if (data.stage === 'a2' && enrollment.current_stage !== 'a2' && enrollment.current_stage !== 'full') {
    return { error: 'A2 is not unlocked for this subject yet.' }
  }

  const { data: subject } = await supabase
    .from('subjects')
    .select('code, is_available')
    .eq('id', data.subjectId)
    .single()

  if (!subject) return { error: 'Subject not found' }

  // Resolve subject_paper_id if not provided
  let subjectPaperId = data.subjectPaperId
  if (!subjectPaperId) {
    const { data: sp } = await supabase
      .from('subject_papers')
      .select('id')
      .eq('subject_id', data.subjectId)
      .eq('paper_number', data.paperNumber)
      .maybeSingle()
    if (sp) {
      subjectPaperId = sp.id
    }
  }

  const { data: result, error: rpcError } = await supabase.rpc('log_past_paper_atomic', {
    p_user_id: user.id,
    p_paper: {
      subject_id: data.subjectId,
      subject_paper_id: subjectPaperId || null,
      paper_number: data.paperNumber * 10 + data.variant,
      stage: data.stage,
      year: data.year,
      session: data.session,
      variant: data.variant,
      time_taken_mins: data.timeTakenMins || null,
      notes: data.notes || null,
      attempted_at: data.attemptedAt,
    },
    p_questions: data.questions.map((q) => ({
      question_number: q.questionNumber,
      chapter_id: q.chapterId,
      marks_available: q.marksAvailable,
      marks_obtained: q.marksObtained,
    })),
  })

  if (rpcError) return { error: rpcError.message }

  revalidatePath('/past-papers')
  revalidatePath('/dashboard')
  revalidatePath(`/subjects/${data.subjectId}`)
  return { paperId: (result as { id?: string })?.id }
}

export async function deletePaper(paperId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('past_papers')
    .delete()
    .eq('id', paperId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/past-papers')
  revalidatePath('/dashboard')
  return {}
}

export async function updatePaper(
  paperId: string,
  data: LogPaperInput
): Promise<{ error?: string }> {
  const parsed = LogPaperSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid paper data' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  let subjectPaperId = data.subjectPaperId
  if (!subjectPaperId) {
    const { data: sp } = await supabase
      .from('subject_papers')
      .select('id')
      .eq('subject_id', data.subjectId)
      .eq('paper_number', data.paperNumber)
      .maybeSingle()
    if (sp) {
      subjectPaperId = sp.id
    }
  }

  const { error: rpcError } = await supabase.rpc('update_past_paper_atomic', {
    p_user_id: user.id,
    p_paper_id: paperId,
    p_paper: {
      subject_id: data.subjectId,
      subject_paper_id: subjectPaperId || null,
      paper_number: data.paperNumber * 10 + data.variant,
      stage: data.stage,
      year: data.year,
      session: data.session,
      variant: data.variant,
      time_taken_mins: data.timeTakenMins || null,
      notes: data.notes || null,
      attempted_at: data.attemptedAt,
    },
    p_questions: data.questions.map((q) => ({
      question_number: q.questionNumber,
      chapter_id: q.chapterId,
      marks_available: q.marksAvailable,
      marks_obtained: q.marksObtained,
    })),
  })

  if (rpcError) return { error: rpcError.message }

  revalidatePath('/past-papers')
  revalidatePath(`/past-papers/${paperId}`)
  revalidatePath('/dashboard')
  revalidatePath(`/subjects/${data.subjectId}`)
  return {}
}

export async function getSubjectPapers(subjectId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subject_papers')
    .select('*')
    .eq('subject_id', subjectId)
    .order('paper_number')

  if (error) return []
  return data
}

/**
 * Fetch papers with stage = NULL for the current user (legacy / untagged papers).
 */
export async function getUntaggedPapers(): Promise<PaperWithSubject[]> {
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return []

  const { data, error } = await supabase
    .from('past_papers')
    .select(`
      *,
      subjects!inner ( name, color_hex, code )
    `)
    .eq('user_id', user.id)
    .is('stage', null)
    .order('attempted_at', { ascending: false })

  if (error) return []
  return data as unknown as PaperWithSubject[]
}

export async function assignPaperStage(
  rawPaperId: string,
  rawStage: 'as' | 'a2'
): Promise<{ success: boolean; paperId?: string; stage?: 'as' | 'a2'; error?: string }> {
  const parsed = validateAssignPaperStageInput(rawPaperId, rawStage)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input data' }
  }
  const { paperId, stage } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('past_papers')
    .update({ stage })
    .eq('id', paperId)
    .eq('user_id', user.id)
    .is('stage', null)
    .select('id')

  if (error) {
    return { success: false, error: 'Failed to update paper stage. Please try again.' }
  }

  if (!data || data.length === 0) {
    return { success: false, error: 'Past paper not found, already tagged, or access denied.' }
  }

  revalidatePath('/past-papers')
  revalidatePath('/dashboard')
  return { success: true, paperId, stage }
}
