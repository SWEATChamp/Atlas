import { describe, it, expect } from 'vitest'
import { CURRENT_RELEASE } from '@/lib/version'
import packageJson from '../package.json'

describe('Semantic Version Synchronization', () => {
  it('synchronizes package.json version with CURRENT_RELEASE metadata', () => {
    expect(packageJson.version).toBe(CURRENT_RELEASE.version)
    expect(CURRENT_RELEASE.version).toBe('1.5.0')
    expect(CURRENT_RELEASE.releaseDate).toBe('2026-11-23')
  })

  it('contains complete release metadata structure', () => {
    expect(CURRENT_RELEASE.title).toBe('Target-Grade Marks Planner')
    expect(CURRENT_RELEASE.changes).toEqual([
      'Paper-by-paper target marks derived from verified official Cambridge threshold and weighting evidence.',
      'Exact-variant targets for known papers, alongside clearly disclosed Atlas variant estimates.',
      'Full-paper performance comparisons, recency-weighted planning, safety margins, and staged A* contribution handling.',
      'Fail-closed reliability: unavailable routes, unweighted combinations, or missing threshold data fail safe without guessing.',
      'Predicted grades isolate verified full-paper attempts and strictly exclude standalone question practice.',
    ])
  })
})
