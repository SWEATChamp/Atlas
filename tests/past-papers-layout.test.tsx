import React, { type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import PastPapersPage from '@/app/(app)/past-papers/page'
import { PracticeWorkspace } from '@/components/papers/practice-workspace'
import type { AttemptTrendPoint, PracticeFormSubjectOption } from '@/types/practice-sessions'

const subjectId = '00000000-0000-4000-a000-000000000001'
const paperId = '00000000-0000-4000-a000-000000000002'
const subjects: PracticeFormSubjectOption[] = [{
  id: subjectId, name: 'Mathematics', code: '9709', context: {
    enrollment: { id: 'enrollment', subjectId, subjectCode: '9709', studyRoute: 'staged', currentStage: 'as', isArchived: false },
    selections: [{ subjectPaperId: paperId, componentName: 'Pure 1', stage: 'as' }],
    chapters: [], papers: [{ id: paperId, subjectId, paperNumber: 1, name: 'Pure Mathematics 1' }],
  },
}]
const trend: AttemptTrendPoint[] = [
  { id: 'paper-result', source: 'full_paper', subjectId, stage: 'as', attemptDate: '2026-10-16', createdAt: '2026-10-16T10:00:00Z', subjectPaperId: paperId, paperNumber: 12, raw: 40, max: 50, accuracyPct: 80, eligibleRaw: 40, eligibleMax: 50, eligibleForCurrentRoute: true, itemCount: 0 },
  { id: 'practice-result', source: 'practice', subjectId, stage: 'as', attemptDate: '2026-10-16', createdAt: '2026-10-16T11:00:00Z', subjectPaperId: null, paperNumber: null, raw: 2, max: 10, accuracyPct: 20, eligibleRaw: 2, eligibleMax: 10, eligibleForCurrentRoute: true, itemCount: 1 },
]
const { overview, catalogue, papersForSubject } = vi.hoisted(() => ({
  overview: vi.fn(), catalogue: vi.fn(), papersForSubject: vi.fn(),
}))

vi.mock('@/lib/supabase/authenticated', () => ({
  getAuthenticatedContext: async () => ({ user: { id: 'user' }, supabase: {
    from: () => ({ select: () => ({ eq: async () => ({ data: [{ subjects: { id: subjectId, name: 'Mathematics', color_hex: '#00ff00' } }] }) }) }),
  } }),
  getCurrentProfile: async () => ({ timezone: 'Asia/Singapore' }),
}))
vi.mock('@/lib/actions/papers', () => ({
  getAllPapersWithSubjects: () => papersForSubject(), getPapersForSubject: papersForSubject, getUntaggedPapers: async () => [],
}))
vi.mock('@/lib/actions/practice-sessions', () => ({
  getPracticeOverview: overview, getPracticeFormCatalogue: catalogue, getCombinedChapterEvidenceForSubject: async () => [],
  createPracticeSession: vi.fn(), updatePracticeSession: vi.fn(), deletePracticeSession: vi.fn(),
}))
vi.mock('@/components/papers/paper-stage-provider', () => ({
  PaperStageProvider: ({ children }: { children: ReactNode }) => children,
  PaperStageTaggerSlot: () => null,
  PaperAttemptsListSlot: () => <p>Full-paper record list</p>,
}))
vi.mock('@/components/papers/paper-charts', () => ({ LazyChapterAccuracyChart: () => null }))
vi.mock('@/components/papers/lazy-log-paper-modal', () => ({
  LazyLogPaperModal: ({ onClose, timeZone }: { onClose: () => void; timeZone: string }) => <div role="dialog" aria-label="Log full paper"><p>{timeZone}</p><button onClick={onClose}>Close paper form</button></div>,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

async function showPage(filtered = false, formSubjects = subjects, points = trend) {
  catalogue.mockResolvedValue(formSubjects)
  overview.mockResolvedValue({ sessions: [], trend: points })
  papersForSubject.mockResolvedValue([{
    id: 'paper-result', subject_id: subjectId, subject_paper_id: paperId, stage: 'as', paper_number: 12,
    accuracy_pct: 80, score_raw: 40, score_max: 50, attempted_at: '2026-10-16', created_at: '2026-10-16T10:00:00Z',
    subjects: { name: 'Mathematics' },
  }])
  return render(await PastPapersPage({ searchParams: Promise.resolve(filtered ? { subject: subjectId } : {}) }))
}

describe('Past Papers page layout', () => {
  it.each([false, true])('starts practice and form loading before the independent paper query completes (filtered=%s)', async filtered => {
    let resolvePapers!: (rows: never[]) => void
    const pendingPapers = new Promise<never[]>(resolve => { resolvePapers = resolve })
    papersForSubject.mockReturnValue(pendingPapers)
    overview.mockResolvedValue({ sessions: [], trend: [] })
    catalogue.mockResolvedValue(subjects)
    const page = PastPapersPage({ searchParams: Promise.resolve(filtered ? { subject: subjectId } : {}) })
    await waitFor(() => {
      expect(papersForSubject).toHaveBeenCalled()
      expect(overview).toHaveBeenCalledWith(filtered ? subjectId : undefined)
      expect(catalogue).toHaveBeenCalled()
    })
    resolvePapers([])
    expect(await page).toBeTruthy()
  })

  it.each([false, true])('places the graph before attempt tabs and displays only the selected evidence and action (filtered=%s)', async filtered => {
    await showPage(filtered)
    const graph = screen.getByRole('heading', { name: 'Score trend' }).closest('section')!
    const tabs = screen.getByRole('tablist', { name: 'Log and review attempts' })
    expect(graph.nextElementSibling).toBe(tabs)
    expect(within(tabs).getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Full papers', 'Question practice'])
    expect(screen.getByRole('tab', { name: 'Full papers', selected: true })).toBeTruthy()
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.getByRole('tabpanel', { name: 'Full papers' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '+ Log Paper' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '+ Log Questions' })).toBeNull()
    expect(tabs.compareDocumentPosition(screen.getByText('Papers logged')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Full-paper history' })).toBeTruthy()
    expect(screen.getByText('Full-paper average').parentElement?.textContent).toContain('80.0%')
    expect(screen.queryByText('Question-practice accuracy')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Question-practice history' })).toBeNull()
    expect(screen.getByText(/42\/60 marks · 2 attempts/)).toBeTruthy()
    const filters = screen.getByRole('navigation', { name: 'Filter past papers by subject' })
    expect(within(filters).getByRole('link', { name: 'Mathematics' }).getAttribute('href')).toBe(`/past-papers?subject=${subjectId}`)
    expect(screen.queryByLabelText('Trend subject')).toBeNull()
    expect(screen.queryByLabelText('Overall cumulative mark-weighted accuracy') !== null).toBe(!filtered)
    expect(overview).toHaveBeenCalledWith(filtered ? subjectId : undefined)

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    expect(screen.getByRole('tab', { name: 'Question practice', selected: true })).toBeTruthy()
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.getByRole('tabpanel', { name: 'Question practice' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '+ Log Questions' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '+ Log Paper' })).toBeNull()
    expect(screen.getByText('Question-practice accuracy').parentElement?.textContent).toContain('20.0%')
    expect(screen.getByRole('heading', { name: 'Question-practice history' })).toBeTruthy()
    expect(screen.queryByText('Papers logged')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Full-paper history' })).toBeNull()
    expect(screen.getByText(/42\/60 marks · 2 attempts/)).toBeTruthy()
  })

  it('opens the corresponding form from its selected panel and restores question-launcher focus on Escape', async () => {
    await showPage()
    fireEvent.click(screen.getByRole('button', { name: '+ Log Paper' }))
    expect(screen.getByRole('dialog', { name: 'Log full paper' }).textContent).toContain('Asia/Singapore')
    expect(screen.queryByRole('dialog', { name: 'Log Questions' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close paper form' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    const launcher = screen.getByRole('button', { name: '+ Log Questions' })
    launcher.focus()
    fireEvent.click(launcher)
    expect(await screen.findByRole('dialog', { name: 'Log Questions' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Log full paper' })).toBeNull()
    const title = screen.getByLabelText('Session title (optional)')
    title.focus()
    fireEvent.change(title, { target: { value: 'Algebra drill' } })
    expect(document.activeElement).toBe(title)
    expect(title).toHaveProperty('value', 'Algebra drill')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(launcher)
    expect(screen.getByRole('tab', { name: 'Question practice', selected: true })).toBeTruthy()
  })

  it('supports roving focus, ArrowLeft/Right wrapping, Home/End and valid panel associations', async () => {
    await showPage()
    const paperTab = screen.getByRole('tab', { name: 'Full papers' })
    const questionTab = screen.getByRole('tab', { name: 'Question practice' })
    function expectSelected(tab: HTMLElement, other: HTMLElement) {
      expect(document.activeElement).toBe(tab)
      expect(tab.tabIndex).toBe(0)
      expect(other.tabIndex).toBe(-1)
      expect(tab.getAttribute('aria-selected')).toBe('true')
      expect(other.getAttribute('aria-selected')).toBe('false')
      const panel = screen.getByRole('tabpanel')
      expect(panel.id).toBe(tab.getAttribute('aria-controls'))
      expect(panel.getAttribute('aria-labelledby')).toBe(tab.id)
      expect(panel.tabIndex).toBe(0)
      expect(document.querySelectorAll(`[id="${panel.id}"]`)).toHaveLength(1)
      expect(document.getElementById(other.getAttribute('aria-controls')!)?.hidden).toBe(true)
    }
    paperTab.focus()
    expectSelected(paperTab, questionTab)
    fireEvent.keyDown(paperTab, { key: 'ArrowRight' }); expectSelected(questionTab, paperTab)
    fireEvent.keyDown(questionTab, { key: 'ArrowRight' }); expectSelected(paperTab, questionTab)
    fireEvent.keyDown(paperTab, { key: 'ArrowLeft' }); expectSelected(questionTab, paperTab)
    fireEvent.keyDown(questionTab, { key: 'Home' }); expectSelected(paperTab, questionTab)
    fireEvent.keyDown(paperTab, { key: 'End' }); expectSelected(questionTab, paperTab)
    fireEvent.keyDown(questionTab, { key: 'ArrowLeft' }); expectSelected(paperTab, questionTab)
  })

  it('preserves all subject series, evidence mode and chart node when switching history/logging tabs', async () => {
    const chemistry = '00000000-0000-4000-a000-000000000004'
    await showPage(false, [...subjects, { ...subjects[0], id: chemistry, name: 'Chemistry' }], [
      ...trend, { ...trend[1], id: 'chemistry-practice', subjectId: chemistry, raw: 9, accuracyPct: 90, eligibleRaw: 9 },
    ])
    const practiceMode = within(screen.getByRole('group', { name: 'Trend evidence type' })).getByRole('button', { name: 'Question practice' })
    fireEvent.click(practiceMode)
    const chart = screen.getByRole('img')
    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Full papers' }))
    expect(screen.queryByLabelText('Trend subject')).toBeNull()
    expect(practiceMode.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('img')).toBe(chart)
    expect(screen.getByText(/11\/20 marks · 2 attempts/)).toBeTruthy()
    expect(screen.getByLabelText('Mathematics attempt scores')).toBeTruthy()
    expect(screen.getByLabelText('Chemistry attempt scores')).toBeTruthy()
  })

  it('keeps question history selectable without active subjects, while disabling new question logging', () => {
    render(<PracticeWorkspace sessions={[]} trend={trend} subjects={[]} preferredSubjectId={null} timeZone="UTC" />)
    const questionTab = screen.getByRole('tab', { name: 'Question practice' })
    expect(questionTab).toHaveProperty('disabled', false)
    fireEvent.click(questionTab)
    expect(screen.getByRole('heading', { name: 'Question-practice history' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Log Questions' })).toHaveProperty('disabled', true)
    expect(screen.getByText(/Confirm a study route/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '+ Log Paper' })).toBeNull()
  })
})
