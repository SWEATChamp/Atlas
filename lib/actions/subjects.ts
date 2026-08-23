'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Subject, UserSubject, Chapter, UserChapter } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubjectWithProgress {
  enrollment: UserSubject
  subject: Subject
  totalChapters: number
  completedChapters: number
  inProgressChapters: number
  avgConfidence: number | null
  paperAccuracy: number | null
  readiness: number
  daysUntilExam: number | null
}

export interface ChapterWithStatus {
  chapter: Chapter
  userChapter: UserChapter | null
  avgScore: number | null   // from paper_question_attempts, null = no data
}

export interface ComponentGroup {
  name: string
  chapters: ChapterWithStatus[]
}

export interface SubjectDetailData {
  subject: Subject
  enrollment: UserSubject
  groups: ComponentGroup[]
  totalChapters: number
  completedChapters: number
  inProgressChapters: number
  avgConfidence: number | null
  readiness: number
  daysUntilExam: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeReadiness(
  userChapters: Pick<UserChapter, 'notes_status' | 'confidence_level'>[],
  totalChapters: number,
  paperAccuracy: number
): number {
  if (totalChapters === 0) return 0

  // Notes score: complete=100%, in_progress=50%, none=0%
  const notesScore =
    (userChapters.reduce((acc, uc) => {
      if (uc.notes_status === 'complete') return acc + 1
      if (uc.notes_status === 'in_progress') return acc + 0.5
      return acc
    }, 0) /
      totalChapters) *
    100

  // Confidence score: avg confidence / 5 * 100
  const withConfidence = userChapters.filter((uc) => uc.confidence_level !== null)
  const confidenceScore =
    withConfidence.length > 0
      ? (withConfidence.reduce((acc, uc) => acc + (uc.confidence_level ?? 0), 0) /
          withConfidence.length /
          5) *
        100
      : 0

  return Math.round(notesScore * 0.35 + paperAccuracy * 0.4 + confidenceScore * 0.25)
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Get all enrolled subjects for the current user with computed progress stats.
 */
export async function getSubjectsWithProgress(): Promise<SubjectWithProgress[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // 1. Enrolled subjects
  const { data: enrollments } = await supabase
    .from('user_subjects')
    .select('*, subjects(*)')
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .order('priority')

  if (!enrollments?.length) return []

  const subjectIds = enrollments.map((e) => e.subject_id)

  // Batch 1: chapters + papers in parallel (both need only subjectIds)
  const [chaptersResult, papersResult] = await Promise.all([
    supabase
      .from('chapters')
      .select('id, subject_id')
      .in('subject_id', subjectIds),
    supabase
      .from('past_papers')
      .select('subject_id, accuracy_pct')
      .eq('user_id', user.id)
      .in('subject_id', subjectIds),
  ])

  const chapters   = chaptersResult.data ?? []
  const papers     = papersResult.data ?? []
  const chapterIds = chapters.map((c) => c.id)

  // Batch 2: user chapters (needs chapterIds from batch 1)
  const { data: userChapters } = chapterIds.length > 0
    ? await supabase
        .from('user_chapters')
        .select('chapter_id, notes_status, confidence_level')
        .eq('user_id', user.id)
        .in('chapter_id', chapterIds)
    : { data: [] }


  // Index for fast lookup
  const ucByChapter = new Map(
    (userChapters ?? []).map((uc) => [uc.chapter_id, uc])
  )
  const chaptersBySubject = new Map<string, string[]>()
  ;(chapters ?? []).forEach((c) => {
    const arr = chaptersBySubject.get(c.subject_id) ?? []
    arr.push(c.id)
    chaptersBySubject.set(c.subject_id, arr)
  })
  const papersBySubject = new Map<string, number[]>()
  ;(papers ?? []).forEach((p) => {
    const arr = papersBySubject.get(p.subject_id) ?? []
    arr.push(p.accuracy_pct)
    papersBySubject.set(p.subject_id, arr)
  })

  return enrollments.map((enrollment) => {
    const subject = enrollment.subjects as unknown as Subject
    const chIds = chaptersBySubject.get(enrollment.subject_id) ?? []
    const ucs = chIds
      .map((id) => ucByChapter.get(id))
      .filter(Boolean) as Pick<UserChapter, 'notes_status' | 'confidence_level'>[]

    const totalChapters = chIds.length
    const completedChapters = ucs.filter((uc) => uc.notes_status === 'complete').length
    const inProgressChapters = ucs.filter((uc) => uc.notes_status === 'in_progress').length

    const paperAccuracyArr = papersBySubject.get(enrollment.subject_id) ?? []
    const paperAccuracy =
      paperAccuracyArr.length > 0
        ? paperAccuracyArr.reduce((a, b) => a + b, 0) / paperAccuracyArr.length
        : 0

    const withConfidence = ucs.filter((uc) => uc.confidence_level !== null)
    const avgConfidence =
      withConfidence.length > 0
        ? withConfidence.reduce((acc, uc) => acc + (uc.confidence_level ?? 0), 0) /
          withConfidence.length
        : null

    const readiness = computeReadiness(ucs, totalChapters, paperAccuracy)

    return {
      enrollment: enrollment as unknown as UserSubject,
      subject,
      totalChapters,
      completedChapters,
      inProgressChapters,
      avgConfidence,
      paperAccuracy,
      readiness,
      daysUntilExam: daysUntil(enrollment.exam_date),
    }
  })
}

/**
 * Get full detail for one subject including chapters grouped by component.
 */
export async function getSubjectDetail(
  subjectId: string
): Promise<SubjectDetailData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Subject info
  const { data: subject } = await supabase
    .from('subjects')
    .select('*')
    .eq('id', subjectId)
    .single()
  if (!subject) return null

  // Enrollment
  const { data: enrollment } = await supabase
    .from('user_subjects')
    .select('*')
    .eq('user_id', user.id)
    .eq('subject_id', subjectId)
    .single()
  if (!enrollment) return null

  // All chapters for this subject
  const { data: chapters } = await supabase
    .from('chapters')
    .select('*')
    .eq('subject_id', subjectId)
    .order('number')

  if (!chapters?.length) {
    return {
      subject: subject as Subject,
      enrollment: enrollment as UserSubject,
      groups: [],
      totalChapters: 0,
      completedChapters: 0,
      inProgressChapters: 0,
      avgConfidence: null,
      readiness: 0,
      daysUntilExam: daysUntil(enrollment.exam_date),
    }
  }

  const chapterIds = chapters.map((c) => c.id)

  // Fetch user chapters + paper accuracy in parallel
  const [userChaptersResult, paperIdsResult] = await Promise.all([
    supabase
      .from('user_chapters')
      .select('*')
      .eq('user_id', user.id)
      .in('chapter_id', chapterIds),
    supabase
      .from('past_papers')
      .select('id, accuracy_pct')
      .eq('user_id', user.id)
      .eq('subject_id', subjectId),
  ])

  const userChapters = userChaptersResult.data ?? []
  const paperRows = paperIdsResult.data ?? []
  const paperAccuracy = paperRows.length
    ? paperRows.reduce((a, p) => a + p.accuracy_pct, 0) / paperRows.length
    : 0

  // Fetch question attempts for those papers (chapter-level accuracy)
  const chapterAccuracyMap = new Map<string, { obtained: number; available: number }>()
  if (paperRows.length > 0) {
    const { data: attempts } = await supabase
      .from('paper_question_attempts')
      .select('chapter_id, marks_obtained, marks_available')
      .in('paper_id', paperRows.map(p => p.id))
      .not('chapter_id', 'is', null)
    for (const q of attempts ?? []) {
      if (!q.chapter_id) continue
      const s = chapterAccuracyMap.get(q.chapter_id) ?? { obtained: 0, available: 0 }
      s.obtained  += q.marks_obtained
      s.available += q.marks_available
      chapterAccuracyMap.set(q.chapter_id, s)
    }
  }

  const ucMap = new Map(userChapters.map((uc) => [uc.chapter_id, uc]))

  // Group chapters by component, attaching avgScore from question attempts
  const groupMap = new Map<string, ChapterWithStatus[]>()
  chapters.forEach((chapter) => {
    const key = chapter.component ?? 'General'
    const arr = groupMap.get(key) ?? []
    const stats = chapterAccuracyMap.get(chapter.id)
    const avgScore = stats && stats.available > 0
      ? (stats.obtained / stats.available) * 100
      : null
    arr.push({
      chapter: chapter as Chapter,
      userChapter: (ucMap.get(chapter.id) as UserChapter) ?? null,
      avgScore,
    })
    groupMap.set(key, arr)
  })

  const groups: ComponentGroup[] = Array.from(groupMap.entries()).map(
    ([name, chs]) => ({ name, chapters: chs })
  )

  const allUcs = userChapters as UserChapter[]
  const completedChapters  = allUcs.filter((uc) => uc.notes_status === 'complete').length
  const inProgressChapters = allUcs.filter((uc) => uc.notes_status === 'in_progress').length
  const withConfidence = allUcs.filter((uc) => uc.confidence_level !== null)
  const avgConfidence = withConfidence.length > 0
    ? withConfidence.reduce((acc, uc) => acc + (uc.confidence_level ?? 0), 0) / withConfidence.length
    : null

  const readiness = computeReadiness(allUcs, chapters.length, paperAccuracy)

  return {
    subject: subject as Subject,
    enrollment: enrollment as UserSubject,
    groups,
    totalChapters: chapters.length,
    completedChapters,
    inProgressChapters,
    avgConfidence,
    readiness,
    daysUntilExam: daysUntil(enrollment.exam_date),
  }
}

/**
 * Update the target grade for an enrolled subject.
 */
export async function updateTargetGrade(
  subjectId: string,
  grade: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('user_subjects')
    .update({ target_grade: grade })
    .eq('user_id', user.id)
    .eq('subject_id', subjectId)

  if (error) return { error: error.message }

  revalidatePath(`/subjects/${subjectId}`)
  revalidatePath('/subjects')
  return {}
}

const ExamDateUpdateSchema = z.object({
  subjectId: z.string().uuid(),
  examDate: z.string().date('Enter a valid exam date'),
})

/**
 * Update the exam date for an enrolled subject.
 */
export async function updateExamDate(
  subjectId: string,
  examDate: string
): Promise<{ error?: string }> {
  const parsed = ExamDateUpdateSchema.safeParse({ subjectId, examDate })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('user_subjects')
    .update({ exam_date: parsed.data.examDate })
    .eq('user_id', user.id)
    .eq('subject_id', parsed.data.subjectId)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Subject enrollment not found' }

  revalidatePath(`/subjects/${parsed.data.subjectId}`)
  revalidatePath('/subjects')
  revalidatePath('/dashboard')
  return {}
}
