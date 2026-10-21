import React, { type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import PastPapersPage from '@/app/(app)/past-papers/page'
import LogsPage from '@/app/(app)/logs/page'
import { LogsWorkspace } from '@/components/papers/logs-workspace'
import type { PracticeFormSubjectOption, PracticeSessionRead } from '@/types/practice-sessions'

const subjectId = '00000000-0000-4000-a000-000000000001'
const paperId = '00000000-0000-4000-a000-000000000002'
const chapterId = '00000000-0000-4000-a000-000000000003'

const subjects: PracticeFormSubjectOption[] = [
  {
    id: subjectId,
    name: 'Mathematics',
    code: '9709',
    context: {
      enrollment: {
        id: 'enrollment',
        subjectId,
        subjectCode: '9709',
        studyRoute: 'staged',
        currentStage: 'as',
        isArchived: false,
      },
      selections: [{ subjectPaperId: paperId, componentName: 'Pure 1', stage: 'as' }],
      chapters: [
        {
          id: chapterId,
          subjectId,
          number: 1,
          title: 'Algebra',
          stage: 'as',
          component: 'Pure 1',
          isActive: true,
          paperIds: [paperId],
        },
      ],
      papers: [{ id: paperId, subjectId, paperNumber: 1, name: 'Pure Mathematics 1' }],
    },
  },
]

const sampleSession: PracticeSessionRead = {
  id: '00000000-0000-4000-a000-000000000010',
  user_id: 'user',
  subject_id: subjectId,
  stage: 'as',
  session_date: '2026-10-16',
  title: 'Algebra drill',
  duration_mins: 25,
  notes: 'Tricky questions',
  total_score_raw: 8,
  total_score_max: 10,
  accuracy_pct: 80,
  subject_paper_id: null,
  paper_number: null,
  exam_year: null,
  exam_series: null,
  exam_variant: null,
  source_label: null,
  created_at: '2026-10-16T10:00:00Z',
  updated_at: '2026-10-16T10:00:00Z',
  items: [
    {
      id: '00000000-0000-4000-a000-000000000020',
      session_id: '00000000-0000-4000-a000-000000000010',
      item_order: 1,
      question_label: '1(a)',
      marks_obtained: 8,
      marks_available: 10,
      provenance_mode: 'none',
      subject_paper_id: null,
      paper_number: null,
      exam_year: null,
      exam_series: null,
      exam_variant: null,
      source_label: 'Worksheet',
      notes: null,
      created_at: '2026-10-16T10:00:00Z',
      chapter_ids: [chapterId],
      eligible_for_readiness: true,
      eligibility_reason: 'eligible',
    },
  ],
  eligible_score_raw: 8,
  eligible_score_max: 10,
  eligible_for_readiness: true,
  route_status: 'current',
}

const { catalogueMock, historyMock, papersForSubject, mockRedirect, createSessionMock, updateSessionMock, getLogsSubjectDataMock } = vi.hoisted(() => ({
  catalogueMock: vi.fn(),
  historyMock: vi.fn(),
  papersForSubject: vi.fn(),
  mockRedirect: vi.fn(),
  createSessionMock: vi.fn(),
  updateSessionMock: vi.fn(),
  getLogsSubjectDataMock: vi.fn(),
}))

vi.mock('@/lib/supabase/authenticated', () => ({
  getAuthenticatedContext: async () => ({
    user: { id: 'user' },
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({
              data: [{ subjects: { id: subjectId, name: 'Mathematics', color_hex: '#00ff00' } }],
            }),
          }),
        }),
      }),
    },
  }),
  getCurrentProfile: async () => ({ timezone: 'Asia/Singapore' }),
}))

vi.mock('@/lib/actions/papers', () => ({
  getAllPapersWithSubjects: () => papersForSubject(),
  getPapersForSubject: papersForSubject,
  getUntaggedPapers: async () => [],
}))

vi.mock('@/lib/actions/practice-sessions', () => ({
  getPracticeFormCatalogue: catalogueMock,
  getPracticeHistory: historyMock,
  deletePracticeSession: vi.fn(),
  createPracticeSession: createSessionMock,
  updatePracticeSession: updateSessionMock,
  getLogsSubjectData: getLogsSubjectDataMock,
}))

vi.mock('@/components/papers/paper-stage-provider', () => ({
  PaperStageProvider: ({ children }: { children: ReactNode }) => children,
  PaperStageTaggerSlot: () => null,
  PaperAttemptsListSlot: ({ emptyMessage }: { emptyMessage: string }) => <p>{emptyMessage}</p>,
}))

vi.mock('@/components/papers/lazy-log-paper-modal', () => ({
  LazyLogPaperModal: ({ onClose, timeZone }: { onClose: () => void; timeZone: string }) => (
    <div role="dialog" aria-label="Log full paper">
      <p>{timeZone}</p>
      <button onClick={onClose}>Close paper form</button>
    </div>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: mockRedirect,
  RedirectType: { replace: 'replace', push: 'push' },
}))

beforeEach(() => {
  getLogsSubjectDataMock.mockImplementation(async (targetSubId: string | null, targetPage: number, pageSize: number) => ({
    subjectId: targetSubId,
    page: targetPage,
    pageSize,
    sessions: [sampleSession],
    totalSessions: 1,
    papers: [],
    untaggedPapers: [],
    timestamp: Date.now(),
  }))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function showLogsPage(filtered = false, formSubjects = subjects, sessions = [sampleSession]) {
  catalogueMock.mockResolvedValue(formSubjects)
  historyMock.mockResolvedValue({
    sessions,
    total: sessions.length,
    offset: 0,
    limit: 50,
  })
  papersForSubject.mockResolvedValue([
    {
      id: 'paper-result',
      subject_id: subjectId,
      subject_paper_id: paperId,
      stage: 'as',
      paper_number: 12,
      accuracy_pct: 80,
      score_raw: 40,
      score_max: 50,
      attempted_at: '2026-10-16',
      created_at: '2026-10-16T10:00:00Z',
      subjects: { name: 'Mathematics' },
    },
  ])
  return render(
    await LogsPage({ searchParams: Promise.resolve(filtered ? { subject: subjectId } : {}) })
  )
}

describe('/past-papers redirect route', () => {
  it('redirects /past-papers to /logs using RedirectType.replace (HTTP 307)', async () => {
    await PastPapersPage({})
    expect(mockRedirect).toHaveBeenCalledWith('/logs', 'replace')
  })

  it('redirects /past-papers?subject=... to /logs?subject=... preserving subject parameter', async () => {
    await PastPapersPage({ searchParams: Promise.resolve({ subject: subjectId }) })
    expect(mockRedirect).toHaveBeenCalledWith(`/logs?subject=${encodeURIComponent(subjectId)}`, 'replace')
  })

  it('preserves repeated search parameters during redirect', async () => {
    await PastPapersPage({
      searchParams: Promise.resolve({ tag: ['chemistry', 'physics'], subject: subjectId }),
    })
    expect(mockRedirect).toHaveBeenCalledWith(
      `/logs?tag=chemistry&tag=physics&subject=${encodeURIComponent(subjectId)}`,
      'replace'
    )
  })
})

describe('Logs page and workspace layout', () => {
  it('renders question-practice history and metrics while form catalogue request remains pending', async () => {
    let resolveCatalogue!: (val: typeof subjects) => void
    const pendingCatalogue = new Promise<typeof subjects>(resolve => {
      resolveCatalogue = resolve
    })
    catalogueMock.mockReturnValue(pendingCatalogue)
    historyMock.mockResolvedValue({
      sessions: [sampleSession],
      total: 1,
      offset: 0,
      limit: 50,
    })
    papersForSubject.mockResolvedValue([])

    // LogsPage resolves immediately and renders history without waiting for pending catalogue
    const page = await LogsPage({ searchParams: Promise.resolve({}) })
    render(page)

    // Switch to Question practice tab
    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))

    // History and metrics render immediately despite pending catalogue
    expect(screen.getByRole('heading', { name: 'Question-practice history' })).toBeTruthy()
    expect(screen.getByText('Algebra drill')).toBeTruthy()
    expect(screen.getByText('Page accuracy')).toBeTruthy()

    // Form launcher is in pending fallback state
    const launcherButton = screen.getByRole('button', { name: '+ Log Questions' })
    expect(launcherButton).toHaveProperty('disabled', true)

    // When catalogue resolves, launcher becomes interactive
    await act(async () => {
      resolveCatalogue(subjects)
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ Log Questions' })).toHaveProperty('disabled', false)
    })
  })

  it.each([false, true])(
    'starts practice history and form loading before independent paper query completes (filtered=%s)',
    async filtered => {
      let resolvePapers!: (rows: never[]) => void
      const pendingPapers = new Promise<never[]>(resolve => {
        resolvePapers = resolve
      })
      papersForSubject.mockReturnValue(pendingPapers)
      historyMock.mockResolvedValue({ sessions: [], total: 0, offset: 0, limit: 50 })
      catalogueMock.mockResolvedValue(subjects)

      const pagePromise = LogsPage({
        searchParams: Promise.resolve(filtered ? { subject: subjectId } : {}),
      })

      await waitFor(() => {
        expect(papersForSubject).toHaveBeenCalled()
        expect(historyMock).toHaveBeenCalledWith(
          filtered ? { subjectId, limit: 50, offset: 0 } : { limit: 50, offset: 0 }
        )
        expect(catalogueMock).toHaveBeenCalled()
      })

      resolvePapers([])
      expect(await pagePromise).toBeTruthy()
    }
  )

  it('passes offset and limit to getPracticeHistory based on page query parameter', async () => {
    historyMock.mockResolvedValue({ sessions: [], total: 100, offset: 50, limit: 50 })
    catalogueMock.mockResolvedValue(subjects)
    papersForSubject.mockResolvedValue([])

    await LogsPage({ searchParams: Promise.resolve({ page: '2', subject: subjectId }) })

    expect(historyMock).toHaveBeenCalledWith({ subjectId, limit: 50, offset: 50 })
  })

  it('resiliently renders full papers and history even when form catalogue fails to load', async () => {
    papersForSubject.mockResolvedValue([])
    historyMock.mockResolvedValue({
      sessions: [sampleSession],
      total: 1,
      offset: 0,
      limit: 50,
    })
    catalogueMock.mockRejectedValue(new Error('Network error on catalogue'))

    render(await LogsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByRole('tablist', { name: 'Log and review attempts' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))

    // Alert indicates form error
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load practice subjects')
    // Question history still renders
    expect(screen.getByRole('heading', { name: 'Question-practice history' })).toBeTruthy()
    expect(screen.getByText('Algebra drill')).toBeTruthy()
    // "+ Log Questions" is disabled when catalogue has not loaded
    expect(screen.getByRole('button', { name: '+ Log Questions' })).toHaveProperty('disabled', true)
  })

  it('resiliently renders forms and full papers even when history loading fails', async () => {
    papersForSubject.mockResolvedValue([
      {
        id: 'paper-result',
        subject_id: subjectId,
        subject_paper_id: paperId,
        stage: 'as',
        paper_number: 12,
        accuracy_pct: 80,
        score_raw: 40,
        score_max: 50,
        attempted_at: '2026-10-16',
        created_at: '2026-10-16T10:00:00Z',
        subjects: { name: 'Mathematics' },
      },
    ])
    historyMock.mockRejectedValue(new Error('Network error on history'))
    catalogueMock.mockResolvedValue(subjects)

    render(await LogsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByRole('heading', { name: 'Full-paper history' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))

    // Alert indicates history error
    expect(screen.getByRole('alert').textContent).toContain('Could not load practice history')
    // Log Questions remains enabled because forms loaded
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ Log Questions' })).toHaveProperty('disabled', false)
    })
  })

  it.each([false, true])(
    'displays attempt tabs and isolates full-paper and question-practice views (filtered=%s)',
    async filtered => {
      await showLogsPage(filtered)
      const tabs = screen.getByRole('tablist', { name: 'Log and review attempts' })
      expect(within(tabs).getAllByRole('tab').map(tab => tab.textContent)).toEqual([
        'Full papers',
        'Question practice',
      ])
      expect(screen.getByRole('tab', { name: 'Full papers', selected: true })).toBeTruthy()
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
      expect(screen.getByRole('tabpanel', { name: 'Full papers' })).toBeTruthy()
      expect(screen.getAllByRole('button', { name: '+ Log Paper' })).toHaveLength(1)
      expect(screen.queryByRole('button', { name: '+ Log Questions' })).toBeNull()

      expect(screen.getByRole('heading', { name: 'Full-paper history' })).toBeTruthy()
      expect(screen.queryByText('Full-paper average')).toBeNull()
      expect(screen.queryByText('Question-practice accuracy')).toBeNull()
      expect(screen.queryByRole('heading', { name: 'Question-practice history' })).toBeNull()

      const filters = screen.getByRole('navigation', { name: 'Filter logs by subject' })
      expect(within(filters).getByRole('link', { name: 'Mathematics' }).getAttribute('href')).toBe(
        `/logs?subject=${subjectId}`
      )

      fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
      expect(screen.getByRole('tab', { name: 'Question practice', selected: true })).toBeTruthy()
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
      expect(screen.getByRole('tabpanel', { name: 'Question practice' })).toBeTruthy()
      expect(screen.getAllByRole('button', { name: '+ Log Questions' })).toHaveLength(1)
      expect(screen.queryByRole('button', { name: '+ Log Paper' })).toBeNull()
      expect(screen.getByText('Page accuracy').parentElement?.textContent).toContain('80.0%')
      expect(screen.getByRole('heading', { name: 'Question-practice history' })).toBeTruthy()
      expect(screen.queryByRole('heading', { name: 'Full-paper history' })).toBeNull()
      expect(screen.getByText('Algebra drill')).toBeTruthy()
    }
  )

  it('renders URL-driven pagination controls when totalSessions exceeds limit and preserves subject filter', () => {
    render(
      <LogsWorkspace
        sessions={[sampleSession]}
        totalSessions={120}
        currentPage={2}
        pageSize={50}
        subjects={subjects}
        preferredSubjectId={subjectId}
        timeZone="UTC"
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    const pagination = screen.getByRole('navigation', { name: 'Question practice pagination' })
    expect(pagination).toBeTruthy()
    expect(within(pagination).getByText(/Page 2 of 3/)).toBeTruthy()
    const prevLink = within(pagination).getByRole('link', { name: '← Previous' })
    expect(prevLink.getAttribute('href')).toBe(`/logs?subject=${encodeURIComponent(subjectId)}`)
    const nextLink = within(pagination).getByRole('link', { name: 'Next →' })
    expect(nextLink.getAttribute('href')).toBe(`/logs?subject=${encodeURIComponent(subjectId)}&page=3`)
  })

  it('opens corresponding form from selected panel and restores question-launcher focus on Escape', async () => {
    await showLogsPage()
    fireEvent.click(screen.getByRole('button', { name: '+ Log Paper' }))
    expect(screen.getByRole('dialog', { name: 'Log full paper' }).textContent).toContain('Asia/Singapore')
    expect(screen.queryByRole('dialog', { name: 'Log Questions' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close paper form' }))

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    const launcher = screen.getByRole('button', { name: '+ Log Questions' })
    await waitFor(() => expect(launcher).toHaveProperty('disabled', false))
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
    await showLogsPage()
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
    fireEvent.keyDown(paperTab, { key: 'ArrowRight' })
    expectSelected(questionTab, paperTab)
    fireEvent.keyDown(questionTab, { key: 'ArrowRight' })
    expectSelected(paperTab, questionTab)
    fireEvent.keyDown(paperTab, { key: 'ArrowLeft' })
    expectSelected(questionTab, paperTab)
    fireEvent.keyDown(questionTab, { key: 'Home' })
    expectSelected(paperTab, questionTab)
    fireEvent.keyDown(paperTab, { key: 'End' })
    expectSelected(questionTab, paperTab)
    fireEvent.keyDown(questionTab, { key: 'ArrowLeft' })
    expectSelected(paperTab, questionTab)
  })

  it('keeps question history selectable without active subjects, while disabling new question logging', () => {
    render(
      <LogsWorkspace
        sessions={[]}
        subjects={[]}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )
    const questionTab = screen.getByRole('tab', { name: 'Question practice' })
    expect(questionTab).toHaveProperty('disabled', false)
    fireEvent.click(questionTab)
    expect(screen.getByRole('heading', { name: 'Question-practice history' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Log Questions' })).toHaveProperty('disabled', true)
    expect(screen.getByText(/Confirm a study route/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '+ Log Paper' })).toBeNull()
  })

  it('disables stale launch and edit controls while a replacement catalogue request is unresolved', async () => {
    let resolveSecondCatalogue!: (val: PracticeFormSubjectOption[]) => void
    const secondCataloguePromise = new Promise<PracticeFormSubjectOption[]>(resolve => {
      resolveSecondCatalogue = resolve
    })

    const { rerender } = render(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    // Switch to Question practice tab
    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))

    // Initially resolved catalogue has controls enabled
    const launcher = screen.getByRole('button', { name: '+ Log Questions' })
    const editButton = screen.getByRole('button', { name: 'Edit' })
    expect(launcher).toHaveProperty('disabled', false)
    expect(editButton).toHaveProperty('disabled', false)

    // Second replacement request arrives and is unresolved
    rerender(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        cataloguePromise={secondCataloguePromise}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    // While replacement is pending, launch and edit controls are disabled with aria-busy
    expect(launcher).toHaveProperty('disabled', true)
    expect(launcher.getAttribute('aria-busy')).toBe('true')
    expect(launcher.getAttribute('title')).toBe('Updating available subjects…')
    expect(editButton).toHaveProperty('disabled', true)
    expect(editButton.getAttribute('aria-busy')).toBe('true')
    expect(editButton.getAttribute('title')).toBe('Updating available subjects…')

    // History and metrics remain completely available and rendered
    expect(screen.getByText('Algebra drill')).toBeTruthy()
    expect(screen.getByText('Page accuracy')).toBeTruthy()

    // Second request resolves successfully -> controls become enabled
    await act(async () => {
      resolveSecondCatalogue(subjects)
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ Log Questions' })).toHaveProperty('disabled', false)
      expect(screen.getByRole('button', { name: 'Edit' })).toHaveProperty('disabled', false)
    })
  })

  it('handles replacement catalogue failure by displaying error and keeping controls disabled', async () => {
    let rejectSecondCatalogue!: (err: Error) => void
    const failingCataloguePromise = new Promise<PracticeFormSubjectOption[]>((_, reject) => {
      rejectSecondCatalogue = reject
    })

    const { rerender } = render(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    expect(screen.getByRole('button', { name: '+ Log Questions' })).toHaveProperty('disabled', false)

    // Trigger failing replacement request
    rerender(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        cataloguePromise={failingCataloguePromise}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    expect(screen.getByRole('button', { name: '+ Log Questions' })).toHaveProperty('disabled', true)

    // Reject the promise
    await act(async () => {
      rejectSecondCatalogue(new Error('Network error'))
    })

    // Error is displayed, controls stay safely disabled, history remains available
    const errorAlert = await screen.findByRole('alert')
    expect(errorAlert.textContent).toContain('Could not load practice subjects')
    expect(screen.getByRole('button', { name: '+ Log Questions' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Algebra drill')).toBeTruthy()
  })

  it('ignores superseded out-of-order catalogue responses', async () => {
    let resolveFirst!: (val: PracticeFormSubjectOption[]) => void
    const firstPromise = new Promise<PracticeFormSubjectOption[]>(resolve => {
      resolveFirst = resolve
    })

    let resolveSecond!: (val: PracticeFormSubjectOption[]) => void
    const secondPromise = new Promise<PracticeFormSubjectOption[]>(resolve => {
      resolveSecond = resolve
    })

    const replacementSubject: PracticeFormSubjectOption = {
      ...subjects[0],
      id: '00000000-0000-4000-a000-000000000099',
      name: 'Further Mathematics',
    }

    const { rerender } = render(
      <LogsWorkspace
        sessions={[]}
        cataloguePromise={firstPromise}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    expect(screen.getByRole('button', { name: '+ Log Questions' })).toHaveProperty('disabled', true)

    // Second request is started before first resolves
    rerender(
      <LogsWorkspace
        sessions={[]}
        cataloguePromise={secondPromise}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    // Second request resolves first with Further Mathematics
    await act(async () => {
      resolveSecond([replacementSubject])
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ Log Questions' })).toHaveProperty('disabled', false)
    })

    // First (superseded) request now resolves late with Mathematics
    await act(async () => {
      resolveFirst(subjects)
    })

    // Launch modal: it should open with the active second catalogue (Further Mathematics), not the superseded first
    fireEvent.click(screen.getByRole('button', { name: '+ Log Questions' }))
    const modal = await screen.findByRole('dialog', { name: 'Log Questions' })
    expect(within(modal).getByText(/Further Mathematics/)).toBeTruthy()
  })

  it('preserves unsaved user input in open modal during background catalogue refresh', async () => {
    let resolveRefresh!: (val: PracticeFormSubjectOption[]) => void
    const refreshPromise = new Promise<PracticeFormSubjectOption[]>(resolve => {
      resolveRefresh = resolve
    })

    const { rerender } = render(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    const launcher = screen.getByRole('button', { name: '+ Log Questions' })
    fireEvent.click(launcher)

    const modal = await screen.findByRole('dialog', { name: 'Log Questions' })
    expect(modal).toBeTruthy()

    // User types into the session title field
    const titleInput = within(modal).getByLabelText('Session title (optional)')
    fireEvent.change(titleInput, { target: { value: 'Draft title being edited' } })
    expect(titleInput).toHaveProperty('value', 'Draft title being edited')

    // Background replacement request starts while modal is open
    rerender(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        cataloguePromise={refreshPromise}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    // Modal remains open and user draft title is strictly preserved
    expect(screen.getByRole('dialog', { name: 'Log Questions' })).toBeTruthy()
    expect(within(modal).getByLabelText('Session title (optional)')).toHaveProperty(
      'value',
      'Draft title being edited'
    )

    // Background request completes
    await act(async () => {
      resolveRefresh(subjects)
    })

    // Draft still preserved after resolution
    expect(within(modal).getByLabelText('Session title (optional)')).toHaveProperty(
      'value',
      'Draft title being edited'
    )
  })

  it('disables submit button and blocks programmatic/keyboard submit in open create modal during pending catalogue replacement', async () => {
    createSessionMock.mockResolvedValue({ sessionId: 'new-session' })
    let resolvePending!: (val: PracticeFormSubjectOption[]) => void
    const pendingPromise = new Promise<PracticeFormSubjectOption[]>(r => {
      resolvePending = r
    })

    const { rerender } = render(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Log Questions' }))

    const modal = await screen.findByRole('dialog', { name: 'Log Questions' })
    expect(modal).toBeTruthy()

    // Fill in marks and check Algebra chapter
    fireEvent.change(within(modal).getByLabelText('Marks obtained'), { target: { value: '8' } })
    fireEvent.change(within(modal).getByLabelText('Marks available'), { target: { value: '10' } })
    const algebraCheckbox = within(modal).getByRole('checkbox', { name: /Algebra/ })
    if (!algebraCheckbox.hasAttribute('checked')) {
      fireEvent.click(algebraCheckbox)
    }

    const submitBtn = within(modal).getByRole('button', { name: 'Log questions' })
    expect(submitBtn).toHaveProperty('disabled', false)

    // Replacement request starts
    rerender(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        cataloguePromise={pendingPromise}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    // Modal is still open, inputs preserved
    expect(screen.getByRole('dialog', { name: 'Log Questions' })).toBeTruthy()
    expect(within(modal).getByLabelText('Marks obtained')).toHaveProperty('value', '8')
    expect(within(modal).getByLabelText('Marks available')).toHaveProperty('value', '10')

    // Explanation is shown and submit button is disabled
    expect(
      within(modal).getByText('Updating subject catalogue. Form submission is paused until the catalogue is ready.')
    ).toBeTruthy()
    expect(submitBtn).toHaveProperty('disabled', true)

    // Direct form submit (e.g. keyboard Enter) is intercepted and blocked
    fireEvent.submit(submitBtn.closest('form')!)

    expect(
      within(modal).getByText('Updating subject catalogue. Please wait before saving.')
    ).toBeTruthy()
    expect(createSessionMock).not.toHaveBeenCalled()

    // Resolve replacement
    await act(async () => {
      resolvePending(subjects)
    })
  })

  it('disables submit button and blocks programmatic/keyboard submit in open edit modal during pending catalogue replacement', async () => {
    updateSessionMock.mockResolvedValue({ sessionId: sampleSession.id })
    let resolvePending!: (val: PracticeFormSubjectOption[]) => void
    const pendingPromise = new Promise<PracticeFormSubjectOption[]>(r => {
      resolvePending = r
    })

    const { rerender } = render(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const modal = await screen.findByRole('dialog', { name: 'Edit question practice' })
    expect(modal).toBeTruthy()

    const submitBtn = within(modal).getByRole('button', { name: 'Save changes' })
    expect(submitBtn).toHaveProperty('disabled', false)

    // Replacement request starts
    rerender(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        cataloguePromise={pendingPromise}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    // Modal remains open, explanation shown, submit button disabled
    expect(screen.getByRole('dialog', { name: 'Edit question practice' })).toBeTruthy()
    expect(
      within(modal).getByText('Updating subject catalogue. Form submission is paused until the catalogue is ready.')
    ).toBeTruthy()
    expect(submitBtn).toHaveProperty('disabled', true)

    // Direct form submit blocked without invoking server action
    fireEvent.submit(submitBtn.closest('form')!)

    expect(
      within(modal).getByText('Updating subject catalogue. Please wait before saving.')
    ).toBeTruthy()
    expect(updateSessionMock).not.toHaveBeenCalled()

    // Resolve replacement
    await act(async () => {
      resolvePending(subjects)
    })
  })

  it('keeps submit blocked and preserves draft when catalogue replacement fails', async () => {
    createSessionMock.mockResolvedValue({ sessionId: 'new-session' })
    let rejectPending!: (err: Error) => void
    const pendingPromise = new Promise<PracticeFormSubjectOption[]>((_, reject) => {
      rejectPending = reject
    })

    const { rerender } = render(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Log Questions' }))

    const modal = await screen.findByRole('dialog', { name: 'Log Questions' })
    expect(modal).toBeTruthy()

    fireEvent.change(within(modal).getByLabelText('Session title (optional)'), {
      target: { value: 'Unsaved custom title' },
    })

    // Replacement request starts
    rerender(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        cataloguePromise={pendingPromise}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    // Replacement fails
    await act(async () => {
      rejectPending(new Error('Network error'))
    })

    // Modal stays open, title draft is preserved
    expect(screen.getByRole('dialog', { name: 'Log Questions' })).toBeTruthy()
    expect(within(modal).getByLabelText('Session title (optional)')).toHaveProperty(
      'value',
      'Unsaved custom title'
    )

    // Error alert is shown
    expect(
      within(modal).getByText('Could not load practice subjects. Please refresh to retry.')
    ).toBeTruthy()

    // Submit button remains disabled
    const submitBtn = within(modal).getByRole('button', { name: 'Log questions' })
    expect(submitBtn).toHaveProperty('disabled', true)

    // Direct form submit is blocked
    fireEvent.submit(submitBtn.closest('form')!)
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('revalidates chapter selections on replacement and displays actionable error for invalid chapters in create flow', async () => {
    createSessionMock.mockResolvedValue({ sessionId: 'new-session' })
    const replacementChapterId = '00000000-0000-4000-a000-000000000004'
    const replacementSubject: PracticeFormSubjectOption = {
      id: subjectId,
      name: 'Mathematics',
      code: '9709',
      context: {
        enrollment: {
          id: 'enrollment',
          subjectId,
          subjectCode: '9709',
          studyRoute: 'staged',
          currentStage: 'as',
          isArchived: false,
        },
        selections: [{ subjectPaperId: paperId, componentName: 'Pure 1', stage: 'as' }],
        chapters: [
          {
            id: replacementChapterId,
            subjectId,
            number: 2,
            title: 'Calculus',
            stage: 'as',
            component: 'Pure 1',
            isActive: true,
            paperIds: [paperId],
          },
        ],
        papers: [{ id: paperId, subjectId, paperNumber: 1, name: 'Pure Mathematics 1' }],
      },
    }

    let resolvePending!: (val: PracticeFormSubjectOption[]) => void
    const pendingPromise = new Promise<PracticeFormSubjectOption[]>(r => {
      resolvePending = r
    })

    const { rerender } = render(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Log Questions' }))

    const modal = await screen.findByRole('dialog', { name: 'Log Questions' })
    fireEvent.change(within(modal).getByLabelText('Marks obtained'), { target: { value: '9' } })
    fireEvent.change(within(modal).getByLabelText('Marks available'), { target: { value: '10' } })
    fireEvent.click(within(modal).getByRole('checkbox', { name: /Algebra/ }))

    // Background replacement replaces chapters with Calculus (removing Algebra)
    rerender(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        cataloguePromise={pendingPromise}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    await act(async () => {
      resolvePending([replacementSubject])
    })

    // Now catalogue resolved, submit button enabled
    const submitBtn = within(modal).getByRole('button', { name: 'Log questions' })
    expect(submitBtn).toHaveProperty('disabled', false)

    // User attempts to save with now-ineligible Algebra chapter selected
    fireEvent.click(submitBtn)

    // Actionable validation error is shown and action is NOT called
    expect(
      within(modal).getByText('Question 1: choose at least one eligible chapter and remove any chapters that are no longer eligible.')
    ).toBeTruthy()
    expect(within(modal).getByText(/· no longer eligible/)).toBeTruthy()
    expect(createSessionMock).not.toHaveBeenCalled()

    // User unchecks the ineligible chapter and selects Calculus
    const ineligibleCheckbox = within(modal).getByRole('checkbox', { name: /no longer eligible/ })
    fireEvent.click(ineligibleCheckbox)
    const calculusCheckbox = within(modal).getByRole('checkbox', { name: /Calculus/ })
    fireEvent.click(calculusCheckbox)

    // Now user submits again
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(createSessionMock).toHaveBeenCalledTimes(1)
      expect(getLogsSubjectDataMock).toHaveBeenCalled()
    })
  })

  it('revalidates chapter selections on replacement and displays actionable error for invalid chapters in edit flow', async () => {
    updateSessionMock.mockResolvedValue({ sessionId: sampleSession.id })
    const replacementChapterId = '00000000-0000-4000-a000-000000000004'
    const replacementSubject: PracticeFormSubjectOption = {
      id: subjectId,
      name: 'Mathematics',
      code: '9709',
      context: {
        enrollment: {
          id: 'enrollment',
          subjectId,
          subjectCode: '9709',
          studyRoute: 'staged',
          currentStage: 'as',
          isArchived: false,
        },
        selections: [{ subjectPaperId: paperId, componentName: 'Pure 1', stage: 'as' }],
        chapters: [
          {
            id: replacementChapterId,
            subjectId,
            number: 2,
            title: 'Calculus',
            stage: 'as',
            component: 'Pure 1',
            isActive: true,
            paperIds: [paperId],
          },
        ],
        papers: [{ id: paperId, subjectId, paperNumber: 1, name: 'Pure Mathematics 1' }],
      },
    }

    let resolvePending!: (val: PracticeFormSubjectOption[]) => void
    const pendingPromise = new Promise<PracticeFormSubjectOption[]>(r => {
      resolvePending = r
    })

    const { rerender } = render(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const modal = await screen.findByRole('dialog', { name: 'Edit question practice' })

    // Background replacement replaces chapters with Calculus
    rerender(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        cataloguePromise={pendingPromise}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    await act(async () => {
      resolvePending([replacementSubject])
    })

    const submitBtn = within(modal).getByRole('button', { name: 'Save changes' })
    expect(submitBtn).toHaveProperty('disabled', false)

    // User attempts to save with sampleSession's Algebra chapter which is now ineligible
    fireEvent.click(submitBtn)

    expect(
      within(modal).getByText('Question 1: choose at least one eligible chapter and remove any chapters that are no longer eligible.')
    ).toBeTruthy()
    expect(within(modal).getByText(/· no longer eligible/)).toBeTruthy()
    expect(updateSessionMock).not.toHaveBeenCalled()

    // User unchecks the ineligible chapter and selects Calculus
    const ineligibleCheckbox = within(modal).getByRole('checkbox', { name: /no longer eligible/ })
    fireEvent.click(ineligibleCheckbox)
    const calculusCheckbox = within(modal).getByRole('checkbox', { name: /Calculus/ })
    fireEvent.click(calculusCheckbox)

    // User submits again
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(updateSessionMock).toHaveBeenCalledTimes(1)
      expect(getLogsSubjectDataMock).toHaveBeenCalled()
    })
  })

  it('safely consumes streamed RSC thenables returning undefined without throwing Cannot read properties of undefined (reading catch)', async () => {
    let fulfillStreamed!: (val: PracticeFormSubjectOption[]) => void
    const streamedThenable: PromiseLike<PracticeFormSubjectOption[]> = {
      then(onFulfill) {
        fulfillStreamed = (val: PracticeFormSubjectOption[]) => onFulfill?.(val)
        // Simulated React RSC Flight streamed thenable does NOT return a chainable promise
        return undefined as unknown as PromiseLike<never>
      },
    }

    render(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        cataloguePromise={streamedThenable}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    // Verify it doesn't throw and loads properly when fulfilled
    await act(async () => {
      fulfillStreamed(subjects)
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    expect(screen.getByRole('button', { name: '+ Log Questions' })).toBeTruthy()
  })

  it('safely handles rejections from streamed RSC thenables returning undefined', async () => {
    let rejectStreamed!: (err: unknown) => void
    const streamedThenable: PromiseLike<PracticeFormSubjectOption[]> = {
      then(_onFulfill, onReject) {
        rejectStreamed = (err: unknown) => onReject?.(err)
        return undefined as unknown as PromiseLike<never>
      },
    }

    render(
      <LogsWorkspace
        sessions={[sampleSession]}
        subjects={subjects}
        cataloguePromise={streamedThenable}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    await act(async () => {
      rejectStreamed(new Error('Network error'))
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    expect(screen.getByRole('alert').textContent).toContain('Could not load practice subjects. Please refresh to retry.')
    expect(screen.getByRole('button', { name: '+ Log Questions' })).toHaveProperty('disabled', true)
  })
})
