import { describe, expect, it, vi, beforeEach } from 'vitest'
import { configureSubjectRoute, transitionToA2 } from '../lib/actions/route'

const mockRpc = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    rpc: mockRpc,
    from: vi.fn(),
  })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('Server Actions: Route & A2 Transition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({
      data: { user: { id: '00000000-0000-4000-a000-000000000001' } },
    })
  })

  describe('configureSubjectRoute', () => {
    it('validates payload and calls configure_subject_route RPC', async () => {
      mockRpc.mockResolvedValue({ error: null })

      const res = await configureSubjectRoute({
        userSubjectId: '00000000-0000-4000-a000-000000000002',
        route: 'staged',
        paperSelections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
          { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
          { component_name: 'Statistics 1', paper_number: 5, stage: 'a2' },
        ],
      })

      expect(res.success).toBe(true)
      expect(mockRpc).toHaveBeenCalledWith('configure_subject_route', {
        p_user_id: '00000000-0000-4000-a000-000000000001',
        p_user_subject_id: '00000000-0000-4000-a000-000000000002',
        p_route: 'staged',
        p_paper_selections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
          { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
          { component_name: 'Statistics 1', paper_number: 5, stage: 'a2' },
        ],
      })
    })

    it('rejects invalid UUID or invalid route', async () => {
      const res = await configureSubjectRoute({
        userSubjectId: 'invalid-uuid',
        route: 'staged',
      })

      expect(res.error).toBeDefined()
      expect(mockRpc).not.toHaveBeenCalled()
    })
  })

  describe('transitionToA2', () => {
    it('calls transition_to_a2 with p_paper_selections when provided', async () => {
      mockRpc.mockResolvedValue({ error: null })

      const res = await transitionToA2({
        userSubjectId: '00000000-0000-4000-a000-000000000002',
        unlockMethod: 'manual',
        paperSelections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
          { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
          { component_name: 'Statistics 1', paper_number: 5, stage: 'a2' },
        ],
      })

      expect(res.success).toBe(true)
      expect(mockRpc).toHaveBeenCalledWith('transition_to_a2', {
        p_user_id: '00000000-0000-4000-a000-000000000001',
        p_user_subject_id: '00000000-0000-4000-a000-000000000002',
        p_unlock_method: 'manual',
        p_result_type: null,
        p_score_obtained: null,
        p_score_maximum: null,
        p_exam_series: null,
        p_exam_year: null,
        p_carry_forward: false,
        p_paper_selections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
          { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
          { component_name: 'Statistics 1', paper_number: 5, stage: 'a2' },
        ],
      })
    })

    it('calls transition_to_a2 with null p_paper_selections when omitted', async () => {
      mockRpc.mockResolvedValue({ error: null })

      const res = await transitionToA2({
        userSubjectId: '00000000-0000-4000-a000-000000000002',
        unlockMethod: 'normal_transition',
        resultType: 'actual',
        scoreObtained: 85,
        scoreMaximum: 100,
        examSeries: 'may_jun',
        examYear: 2025,
        carryForward: true,
      })

      expect(res.success).toBe(true)
      expect(mockRpc).toHaveBeenCalledWith('transition_to_a2', {
        p_user_id: '00000000-0000-4000-a000-000000000001',
        p_user_subject_id: '00000000-0000-4000-a000-000000000002',
        p_unlock_method: 'normal_transition',
        p_result_type: 'actual',
        p_score_obtained: 85,
        p_score_maximum: 100,
        p_exam_series: 'may_jun',
        p_exam_year: 2025,
        p_carry_forward: true,
        p_paper_selections: null,
      })
    })

    it('surfaces custom RPC errors like p1_p2 selection requirement', async () => {
      mockRpc.mockResolvedValue({
        error: { message: 'Mathematics p1_p2 must select a valid staged paper combination before transitioning to A2' },
      })

      const res = await transitionToA2({
        userSubjectId: '00000000-0000-4000-a000-000000000002',
        unlockMethod: 'manual',
      })

      expect(res.error).toBe(
        'Mathematics p1_p2 must select a valid staged paper combination before transitioning to A2'
      )
    })
  })
})
