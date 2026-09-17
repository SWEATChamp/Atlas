import { describe, expect, test } from 'vitest'
import {
  CAMBRIDGE_JUNE_2026_SOURCES,
  CAMBRIDGE_THRESHOLD_SOURCES,
  compareManifestSessions,
  getCambridgeThresholdSource,
  getNewestReviewedThresholdSource,
} from '../lib/grade-thresholds/source-manifest'
import type { CambridgeThresholdSource } from '../lib/grade-thresholds/types'

describe('source manifest registry & chronological comparison', () => {
  test('compares manifest sessions chronologically across series and years', () => {
    // Within same year: march < june < november
    expect(compareManifestSessions({ year: 2026, series: 'march' }, { year: 2026, series: 'june' })).toBeLessThan(0)
    expect(compareManifestSessions({ year: 2026, series: 'june' }, { year: 2026, series: 'november' })).toBeLessThan(0)
    expect(compareManifestSessions({ year: 2026, series: 'november' }, { year: 2026, series: 'june' })).toBeGreaterThan(0)
    expect(compareManifestSessions({ year: 2026, series: 'june' }, { year: 2026, series: 'june' })).toBe(0)

    // Across years: 2025 november < 2026 march
    expect(compareManifestSessions({ year: 2025, series: 'november' }, { year: 2026, series: 'march' })).toBeLessThan(0)
    expect(compareManifestSessions({ year: 2027, series: 'march' }, { year: 2026, series: 'november' })).toBeGreaterThan(0)
  })

  test('CAMBRIDGE_THRESHOLD_SOURCES initially contains June 2026 sources', () => {
    expect(CAMBRIDGE_THRESHOLD_SOURCES.length).toBe(5)
    expect(CAMBRIDGE_THRESHOLD_SOURCES).toEqual(CAMBRIDGE_JUNE_2026_SOURCES)
  })

  test('getNewestReviewedThresholdSource returns newest source for a subject', () => {
    const juneSource = getCambridgeThresholdSource('9709')
    expect(juneSource).toBeDefined()
    expect(juneSource?.series).toBe('june')
    expect(juneSource?.year).toBe(2026)

    // Synthetic multi-session test
    const customSources: CambridgeThresholdSource[] = [
      {
        ...juneSource!,
        year: 2025,
        series: 'november',
      },
      {
        ...juneSource!,
        year: 2026,
        series: 'june',
      },
      {
        ...juneSource!,
        year: 2026,
        series: 'march',
      },
    ]

    const newest = getNewestReviewedThresholdSource('9709', customSources)
    expect(newest?.year).toBe(2026)
    expect(newest?.series).toBe('june')
  })

  test('returns undefined for unmanifested subjects', () => {
    expect(getNewestReviewedThresholdSource('0000')).toBeUndefined()
  })

  test('getCambridgeThresholdSource remains backward compatible alias', () => {
    expect(getCambridgeThresholdSource('9709')).toEqual(getNewestReviewedThresholdSource('9709'))
  })
})
