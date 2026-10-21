import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StatsWorkspace } from '@/components/papers/stats-workspace'
import { LogsWorkspace } from '@/components/papers/logs-workspace'
import {
  clearSessionCache,
  getCachedFormCatalogue,
  getCachedLogsSubjectData,
  getCachedStatsOverview,
  getCachedStatsSubjectData,
  invalidateSessionCache,
  setCachedFormCatalogue,
  setCachedLogsSubjectData,
  setCachedStatsOverview,
  setCachedStatsSubjectData,
  getSessionUserId,
  setSessionUserId,
  getCachedStatsStudyIndicators,
  type LogsSubjectData,
  type StatsOverviewData,
  type StatsSubjectData,
} from '@/lib/session-cache'
import type { PracticeFormSubjectOption, PracticeRouteContext, PracticeSessionRead } from '@/types/practice-sessions'
import type { ChapterAccuracy, PaperWithSubject } from '@/types'
import type { IndicatorItem } from '@/components/papers/study-indicators'

const mathId = '00000000-0000-4000-a000-000000000001'
const physicsId = '00000000-0000-4000-a000-000000000002'

const mockSubjects = [
  { id: mathId, name: 'Mathematics', color_hex: '#3b82f6', code: '9709' },
  { id: physicsId, name: 'Physics', color_hex: '#10b981', code: '9702' },
]

const mockRouteContext: PracticeRouteContext = {
  enrollment: {
    id: 'enrollment-1',
    subjectId: mathId,
    subjectCode: '9709',
    studyRoute: 'staged',
    currentStage: 'as',
    isArchived: false,
  },
  selections: [{ subjectPaperId: 'paper-pure-1', componentName: 'Pure 1', stage: 'as' }],
  chapters: [],
  papers: [],
}

function makeStatsOverview(sId: string | null, title: string): StatsOverviewData {
  return {
    subjectId: sId,
    trend: [
      {
        id: `trend-${sId ?? 'all'}`,
        source: 'full_paper',
        subjectId: sId ?? mathId,
        stage: 'as',
        attemptDate: '2026-10-15',
        createdAt: '2026-10-15T10:00:00Z',
        subjectPaperId: null,
        paperNumber: 1,
        raw: 40,
        max: 50,
        accuracyPct: 80,
        eligibleRaw: 40,
        eligibleMax: 50,
        eligibleForCurrentRoute: true,
        itemCount: 0,
      },
    ],
    trendSubjects: mockSubjects,
    summaryStats: [
      { label: 'Papers logged', value: 2 },
      { label: 'Full-paper average', value: '80.0%' },
      { label: 'Best full paper', value: '85.0%' },
    ],
    componentStats: [
      {
        label: `${title} · AS · Paper 1`,
        count: 2,
        markWeightedAccuracyPct: 80,
        averageRaw: 40,
        averageMax: 50,
        ranking: null,
      },
    ],
    activeSubjectName: sId ? title : null,
    timestamp: Date.now(),
  }
}

function makeStatsChapter(sId: string | null, title: string): ChapterAccuracy[] {
  if (!sId) return []
  return [
    {
      chapter_id: `ch-${sId}`,
      title: `${title} Topic A`,
      component: 'Paper 1',
      total_obtained: 8,
      total_available: 10,
      accuracy_pct: 80,
      attempt_count: 1,
    },
  ]
}

function makeStatsIndicators(sId: string | null, title: string): IndicatorItem[] {
  return [
    {
      subjectId: sId ?? mathId,
      subjectName: title,
      stage: 'as',
      isCurrentStage: true,
      isLockedA2: false,
      predicted: {
        subjectId: sId ?? mathId,
        stage: 'as',
        predictedPercentage: 80,
        obtainedMarks: 40,
        availableMarks: 50,
        fullPaperCount: 1,
        practiceItemCount: 1,
        contributingAttemptCount: 2,
      },
      readinessScore: 75,
      hasRecordedHistory: true,
    },
  ]
}

function makeStatsData(sId: string | null, title: string): StatsSubjectData {
  return {
    ...makeStatsOverview(sId, title),
    chapterAccuracy: makeStatsChapter(sId, title),
    studyIndicators: makeStatsIndicators(sId, title),
  }
}

function makeLogsData(sId: string | null, page: number, count: number): LogsSubjectData {
  const sessions: PracticeSessionRead[] = Array.from({ length: count }, (_, i) => ({
    id: `session-${sId ?? 'all'}-p${page}-${i}`,
    user_id: 'user-1',
    subject_id: sId ?? mathId,
    session_date: '2026-10-15',
    title: `${sId ? (sId === mathId ? 'Math' : 'Physics') : 'All'} Drill P${page} #${i + 1}`,
    stage: 'as',
    duration_mins: 30,
    notes: null,
    total_score_raw: 20,
    total_score_max: 25,
    accuracy_pct: 80,
    subject_paper_id: null,
    paper_number: null,
    exam_year: null,
    exam_series: null,
    exam_variant: null,
    source_label: null,
    created_at: '2026-10-15T10:00:00Z',
    updated_at: '2026-10-15T10:00:00Z',
    eligible_score_raw: 20,
    eligible_score_max: 25,
    eligible_for_readiness: true,
    route_status: 'current',
    items: [],
  }))

  const papers: PaperWithSubject[] = [
    {
      id: `paper-${sId ?? 'all'}-1`,
      user_id: 'user-1',
      subject_id: sId ?? mathId,
      subject_paper_id: 'paper-1',
      paper_code: '9709_s26_qp_12',
      year: 2026,
      session: 'may_jun',
      stage: 'as',
      paper_number: 1,
      attempted_at: '2026-10-15',
      time_taken_mins: 60,
      score_raw: 40,
      score_max: 50,
      accuracy_pct: 80,
      notes: null,
      created_at: '2026-10-15T10:00:00Z',
      subjects: { name: sId === physicsId ? 'Physics' : 'Mathematics', color_hex: '#3b82f6', code: '9709' },
    },
  ]

  return {
    subjectId: sId,
    page,
    pageSize: 50,
    sessions,
    totalSessions: count > 0 ? 60 : 0, // total > 50 triggers pagination
    papers,
    untaggedPapers: [],
    timestamp: Date.now(),
  }
}

const {
  mockGetStatsSubjectData,
  mockGetStatsOverviewData,
  mockGetStatsChapterAccuracy,
  mockGetStatsStudyIndicators,
  mockGetLogsSubjectData,
  mockDeletePracticeSession,
} = vi.hoisted(() => ({
  mockGetStatsSubjectData: vi.fn(),
  mockGetStatsOverviewData: vi.fn(),
  mockGetStatsChapterAccuracy: vi.fn(),
  mockGetStatsStudyIndicators: vi.fn(),
  mockGetLogsSubjectData: vi.fn(),
  mockDeletePracticeSession: vi.fn(),
}))

vi.mock('@/lib/actions/practice-sessions', () => ({
  getStatsSubjectData: mockGetStatsSubjectData,
  getStatsOverviewData: mockGetStatsOverviewData,
  getStatsChapterAccuracy: mockGetStatsChapterAccuracy,
  getStatsStudyIndicators: mockGetStatsStudyIndicators,
  getLogsSubjectData: mockGetLogsSubjectData,
  deletePracticeSession: mockDeletePracticeSession,
}))

vi.mock('@/lib/stats-client', () => ({
  fetchStatsSubjectData: mockGetStatsSubjectData,
  fetchStatsOverview: mockGetStatsOverviewData,
  fetchStatsChapterAccuracy: mockGetStatsChapterAccuracy,
  fetchStatsStudyIndicators: mockGetStatsStudyIndicators,
}))

vi.mock('@/components/papers/paper-charts', () => ({
  LazyChapterAccuracyChart: ({ data }: { data: { title: string }[] }) => (
    <div data-testid="chapter-chart">
      {data.map((d, i) => (
        <span key={i}>{d.title}</span>
      ))}
    </div>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const originalPushState = typeof window !== 'undefined' ? window.history.pushState : undefined

beforeEach(() => {
  clearSessionCache()
  setSessionUserId(null)
  vi.clearAllMocks()

  mockGetStatsOverviewData.mockImplementation(async (sId: string | null) =>
    makeStatsOverview(sId, sId === mathId ? 'Mathematics' : sId === physicsId ? 'Physics' : 'All Subjects')
  )
  mockGetStatsChapterAccuracy.mockImplementation(async (sId: string | null) =>
    makeStatsChapter(sId, sId === mathId ? 'Mathematics' : sId === physicsId ? 'Physics' : 'All Subjects')
  )
  mockGetStatsStudyIndicators.mockImplementation(async (sId: string | null) =>
    makeStatsIndicators(sId, sId === mathId ? 'Mathematics' : sId === physicsId ? 'Physics' : 'All Subjects')
  )

  if (typeof window !== 'undefined' && originalPushState) {
    window.history.pushState = vi.fn((state, unused, url) => {
      originalPushState.call(window.history, state, unused, url)
    })
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  }
})

afterEach(() => {
  cleanup()
})

describe('StatsWorkspace Subject Switching & Caching', () => {
  it('provides immediate visual tab feedback and performs cold fetch on first switch, warm cache hit on repeated switch', async () => {
    const allOverview = makeStatsOverview(null, 'All Subjects')
    const allIndicators = makeStatsIndicators(null, 'All Subjects')

    render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={allOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={allIndicators}
      />
    )

    // Initial view is All
    expect(screen.getByRole('link', { name: /all/i }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('All Subjects · AS · Paper 1')).toBeTruthy()

    // 1. Cold switch: click Mathematics
    const mathTab = screen.getByRole('link', { name: /mathematics/i })
    fireEvent.click(mathTab)

    // Immediate visual tab feedback
    expect(mathTab.getAttribute('aria-current')).toBe('page')
    expect(window.history.pushState).toHaveBeenCalledWith(null, '', `/stats?subject=${mathId}`)
    expect(mockGetStatsOverviewData).toHaveBeenCalledTimes(1)
    expect(mockGetStatsOverviewData).toHaveBeenCalledWith(mathId, expect.anything())

    // Mathematics content resolves
    await waitFor(() => {
      expect(screen.getByText('Mathematics Topic A')).toBeTruthy()
      expect(screen.getByText('Mathematics · AS · Paper 1')).toBeTruthy()
    })

    // 2. Cold switch: click Physics
    const physicsTab = screen.getByRole('link', { name: /physics/i })
    fireEvent.click(physicsTab)

    expect(physicsTab.getAttribute('aria-current')).toBe('page')
    expect(mockGetStatsOverviewData).toHaveBeenCalledTimes(2)
    expect(mockGetStatsOverviewData).toHaveBeenCalledWith(physicsId, expect.anything())

    await waitFor(() => {
      expect(screen.getByText('Physics Topic A')).toBeTruthy()
      expect(screen.getByText('Physics · AS · Paper 1')).toBeTruthy()
    })

    // 3. Repeated switch (Warm hit): click Mathematics again
    fireEvent.click(mathTab)

    // Crucial check: NO network roundtrip or Server Action invocation!
    expect(mockGetStatsOverviewData).toHaveBeenCalledTimes(2) // Still 2!
    // Instantly renders cached Mathematics data
    expect(screen.getByText('Mathematics Topic A')).toBeTruthy()
    expect(screen.getByText('Mathematics · AS · Paper 1')).toBeTruthy()

    // 4. Repeated switch (Warm hit): click All again
    const allTab = screen.getByRole('link', { name: /all/i })
    fireEvent.click(allTab)

    // Still 2! Seeded initial All data was cached
    expect(mockGetStatsOverviewData).toHaveBeenCalledTimes(2)
    expect(allTab.getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('All Subjects · AS · Paper 1')).toBeTruthy()
  })

  it('supersedes pending cold Mathematics request when user selects cached All, discarding Math response', async () => {
    let resolveMathOverview!: (val: StatsOverviewData) => void
    let resolveMathChapter!: (val: ChapterAccuracy[]) => void
    let resolveMathIndicators!: (val: IndicatorItem[]) => void

    const mathOverviewPromise = new Promise<StatsOverviewData>((res) => {
      resolveMathOverview = res
    })
    const mathChapterPromise = new Promise<ChapterAccuracy[]>((res) => {
      resolveMathChapter = res
    })
    const mathIndicatorsPromise = new Promise<IndicatorItem[]>((res) => {
      resolveMathIndicators = res
    })

    mockGetStatsOverviewData.mockImplementation(async (sId: string | null) => {
      if (sId === mathId) return mathOverviewPromise
      return makeStatsOverview(null, 'All')
    })
    mockGetStatsChapterAccuracy.mockImplementation(async (sId: string | null) => {
      if (sId === mathId) return mathChapterPromise
      return []
    })
    mockGetStatsStudyIndicators.mockImplementation(async (sId: string | null) => {
      if (sId === mathId) return mathIndicatorsPromise
      return makeStatsIndicators(null, 'All')
    })

    const allOverview = makeStatsOverview(null, 'All')
    render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={allOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All')}
      />
    )

    // Initial state is All
    expect(screen.getByRole('link', { name: /all/i }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('All · AS · Paper 1')).toBeTruthy()

    // User starts cold Mathematics loading
    const mathTab = screen.getByRole('link', { name: /mathematics/i })
    fireEvent.click(mathTab)
    expect(mathTab.getAttribute('aria-current')).toBe('page')

    // While Math is pending, user clicks back to cached All
    const allTab = screen.getByRole('link', { name: /all/i })
    fireEvent.click(allTab)
    expect(allTab.getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('All · AS · Paper 1')).toBeTruthy()

    // Late Mathematics responses finally arrive
    resolveMathOverview(makeStatsOverview(mathId, 'Mathematics'))
    resolveMathChapter(makeStatsChapter(mathId, 'Mathematics'))
    resolveMathIndicators(makeStatsIndicators(mathId, 'Mathematics'))

    // Crucial regression check: All MUST remain selected and displayed! Late Math response discarded!
    expect(allTab.getAttribute('aria-current')).toBe('page')
    expect(screen.queryByText('Mathematics Topic A')).toBeNull()
    expect(screen.getByText('All · AS · Paper 1')).toBeTruthy()
  })

  it('supersedes pending cold Mathematics request when user selects cached All, discarding Math error', async () => {
    let rejectMathOverview!: (err: Error) => void
    const mathOverviewPromise = new Promise<StatsOverviewData>((_, rej) => {
      rejectMathOverview = rej
    })

    mockGetStatsOverviewData.mockImplementation(async (sId: string | null) => {
      if (sId === mathId) return mathOverviewPromise
      return makeStatsOverview(null, 'All')
    })

    const allOverview = makeStatsOverview(null, 'All')
    render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={allOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All')}
      />
    )

    // User starts cold Mathematics loading
    const mathTab = screen.getByRole('link', { name: /mathematics/i })
    fireEvent.click(mathTab)

    // User immediately switches back to cached All
    const allTab = screen.getByRole('link', { name: /all/i })
    fireEvent.click(allTab)
    expect(allTab.getAttribute('aria-current')).toBe('page')

    // Cold Mathematics request rejects with error
    rejectMathOverview(new Error('Network failure during Math fetch'))

    // Crucial check: Math error MUST NOT surface on All view!
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
    expect(allTab.getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('All · AS · Paper 1')).toBeTruthy()
  })

  it('renders progressive cold loading: overview trend and metrics display while lower sections show skeletons', async () => {
    let resolveChapter!: (val: ChapterAccuracy[]) => void
    let resolveIndicators!: (val: IndicatorItem[]) => void

    const chapterPromise = new Promise<ChapterAccuracy[]>((res) => {
      resolveChapter = res
    })
    const indicatorsPromise = new Promise<IndicatorItem[]>((res) => {
      resolveIndicators = res
    })

    mockGetStatsOverviewData.mockResolvedValue(makeStatsOverview(mathId, 'Mathematics'))
    mockGetStatsChapterAccuracy.mockReturnValue(chapterPromise)
    mockGetStatsStudyIndicators.mockReturnValue(indicatorsPromise)

    render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={makeStatsOverview(null, 'All')}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All')}
      />
    )

    // Switch to Mathematics
    fireEvent.click(screen.getByRole('link', { name: /mathematics/i }))

    // 1. Overview data resolves first
    await waitFor(() => {
      expect(screen.getByText('Mathematics · AS · Paper 1')).toBeTruthy()
    })

    // Skeletons are shown for pending lower sections
    expect(screen.getByRole('status', { name: 'Loading chapter accuracy' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading study indicators' })).toBeTruthy()

    // 2. Resolve chapter and indicators
    resolveChapter(makeStatsChapter(mathId, 'Mathematics'))
    resolveIndicators(makeStatsIndicators(mathId, 'Mathematics'))

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading chapter accuracy' })).toBeNull()
      expect(screen.queryByRole('status', { name: 'Loading study indicators' })).toBeNull()
      expect(screen.getByText('Mathematics Topic A')).toBeTruthy()
    })
  })

  it('separates selectedSubjectId from displayedSubjectId so old results are not mislabeled as new subject', async () => {
    let resolveMathOverview!: (val: StatsOverviewData) => void
    const mathOverviewPromise = new Promise<StatsOverviewData>((res) => {
      resolveMathOverview = res
    })
    mockGetStatsOverviewData.mockImplementation(async (sId: string | null) => {
      if (sId === mathId) return mathOverviewPromise
      return makeStatsOverview(null, 'All')
    })

    render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={makeStatsOverview(null, 'All')}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All')}
      />
    )

    // Initially displays All
    expect(screen.getByText('All · AS · Paper 1')).toBeTruthy()

    // User clicks Mathematics (uncached, in-flight)
    fireEvent.click(screen.getByRole('link', { name: /mathematics/i }))

    // Tab shows Mathematics selected immediately
    expect(screen.getByRole('link', { name: /mathematics/i }).getAttribute('aria-current')).toBe('page')

    // Old All metrics MUST NOT be mislabeled as Mathematics!
    // Component breakdown and summary stats show skeleton/loading sentinel while uncached
    expect(screen.queryByText('All · AS · Paper 1')).toBeNull()

    // Resolve Math
    resolveMathOverview(makeStatsOverview(mathId, 'Mathematics'))
    await waitFor(() => {
      expect(screen.getByText('Mathematics · AS · Paper 1')).toBeTruthy()
    })
  })

  it('surfaces accessible error alert on fetch failure and supports retry', async () => {
    let shouldFail = true
    mockGetStatsOverviewData.mockImplementation(async (sId: string | null) => {
      if (shouldFail) throw new Error('Database connection failed')
      return makeStatsOverview(sId, 'Mathematics')
    })

    render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={makeStatsOverview(null, 'All')}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All')}
      />
    )

    fireEvent.click(screen.getByRole('link', { name: /mathematics/i }))

    // Error alert is rendered
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Could not load statistics for this subject. Please retry.')

    // Click retry
    shouldFail = false
    const retryBtn = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.getByText('Mathematics · AS · Paper 1')).toBeTruthy()
    })
  })

  it('synchronizes subject selection with browser popstate navigation', async () => {
    const allOverview = makeStatsOverview(null, 'All')
    const mathOverview = makeStatsOverview(mathId, 'Mathematics')

    render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={allOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All')}
      />
    )

    // Pre-cache math data in session cache
    setCachedStatsOverview(mathId, mathOverview)

    // Simulate browser Back button to Mathematics: URL changes to ?subject=mathId
    window.history.pushState(null, '', `/stats?subject=${mathId}`)
    window.dispatchEvent(new Event('popstate'))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /mathematics/i }).getAttribute('aria-current')).toBe('page')
      expect(screen.getByText('Mathematics · AS · Paper 1')).toBeTruthy()
    })

    // Simulate browser Back button to All: URL search is empty
    window.history.pushState(null, '', '/stats')
    window.dispatchEvent(new Event('popstate'))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /all/i }).getAttribute('aria-current')).toBe('page')
    })
  })

  it('preserves pending chapter and indicator work when user clicks already-selected subject tab', async () => {
    let resolveChapter!: (val: ChapterAccuracy[]) => void
    let resolveIndicators!: (val: IndicatorItem[]) => void

    const chapterPromise = new Promise<ChapterAccuracy[]>((res) => {
      resolveChapter = res
    })
    const indicatorsPromise = new Promise<IndicatorItem[]>((res) => {
      resolveIndicators = res
    })

    mockGetStatsOverviewData.mockResolvedValue(makeStatsOverview(mathId, 'Mathematics'))
    mockGetStatsChapterAccuracy.mockReturnValue(chapterPromise)
    mockGetStatsStudyIndicators.mockReturnValue(indicatorsPromise)

    render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={makeStatsOverview(null, 'All')}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All')}
      />
    )

    // Switch to Mathematics: overview resolves, chapter & indicators pending
    const mathTab = screen.getByRole('link', { name: /mathematics/i })
    fireEvent.click(mathTab)

    await waitFor(() => {
      expect(screen.getByText('Mathematics · AS · Paper 1')).toBeTruthy()
    })
    expect(screen.getByRole('status', { name: 'Loading chapter accuracy' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading study indicators' })).toBeTruthy()

    // User clicks the Mathematics tab again while lower sections are still loading
    fireEvent.click(mathTab)

    // Now chapter accuracy and indicators resolve
    resolveChapter(makeStatsChapter(mathId, 'Mathematics'))
    resolveIndicators(makeStatsIndicators(mathId, 'Mathematics'))

    // The in-flight responses MUST NOT be canceled by the same-subject click!
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading chapter accuracy' })).toBeNull()
      expect(screen.queryByRole('status', { name: 'Loading study indicators' })).toBeNull()
      expect(screen.getByText('Mathematics Topic A')).toBeTruthy()
    })
  })

  it('reconciles refreshed props when rerendered with updated initialOverview for current subject', async () => {
    const initialOverview = makeStatsOverview(null, 'All Subjects')
    initialOverview.summaryStats = [{ label: 'Papers logged', value: 2 }]

    const { rerender } = render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={initialOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All Subjects')}
      />
    )

    expect(screen.getByText('2')).toBeTruthy()

    // Rerender with fresh server props: Papers logged updated to 5
    const updatedOverview = makeStatsOverview(null, 'All Subjects')
    updatedOverview.summaryStats = [{ label: 'Papers logged', value: 5 }]

    rerender(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={updatedOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All Subjects')}
      />
    )

    // The displayed value updates to 5 immediately
    expect(screen.getByText('5')).toBeTruthy()
    // And cached aggregate overview is also updated
    expect(getCachedStatsOverview(null)?.summaryStats[0].value).toBe(5)
  })

  it('prevents older in-flight cold requests from overwriting freshly reconciled props', async () => {
    let resolveMathOverview!: (val: StatsOverviewData) => void
    const mathPromise = new Promise<StatsOverviewData>((res) => {
      resolveMathOverview = res
    })

    mockGetStatsOverviewData.mockImplementation(async (sId: string | null) => {
      if (sId === mathId) return mathPromise
      return makeStatsOverview(sId, 'Overview')
    })

    const initialOverview = makeStatsOverview(null, 'All')
    initialOverview.summaryStats = [{ label: 'Papers logged', value: 10 }]

    const { rerender } = render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={initialOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All')}
      />
    )

    // User clicks Mathematics, starting cold fetch
    fireEvent.click(screen.getByRole('link', { name: /mathematics/i }))

    // While Math fetch is pending, parent re-renders with new authoritative initialSubjectId = physicsId
    const physicsOverview = makeStatsOverview(physicsId, 'Physics')
    physicsOverview.summaryStats = [{ label: 'Papers logged', value: 99 }]

    rerender(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={physicsId}
        initialOverview={physicsOverview}
        initialChapterAccuracy={makeStatsChapter(physicsId, 'Physics')}
        initialStudyIndicators={makeStatsIndicators(physicsId, 'Physics')}
      />
    )

    // Physics is displayed
    expect(screen.getByText('Physics · AS · Paper 1')).toBeTruthy()
    expect(screen.getByText('99')).toBeTruthy()

    // Older Math fetch resolves
    resolveMathOverview(makeStatsOverview(mathId, 'Mathematics'))

    // Crucial check: Math cannot overwrite the freshly updated Physics view!
    await waitFor(() => {
      expect(screen.getByText('Physics · AS · Paper 1')).toBeTruthy()
      expect(screen.queryByText('Mathematics · AS · Paper 1')).toBeNull()
    })
  })

  it('resets state, cancels in-flight work, and isolates data when userId prop changes', async () => {
    let resolvePendingMath!: (val: StatsOverviewData) => void
    const pendingMathPromise = new Promise<StatsOverviewData>((res) => {
      resolvePendingMath = res
    })
    mockGetStatsOverviewData.mockReturnValue(pendingMathPromise)

    const user1Overview = makeStatsOverview(null, 'User 1 All')
    user1Overview.summaryStats = [{ label: 'Papers logged', value: 42 }]

    const { rerender } = render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={user1Overview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'User 1 All')}
      />
    )

    // User 1 starts cold Math fetch
    fireEvent.click(screen.getByRole('link', { name: /mathematics/i }))

    // User 1 cache has data
    setCachedStatsOverview(mathId, makeStatsOverview(mathId, 'User 1 Math Cached'))
    expect(getCachedStatsOverview(mathId)).not.toBeNull()

    // Account changes to user-2
    const user2Overview = makeStatsOverview(null, 'User 2 All')
    user2Overview.summaryStats = [{ label: 'Papers logged', value: 1 }]

    rerender(
      <StatsWorkspace
        userId="user-2"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={user2Overview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'User 2 All')}
      />
    )

    // User 2 sees their own data
    expect(screen.getByText('1')).toBeTruthy()
    // User 1's cache is wiped
    expect(getCachedStatsOverview(mathId)).toBeNull()

    // Pending Math request from User 1 resolves
    resolvePendingMath(makeStatsOverview(mathId, 'User 1 Stale Result'))

    // Stale result cannot overwrite User 2's display
    await waitFor(() => {
      expect(screen.getByText('1')).toBeTruthy()
      expect(screen.queryByText('User 1 Stale Result')).toBeNull()
    })
  })

  it('preserves and completes pending chapter/indicators requests when current subject overview is refreshed', async () => {
    let resolveChapter!: (val: ChapterAccuracy[]) => void
    let resolveIndicators!: (val: IndicatorItem[]) => void

    const chapterPromise = new Promise<ChapterAccuracy[]>((res) => {
      resolveChapter = res
    })
    const indicatorsPromise = new Promise<IndicatorItem[]>((res) => {
      resolveIndicators = res
    })

    mockGetStatsChapterAccuracy.mockReturnValue(chapterPromise)
    mockGetStatsStudyIndicators.mockReturnValue(indicatorsPromise)

    const initialMathOverview = makeStatsOverview(mathId, 'Mathematics')
    initialMathOverview.summaryStats = [{ label: 'Papers logged', value: 1 }]

    const { rerender } = render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={mathId}
        initialOverview={initialMathOverview}
        initialChapterAccuracy={null}
        initialStudyIndicators={null}
      />
    )

    // Initial overview renders, chapters & indicators are pending
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading chapter accuracy' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading study indicators' })).toBeTruthy()

    // Server sends refreshed overview for the same subject (Papers logged = 77)
    const refreshedMathOverview = makeStatsOverview(mathId, 'Mathematics')
    refreshedMathOverview.summaryStats = [{ label: 'Papers logged', value: 77 }]

    rerender(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={mathId}
        initialOverview={refreshedMathOverview}
        initialChapterAccuracy={null}
        initialStudyIndicators={null}
      />
    )

    // Overview updates immediately to 77
    expect(screen.getByText('77')).toBeTruthy()

    // Now chapter accuracy and study indicators resolve
    resolveChapter(makeStatsChapter(mathId, 'Mathematics'))
    resolveIndicators(makeStatsIndicators(mathId, 'Mathematics'))

    // Crucial check: Pending requests were NOT canceled by overview refresh! Skeletons disappear!
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading chapter accuracy' })).toBeNull()
      expect(screen.queryByRole('status', { name: 'Loading study indicators' })).toBeNull()
      expect(screen.getByText('Mathematics Topic A')).toBeTruthy()
    })
  })

  it('preserves intentionally selected subject requests when refreshed original All props arrive', async () => {
    let resolveMathOverview!: (val: StatsOverviewData) => void
    let resolveMathChapter!: (val: ChapterAccuracy[]) => void
    let resolveMathIndicators!: (val: IndicatorItem[]) => void

    const mathOverviewPromise = new Promise<StatsOverviewData>((res) => {
      resolveMathOverview = res
    })
    const mathChapterPromise = new Promise<ChapterAccuracy[]>((res) => {
      resolveMathChapter = res
    })
    const mathIndicatorsPromise = new Promise<IndicatorItem[]>((res) => {
      resolveMathIndicators = res
    })

    mockGetStatsOverviewData.mockImplementation(async (sId: string | null) => {
      if (sId === mathId) return mathOverviewPromise
      return makeStatsOverview(sId, 'Overview')
    })
    mockGetStatsChapterAccuracy.mockImplementation(async (sId: string | null) => {
      if (sId === mathId) return mathChapterPromise
      return []
    })
    mockGetStatsStudyIndicators.mockImplementation(async (sId: string | null) => {
      if (sId === mathId) return mathIndicatorsPromise
      return []
    })

    const initialAllOverview = makeStatsOverview(null, 'All Subjects')
    initialAllOverview.summaryStats = [{ label: 'Papers logged', value: 10 }]

    const { rerender } = render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={initialAllOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All Subjects')}
      />
    )

    expect(screen.getByText('All Subjects · AS · Paper 1')).toBeTruthy()

    // User intentionally clicks Mathematics tab -> cold fetch starts
    fireEvent.click(screen.getByRole('link', { name: /mathematics/i }))
    expect(screen.getByRole('link', { name: /mathematics/i }).getAttribute('aria-current')).toBe('page')

    // While Mathematics is in flight, server delivers refreshed props for original All view
    const refreshedAllOverview = makeStatsOverview(null, 'All Subjects')
    refreshedAllOverview.summaryStats = [{ label: 'Papers logged', value: 999 }]

    rerender(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={refreshedAllOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All Subjects')}
      />
    )

    // Mathematics tab must remain selected!
    expect(screen.getByRole('link', { name: /mathematics/i }).getAttribute('aria-current')).toBe('page')

    // Mathematics requests resolve
    const mathOverview = makeStatsOverview(mathId, 'Mathematics')
    mathOverview.summaryStats = [{ label: 'Papers logged', value: 50 }]
    resolveMathOverview(mathOverview)
    resolveMathChapter(makeStatsChapter(mathId, 'Mathematics'))
    resolveMathIndicators(makeStatsIndicators(mathId, 'Mathematics'))

    // Crucial check: Mathematics was NOT canceled by incoming All props!
    await waitFor(() => {
      expect(screen.getByText('Mathematics · AS · Paper 1')).toBeTruthy()
      expect(screen.getByText('Mathematics Topic A')).toBeTruthy()
      expect(screen.getByText('50')).toBeTruthy()
      expect(screen.queryByText('999')).toBeNull()
    })
  })

  it('aborts previous in-flight HTTP requests via AbortSignal when switching to another subject', async () => {
    let mathSignal: AbortSignal | undefined
    mockGetStatsOverviewData.mockImplementation(async (sId: string | null, signal?: AbortSignal) => {
      if (sId === mathId) {
        mathSignal = signal
        return new Promise(() => {}) // Stalls
      }
      return makeStatsOverview(sId, 'Physics')
    })

    render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={makeStatsOverview(null, 'All')}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All')}
      />
    )

    // Switch to Mathematics
    fireEvent.click(screen.getByRole('link', { name: /mathematics/i }))
    expect(mathSignal).toBeDefined()
    expect(mathSignal?.aborted).toBe(false)

    // Switch to Physics: Mathematics request must be aborted
    fireEvent.click(screen.getByRole('link', { name: /physics/i }))
    expect(mathSignal?.aborted).toBe(true)
  })
})

describe('LogsWorkspace Subject Switching, Caching, and Pagination', () => {
  it('performs cold fetch without running form catalogue, warm cache on repeated switch, and caches pagination', async () => {
    const allLogs = makeLogsData(null, 1, 50)
    const mathLogsPage1 = makeLogsData(mathId, 1, 50)
    const mathLogsPage2 = makeLogsData(mathId, 2, 10)

    mockGetLogsSubjectData.mockImplementation(async (sId: string | null, page: number) => {
      if (sId === mathId && page === 1) return mathLogsPage1
      if (sId === mathId && page === 2) return mathLogsPage2
      return allLogs
    })

    const sampleCatalogue: PracticeFormSubjectOption[] = [
      { id: mathId, name: 'Mathematics', code: '9709', context: mockRouteContext },
    ]

    render(
      <LogsWorkspace
        userId="user-1"
        sessions={allLogs.sessions}
        totalSessions={allLogs.totalSessions}
        currentPage={1}
        pageSize={50}
        subjects={sampleCatalogue}
        cataloguePromise={Promise.resolve(sampleCatalogue)}
        userSubjects={mockSubjects}
        preferredSubjectId={null}
        timeZone="UTC"
        initialPapers={allLogs.papers}
        initialUntaggedPapers={allLogs.untaggedPapers}
      />
    )

    // 1. Initial view is All
    expect(screen.getByRole('link', { name: /all/i }).getAttribute('aria-current')).toBe('page')

    // Switch to Question practice tab
    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    expect(screen.getByText('All Drill P1 #1')).toBeTruthy()

    // 2. Cold switch: click Mathematics
    const mathTab = screen.getByRole('link', { name: /mathematics/i })
    fireEvent.click(mathTab)

    expect(mathTab.getAttribute('aria-current')).toBe('page')
    expect(mockGetLogsSubjectData).toHaveBeenCalledTimes(1)
    expect(mockGetLogsSubjectData).toHaveBeenCalledWith(mathId, 1, 50)

    await waitFor(() => {
      expect(screen.getByText('Math Drill P1 #1')).toBeTruthy()
    })

    // 3. Repeated switch (Warm hit): switch to All then back to Math
    const allTab = screen.getByRole('link', { name: /all/i })
    fireEvent.click(allTab)
    expect(mockGetLogsSubjectData).toHaveBeenCalledTimes(1) // Warm All
    expect(screen.getByText('All Drill P1 #1')).toBeTruthy()

    fireEvent.click(mathTab)
    expect(mockGetLogsSubjectData).toHaveBeenCalledTimes(1) // Warm Math
    expect(screen.getByText('Math Drill P1 #1')).toBeTruthy()

    // 4. Pagination caching: click Next page
    const nextBtn = screen.getByRole('link', { name: /next/i })
    fireEvent.click(nextBtn)

    expect(mockGetLogsSubjectData).toHaveBeenCalledTimes(2)
    expect(mockGetLogsSubjectData).toHaveBeenCalledWith(mathId, 2, 50)

    await waitFor(() => {
      expect(screen.getByText('Math Drill P2 #1')).toBeTruthy()
    })

    // Click Previous page back to Page 1: warm hit!
    const prevBtn = screen.getByRole('link', { name: /previous/i })
    fireEvent.click(prevBtn)

    expect(mockGetLogsSubjectData).toHaveBeenCalledTimes(2) // Still 2!
    expect(screen.getByText('Math Drill P1 #1')).toBeTruthy()
  })

  it('supersedes pending cold page 2 request when user switches back to cached page 1', async () => {
    let resolvePage2!: (val: LogsSubjectData) => void
    const page2Promise = new Promise<LogsSubjectData>((res) => {
      resolvePage2 = res
    })

    const page1Data = makeLogsData(mathId, 1, 50)
    mockGetLogsSubjectData.mockImplementation(async (sId: string | null, page: number) => {
      if (page === 2) return page2Promise
      return page1Data
    })

    render(
      <LogsWorkspace
        userId="user-1"
        sessions={page1Data.sessions}
        totalSessions={page1Data.totalSessions}
        currentPage={1}
        pageSize={50}
        subjects={[]}
        cataloguePromise={Promise.resolve([])}
        userSubjects={mockSubjects}
        preferredSubjectId={mathId}
        timeZone="UTC"
        initialPapers={page1Data.papers}
        initialUntaggedPapers={page1Data.untaggedPapers}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    expect(screen.getByText('Math Drill P1 #1')).toBeTruthy()

    // Click Next page: cold fetch for page 2 starts
    const nextBtn = screen.getByRole('link', { name: /next/i })
    fireEvent.click(nextBtn)
    expect(screen.getByText('Loading practice history…')).toBeTruthy()

    // While page 2 is in-flight, user navigates back to cached page 1 via browser Back
    window.history.pushState(null, '', `/logs?subject=${mathId}&page=1`)
    window.dispatchEvent(new Event('popstate'))

    // Page 1 is displayed immediately from warm cache
    await waitFor(() => {
      expect(screen.getByText('Math Drill P1 #1')).toBeTruthy()
    })

    // Now late page 2 response resolves
    resolvePage2(makeLogsData(mathId, 2, 10))

    // Crucial check: Page 1 remains displayed, late page 2 is discarded!
    expect(screen.getByText('Math Drill P1 #1')).toBeTruthy()
    expect(screen.queryByText('Math Drill P2 #1')).toBeNull()
  })

  it('keeps form catalogue loaded and ready across subject switches without resetting to loading', async () => {
    const sampleCatalogue: PracticeFormSubjectOption[] = [
      { id: mathId, name: 'Mathematics', code: '9709', context: mockRouteContext },
    ]

    mockGetLogsSubjectData.mockResolvedValue(makeLogsData(mathId, 1, 5))

    render(
      <LogsWorkspace
        userId="user-1"
        sessions={[]}
        totalSessions={0}
        currentPage={1}
        pageSize={50}
        subjects={sampleCatalogue}
        cataloguePromise={Promise.resolve(sampleCatalogue)}
        userSubjects={mockSubjects}
        preferredSubjectId={null}
        timeZone="UTC"
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))

    // Log questions button is immediately ready
    const logBtn = await screen.findByRole('button', { name: '+ Log Questions' })
    expect(logBtn).toHaveProperty('disabled', false)

    // Switch to Mathematics
    fireEvent.click(screen.getByRole('link', { name: /mathematics/i }))

    // Button MUST stay enabled and not reset to aria-busy or disabled
    expect(logBtn).toHaveProperty('disabled', false)
    expect(logBtn.getAttribute('aria-busy')).toBeNull()
  })

  it('preserves in-flight page or subject request when user clicks already-selected tab', async () => {
    let resolveMathLogs!: (val: LogsSubjectData) => void
    const mathPromise = new Promise<LogsSubjectData>((res) => {
      resolveMathLogs = res
    })

    const allLogs = makeLogsData(null, 1, 50)
    mockGetLogsSubjectData.mockImplementation(async (sId: string | null) => {
      if (sId === mathId) return mathPromise
      return allLogs
    })

    render(
      <LogsWorkspace
        userId="user-1"
        sessions={allLogs.sessions}
        totalSessions={allLogs.totalSessions}
        currentPage={1}
        pageSize={50}
        subjects={[]}
        cataloguePromise={Promise.resolve([])}
        userSubjects={mockSubjects}
        preferredSubjectId={null}
        timeZone="UTC"
        initialPapers={allLogs.papers}
        initialUntaggedPapers={allLogs.untaggedPapers}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    expect(screen.getByText('All Drill P1 #1')).toBeTruthy()

    // Cold fetch for Mathematics starts
    const mathTab = screen.getByRole('link', { name: /mathematics/i })
    fireEvent.click(mathTab)
    expect(screen.getByText('Loading practice history…')).toBeTruthy()

    // While switching, user re-clicks the active Mathematics tab
    fireEvent.click(mathTab)

    // Now Mathematics resolves
    resolveMathLogs(makeLogsData(mathId, 1, 10))

    // In-flight Mathematics request must NOT have been canceled!
    await waitFor(() => {
      expect(screen.getByText('Math Drill P1 #1')).toBeTruthy()
      expect(screen.queryByText('Loading practice history…')).toBeNull()
    })
  })

  it('reconciles refreshed initialSessions props and account change in LogsWorkspace', async () => {
    const page1Data = makeLogsData(mathId, 1, 1)

    const { rerender } = render(
      <LogsWorkspace
        userId="user-1"
        sessions={page1Data.sessions}
        totalSessions={page1Data.totalSessions}
        currentPage={1}
        pageSize={50}
        subjects={[]}
        cataloguePromise={Promise.resolve([])}
        userSubjects={mockSubjects}
        preferredSubjectId={mathId}
        timeZone="UTC"
        initialPapers={page1Data.papers}
        initialUntaggedPapers={page1Data.untaggedPapers}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    expect(screen.getByText('Math Drill P1 #1')).toBeTruthy()

    // Rerender with updated initialSessions: 2 sessions
    const updatedData = makeLogsData(mathId, 1, 2)
    rerender(
      <LogsWorkspace
        userId="user-1"
        sessions={updatedData.sessions}
        totalSessions={updatedData.totalSessions}
        currentPage={1}
        pageSize={50}
        subjects={[]}
        cataloguePromise={Promise.resolve([])}
        userSubjects={mockSubjects}
        preferredSubjectId={mathId}
        timeZone="UTC"
        initialPapers={updatedData.papers}
        initialUntaggedPapers={updatedData.untaggedPapers}
      />
    )

    expect(screen.getByText('Math Drill P1 #2')).toBeTruthy()

    // User change to user-2
    const user2Data = makeLogsData(physicsId, 1, 1)
    user2Data.sessions[0].title = 'User 2 Physics Drill'

    rerender(
      <LogsWorkspace
        userId="user-2"
        sessions={user2Data.sessions}
        totalSessions={user2Data.totalSessions}
        currentPage={1}
        pageSize={50}
        subjects={[]}
        cataloguePromise={Promise.resolve([])}
        userSubjects={mockSubjects}
        preferredSubjectId={physicsId}
        timeZone="UTC"
        initialPapers={user2Data.papers}
        initialUntaggedPapers={user2Data.untaggedPapers}
      />
    )

    expect(screen.getByText('User 2 Physics Drill')).toBeTruthy()
    expect(screen.queryByText('Math Drill P1 #1')).toBeNull()
  })
})

describe('Cache Invalidation and User Isolation', () => {
  it('clears subject and aggregate entries on invalidateSessionCache', () => {
    setSessionUserId('user-1')
    setCachedStatsSubjectData(mathId, makeStatsData(mathId, 'Math'))
    setCachedStatsSubjectData('all', makeStatsData(null, 'All'))
    setCachedLogsSubjectData(mathId, 1, makeLogsData(mathId, 1, 5))
    setCachedLogsSubjectData('all', 1, makeLogsData(null, 1, 5))

    expect(getCachedStatsOverview(mathId)).not.toBeNull()
    expect(getCachedStatsSubjectData(mathId)).not.toBeNull()
    expect(getCachedStatsSubjectData('all')).not.toBeNull()
    expect(getCachedLogsSubjectData(mathId, 1)).not.toBeNull()

    // Invalidate math
    invalidateSessionCache(mathId)

    // Math and All are invalidated
    expect(getCachedStatsOverview(mathId)).toBeNull()
    expect(getCachedStatsSubjectData(mathId)).toBeNull()
    expect(getCachedStatsSubjectData('all')).toBeNull()
    expect(getCachedLogsSubjectData(mathId, 1)).toBeNull()
    expect(getCachedLogsSubjectData('all', 1)).toBeNull()
  })

  it('strictly isolates cache by userId and wipes entries on account change including null transition', () => {
    // 1. Student alpha signs in
    setSessionUserId('student-alpha')
    setCachedStatsSubjectData(mathId, makeStatsData(mathId, 'Alpha Math'))
    setCachedFormCatalogue([{ id: mathId, name: 'Mathematics', code: '9709', context: mockRouteContext }])

    expect(getCachedStatsSubjectData(mathId)).not.toBeNull()
    expect(getCachedFormCatalogue()).not.toBeNull()

    // 2. Student alpha signs out (transition to null)
    setSessionUserId(null)

    // All cached entries MUST be wiped immediately
    expect(getCachedStatsSubjectData(mathId)).toBeNull()
    expect(getCachedFormCatalogue()).toBeNull()

    // Unauthenticated writes must be no-ops
    setCachedStatsSubjectData(mathId, makeStatsData(mathId, 'Unauthenticated'))
    expect(getCachedStatsSubjectData(mathId)).toBeNull()

    // 3. Student beta signs in
    setSessionUserId('student-beta')

    // Beta cannot see alpha data
    expect(getCachedStatsSubjectData(mathId)).toBeNull()
    expect(getCachedFormCatalogue()).toBeNull()
  })

  it('refreshes mounted Stats All view when a contributing subject is invalidated', async () => {
    const allOverview = makeStatsOverview(null, 'All Initial')
    mockGetStatsOverviewData.mockResolvedValue(makeStatsOverview(null, 'All Refreshed'))

    render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={allOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All Initial')}
      />
    )

    expect(screen.getByText('All Initial · AS · Paper 1')).toBeTruthy()

    // Mutate Mathematics
    invalidateSessionCache(mathId)

    // Aggregate All view must re-fetch and display refreshed data
    await waitFor(() => {
      expect(mockGetStatsOverviewData).toHaveBeenCalledWith(null, expect.anything())
      expect(screen.getByText('All Refreshed · AS · Paper 1')).toBeTruthy()
    })
  })

  it('refreshes mounted Logs All view when a contributing subject is invalidated', async () => {
    const allLogs = makeLogsData(null, 1, 1)
    allLogs.sessions[0].title = 'All Drill Pre-Mutation'

    const refreshedLogs = makeLogsData(null, 1, 1)
    refreshedLogs.sessions[0].title = 'All Drill Post-Mutation'
    mockGetLogsSubjectData.mockResolvedValue(refreshedLogs)

    render(
      <LogsWorkspace
        userId="user-1"
        sessions={allLogs.sessions}
        totalSessions={allLogs.totalSessions}
        currentPage={1}
        pageSize={50}
        subjects={[]}
        cataloguePromise={Promise.resolve([])}
        userSubjects={mockSubjects}
        preferredSubjectId={null}
        timeZone="UTC"
        initialPapers={allLogs.papers}
        initialUntaggedPapers={allLogs.untaggedPapers}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Question practice' }))
    expect(screen.getByText('All Drill Pre-Mutation')).toBeTruthy()

    // Mutate Mathematics
    invalidateSessionCache(mathId)

    // Aggregate Logs view must re-fetch and display refreshed data
    await waitFor(() => {
      expect(mockGetLogsSubjectData).toHaveBeenCalledWith(null, 1, 50)
      expect(screen.getByText('All Drill Post-Mutation')).toBeTruthy()
    })
  })

  it('preserves in-flight requests for unrelated subjects when another subject is invalidated', async () => {
    let resolvePhysicsOverview!: (val: StatsOverviewData) => void
    const physicsOverviewPromise = new Promise<StatsOverviewData>((res) => {
      resolvePhysicsOverview = res
    })

    mockGetStatsOverviewData.mockImplementation(async (sId: string | null) => {
      if (sId === physicsId) return physicsOverviewPromise
      return makeStatsOverview(sId, 'Overview')
    })

    render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={makeStatsOverview(null, 'All')}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All')}
      />
    )

    // User switches to Physics (cold fetch starts)
    fireEvent.click(screen.getByRole('link', { name: /physics/i }))

    // While Physics is in-flight, an unrelated mutation occurs on Mathematics
    invalidateSessionCache(mathId)

    // Physics completes
    resolvePhysicsOverview(makeStatsOverview(physicsId, 'Physics Complete'))

    // Crucial check: Physics was NOT discarded by the Math mutation and displays correctly!
    await waitFor(() => {
      expect(screen.getByText('Physics Complete · AS · Paper 1')).toBeTruthy()
    })
  })

  it('discards pre-mutation responses when the requested subject is invalidated before resolution', async () => {
    let resolveMathOverview!: (val: StatsOverviewData) => void
    const mathOverviewPromise = new Promise<StatsOverviewData>((res) => {
      resolveMathOverview = res
    })

    mockGetStatsOverviewData.mockImplementation(async (sId: string | null) => {
      if (sId === mathId) return mathOverviewPromise
      return makeStatsOverview(sId, 'Overview')
    })

    render(
      <StatsWorkspace
        userId="user-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={makeStatsOverview(null, 'All')}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All')}
      />
    )

    // Cold switch to Mathematics starts
    fireEvent.click(screen.getByRole('link', { name: /mathematics/i }))

    // Pre-mutation cache is empty
    expect(getCachedStatsOverview(mathId)).toBeNull()

    // While Mathematics is in flight, a mutation occurs on Mathematics!
    invalidateSessionCache(mathId)

    // Late pre-mutation Mathematics response arrives
    resolveMathOverview(makeStatsOverview(mathId, 'Pre-Mutation Math'))

    // The pre-mutation response must NOT repopulate the cache!
    expect(getCachedStatsOverview(mathId)).toBeNull()
  })
})

describe('Fresh Stats Mount Cache Ownership & Isolation Regressions', () => {
  it('Regression 1: clear all session state, mount Stats directly, and verify ownership plus initial overview caching', async () => {
    clearSessionCache()
    setSessionUserId(null)
    expect(getSessionUserId()).toBeNull()

    const initialOverview = makeStatsOverview(null, 'Fresh All')
    const initialIndicators = makeStatsIndicators(null, 'Fresh All')

    render(
      <StatsWorkspace
        userId="user-fresh-1"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={initialOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={initialIndicators}
      />
    )

    // Ownership must be established on mount without pre-registering the user
    expect(getSessionUserId()).toBe('user-fresh-1')

    // Initial overview and indicators must be cached under the new owner
    const cachedOverview = getCachedStatsOverview(null)
    expect(cachedOverview).not.toBeNull()
    expect(cachedOverview?.summaryStats).toEqual(initialOverview.summaryStats)

    const cachedIndicators = getCachedStatsStudyIndicators(null)
    expect(cachedIndicators).not.toBeNull()
    expect(cachedIndicators).toHaveLength(initialIndicators.length)
  })

  it('Regression 2: Mathematics -> All -> Mathematics: repeated views use fresh cached results without another overview request', async () => {
    clearSessionCache()
    setSessionUserId(null)

    const initialOverview = makeStatsOverview(null, 'All Subjects')
    const initialIndicators = makeStatsIndicators(null, 'All Subjects')

    render(
      <StatsWorkspace
        userId="user-fresh-2"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={initialOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={initialIndicators}
      />
    )

    // Initial overview provided via props, no fetch yet
    expect(mockGetStatsOverviewData).not.toHaveBeenCalled()

    // 1. Switch to Mathematics (cold)
    fireEvent.click(screen.getByRole('link', { name: /mathematics/i }))

    await waitFor(() => {
      expect(mockGetStatsOverviewData).toHaveBeenCalledWith(mathId, expect.anything())
      expect(screen.getByText('Mathematics · AS · Paper 1')).toBeTruthy()
    })

    const mathCallsAfterFirstSwitch = mockGetStatsOverviewData.mock.calls.filter(
      (c) => c[0] === mathId
    ).length
    expect(mathCallsAfterFirstSwitch).toBe(1)

    // 2. Switch back to All (warm hit from mount seeding)
    fireEvent.click(screen.getByRole('link', { name: /all/i }))

    await waitFor(() => {
      expect(screen.getByText('All Subjects · AS · Paper 1')).toBeTruthy()
    })
    // All overview must not have triggered an overview fetch
    const allCalls = mockGetStatsOverviewData.mock.calls.filter((c) => c[0] === null).length
    expect(allCalls).toBe(0)

    // 3. Switch back to Mathematics (warm hit from previous switch caching)
    fireEvent.click(screen.getByRole('link', { name: /mathematics/i }))

    await waitFor(() => {
      expect(screen.getByText('Mathematics · AS · Paper 1')).toBeTruthy()
    })

    // Repeated view must use cached results without another overview request
    const mathCallsAfterSecondSwitch = mockGetStatsOverviewData.mock.calls.filter(
      (c) => c[0] === mathId
    ).length
    expect(mathCallsAfterSecondSwitch).toBe(1)
  })

  it('Regression 3: seed account A cache, unmount, then mount Stats for account B: no A entries are reused or displayed', async () => {
    clearSessionCache()

    // 1. Account A logs in and seeds their cache
    setSessionUserId('user-account-A')
    const accountAMathOverview = makeStatsOverview(mathId, 'Account A Math Trend')
    accountAMathOverview.summaryStats = [{ label: 'Papers logged', value: 9999 }]
    setCachedStatsOverview(mathId, accountAMathOverview, 'user-account-A')
    expect(getCachedStatsOverview(mathId)).not.toBeNull()

    // 2. Mount StatsWorkspace for Account B
    const accountBOverview = makeStatsOverview(null, 'Account B All')
    accountBOverview.summaryStats = [{ label: 'Papers logged', value: 42 }]

    const { unmount } = render(
      <StatsWorkspace
        userId="user-account-B"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={accountBOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'Account B All')}
      />
    )

    // Account B must own the session now
    expect(getSessionUserId()).toBe('user-account-B')

    // Account A's cache entries must have been wiped on ownership transition
    expect(getCachedStatsOverview(mathId)).toBeNull()

    // Switch to Mathematics for Account B: must perform a fresh fetch for Account B, never reusing Account A's data
    mockGetStatsOverviewData.mockResolvedValueOnce(makeStatsOverview(mathId, 'Account B Math Trend'))

    fireEvent.click(screen.getByRole('link', { name: /mathematics/i }))

    await waitFor(() => {
      expect(mockGetStatsOverviewData).toHaveBeenCalledWith(mathId, expect.anything())
      expect(screen.getByText('Account B Math Trend · AS · Paper 1')).toBeTruthy()
      expect(screen.queryByText('Account A Math Trend · AS · Paper 1')).toBeNull()
      expect(screen.queryByText('9999')).toBeNull()
    })

    unmount()
  })

  it('Regression 4: pending-overview-refresh and intentional-selection preservation without pre-registering user', async () => {
    clearSessionCache()
    setSessionUserId(null)

    // Part A: Pending overview refresh does not leave sections loading
    let resolveChapter!: (val: ChapterAccuracy[]) => void
    let resolveIndicators!: (val: IndicatorItem[]) => void

    const chapterPromise = new Promise<ChapterAccuracy[]>((res) => {
      resolveChapter = res
    })
    const indicatorsPromise = new Promise<IndicatorItem[]>((res) => {
      resolveIndicators = res
    })

    mockGetStatsChapterAccuracy.mockReturnValue(chapterPromise)
    mockGetStatsStudyIndicators.mockReturnValue(indicatorsPromise)

    const initialMathOverview = makeStatsOverview(mathId, 'Mathematics')
    initialMathOverview.summaryStats = [{ label: 'Papers logged', value: 5 }]

    const { rerender, unmount } = render(
      <StatsWorkspace
        userId="user-fresh-4"
        subjects={mockSubjects}
        initialSubjectId={mathId}
        initialOverview={initialMathOverview}
        initialChapterAccuracy={null}
        initialStudyIndicators={null}
      />
    )

    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading chapter accuracy' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading study indicators' })).toBeTruthy()

    // Refreshed overview arrives while chapter and indicators are still loading
    const refreshedMathOverview = makeStatsOverview(mathId, 'Mathematics')
    refreshedMathOverview.summaryStats = [{ label: 'Papers logged', value: 105 }]

    rerender(
      <StatsWorkspace
        userId="user-fresh-4"
        subjects={mockSubjects}
        initialSubjectId={mathId}
        initialOverview={refreshedMathOverview}
        initialChapterAccuracy={null}
        initialStudyIndicators={null}
      />
    )

    expect(screen.getByText('105')).toBeTruthy()

    // Resolve deferred lower sections
    resolveChapter(makeStatsChapter(mathId, 'Mathematics'))
    resolveIndicators(makeStatsIndicators(mathId, 'Mathematics'))

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Loading chapter accuracy' })).toBeNull()
      expect(screen.queryByRole('status', { name: 'Loading study indicators' })).toBeNull()
      expect(screen.getByText('Mathematics Topic A')).toBeTruthy()
    })

    unmount()

    // Part B: Intentional-selection preservation
    let resolveIntentionalMathOverview!: (val: StatsOverviewData) => void
    const intentionalMathPromise = new Promise<StatsOverviewData>((res) => {
      resolveIntentionalMathOverview = res
    })
    mockGetStatsOverviewData.mockImplementation(async (sId: string | null) => {
      if (sId === mathId) return intentionalMathPromise
      return makeStatsOverview(sId, 'Overview')
    })

    const initialAllOverview = makeStatsOverview(null, 'All Subjects')
    initialAllOverview.summaryStats = [{ label: 'Papers logged', value: 20 }]

    const { rerender: rerenderIntentional } = render(
      <StatsWorkspace
        userId="user-fresh-4-b"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={initialAllOverview}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All Subjects')}
      />
    )

    // User intentionally selects Mathematics
    fireEvent.click(screen.getByRole('link', { name: /mathematics/i }))
    expect(screen.getByRole('link', { name: /mathematics/i }).getAttribute('aria-current')).toBe('page')

    // Refreshed original All props arrive while Mathematics is pending
    const refreshedAll = makeStatsOverview(null, 'All Subjects')
    refreshedAll.summaryStats = [{ label: 'Papers logged', value: 888 }]

    rerenderIntentional(
      <StatsWorkspace
        userId="user-fresh-4-b"
        subjects={mockSubjects}
        initialSubjectId={null}
        initialOverview={refreshedAll}
        initialChapterAccuracy={[]}
        initialStudyIndicators={makeStatsIndicators(null, 'All Subjects')}
      />
    )

    // Mathematics must still be selected
    expect(screen.getByRole('link', { name: /mathematics/i }).getAttribute('aria-current')).toBe('page')

    // Resolve Mathematics
    const finalMathOverview = makeStatsOverview(mathId, 'Mathematics')
    finalMathOverview.summaryStats = [{ label: 'Papers logged', value: 55 }]
    resolveIntentionalMathOverview(finalMathOverview)

    await waitFor(() => {
      expect(screen.getByText('Mathematics · AS · Paper 1')).toBeTruthy()
      expect(screen.getByText('55')).toBeTruthy()
      expect(screen.queryByText('888')).toBeNull()
    })
  })
})
