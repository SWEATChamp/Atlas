import { describe, it, expect } from 'vitest'
import { CURRENT_RELEASE } from '@/lib/version'
import packageJson from '../package.json'

describe('Semantic Version Synchronization', () => {
  it('synchronizes package.json version with CURRENT_RELEASE metadata', () => {
    expect(packageJson.version).toBe(CURRENT_RELEASE.version)
    expect(CURRENT_RELEASE.version).toBe('1.3.0')
    expect(CURRENT_RELEASE.releaseDate).toBe('2026-10-21')
  })

  it('contains complete release metadata structure', () => {
    expect(CURRENT_RELEASE.title).toBe('Question Practice, Stats & Logs')
    expect(CURRENT_RELEASE.changes).toEqual([
      'Separate full-paper and standalone question-practice logging with distinct history tracking.',
      'Required multi-chapter mapping per question with optional exam provenance (year, series, paper, variant).',
      'Dedicated Stats and Logs workspaces featuring subject-specific performance analytics, score trends, and pagination.',
      'Separate practice-informed predicted exam mark estimates (explicitly non-official) and syllabus readiness indicators.',
      'Smoother repeated subject switching and warm tab revisits powered by client-session caching.',
    ])
  })
})
