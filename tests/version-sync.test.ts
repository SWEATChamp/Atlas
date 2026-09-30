import { describe, it, expect } from 'vitest'
import { CURRENT_RELEASE } from '@/lib/version'
import packageJson from '../package.json'

describe('Semantic Version Synchronization', () => {
  it('synchronizes package.json version with CURRENT_RELEASE metadata', () => {
    expect(packageJson.version).toBe(CURRENT_RELEASE.version)
    expect(CURRENT_RELEASE.version).toBe('1.2.1')
    expect(CURRENT_RELEASE.releaseDate).toBe('2026-09-30')
  })

  it('contains complete release metadata structure', () => {
    expect(CURRENT_RELEASE.title).toBe('Bug Fix: Subject Route Display')
    expect(CURRENT_RELEASE.changes).toEqual([
      'Selected Mathematics papers now map to the correct Subject Route chapter groups.',
      'Statistics 1 remains available during staged AS study, while Pure 3 and Mechanics stay locked until A2.',
      'Selected papers now appear before unselected components, with AS papers listed ahead of A2 papers.',
    ])
  })
})
