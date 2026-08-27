import { describe, expect, test } from 'vitest'
import { formatExamCountdown } from '../lib/dashboard-display'

describe('dashboard exam countdown formatting', () => {
  test('formats future, current, and past exam dates', () => {
    expect(formatExamCountdown(44)).toBe('44d')
    expect(formatExamCountdown(0)).toBe('Today!')
    expect(formatExamCountdown(-1)).toBe('Exam passed')
  })

  test('hides missing or invalid countdown values', () => {
    expect(formatExamCountdown(undefined)).toBeNull()
    expect(formatExamCountdown(null)).toBeNull()
    expect(formatExamCountdown(Number.NaN)).toBeNull()
  })
})
