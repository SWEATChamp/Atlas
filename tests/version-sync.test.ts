import { describe, it, expect } from 'vitest'
import { CURRENT_RELEASE } from '@/lib/version'
import packageJson from '../package.json'

describe('Semantic Version Synchronization', () => {
  it('synchronizes package.json version with CURRENT_RELEASE metadata', () => {
    expect(packageJson.version).toBe(CURRENT_RELEASE.version)
    expect(CURRENT_RELEASE.version).toBe('1.1.0')
  })

  it('contains complete release metadata structure', () => {
    expect(CURRENT_RELEASE.title).toBeTruthy()
    expect(CURRENT_RELEASE.releaseDate).toBeTruthy()
    expect(Array.isArray(CURRENT_RELEASE.changes)).toBe(true)
    expect(CURRENT_RELEASE.changes.length).toBeGreaterThan(0)
  })
})
