// XP level thresholds — mirrors the DB compute_level() function exactly.
// Keep in sync with supabase/migrations/20260704000008_functions.sql

export const XP_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000, 7000, 10000, 14000, 19000, 25000]

export const LEVEL_TITLES: Record<number, string> = {
  1: 'Initiate', 2: 'Learner', 3: 'Scholar', 4: 'Analyst',
  5: 'Tactician', 6: 'Strategist', 7: 'Expert', 8: 'Master',
  9: 'Grandmaster', 10: 'Atlas', 11: 'Sage', 12: 'Oracle',
  13: 'Luminary', 14: 'Legend', 15: 'Mythic',
}

export function computeLevelTitle(level: number): string {
  return LEVEL_TITLES[level] ?? 'Mythic'
}

/**
 * Piecewise XP -> level number mapping.
 * Mirrors the DB public.compute_level(p_total_xp INTEGER) function exactly.
 */
export function computeLevel(totalXp: number): number {
  if (totalXp < 0) return 1
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (totalXp < XP_THRESHOLDS[i]) {
      return i
    }
  }
  return 15
}

export function xpForLevel(level: number): number {
  return XP_THRESHOLDS[Math.min(level - 1, XP_THRESHOLDS.length - 1)] ?? 0
}

export function xpProgress(totalXp: number, level: number) {
  const currentLevelXp = xpForLevel(level)
  const nextLevelXp    = xpForLevel(level + 1)
  if (nextLevelXp <= currentLevelXp) {
    return { pct: 100, xpInLevel: totalXp - currentLevelXp, xpNeeded: 0 }
  }
  const xpInLevel = totalXp - currentLevelXp
  const xpNeeded  = nextLevelXp - currentLevelXp
  return { pct: Math.min((xpInLevel / xpNeeded) * 100, 100), xpInLevel, xpNeeded }
}
