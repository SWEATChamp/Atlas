import { describe, test, expect } from 'vitest'
import {
  formatCompletionBreakdown,
  formatUndoBreakdown,
  calculateCompletionTotalXp,
} from '../components/dashboard/mission-list'
import type { CompleteMissionResult } from '../lib/actions/dashboard'
import type { UndoMissionResult } from '../types/database'

describe('Mission Completion and Undo Breakdown Formatting', () => {
  test('single mission completion breakdown formats without sub-breakdown list', () => {
    const result: CompleteMissionResult = {
      mission_xp: 50,
      daily_bonus_xp: 0,
      achievement_xp: 0,
      streak_bonus_xp: 0,
      total_xp_awarded: 50,
      xp_awarded: 50,
      new_total_xp: 150,
      new_level: 2,
      level_title: 'Apprentice',
      streak_days: 1,
      achievements_unlocked: [],
    }

    expect(formatCompletionBreakdown(result)).toBe('+50 XP')
  })

  test('multi-item completion with daily bonus includes detailed breakdown', () => {
    const result: CompleteMissionResult = {
      mission_xp: 50,
      daily_bonus_xp: 25,
      achievement_xp: 0,
      streak_bonus_xp: 0,
      total_xp_awarded: 75,
      xp_awarded: 75,
      new_total_xp: 175,
      new_level: 2,
      level_title: 'Apprentice',
      streak_days: 1,
      achievements_unlocked: [],
    }

    expect(formatCompletionBreakdown(result)).toBe('+75 XP (+50 Mission, +25 All-Done Bonus)')
  })

  test('completion with streak bonus includes streak milestone breakdown', () => {
    const result: CompleteMissionResult = {
      mission_xp: 50,
      daily_bonus_xp: 0,
      achievement_xp: 0,
      streak_bonus_xp: 150,
      total_xp_awarded: 200,
      xp_awarded: 200,
      new_total_xp: 300,
      new_level: 3,
      level_title: 'Scholar',
      streak_days: 7,
      achievements_unlocked: [],
    }

    expect(formatCompletionBreakdown(result)).toBe('+200 XP (+50 Mission, +150 Streak Bonus)')
  })

  test('completion with all bonus types combined lists every source', () => {
    const result: CompleteMissionResult = {
      mission_xp: 50,
      daily_bonus_xp: 25,
      achievement_xp: 50,
      streak_bonus_xp: 150,
      total_xp_awarded: 275,
      xp_awarded: 275,
      new_total_xp: 400,
      new_level: 4,
      level_title: 'Master',
      streak_days: 7,
      achievements_unlocked: [{ key: 'streak_7', xp: 50 }],
    }

    expect(formatCompletionBreakdown(result)).toBe(
      '+275 XP (+50 Mission, +25 All-Done Bonus, +50 Achievement, +150 Streak Bonus)'
    )
  })

  test('fallback calculation includes streak_bonus_xp when total_xp_awarded is undefined', () => {
    const result = {
      mission_xp: 40,
      daily_bonus_xp: 25,
      achievement_xp: 10,
      streak_bonus_xp: 150,
    } as CompleteMissionResult

    expect(calculateCompletionTotalXp(result)).toBe(225)
  })

  test('single mission undo formatting displays clean reversal', () => {
    const result: UndoMissionResult = {
      xp_reversed: 50,
      mission_xp_reversed: 50,
      daily_bonus_xp_reversed: 0,
      achievement_xp_reversed: 0,
      streak_bonus_xp_reversed: 0,
      new_total_xp: 100,
      new_level: 1,
      level_title: 'Novice',
      streak_days: 0,
      mission_status: 'pending',
    }

    expect(formatUndoBreakdown(result)).toBe('-50 XP (Reversed)')
  })

  test('undo with streak bonus reversal formats multi-item breakdown', () => {
    const result: UndoMissionResult = {
      xp_reversed: 200,
      mission_xp_reversed: 50,
      daily_bonus_xp_reversed: 0,
      achievement_xp_reversed: 0,
      streak_bonus_xp_reversed: 150,
      new_total_xp: 100,
      new_level: 1,
      level_title: 'Novice',
      streak_days: 6,
      mission_status: 'pending',
    }

    expect(formatUndoBreakdown(result)).toBe('-200 XP (-50 Mission, -150 Streak Bonus)')
  })

  test('undo with all items reversed lists all reversed categories', () => {
    const result: UndoMissionResult = {
      xp_reversed: 275,
      mission_xp_reversed: 50,
      daily_bonus_xp_reversed: 25,
      achievement_xp_reversed: 50,
      streak_bonus_xp_reversed: 150,
      new_total_xp: 125,
      new_level: 1,
      level_title: 'Novice',
      streak_days: 6,
      mission_status: 'pending',
    }

    expect(formatUndoBreakdown(result)).toBe(
      '-275 XP (-50 Mission, -25 Bonus, -50 Achievement, -150 Streak Bonus)'
    )
  })
})
