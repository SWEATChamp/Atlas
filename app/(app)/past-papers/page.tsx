import { getAuthenticatedContext, getCurrentProfile } from '@/lib/supabase/authenticated'
import { getAllPapersWithSubjects, getPapersForSubject, getChapterAccuracy, getUntaggedPapers } from '@/lib/actions/papers'
import { LogPaperButton } from '@/components/papers/log-paper-button'
import { SubjectFilterTabs } from '@/components/papers/subject-filter-tabs'
import { LazyChapterAccuracyChart, LazyScoreTrendChart } from '@/components/papers/paper-charts'
import {
  PaperStageProvider,
  PaperStageTaggerSlot,
  PaperAttemptsListSlot,
} from '@/components/papers/paper-stage-provider'
import type { PaperWithSubject } from '@/types'

export default async function PastPapersPage(props: {
  searchParams?: Promise<{ subject?: string }>
}) {
  const searchParamsPromise: Promise<{ subject?: string }> =
    props.searchParams ?? Promise.resolve({})
  const [{ supabase, user }, profile, sp] = await Promise.all([
    getAuthenticatedContext(),
    getCurrentProfile(),
    searchParamsPromise,
  ])
  if (!user) return null

  const activeSubjectId = sp.subject || null

  // ── Parallel data fetching ────────────────────────────────────────────────
  let papers: PaperWithSubject[] = []
  let untaggedPapers: PaperWithSubject[] = []
  let chapterAccuracy: Awaited<ReturnType<typeof getChapterAccuracy>> = []
  let subjects: { id: string; name: string; color_hex: string }[] = []

  if (activeSubjectId) {
    const [userSubjectsData, subjectPapers, accuracyData, globalUntagged] = await Promise.all([
      supabase.from('user_subjects').select('subjects(id, name, color_hex)').eq('user_id', user.id),
      getPapersForSubject(activeSubjectId),
      getChapterAccuracy(activeSubjectId),
      getUntaggedPapers(), // Ensure global untagged papers across all subjects remain visible on filtered views
    ])
    subjects = (userSubjectsData.data || []).flatMap((row) => row.subjects ?? [])
    papers = subjectPapers
    chapterAccuracy = accuracyData
    untaggedPapers = globalUntagged
  } else {
    const [userSubjectsData, allPapers] = await Promise.all([
      supabase.from('user_subjects').select('subjects(id, name, color_hex)').eq('user_id', user.id),
      getAllPapersWithSubjects(),
    ])
    subjects = (userSubjectsData.data || []).flatMap((row) => row.subjects ?? [])
    papers = allPapers
    untaggedPapers = allPapers.filter((p) => !p.stage) // Derived directly on All view to eliminate duplicate query
  }

  const timeZone = profile?.timezone ?? 'UTC'

  const avgScore = papers.length > 0
    ? (papers.reduce((s, p) => s + Number(p.accuracy_pct), 0) / papers.length).toFixed(1)
    : null

  const bestScore = papers.length > 0
    ? Math.max(...papers.map(p => Number(p.accuracy_pct))).toFixed(1)
    : null

  const summaryStats = [
    { label: 'Papers logged', value: papers.length },
    { label: 'Average score', value: avgScore != null ? `${avgScore}%` : '—' },
    { label: 'Best score', value: bestScore != null ? `${bestScore}%` : '—' },
  ]

  return (
    <PaperStageProvider
      initialPapers={papers}
      initialUntaggedPapers={untaggedPapers}
      timeZone={timeZone}
      key={activeSubjectId ?? 'all'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Untagged papers slot */}
        <PaperStageTaggerSlot />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="text-heading-1" style={{ margin: 0 }}>Past Papers</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Track your paper attempts and spot weak chapters
            </p>
          </div>
          <LogPaperButton timeZone={timeZone} />
        </div>

        {/* Subject filter tabs */}
        <SubjectFilterTabs subjects={subjects} activeId={activeSubjectId} />

        {/* Stats row — only show when a subject is selected */}
        {activeSubjectId && (
          <div className="past-papers-stats-grid">
            {summaryStats.map((stat, index) => (
              <div key={stat.label} className="past-papers-stat-cell" style={{ borderLeft: index > 0 ? '1px solid var(--border-subtle)' : undefined }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  {stat.label}
                </div>
                <div className="text-heading-2" style={{ margin: 0 }}>{stat.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Score trend chart */}
        {papers.length > 0 && (
          <div className="card" style={{ padding: 'var(--space-5)' }}>
            <h3 className="text-heading-3" style={{ margin: '0 0 var(--space-4) 0' }}>Score Trend</h3>
            <LazyScoreTrendChart papers={papers} activeSubjectId={activeSubjectId} />
          </div>
        )}

        {/* Subject selected: responsive 2-column to 1-column layout */}
        {activeSubjectId ? (
          <div className="past-papers-2col">
            {chapterAccuracy.length > 0 && (
              <div className="card" style={{ padding: 'var(--space-5)' }}>
                <h3 className="text-heading-3" style={{ margin: '0 0 var(--space-4) 0' }}>Chapter Accuracy</h3>
                <LazyChapterAccuracyChart data={chapterAccuracy} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <h3 className="text-heading-3" style={{ margin: 0 }}>Attempts</h3>
              <PaperAttemptsListSlot emptyMessage="No papers logged for this subject yet." />
            </div>
          </div>
        ) : (
          /* All subjects: stats + full-width paper list */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Stats for All view */}
            {papers.length > 0 && (
              <div className="past-papers-stats-grid">
                {summaryStats.map((stat, index) => (
                  <div key={stat.label} className="past-papers-stat-cell" style={{ borderLeft: index > 0 ? '1px solid var(--border-subtle)' : undefined }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      {stat.label}
                    </div>
                    <div className="text-heading-2" style={{ margin: 0 }}>{stat.value}</div>
                  </div>
                ))}
              </div>
            )}
            <h3 className="text-heading-3" style={{ margin: '0 0 var(--space-4) 0' }}>All Attempts</h3>
            <PaperAttemptsListSlot emptyMessage="No papers logged yet. Select Log Paper to record your first attempt." />
          </div>
        )}
      </div>
    </PaperStageProvider>
  )
}
