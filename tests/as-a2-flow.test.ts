import { describe, expect, test } from 'vitest'
import { getMathsCombinations } from '../components/subjects/paper-selection-panel'
import { StudyRouteStepSchema } from '../lib/validators/onboarding'

describe('AS/A2 Mathematics Combinations', () => {
  test('as_only route gives 2-paper AS combinations only', () => {
    const combos = getMathsCombinations('as_only')
    expect(combos.length).toBe(2)
    expect(combos[0].selections.length).toBe(2)
    expect(combos[0].selections.every((s) => s.stage === 'as')).toBe(true)
    expect(combos[1].selections.every((s) => s.stage === 'as')).toBe(true)
  })

  test('staged and full_level routes provide 4-paper combinations including Pure 3', () => {
    const stagedCombos = getMathsCombinations('staged')
    expect(stagedCombos.length).toBe(2)
    expect(stagedCombos[0].selections.length).toBe(4)
    expect(stagedCombos[0].selections.some((s) => s.component_name === 'Pure 3' && s.stage === 'a2')).toBe(true)

    const fullCombos = getMathsCombinations('full_level')
    expect(fullCombos.length).toBe(2)
    expect(fullCombos[0].selections.length).toBe(4)
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

describe('Stage Content Access Resolution Rules', () => {
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

  test('as_only route grants access to AS and shared chapters only', () => {
    expect(checkChapterAccess('as_only', 'as', 'as', 'Pure 1')).toBe(true)
    expect(checkChapterAccess('as_only', 'as', 'shared', 'Core')).toBe(true)
    expect(checkChapterAccess('as_only', 'as', 'a2', 'Pure 3')).toBe(false)
  })

  test('staged/as route blocks A2 chapters', () => {
    expect(checkChapterAccess('staged', 'as', 'as', 'Pure 1')).toBe(true)
    expect(checkChapterAccess('staged', 'as', 'a2', 'Pure 3')).toBe(false)
  })

  test('staged/a2 route unlocks A2 chapters', () => {
    expect(checkChapterAccess('staged', 'a2', 'as', 'Pure 1')).toBe(true)
    expect(checkChapterAccess('staged', 'a2', 'a2', 'Pure 3')).toBe(true)
  })

  test('route_dependent chapter accessibility resolves via paper selection', () => {
    const selAs = [{ component_name: 'Mechanics', stage: 'as' as const }]
    const selA2 = [{ component_name: 'Mechanics', stage: 'a2' as const }]

    // When Mechanics is chosen as AS:
    expect(checkChapterAccess('staged', 'as', 'route_dependent', 'Mechanics', selAs)).toBe(true)

    // When Mechanics is chosen as A2 and user is in AS stage:
    expect(checkChapterAccess('staged', 'as', 'route_dependent', 'Mechanics', selA2)).toBe(false)

    // When Mechanics is chosen as A2 and user is in A2 stage:
    expect(checkChapterAccess('staged', 'a2', 'route_dependent', 'Mechanics', selA2)).toBe(true)

    // When no selection was made:
    expect(checkChapterAccess('staged', 'as', 'route_dependent', 'Mechanics', [])).toBe(false)
  })
})

describe('Mission Undo Timing Window', () => {
  function isUndoAllowed(
    completedAtIso: string,
    nowMs: number,
    sameLocalCalendarDay: boolean
  ): boolean {
    if (!sameLocalCalendarDay) return false
    const diffMins = (nowMs - new Date(completedAtIso).getTime()) / (1000 * 60)
    return diffMins >= 0 && diffMins <= 10
  }

  test('allows undo within 10 minutes on same day', () => {
    const now = new Date('2026-08-26T12:05:00Z').getTime()
    const completedAt = '2026-08-26T12:00:00Z'
    expect(isUndoAllowed(completedAt, now, true)).toBe(true)
  })

  test('blocks undo after 10 minutes on same day', () => {
    const now = new Date('2026-08-26T12:11:00Z').getTime()
    const completedAt = '2026-08-26T12:00:00Z'
    expect(isUndoAllowed(completedAt, now, true)).toBe(false)
  })

  test('blocks undo on different calendar day even within 10 minutes', () => {
    const now = new Date('2026-08-26T00:02:00Z').getTime()
    const completedAt = '2026-08-25T23:58:00Z'
    expect(isUndoAllowed(completedAt, now, false)).toBe(false)
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

describe('Unauthenticated SQL Logic (IS DISTINCT FROM)', () => {
  function isAuthorized(authUid: string | null, targetUserId: string): boolean {
    // In SQL: auth.uid() IS DISTINCT FROM p_user_id
    const isDistinct = authUid === null || authUid !== targetUserId
    return !isDistinct
  }

  test('rejects unauthenticated calls (authUid is null)', () => {
    expect(isAuthorized(null, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toBe(false)
  })

  test('rejects mismatched user IDs', () => {
    expect(isAuthorized('user-1', 'user-2')).toBe(false)
  })

  test('accepts matching authenticated user ID', () => {
    expect(isAuthorized('user-1', 'user-1')).toBe(true)
  })
})

describe('Dashboard Skipped Missions Filter', () => {
  test('filters out skipped stale missions from active daily list', () => {
    const missions = [
      { id: 'm1', status: 'pending', title: 'Chapter 1' },
      { id: 'm2', status: 'completed', title: 'Chapter 2' },
      { id: 'm3', status: 'skipped', title: 'Chapter 3 (inaccessible)' },
    ]
    const active = missions.filter((m) => m.status !== 'skipped')
    expect(active.length).toBe(2)
    expect(active.some((m) => m.id === 'm3')).toBe(false)
  })
})

describe('Past Paper Insert Stage Rules', () => {
  function canInsertPaper(stage: 'as' | 'a2' | null, route: string, currentStage: string | null): boolean {
    if (stage === null) return false // New inserts MUST specify stage
    if (stage === 'as') return route !== 'unconfirmed'
    if (stage === 'a2') return currentStage === 'a2' || currentStage === 'full'
    return false
  }

  test('rejects new paper insert with stage = null', () => {
    expect(canInsertPaper(null, 'staged', 'as')).toBe(false)
  })

  test('allows stage = as for confirmed study route', () => {
    expect(canInsertPaper('as', 'staged', 'as')).toBe(true)
    expect(canInsertPaper('as', 'as_only', 'as')).toBe(true)
    expect(canInsertPaper('as', 'unconfirmed', null)).toBe(false)
  })

  test('allows stage = a2 only when A2 is unlocked', () => {
    expect(canInsertPaper('a2', 'staged', 'as')).toBe(false)
    expect(canInsertPaper('a2', 'staged', 'a2')).toBe(true)
    expect(canInsertPaper('a2', 'full_level', 'full')).toBe(true)
  })
})

