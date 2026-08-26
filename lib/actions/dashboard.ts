'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
  StudyRoute,
  SubjectStage,
  UndoMissionResult,
} from '@/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MissionType =
  | 'complete_notes'
  | 'review_chapter'
  | 'attempt_paper'
  | 'revisit_weak_topic'
  | 'confidence_check'
export type MissionStatus = 'pending' | 'completed' | 'skipped'

export interface DailyMission {
  id: string
  user_id: string
  mission_date: string
  type: MissionType
  target_entity_type: 'chapter' | 'subject' | 'paper' | 'user'
  target_entity_id: string | null
  title: string
  description: string | null
  xp_reward: number
  status: MissionStatus
  completed_at: string | null
  generated_at: string
}

export interface SubjectReadiness {
  user_subject_id?: string
  subject_id: string
  subject_name: string
  color_hex: string
  exam_date: string | null
  days_until: number | null
  study_route: StudyRoute
  current_stage: SubjectStage | null
  as_readiness: number | null
  a2_readiness: number | null
  readiness: number | null
}

export interface DashboardData {
  profile: {
    username?: string | null
    full_name: string
    avatar_url: string | null
    total_xp: number
    current_level: number
    level_title: string
    timezone: string
  }
  streak: {
    current: number
    longest: number
    last_date: string | null
    active_today: boolean
  }
  has_exam_dates: boolean
  has_chapter_data: boolean
  has_unconfirmed_routes: boolean
  today_missions: DailyMission[]
  subject_readiness: SubjectReadiness[]
  recent_xp_events: { id: string; event_type: string; xp_amount: number; created_at: string }[]
}

export interface CompleteMissionResult {
  mission_xp: number
  daily_bonus_xp: number
  achievement_xp: number
  total_xp_awarded: number
  xp_awarded: number
  new_total_xp: number
  new_level: number
  level_title: string
  streak_days: number
  achievements_unlocked: { key: string; xp: number }[]
  levelled_up?: boolean
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Fetch all dashboard data in a single RPC round-trip.
 * Automatically generates today's missions if none exist.
 */
export async function getDashboardData(): Promise<DashboardData | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Fetch the dashboard and the one prerequisite the RPC does not expose.
  // Run both requests together so the extra check does not delay the page.
  const [statsResult, chapterResult] = await Promise.all([
    supabase.rpc('get_user_dashboard_stats', { p_user_id: user.id }),
    supabase
      .from('user_chapters')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ])

  const { data: stats, error } = statsResult

  if (error || !stats) {
    console.error('getDashboardData error:', error)
    return null
  }

  const missions: DailyMission[] = (stats.today_missions ?? []).filter((m: DailyMission) => m.status !== 'skipped')
  const subjectReadiness: SubjectReadiness[] = stats.subject_readiness ?? []
  const hasExamDates = stats.has_exam_dates ?? subjectReadiness.some(subject => subject.exam_date !== null)
  const hasChapterData = stats.has_chapter_data ?? (!chapterResult.error && (chapterResult.count ?? 0) > 0)
  const hasUnconfirmedRoutes = stats.has_unconfirmed_routes ?? subjectReadiness.some(s => s.study_route === 'unconfirmed')

  // Auto-generate missions if none exist for today
  if (missions.length === 0) {
    await supabase.rpc('generate_daily_missions', { p_user_id: user.id })
    // Re-fetch after generation
    const { data: refreshed } = await supabase.rpc('get_user_dashboard_stats', { p_user_id: user.id })
    if (refreshed) {
      const refreshedReadiness: SubjectReadiness[] = refreshed.subject_readiness ?? []
      return {
        profile:                refreshed.profile,
        streak:                 refreshed.streak,
        has_exam_dates:         refreshed.has_exam_dates ?? hasExamDates,
        has_chapter_data:       refreshed.has_chapter_data ?? hasChapterData,
        has_unconfirmed_routes: refreshed.has_unconfirmed_routes ?? refreshedReadiness.some(s => s.study_route === 'unconfirmed'),
        today_missions:         (refreshed.today_missions ?? []).filter((m: DailyMission) => m.status !== 'skipped'),
        subject_readiness:      refreshedReadiness,
        recent_xp_events:       refreshed.recent_xp_events ?? [],
      }
    }
  }

  return {
    profile:                stats.profile,
    streak:                 stats.streak,
    has_exam_dates:         hasExamDates,
    has_chapter_data:       hasChapterData,
    has_unconfirmed_routes: hasUnconfirmedRoutes,
    today_missions:         missions,
    subject_readiness:      subjectReadiness,
    recent_xp_events:       stats.recent_xp_events ?? [],
  }
}

/**
 * Mark a mission as complete.
 * Calls the complete_mission RPC which awards XP, updates streak,
 * and checks for achievement unlocks — all atomically.
 */
export async function completeMission(
  missionId: string
): Promise<{ result?: CompleteMissionResult; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase.rpc('complete_mission', {
    p_mission_id: missionId,
    p_user_id:    user.id,
  })

  if (error) return { error: error.message }

  revalidatePath('/dashboard')

  // Check if the user levelled up
  const { data: profile } = await supabase
    .from('profiles')
    .select('current_level')
    .eq('id', user.id)
    .single()

  const result: CompleteMissionResult = {
    ...data,
    levelled_up: (profile?.current_level ?? 0) > data?.new_level ? false : (data?.new_level ?? 0) > (profile?.current_level ?? 0),
  }

  return { result }
}

/**
 * Undo a completed mission within 10 minutes on the same local calendar day.
 * Calls undo_mission_completion RPC which restores mission status to pending,
 * reverses XP, and reverses all-missions-completed bonus if applicable.
 */
export async function undoMission(
  missionId: string
): Promise<{ result?: UndoMissionResult; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase.rpc('undo_mission_completion', {
    p_mission_id: missionId,
    p_user_id:    user.id,
  })

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return { result: data as UndoMissionResult }
}

/**
 * Manually trigger mission generation for today (e.g., from a button).
 */
export async function generateMissions(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.rpc('generate_daily_missions', { p_user_id: user.id })
  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return {}
}
