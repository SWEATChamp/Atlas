import { describe, it, expect } from 'vitest'
import { CURRENT_RELEASE } from '@/lib/version'
import packageJson from '../package.json'

describe('Semantic Version Synchronization', () => {
  it('synchronizes package.json version with CURRENT_RELEASE metadata', () => {
    expect(packageJson.version).toBe(CURRENT_RELEASE.version)
    expect(CURRENT_RELEASE.version).toBe('1.3.1')
    expect(CURRENT_RELEASE.releaseDate).toBe('Pending Production Deployment')
  })

  it('contains complete release metadata structure', () => {
    expect(CURRENT_RELEASE.title).toBe('Stats Layout & UI Stability')
    expect(CURRENT_RELEASE.changes).toEqual([
      'Improved Stats loading-layout stability.',
      'Improved narrow-screen statistics-card layout.',
      'Full-paper logging defaults to the selected subject.',
      'Corrected single-attempt evidence-disclosure wording.',
    ])
  })
})
