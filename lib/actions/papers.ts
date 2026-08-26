'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { 
  PaperWithSubject, 
  PaperWithQuestions, 
  ChapterAccuracy,
  PaperStage,
} from '@/types'

export async function getAllPapersWithSubjects(): Promise<PaperWithSubject[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  for (const row of data as any[]) {
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
    .single()

  if (!enrollment || enrollment.study_route === 'unconfirmed') {
    return { error: 'Please confirm your study route before logging papers.' }
  }

  if (data.stage === 'a2' && enrollment.current_stage !== 'a2' && enrollment.current_stage !== 'full') {
    return { error: 'A2 is not unlocked for this subject yet.' }
  }

  const { data: subject } = await supabase
    .from('subjects')
    .select('code')
    .eq('id', data.subjectId)
    .single()

  if (!subject) return { error: 'Subject not found' }

  const subjectCode = subject.code || 'UNKNOWN'
  const sessionLetters = data.session === 'feb_mar' ? 'F/M' : data.session === 'may_jun' ? 'M/J' : 'O/N'
  const yearShort = data.year.toString().slice(-2)
  const combinedPaperNumber = data.paperNumber * 10 + data.variant
  const paperCode = `${subjectCode}/${combinedPaperNumber}/${sessionLetters}/${yearShort}`

  const scoreRaw = data.questions.reduce((sum, q) => sum + q.marksObtained, 0)
  const scoreMax = data.questions.reduce((sum, q) => sum + q.marksAvailable, 0)

  const { data: insertedPaper, error: paperError } = await supabase
    .from('past_papers')
    .insert({
      user_id: user.id,
      subject_id: data.subjectId,
      paper_code: paperCode,
      year: data.year,
      session: data.session,
      paper_number: combinedPaperNumber,
      stage: data.stage,
      attempted_at: data.attemptedAt,
      score_raw: scoreRaw,
      score_max: scoreMax,
      time_taken_mins: data.timeTakenMins || null,
      notes: data.notes || null,
    })
    .select('id')
    .single()

  if (paperError) return { error: paperError.message }

  const qInserts = data.questions.map(q => ({
    paper_id: insertedPaper.id,
    chapter_id: q.chapterId,
    question_number: q.questionNumber,
    marks_available: q.marksAvailable,
    marks_obtained: q.marksObtained,
  }))

  const { error: qError } = await supabase
    .from('paper_question_attempts')
    .insert(qInserts)

  if (qError) return { error: qError.message }

  revalidatePath('/past-papers')
  revalidatePath('/dashboard')
  revalidatePath(`/subjects/${data.subjectId}`)
  return { paperId: insertedPaper.id }
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

  const { data: subject } = await supabase
    .from('subjects')
    .select('code')
    .eq('id', data.subjectId)
    .single()

  if (!subject) return { error: 'Subject not found' }

  const sessionLetters = data.session === 'feb_mar' ? 'F/M' : data.session === 'may_jun' ? 'M/J' : 'O/N'
  const yearShort = data.year.toString().slice(-2)
  const combinedPaperNumber = data.paperNumber * 10 + data.variant
  const paperCode = `${subject.code}/${combinedPaperNumber}/${sessionLetters}/${yearShort}`

  const scoreRaw = data.questions.reduce((s, q) => s + q.marksObtained, 0)
  const scoreMax = data.questions.reduce((s, q) => s + q.marksAvailable, 0)

  // Update the paper row
  const { error: updateError } = await supabase
    .from('past_papers')
    .update({
      subject_id: data.subjectId,
      paper_code: paperCode,
      year: data.year,
      session: data.session,
      paper_number: combinedPaperNumber,
      stage: data.stage,
      attempted_at: data.attemptedAt,
      score_raw: scoreRaw,
      score_max: scoreMax,
      time_taken_mins: data.timeTakenMins || null,
      notes: data.notes || null,
    })
    .eq('id', paperId)
    .eq('user_id', user.id)

  if (updateError) return { error: updateError.message }

  // Replace all question attempts
  const { error: delError } = await supabase
    .from('paper_question_attempts')
    .delete()
    .eq('paper_id', paperId)

  if (delError) return { error: delError.message }

  const { error: insError } = await supabase
    .from('paper_question_attempts')
    .insert(data.questions.map(q => ({
      paper_id: paperId,
      chapter_id: q.chapterId,
      question_number: q.questionNumber,
      marks_available: q.marksAvailable,
      marks_obtained: q.marksObtained,
    })))

  if (insError) return { error: insError.message }

  revalidatePath('/past-papers')
  revalidatePath(`/past-papers/${paperId}`)
  revalidatePath('/dashboard')
  revalidatePath(`/subjects/${data.subjectId}`)
  return {}
}

/**
 * Fetch papers with stage = NULL for the current user (legacy / untagged papers).
 */
export async function getUntaggedPapers(): Promise<PaperWithSubject[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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

/**
 * Assign a stage ('as' | 'a2') to a legacy paper whose stage was NULL.
 */
export async function assignPaperStage(
  paperId: string,
  stage: 'as' | 'a2'
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('past_papers')
    .update({ stage })
    .eq('id', paperId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/past-papers')
  revalidatePath('/dashboard')
  return {}
}
