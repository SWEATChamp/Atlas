import { describe, it, expect } from 'vitest'
import { CURRENT_RELEASE } from '@/lib/version'
import packageJson from '../package.json'

describe('Semantic Version Synchronization', () => {
  it('synchronizes package.json version with CURRENT_RELEASE metadata', () => {
    expect(packageJson.version).toBe(CURRENT_RELEASE.version)
    expect(CURRENT_RELEASE.version).toBe('1.3.4')
    expect(CURRENT_RELEASE.releaseDate).toBe('2026-11-11')
  })

  it('contains complete release metadata structure', () => {
    expect(CURRENT_RELEASE.title).toBe('Database Availability Safeguard')
    expect(CURRENT_RELEASE.changes).toEqual([
      'Atlas now runs lightweight scheduled database checks during quiet periods.',
      'Keep-alive checks use read-only access and never modify student data.',
      'Operational failures now return clear, safely logged status information.',
    ])
  })
})
