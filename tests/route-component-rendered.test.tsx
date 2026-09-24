import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import RouteSetupSheet from '../components/subjects/route-setup-sheet'
import A2TransitionModal from '../components/subjects/a2-transition-modal'
import * as routeActions from '../lib/actions/route'
import type { Subject, UserSubject, SubjectPaperSelection } from '../types'

vi.mock('../lib/actions/route', () => ({
  configureSubjectRoute: vi.fn(),
  transitionToA2: vi.fn(),
}))

const mockSubjectMaths: Subject = {
  id: '00000000-0000-4000-a000-000000000010',
  code: '9709',
  name: 'Mathematics',
  color_hex: '#3b82f6',
  icon: 'calculator',
  is_global: true,
  is_available: true,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
}

const mockSubjectPhysics: Subject = {
  id: '00000000-0000-4000-a000-000000000011',
  code: '9702',
  name: 'Physics',
  color_hex: '#8b5cf6',
  icon: 'atom',
  is_global: true,
  is_available: true,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
}

const mockSubjectFurtherMaths: Subject = {
  id: '00000000-0000-4000-a000-000000000012',
  code: '9231',
  name: 'Further Mathematics',
  color_hex: '#10b981',
  icon: 'function',
  is_global: true,
  is_available: true,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
}

const mockEnrollmentMathsAsOnly: UserSubject = {
  id: '00000000-0000-4000-a000-000000000020',
  user_id: '00000000-0000-4000-a000-000000000001',
  subject_id: mockSubjectMaths.id,
  study_route: 'as_only',
  current_stage: 'as',
  a2_unlocked_at: null,
  a2_unlock_method: null,
  exam_date: null,
  target_grade: null,
  priority: 1,
  is_archived: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockEnrollmentPhysicsAsOnly: UserSubject = {
  id: '00000000-0000-4000-a000-000000000021',
  user_id: '00000000-0000-4000-a000-000000000001',
  subject_id: mockSubjectPhysics.id,
  study_route: 'as_only',
  current_stage: 'as',
  a2_unlocked_at: null,
  a2_unlock_method: null,
  exam_date: null,
  target_grade: null,
  priority: 1,
  is_archived: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockEnrollmentFurtherMathsAsOnly: UserSubject = {
  id: '00000000-0000-4000-a000-000000000022',
  user_id: '00000000-0000-4000-a000-000000000001',
  subject_id: mockSubjectFurtherMaths.id,
  study_route: 'as_only',
  current_stage: 'as',
  a2_unlocked_at: null,
  a2_unlock_method: null,
  exam_date: null,
  target_grade: null,
  priority: 1,
  is_archived: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('Rendered Component Suite: Route Setup Sheet & A2 Transition Modal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('RouteSetupSheet', () => {
    it('renders with initial selections and remaps on route click', async () => {
      vi.mocked(routeActions.configureSubjectRoute).mockResolvedValue({ success: true })

      const initialSelections: SubjectPaperSelection[] = [
        {
          id: 'sps-1',
          user_subject_id: mockEnrollmentMathsAsOnly.id,
          component_name: 'Pure 1',
          paper_number: 1,
          stage: 'as',
          subject_paper_id: 'sp-1',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'sps-2',
          user_subject_id: mockEnrollmentMathsAsOnly.id,
          component_name: 'Mechanics',
          paper_number: 4,
          stage: 'as',
          subject_paper_id: 'sp-4',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]

      const onClose = vi.fn()
      render(
        <RouteSetupSheet
          isOpen={true}
          onClose={onClose}
          enrollment={mockEnrollmentMathsAsOnly}
          subject={mockSubjectMaths}
          initialPaperSelections={initialSelections}
        />
      )

      expect(screen.getByText('Configure Study Route')).toBeDefined()

      // Switch to Staged A Level route
      const stagedBtn = screen.getByText('Staged A Level')
      fireEvent.click(stagedBtn)

      // Save changes
      const saveBtn = screen.getByText('Confirm Route')
      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(routeActions.configureSubjectRoute).toHaveBeenCalledWith({
          userSubjectId: mockEnrollmentMathsAsOnly.id,
          route: 'staged',
          paperSelections: [
            { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
            { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
            { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
            { component_name: 'Statistics 1', paper_number: 5, stage: 'a2' },
          ],
        })
      })
    })

    it('fixed subject automatically resolves canonical selections', async () => {
      vi.mocked(routeActions.configureSubjectRoute).mockResolvedValue({ success: true })

      const onClose = vi.fn()
      render(
        <RouteSetupSheet
          isOpen={true}
          onClose={onClose}
          enrollment={mockEnrollmentPhysicsAsOnly}
          subject={mockSubjectPhysics}
        />
      )

      // Select Staged route
      const stagedBtn = screen.getByText('Staged A Level')
      fireEvent.click(stagedBtn)

      const saveBtn = screen.getByText('Confirm Route')
      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(routeActions.configureSubjectRoute).toHaveBeenCalledWith({
          userSubjectId: mockEnrollmentPhysicsAsOnly.id,
          route: 'staged',
          paperSelections: [
            { component_name: 'Multiple Choice (AS)', paper_number: 1, stage: 'as' },
            { component_name: 'AS Level Structured Questions', paper_number: 2, stage: 'as' },
            { component_name: 'Advanced Practical Skills', paper_number: 3, stage: 'as' },
            { component_name: 'A Level Structured Questions', paper_number: 4, stage: 'a2' },
            { component_name: 'Planning, Analysis and Evaluation', paper_number: 5, stage: 'a2' },
          ],
        })
      })
    })
  })

  describe('A2TransitionModal', () => {
    it('filters choices for Mathematics p1_m1 to allow only mech_stats and never offers stats_mech or stats_double', async () => {
      vi.mocked(routeActions.transitionToA2).mockResolvedValue({ success: true })

      const p1m1Selections: SubjectPaperSelection[] = [
        {
          id: 'sps-1',
          user_subject_id: mockEnrollmentMathsAsOnly.id,
          component_name: 'Pure 1',
          paper_number: 1,
          stage: 'as',
          subject_paper_id: 'sp-1',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'sps-2',
          user_subject_id: mockEnrollmentMathsAsOnly.id,
          component_name: 'Mechanics',
          paper_number: 4,
          stage: 'as',
          subject_paper_id: 'sp-4',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]

      const onClose = vi.fn()
      render(
        <A2TransitionModal
          isOpen={true}
          onClose={onClose}
          enrollment={mockEnrollmentMathsAsOnly}
          subject={mockSubjectMaths}
          paperSelections={p1m1Selections}
        />
      )

      const continueBtn = screen.getByText('Continue to A2 (Switch to Staged)')
      fireEvent.click(continueBtn)

      // Radiogroup must be present
      const radioGroup = screen.getByRole('radiogroup')
      expect(radioGroup).toBeDefined()

      // mech_stats must be rendered and checked
      const mechStatsRadio = screen.getByRole('radio', { name: /Pure 1 \+ Mechanics \(AS\) → Pure 3 \+ Stats 1 \(A2\)/i }) as HTMLInputElement
      expect(mechStatsRadio.checked).toBe(true)

      // Neither stats_mech nor stats_double must be offered
      expect(screen.queryByText(/Pure 1 \+ Statistics 1 \(AS\) → Pure 3 \+ Mechanics \(A2\)/i)).toBeNull()
      expect(screen.queryByText(/Pure 1 \+ Statistics 1 \(AS\) → Pure 3 \+ Statistics 2 \(A2\)/i)).toBeNull()

      const unlockNowBtn = screen.getByRole('button', { name: /unlock now/i })
      fireEvent.click(unlockNowBtn)

      await waitFor(() => {
        expect(routeActions.transitionToA2).toHaveBeenCalledWith(
          expect.objectContaining({
            userSubjectId: mockEnrollmentMathsAsOnly.id,
            unlockMethod: 'manual',
            paperSelections: [
              { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
              { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
              { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
              { component_name: 'Statistics 1', paper_number: 5, stage: 'a2' },
            ],
          })
        )
      })
    })

    it('defaults Mathematics p1_s1 to stats_mech, allows stats_double, and never offers mech_stats', async () => {
      vi.mocked(routeActions.transitionToA2).mockResolvedValue({ success: true })

      const p1s1Selections: SubjectPaperSelection[] = [
        {
          id: 'sps-1',
          user_subject_id: mockEnrollmentMathsAsOnly.id,
          component_name: 'Pure 1',
          paper_number: 1,
          stage: 'as',
          subject_paper_id: 'sp-1',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'sps-2',
          user_subject_id: mockEnrollmentMathsAsOnly.id,
          component_name: 'Statistics 1',
          paper_number: 5,
          stage: 'as',
          subject_paper_id: 'sp-5',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]

      const onClose = vi.fn()
      render(
        <A2TransitionModal
          isOpen={true}
          onClose={onClose}
          enrollment={mockEnrollmentMathsAsOnly}
          subject={mockSubjectMaths}
          paperSelections={p1s1Selections}
        />
      )

      const continueBtn = screen.getByText('Continue to A2 (Switch to Staged)')
      fireEvent.click(continueBtn)

      // Radiogroup must be present
      const radioGroup = screen.getByRole('radiogroup')
      expect(radioGroup).toBeDefined()

      // Never offer mech_stats
      expect(screen.queryByText(/Pure 1 \+ Mechanics \(AS\) → Pure 3 \+ Stats 1 \(A2\)/i)).toBeNull()

      // Default is stats_mech
      const statsMechRadio = screen.getByDisplayValue('stats_mech') as HTMLInputElement
      expect(statsMechRadio.checked).toBe(true)

      // stats_double is offered
      const statsDoubleRadio = screen.getByDisplayValue('stats_double') as HTMLInputElement
      expect(statsDoubleRadio.checked).toBe(false)

      // Select stats_double
      fireEvent.click(statsDoubleRadio)
      expect(statsDoubleRadio.checked).toBe(true)
      expect(statsMechRadio.checked).toBe(false)

      const unlockNowBtn = screen.getByRole('button', { name: /unlock now/i })
      fireEvent.click(unlockNowBtn)

      await waitFor(() => {
        expect(routeActions.transitionToA2).toHaveBeenCalledWith(
          expect.objectContaining({
            userSubjectId: mockEnrollmentMathsAsOnly.id,
            unlockMethod: 'manual',
            paperSelections: [
              { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
              { component_name: 'Statistics 1', paper_number: 5, stage: 'as' },
              { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
              { component_name: 'Statistics 2', paper_number: 6, stage: 'a2' },
            ],
          })
        )
      })
    })

    it('blocks Mathematics p1_p2 until user explicitly selects a replacement, showing clear replacement warning and radio options', async () => {
      vi.mocked(routeActions.transitionToA2).mockResolvedValue({ success: true })

      const p1p2Selections: SubjectPaperSelection[] = [
        {
          id: 'sps-1',
          user_subject_id: mockEnrollmentMathsAsOnly.id,
          component_name: 'Pure 1',
          paper_number: 1,
          stage: 'as',
          subject_paper_id: 'sp-1',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'sps-2',
          user_subject_id: mockEnrollmentMathsAsOnly.id,
          component_name: 'Pure 2',
          paper_number: 2,
          stage: 'as',
          subject_paper_id: 'sp-2',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]

      const onClose = vi.fn()
      render(
        <A2TransitionModal
          isOpen={true}
          onClose={onClose}
          enrollment={mockEnrollmentMathsAsOnly}
          subject={mockSubjectMaths}
          paperSelections={p1p2Selections}
        />
      )

      // Notice about p1_p2 replacement is shown on the selection screen
      expect(screen.getByText(/your selected staged route will replace Pure 2 in your stored route/i)).toBeDefined()

      // Click Continue to A2 (Switch to Staged)
      const continueBtn = screen.getByText('Continue to A2 (Switch to Staged)')
      fireEvent.click(continueBtn)

      // Unlock Now button must be DISABLED because no combination is selected yet
      const unlockNowBtn = screen.getByRole('button', { name: /unlock now/i }) as HTMLButtonElement
      expect(unlockNowBtn.disabled).toBe(true)

      // Explicit replacement warning message is displayed
      expect(screen.getByText(/Mathematics Pure 2 \(Paper 2\) is terminal at AS Level and cannot be continued into A2\. Unlocking A2 requires an explicit replacement: your selected staged route will replace Pure 2 in your stored route\./i)).toBeDefined()

      // Radio group contains all 3 staged choices
      const radioGroup = screen.getByRole('radiogroup')
      expect(radioGroup).toBeDefined()

      const mechStatsRadio = screen.getByDisplayValue('mech_stats') as HTMLInputElement
      const statsMechRadio = screen.getByDisplayValue('stats_mech') as HTMLInputElement
      const statsDoubleRadio = screen.getByDisplayValue('stats_double') as HTMLInputElement

      expect(mechStatsRadio.checked).toBe(false)
      expect(statsMechRadio.checked).toBe(false)
      expect(statsDoubleRadio.checked).toBe(false)

      // User selects mech_stats
      fireEvent.click(mechStatsRadio)
      expect(mechStatsRadio.checked).toBe(true)
      expect(unlockNowBtn.disabled).toBe(false)

      // Click Unlock Now
      fireEvent.click(unlockNowBtn)

      await waitFor(() => {
        expect(routeActions.transitionToA2).toHaveBeenCalledWith(
          expect.objectContaining({
            userSubjectId: mockEnrollmentMathsAsOnly.id,
            unlockMethod: 'manual',
            paperSelections: [
              { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
              { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
              { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
              { component_name: 'Statistics 1', paper_number: 5, stage: 'a2' },
            ],
          })
        )
      })
    })

    it('Further Mathematics fp1_fm offers only fm_fps continuation', async () => {
      vi.mocked(routeActions.transitionToA2).mockResolvedValue({ success: true })

      const fp1fmSelections: SubjectPaperSelection[] = [
        {
          id: 'sps-1',
          user_subject_id: mockEnrollmentFurtherMathsAsOnly.id,
          component_name: 'Further Pure 1',
          paper_number: 1,
          stage: 'as',
          subject_paper_id: 'sp-1',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'sps-2',
          user_subject_id: mockEnrollmentFurtherMathsAsOnly.id,
          component_name: 'Further Mechanics',
          paper_number: 3,
          stage: 'as',
          subject_paper_id: 'sp-3',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]

      const onClose = vi.fn()
      render(
        <A2TransitionModal
          isOpen={true}
          onClose={onClose}
          enrollment={mockEnrollmentFurtherMathsAsOnly}
          subject={mockSubjectFurtherMaths}
          paperSelections={fp1fmSelections}
        />
      )

      const continueBtn = screen.getByText('Continue to A2 (Switch to Staged)')
      fireEvent.click(continueBtn)

      // Only fm_fps must be present
      const fmFpsRadio = screen.getByDisplayValue('fm_fps') as HTMLInputElement
      expect(fmFpsRadio.checked).toBe(true)

      // fps_fm must NOT be offered
      expect(screen.queryByDisplayValue('fps_fm')).toBeNull()

      const unlockNowBtn = screen.getByRole('button', { name: /unlock now/i })
      fireEvent.click(unlockNowBtn)

      await waitFor(() => {
        expect(routeActions.transitionToA2).toHaveBeenCalledWith(
          expect.objectContaining({
            userSubjectId: mockEnrollmentFurtherMathsAsOnly.id,
            unlockMethod: 'manual',
            paperSelections: [
              { component_name: 'Further Pure 1', paper_number: 1, stage: 'as' },
              { component_name: 'Further Mechanics', paper_number: 3, stage: 'as' },
              { component_name: 'Further Pure 2', paper_number: 2, stage: 'a2' },
              { component_name: 'Further Probability & Statistics', paper_number: 4, stage: 'a2' },
            ],
          })
        )
      })
    })

    it('Further Mathematics fp1_fps offers only fps_fm continuation', async () => {
      vi.mocked(routeActions.transitionToA2).mockResolvedValue({ success: true })

      const fp1fpsSelections: SubjectPaperSelection[] = [
        {
          id: 'sps-1',
          user_subject_id: mockEnrollmentFurtherMathsAsOnly.id,
          component_name: 'Further Pure 1',
          paper_number: 1,
          stage: 'as',
          subject_paper_id: 'sp-1',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'sps-2',
          user_subject_id: mockEnrollmentFurtherMathsAsOnly.id,
          component_name: 'Further Probability & Statistics',
          paper_number: 4,
          stage: 'as',
          subject_paper_id: 'sp-4',
          created_at: '2026-01-01T00:00:00Z',
        },
      ]

      const onClose = vi.fn()
      render(
        <A2TransitionModal
          isOpen={true}
          onClose={onClose}
          enrollment={mockEnrollmentFurtherMathsAsOnly}
          subject={mockSubjectFurtherMaths}
          paperSelections={fp1fpsSelections}
        />
      )

      const continueBtn = screen.getByText('Continue to A2 (Switch to Staged)')
      fireEvent.click(continueBtn)

      // Only fps_fm must be present
      const fpsFmRadio = screen.getByDisplayValue('fps_fm') as HTMLInputElement
      expect(fpsFmRadio.checked).toBe(true)

      // fm_fps must NOT be offered
      expect(screen.queryByDisplayValue('fm_fps')).toBeNull()

      const unlockNowBtn = screen.getByRole('button', { name: /unlock now/i })
      fireEvent.click(unlockNowBtn)

      await waitFor(() => {
        expect(routeActions.transitionToA2).toHaveBeenCalledWith(
          expect.objectContaining({
            userSubjectId: mockEnrollmentFurtherMathsAsOnly.id,
            unlockMethod: 'manual',
            paperSelections: [
              { component_name: 'Further Pure 1', paper_number: 1, stage: 'as' },
              { component_name: 'Further Probability & Statistics', paper_number: 4, stage: 'as' },
              { component_name: 'Further Pure 2', paper_number: 2, stage: 'a2' },
              { component_name: 'Further Mechanics', paper_number: 3, stage: 'a2' },
            ],
          })
        )
      })
    })

    it('fixed subject converts to canonical staged paper set', async () => {
      vi.mocked(routeActions.transitionToA2).mockResolvedValue({ success: true })

      const onClose = vi.fn()
      render(
        <A2TransitionModal
          isOpen={true}
          onClose={onClose}
          enrollment={mockEnrollmentPhysicsAsOnly}
          subject={mockSubjectPhysics}
        />
      )

      const continueBtn = screen.getByText('Continue to A2 (Switch to Staged)')
      fireEvent.click(continueBtn)

      const unlockNowBtn = screen.getByRole('button', { name: /unlock now/i })
      fireEvent.click(unlockNowBtn)

      await waitFor(() => {
        expect(routeActions.transitionToA2).toHaveBeenCalledWith(
          expect.objectContaining({
            userSubjectId: mockEnrollmentPhysicsAsOnly.id,
            unlockMethod: 'manual',
            paperSelections: [
              { component_name: 'Multiple Choice (AS)', paper_number: 1, stage: 'as' },
              { component_name: 'AS Level Structured Questions', paper_number: 2, stage: 'as' },
              { component_name: 'Advanced Practical Skills', paper_number: 3, stage: 'as' },
              { component_name: 'A Level Structured Questions', paper_number: 4, stage: 'a2' },
              { component_name: 'Planning, Analysis and Evaluation', paper_number: 5, stage: 'a2' },
            ],
          })
        )
      })
    })
  })
})
