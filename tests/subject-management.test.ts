import { describe, expect, test } from 'vitest'
import {
  MAX_ACTIVE_SUBJECTS,
  canAddSubject,
  canRemoveSubject,
  getRemovalImpactMessage,
} from '../lib/subject-management'

describe('subject management safeguards', () => {
  test('allows adding only below the active-subject limit', () => {
    expect(canAddSubject(0)).toBe(true)
    expect(canAddSubject(MAX_ACTIVE_SUBJECTS - 1)).toBe(true)
    expect(canAddSubject(MAX_ACTIVE_SUBJECTS)).toBe(false)
  })

  test('keeps at least one active subject', () => {
    expect(canRemoveSubject(2)).toBe(true)
    expect(canRemoveSubject(1)).toBe(false)
    expect(canRemoveSubject(0)).toBe(false)
  })

  test('confirmation copy states what is preserved and whether restoration is available', () => {
    const supported = getRemovalImpactMessage(true)
    const unsupported = getRemovalImpactMessage(false)

    expect(supported).toContain('progress, past papers, completed missions, and XP will be preserved')
    expect(supported).toContain('add it again later')
    expect(unsupported).toContain('when this subject becomes supported')
  })
})
