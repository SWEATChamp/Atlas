import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  AssignPaperStageSchema,
  validateAssignPaperStageInput,
} from '@/lib/validations/papers'
import {
  applyOptimisticPaperStage,
  applyConfirmedPaperStage,
  applyRollbackPaperStage,
  createInFlightGuard,
  canNavigatePaper,
  canEditPaper,
  canDeletePaper,
  computeEffectiveStage,
  computeModalStage,
  type PaperStageState,
} from '@/lib/papers-state'
import { assignPaperStage } from '@/lib/actions/papers'
import type { PaperWithSubject } from '@/types'

// Mock Supabase server client and Next.js revalidation
const mockGetUser = vi.fn()
const mockUpdate = vi.fn()
const mockEqUser = vi.fn()
const mockEqId = vi.fn()
const mockIsStage = vi.fn()
const mockSelect = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: vi.fn(() => ({
      update: mockUpdate,
    })),
  })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

function makeMockPaper(id: string, stage: 'as' | 'a2' | null = null): PaperWithSubject {
  return {
    id,
    user_id: 'u-1',
    subject_id: 's-math',
    subject_paper_id: 'sp-1',
    year: 2025,
    session: 'may_jun',
    paper_number: 12,
    paper_code: '9709/12/M/J/25',
    score_raw: 65,
    score_max: 75,
    accuracy_pct: 86.67,
    time_taken_mins: 90,
    stage,
    notes: null,
    attempted_at: '2026-08-27T08:00:00.000Z',
    created_at: '2026-08-27T08:00:00.000Z',
    updated_at: '2026-08-27T08:00:00.000Z',
    subjects: {
      id: 's-math',
      name: 'Mathematics',
      code: '9709',
      color_hex: '#3b82f6',
    },
  } as unknown as PaperWithSubject
}

describe('Paper Stage Input Validation (Production Schema)', () => {
  it('validates schema directly on valid and invalid payloads', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000'
    expect(AssignPaperStageSchema.safeParse({ paperId: validUuid, stage: 'as' }).success).toBe(true)
    expect(AssignPaperStageSchema.safeParse({ paperId: validUuid, stage: 'a2' }).success).toBe(true)
    expect(AssignPaperStageSchema.safeParse({ paperId: validUuid, stage: 'invalid' }).success).toBe(false)
    expect(AssignPaperStageSchema.safeParse({ paperId: '123', stage: 'as' }).success).toBe(false)
  })

  it('validates correct UUIDs and valid stages via helper', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000'
    const resAs = validateAssignPaperStageInput(validUuid, 'as')
    expect(resAs.success).toBe(true)
    if (resAs.success) {
      expect(resAs.data.paperId).toBe(validUuid)
      expect(resAs.data.stage).toBe('as')
    }

    const resA2 = validateAssignPaperStageInput(validUuid, 'a2')
    expect(resA2.success).toBe(true)
  })

  it('rejects malformed paper IDs and invalid stages', () => {
    const invalidId = 'not-a-uuid'
    const res1 = validateAssignPaperStageInput(invalidId, 'as')
    expect(res1.success).toBe(false)
    if (!res1.success) {
      expect(res1.error.issues[0].message).toBe('Invalid paper ID format')
    }

    const validUuid = '550e8400-e29b-41d4-a716-446655440000'
    const res2 = validateAssignPaperStageInput(validUuid, 'invalid_stage')
    expect(res2.success).toBe(false)
    if (!res2.success) {
      expect(res2.error.issues[0].message).toBe('Stage must be either "as" or "a2"')
    }
  })
})

describe('Paper Stage State Reducers & Card Policies', () => {
  it('applies optimistic stage tagging immediately and tracks pending assignment', () => {
    const paper1 = makeMockPaper('p-1', null)
    const paper2 = makeMockPaper('p-2', 'a2')

    const initialState: PaperStageState = {
      papers: [paper1, paper2],
      untaggedPapers: [paper1],
      pendingAssignments: {},
      errorNotice: null,
    }

    const nextState = applyOptimisticPaperStage(initialState, 'p-1', 'as')
    expect(nextState.papers.find((p) => p.id === 'p-1')?.stage).toBe('as')
    expect(nextState.pendingAssignments['p-1']).toBe('as')
    expect(nextState.untaggedPapers.some((p) => p.id === 'p-1')).toBe(true)
    expect(nextState.errorNotice).toBeNull()
  })

  it('confirms server success and cleans untagged list', () => {
    const paper1 = makeMockPaper('p-1', null)
    const initialState: PaperStageState = {
      papers: [paper1],
      untaggedPapers: [paper1],
      pendingAssignments: { 'p-1': 'as' },
      errorNotice: null,
    }

    const confirmedState = applyConfirmedPaperStage(initialState, 'p-1', 'as')
    expect(confirmedState.pendingAssignments['p-1']).toBeUndefined()
    expect(confirmedState.untaggedPapers.some((p) => p.id === 'p-1')).toBe(false)
    expect(confirmedState.papers.find((p) => p.id === 'p-1')?.stage).toBe('as')
  })

  it('rolls back optimistic state on failure and records error notice', () => {
    const paper1 = makeMockPaper('p-1', 'as')
    const initialState: PaperStageState = {
      papers: [paper1],
      untaggedPapers: [makeMockPaper('p-1', null)],
      pendingAssignments: { 'p-1': 'as' },
      errorNotice: null,
    }

    const rolledBackState = applyRollbackPaperStage(initialState, 'p-1', 'Network error')
    expect(rolledBackState.pendingAssignments['p-1']).toBeUndefined()
    expect(rolledBackState.papers.find((p) => p.id === 'p-1')?.stage).toBeNull()
    expect(rolledBackState.errorNotice).toBe('Network error')
    expect(rolledBackState.untaggedPapers.some((p) => p.id === 'p-1')).toBe(true)
  })

  it('evaluates production card interaction policy helpers correctly', () => {
    // Navigation policy
    expect(canNavigatePaper(true, false)).toBe(false)
    expect(canNavigatePaper(false, true)).toBe(false)
    expect(canNavigatePaper(false, false)).toBe(true)

    // Edit policy
    expect(canEditPaper(true, true)).toBe(false)
    expect(canEditPaper(false, false)).toBe(false)
    expect(canEditPaper(false, true)).toBe(true)

    // Delete policy
    expect(canDeletePaper(true, false)).toBe(false)
    expect(canDeletePaper(false, true)).toBe(false)
    expect(canDeletePaper(false, false)).toBe(true)

    // Effective and modal stage calculation
    expect(computeEffectiveStage('as', null)).toBe('as')
    expect(computeEffectiveStage(undefined, 'a2')).toBe('a2')
    expect(computeEffectiveStage(undefined, null)).toBeNull()
    expect(computeModalStage('a2')).toBe('a2')
    expect(computeModalStage(null)).toBe('as')
  })

  it('production inFlightGuard synchronously blocks duplicate and conflicting actions', () => {
    const guard = createInFlightGuard()
    const paperId = '550e8400-e29b-41d4-a716-446655440000'

    expect(guard.acquire(paperId)).toBe(true)
    expect(guard.isInFlight(paperId)).toBe(true)
    // Duplicate acquire returns false
    expect(guard.acquire(paperId)).toBe(false)

    // After release, re-acquire succeeds
    guard.release(paperId)
    expect(guard.isInFlight(paperId)).toBe(false)
    expect(guard.acquire(paperId)).toBe(true)
  })
})

describe('assignPaperStage Server Action (Production Boundary)', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000'

  beforeEach(() => {
    vi.clearAllMocks()

    mockSelect.mockReset()
    mockIsStage.mockReset().mockReturnValue({ select: mockSelect })
    mockEqUser.mockReset().mockReturnValue({ is: mockIsStage })
    mockEqId.mockReset().mockReturnValue({ eq: mockEqUser })
    mockUpdate.mockReset().mockReturnValue({ eq: mockEqId })
  })

  it('returns error when user is unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })

    const res = await assignPaperStage(validUuid, 'as')
    expect(res.success).toBe(false)
    expect(res.error).toBe('Not authenticated')
  })

  it('returns validation error on malformed inputs before calling database', async () => {
    const res = await assignPaperStage('bad-uuid', 'as')
    expect(res.success).toBe(false)
    expect(res.error).toBe('Invalid paper ID format')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns error when paper is missing, already tagged, or unauthorized', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u-123' } } })
    // Simulates 0 rows matching (because stage was not null or id belonged to someone else)
    mockSelect.mockResolvedValueOnce({ data: [], error: null })

    const res = await assignPaperStage(validUuid, 'as')
    expect(res.success).toBe(false)
    expect(res.error).toBe('Past paper not found, already tagged, or access denied.')
  })

  it('returns error when database update encounters an error', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u-123' } } })
    mockSelect.mockResolvedValueOnce({ data: null, error: { message: 'Database constraint failed' } })

    const res = await assignPaperStage(validUuid, 'as')
    expect(res.success).toBe(false)
    expect(res.error).toBe('Failed to update paper stage. Please try again.')
  })

  it('successfully updates untagged paper and returns confirmation', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u-123' } } })
    mockSelect.mockResolvedValueOnce({ data: [{ id: validUuid }], error: null })

    const res = await assignPaperStage(validUuid, 'as')
    expect(res.success).toBe(true)
    expect(res.paperId).toBe(validUuid)
    expect(res.stage).toBe('as')
    expect(mockUpdate).toHaveBeenCalledWith({ stage: 'as' })
    expect(mockEqId).toHaveBeenCalledWith('id', validUuid)
    expect(mockEqUser).toHaveBeenCalledWith('user_id', 'u-123')
    expect(mockIsStage).toHaveBeenCalledWith('stage', null)
  })
})
