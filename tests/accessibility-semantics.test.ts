import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import ExamDatePicker from '@/components/subjects/exam-date-picker'
import TargetGradePicker from '@/components/subjects/target-grade-picker'
import StageReadinessPanel from '@/components/subjects/stage-readiness-panel'
import MissionCard from '@/components/dashboard/mission-card'
import RouteSetupSheet from '@/components/subjects/route-setup-sheet'
import type { DailyMission, Subject, UserSubject } from '@/types'

describe('Accessibility & Touch Target Semantics (v1.2.0)', () => {
  beforeEach(() => {
    cleanup()
  })

  const dummySubject: Subject = {
    id: '11111111-1111-4111-8111-111111111111',
    code: '9709',
    name: 'Mathematics',
    icon: 'Calculator',
    color_hex: '#3b82f6',
    is_global: true,
    is_available: true,
    created_by: null,
    created_at: '2026-08-27T00:00:00Z',
  }

  const dummyEnrollment: UserSubject = {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: '33333333-3333-4333-8333-333333333333',
    subject_id: dummySubject.id,
    target_grade: 'A*',
    study_route: 'staged',
    current_stage: 'as',
    exam_date: '2027-06-01',
    priority: 1,
    is_archived: false,
    a2_unlocked_at: null,
    a2_unlock_method: null,
    created_at: '2026-08-27T00:00:00Z',
    updated_at: '2026-08-27T00:00:00Z',
  }

  it('renders ExamDatePicker trigger button with >=44px touch target and explicit type="button"', () => {
    const html = renderToString(
      React.createElement(ExamDatePicker, {
        subjectId: dummySubject.id,
        currentDate: '2027-06-01',
        countdownLabel: '280 days left',
        countdownColor: 'var(--text-muted)',
      })
    )

    // Specific trigger control matching
    expect(html).toContain('aria-label="Exam date: 280 days left. Click to change."')
    expect(html).toContain('type="button"')
    expect(html).toContain('min-height:44px')
    expect(html).toContain('min-width:44px')
    expect(html).toContain('touch-target-btn')
  })

  it('renders TargetGradePicker trigger with >=44px touch target and explicit type="button"', () => {
    const html = renderToString(
      React.createElement(TargetGradePicker, {
        subjectId: dummySubject.id,
        currentGrade: 'A*',
        color: dummySubject.color_hex,
      })
    )

    // Trigger button assertion
    expect(html).toContain('aria-label="Target grade: A*. Click to change."')
    expect(html).toContain('target-grade-trigger')
    expect(html).toContain('type="button"')
    expect(html).toContain('min-height:44px')
    expect(html).toContain('min-width:44px')
    expect(html).toMatch(/Target\s*(<!-- -->)?\s*A\*/)
  })

  it('renders StageReadinessPanel Unlock A2 and Route buttons with named >=44px touch targets and type="button"', () => {
    const html = renderToString(
      React.createElement(StageReadinessPanel, {
        enrollment: dummyEnrollment,
        subject: dummySubject,
        asReadiness: 65,
        a2Readiness: null,
      })
    )

    // Specific button matchers
    expect(html).toMatch(/<button[^>]*type="button"[^>]*class="touch-target-btn"[^>]*>[\s\S]*?<span>Unlock A2<\/span><\/button>/)
    expect(html).toMatch(/<button[^>]*type="button"[^>]*class="touch-target-btn btn btn-ghost"[^>]*>[\s\S]*?<span>Route<\/span><\/button>/)
    expect(html).toContain('min-height:44px')
    expect(html).toContain('min-width:44px')
  })

  it('renders unconfirmed StageReadinessPanel with 44px Configure button', () => {
    const unconfirmedEnrollment: UserSubject = {
      ...dummyEnrollment,
      study_route: 'unconfirmed',
      current_stage: null,
    }
    const html = renderToString(
      React.createElement(StageReadinessPanel, {
        enrollment: unconfirmedEnrollment,
        subject: dummySubject,
        asReadiness: null,
        a2Readiness: null,
      })
    )

    expect(html).toMatch(/<button[^>]*type="button"[^>]*class="btn btn-primary touch-target-btn"[^>]*>Configure<\/button>/)
    expect(html).toContain('min-height:44px')
    expect(html).toContain('min-width:44px')
  })

  it('renders MissionCard with one-way complete action when pending, and does not expose an enabled checked checkbox when completed', () => {
    const pendingMission: DailyMission = {
      id: '44444444-4444-4444-8444-444444444444',
      user_id: dummyEnrollment.user_id,
      mission_date: '2026-08-27',
      type: 'complete_notes',
      target_entity_type: 'chapter',
      target_entity_id: '55555555-5555-5555-8555-555555555555',
      subject_paper_id: null,
      title: 'Complete notes for Pure Mathematics 1 Chapter 1',
      description: 'Review notes and mark chapter complete',
      xp_reward: 50,
      status: 'pending',
      difficulty: 'easy',
      estimated_minutes: 25,
      skip_reason: null,
      skipped_at: null,
      completed_at: null,
      generated_at: '2026-08-27T00:00:00Z',
    }

    // Pending mission renders complete button with aria-label and touch-target dimensions
    const pendingHtml = renderToString(React.createElement(MissionCard, { mission: pendingMission }))
    expect(pendingHtml).toContain('type="button"')
    expect(pendingHtml).toContain('aria-label="Complete mission: Complete notes for Pure Mathematics 1 Chapter 1"')
    expect(pendingHtml).toContain('min-height:44px')
    expect(pendingHtml).toContain('min-width:44px')
    expect(pendingHtml).not.toContain('role="checkbox"')

    // Completed mission renders separate Undo button and static aria-hidden status indicator
    const completedMission: DailyMission = {
      ...pendingMission,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }
    const completedHtml = renderToString(React.createElement(MissionCard, { mission: completedMission }))
    expect(completedHtml).toContain('aria-label="Undo completion for mission: Complete notes for Pure Mathematics 1 Chapter 1"')
    expect(completedHtml).toContain('mission-action-btn-undo')
    expect(completedHtml).not.toContain('role="checkbox"')
  })

  it('verifies native radio-group interaction and keyboard behavior via DOM input path', async () => {
    render(
      React.createElement(RouteSetupSheet, {
        isOpen: true,
        onClose: () => {},
        enrollment: dummyEnrollment,
        subject: dummySubject,
      })
    )

    // Structural native radio-group validation
    const radiogroup = screen.getByRole('radiogroup')
    expect(radiogroup).toBeDefined()

    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios).toHaveLength(3)

    // All radio options share the name attribute for native browser arrow-key traversal
    radios.forEach((r) => {
      expect(r.name).toBe('study_route')
    })

    // Initial state: staged route selected
    const stagedRadio = screen.getByDisplayValue('staged') as HTMLInputElement
    expect(stagedRadio.checked).toBe(true)

    // Simulate clicking as_only radio
    const asOnlyRadio = screen.getByDisplayValue('as_only') as HTMLInputElement
    await act(async () => {
      fireEvent.click(asOnlyRadio)
    })
    expect(asOnlyRadio.checked).toBe(true)
    expect(stagedRadio.checked).toBe(false)

    // Simulate clicking full_level radio
    const fullLevelRadio = screen.getByDisplayValue('full_level') as HTMLInputElement
    await act(async () => {
      fireEvent.click(fullLevelRadio)
    })
    expect(fullLevelRadio.checked).toBe(true)
    expect(asOnlyRadio.checked).toBe(false)
  })
})
