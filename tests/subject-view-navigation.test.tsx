import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const mockGetSubjectDetail = vi.fn()
const mockGetTargetGradePlan = vi.fn()

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/actions/subjects', () => ({
  getSubjectDetail: (...args: unknown[]) => mockGetSubjectDetail(...args),
}))

vi.mock('@/lib/actions/target-planner', () => ({
  getTargetGradePlan: (...args: unknown[]) => mockGetTargetGradePlan(...args),
}))

vi.mock('@/components/subjects/chapter-groups', () => ({
  default: () => <div data-testid="chapter-groups">Chapter Groups Content</div>,
}))

vi.mock('@/components/subjects/target-grade-planner', () => ({
  default: () => <div data-testid="target-grade-planner">Threshold Planner Content</div>,
}))

vi.mock('@/components/subjects/stage-readiness-panel', () => ({
  default: () => <div data-testid="stage-readiness-panel" />,
}))

vi.mock('@/components/subjects/target-grade-picker', () => ({
  default: () => <div data-testid="target-grade-picker" />,
}))

vi.mock('@/components/subjects/exam-date-picker', () => ({
  default: () => <div data-testid="exam-date-picker" />,
}))

vi.mock('@/components/subjects/route-selection-banner', () => ({
  default: () => <div data-testid="route-selection-banner" />,
}))

import SubjectDetailPage from '@/app/(app)/subjects/[subjectId]/page'
import SubjectViewTabs, { resolveSubjectDetailView } from '@/components/subjects/subject-view-tabs'

const BASE_DETAIL = {
  subject: {
    id: 'subj-9709',
    name: 'Mathematics',
    code: '9709',
    color_hex: '#3b82f6',
    icon: 'Calculator',
  },
  enrollment: {
    id: 'enr-1',
    user_id: 'user-1',
    subject_id: 'subj-9709',
    study_route: 'staged',
    current_stage: 'a2',
    target_grade: 'A*',
    exam_date: '2026-06-15',
  },
  groups: [],
  paperSelections: [],
  stageResults: [],
  totalChapters: 10,
  completedChapters: 2,
  inProgressChapters: 3,
  avgConfidence: 4.0,
  as_readiness: 60,
  a2_readiness: 20,
  daysUntilExam: 30,
}

describe('SubjectDetailPage view navigation (?view=chapters | ?view=planner)', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSubjectDetail.mockResolvedValue(BASE_DETAIL)
    mockGetTargetGradePlan.mockResolvedValue({ status: 'threshold-unavailable', message: 'N/A', reason: 'test' })
  })

  it('resolves missing and invalid view params safely to chapters, and planner to planner', () => {
    expect(resolveSubjectDetailView(undefined)).toBe('chapters')
    expect(resolveSubjectDetailView(null)).toBe('chapters')
    expect(resolveSubjectDetailView('')).toBe('chapters')
    expect(resolveSubjectDetailView('invalid')).toBe('chapters')
    expect(resolveSubjectDetailView('chapters')).toBe('chapters')
    expect(resolveSubjectDetailView('planner')).toBe('planner')
  })

  it('defaults to Chapters view without calling getTargetGradePlan or rendering planner', async () => {
    const ui = await SubjectDetailPage({
      params: Promise.resolve({ subjectId: 'subj-9709' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(mockGetTargetGradePlan).not.toHaveBeenCalled()
    expect(screen.getByTestId('chapter-groups')).toBeTruthy()
    expect(screen.queryByTestId('target-grade-planner')).toBeNull()

    const chaptersLink = screen.getByRole('link', { name: /chapters/i })
    const plannerLink = screen.getByRole('link', { name: /threshold planner/i })
    expect(chaptersLink.getAttribute('aria-current')).toBe('page')
    expect(chaptersLink.getAttribute('href')).toBe('/subjects/subj-9709?view=chapters')
    expect(plannerLink.getAttribute('aria-current')).toBeNull()
    expect(plannerLink.getAttribute('href')).toBe('/subjects/subj-9709?view=planner')
  })

  it('falls back to Chapters for invalid ?view=bogus without calling getTargetGradePlan', async () => {
    const ui = await SubjectDetailPage({
      params: Promise.resolve({ subjectId: 'subj-9709' }),
      searchParams: Promise.resolve({ view: 'bogus' }),
    })
    render(ui)

    expect(mockGetTargetGradePlan).not.toHaveBeenCalled()
    expect(screen.getByTestId('chapter-groups')).toBeTruthy()
    expect(screen.queryByTestId('target-grade-planner')).toBeNull()
  })

  it('renders Threshold Planner only when ?view=planner and loads planner data', async () => {
    const ui = await SubjectDetailPage({
      params: Promise.resolve({ subjectId: 'subj-9709' }),
      searchParams: Promise.resolve({ view: 'planner' }),
    })
    render(ui)

    expect(mockGetTargetGradePlan).toHaveBeenCalledTimes(1)
    expect(mockGetTargetGradePlan).toHaveBeenCalledWith('subj-9709')
    expect(screen.getByTestId('target-grade-planner')).toBeTruthy()
    expect(screen.queryByTestId('chapter-groups')).toBeNull()

    const plannerLink = screen.getByRole('link', { name: /threshold planner/i })
    const chaptersLink = screen.getByRole('link', { name: /chapters/i })
    expect(plannerLink.getAttribute('aria-current')).toBe('page')
    expect(chaptersLink.getAttribute('aria-current')).toBeNull()
  })

  it('SubjectViewTabs provides 44px touch targets and wraps cleanly for 320px viewports', () => {
    render(<SubjectViewTabs subjectId="subj-9709" activeView="planner" accentColor="#3b82f6" />)
    const nav = screen.getByRole('navigation', { name: /subject sections/i })
    expect(nav.style.flexWrap).toBe('wrap')
    expect(nav.style.maxWidth).toBe('100%')

    for (const link of screen.getAllByRole('link')) {
      expect(link.style.minHeight).toBe('44px')
      expect(link.style.minWidth).toBe('44px')
    }
  })
})
