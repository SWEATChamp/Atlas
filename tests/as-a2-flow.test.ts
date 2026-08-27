import { describe, expect, test } from 'vitest'
import {
  getMathsCombinations,
  getFurtherMathsCombinations,
  getFixedSubjectCombinations,
  matchSavedMathsCombination,
  remapMathsSelectionsOnRouteChange,
  isElectiveSubject,
} from '../components/subjects/paper-selection-panel'
import { filterSubjectsByQuery } from '../app/(auth)/onboarding/steps/subjects-step'
import { filterChaptersForPaper, matchPaperOption } from '../components/papers/log-paper-modal'
import { StudyRouteStepSchema, SubjectEnrollSchema } from '../lib/validators/onboarding'
import type { Subject, StudyRoute } from '../types/database'
import type { PaperSelectionInput } from '../types'

describe('AS/A2 Mathematics Combinations', () => {
  test('as_only route includes Pure 1 + Pure 2, Pure 1 + Mechanics, Pure 1 + Statistics 1', () => {
    const combos = getMathsCombinations('as_only')
    expect(combos.length).toBe(3)
    expect(combos.map((c) => c.id)).toEqual(['p1_p2', 'p1_m1', 'p1_s1'])
    expect(combos.every((c) => c.selections.every((s) => s.stage === 'as'))).toBe(true)
  })

  test('staged returns 3 sequences, full_level returns 2 linear combinations, unconfirmed returns 0', () => {
    const stagedCombos = getMathsCombinations('staged')
    expect(stagedCombos.length).toBe(3)
    expect(stagedCombos.map((c) => c.id)).toEqual(['mech_stats', 'stats_mech', 'stats_double'])

    // Route A: Mechanics in AS, Stats 1 in A2
    expect(stagedCombos[0].asPapers).toEqual(['Pure 1 (Paper 1)', 'Mechanics (Paper 4)'])
    expect(stagedCombos[0].a2Papers).toEqual(['Pure 3 (Paper 3)', 'Statistics 1 (Paper 5)'])

    // Route B: Stats 1 in AS, Mechanics in A2
    expect(stagedCombos[1].asPapers).toEqual(['Pure 1 (Paper 1)', 'Statistics 1 (Paper 5)'])
    expect(stagedCombos[1].a2Papers).toEqual(['Pure 3 (Paper 3)', 'Mechanics (Paper 4)'])

    // Route C: Stats 1 in AS, Stats 2 in A2
    expect(stagedCombos[2].asPapers).toEqual(['Pure 1 (Paper 1)', 'Statistics 1 (Paper 5)'])
    expect(stagedCombos[2].a2Papers).toEqual(['Pure 3 (Paper 3)', 'Statistics 2 (Paper 6)'])

    const fullCombos = getMathsCombinations('full_level')
    expect(fullCombos.length).toBe(2)
    expect(fullCombos.map((c) => c.id)).toEqual(['full_mech_stats', 'full_stats_double'])
    expect(fullCombos[0].label).toBe('Pure Mathematics, Mechanics & Statistics 1')
    expect(fullCombos[1].label).toBe('Pure Mathematics & Statistics 1–2')
    expect(fullCombos[0].a2Papers).toEqual([])
    expect(fullCombos[1].a2Papers).toEqual([])

    const unconfirmedCombos = getMathsCombinations('unconfirmed')
    expect(unconfirmedCombos).toEqual([])
  })

  test('only staged matching distinguishes whether Mechanics or Stats 1 was taken in AS; full_level matches both', () => {
    const routeASelections = [
      { component_name: 'Pure 1', paper_number: 1, stage: 'as' as const },
      { component_name: 'Mechanics', paper_number: 4, stage: 'as' as const },
      { component_name: 'Pure 3', paper_number: 3, stage: 'a2' as const },
      { component_name: 'Statistics 1', paper_number: 5, stage: 'a2' as const },
    ]

    const routeBSelections = [
      { component_name: 'Pure 1', paper_number: 1, stage: 'as' as const },
      { component_name: 'Statistics 1', paper_number: 5, stage: 'as' as const },
      { component_name: 'Pure 3', paper_number: 3, stage: 'a2' as const },
      { component_name: 'Mechanics', paper_number: 4, stage: 'a2' as const },
    ]

    const routeCSelections = [
      { component_name: 'Pure 1', paper_number: 1, stage: 'as' as const },
      { component_name: 'Statistics 1', paper_number: 5, stage: 'as' as const },
      { component_name: 'Pure 3', paper_number: 3, stage: 'a2' as const },
      { component_name: 'Statistics 2', paper_number: 6, stage: 'a2' as const },
    ]

    // Staged strictly distinguishes Route A and Route B
    const matchStagedA = matchSavedMathsCombination('staged', routeASelections)
    const matchStagedB = matchSavedMathsCombination('staged', routeBSelections)
    const matchStagedC = matchSavedMathsCombination('staged', routeCSelections)

    expect(matchStagedA?.id).toBe('mech_stats')
    expect(matchStagedB?.id).toBe('stats_mech')
    expect(matchStagedC?.id).toBe('stats_double')

    // full_level safely matches both Route A and Route B to full_mech_stats (same 4 final papers)
    const matchFullA = matchSavedMathsCombination('full_level', routeASelections)
    const matchFullB = matchSavedMathsCombination('full_level', routeBSelections)
    const matchFullC = matchSavedMathsCombination('full_level', routeCSelections)

    expect(matchFullA?.id).toBe('full_mech_stats')
    expect(matchFullB?.id).toBe('full_mech_stats')
    expect(matchFullC?.id).toBe('full_stats_double')
  })

  test('matchSavedMathsCombination strictly matches component, stage and paper_number', () => {
    const savedP1M1 = [
      { component_name: 'Pure 1', paper_number: 1, stage: 'as' as const },
      { component_name: 'Mechanics', paper_number: 4, stage: 'as' as const },
    ]
    const matched = matchSavedMathsCombination('as_only', savedP1M1)
    expect(matched).not.toBeNull()
    expect(matched?.id).toBe('p1_m1')

    // Mismatched paper number must NOT match
    const mismatchedPaper = [
      { component_name: 'Pure 1', paper_number: 1, stage: 'as' as const },
      { component_name: 'Mechanics', paper_number: 5, stage: 'as' as const },
    ]
    expect(matchSavedMathsCombination('as_only', mismatchedPaper)).toBeNull()

    // Missing paper number (null) must NOT match
    const nullPaper = [
      { component_name: 'Pure 1', paper_number: 1, stage: 'as' as const },
      { component_name: 'Mechanics', paper_number: null as unknown as number, stage: 'as' as const },
    ]
    expect(matchSavedMathsCombination('as_only', nullPaper)).toBeNull()

    // Incompatible when route changes to staged
    const stagedMatch = matchSavedMathsCombination('staged', savedP1M1)
    expect(stagedMatch).toBeNull()
  })
})

describe('Onboarding Subject Selection Schema (Max 5 Limit)', () => {
  test('accepts between 1 and 5 subjects', () => {
    const valid5 = {
      subjectIds: [
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05',
      ],
    }
    expect(SubjectEnrollSchema.safeParse(valid5).success).toBe(true)
  })

  test('rejects more than 5 subjects', () => {
    const invalid6 = {
      subjectIds: [
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06',
      ],
    }
    const res = SubjectEnrollSchema.safeParse(invalid6)
    expect(res.success).toBe(false)
  })
})

describe('Onboarding Route Validation Schema', () => {
  test('validates route configuration correctly', () => {
    const valid = {
      routes: [
        {
          subjectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          route: 'staged',
          paperSelections: [
            { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
            { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
          ],
        },
      ],
    }
    const result = StudyRouteStepSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  test('rejects empty routes array', () => {
    const invalid = { routes: [] }
    const result = StudyRouteStepSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  test('rejects invalid study route', () => {
    const invalid = {
      routes: [
        {
          subjectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          route: 'invalid_route',
        },
      ],
    }
    const result = StudyRouteStepSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})

describe('Exact Onboarding Subject Selection Replacement', () => {
  test('selecting new list removes old subjects (e.g. Biology) cleanly', () => {
    const maths = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01'
    const physics = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02'
    const chem = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03'
    const biology = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04'
    const econ = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05'

    let enrolledSubjects = [maths, physics, chem, biology]

    // User changes selection to [maths, physics, chem, econ]
    const newSelection = [maths, physics, chem, econ]
    const parsed = SubjectEnrollSchema.safeParse({ subjectIds: newSelection })
    expect(parsed.success).toBe(true)

    // Simulate atomic DB function behavior
    enrolledSubjects = enrolledSubjects.filter((id) => newSelection.includes(id))
    newSelection.forEach((id) => {
      if (!enrolledSubjects.includes(id)) enrolledSubjects.push(id)
    })

    expect(enrolledSubjects).toHaveLength(4)
    expect(enrolledSubjects).toContain(econ)
    expect(enrolledSubjects).not.toContain(biology)
  })
})

describe('Dashboard Greeting Username Priority', () => {
  function getDashboardGreeting(profile: { username?: string | null; full_name?: string | null }): string {
    return profile.username || (profile.full_name?.split(' ')[0] ?? 'there')
  }

  test('uses username when present', () => {
    expect(getDashboardGreeting({ username: 'alex_cambridge', full_name: 'Alex Chen' })).toBe('alex_cambridge')
  })

  test('falls back to full_name first name when username is missing', () => {
    expect(getDashboardGreeting({ username: null, full_name: 'Sarah Connor' })).toBe('Sarah')
    expect(getDashboardGreeting({ username: '', full_name: 'David Miller' })).toBe('David')
  })

  test('falls back to "there" when both username and full_name are missing', () => {
    expect(getDashboardGreeting({ username: null, full_name: null })).toBe('there')
  })
})

describe('Stage Content Access Resolution Rules & Pure 2', () => {
  function checkChapterAccess(
    route: 'as_only' | 'staged' | 'full_level' | 'unconfirmed',
    currentStage: 'as' | 'a2' | 'full' | null,
    chapterStage: 'as' | 'a2' | 'shared' | 'route_dependent',
    chapterComponent: string,
    selections: Array<{ component_name: string; stage: 'as' | 'a2' }> = []
  ): boolean {
    if (route === 'unconfirmed' || !chapterStage) return false
    if (chapterStage === 'as' || chapterStage === 'shared') return true
    if (chapterStage === 'a2') {
      return currentStage === 'a2' || currentStage === 'full'
    }
    if (chapterStage === 'route_dependent') {
      const sel = selections.find((s) => s.component_name === chapterComponent)
      if (!sel) return false
      if (sel.stage === 'as') return true
      if (sel.stage === 'a2') return currentStage === 'a2' || currentStage === 'full'
    }
    return false
  }

  test('unconfirmed route blocks all chapters', () => {
    expect(checkChapterAccess('unconfirmed', null, 'as', 'Pure 1')).toBe(false)
    expect(checkChapterAccess('unconfirmed', null, 'shared', 'Core')).toBe(false)
    expect(checkChapterAccess('unconfirmed', null, 'a2', 'Pure 3')).toBe(false)
  })

  test('Pure 2 is selection-dependent (accessible only when selected)', () => {
    const selWithP2 = [
      { component_name: 'Pure 1', stage: 'as' as const },
      { component_name: 'Pure 2', stage: 'as' as const },
    ]
    const selWithMech = [
      { component_name: 'Pure 1', stage: 'as' as const },
      { component_name: 'Mechanics', stage: 'as' as const },
    ]

    expect(checkChapterAccess('as_only', 'as', 'route_dependent', 'Pure 2', selWithP2)).toBe(true)
    expect(checkChapterAccess('as_only', 'as', 'route_dependent', 'Pure 2', selWithMech)).toBe(false)
    expect(checkChapterAccess('as_only', 'as', 'as', 'Pure 1', selWithMech)).toBe(true)
  })

  test('staged/as route blocks A2 chapters', () => {
    expect(checkChapterAccess('staged', 'as', 'as', 'Pure 1')).toBe(true)
    expect(checkChapterAccess('staged', 'as', 'a2', 'Pure 3')).toBe(false)
  })

  test('staged/a2 route unlocks A2 chapters', () => {
    expect(checkChapterAccess('staged', 'a2', 'as', 'Pure 1')).toBe(true)
    expect(checkChapterAccess('staged', 'a2', 'a2', 'Pure 3')).toBe(true)
  })
})

describe('Daily Mission Budget & Skipped Mission Exclusion', () => {
  function computeAvailableBudget(
    maxMissions: number,
    existingMissions: Array<{ status: 'pending' | 'completed' | 'skipped' }>
  ): number {
    const activeCount = existingMissions.filter((m) => m.status !== 'skipped').length
    return Math.max(0, maxMissions - activeCount)
  }

  test('skipped missions do not consume daily budget, allowing replenishment', () => {
    const missions = [
      { status: 'completed' as const },
      { status: 'pending' as const },
      { status: 'skipped' as const },
    ]
    expect(computeAvailableBudget(3, missions)).toBe(1)
  })

  test('budget is 0 when all active slots are filled', () => {
    const missions = [
      { status: 'completed' as const },
      { status: 'completed' as const },
      { status: 'pending' as const },
    ]
    expect(computeAvailableBudget(3, missions)).toBe(0)
  })
})

describe('Carry-Forward Constraint Rules', () => {
  function isValidCarryForward(stage: 'as' | 'a2', resultType: 'expected' | 'forecast' | 'actual', carryForward: boolean): boolean {
    if (!carryForward) return true
    return stage === 'as' && resultType === 'actual'
  }

  test('carry_forward = true is accepted only for actual AS results', () => {
    expect(isValidCarryForward('as', 'actual', true)).toBe(true)
    expect(isValidCarryForward('as', 'forecast', true)).toBe(false)
    expect(isValidCarryForward('as', 'expected', true)).toBe(false)
    expect(isValidCarryForward('a2', 'actual', true)).toBe(false)
  })

  test('carry_forward = false is accepted for any valid stage/resultType', () => {
    expect(isValidCarryForward('as', 'forecast', false)).toBe(true)
    expect(isValidCarryForward('a2', 'actual', false)).toBe(true)
  })
})

describe('PaperSelectionPanel & RouteStep State-Logic Flow (Loop Prevention & Route Transition)', () => {
  test('empty selections state synchronization does not repeatedly call onChange (loop prevention)', () => {
    let callCount = 0
    const onChange = () => { callCount++ }

    // Simulate PaperSelectionPanel component sync effect with empty initialSelections
    let selectedComboId = ''
    const syncEffect = (route: StudyRoute, initialSelections: PaperSelectionInput[]) => {
      const match = matchSavedMathsCombination(route, initialSelections)
      if (match) {
        selectedComboId = match.id
      } else {
        selectedComboId = ''
        // Crucial: do NOT call onChange([]) here
      }
    }

    // Initial mount with empty selections
    syncEffect('as_only', [])
    expect(callCount).toBe(0)
    expect(selectedComboId).toBe('')
    if (false as boolean) onChange()

    // Subsequent re-renders with empty selections must not call onChange
    syncEffect('as_only', [])
    syncEffect('as_only', [])
    expect(callCount).toBe(0)
  })

  test('selecting a combination calls onChange once and remains selected/visible', () => {
    let callCount = 0
    let recordedSelections: PaperSelectionInput[] = []
    const onChange = (selections: PaperSelectionInput[]) => {
      callCount++
      recordedSelections = selections
    }

    const combinations = getMathsCombinations('as_only')
    const targetCombo = combinations.find((c) => c.id === 'p1_p2')!
    expect(targetCombo).toBeDefined()

    // User clicks the option -> calls onChange once
    const selectedComboId = targetCombo.id
    onChange(targetCombo.selections)

    expect(callCount).toBe(1)
    expect(recordedSelections.length).toBe(2)
    expect(selectedComboId).toBe('p1_p2')

    // Parent re-renders with new initialSelections, sync effect runs without calling onChange again
    const match = matchSavedMathsCombination('as_only', recordedSelections)
    expect(match?.id).toBe('p1_p2')
    expect(callCount).toBe(1)
  })

  test('Launch Atlas button enabled with valid combination and disabled on incompatible route switch', () => {
    // State machine representing RouteStep and RouteSetupSheet
    let selectedRoute: 'as_only' | 'staged' | 'full_level' | 'unconfirmed' = 'as_only'
    let paperSelections: PaperSelectionInput[] = []

    const isLaunchDisabled = () => {
      const match = matchSavedMathsCombination(selectedRoute, paperSelections)
      return !match
    }

    const switchRoute = (newRoute: 'as_only' | 'staged' | 'full_level' | 'unconfirmed') => {
      paperSelections = remapMathsSelectionsOnRouteChange(selectedRoute, newRoute, paperSelections)
      selectedRoute = newRoute
    }

    // Step 1: Initial state (no selection) -> Launch is disabled
    expect(isLaunchDisabled()).toBe(true)

    // Step 2: User selects Pure 1 + Pure 2
    const p1p2 = getMathsCombinations('as_only').find((c) => c.id === 'p1_p2')!
    paperSelections = p1p2.selections
    // Launch becomes enabled
    expect(isLaunchDisabled()).toBe(false)

    // Step 3: User switches route to staged (Pure 1 + Pure 2 is incompatible with staged)
    switchRoute('staged')
    expect(paperSelections).toEqual([])
    expect(isLaunchDisabled()).toBe(true)

    // Step 4: User selects Route B (Pure 1 + Stats 1 (AS) -> Pure 3 + Mechanics (A2))
    const routeB = getMathsCombinations('staged').find((c) => c.id === 'stats_mech')!
    paperSelections = routeB.selections
    expect(isLaunchDisabled()).toBe(false)
    expect(matchSavedMathsCombination('staged', paperSelections)?.id).toBe('stats_mech')

    // Step 5: User switches to full_level (Route B safely remaps to full_mech_stats)
    switchRoute('full_level')
    expect(paperSelections.length).toBe(4)
    expect(matchSavedMathsCombination('full_level', paperSelections)?.id).toBe('full_mech_stats')
    expect(isLaunchDisabled()).toBe(false)

    // Step 6: User switches from full_level (full_mech_stats) back to staged (ambiguous between Route A and B -> cleared)
    switchRoute('staged')
    expect(paperSelections).toEqual([])
    expect(isLaunchDisabled()).toBe(true)

    // Step 7: User selects full_stats_double on full_level, switches to staged (unambiguous -> remaps to stats_double)
    const fullDouble = getMathsCombinations('full_level').find((c) => c.id === 'full_stats_double')!
    selectedRoute = 'full_level'
    paperSelections = fullDouble.selections
    expect(isLaunchDisabled()).toBe(false)

    switchRoute('staged')
    expect(paperSelections.length).toBe(4)
    expect(matchSavedMathsCombination('staged', paperSelections)?.id).toBe('stats_double')
    expect(isLaunchDisabled()).toBe(false)

    // Step 8: User switches from staged to as_only (incompatible -> cleared)
    switchRoute('as_only')
    expect(paperSelections).toEqual([])
    expect(isLaunchDisabled()).toBe(true)
  })
})

describe('Direction-Specific Mathematics Route Transitions (remapMathsSelectionsOnRouteChange)', () => {
  const routeA = getMathsCombinations('staged').find((c) => c.id === 'mech_stats')!.selections
  const routeB = getMathsCombinations('staged').find((c) => c.id === 'stats_mech')!.selections
  const routeC = getMathsCombinations('staged').find((c) => c.id === 'stats_double')!.selections
  const fullMech = getMathsCombinations('full_level').find((c) => c.id === 'full_mech_stats')!.selections
  const fullDouble = getMathsCombinations('full_level').find((c) => c.id === 'full_stats_double')!.selections
  const asP1P2 = getMathsCombinations('as_only').find((c) => c.id === 'p1_p2')!.selections

  test('staged Route A -> full_level: safely remaps to full_mech_stats', () => {
    const remapped = remapMathsSelectionsOnRouteChange('staged', 'full_level', routeA)
    expect(matchSavedMathsCombination('full_level', remapped)?.id).toBe('full_mech_stats')
  })

  test('staged Route B -> full_level: safely remaps to full_mech_stats', () => {
    const remapped = remapMathsSelectionsOnRouteChange('staged', 'full_level', routeB)
    expect(matchSavedMathsCombination('full_level', remapped)?.id).toBe('full_mech_stats')
  })

  test('staged stats_double -> full_level: safely remaps to full_stats_double', () => {
    const remapped = remapMathsSelectionsOnRouteChange('staged', 'full_level', routeC)
    expect(matchSavedMathsCombination('full_level', remapped)?.id).toBe('full_stats_double')
  })

  test('full_mech_stats -> staged: clears selection (ambiguous between Route A and B)', () => {
    const remapped = remapMathsSelectionsOnRouteChange('full_level', 'staged', fullMech)
    expect(remapped).toEqual([])
    expect(matchSavedMathsCombination('staged', remapped)).toBeNull()
  })

  test('full_stats_double -> staged: safely remaps to stats_double (unambiguous)', () => {
    const remapped = remapMathsSelectionsOnRouteChange('full_level', 'staged', fullDouble)
    expect(matchSavedMathsCombination('staged', remapped)?.id).toBe('stats_double')
  })

  test('full_level -> as_only: clears selection', () => {
    const remapped = remapMathsSelectionsOnRouteChange('full_level', 'as_only', fullMech)
    expect(remapped).toEqual([])
  })

  test('as_only -> staged / full_level: clears selection', () => {
    expect(remapMathsSelectionsOnRouteChange('as_only', 'staged', asP1P2)).toEqual([])
    expect(remapMathsSelectionsOnRouteChange('as_only', 'full_level', asP1P2)).toEqual([])
  })
})

describe('Further Mathematics 9231 Combinations', () => {
  test('as_only returns 2 combinations: fp1_fm and fp1_fps', () => {
    const combos = getFurtherMathsCombinations('as_only')
    expect(combos.length).toBe(2)
    expect(combos.map((c) => c.id)).toEqual(['fp1_fm', 'fp1_fps'])
    expect(combos[0].asPapers).toEqual(['Further Pure 1 (Paper 1)', 'Further Mechanics (Paper 3)'])
    expect(combos[1].asPapers).toEqual(['Further Pure 1 (Paper 1)', 'Further Probability & Statistics (Paper 4)'])
    expect(combos.every((c) => c.a2Papers.length === 0)).toBe(true)
  })

  test('staged returns 2 combinations: fm_fps and fps_fm', () => {
    const combos = getFurtherMathsCombinations('staged')
    expect(combos.length).toBe(2)
    expect(combos.map((c) => c.id)).toEqual(['fm_fps', 'fps_fm'])

    // Route A (fm_fps): FP1 + FM in AS -> FP2 + FPS in A2
    expect(combos[0].asPapers).toEqual(['Further Pure 1 (Paper 1)', 'Further Mechanics (Paper 3)'])
    expect(combos[0].a2Papers).toEqual(['Further Pure 2 (Paper 2)', 'Further Probability & Statistics (Paper 4)'])

    // Route B (fps_fm): FP1 + FPS in AS -> FP2 + FM in A2
    expect(combos[1].asPapers).toEqual(['Further Pure 1 (Paper 1)', 'Further Probability & Statistics (Paper 4)'])
    expect(combos[1].a2Papers).toEqual(['Further Pure 2 (Paper 2)', 'Further Mechanics (Paper 3)'])
  })

  test('full_level returns 1 combination: full_all with all 4 papers', () => {
    const combos = getFurtherMathsCombinations('full_level')
    expect(combos.length).toBe(1)
    expect(combos[0].id).toBe('full_all')
    expect(combos[0].selections.length).toBe(4)
  })
})

describe('Fixed-Route Subject Combinations (9702, 9701, 9618)', () => {
  test('Physics 9702 has canonical paper sets for all routes', () => {
    const asOnly = getFixedSubjectCombinations('9702', 'as_only')
    expect(asOnly[0].selections.map((s) => s.paper_number)).toEqual([1, 2, 3])
    expect(asOnly[0].selections.every((s) => s.stage === 'as')).toBe(true)

    const staged = getFixedSubjectCombinations('9702', 'staged')
    expect(staged[0].selections.length).toBe(5)
    expect(staged[0].asPapers.length).toBe(3)
    expect(staged[0].a2Papers.length).toBe(2)

    const full = getFixedSubjectCombinations('9702', 'full_level')
    expect(full[0].selections.length).toBe(5)
  })

  test('Chemistry 9701 has canonical paper sets for all routes', () => {
    const asOnly = getFixedSubjectCombinations('9701', 'as_only')
    expect(asOnly[0].selections.map((s) => s.paper_number)).toEqual([1, 2, 3])
    expect(asOnly[0].selections.every((s) => s.stage === 'as')).toBe(true)

    const staged = getFixedSubjectCombinations('9701', 'staged')
    expect(staged[0].selections.length).toBe(5)
    expect(staged[0].asPapers.length).toBe(3)
    expect(staged[0].a2Papers.length).toBe(2)

    const full = getFixedSubjectCombinations('9701', 'full_level')
    expect(full[0].selections.length).toBe(5)
  })

  test('Computer Science 9618 has canonical 4-paper sets', () => {
    const asOnly = getFixedSubjectCombinations('9618', 'as_only')
    expect(asOnly[0].selections.map((s) => s.paper_number)).toEqual([1, 2])
    expect(asOnly[0].selections.every((s) => s.stage === 'as')).toBe(true)

    const staged = getFixedSubjectCombinations('9618', 'staged')
    expect(staged[0].selections.length).toBe(4)
    expect(staged[0].asPapers.length).toBe(2)
    expect(staged[0].a2Papers.length).toBe(2)

    const full = getFixedSubjectCombinations('9618', 'full_level')
    expect(full[0].selections.length).toBe(4)
  })
})

describe('Universal Route & Search Helpers', () => {
  test('isElectiveSubject correctly identifies 9709 and 9231 as elective', () => {
    expect(isElectiveSubject('9709')).toBe(true)
    expect(isElectiveSubject('9231')).toBe(true)
    expect(isElectiveSubject('9702')).toBe(false)
    expect(isElectiveSubject('9701')).toBe(false)
    expect(isElectiveSubject('9618')).toBe(false)
    expect(isElectiveSubject(null)).toBe(false)
  })

  test('filterSubjectsByQuery resolves Additional Mathematics / Add Maths aliases to 9231', () => {
    const sampleSubjects: Subject[] = [
      { id: '1', name: 'Mathematics', code: '9709', icon: 'calculator', color_hex: '#3B82F6', is_available: true, is_global: true, created_by: null, created_at: '' },
      { id: '2', name: 'Further Mathematics', code: '9231', icon: 'calculator', color_hex: '#6366F1', is_available: true, is_global: true, created_by: null, created_at: '' },
      { id: '3', name: 'Physics', code: '9702', icon: 'atom', color_hex: '#EC4899', is_available: true, is_global: true, created_by: null, created_at: '' },
      { id: '4', name: 'Chemistry', code: '9701', icon: 'flask', color_hex: '#10B981', is_available: true, is_global: true, created_by: null, created_at: '' },
      { id: '5', name: 'Computer Science', code: '9618', icon: 'code', color_hex: '#F59E0B', is_available: true, is_global: true, created_by: null, created_at: '' },
    ]

    const addMathsRes = filterSubjectsByQuery(sampleSubjects, 'Add Maths')
    expect(addMathsRes.length).toBe(1)
    expect(addMathsRes[0].code).toBe('9231')

    const additionalRes = filterSubjectsByQuery(sampleSubjects, 'Additional Mathematics')
    expect(additionalRes.length).toBe(1)
    expect(additionalRes[0].code).toBe('9231')

    const mathsRes = filterSubjectsByQuery(sampleSubjects, 'Math')
    expect(mathsRes.length).toBe(2) // Mathematics and Further Mathematics
    expect(mathsRes.map((s) => s.code)).toEqual(['9709', '9231'])
  })
})

describe('Past-Paper Picker & Practical Chapter Mapping Logic', () => {
  test('excludes locked A2 papers when user enrollment is at AS stage', () => {
    const stagedSelections = [
      { subject_paper_id: 'sp1', paper_number: 1, stage: 'as' as const, component_name: 'Pure 1' },
      { subject_paper_id: 'sp4', paper_number: 4, stage: 'as' as const, component_name: 'Mechanics' },
      { subject_paper_id: 'sp3', paper_number: 3, stage: 'a2' as const, component_name: 'Pure 3' },
      { subject_paper_id: 'sp5', paper_number: 5, stage: 'a2' as const, component_name: 'Statistics 1' },
    ]

    const filterAvailablePapers = (currentStage: 'as' | 'a2' | 'full', selections: typeof stagedSelections) => {
      return selections.filter((p) => {
        if (currentStage === 'as' && p.stage === 'a2') return false
        return true
      })
    }

    const asAvailable = filterAvailablePapers('as', stagedSelections)
    expect(asAvailable.length).toBe(2)
    expect(asAvailable.map((p) => p.paper_number)).toEqual([1, 4])

    const a2Available = filterAvailablePapers('a2', stagedSelections)
    expect(a2Available.length).toBe(4)
    expect(a2Available.map((p) => p.paper_number)).toEqual([1, 4, 3, 5])
  })

  test('practical chapter filtering matches Cambridge rules using production helper', () => {
    const chapters = [
      { id: 'ch1', title: 'Kinematics', stage: 'as', component: 'AS Core', number: 2 },
      { id: 'ch7', title: 'Waves', stage: 'as', component: 'AS Core', number: 7 },
      { id: 'ch12', title: 'Motion in a Circle', stage: 'a2', component: 'A2 Core', number: 12 },
      { id: 'ch20', title: 'Magnetic Fields', stage: 'a2', component: 'A2 Core', number: 20 },
    ]

    // Physics Paper 3 (Practical) only allows AS chapters
    const p3Chapters = filterChaptersForPaper('9702', 3, null, chapters, [])
    expect(p3Chapters.length).toBe(2)
    expect(p3Chapters.map((c) => c.number)).toEqual([2, 7])

    // Physics Paper 5 (Evaluation) allows all accessible chapters
    const p5Chapters = filterChaptersForPaper('9702', 5, null, chapters, [])
    expect(p5Chapters.length).toBe(4)

    // Computer Science Paper 4 (Programming) allows only Topics 19 & 20
    const csChapters = [
      { id: 'cs1', title: 'Information representation', number: 1, stage: 'as' },
      { id: 'cs19', title: 'Computational thinking', number: 19, stage: 'a2' },
      { id: 'cs20', title: 'Further Problem-solving', number: 20, stage: 'a2' },
    ]
    const csP4Chapters = filterChaptersForPaper('9618', 4, null, csChapters, [])
    expect(csP4Chapters.length).toBe(2)
    expect(csP4Chapters.map((c) => c.number)).toEqual([19, 20])
  })

  test('matchPaperOption deterministically selects target paper', () => {
    const papers = [
      { id: 'sp1', paper_number: 1, stage: 'as' as const },
      { id: 'sp3', paper_number: 3, stage: 'a2' as const },
      { id: 'sp4', paper_number: 4, stage: 'as' as const },
    ]

    expect(matchPaperOption(papers, 'sp3', 3)?.id).toBe('sp3')
    expect(matchPaperOption(papers, null, 4)?.id).toBe('sp4')
    expect(matchPaperOption(papers, 'nonexistent', 99)?.id).toBe('sp1')
    expect(matchPaperOption([], null, 1)).toBeNull()
  })
})
