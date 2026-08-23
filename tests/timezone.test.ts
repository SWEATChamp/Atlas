import { describe, expect, test } from 'vitest'
import { dateInTimeZone, daysUntilDate } from '../lib/date'

describe('local exam countdown', () => {
  test('changes at midnight in the user timezone', () => {
    const justBeforeMidnight = new Date('2026-08-23T15:59:59Z')
    const atMidnight = new Date('2026-08-23T16:00:00Z')

    expect(dateInTimeZone(justBeforeMidnight, 'Asia/Singapore')).toBe('2026-08-23')
    expect(daysUntilDate('2026-10-10', 'Asia/Singapore', justBeforeMidnight)).toBe(48)

    expect(dateInTimeZone(atMidnight, 'Asia/Singapore')).toBe('2026-08-24')
    expect(daysUntilDate('2026-10-10', 'Asia/Singapore', atMidnight)).toBe(47)
  })
})
