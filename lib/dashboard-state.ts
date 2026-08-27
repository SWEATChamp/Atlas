import type { DashboardData, CompleteMissionResult, DailyMission } from '@/lib/actions/dashboard'
import type { UndoMissionResult, ReplaceMissionResult } from '@/types/database'
import { computeLevelTitle } from '@/lib/xp'
import { dateInTimeZone } from '@/lib/date'

export interface ClientDashboardState {
  profile: DashboardData['profile']
  streak: DashboardData['streak']
  missions: DailyMission[]
}

/**
 * Apply atomic mission completion result to dashboard state.
 * Derives local completion date directly from completedAtIso.
 */
export function applyMissionCompletion(
  state: ClientDashboardState,
  missionId: string,
  result: CompleteMissionResult,
  completedAtIso: string = new Date().toISOString()
): ClientDashboardState {
  const localToday = dateInTimeZone(new Date(completedAtIso), state.profile.timezone)
  const newStreakDays = Number(result.streak_days ?? state.streak.current)

  const updatedMissions = state.missions.map((m) =>
    m.id === missionId
      ? { ...m, status: 'completed' as const, completed_at: completedAtIso }
      : m
  )

  const updatedProfile = {
    ...state.profile,
    total_xp: Number(result.new_total_xp),
    current_level: Number(result.new_level),
    level_title: result.level_title || computeLevelTitle(Number(result.new_level)),
  }

  const updatedStreak = {
    ...state.streak,
    current: newStreakDays,
    longest: Math.max(state.streak.longest, newStreakDays),
    active_today: true,
    last_date: localToday,
  }

  return {
    profile: updatedProfile,
    streak: updatedStreak,
    missions: updatedMissions,
  }
}

/**
 * Apply atomic mission undo result to dashboard state.
 *
 * Reconciles current streak, active_today, and last_date using client mission state:
 * - If other completed missions remain today: active_today remains true, last_date remains today.
 * - If no other completed missions remain: active_today is set to false, and last_date reverts
 *   to yesterday (if streak > 0) or null (if streak is 0).
 * - Historical longest streak is never decreased.
 * - Temporary limitation: Non-mission activity on the same day (e.g. past paper logged today)
 *   is reconciled via the subsequent background router.refresh() without requiring Migration 027.
 */
export function applyMissionUndo(
  state: ClientDashboardState,
  missionId: string,
  result: UndoMissionResult,
  undoAtIso: string = new Date().toISOString()
): ClientDashboardState {
  const newStreakDays = Number(result.streak_days ?? state.streak.current)
  const undoDate = new Date(undoAtIso)
  const localToday = dateInTimeZone(undoDate, state.profile.timezone)
  const yesterday = new Date(undoDate.getTime() - 86_400_000)
  const localYesterday = dateInTimeZone(yesterday, state.profile.timezone)

  const updatedMissions = state.missions.map((m) =>
    m.id === missionId
      ? { ...m, status: 'pending' as const, completed_at: null }
      : m
  )

  const updatedProfile = {
    ...state.profile,
    total_xp: Number(result.new_total_xp),
    current_level: Number(result.new_level),
    level_title: result.level_title || computeLevelTitle(Number(result.new_level)),
  }

  const hasOtherCompletedMissions = updatedMissions.some((m) => m.status === 'completed')

  const updatedStreak = {
    ...state.streak,
    current: newStreakDays,
    longest: state.streak.longest, // Never reduce historical longest streak
    active_today: hasOtherCompletedMissions,
    last_date: hasOtherCompletedMissions
      ? (state.streak.last_date || localToday)
      : newStreakDays > 0
      ? localYesterday
      : null,
  }

  return {
    profile: updatedProfile,
    streak: updatedStreak,
    missions: updatedMissions,
  }
}

/**
 * Apply atomic mission replace result to dashboard state.
 */
export function applyMissionReplace(
  state: ClientDashboardState,
  missionId: string,
  result: ReplaceMissionResult
): ClientDashboardState {
  return {
    ...state,
    missions: state.missions.map((m) =>
      m.id === missionId ? result.new_mission : m
    ),
  }
}
