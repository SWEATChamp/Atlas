'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { PracticeTrend } from '@/components/papers/practice-workspace'
import { SubjectFilterTabs } from '@/components/papers/subject-filter-tabs'
import { LazyChapterAccuracyChart } from '@/components/papers/paper-charts'
import { ChapterAccuracySkeleton } from '@/components/papers/chapter-accuracy-chart'
import {
  StudyIndicators,
  StudyIndicatorsSkeleton,
  getExpectedStudyIndicatorCount,
} from '@/components/papers/study-indicators'
import { trendModes } from '@/lib/practice-ui'
import {
  fetchStatsChapterAccuracy,
  fetchStatsOverview,
  fetchStatsStudyIndicators,
} from '@/lib/stats-client'
import {
  getCachedStatsOverview,
  setCachedStatsOverview,
  getCachedStatsChapterAccuracy,
  setCachedStatsChapterAccuracy,
  getCachedStatsStudyIndicators,
  setCachedStatsStudyIndicators,
  getSessionUserId,
  setSessionUserId,
  getSubjectGeneration,
  subscribeSessionCache,
  type StatsOverviewData,
  type StatsSubjectData,
} from '@/lib/session-cache'
import type { ChapterAccuracy } from '@/types'
import type { StudyRoute, SubjectStage } from '@/types/database'
import type { IndicatorItem } from '@/components/papers/study-indicators'

export interface StatsWorkspaceProps {
  userId: string
  subjects: {
    id: string
    name: string
    color_hex: string
    code?: string | null
    stage?: SubjectStage | string | null
    study_route?: StudyRoute | string | null
  }[]
  initialSubjectId: string | null
  initialOverview?: StatsOverviewData
  initialChapterAccuracy?: ChapterAccuracy[] | null
  initialStudyIndicators?: IndicatorItem[] | null
  initialData?: StatsSubjectData
}

export function StatsWorkspace({
  userId,
  subjects,
  initialSubjectId,
  initialOverview,
  initialChapterAccuracy,
  initialStudyIndicators,
  initialData,
}: StatsWorkspaceProps) {
  // Resolve initial data from either initialOverview or legacy composite initialData
  const resolvedInitialOverview: StatsOverviewData = useMemo(
    () =>
      initialOverview ??
      initialData ?? {
        subjectId: initialSubjectId,
        trend: [],
        trendSubjects: [],
        summaryStats: [
          { label: 'Papers logged', value: 0 },
          { label: 'Full-paper average', value: '—' },
          { label: 'Best full paper', value: '—' },
        ],
        componentStats: [],
        activeSubjectName: null,
        timestamp: 0,
      },
    [initialOverview, initialData, initialSubjectId]
  )

  const resolvedInitialChapter: ChapterAccuracy[] | null =
    initialChapterAccuracy !== undefined
      ? initialChapterAccuracy
      : initialData?.chapterAccuracy ?? null

  const resolvedInitialIndicators: IndicatorItem[] | null =
    initialStudyIndicators !== undefined
      ? initialStudyIndicators
      : initialData?.studyIndicators ?? null

  // Explicitly separate requested tab selection from displayed data identity
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(initialSubjectId)
  const [displayedSubjectId, setDisplayedSubjectId] = useState<string | null>(initialSubjectId)

  // Granular progressive loading and error states
  const [overview, setOverview] = useState<StatsOverviewData>(resolvedInitialOverview)
  const [chapterAccuracy, setChapterAccuracy] = useState<ChapterAccuracy[] | null>(resolvedInitialChapter)
  const [studyIndicators, setStudyIndicators] = useState<IndicatorItem[] | null>(resolvedInitialIndicators)

  const [overviewLoading, setOverviewLoading] = useState<boolean>(false)
  const [chapterLoading, setChapterLoading] = useState<boolean>(resolvedInitialChapter === null && initialSubjectId !== null)
  const [indicatorsLoading, setIndicatorsLoading] = useState<boolean>(resolvedInitialIndicators === null)

  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [chapterError, setChapterError] = useState<string | null>(null)
  const [indicatorsError, setIndicatorsError] = useState<string | null>(null)

  // Concurrency, race, and lifecycle control refs
  const currentRequestIdRef = useRef<number>(0)
  const activeUserIdRef = useRef<string>(userId)
  const isMountedRef = useRef<boolean>(true)
  const selectSubjectRef = useRef<(targetSubjectId: string | null, pushToHistory?: boolean, force?: boolean) => void>(() => {})
  const abortControllerRef = useRef<AbortController | null>(null)

  const [prevUserId, setPrevUserId] = useState<string>(userId)
  const [prevInitialSubjectId, setPrevInitialSubjectId] = useState<string | null>(initialSubjectId)
  const [prevOverview, setPrevOverview] = useState<StatsOverviewData>(resolvedInitialOverview)

  // Reconcile props on account identity change
  if (userId !== prevUserId) {
    setPrevUserId(userId)
    setPrevInitialSubjectId(initialSubjectId)
    setPrevOverview(resolvedInitialOverview)

    setSelectedSubjectId(initialSubjectId)
    setDisplayedSubjectId(initialSubjectId)
    setOverview(resolvedInitialOverview)
    setChapterAccuracy(resolvedInitialChapter)
    setStudyIndicators(resolvedInitialIndicators)
    setOverviewLoading(false)
    setChapterLoading(resolvedInitialChapter === null && initialSubjectId !== null)
    setIndicatorsLoading(resolvedInitialIndicators === null)
    setOverviewError(null)
    setChapterError(null)
    setIndicatorsError(null)
  } else if (initialSubjectId !== prevInitialSubjectId) {
    // Reconcile props when server navigates to a new target subject
    setPrevInitialSubjectId(initialSubjectId)
    setPrevOverview(resolvedInitialOverview)

    setSelectedSubjectId(initialSubjectId)
    setDisplayedSubjectId(initialSubjectId)
    setOverview(resolvedInitialOverview)
    setChapterAccuracy(resolvedInitialChapter)
    setStudyIndicators(resolvedInitialIndicators)
    setOverviewLoading(false)
    setChapterLoading(resolvedInitialChapter === null && initialSubjectId !== null)
    setIndicatorsLoading(resolvedInitialIndicators === null)
    setOverviewError(null)
    setChapterError(null)
    setIndicatorsError(null)
  } else if (resolvedInitialOverview !== prevOverview) {
    // Reconcile props when server delivers refreshed overview for the same initial subject
    setPrevOverview(resolvedInitialOverview)

    // Only update displayed state if the user is currently looking at this subject!
    // If the user intentionally selected a different subject (e.g. Mathematics while
    // original All props refresh), preserve their intentionally selected view.
    if (selectedSubjectId === initialSubjectId) {
      setOverview(resolvedInitialOverview)
      setDisplayedSubjectId(initialSubjectId)
      setOverviewLoading(false)
      setOverviewError(null)

      if (resolvedInitialChapter !== null) {
        setChapterAccuracy(resolvedInitialChapter)
        setChapterLoading(false)
      }
      if (resolvedInitialIndicators !== null) {
        setStudyIndicators(resolvedInitialIndicators)
        setIndicatorsLoading(false)
      }
    }
  }

  // Synchronize user ID and seed initial cache
  const prevEffectUserIdRef = useRef<string | null>(null)
  useEffect(() => {
    const isFirstMount = prevEffectUserIdRef.current === null
    const userChanged = !isFirstMount && userId !== prevEffectUserIdRef.current

    if (userChanged) {
      prevEffectUserIdRef.current = userId
      activeUserIdRef.current = userId
      abortControllerRef.current?.abort()
      currentRequestIdRef.current++
      if (userId) setSessionUserId(userId)
    } else if (isFirstMount) {
      prevEffectUserIdRef.current = userId
      activeUserIdRef.current = userId
      if (userId) setSessionUserId(userId)
    }

    setCachedStatsOverview(initialSubjectId, resolvedInitialOverview, userId)
    if (resolvedInitialChapter) {
      setCachedStatsChapterAccuracy(initialSubjectId, resolvedInitialChapter, userId)
    }
    if (resolvedInitialIndicators) {
      setCachedStatsStudyIndicators(initialSubjectId, resolvedInitialIndicators, userId)
    }
  }, [userId, initialSubjectId, resolvedInitialOverview, resolvedInitialChapter, resolvedInitialIndicators])

  // Progressive hydration: load missing chapter accuracy or study indicators on mount or subject change
  useEffect(() => {
    // Only hydrate if the user is currently viewing initialSubjectId
    if (selectedSubjectId !== initialSubjectId) return

    const needsChapter =
      resolvedInitialChapter === null &&
      initialSubjectId !== null &&
      getCachedStatsChapterAccuracy(initialSubjectId) === null
    const needsIndicators =
      resolvedInitialIndicators === null &&
      getCachedStatsStudyIndicators(initialSubjectId) === null

    if (!needsChapter && !needsIndicators) return

    const requestId = currentRequestIdRef.current
    const startGeneration = getSubjectGeneration(initialSubjectId)
    const startUser = activeUserIdRef.current

    if (needsChapter) {
      fetchStatsChapterAccuracy(initialSubjectId)
        .then((res) => {
          if (!isMountedRef.current) return
          if (currentRequestIdRef.current !== requestId) return
          if (activeUserIdRef.current !== startUser) return
          if (getSubjectGeneration(initialSubjectId) !== startGeneration) return

          setCachedStatsChapterAccuracy(initialSubjectId, res, startUser)
          setChapterAccuracy(res)
          setChapterLoading(false)
        })
        .catch((err) => {
          if (!isMountedRef.current) return
          if (err instanceof Error && err.name === 'AbortError') return
          if (currentRequestIdRef.current !== requestId) return
          if (activeUserIdRef.current !== startUser) return
          console.error('Failed to load chapter accuracy', err)
          setChapterError('Could not load chapter accuracy. Please retry.')
          setChapterLoading(false)
        })
    }

    if (needsIndicators) {
      fetchStatsStudyIndicators(initialSubjectId)
        .then((res) => {
          if (!isMountedRef.current) return
          if (currentRequestIdRef.current !== requestId) return
          if (activeUserIdRef.current !== startUser) return
          if (getSubjectGeneration(initialSubjectId) !== startGeneration) return

          setCachedStatsStudyIndicators(initialSubjectId, res, startUser)
          setStudyIndicators(res)
          setIndicatorsLoading(false)
        })
        .catch((err) => {
          if (!isMountedRef.current) return
          if (err instanceof Error && err.name === 'AbortError') return
          if (currentRequestIdRef.current !== requestId) return
          if (activeUserIdRef.current !== startUser) return
          console.error('Failed to load study indicators', err)
          setIndicatorsError('Could not load study indicators. Please retry.')
          setIndicatorsLoading(false)
        })
    }
  }, [userId, initialSubjectId, resolvedInitialChapter, resolvedInitialIndicators, selectedSubjectId])

  // Track component unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      abortControllerRef.current?.abort()
    }
  }, [])

  function selectSubject(targetSubjectId: string | null, pushToHistory = true, force = false) {
    if (userId && getSessionUserId() !== userId) {
      setSessionUserId(userId)
    }

    const isSameSubject = targetSubjectId === selectedSubjectId
    const hasError = Boolean(overviewError || chapterError || indicatorsError)

    // A genuine no-op click on the already selected tab with no errors and no force flag
    // must NOT increment the request counter or cancel pending in-flight work.
    if (isSameSubject && !force && !hasError) {
      return
    }

    // Monotonically increment request ID on genuine selection changes, retries, or forced refreshes
    const requestId = ++currentRequestIdRef.current

    // Abort in-flight HTTP requests from previous subject selections
    abortControllerRef.current?.abort()
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    const signal = abortController.signal

    setSelectedSubjectId(targetSubjectId)

    if (pushToHistory) {
      const url = targetSubjectId
        ? `/stats?subject=${encodeURIComponent(targetSubjectId)}`
        : '/stats'
      window.history.pushState(null, '', url)
    }

    // 1. Check warm client-session cache
    const cachedOverview = getCachedStatsOverview(targetSubjectId)
    const cachedChapter = targetSubjectId ? getCachedStatsChapterAccuracy(targetSubjectId) : []
    const cachedIndicators = getCachedStatsStudyIndicators(targetSubjectId)

    const hasWarmOverview = cachedOverview !== null
    const hasWarmChapter = cachedChapter !== null
    const hasWarmIndicators = cachedIndicators !== null

    if (hasWarmOverview) {
      setOverview(cachedOverview)
      setDisplayedSubjectId(targetSubjectId)
      setOverviewLoading(false)
      setOverviewError(null)
    } else {
      setOverviewLoading(true)
      setOverviewError(null)
    }

    if (hasWarmChapter) {
      setChapterAccuracy(cachedChapter)
      setChapterLoading(false)
      setChapterError(null)
    } else {
      setChapterAccuracy(null)
      setChapterLoading(targetSubjectId !== null)
      setChapterError(null)
    }

    if (hasWarmIndicators) {
      setStudyIndicators(cachedIndicators)
      setIndicatorsLoading(false)
      setIndicatorsError(null)
    } else {
      setStudyIndicators(null)
      setIndicatorsLoading(true)
      setIndicatorsError(null)
    }

    if (hasWarmOverview && hasWarmChapter && hasWarmIndicators) {
      return
    }

    // 2. Fetch missing sections progressively via concurrent HTTP reads
    const startGeneration = getSubjectGeneration(targetSubjectId)
    const startUser = activeUserIdRef.current

    // Progressive Fetch A: Top-level Overview (Score trend, summary metrics, component stats)
    if (!hasWarmOverview) {
      fetchStatsOverview(targetSubjectId, signal)
        .then((res) => {
          if (!isMountedRef.current) return
          if (currentRequestIdRef.current !== requestId) return
          if (activeUserIdRef.current !== startUser) return
          if (getSubjectGeneration(targetSubjectId) !== startGeneration) return

          setCachedStatsOverview(targetSubjectId, res, startUser)
          setOverview(res)
          setDisplayedSubjectId(targetSubjectId)
          setOverviewLoading(false)
        })
        .catch((err) => {
          if (!isMountedRef.current) return
          if (err instanceof Error && err.name === 'AbortError') return
          if (currentRequestIdRef.current !== requestId) return
          if (activeUserIdRef.current !== startUser) return
          console.error('Failed to load stats overview', err)
          setOverviewError('Could not load statistics for this subject. Please retry.')
          setOverviewLoading(false)
        })
    }

    // Progressive Fetch B: Chapter Accuracy breakdown
    if (!hasWarmChapter) {
      if (!targetSubjectId) {
        setChapterAccuracy([])
        setChapterLoading(false)
      } else {
        fetchStatsChapterAccuracy(targetSubjectId, signal)
          .then((res) => {
            if (!isMountedRef.current) return
            if (currentRequestIdRef.current !== requestId) return
            if (activeUserIdRef.current !== startUser) return
            if (getSubjectGeneration(targetSubjectId) !== startGeneration) return

            setCachedStatsChapterAccuracy(targetSubjectId, res, startUser)
            setChapterAccuracy(res)
            setChapterLoading(false)
          })
          .catch((err) => {
            if (!isMountedRef.current) return
            if (err instanceof Error && err.name === 'AbortError') return
            if (currentRequestIdRef.current !== requestId) return
            if (activeUserIdRef.current !== startUser) return
            console.error('Failed to load chapter accuracy', err)
            setChapterError('Could not load chapter accuracy. Please retry.')
            setChapterLoading(false)
          })
      }
    }

    // Progressive Fetch C: Study Indicators (Predicted mark and readiness RPCs)
    if (!hasWarmIndicators) {
      fetchStatsStudyIndicators(targetSubjectId, signal)
        .then((res) => {
          if (!isMountedRef.current) return
          if (currentRequestIdRef.current !== requestId) return
          if (activeUserIdRef.current !== startUser) return
          if (getSubjectGeneration(targetSubjectId) !== startGeneration) return

          setCachedStatsStudyIndicators(targetSubjectId, res, startUser)
          setStudyIndicators(res)
          setIndicatorsLoading(false)
        })
        .catch((err) => {
          if (!isMountedRef.current) return
          if (err instanceof Error && err.name === 'AbortError') return
          if (currentRequestIdRef.current !== requestId) return
          if (activeUserIdRef.current !== startUser) return
          console.error('Failed to load study indicators', err)
          setIndicatorsError('Could not load study indicators. Please retry.')
          setIndicatorsLoading(false)
        })
    }
  }

  useEffect(() => {
    selectSubjectRef.current = selectSubject
  })

  // Handle browser Back / Forward (popstate)
  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search)
      const sub = params.get('subject') || null
      selectSubjectRef.current(sub, false, true)
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  // Subscribe to real mutation invalidations
  useEffect(() => {
    return subscribeSessionCache((affectedSubjectId) => {
      const isRelevant =
        !affectedSubjectId ||
        affectedSubjectId === 'all' ||
        selectedSubjectId === null || // All view aggregates all contributing subjects!
        affectedSubjectId === selectedSubjectId

      if (isRelevant) {
        selectSubjectRef.current(selectedSubjectId, false, true)
      }
    })
  }, [selectedSubjectId])

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId)
  const isOverviewStaleOrLoading = overviewLoading || displayedSubjectId !== selectedSubjectId

  const expectedIndicatorCount = useMemo(() => {
    if (selectedSubjectId) {
      const activeSub = subjects.find((s) => s.id === selectedSubjectId)
      return getExpectedStudyIndicatorCount(activeSub?.study_route)
    }
    return subjects.reduce((sum, s) => sum + getExpectedStudyIndicatorCount(s.study_route), 0)
  }, [selectedSubjectId, subjects])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="text-heading-1" style={{ margin: 0 }}>Stats & Analytics</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Subject performance, score trends, chapter evidence, and study indicators
          </p>
        </div>
      </div>

      {/* Subject Filter Tabs */}
      <SubjectFilterTabs
        subjects={subjects}
        activeId={selectedSubjectId}
        basePath="/stats"
        ariaLabel="Filter stats by subject"
        onSelect={(subId) => selectSubject(subId, true)}
      />

      {/* Error alert for overview fetch failures */}
      {overviewError && (
        <div
          role="alert"
          className="card"
          style={{
            padding: 'var(--space-4)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <span>{overviewError}</span>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => selectSubject(selectedSubjectId, false, true)}
          >
            Retry
          </button>
        </div>
      )}

      {/* 1. Score-trend graph */}
      {isOverviewStaleOrLoading ? (
        <section
          className="card practice-trend-card"
          aria-labelledby="practice-trend-title"
        >
          <header className="practice-trend-heading">
            <h2 id="practice-trend-title" className="text-heading-3">Score trend</h2>
            <p className="practice-trend-description">
              {selectedSubjectId
                ? 'Attempt scores for the subject selected above.'
                : 'Subject lines show each attempt. Overall is the running mark-weighted average.'}
            </p>
          </header>
          <div
            role="group"
            aria-label="Trend evidence type"
            className="practice-trend-tabs"
          >
            {trendModes.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled
                aria-disabled="true"
                className={`btn ${option.id === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ opacity: 0.7, pointerEvents: 'none' }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div
            role="region"
            aria-label="Loading score trend"
            className="practice-trend-content"
          >
            <div className="practice-trend-summary" aria-hidden="true">
              <p className="practice-trend-summary-placeholder practice-trend-summary-lifetime">
                <span className="skeleton practice-trend-summary-line" />
                <span className="skeleton practice-trend-summary-line practice-trend-skeleton-wrap" />
              </p>
              <div>
                <p className="practice-trend-summary-placeholder practice-trend-summary-route">
                  <span className="skeleton practice-trend-summary-line" />
                  <span className="skeleton practice-trend-summary-line practice-trend-skeleton-wrap" />
                </p>
                <p className="practice-trend-help practice-trend-summary-placeholder">
                  <span className="skeleton practice-trend-summary-line" style={{ width: '55%', minWidth: '160px' }} />
                </p>
              </div>
            </div>
            <ul aria-hidden="true" className="practice-trend-legend">
              <li style={{ minWidth: 0 }}>
                <span className="skeleton" style={{ width: 28, height: 12, borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
                <span className="skeleton" style={{ width: 90, height: 16, borderRadius: 'var(--radius-sm)' }} />
              </li>
              {!selectedSubjectId && (
                <li style={{ minWidth: 0 }}>
                  <span className="skeleton" style={{ width: 28, height: 12, borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
                  <span className="skeleton" style={{ width: 140, height: 16, borderRadius: 'var(--radius-sm)' }} />
                </li>
              )}
            </ul>
            <div
              className="skeleton"
              role="status"
              aria-label="Loading score trend chart"
              style={{
                width: '100%',
                aspectRatio: '800 / 250',
                maxHeight: '280px',
                borderRadius: 'var(--radius-md)',
              }}
            />
            <p className="practice-trend-description practice-trend-marker-note" aria-hidden="true">
              ● Full paper &nbsp; ◆ Question session. Each marker is one attempt, including attempts made on the same day.
            </p>
            <div style={{ minHeight: 44, display: 'flex', alignItems: 'center' }} aria-hidden="true">
              <span className="skeleton" style={{ height: '20px', width: '220px', borderRadius: 'var(--radius-sm)' }} />
            </div>
          </div>
        </section>
      ) : (
        <PracticeTrend
          points={overview.trend}
          subjects={overview.trendSubjects}
          preferredSubjectId={selectedSubjectId}
        />
      )}

      {/* 2. Chapter & Topic Accuracy */}
      {chapterLoading || isOverviewStaleOrLoading ? (
        <ChapterAccuracySkeleton />
      ) : chapterError ? (
        <div
          role="alert"
          className="card"
          style={{
            padding: 'var(--space-4)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <span>{chapterError}</span>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => selectSubject(selectedSubjectId, false, true)}
          >
            Retry
          </button>
        </div>
      ) : selectedSubjectId === null ? (
        <section
          aria-labelledby="chapter-accuracy-title"
          className="card"
          style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}
        >
          <div>
            <h2 id="chapter-accuracy-title" className="text-heading-3" style={{ margin: 0 }}>
              Chapter &amp; Topic Accuracy
            </h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Select a subject from the filter tabs above to inspect chapter and subtopic accuracy
            </p>
          </div>
          <div
            style={{
              padding: 'var(--space-6)',
              textAlign: 'center',
              color: 'var(--text-muted)',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            Chapter accuracy is specific to each syllabus. Select a subject above to view chapter breakdown.
          </div>
        </section>
      ) : (
        <section
          aria-labelledby="chapter-accuracy-title"
          className="card"
          style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}
        >
          <div>
            <h2 id="chapter-accuracy-title" className="text-heading-3" style={{ margin: 0 }}>
              Chapter &amp; Topic Accuracy
            </h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Accuracy breakdown across syllabus chapters based on past papers and question practice
            </p>
          </div>
          <LazyChapterAccuracyChart data={chapterAccuracy ?? []} />
        </section>
      )}

      {/* 3. Study Indicators */}
      {indicatorsLoading || isOverviewStaleOrLoading ? (
        <StudyIndicatorsSkeleton
          activeSubjectName={selectedSubject?.name}
          cardCount={expectedIndicatorCount}
        />
      ) : indicatorsError ? (
        <div
          role="alert"
          className="card"
          style={{
            padding: 'var(--space-4)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <span>{indicatorsError}</span>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => selectSubject(selectedSubjectId, false, true)}
          >
            Retry
          </button>
        </div>
      ) : (
        <StudyIndicators
          indicators={studyIndicators ?? []}
          activeSubjectName={overview.activeSubjectName ?? selectedSubject?.name}
        />
      )}

      {/* Full-Paper Metrics Summary Grid */}
      <div className="past-papers-stats-grid">
        {overview.summaryStats.map((stat, i) => (
          <div key={i} className="card past-papers-stat-cell">
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', overflowWrap: 'break-word' }}>
              {stat.label}
            </span>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 4 }}>
              {isOverviewStaleOrLoading ? '—' : stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Component Breakdown */}
      {!isOverviewStaleOrLoading && overview.componentStats.length > 0 && (
        <section
          aria-labelledby="component-stats-title"
          className="card"
          style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}
        >
          <div>
            <h2 id="component-stats-title" className="text-heading-3" style={{ margin: 0 }}>
              Component Performance
            </h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Relative strengths across examined components (minimum 2 attempts per component)
            </p>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            {overview.componentStats.map((stat) => (
              <div
                key={stat.label}
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{stat.label}</span>
                  {stat.ranking && (
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '1px 6px',
                        borderRadius: 4,
                        background:
                          stat.ranking === 'strongest'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : stat.ranking === 'weakest'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(107, 114, 128, 0.15)',
                        color:
                          stat.ranking === 'strongest'
                            ? 'var(--success)'
                            : stat.ranking === 'weakest'
                            ? 'var(--danger)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {stat.ranking}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  {stat.markWeightedAccuracyPct != null ? `${stat.markWeightedAccuracyPct.toFixed(1)}%` : '—'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {stat.count} {stat.count === 1 ? 'attempt' : 'attempts'}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
