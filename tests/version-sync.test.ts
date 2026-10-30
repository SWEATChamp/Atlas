import { describe, it, expect } from 'vitest'
import { CURRENT_RELEASE } from '@/lib/version'
import packageJson from '../package.json'

describe('Semantic Version Synchronization', () => {
  it('synchronizes package.json version with CURRENT_RELEASE metadata', () => {
    expect(packageJson.version).toBe(CURRENT_RELEASE.version)
    expect(CURRENT_RELEASE.version).toBe('1.3.3')
    expect(CURRENT_RELEASE.releaseDate).toBe('2026-10-30')
  })

  it('contains complete release metadata structure', () => {
    expect(CURRENT_RELEASE.title).toBe('Accessible Setup & Controls')
    expect(CURRENT_RELEASE.changes).toEqual([
      'Paper combinations can now be selected entirely with the keyboard.',
      'Dialogs now keep keyboard focus inside as you move between steps.',
      'Target-grade choices now remain visible and usable on narrow screens.',
      'Confidence ratings now announce the selected value to assistive technology.',
    ])
  })
})
