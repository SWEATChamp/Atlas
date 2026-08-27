export const MISSION_UNDO_WINDOW_MS = 10 * 60 * 1000
export const MISSION_CLOCK_SKEW_TOLERANCE_MS = 60 * 1000

/**
 * Keep the undo control visible when the database clock is slightly ahead of
 * the browser clock. The database remains the authority for the 10-minute rule.
 */
export function isMissionUndoAvailable(
  completedAt: string | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!completedAt) return false

  const completedAtMs = new Date(completedAt).getTime()
  if (!Number.isFinite(completedAtMs)) return false

  const elapsedMs = nowMs - completedAtMs
  return (
    elapsedMs >= -MISSION_CLOCK_SKEW_TOLERANCE_MS &&
    elapsedMs <= MISSION_UNDO_WINDOW_MS
  )
}

export function missionUndoRemainingMs(
  completedAt: string,
  nowMs = Date.now()
): number {
  const completedAtMs = new Date(completedAt).getTime()
  if (!Number.isFinite(completedAtMs)) return 0
  const elapsedMs = Math.max(nowMs - completedAtMs, 0)
  return Math.max(MISSION_UNDO_WINDOW_MS - elapsedMs, 0)
}
