import { describe, it, expect } from 'vitest'
import { CURRENT_RELEASE } from '@/lib/version'
import packageJson from '../package.json'

describe('Semantic Version Synchronization', () => {
  it('synchronizes package.json version with CURRENT_RELEASE metadata', () => {
    expect(packageJson.version).toBe(CURRENT_RELEASE.version)
    expect(CURRENT_RELEASE.version).toBe('1.3.2')
    expect(CURRENT_RELEASE.releaseDate).toBe('2026-10-28')
  })

  it('contains complete release metadata structure', () => {
    expect(CURRENT_RELEASE.title).toBe('Progress Reliability & Recovery')
    expect(CURRENT_RELEASE.changes).toEqual([
      'Progress summaries now reflect only chapters available for your current study route.',
      'Subject-loading failures now show clear errors instead of misleading empty progress.',
      'Chapter notes and confidence updates now recover reliably from failed or rapid changes.',
    ])
  })
})
