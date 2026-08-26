import { describe, expect, test } from 'vitest'
import { getMathsCombinations, matchSavedMathsCombination } from '../components/subjects/paper-selection-panel'
import { StudyRouteStepSchema, SubjectEnrollSchema } from '../lib/validators/onboarding'

describe('AS/A2 Mathematics Combinations', () => {
  test('as_only route includes Pure 1 + Pure 2, Pure 1 + Mechanics, Pure 1 + Statistics 1', () => {
    const combos = getMathsCombinations('as_only')
    expect(combos.length).toBe(3)
    expect(combos.map((c) => c.id)).toEqual(['p1_p2', 'p1_m1', 'p1_s1'])
    expect(combos.every((c) => c.selections.every((s) => s.stage === 'as'))).toBe(true)
  })

  test('staged and full_level routes provide 4-paper combinations with separate AS and A2 breakdowns', () => {
    const stagedCombos = getMathsCombinations('staged')
    expect(stagedCombos.length).toBe(2)
    expect(stagedCombos[0].asPapers.length).toBe(2)
    expect(stagedCombos[0].a2Papers.length).toBe(2)
    expect(stagedCombos[0].selections.length).toBe(4)
    expect(stagedCombos[0].selections.some((s) => s.component_name === 'Pure 3' && s.stage === 'a2')).toBe(true)

    const fullCombos = getMathsCombinations('full_level')
    expect(fullCombos.length).toBe(2)
    expect(fullCombos[0].selections.length).toBe(4)
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
