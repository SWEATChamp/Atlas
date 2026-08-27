import { describe, expect, test } from 'vitest'
import {
  isMissionUndoAvailable,
  missionUndoRemainingMs,
  MISSION_CLOCK_SKEW_TOLERANCE_MS,
  MISSION_UNDO_WINDOW_MS,
} from '../lib/mission-undo'

describe('mission undo availability', () => {
  const now = Date.parse('2026-08-27T05:00:00.000Z')

  test('allows a freshly completed mission and the full undo window', () => {
    expect(isMissionUndoAvailable('2026-08-27T05:00:00.000Z', now)).toBe(true)
    expect(
      isMissionUndoAvailable(
        '2026-08-27T04:50:00.000Z',
        now
      )
    ).toBe(true)
  })

  test('tolerates a small database-to-browser clock difference', () => {
    const completedAt = new Date(now + MISSION_CLOCK_SKEW_TOLERANCE_MS).toISOString()
    expect(isMissionUndoAvailable(completedAt, now)).toBe(true)
    expect(missionUndoRemainingMs(completedAt, now)).toBe(MISSION_UNDO_WINDOW_MS)
  })

  test('rejects invalid, expired, and implausibly future timestamps', () => {
    expect(isMissionUndoAvailable(null, now)).toBe(false)
    expect(isMissionUndoAvailable('not-a-date', now)).toBe(false)
    expect(isMissionUndoAvailable('2026-08-27T04:49:59.999Z', now)).toBe(false)
    expect(
      isMissionUndoAvailable(
        new Date(now + MISSION_CLOCK_SKEW_TOLERANCE_MS + 1).toISOString(),
        now
      )
    ).toBe(false)
  })
})
