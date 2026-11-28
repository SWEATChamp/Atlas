import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'

const mockRefresh = vi.fn()
const mockConfigureSubjectRoute = vi.fn()
const mockUpdateExamDate = vi.fn()
const mockUpdateTargetGrade = vi.fn()
const mockInvalidateSessionCache = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}))

vi.mock('@/lib/actions/route', () => ({
  configureSubjectRoute: (...args: unknown[]) => mockConfigureSubjectRoute(...args),
}))

vi.mock('@/lib/actions/subjects', () => ({
  updateExamDate: (...args: unknown[]) => mockUpdateExamDate(...args),
  updateTargetGrade: (...args: unknown[]) => mockUpdateTargetGrade(...args),
}))

vi.mock('@/lib/session-cache', () => ({
  invalidateSessionCache: (...args: unknown[]) => mockInvalidateSessionCache(...args),
}))

vi.mock('@/lib/actions/target-planner', () => ({
  getTargetGradePlan: vi.fn(),
}))

import RouteSetupSheet from '@/components/subjects/route-setup-sheet'
import ExamDatePicker from '@/components/subjects/exam-date-picker'
import TargetGradePicker from '@/components/subjects/target-grade-picker'
import TargetGradePlanner from '@/components/subjects/target-grade-planner'
import type { PlannerResult } from '@/lib/planner'
import type { Subject, UserSubject } from '@/types'

const BASE_SUBJECT: Subject = {
  id: '07aa2f25-f47d-53a8-bbf7-2a3484fd5896',
  name: 'Mathematics',
  code: '9709',
  icon: 'Calculator',
  color_hex: '#3b82f6',
  is_global: true,
  is_available: true,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
}

const BASE_ENROLLMENT: UserSubject = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  subject_id: BASE_SUBJECT.id,
  study_route: 'staged',
  current_stage: 'as',
  target_grade: 'A',
  exam_date: '2026-05-15',
  a2_unlocked_at: null,
  a2_unlock_method: null,
  priority: 1,
  is_archived: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('Gate 4 Preview Remediation: Immediate Refresh & Route Compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('RouteSetupSheet refreshes server-rendered planner on success and preserves dialog on error', async () => {
    const onClose = vi.fn()
    mockConfigureSubjectRoute.mockResolvedValueOnce({ error: 'Route update failed' })

    render(
      <RouteSetupSheet
        isOpen={true}
        onClose={onClose}
        enrollment={BASE_ENROLLMENT}
        subject={BASE_SUBJECT}
        initialPaperSelections={[
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
          { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
          { component_name: 'Statistics 1', paper_number: 5, stage: 'a2' },
        ]}
      />
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm route/i }))
    })

    expect(screen.getByRole('alert').textContent).toContain('Route update failed')
    expect(onClose).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()

    mockConfigureSubjectRoute.mockResolvedValueOnce({ success: true })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm route/i }))
    })

    expect(mockInvalidateSessionCache).toHaveBeenCalledWith(BASE_SUBJECT.id)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('ExamDatePicker refreshes on success, preserves prior state on error, and supports Escape focus recovery', async () => {
    mockUpdateExamDate.mockResolvedValueOnce({ error: 'Invalid exam date' })

    render(
      <ExamDatePicker
        subjectId={BASE_SUBJECT.id}
        currentDate={null}
        countdownLabel={null}
        countdownColor="#94a3b8"
      />
    )

    const trigger = screen.getByRole('button', { name: /exam date: set exam date/i })
    fireEvent.click(trigger)

    const input = screen.getByLabelText('Exam date') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2026-05-15' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    })

    expect(screen.getByRole('alert').textContent).toContain('Invalid exam date')
    expect(mockRefresh).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Exam date')).toBeTruthy()

    mockUpdateExamDate.mockResolvedValueOnce({})
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    })

    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.textContent).toContain('15 May 2026')

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const reopenedInput = screen.getByLabelText('Exam date')
    fireEvent.keyDown(reopenedInput, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('TargetGradePicker does not retain failed optimistic grade, refreshes on success, and fits 320px/375px viewports', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true })
    mockUpdateTargetGrade.mockResolvedValueOnce({ error: 'Permission denied' })

    render(
      <TargetGradePicker
        subjectId={BASE_SUBJECT.id}
        currentGrade={null}
        color="#3b82f6"
      />
    )

    const trigger = screen.getByRole('button', { name: /no target grade set/i })
    expect(trigger.textContent).toContain('Set target')
    fireEvent.click(trigger)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Select grade A' }))
    })

    expect(screen.getByRole('alert').textContent).toContain('Permission denied')
    expect(trigger.textContent).toContain('Set target')
    expect(screen.getByRole('button', { name: 'Select grade A' })).toBeTruthy()
    expect(mockRefresh).not.toHaveBeenCalled()

    mockUpdateTargetGrade.mockResolvedValueOnce({})
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Select grade A' }))
    })

    expect(trigger.textContent).toContain('Target A')
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const optionB = screen.getByRole('button', { name: 'Select grade B' })
    expect(optionB.style.minHeight).toBe('44px')
    fireEvent.keyDown(optionB, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('TargetGradePlanner immediately replaces empty state when server refresh supplies updated initialResult', () => {
    const emptyResult: PlannerResult = {
      status: 'no-exam-session',
      message: 'Set an exam date or session to view thresholds and required marks.',
    }
    const unavailableResult: PlannerResult = {
      status: 'threshold-unavailable',
      message: 'No compatible published Cambridge threshold series available on or before june 2026.',
      reason: 'Staged route awaiting approved carry-forward evidence',
    }

    const { rerender } = render(
      <TargetGradePlanner
        subjectId={BASE_SUBJECT.id}
        subjectColor="#3b82f6"
        initialResult={emptyResult}
      />
    )

    expect(screen.getByText('Examination Session Required')).toBeTruthy()

    rerender(
      <TargetGradePlanner
        subjectId={BASE_SUBJECT.id}
        subjectColor="#3b82f6"
        initialResult={unavailableResult}
      />
    )

    expect(screen.queryByText('Examination Session Required')).toBeNull()
    expect(screen.getByText(unavailableResult.message)).toBeTruthy()
  })

  it('pins the exact catalogue rows used by the action-level Preview-route regressions', () => {
    const root = process.cwd()
    const seedSql = fs.readFileSync(
      path.join(root, 'supabase/seeds/catalogue/june_2026_m5_catalogue.sql'),
      'utf8'
    )
    const mig024Sql = fs.readFileSync(
      path.join(root, 'supabase/migrations/20260826000024_mvp_syllabus_content.sql'),
      'utf8'
    )

    expect(mig024Sql).toContain("'svr-9709-full-mech-stats'")
    expect(mig024Sql).toContain("'svr-9231-full-all'")

    // Verify 9709 full_mech_stats 11,31,41,51 -> A* 223, A 197, max 250
    expect(seedSql).toContain(
      "('9125185a-c846-50f4-8467-796c765668a4', '00000000-0000-4000-8000-000000000023', '11,31,41,51', '11, 31, 41, 51', '11, 31, 41, 51 250 223 197 163 128 94 60', 'a_level', 'full_level', 250, 'weighted_total', 'eligible', '18efca50-e2e0-5817-bfe3-1e0182181c7c'::uuid"
    )
    expect(seedSql).toContain("('fd3a3d04-edd6-5d4d-9ed6-d3215617e90b', '9125185a-c846-50f4-8467-796c765668a4', 'A*', 223)")
    expect(seedSql).toContain("('8a67da2b-9eed-5761-8f58-bd5d2442e30a', '9125185a-c846-50f4-8467-796c765668a4', 'A', 197)")

    // Verify 9231 full_all 11,21,31,41 -> A* 214, A 181, max 250
    expect(seedSql).toContain(
      "('4fa6bbed-d4a8-59fc-b9e7-b5971609a5d6', '00000000-0000-4000-8000-000000000024', '11,21,31,41', '11, 21, 31, 41', '11, 21, 31, 41 250 214 181 148 125 103 81', 'a_level', 'full_level', 250, 'weighted_total', 'eligible', '6e8c9d70-78cb-57f9-ae2f-d11708e83bc2'::uuid"
    )
    expect(seedSql).toContain("('822e8f74-e0eb-5662-b038-40c845d26533', '4fa6bbed-d4a8-59fc-b9e7-b5971609a5d6', 'A*', 214)")
    expect(seedSql).toContain("('11f947ce-e116-5ea2-b801-09309d359cf0', '4fa6bbed-d4a8-59fc-b9e7-b5971609a5d6', 'A', 181)")

    // Verify staged Mathematics combinations remain unreviewed (carry-forward unapproved)
    expect(seedSql).toContain('"section":"a-level-staged"')
    expect(seedSql).toContain('"withheld_reason":"awaiting_approved_carry_forward_evidence_and_bridge_link"')
  })
})
