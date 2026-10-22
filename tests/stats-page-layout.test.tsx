import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import StatsPage from '@/app/(app)/stats/page'
import { StatsWorkspace } from '@/components/papers/stats-workspace'
import { ChapterAccuracyChart } from '@/components/papers/chapter-accuracy-chart'
import { StudyIndicatorsSkeleton, getExpectedStudyIndicatorCount } from '@/components/papers/study-indicators'
import type { RawEnrollment } from '@/components/papers/async-study-indicators'
import type { ChapterAccuracy, PaperWithSubject } from '@/types'
import type { PracticeRouteContext } from '@/types/practice-sessions'
import { clearSessionCache } from '@/lib/session-cache'

const subjectId = '00000000-0000-4000-a000-000000000001'
const chapterId1 = '00000000-0000-4000-a000-000000000011'
const chapterId2 = '00000000-0000-4000-a000-000000000012'

const mockRouteContext: PracticeRouteContext = {
  enrollment: {
    id: 'enrollment-1',
    subjectId,
    subjectCode: '9709',
    studyRoute: 'staged',
    currentStage: 'as',
    isArchived: false,
  },
  selections: [{ subjectPaperId: 'paper-pure-1', componentName: 'Pure 1', stage: 'as' }],
  chapters: [
    {
      id: chapterId1,
      subjectId,
      number: 1,
      title: 'Algebra',
      stage: 'as',
      component: 'Pure 1',
      isActive: true,
      paperIds: ['paper-pure-1'],
    },
    {
      id: chapterId2,
      subjectId,
      number: 2,
      title: 'Calculus',
      stage: 'as',
      component: 'Pure 1',
      isActive: true,
      paperIds: ['paper-pure-1'],
    },
  ],
  papers: [{ id: 'paper-pure-1', subjectId, paperNumber: 1, name: 'Pure 1', stageBehavior: 'route_dependent', defaultStage: 'as' }],
}

const mockEnrollments: RawEnrollment[] = [
  {
    id: 'enrollment-1',
    subject_id: subjectId,
    current_stage: 'as',
    study_route: 'staged',
    is_archived: false,
    subjects: {
      id: subjectId,
      name: 'Mathematics',
      code: '9709',
      color_hex: '#3b82f6',
    },
  },
]

const {
  mockGetAllPapers,
  mockGetPapersForSubject,
  mockGetPracticeOverview,
  mockGetCombinedEvidence,
  mockGetPracticeRouteContext,
  mockGetStatsSubjectData,
  mockGetStatsOverviewData,
  mockGetStatsChapterAccuracy,
  mockGetStatsStudyIndicators,
  mockRpc,
} = vi.hoisted(() => ({
  mockGetAllPapers: vi.fn(),
  mockGetPapersForSubject: vi.fn(),
  mockGetPracticeOverview: vi.fn(),
  mockGetCombinedEvidence: vi.fn(),
  mockGetPracticeRouteContext: vi.fn(),
  mockGetStatsSubjectData: vi.fn(),
  mockGetStatsOverviewData: vi.fn(),
  mockGetStatsChapterAccuracy: vi.fn(),
  mockGetStatsStudyIndicators: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/supabase/authenticated', () => ({
  getAuthenticatedContext: async () => ({
    user: { id: 'user-1' },
    supabase: {
      from: (table: string) => {
        if (table === 'user_subjects') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [
                    {
                      id: 'enrollment-1',
                      subject_id: subjectId,
                      current_stage: 'as',
                      study_route: 'staged',
                      is_archived: false,
                      subjects: {
                        id: subjectId,
                        name: 'Mathematics',
                        code: '9709',
                        color_hex: '#3b82f6',
                      },
                    },
                  ],
                }),
              }),
            }),
          }
        }
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: [] }),
            }),
          }),
        }
      },
      rpc: mockRpc,
    },
  }),
}))

vi.mock('@/lib/actions/papers', () => ({
  getAllPapersWithSubjects: mockGetAllPapers,
  getPapersForSubject: mockGetPapersForSubject,
}))

vi.mock('@/lib/actions/practice-sessions', () => ({
  getPracticeOverview: mockGetPracticeOverview,
  getCombinedChapterEvidenceForSubject: mockGetCombinedEvidence,
  getPracticeRouteContext: mockGetPracticeRouteContext,
  getStatsSubjectData: mockGetStatsSubjectData,
  getStatsOverviewData: mockGetStatsOverviewData,
  getStatsChapterAccuracy: mockGetStatsChapterAccuracy,
  getStatsStudyIndicators: mockGetStatsStudyIndicators,
}))

vi.mock('@/lib/stats-client', () => ({
  fetchStatsOverview: mockGetStatsOverviewData,
  fetchStatsChapterAccuracy: mockGetStatsChapterAccuracy,
  fetchStatsStudyIndicators: mockGetStatsStudyIndicators,
  fetchStatsSubjectData: mockGetStatsSubjectData,
}))

// Mock dynamic chart wrapper for integration tests
vi.mock('@/components/papers/paper-charts', () => ({
  LazyChapterAccuracyChart: ({ data }: { data: ChapterAccuracy[] }) => (
    <div data-testid="chapter-accuracy-chart" data-count={data.length}>
      {data.map(d => (
        <div key={d.chapter_id} data-testid={`chart-row-${d.chapter_id}`}>
          <span>{d.title}</span>
          <span>{d.accuracy_pct}%</span>
          <span>{d.total_obtained}/{d.total_available}</span>
        </div>
      ))}
    </div>
  ),
}))

// Mock async streamed sections during page integration tests to verify synchronous shell render
// without React 19 async Client Component warnings.
vi.mock('@/components/papers/async-chapter-accuracy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/papers/async-chapter-accuracy')>()
  return {
    ...actual,
    AsyncChapterAccuracySection: ({ activeSubjectId }: { activeSubjectId: string | null }) => {
      if (!activeSubjectId) {
        return (
          <section aria-labelledby="chapter-accuracy-title" className="card">
            <h2 id="chapter-accuracy-title">Chapter &amp; Topic Accuracy</h2>
            <p>Select a subject from the filter tabs above to inspect chapter and subtopic accuracy</p>
            <div>Chapter accuracy is specific to each syllabus. Select a subject above to view chapter breakdown.</div>
          </section>
        )
      }
      return (
        <section aria-labelledby="chapter-accuracy-title" className="card">
          <h2 id="chapter-accuracy-title">Chapter &amp; Topic Accuracy</h2>
          <div data-testid="chapter-accuracy-chart" data-count="2">
            <div>Algebra</div>
            <div>Calculus</div>
          </div>
        </section>
      )
    },
  }
})

vi.mock('@/components/papers/async-study-indicators', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/papers/async-study-indicators')>()
  return {
    ...actual,
    AsyncStudyIndicators: ({ activeSubjectName }: { activeSubjectName?: string | null }) => (
      <section aria-labelledby="study-indicators-title" data-testid="resolved-study-indicators">
        <h2 id="study-indicators-title">Study Indicators {activeSubjectName ? `· ${activeSubjectName}` : ''}</h2>
        <div data-testid="indicator-card-as">AS Stage: 80.0% Predicted · 75.0% Readiness</div>
        <div data-testid="indicator-card-a2">A2 Stage: Locked</div>
      </section>
    ),
  }
})

beforeEach(() => {
  clearSessionCache()
  mockRpc.mockResolvedValue({ data: 75.0 })
  mockGetPracticeRouteContext.mockResolvedValue(mockRouteContext)
  mockGetStatsSubjectData.mockImplementation(async (sId: string | null) => ({
    subjectId: sId,
    trend: [
      {
        id: 'trend-fast',
        source: 'full_paper',
        subjectId: sId ?? subjectId,
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
    trendSubjects: [{ id: subjectId, name: 'Mathematics', code: '9709' }],
    chapterAccuracy: sId ? [
      {
        chapter_id: chapterId1,
        title: 'Algebra',
        component: 'Pure 1',
        total_obtained: 8,
        total_available: 10,
        accuracy_pct: 80,
        attempt_count: 1,
      },
    ] : [],
    studyIndicators: [
      {
        subjectId,
        subjectName: 'Mathematics',
        stage: 'as',
        isCurrentStage: true,
        isLockedA2: false,
        predicted: {
          predictedPercentage: 80,
          currentStage: 'as',
          components: [],
          evidenceCount: 1,
          isInsufficientEvidence: false,
        },
        readinessScore: 75,
        hasRecordedHistory: true,
      },
    ],
    summaryStats: [
      { label: 'Papers logged', value: 2 },
      { label: 'Full-paper average', value: '85.0%' },
      { label: 'Best full paper', value: '90.0%' },
    ],
    componentStats: [
      {
        label: 'Mathematics · AS · Paper 1',
        count: 2,
        markWeightedAccuracyPct: 85,
        averageRaw: 42.5,
        averageMax: 50,
        ranking: null,
      },
    ],
    activeSubjectName: sId ? 'Mathematics' : null,
    timestamp: Date.now(),
  }))
  mockGetStatsChapterAccuracy.mockImplementation(async (sId: string | null) => (
    sId ? [
      {
        chapter_id: chapterId1,
        title: 'Algebra',
        component: 'Pure 1',
        total_obtained: 8,
        total_available: 10,
        accuracy_pct: 80,
        attempt_count: 1,
      },
    ] : []
  ))
  mockGetStatsStudyIndicators.mockImplementation(async (sId: string | null) => ([
    {
      subjectId: sId ?? subjectId,
      subjectName: 'Mathematics',
      stage: 'as',
      isCurrentStage: true,
      isLockedA2: false,
      predicted: {
        predictedPercentage: 80,
        currentStage: 'as',
        components: [],
        evidenceCount: 1,
        isInsufficientEvidence: false,
      },
      readinessScore: 75,
      hasRecordedHistory: true,
    },
  ]))
  mockGetStatsOverviewData.mockImplementation(async (sId: string | null) => ({
    subjectId: sId,
    trend: [
      {
        id: 'trend-fast',
        source: 'full_paper',
        subjectId: sId ?? subjectId,
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
    trendSubjects: [{ id: subjectId, name: 'Mathematics', code: '9709' }],
    summaryStats: [
      { label: 'Papers logged', value: 2 },
      { label: 'Full-paper average', value: '85.0%' },
      { label: 'Best full paper', value: '90.0%' },
    ],
    componentStats: [
      {
        label: 'Mathematics · AS · Paper 1',
        count: 2,
        markWeightedAccuracyPct: 85,
        averageRaw: 42.5,
        averageMax: 50,
        ranking: null,
      },
    ],
    activeSubjectName: sId ? 'Mathematics' : null,
    timestamp: Date.now(),
  }))
  mockGetStatsChapterAccuracy.mockImplementation(async (sId: string | null) => (
    sId ? [
      {
        chapter_id: chapterId1,
        title: 'Algebra',
        component: 'Pure 1',
        total_obtained: 8,
        total_available: 10,
        accuracy_pct: 80,
        attempt_count: 1,
      },
    ] : []
  ))
  mockGetStatsStudyIndicators.mockImplementation(async (sId: string | null) => ([
    {
      subjectId: sId ?? subjectId,
      subjectName: 'Mathematics',
      stage: 'as',
      isCurrentStage: true,
      isLockedA2: false,
      predicted: {
        predictedPercentage: 80,
        currentStage: 'as',
        components: [],
        evidenceCount: 1,
        isInsufficientEvidence: false,
      },
      readinessScore: 75,
      hasRecordedHistory: true,
    },
  ]))
  if (typeof window !== 'undefined') {
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
  vi.clearAllMocks()
})

describe('ChapterAccuracyChart', () => {
  it('renders empty prompt when data is empty', () => {
    render(<ChapterAccuracyChart data={[]} />)
    expect(screen.getByText(/Attempt a past paper or log question practice to see chapter breakdown/)).toBeTruthy()
  })

  it('preserves all items without slicing and verifies exact ordering and evidence values', () => {
    // Generate 15 chapters with ascending accuracies
    const chapters: ChapterAccuracy[] = Array.from({ length: 15 }, (_, i) => ({
      chapter_id: `ch-${i}`,
      title: `Chapter ${String(i + 1).padStart(2, '0')}`,
      component: 'Pure 1',
      total_obtained: i * 2,
      total_available: 20,
      accuracy_pct: (i * 2 / 20) * 100,
      attempt_count: 1,
    }))

    const { container } = render(<ChapterAccuracyChart data={chapters} />)

    // 1. Verify scrollable container exists and has maxHeight for >10 items
    const scrollContainer = container.firstChild as HTMLElement
    expect(scrollContainer.style.overflowY).toBe('auto')
    expect(scrollContainer.style.maxHeight).toBe('480px')

    // 2. Verify all 15 evidence rows exist in the accessible breakdown list
    const evidenceList = screen.getByTestId('chapter-evidence-rows')
    expect(evidenceList).toBeTruthy()
    const rows = evidenceList.querySelectorAll('[data-testid^="evidence-row-"]')
    expect(rows).toHaveLength(15)

    // 3. Verify exact ascending sort order (lowest accuracy 0% to highest 140%)
    const renderedAccuracies = Array.from(rows).map(row => {
      const text = row.querySelector('span[style*="font-weight: 700"]')?.textContent
      return text?.trim()
    })
    expect(renderedAccuracies[0]).toBe('0.0%')
    expect(renderedAccuracies[14]).toBe('140.0%')
  })

  it('distinguishes missing evidence from 0% accuracy with distinct color, labels, and sort priority', () => {
    const chapters: ChapterAccuracy[] = [
      {
        chapter_id: 'ch-healthy',
        title: 'Differentiation',
        component: 'Pure 1',
        total_obtained: 8,
        total_available: 10,
        accuracy_pct: 80,
        attempt_count: 1,
      },
      {
        chapter_id: 'ch-zero',
        title: 'Trigonometry (Zero Accuracy)',
        component: 'Pure 1',
        total_obtained: 0,
        total_available: 10,
        accuracy_pct: 0,
        attempt_count: 2,
      },
      {
        chapter_id: 'ch-none',
        title: 'Vectors (No Attempts)',
        component: 'Pure 1',
        total_obtained: 0,
        total_available: 0,
        accuracy_pct: 0,
        attempt_count: 0,
      },
    ]

    render(<ChapterAccuracyChart data={chapters} />)

    // Verified rows
    const zeroRow = screen.getByTestId('evidence-row-ch-zero')
    const noneRow = screen.getByTestId('evidence-row-ch-none')
    const healthyRow = screen.getByTestId('evidence-row-ch-healthy')

    // 1. Genuine 0% result displays 0.0% and danger color
    expect(zeroRow.textContent).toContain('0.0%')
    expect(zeroRow.textContent).toContain('0/10 marks')
    const zeroPctSpan = zeroRow.querySelector('span[style*="font-weight: 700"]') as HTMLElement
    expect(zeroPctSpan.style.color).toBe('var(--danger)')

    // 2. Missing evidence displays 'No evidence yet' and muted text
    expect(noneRow.textContent).toContain('No evidence yet')
    expect(noneRow.textContent).toContain('No marks')
    const nonePctSpan = noneRow.querySelector('span[style*="font-weight: 700"]') as HTMLElement
    expect(nonePctSpan.style.color).toBe('var(--text-muted)')

    // 3. Healthy evidence displays 80.0% and 8/10 marks
    expect(healthyRow.textContent).toContain('80.0%')
    expect(healthyRow.textContent).toContain('8/10 marks')

    // 3. Sort ordering: genuine 0% has evidence, so it comes FIRST (weakest topic priority),
    // followed by healthy 80%, followed by unevidenced chapters at the end.
    const allRows = screen.getByTestId('chapter-evidence-rows').querySelectorAll('[data-testid^="evidence-row-"]')
    expect(allRows[0].getAttribute('data-testid')).toBe('evidence-row-ch-zero')
    expect(allRows[1].getAttribute('data-testid')).toBe('evidence-row-ch-healthy')
    expect(allRows[2].getAttribute('data-testid')).toBe('evidence-row-ch-none')
  })

  it('adapts responsive layout at mobile viewport width (<= 640px)', () => {
    // Simulate window.matchMedia matching mobile width (e.g. 320px or 375px)
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width: 640px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    const chapters: ChapterAccuracy[] = [
      {
        chapter_id: 'ch-mobile-1',
        title: 'Very Long Chapter Title That Exceeds Mobile Margin Space',
        component: 'Pure 1',
        total_obtained: 5,
        total_available: 10,
        accuracy_pct: 50,
        attempt_count: 1,
      },
    ]

    render(<ChapterAccuracyChart data={chapters} />)

    // Full chapter title is 100% discoverable in the accessible breakdown list
    expect(screen.getByText('Very Long Chapter Title That Exceeds Mobile Margin Space')).toBeTruthy()
  })
})

describe('AsyncStudyIndicators server component', () => {
  it('resolves study indicators for AS and A2 stages and computes readiness scores without client warnings', async () => {
    // Unmock the actual AsyncStudyIndicators implementation to test it directly as a Server Component
    const { AsyncStudyIndicators: RealAsyncStudyIndicators } = await vi.importActual<
      typeof import('@/components/papers/async-study-indicators')
    >('@/components/papers/async-study-indicators')

    const samplePapers: PaperWithSubject[] = [
      {
        id: 'paper-1',
        user_id: 'user-1',
        subject_id: subjectId,
        subject_paper_id: 'paper-pure-1',
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
        subjects: { name: 'Mathematics', color_hex: '#3b82f6', code: '9709' },
      },
    ]

    mockRpc.mockResolvedValue({ data: 72.5 })

    // Await the async server component directly as Next.js RSC runtime does
    const resolvedJsx = await RealAsyncStudyIndicators({
      userId: 'user-1',
      targetEnrollments: mockEnrollments,
      papers: samplePapers,
      practiceSessions: [],
      activeSubjectName: 'Mathematics',
    })

    // Render the resolved client JSX (StudyIndicators) in RTL
    render(resolvedJsx)

    // Verify resolved content
    expect(screen.getByRole('heading', { level: 2, name: /Study Indicators · Mathematics/ })).toBeTruthy()
    // AS stage indicator rendered
    expect(screen.getByText(/AS/)).toBeTruthy()
    // Readiness score of 72.5% displayed
    expect(screen.getByText('72.5%')).toBeTruthy()
    // A2 stage is locked since current_stage is 'as'
    expect(screen.getByText(/A2 readiness locked while studying AS/)).toBeTruthy()
  })
})

describe('AsyncChapterAccuracySection server component', () => {
  it('renders guidance placeholder in All-subjects view and maps only evidenced chapters in single-subject view', async () => {
    const { AsyncChapterAccuracySection: RealAsyncChapterSection } = await vi.importActual<
      typeof import('@/components/papers/async-chapter-accuracy')
    >('@/components/papers/async-chapter-accuracy')

    // 1. All-subjects view (activeSubjectId is null)
    const allSubjectsJsx = await RealAsyncChapterSection({ activeSubjectId: null })
    const { unmount } = render(allSubjectsJsx)
    expect(screen.getByText(/Chapter accuracy is specific to each syllabus/)).toBeTruthy()
    unmount()

    // 2. Single-subject view
    mockGetCombinedEvidence.mockResolvedValue([
      { chapterId: chapterId1, raw: 8, max: 10, attempts: 1, accuracyPct: 80, weakTopic: false, fullPaperAttempts: 1, practiceItems: 0 },
    ])

    const singleSubjectJsx = await RealAsyncChapterSection({ activeSubjectId: subjectId })
    render(singleSubjectJsx)

    expect(screen.getByTestId('chapter-accuracy-chart')).toBeTruthy()
    // Evidenced chapter is supplied to chart
    expect(screen.getByText('Algebra')).toBeTruthy()
    // Untouched syllabus chapters (Calculus) are NOT synthesized into the chart
    expect(screen.queryByText('Calculus')).toBeNull()
    expect(screen.getByTestId('chapter-accuracy-chart').getAttribute('data-count')).toBe('1')
    expect(mockGetPracticeRouteContext).toHaveBeenCalledWith(subjectId)
  })
})

describe('StatsPage layout ordering and streaming proof', () => {
  it('renders exact section order: Title/Tabs -> Score Trend -> Chapter Accuracy -> Study Indicators -> Summary Grid -> Component Performance', async () => {
    mockGetAllPapers.mockResolvedValue([
      {
        id: 'paper-1',
        subject_id: subjectId,
        stage: 'as',
        paper_number: 1,
        attempted_at: '2026-10-15',
        score_raw: 40,
        score_max: 50,
        accuracy_pct: 80,
        subjects: { name: 'Mathematics', color_hex: '#3b82f6', code: '9709' },
      },
      {
        id: 'paper-2',
        subject_id: subjectId,
        stage: 'as',
        paper_number: 1,
        attempted_at: '2026-10-16',
        score_raw: 45,
        score_max: 50,
        accuracy_pct: 90,
        subjects: { name: 'Mathematics', color_hex: '#3b82f6', code: '9709' },
      },
    ])
    mockGetPracticeOverview.mockResolvedValue({
      sessions: [],
      trend: [
        {
          id: 'trend-1',
          source: 'full_paper',
          subjectId,
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
    })

    const pageJsx = await StatsPage({})
    const { container } = render(pageJsx)

    // 1. Heading: Stats & Analytics
    expect(screen.getByRole('heading', { level: 1, name: 'Stats & Analytics' })).toBeTruthy()

    // 2. Filter tabs nav
    expect(screen.getByRole('navigation', { name: 'Filter stats by subject' })).toBeTruthy()

    // 3. Score trend heading
    expect(screen.getByRole('heading', { level: 2, name: 'Score trend' })).toBeTruthy()

    // 4. Chapter & Topic Accuracy heading
    expect(screen.getByRole('heading', { level: 2, name: 'Chapter & Topic Accuracy' })).toBeTruthy()

    // 5. Study indicators heading
    expect(screen.getByRole('heading', { level: 2, name: /^Study Indicators/ })).toBeTruthy()

    // 6. Summary stats grid
    expect(container.querySelector('.past-papers-stats-grid')).toBeTruthy()
    expect(screen.getByText('Papers logged')).toBeTruthy()

    // 7. Component Performance heading
    expect(screen.getByRole('heading', { level: 2, name: 'Component Performance' })).toBeTruthy()

    // Verify exact DOM ordering
    const scoreTrendHeading = screen.getByRole('heading', { level: 2, name: 'Score trend' })
    const chapterHeading = screen.getByRole('heading', { level: 2, name: 'Chapter & Topic Accuracy' })
    const studyIndicatorsHeading = screen.getByRole('heading', { level: 2, name: /^Study Indicators/ })
    const summaryGrid = container.querySelector('.past-papers-stats-grid')!
    const componentHeading = screen.getByRole('heading', { level: 2, name: 'Component Performance' })

    expect(scoreTrendHeading.compareDocumentPosition(chapterHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(chapterHeading.compareDocumentPosition(studyIndicatorsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(studyIndicatorsHeading.compareDocumentPosition(summaryGrid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(summaryGrid.compareDocumentPosition(componentHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('structurally verifies delegation and proves StatsPage does not await slow RPCs or chapter evidence', async () => {
    mockGetPapersForSubject.mockResolvedValue([
      {
        id: 'paper-fast',
        user_id: 'user-1',
        subject_id: subjectId,
        subject_paper_id: 'paper-pure-1',
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
        subjects: { name: 'Mathematics', color_hex: '#3b82f6', code: '9709' },
      },
    ])
    mockGetPracticeOverview.mockResolvedValue({
      sessions: [],
      trend: [
        {
          id: 'trend-fast',
          source: 'full_paper',
          subjectId,
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
    })

    // Execute StatsPage server component directly
    const pageJsx = await StatsPage({ searchParams: Promise.resolve({ subject: subjectId }) })

    // 1. Prove StatsPage never invokes readiness RPC or chapter question attempts queries
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockGetCombinedEvidence).not.toHaveBeenCalled()

    // 2. Structurally inspect delegation to StatsWorkspace client island
    expect(pageJsx?.type).toBe(StatsWorkspace)
    expect(pageJsx?.props.userId).toBe('user-1')
    expect(pageJsx?.props.initialSubjectId).toBe(subjectId)
    expect(pageJsx?.props.subjects).toHaveLength(1)
    expect(pageJsx?.props.initialData.subjectId).toBe(subjectId)
  })

  it('renders matching responsive card shells, control placeholders, and stat cells in loading states', () => {
    // 1. StudyIndicatorsSkeleton geometry and card count
    const { container: skelSingle } = render(<StudyIndicatorsSkeleton activeSubjectName="Mathematics" cardCount={1} />)
    const singleCards = skelSingle.querySelectorAll('.card')
    expect(singleCards).toHaveLength(1)
    expect(singleCards[0].getAttribute('role')).toBe('status')
    expect(singleCards[0].getAttribute('aria-label')).toBe('Loading study indicators')

    const { container: skelMulti } = render(<StudyIndicatorsSkeleton cardCount={3} />)
    const multiCards = skelMulti.querySelectorAll('.card')
    expect(multiCards).toHaveLength(3)

    // 2. StatsWorkspace skeleton elements & stat cell classes
    const { container: wsView } = render(
      <StatsWorkspace
        userId="user-1"
        subjects={[{ id: subjectId, name: 'Mathematics', color_hex: '#3b82f6', code: '9709' }]}
        initialSubjectId={subjectId}
        initialOverview={{
          subjectId,
          trend: [],
          trendSubjects: [],
          summaryStats: [
            { label: 'Papers logged', value: 0 },
            { label: 'Full-paper average', value: '—' },
            { label: 'Best full paper', value: '—' },
          ],
          componentStats: [],
          activeSubjectName: 'Mathematics',
          timestamp: Date.now(),
        }}
      />
    )

    // Summary grid items must use past-papers-stat-cell class without inline padding override
    const statCells = wsView.querySelectorAll('.past-papers-stats-grid .past-papers-stat-cell')
    expect(statCells).toHaveLength(3)
    statCells.forEach((cell) => {
      expect((cell as HTMLElement).style.padding).toBe('')
    })
  })

  it('supports cold-overview selection with deferred responses and verifies actual loading controls and structure', async () => {
    const mathSub = {
      id: 'sub-math',
      name: 'Mathematics',
      code: '9709',
      color_hex: '#3b82f6',
      study_route: 'staged' as const,
      stage: 'as' as const,
    }
    const chemSub = {
      id: 'sub-chem',
      name: 'Chemistry',
      code: '9701',
      color_hex: '#10b981',
      study_route: 'as_only' as const,
      stage: 'as' as const,
    }
    const bioSub = {
      id: 'sub-bio',
      name: 'Biology',
      code: '9700',
      color_hex: '#8b5cf6',
      study_route: 'full_level' as const,
      stage: 'full' as const,
    }
    const physSub = {
      id: 'sub-phys',
      name: 'Physics',
      code: '9702',
      color_hex: '#f59e0b',
      study_route: 'unconfirmed' as const,
      stage: null,
    }

    clearSessionCache()

    // Hold the overview request deferred
    let deferredResolver: ((val: unknown) => void) | null = null
    mockGetStatsOverviewData.mockImplementation(() => new Promise((resolve) => {
      deferredResolver = resolve
    }))

    render(
      <StatsWorkspace
        userId="user-cold-1"
        subjects={[mathSub, chemSub, bioSub, physSub]}
        initialSubjectId={null}
        initialOverview={{
          subjectId: null,
          trend: [],
          trendSubjects: [],
          summaryStats: [
            { label: 'Papers logged', value: 0 },
            { label: 'Full-paper average', value: '—' },
            { label: 'Best full paper', value: '—' },
          ],
          componentStats: [],
          activeSubjectName: null,
          timestamp: Date.now(),
        }}
      />
    )

    // User clicks Mathematics (staged -> 2 cards expected)
    const mathTab = screen.getByRole('link', { name: /^Mathematics/ })
    fireEvent.click(mathTab)

    // Assert that the deferred request started
    expect(deferredResolver).not.toBeNull()

    // 1. Assert actual loading controls and responsive trend loading structure
    const trendCard = document.querySelector('.card.practice-trend-card')
    expect(trendCard).toBeTruthy()

    expect(screen.getByRole('heading', { level: 2, name: 'Score trend' })).toBeTruthy()

    const trendTabs = screen.getByRole('group', { name: 'Trend evidence type' })
    expect(trendTabs).toBeTruthy()

    const disabledButtons = trendTabs.querySelectorAll('button')
    expect(disabledButtons).toHaveLength(3)
    disabledButtons.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true)
      expect(btn.getAttribute('aria-disabled')).toBe('true')
    })

    const trendLoadingRegion = screen.getByRole('region', { name: 'Loading score trend' })
    expect(trendLoadingRegion).toBeTruthy()

    const chartSkeleton = screen.getByRole('status', { name: 'Loading score trend chart' })
    expect(chartSkeleton).toBeTruthy()
    expect(chartSkeleton.style.aspectRatio).toBe('800 / 250')
    expect(chartSkeleton.style.maxHeight).toBe('280px')

    expect(screen.getByText(/Full paper.*Question session.*Each marker is one attempt/)).toBeTruthy()

    // Chapter accuracy skeleton
    expect(screen.getByRole('status', { name: 'Loading chapter accuracy' })).toBeTruthy()

    // Study indicators skeleton for staged subject: exactly 2 placeholder cards
    const stagedIndicators = screen.getAllByRole('status', { name: 'Loading study indicators' })
    expect(stagedIndicators).toHaveLength(2)

    // Resolve request to clean up
    deferredResolver!({
      subjectId: 'sub-math',
      trend: [],
      trendSubjects: [],
      summaryStats: [
        { label: 'Papers logged', value: 5 },
        { label: 'Full-paper average', value: '82%' },
        { label: 'Best full paper', value: '90%' },
      ],
      componentStats: [],
      activeSubjectName: 'Mathematics',
      timestamp: Date.now(),
    })
  })

  it('correctly derives placeholder counts from study_route for as_only, staged, full_level, unconfirmed, and All exceeding six', () => {
    // 1. Domain helper verification
    expect(getExpectedStudyIndicatorCount('unconfirmed')).toBe(0)
    expect(getExpectedStudyIndicatorCount('as_only')).toBe(1)
    expect(getExpectedStudyIndicatorCount('staged')).toBe(2)
    expect(getExpectedStudyIndicatorCount('full_level')).toBe(2)

    // 2. Direct StudyIndicatorsSkeleton tests:
    // Unconfirmed (0) removes forced minimum-one behavior
    const { container: skelZero, unmount: unmountZero } = render(<StudyIndicatorsSkeleton cardCount={0} />)
    expect(skelZero.querySelectorAll('.card')).toHaveLength(0)
    unmountZero()

    // AS-only (1)
    const { container: skelAsOnly, unmount: unmountAsOnlyDirect } = render(<StudyIndicatorsSkeleton cardCount={1} />)
    expect(skelAsOnly.querySelectorAll('.card')).toHaveLength(1)
    unmountAsOnlyDirect()

    // Staged / full_level (2)
    const { container: skelStaged, unmount: unmountStagedDirect } = render(<StudyIndicatorsSkeleton cardCount={2} />)
    expect(skelStaged.querySelectorAll('.card')).toHaveLength(2)
    unmountStagedDirect()

    // All totals exceeding six (e.g. 4 staged subjects -> 8 cards): removes arbitrary 6-card cap
    const { container: skelEight, unmount: unmountEightDirect } = render(<StudyIndicatorsSkeleton cardCount={8} />)
    expect(skelEight.querySelectorAll('.card')).toHaveLength(8)
    unmountEightDirect()

    // 3. StatsWorkspace integration with various subject study_routes during loading
    // AS-only subject
    const { unmount: unmountAsOnly } = render(
      <StatsWorkspace
        userId="user-counts-1"
        subjects={[{ id: 'sub-as', name: 'AS Subject', color_hex: '#10b981', study_route: 'as_only' }]}
        initialSubjectId="sub-as"
        initialOverview={undefined} // Cold loading
      />
    )
    expect(screen.getAllByRole('status', { name: 'Loading study indicators' })).toHaveLength(1)
    unmountAsOnly()

    // Full-level subject
    const { unmount: unmountFull } = render(
      <StatsWorkspace
        userId="user-counts-2"
        subjects={[{ id: 'sub-fl', name: 'Full Level', color_hex: '#8b5cf6', study_route: 'full_level' }]}
        initialSubjectId="sub-fl"
        initialOverview={undefined}
      />
    )
    expect(screen.getAllByRole('status', { name: 'Loading study indicators' })).toHaveLength(2)
    unmountFull()

    // Unconfirmed subject: exactly 0 placeholder cards
    const { unmount: unmountUnconf } = render(
      <StatsWorkspace
        userId="user-counts-3"
        subjects={[{ id: 'sub-un', name: 'Unconfirmed Sub', color_hex: '#f59e0b', study_route: 'unconfirmed' }]}
        initialSubjectId="sub-un"
        initialOverview={undefined}
      />
    )
    expect(screen.queryAllByRole('status', { name: 'Loading study indicators' })).toHaveLength(0)
    unmountUnconf()

    // "All" with 4 staged subjects -> 8 cards (exceeds six-card cap)
    const fourStaged = [
      { id: 's1', name: 'Subject 1', color_hex: '#3b82f6', study_route: 'staged' as const },
      { id: 's2', name: 'Subject 2', color_hex: '#10b981', study_route: 'staged' as const },
      { id: 's3', name: 'Subject 3', color_hex: '#8b5cf6', study_route: 'staged' as const },
      { id: 's4', name: 'Subject 4', color_hex: '#f59e0b', study_route: 'staged' as const },
    ]
    const { unmount: unmountAllEight } = render(
      <StatsWorkspace
        userId="user-counts-4"
        subjects={fourStaged}
        initialSubjectId={null} // All
        initialOverview={undefined}
      />
    )
    expect(screen.getAllByRole('status', { name: 'Loading study indicators' })).toHaveLength(8)
    unmountAllEight()
  })
})
