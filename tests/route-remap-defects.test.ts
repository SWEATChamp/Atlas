import { describe, it, expect } from 'vitest'
import {
  remapSelectionsOnRouteChange,
  getMathsCombinations,
  getFurtherMathsCombinations,
  matchSavedCombination,
} from '@/components/subjects/paper-selection-panel'

describe('Route Remapping Defect Reproduction', () => {
  // Maths 9709 combinations
  const mathsAsP1M1 = getMathsCombinations('as_only').find((c) => c.id === 'p1_m1')!.selections
  const mathsAsP1S1 = getMathsCombinations('as_only').find((c) => c.id === 'p1_s1')!.selections
  const mathsStagedMechStats = getMathsCombinations('staged').find((c) => c.id === 'mech_stats')!.selections
  const mathsStagedStatsMech = getMathsCombinations('staged').find((c) => c.id === 'stats_mech')!.selections
  const mathsStagedStatsDouble = getMathsCombinations('staged').find((c) => c.id === 'stats_double')!.selections
  const mathsFullStatsDouble = getMathsCombinations('full_level').find((c) => c.id === 'full_stats_double')!.selections

  // Further Maths 9231 combinations
  const fmAsFp1Fm = getFurtherMathsCombinations('as_only').find((c) => c.id === 'fp1_fm')!.selections
  const fmAsFp1Fps = getFurtherMathsCombinations('as_only').find((c) => c.id === 'fp1_fps')!.selections
  const fmStagedFmFps = getFurtherMathsCombinations('staged').find((c) => c.id === 'fm_fps')!.selections
  const fmStagedFpsFm = getFurtherMathsCombinations('staged').find((c) => c.id === 'fps_fm')!.selections

  it('Mathematics: p1_m1: AS -> staged mech_stats', () => {
    const remapped = remapSelectionsOnRouteChange('9709', 'as_only', 'staged', mathsAsP1M1)
    const match = matchSavedCombination('9709', 'staged', remapped)
    expect(match?.id).toBe('mech_stats')
  })

  it('Mathematics: p1_m1: AS -> full full_mech_stats', () => {
    const remapped = remapSelectionsOnRouteChange('9709', 'as_only', 'full_level', mathsAsP1M1)
    const match = matchSavedCombination('9709', 'full_level', remapped)
    expect(match?.id).toBe('full_mech_stats')
  })

  it('Mathematics: p1_s1: AS -> staged stats_mech', () => {
    const remapped = remapSelectionsOnRouteChange('9709', 'as_only', 'staged', mathsAsP1S1)
    const match = matchSavedCombination('9709', 'staged', remapped)
    expect(match?.id).toBe('stats_mech')
  })

  it('Mathematics: mech_stats: staged -> AS p1_m1', () => {
    const remapped = remapSelectionsOnRouteChange('9709', 'staged', 'as_only', mathsStagedMechStats)
    const match = matchSavedCombination('9709', 'as_only', remapped)
    expect(match?.id).toBe('p1_m1')
  })

  it('Mathematics: stats_mech: staged -> AS p1_s1', () => {
    const remapped = remapSelectionsOnRouteChange('9709', 'staged', 'as_only', mathsStagedStatsMech)
    const match = matchSavedCombination('9709', 'as_only', remapped)
    expect(match?.id).toBe('p1_s1')
  })

  it('Mathematics: stats_double: staged -> AS p1_s1', () => {
    const remapped = remapSelectionsOnRouteChange('9709', 'staged', 'as_only', mathsStagedStatsDouble)
    const match = matchSavedCombination('9709', 'as_only', remapped)
    expect(match?.id).toBe('p1_s1')
  })

  it('Mathematics: full_stats_double: full -> AS p1_s1', () => {
    const remapped = remapSelectionsOnRouteChange('9709', 'full_level', 'as_only', mathsFullStatsDouble)
    const match = matchSavedCombination('9709', 'as_only', remapped)
    expect(match?.id).toBe('p1_s1')
  })

  it('Further Mathematics: fp1_fm: AS -> staged fm_fps', () => {
    const remapped = remapSelectionsOnRouteChange('9231', 'as_only', 'staged', fmAsFp1Fm)
    const match = matchSavedCombination('9231', 'staged', remapped)
    expect(match?.id).toBe('fm_fps')
  })

  it('Further Mathematics: fp1_fps: AS -> staged fps_fm', () => {
    const remapped = remapSelectionsOnRouteChange('9231', 'as_only', 'staged', fmAsFp1Fps)
    const match = matchSavedCombination('9231', 'staged', remapped)
    expect(match?.id).toBe('fps_fm')
  })

  it('Further Mathematics: fm_fps: staged -> AS fp1_fm', () => {
    const remapped = remapSelectionsOnRouteChange('9231', 'staged', 'as_only', fmStagedFmFps)
    const match = matchSavedCombination('9231', 'as_only', remapped)
    expect(match?.id).toBe('fp1_fm')
  })

  it('Further Mathematics: fps_fm: staged -> AS fp1_fps', () => {
    const remapped = remapSelectionsOnRouteChange('9231', 'staged', 'as_only', fmStagedFpsFm)
    const match = matchSavedCombination('9231', 'as_only', remapped)
    expect(match?.id).toBe('fp1_fps')
  })
})
