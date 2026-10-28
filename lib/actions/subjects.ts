'use server'

import { cache } from 'react'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedContext, getCurrentProfile } from '@/lib/supabase/authenticated'
import { daysUntilDate } from '@/lib/date'
import { markWeightedScores } from '@/lib/practice-analytics'
import type {
  Subject,
  UserSubject,
  Chapter,
  UserChapter,
  SubjectPaperSelection,
  SubjectStageResult,
} from '@/types'
import {
  buildChapterPaperMap,
  assembleComponentGroups,
  resolveChapterAccessibility,
  type ComponentGroup,
} from '@/lib/subject-chapters'

export type { ChapterWithStatus, ComponentGroup } from '@/lib/subject-chapters'

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
  const [{ supabase, user }, profile] = await Promise.all([
    getAuthenticatedContext(),
    getCurrentProfile(),
  ])
  if (!user) return []

  // 1. Enrolled subjects
  const dashboardPromise = supabase.rpc('get_user_dashboard_stats', {
    p_user_id: user.id,
  })
  const enrollmentsResult = await supabase
    .from('user_subjects')
    .select('*, subjects(*)')
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .order('priority')

  if (enrollmentsResult.error) {
    console.error('[getSubjectsWithProgress] Failed to fetch enrollments:', enrollmentsResult.error)
    throw new Error('Failed to load enrolled subjects')
  }

  const enrollments = enrollmentsResult.data ?? []
  const timeZone = profile?.timezone ?? 'UTC'

  if (!enrollments.length) return []

  const subjectIds = enrollments.map((e) => e.subject_id)
  const userSubjectIds = enrollments.map((e) => e.id)

  // Batch 1: chapters, papers, dashboard stats, and paper selections in parallel
  const [chaptersResult, papersResult, dashboardResult, paperSelectionsResult] = await Promise.all([
    supabase
      .from('chapters')
      .select('id, subject_id, stage, component')
      .in('subject_id', subjectIds)
      .eq('is_active', true),
    supabase
      .from('past_papers')
      .select('subject_id, score_raw, score_max')
      .eq('user_id', user.id)
      .in('subject_id', subjectIds),
    dashboardPromise,
    supabase
      .from('subject_paper_selections')
      .select('*')
      .in('user_subject_id', userSubjectIds),
  ])

  if (chaptersResult.error) {
    console.error('[getSubjectsWithProgress] Failed to fetch chapters:', chaptersResult.error)
    throw new Error('Failed to load chapters')
  }
  if (papersResult.error) {
    console.error('[getSubjectsWithProgress] Failed to fetch past papers:', papersResult.error)
    throw new Error('Failed to load past papers')
  }
  if (dashboardResult.error) {
    console.error('[getSubjectsWithProgress] Failed to fetch dashboard stats:', dashboardResult.error)
    throw new Error('Failed to load readiness scores')
  }
  if (paperSelectionsResult.error) {
    console.error('[getSubjectsWithProgress] Failed to fetch paper selections:', paperSelectionsResult.error)
    throw new Error('Failed to load paper selections')
  }

  const chapters = chaptersResult.data ?? []
  const papers = papersResult.data ?? []
  const paperSelections = (paperSelectionsResult.data ?? []) as SubjectPaperSelection[]
  const chapterIds = chapters.map((c) => c.id)

  // Batch 2: user chapters and chapter_papers in parallel
  const [userChaptersResult, chapterPapersResult] = await Promise.all([
    chapterIds.length > 0
      ? supabase
          .from('user_chapters')
          .select('chapter_id, notes_status, confidence_level')
          .eq('user_id', user.id)
          .in('chapter_id', chapterIds)
      : Promise.resolve({ data: [], error: null }),
    chapterIds.length > 0
      ? supabase
          .from('chapter_papers')
          .select('chapter_id, subject_paper_id')
          .in('chapter_id', chapterIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (userChaptersResult.error) {
    console.error('[getSubjectsWithProgress] Failed to fetch user chapters:', userChaptersResult.error)
    throw new Error('Failed to load chapter progress')
  }
  if (chapterPapersResult.error) {
    console.error('[getSubjectsWithProgress] Failed to fetch chapter papers:', chapterPapersResult.error)
    throw new Error('Failed to load chapter paper links')
  }

  const userChapters = userChaptersResult.data ?? []
  const chapterPaperMap = buildChapterPaperMap(chapterPapersResult.data, chapters as Chapter[])

  type ReadinessRow = {
    subject_id: string
    as_readiness: number | null
    a2_readiness: number | null
    readiness: number | null
  }
  const readinessRows = Array.isArray(dashboardResult.data?.subject_readiness)
    ? dashboardResult.data.subject_readiness as ReadinessRow[]
    : []
  const readinessBySubject = new Map(
    readinessRows.map((row) => [row.subject_id, row])
  )

  // Index for fast lookup
  const chaptersBySubject = new Map<string, typeof chapters>()
  chapters.forEach((c) => {
    const arr = chaptersBySubject.get(c.subject_id) ?? []
    arr.push(c)
    chaptersBySubject.set(c.subject_id, arr)
  })
  const selectionsByEnrollment = new Map<string, SubjectPaperSelection[]>()
  paperSelections.forEach((sel) => {
    const arr = selectionsByEnrollment.get(sel.user_subject_id) ?? []
    arr.push(sel)
    selectionsByEnrollment.set(sel.user_subject_id, arr)
  })
  const papersBySubject = new Map<string, { score_raw: number; score_max: number }[]>()
  papers.forEach((p) => {
    const arr = papersBySubject.get(p.subject_id) ?? []
    arr.push({ score_raw: p.score_raw, score_max: p.score_max })
    papersBySubject.set(p.subject_id, arr)
  })

  return enrollments.map((enrollment) => {
    const subject = enrollment.subjects as unknown as Subject
    const subjectChapters = chaptersBySubject.get(enrollment.subject_id) ?? []
    const enrollmentSelections = selectionsByEnrollment.get(enrollment.id) ?? []

    // Accessible chapters only
    const accessibleChapters = subjectChapters.filter((chapter) =>
      resolveChapterAccessibility({
        chapterStage: chapter.stage,
        chapterComponent: chapter.component,
        studyRoute: enrollment.study_route,
        currentStage: enrollment.current_stage,
        paperSelections: enrollmentSelections,
        linkedPaperIds: chapterPaperMap.get(chapter.id) ?? [],
      })
    )

    const accessibleChapterIds = new Set(accessibleChapters.map((c) => c.id))
    const accessibleUcs = (userChapters ?? []).filter((uc) =>
      accessibleChapterIds.has(uc.chapter_id)
    )

    const totalChapters = accessibleChapters.length
    const completedChapters = accessibleUcs.filter((uc) => uc.notes_status === 'complete').length
    const inProgressChapters = accessibleUcs.filter((uc) => uc.notes_status === 'in_progress').length

    const paperAccuracy = markWeightedScores(papersBySubject.get(enrollment.subject_id) ?? [])

    const withConfidence = accessibleUcs.filter((uc) => uc.confidence_level !== null)
    const avgConfidence =
      withConfidence.length > 0
        ? withConfidence.reduce((acc, uc) => acc + (uc.confidence_level ?? 0), 0) /
          withConfidence.length
        : null

    const readinessRow = readinessBySubject.get(enrollment.subject_id)
    const asScore = typeof readinessRow?.as_readiness === 'number'
      ? readinessRow.as_readiness
      : null
    const a2Score = typeof readinessRow?.a2_readiness === 'number'
      ? readinessRow.a2_readiness
      : null
    const legacyScore = typeof readinessRow?.readiness === 'number'
      ? readinessRow.readiness
      : null

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
  const { supabase, user } = await getAuthenticatedContext()
  if (!user) return []

  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('is_global', true)
    .eq('is_available', true)
    .order('name')

  if (error) {
    console.error('[getAvailableMvpSubjects] Database error:', error)
    throw new Error('Failed to load available subjects')
  }
  return (data ?? []) as Subject[]
}

/**
 * Get full detail for one subject including chapters grouped by component,
 * stage readiness scores, paper selections, and stage results.
 */
export const getSubjectDetail = cache(async (
  subjectId: string
): Promise<SubjectDetailData | null> => {
  const [{ supabase, user }, profile] = await Promise.all([
    getAuthenticatedContext(),
    getCurrentProfile(),
  ])
  if (!user) return null

  const [subjectResult, enrollmentResult] = await Promise.all([
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
  ])

  // Distinguish legitimate missing records (PGRST116: 0 rows) from database query failures
  if (subjectResult.error) {
    if (subjectResult.error.code === 'PGRST116') {
      return null
    }
    console.error('[getSubjectDetail] Database error fetching subject:', subjectResult.error)
    throw new Error('Failed to load subject')
  }

  if (enrollmentResult.error) {
    if (enrollmentResult.error.code === 'PGRST116') {
      return null
    }
    console.error('[getSubjectDetail] Database error fetching enrollment:', enrollmentResult.error)
    throw new Error('Failed to load enrollment')
  }

  const subject = subjectResult.data
  if (!subject) return null

  const enrollment = enrollmentResult.data
  if (!enrollment) return null
  const timeZone = profile?.timezone ?? 'UTC'

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

  if (chaptersResult.error) {
    console.error('[getSubjectDetail] Database error fetching chapters:', chaptersResult.error)
    throw new Error('Failed to load chapters')
  }
  if (paperSelectionsResult.error) {
    console.error('[getSubjectDetail] Database error fetching paper selections:', paperSelectionsResult.error)
    throw new Error('Failed to load paper selections')
  }
  if (stageResultsResult.error) {
    console.error('[getSubjectDetail] Database error fetching stage results:', stageResultsResult.error)
    throw new Error('Failed to load stage results')
  }

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

  // Fetch user chapters + paper accuracy + chapter_papers in parallel
  const [userChaptersResult, paperIdsResult, chapterPapersResult] = await Promise.all([
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
    supabase
      .from('chapter_papers')
      .select('chapter_id, subject_paper_id')
      .in('chapter_id', chapterIds),
  ])

  if (userChaptersResult.error) {
    console.error('[getSubjectDetail] Database error fetching user chapters:', userChaptersResult.error)
    throw new Error('Failed to load chapter progress')
  }
  if (paperIdsResult.error) {
    console.error('[getSubjectDetail] Database error fetching past papers:', paperIdsResult.error)
    throw new Error('Failed to load past papers')
  }
  if (chapterPapersResult.error) {
    console.error('[getSubjectDetail] Database error fetching chapter papers:', chapterPapersResult.error)
    throw new Error('Failed to load chapter paper links')
  }

  const userChapters = userChaptersResult.data ?? []
  const paperRows = paperIdsResult.data ?? []

  // Index chapter_papers by chapter_id using pure helper
  const chapterPaperMap = buildChapterPaperMap(chapterPapersResult.data, chapters as Chapter[])

  // Fetch question attempts for chapter accuracy
  const chapterAccuracyMap = new Map<string, { obtained: number; available: number }>()
  if (paperRows.length > 0) {
    const attemptsResult = await supabase
      .from('paper_question_attempts')
      .select('chapter_id, marks_obtained, marks_available')
      .in('paper_id', paperRows.map((p) => p.id))
      .not('chapter_id', 'is', null)

    if (attemptsResult.error) {
      console.error('[getSubjectDetail] Database error fetching question attempts:', attemptsResult.error)
      throw new Error('Failed to load question attempts')
    }

    for (const q of attemptsResult.data ?? []) {
      if (!q.chapter_id) continue
      const s = chapterAccuracyMap.get(q.chapter_id) ?? { obtained: 0, available: 0 }
      s.obtained += q.marks_obtained
      s.available += q.marks_available
      chapterAccuracyMap.set(q.chapter_id, s)
    }
  }

  // Assemble component groups using pure helper
  const groups: ComponentGroup[] = assembleComponentGroups({
    chapters: chapters as Chapter[],
    userChapters: userChapters as UserChapter[],
    chapterPaperMap,
    chapterAccuracyMap,
    enrollment,
    paperSelections,
  })

  // Summary aggregation using ONLY accessible chapters
  const allGroupChapters = groups.flatMap((g) => g.chapters)
  const accessibleGroupChapters = allGroupChapters.filter((c) => c.isAccessible)

  const totalChapters = accessibleGroupChapters.length
  const completedChapters = accessibleGroupChapters.filter(
    (c) => c.userChapter?.notes_status === 'complete'
  ).length
  const inProgressChapters = accessibleGroupChapters.filter(
    (c) => c.userChapter?.notes_status === 'in_progress'
  ).length
  const withConfidence = accessibleGroupChapters
    .map((c) => c.userChapter?.confidence_level)
    .filter((lvl): lvl is number => typeof lvl === 'number')
  const avgConfidence =
    withConfidence.length > 0
      ? withConfidence.reduce((acc, lvl) => acc + lvl, 0) / withConfidence.length
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

    if (asRpc.error) {
      console.error('[getSubjectDetail] RPC error computing AS readiness:', asRpc.error)
      throw new Error('Failed to compute readiness score')
    }
    if (a2Rpc.error) {
      console.error('[getSubjectDetail] RPC error computing A2 readiness:', a2Rpc.error)
      throw new Error('Failed to compute readiness score')
    }

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
    totalChapters,
    completedChapters,
    inProgressChapters,
    avgConfidence,
    as_readiness: asScore,
    a2_readiness: a2Score,
    readiness: legacyScore,
    daysUntilExam: daysUntilDate(enrollment.exam_date, timeZone),
  }
})

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
  revalidatePath('/logs')
  revalidatePath('/stats')
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
  revalidatePath('/logs')
  revalidatePath('/stats')
  return { skippedMissions: typeof data === 'number' ? data : undefined }
}
