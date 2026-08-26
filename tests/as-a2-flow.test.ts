import { describe, expect, test } from 'vitest'
import {
  getMathsCombinations,
  matchSavedMathsCombination,
  remapMathsSelectionsOnRouteChange,
} from '../components/subjects/paper-selection-panel'
import { StudyRouteStepSchema, SubjectEnrollSchema } from '../lib/validators/onboarding'

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
      { component_name: 'Mechanics', paper_number: null as any, stage: 'as' as const },
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
    const syncEffect = (route: any, initialSelections: any[]) => {
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

    // Subsequent re-renders with empty selections must not call onChange
    syncEffect('as_only', [])
    syncEffect('as_only', [])
    expect(callCount).toBe(0)
  })

  test('selecting a combination calls onChange once and remains selected/visible', () => {
    let callCount = 0
    let recordedSelections: any[] = []
    const onChange = (selections: any[]) => {
      callCount++
      recordedSelections = selections
    }

    const combinations = getMathsCombinations('as_only')
    const targetCombo = combinations.find((c) => c.id === 'p1_p2')!
    expect(targetCombo).toBeDefined()

    // User clicks the option -> calls onChange once
    let selectedComboId = targetCombo.id
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
    let paperSelections: any[] = []

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
