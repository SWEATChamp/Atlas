'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { daysUntilDate } from '@/lib/date'
import type {
  Subject,
  UserSubject,
  Chapter,
  UserChapter,
  SubjectPaperSelection,
  SubjectStageResult,
} from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubjectWithProgress {
  enrollment: UserSubject
  subject: Subject
  totalChapters: number
  completedChapters: number
  inProgressChapters: number
  avgConfidence: number | null
  paperAccuracy: number | null
  as_readiness: number | null
  a2_readiness: number | null
  readiness: number | null
  daysUntilExam: number | null
}

export interface ChapterWithStatus {
  chapter: Chapter
  userChapter: UserChapter | null
  avgScore: number | null   // from paper_question_attempts, null = no data
  isAccessible?: boolean
}

export interface ComponentGroup {
  name: string
  chapters: ChapterWithStatus[]
}

export interface SubjectDetailData {
  subject: Subject
  enrollment: UserSubject
  groups: ComponentGroup[]
  paperSelections: SubjectPaperSelection[]
  stageResults: SubjectStageResult[]
  totalChapters: number
  completedChapters: number
  inProgressChapters: number
  avgConfidence: number | null
  as_readiness: number | null
  a2_readiness: number | null
  readiness: number | null
  daysUntilExam: number | null
}

export interface SubjectEnrollmentMutationResult {
  error?: string
  enrollmentId?: string
  skippedMissions?: number
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Get all enrolled subjects for the current user with database-computed progress stats.
 */
export async function getSubjectsWithProgress(): Promise<SubjectWithProgress[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // 1. Enrolled subjects
  const [enrollmentsResult, profileResult] = await Promise.all([
    supabase
      .from('user_subjects')
      .select('*, subjects(*)')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('priority'),
    supabase
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .single(),
  ])

  const enrollments = enrollmentsResult.data
  const timeZone = profileResult.data?.timezone ?? 'UTC'

  if (!enrollments?.length) return []

  const subjectIds = enrollments.map((e) => e.subject_id)

  // Batch 1: chapters + papers in parallel
  const [chaptersResult, papersResult] = await Promise.all([
    supabase
      .from('chapters')
      .select('id, subject_id')
      .in('subject_id', subjectIds)
      .eq('is_active', true),
    supabase
      .from('past_papers')
      .select('subject_id, accuracy_pct')
      .eq('user_id', user.id)
      .in('subject_id', subjectIds),
  ])

  const chapters = chaptersResult.data ?? []
  const papers = papersResult.data ?? []
  const chapterIds = chapters.map((c) => c.id)

  // Batch 2: user chapters
  const { data: userChapters } = chapterIds.length > 0
    ? await supabase
        .from('user_chapters')
        .select('chapter_id, notes_status, confidence_level')
        .eq('user_id', user.id)
        .in('chapter_id', chapterIds)
    : { data: [] }

  // Batch 3: DB readiness scores for each enrolled subject
  const readinessResults = await Promise.all(
    enrollments.map(async (enrollment) => {
      const studyRoute = enrollment.study_route
      const currentStage = enrollment.current_stage

      if (studyRoute === 'unconfirmed') {
        return { asScore: null, a2Score: null, legacyScore: null }
      }

      const [asResult, a2Result] = await Promise.all([
        supabase.rpc('compute_readiness_score', {
          p_user_id: user.id,
          p_subject_id: enrollment.subject_id,
          p_stage: 'as',
        }),
        studyRoute === 'full_level' || (studyRoute === 'staged' && currentStage === 'a2')
          ? supabase.rpc('compute_readiness_score', {
              p_user_id: user.id,
              p_subject_id: enrollment.subject_id,
              p_stage: 'a2',
            })
          : Promise.resolve({ data: null, error: null }),
      ])

      const asScore = typeof asResult.data === 'number' ? asResult.data : null
      const a2Score = typeof a2Result.data === 'number' ? a2Result.data : null

      // Legacy readiness display rule:
      // - as_only & staged/as -> asScore
      // - staged/a2 -> asScore (primary context)
      // - full_level -> null (do not silently choose one stage)
      const legacyScore = studyRoute === 'full_level' ? null : asScore

      return { asScore, a2Score, legacyScore }
    })
  )

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

  return enrollments.map((enrollment, idx) => {
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
        : null

    const withConfidence = ucs.filter((uc) => uc.confidence_level !== null)
    const avgConfidence =
      withConfidence.length > 0
        ? withConfidence.reduce((acc, uc) => acc + (uc.confidence_level ?? 0), 0) /
          withConfidence.length
        : null

    const { asScore, a2Score, legacyScore } = readinessResults[idx]

    return {
      enrollment: enrollment as unknown as UserSubject,
      subject,
      totalChapters,
      completedChapters,
      inProgressChapters,
      avgConfidence,
      paperAccuracy,
      as_readiness: asScore,
      a2_readiness: a2Score,
      readiness: legacyScore,
      daysUntilExam: daysUntilDate(enrollment.exam_date, timeZone),
    }
  })
}

/**
 * Get the supported global subjects that may be added from the Subjects page.
 */
export async function getAvailableMvpSubjects(): Promise<Subject[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('is_global', true)
    .eq('is_available', true)
    .order('name')

  if (error || !data) return []
  return data as Subject[]
}

/**
 * Get full detail for one subject including chapters grouped by component,
 * stage readiness scores, paper selections, and stage results.
 */
export async function getSubjectDetail(
  subjectId: string
): Promise<SubjectDetailData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [subjectResult, enrollmentResult, profileResult] = await Promise.all([
    supabase
      .from('subjects')
      .select('*')
      .eq('id', subjectId)
      .single(),
    supabase
      .from('user_subjects')
      .select('*')
      .eq('user_id', user.id)
      .eq('subject_id', subjectId)
      .eq('is_archived', false)
      .single(),
    supabase
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .single(),
  ])

  const subject = subjectResult.data
  if (!subject) return null

  const enrollment = enrollmentResult.data
  if (!enrollment) return null
  const timeZone = profileResult.data?.timezone ?? 'UTC'

  // Fetch chapters, paper selections, stage results in parallel
  const [chaptersResult, paperSelectionsResult, stageResultsResult] = await Promise.all([
    supabase
      .from('chapters')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('is_active', true)
      .order('number'),
    supabase
      .from('subject_paper_selections')
      .select('*')
      .eq('user_subject_id', enrollment.id),
    supabase
      .from('subject_stage_results')
      .select('*')
      .eq('user_subject_id', enrollment.id)
      .order('created_at', { ascending: false }),
  ])

  const chapters = chaptersResult.data ?? []
  const paperSelections = (paperSelectionsResult.data ?? []) as SubjectPaperSelection[]
  const stageResults = (stageResultsResult.data ?? []) as SubjectStageResult[]

  if (!chapters.length) {
    return {
      subject: subject as Subject,
      enrollment: enrollment as UserSubject,
      groups: [],
      paperSelections,
      stageResults,
      totalChapters: 0,
      completedChapters: 0,
      inProgressChapters: 0,
      avgConfidence: null,
      as_readiness: null,
      a2_readiness: null,
      readiness: null,
      daysUntilExam: daysUntilDate(enrollment.exam_date, timeZone),
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

  // Fetch question attempts for chapter accuracy
  const chapterAccuracyMap = new Map<string, { obtained: number; available: number }>()
  if (paperRows.length > 0) {
    const { data: attempts } = await supabase
      .from('paper_question_attempts')
      .select('chapter_id, marks_obtained, marks_available')
      .in('paper_id', paperRows.map((p) => p.id))
      .not('chapter_id', 'is', null)
    for (const q of attempts ?? []) {
      if (!q.chapter_id) continue
      const s = chapterAccuracyMap.get(q.chapter_id) ?? { obtained: 0, available: 0 }
      s.obtained += q.marks_obtained
      s.available += q.marks_available
      chapterAccuracyMap.set(q.chapter_id, s)
    }
  }

  const ucMap = new Map(userChapters.map((uc) => [uc.chapter_id, uc]))

  // Group chapters by component
  const groupMap = new Map<string, ChapterWithStatus[]>()
  chapters.forEach((chapter) => {
    const key = chapter.component ?? 'General'
    const arr = groupMap.get(key) ?? []
    const stats = chapterAccuracyMap.get(chapter.id)
    const avgScore = stats && stats.available > 0
      ? (stats.obtained / stats.available) * 100
      : null

    // Determine accessibility
    const studyRoute = enrollment.study_route
    const currentStage = enrollment.current_stage
    let isAccessible = false
    if (studyRoute !== 'unconfirmed' && chapter.stage) {
      if (chapter.stage === 'as' || chapter.stage === 'shared') {
        isAccessible = true
      } else if (chapter.stage === 'a2') {
        isAccessible = currentStage === 'a2' || currentStage === 'full'
      } else if (chapter.stage === 'route_dependent') {
        const sel = paperSelections.find((s) => s.component_name === chapter.component)
        if (sel) {
          if (sel.stage === 'as') isAccessible = true
          else if (sel.stage === 'a2') isAccessible = currentStage === 'a2' || currentStage === 'full'
        }
      }
    }

    arr.push({
      chapter: chapter as Chapter,
      userChapter: (ucMap.get(chapter.id) as UserChapter) ?? null,
      avgScore,
      isAccessible,
    })
    groupMap.set(key, arr)
  })

  const groups: ComponentGroup[] = Array.from(groupMap.entries()).map(
    ([name, chs]) => ({ name, chapters: chs })
  )

  const allUcs = userChapters as UserChapter[]
  const completedChapters = allUcs.filter((uc) => uc.notes_status === 'complete').length
  const inProgressChapters = allUcs.filter((uc) => uc.notes_status === 'in_progress').length
  const withConfidence = allUcs.filter((uc) => uc.confidence_level !== null)
  const avgConfidence = withConfidence.length > 0
    ? withConfidence.reduce((acc, uc) => acc + (uc.confidence_level ?? 0), 0) / withConfidence.length
    : null

  // Compute database readiness scores
  let asScore: number | null = null
  let a2Score: number | null = null
  let legacyScore: number | null = null

  if (enrollment.study_route !== 'unconfirmed') {
    const [asRpc, a2Rpc] = await Promise.all([
      supabase.rpc('compute_readiness_score', {
        p_user_id: user.id,
        p_subject_id: subjectId,
        p_stage: 'as',
      }),
      enrollment.study_route === 'full_level' || (enrollment.study_route === 'staged' && enrollment.current_stage === 'a2')
        ? supabase.rpc('compute_readiness_score', {
            p_user_id: user.id,
            p_subject_id: subjectId,
            p_stage: 'a2',
          })
        : Promise.resolve({ data: null, error: null }),
    ])

    asScore = typeof asRpc.data === 'number' ? asRpc.data : null
    a2Score = typeof a2Rpc.data === 'number' ? a2Rpc.data : null
    legacyScore = enrollment.study_route === 'full_level' ? null : asScore
  }

  return {
    subject: subject as Subject,
    enrollment: enrollment as UserSubject,
    groups,
    paperSelections,
    stageResults,
    totalChapters: chapters.length,
    completedChapters,
    inProgressChapters,
    avgConfidence,
    as_readiness: asScore,
    a2_readiness: a2Score,
    readiness: legacyScore,
    daysUntilExam: daysUntilDate(enrollment.exam_date, timeZone),
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
    .eq('is_archived', false)

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
    .eq('is_archived', false)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Subject enrollment not found' }

  revalidatePath(`/subjects/${parsed.data.subjectId}`)
  revalidatePath('/subjects')
  revalidatePath('/dashboard')
  return {}
}

const SubjectIdSchema = z.string().uuid('Invalid subject')

/**
 * Add a supported MVP subject or restore its archived enrollment.
 */
export async function addSubjectEnrollment(
  subjectId: string
): Promise<SubjectEnrollmentMutationResult> {
  const parsed = SubjectIdSchema.safeParse(subjectId)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in again to add a subject.' }

  const { data, error } = await supabase.rpc('add_subject_enrollment', {
    p_user_id: user.id,
    p_subject_id: parsed.data,
  })

  if (error) return { error: error.message }

  revalidatePath('/subjects')
  revalidatePath('/dashboard')
  revalidatePath('/past-papers')
  return { enrollmentId: typeof data === 'string' ? data : undefined }
}

/**
 * Archive an active subject after the client has shown an explicit confirmation.
 */
export async function archiveSubjectEnrollment(
  userSubjectId: string
): Promise<SubjectEnrollmentMutationResult> {
  const parsed = SubjectIdSchema.safeParse(userSubjectId)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in again to remove a subject.' }

  const { data, error } = await supabase.rpc('archive_subject_enrollment', {
    p_user_id: user.id,
    p_user_subject_id: parsed.data,
  })

  if (error) return { error: error.message }

  revalidatePath('/subjects')
  revalidatePath('/dashboard')
  revalidatePath('/past-papers')
  return { skippedMissions: typeof data === 'number' ? data : undefined }
}
