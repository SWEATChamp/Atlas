import { describe, expect, test } from 'vitest'
import { formatExamCountdown, getExamDateCoverage } from '../lib/dashboard-display'

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

describe('dashboard exam-date coverage', () => {
  test('distinguishes complete, partial, and missing exam dates', () => {
    expect(getExamDateCoverage(['2026-10-12', '2026-10-18'])).toBe('all')
    expect(getExamDateCoverage(['2026-10-12', null])).toBe('some')
    expect(getExamDateCoverage([null, undefined])).toBe('none')
    expect(getExamDateCoverage([])).toBe('none')
  })
})
