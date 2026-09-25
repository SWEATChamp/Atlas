import { describe, expect, test } from 'vitest'
import {
  getMathsCombinations,
  getFurtherMathsCombinations,
  getFixedSubjectCombinations,
  getCompatibleA2StagedCombinations,
  matchSavedCombination,
  remapSelectionsOnRouteChange,
} from '../components/subjects/paper-selection-panel'
import type { StudyRoute } from '../types'

describe('Route Remapping Table-Driven Suite', () => {
  describe('Mathematics 9709 UI Remapping Matrix', () => {
    const mathsCases: Array<{
      description: string
      fromRoute: StudyRoute
      toRoute: StudyRoute
      fromComboId: string
      expectedComboId: string | null
    }> = [
      {
        description: 'p1_m1: AS -> staged mech_stats',
        fromRoute: 'as_only',
        toRoute: 'staged',
        fromComboId: 'p1_m1',
        expectedComboId: 'mech_stats',
      },
      {
        description: 'p1_m1: AS -> full full_mech_stats',
        fromRoute: 'as_only',
        toRoute: 'full_level',
        fromComboId: 'p1_m1',
        expectedComboId: 'full_mech_stats',
      },
      {
        description: 'p1_s1: AS -> staged stats_mech',
        fromRoute: 'as_only',
        toRoute: 'staged',
        fromComboId: 'p1_s1',
        expectedComboId: 'stats_mech',
      },
      {
        description: 'p1_s1: AS -> full (cleared)',
        fromRoute: 'as_only',
        toRoute: 'full_level',
        fromComboId: 'p1_s1',
        expectedComboId: null,
      },
      {
        description: 'p1_p2: AS -> staged (cleared)',
        fromRoute: 'as_only',
        toRoute: 'staged',
        fromComboId: 'p1_p2',
        expectedComboId: null,
      },
      {
        description: 'p1_p2: AS -> full (cleared)',
        fromRoute: 'as_only',
        toRoute: 'full_level',
        fromComboId: 'p1_p2',
        expectedComboId: null,
      },
      {
        description: 'mech_stats: staged -> AS p1_m1',
        fromRoute: 'staged',
        toRoute: 'as_only',
        fromComboId: 'mech_stats',
        expectedComboId: 'p1_m1',
      },
      {
        description: 'stats_mech: staged -> AS p1_s1',
        fromRoute: 'staged',
        toRoute: 'as_only',
        fromComboId: 'stats_mech',
        expectedComboId: 'p1_s1',
      },
      {
        description: 'stats_double: staged -> AS p1_s1',
        fromRoute: 'staged',
        toRoute: 'as_only',
        fromComboId: 'stats_double',
        expectedComboId: 'p1_s1',
      },
      {
        description: 'full_stats_double: full -> AS p1_s1',
        fromRoute: 'full_level',
        toRoute: 'as_only',
        fromComboId: 'full_stats_double',
        expectedComboId: 'p1_s1',
      },
      {
        description: 'full_stats_double: full -> staged stats_double',
        fromRoute: 'full_level',
        toRoute: 'staged',
        fromComboId: 'full_stats_double',
        expectedComboId: 'stats_double',
      },
      {
        description: 'full_mech_stats: full -> AS (cleared)',
        fromRoute: 'full_level',
        toRoute: 'as_only',
        fromComboId: 'full_mech_stats',
        expectedComboId: null,
      },
      {
        description: 'full_mech_stats: full -> staged (cleared)',
        fromRoute: 'full_level',
        toRoute: 'staged',
        fromComboId: 'full_mech_stats',
        expectedComboId: null,
      },
    ]

    mathsCases.forEach(({ description, fromRoute, toRoute, fromComboId, expectedComboId }) => {
      test(description, () => {
        const fromCombo = getMathsCombinations(fromRoute).find((c) => c.id === fromComboId)
        expect(fromCombo).toBeDefined()

        const remapped = remapSelectionsOnRouteChange(
          '9709',
          fromRoute,
          toRoute,
          fromCombo!.selections
        )

        if (expectedComboId === null) {
          expect(remapped).toEqual([])
        } else {
          const match = matchSavedCombination('9709', toRoute, remapped)
          expect(match?.id).toBe(expectedComboId)
        }
      })
    })
  })

  describe('Further Mathematics 9231 UI Remapping Matrix', () => {
    const fmCases: Array<{
      description: string
      fromRoute: StudyRoute
      toRoute: StudyRoute
      fromComboId: string
      expectedComboId: string | null
    }> = [
      {
        description: 'fp1_fm: AS -> staged fm_fps',
        fromRoute: 'as_only',
        toRoute: 'staged',
        fromComboId: 'fp1_fm',
        expectedComboId: 'fm_fps',
      },
      {
        description: 'fp1_fps: AS -> staged fps_fm',
        fromRoute: 'as_only',
        toRoute: 'staged',
        fromComboId: 'fp1_fps',
        expectedComboId: 'fps_fm',
      },
      {
        description: 'fm_fps: staged -> AS fp1_fm',
        fromRoute: 'staged',
        toRoute: 'as_only',
        fromComboId: 'fm_fps',
        expectedComboId: 'fp1_fm',
      },
      {
        description: 'fps_fm: staged -> AS fp1_fps',
        fromRoute: 'staged',
        toRoute: 'as_only',
        fromComboId: 'fps_fm',
        expectedComboId: 'fp1_fps',
      },
      {
        description: 'full_all: full -> AS (cleared)',
        fromRoute: 'full_level',
        toRoute: 'as_only',
        fromComboId: 'full_all',
        expectedComboId: null,
      },
      {
        description: 'full_all: full -> staged (cleared)',
        fromRoute: 'full_level',
        toRoute: 'staged',
        fromComboId: 'full_all',
        expectedComboId: null,
      },
    ]

    fmCases.forEach(({ description, fromRoute, toRoute, fromComboId, expectedComboId }) => {
      test(description, () => {
        const fromCombo = getFurtherMathsCombinations(fromRoute).find((c) => c.id === fromComboId)
        expect(fromCombo).toBeDefined()

        const remapped = remapSelectionsOnRouteChange(
          '9231',
          fromRoute,
          toRoute,
          fromCombo!.selections
        )

        if (expectedComboId === null) {
          expect(remapped).toEqual([])
        } else {
          const match = matchSavedCombination('9231', toRoute, remapped)
          expect(match?.id).toBe(expectedComboId)
        }
      })
    })
  })

  describe('Fixed-Route Subjects (9702, 9701, 9618) UI Remapping Matrix', () => {
    const fixedSubjects = ['9702', '9701', '9618']
    const routes: StudyRoute[] = ['as_only', 'staged', 'full_level']

    fixedSubjects.forEach((subjectCode) => {
      routes.forEach((fromRoute) => {
        routes.forEach((toRoute) => {
          test(`${subjectCode}: ${fromRoute} -> ${toRoute} maps to canonical paper set`, () => {
            const fromSelections = getFixedSubjectCombinations(subjectCode, fromRoute)[0].selections
            const expectedSelections = getFixedSubjectCombinations(subjectCode, toRoute)[0].selections

            const remapped = remapSelectionsOnRouteChange(
              subjectCode,
              fromRoute,
              toRoute,
              fromSelections
            )

            expect(remapped).toEqual(expectedSelections)
          })
        })
      })
    })
  })

  describe('getCompatibleA2StagedCombinations filtering', () => {
    test('Mathematics 9709: p1_m1 allows only mech_stats and never offers stats_mech or stats_double', () => {
      const combos = getCompatibleA2StagedCombinations('9709', 'p1_m1')
      const ids = combos.map((c) => c.id)
      expect(ids).toEqual(['mech_stats'])
      expect(ids).not.toContain('stats_mech')
      expect(ids).not.toContain('stats_double')
    })

    test('Mathematics 9709: p1_s1 allows stats_mech and stats_double, never offers mech_stats', () => {
      const combos = getCompatibleA2StagedCombinations('9709', 'p1_s1')
      const ids = combos.map((c) => c.id)
      expect(ids).toEqual(['stats_mech', 'stats_double'])
      expect(ids).not.toContain('mech_stats')
    })

    test('Mathematics 9709: p1_p2 shows all 3 valid staged routes as exceptional replacements', () => {
      const combos = getCompatibleA2StagedCombinations('9709', 'p1_p2')
      const ids = combos.map((c) => c.id)
      expect(ids).toEqual(['mech_stats', 'stats_mech', 'stats_double'])
    })

    test('Mathematics 9709: unknown combo returns empty array', () => {
      expect(getCompatibleA2StagedCombinations('9709', 'unknown')).toEqual([])
      expect(getCompatibleA2StagedCombinations('9709', null)).toEqual([])
    })

    test('Further Mathematics 9231: fp1_fm allows only fm_fps', () => {
      const combos = getCompatibleA2StagedCombinations('9231', 'fp1_fm')
      const ids = combos.map((c) => c.id)
      expect(ids).toEqual(['fm_fps'])
      expect(ids).not.toContain('fps_fm')
    })

    test('Further Mathematics 9231: fp1_fps allows only fps_fm', () => {
      const combos = getCompatibleA2StagedCombinations('9231', 'fp1_fps')
      const ids = combos.map((c) => c.id)
      expect(ids).toEqual(['fps_fm'])
      expect(ids).not.toContain('fm_fps')
    })

    test('Further Mathematics 9231: unknown combo returns empty array', () => {
      expect(getCompatibleA2StagedCombinations('9231', 'unknown')).toEqual([])
      expect(getCompatibleA2StagedCombinations('9231', null)).toEqual([])
    })

    test('Fixed-route subjects and undefined return empty array', () => {
      expect(getCompatibleA2StagedCombinations('9702', 'standard')).toEqual([])
      expect(getCompatibleA2StagedCombinations(null, 'p1_m1')).toEqual([])
      expect(getCompatibleA2StagedCombinations(undefined, 'p1_m1')).toEqual([])
    })
  })
})
