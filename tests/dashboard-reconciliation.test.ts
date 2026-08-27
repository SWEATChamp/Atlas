import { describe, expect, test } from 'vitest'
import {
  applyMissionCompletion,
  applyMissionUndo,
  applyMissionReplace,
  type ClientDashboardState,
} from '../lib/dashboard-state'
import type { CompleteMissionResult } from '../lib/actions/dashboard'
import type { DailyMission, UndoMissionResult, ReplaceMissionResult } from '../types/database'

describe('client dashboard state reconciliation', () => {
  const baseMission1: DailyMission = {
    id: 'm-1',
    user_id: 'u-1',
    mission_date: '2026-08-27',
    type: 'complete_notes',
    target_entity_type: 'chapter',
    target_entity_id: 'ch-1',
    subject_paper_id: null,
    title: 'Complete Algebra Notes',
    description: null,
    xp_reward: 50,
    status: 'pending',
    difficulty: 'easy',
    estimated_minutes: 30,
    skip_reason: null,
    skipped_at: null,
    completed_at: null,
    generated_at: '2026-08-27T00:00:00.000Z',
  }

  const baseMission2: DailyMission = {
    id: 'm-2',
    user_id: 'u-1',
    mission_date: '2026-08-27',
    type: 'review_chapter',
    target_entity_type: 'chapter',
    target_entity_id: 'ch-2',
    subject_paper_id: null,
    title: 'Review Vectors',
    description: null,
    xp_reward: 30,
    status: 'pending',
    difficulty: 'easy',
    estimated_minutes: 20,
    skip_reason: null,
    skipped_at: null,
    completed_at: null,
    generated_at: '2026-08-27T00:00:00.000Z',
  }

  const initialState: ClientDashboardState = {
    profile: {
      username: 'student',
      full_name: 'Student Name',
      avatar_url: null,
      total_xp: 80,
      current_level: 1,
      level_title: 'Initiate',
      timezone: 'UTC',
    },
    streak: {
      current: 2,
      longest: 5,
      last_date: '2026-08-26',
      active_today: false,
    },
    missions: [baseMission1, baseMission2],
  }

  test('applies mission completion and calculates local completion date from completedAtIso', () => {
    const completionResult: CompleteMissionResult = {
      mission_xp: 50,
      daily_bonus_xp: 0,
      achievement_xp: 0,
      total_xp_awarded: 50,
      xp_awarded: 50,
      new_total_xp: 130,
      new_level: 2,
      level_title: 'Learner',
      streak_days: 3,
      achievements_unlocked: [],
      levelled_up: true,
    }

    const nextState = applyMissionCompletion(
      initialState,
      'm-1',
      completionResult,
      '2026-08-27T05:00:00.000Z'
    )

    // Check mission status
    expect(nextState.missions.find((m) => m.id === 'm-1')?.status).toBe('completed')
    expect(nextState.missions.find((m) => m.id === 'm-1')?.completed_at).toBe('2026-08-27T05:00:00.000Z')
    expect(nextState.missions.find((m) => m.id === 'm-2')?.status).toBe('pending')

    // Check profile
    expect(nextState.profile.total_xp).toBe(130)
    expect(nextState.profile.current_level).toBe(2)
    expect(nextState.profile.level_title).toBe('Learner')

    // Check streak
    expect(nextState.streak.current).toBe(3)
    expect(nextState.streak.longest).toBe(5) // existing longest 5 > 3
    expect(nextState.streak.active_today).toBe(true)
    expect(nextState.streak.last_date).toBe('2026-08-27')
  })

  test('updates longest streak if current streak exceeds previous longest during completion', () => {
    const stateWithHighStreak: ClientDashboardState = {
      ...initialState,
      streak: { current: 5, longest: 5, last_date: '2026-08-26', active_today: false },
    }

    const completionResult: CompleteMissionResult = {
      mission_xp: 50,
      daily_bonus_xp: 0,
      achievement_xp: 0,
      total_xp_awarded: 50,
      xp_awarded: 50,
      new_total_xp: 130,
      new_level: 2,
      level_title: 'Learner',
      streak_days: 6,
      achievements_unlocked: [],
    }

    const nextState = applyMissionCompletion(
      stateWithHighStreak,
      'm-1',
      completionResult,
      '2026-08-27T05:00:00.000Z'
    )
    expect(nextState.streak.current).toBe(6)
    expect(nextState.streak.longest).toBe(6)
    expect(nextState.streak.active_today).toBe(true)
    expect(nextState.streak.last_date).toBe('2026-08-27')
  })

  test('applies mission undo and reverses status, XP, level, and active_today when no other missions remain', () => {
    const completedState: ClientDashboardState = {
      profile: {
        username: 'student',
        full_name: 'Student Name',
        avatar_url: null,
        total_xp: 130,
        current_level: 2,
        level_title: 'Learner',
        timezone: 'UTC',
      },
      streak: {
        current: 3,
        longest: 5,
        last_date: '2026-08-27',
        active_today: true,
      },
      missions: [
        { ...baseMission1, status: 'completed', completed_at: '2026-08-27T05:00:00.000Z' },
        baseMission2,
      ],
    }

    const undoResult: UndoMissionResult = {
      xp_reversed: 50,
      mission_xp_reversed: 50,
      daily_bonus_xp_reversed: 0,
      achievement_xp_reversed: 0,
      streak_bonus_xp_reversed: 0,
      new_total_xp: 80,
      new_level: 1,
      level_title: 'Initiate',
      streak_days: 2,
      mission_status: 'pending',
    }

    const nextState = applyMissionUndo(
      completedState,
      'm-1',
      undoResult,
      '2026-08-27T05:05:00.000Z'
    )

    // Mission restored to pending
    expect(nextState.missions.find((m) => m.id === 'm-1')?.status).toBe('pending')
    expect(nextState.missions.find((m) => m.id === 'm-1')?.completed_at).toBeNull()

    // Profile reverted
    expect(nextState.profile.total_xp).toBe(80)
    expect(nextState.profile.current_level).toBe(1)
    expect(nextState.profile.level_title).toBe('Initiate')

    // Streak reverted to 2 days; active_today set to false; last_date reverts to yesterday; longest preserved at 5
    expect(nextState.streak.current).toBe(2)
    expect(nextState.streak.longest).toBe(5)
    expect(nextState.streak.active_today).toBe(false)
    expect(nextState.streak.last_date).toBe('2026-08-26')
  })

  test('preserves active_today during undo if other missions remain completed today', () => {
    const multiCompletedState: ClientDashboardState = {
      profile: {
        username: 'student',
        full_name: 'Student Name',
        avatar_url: null,
        total_xp: 160,
        current_level: 2,
        level_title: 'Learner',
        timezone: 'UTC',
      },
      streak: {
        current: 3,
        longest: 5,
        last_date: '2026-08-27',
        active_today: true,
      },
      missions: [
        { ...baseMission1, status: 'completed', completed_at: '2026-08-27T05:00:00.000Z' },
        { ...baseMission2, status: 'completed', completed_at: '2026-08-27T05:10:00.000Z' },
      ],
    }

    const undoResult: UndoMissionResult = {
      xp_reversed: 50,
      mission_xp_reversed: 50,
      daily_bonus_xp_reversed: 0,
      achievement_xp_reversed: 0,
      streak_bonus_xp_reversed: 0,
      new_total_xp: 110,
      new_level: 2,
      level_title: 'Learner',
      streak_days: 3,
      mission_status: 'pending',
    }

    const nextState = applyMissionUndo(
      multiCompletedState,
      'm-1',
      undoResult,
      '2026-08-27T05:15:00.000Z'
    )

    expect(nextState.missions.find((m) => m.id === 'm-1')?.status).toBe('pending')
    expect(nextState.missions.find((m) => m.id === 'm-2')?.status).toBe('completed')
    expect(nextState.streak.current).toBe(3)
    expect(nextState.streak.active_today).toBe(true)
    expect(nextState.streak.last_date).toBe('2026-08-27')
  })

  test('sets last_date to null if undo reduces streak to 0 with no remaining missions', () => {
    const singleDayCompletedState: ClientDashboardState = {
      profile: {
        username: 'new_student',
        full_name: 'New Student',
        avatar_url: null,
        total_xp: 50,
        current_level: 1,
        level_title: 'Initiate',
        timezone: 'UTC',
      },
      streak: {
        current: 1,
        longest: 1,
        last_date: '2026-08-27',
        active_today: true,
      },
      missions: [
        { ...baseMission1, status: 'completed', completed_at: '2026-08-27T05:00:00.000Z' },
        baseMission2,
      ],
    }

    const undoResult: UndoMissionResult = {
      xp_reversed: 50,
      mission_xp_reversed: 50,
      daily_bonus_xp_reversed: 0,
      achievement_xp_reversed: 0,
      streak_bonus_xp_reversed: 0,
      new_total_xp: 0,
      new_level: 1,
      level_title: 'Initiate',
      streak_days: 0,
      mission_status: 'pending',
    }

    const nextState = applyMissionUndo(
      singleDayCompletedState,
      'm-1',
      undoResult,
      '2026-08-27T05:05:00.000Z'
    )

    expect(nextState.streak.current).toBe(0)
    expect(nextState.streak.active_today).toBe(false)
    expect(nextState.streak.last_date).toBeNull()
    expect(nextState.streak.longest).toBe(1)
  })

  test('applies mission replacement in place', () => {
    const newMission: DailyMission = {
      id: 'm-3',
      user_id: 'u-1',
      mission_date: '2026-08-27',
      type: 'attempt_paper',
      target_entity_type: 'paper',
      target_entity_id: 'p-1',
      subject_paper_id: 'sp-1',
      title: 'Attempt Pure Mathematics Paper 1',
      description: null,
      xp_reward: 75,
      status: 'pending',
      difficulty: 'medium',
      estimated_minutes: 60,
      skip_reason: null,
      skipped_at: null,
      completed_at: null,
      generated_at: '2026-08-27T00:00:00.000Z',
    }

    const replaceResult: ReplaceMissionResult = {
      success: true,
      replaced_mission_id: 'm-1',
      new_mission: newMission,
    }

    const nextState = applyMissionReplace(initialState, 'm-1', replaceResult)
    expect(nextState.missions).toHaveLength(2)
    expect(nextState.missions.find((m) => m.id === 'm-3')).toBeDefined()
    expect(nextState.missions.find((m) => m.id === 'm-1')).toBeUndefined()
  })
})
