import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import MissionCard from '@/components/dashboard/mission-card'
import type { DailyMission } from '@/types'

describe('MissionCard Markup & Structural Responsiveness', () => {
  const pendingMission: DailyMission = {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: '22222222-2222-4222-8222-222222222222',
    mission_date: '2026-08-27',
    type: 'attempt_paper',
    target_entity_type: 'paper',
    target_entity_id: '44444444-4444-4444-8444-444444444444',
    subject_paper_id: '55555555-5555-4555-8555-555555555555',
    title: 'Complete Cambridge 9709 Pure Mathematics 1 (Paper 12) Comprehensive Topical Review',
    description: 'Solve questions 1 through 7 under timed conditions focusing on trigonometric identities and coordinate geometry',
    xp_reward: 100,
    status: 'pending',
    difficulty: 'medium',
    estimated_minutes: 45,
    skip_reason: null,
    skipped_at: null,
    completed_at: null,
    generated_at: '2026-08-27T00:00:00Z',
  }

  it('renders a container-responsive card shell and 2-tier content structure', () => {
    const html = renderToStaticMarkup(React.createElement(MissionCard, { mission: pendingMission }))

    expect(html).toContain('mission-card-shell')
    expect(html).toContain('mission-card-surface')
    expect(html).toContain('mission-card-inner')
    expect(html).toContain('mission-card-top')
    expect(html).toContain('mission-card-bottom')
    expect(html).toContain('mission-card-actions')
  })

  it('renders long titles and descriptions within constrained text containers', () => {
    const html = renderToStaticMarkup(React.createElement(MissionCard, { mission: pendingMission }))

    expect(html).toContain('mission-card-title')
    expect(html).toContain('Complete Cambridge 9709 Pure Mathematics 1 (Paper 12) Comprehensive Topical Review')
    expect(html).toContain('mission-card-desc')
    expect(html).toContain('Solve questions 1 through 7 under timed conditions')
  })

  it('renders estimated duration and XP reward in the bottom action tier', () => {
    const html = renderToStaticMarkup(React.createElement(MissionCard, { mission: pendingMission }))

    expect(html).toContain('~45 min')
    expect(html).toContain('+100 XP')
    expect(html).toContain('mission-card-time')
    expect(html).toContain('mission-card-xp')
  })

  it('renders Replace action button for pending missions', () => {
    const html = renderToStaticMarkup(React.createElement(MissionCard, { mission: pendingMission }))

    expect(html).toContain('mission-action-btn-replace')
    expect(html).toContain('Replace')
  })

  it('renders Undo action button for completed missions within the undo window', () => {
    const completedMission: DailyMission = {
      ...pendingMission,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }
    const html = renderToStaticMarkup(React.createElement(MissionCard, { mission: completedMission }))

    expect(html).toContain('mission-action-btn-undo')
    expect(html).toContain('Undo')
  })
})
