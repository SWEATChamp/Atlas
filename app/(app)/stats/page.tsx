import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getAuthenticatedContext } from '@/lib/supabase/authenticated'
import { getAllPapersWithSubjects, getPapersForSubject } from '@/lib/actions/papers'
import { getPracticeOverview } from '@/lib/actions/practice-sessions'
import {
  basePaperNumber,
  bestFullPaper,
  comparableComponentAnalytics,
  fullPaperCount,
  markWeightedPaperAverage,
  rankComponentEvidence,
} from '@/lib/practice-analytics'
import { PracticeTrend } from '@/components/papers/practice-workspace'
import { SubjectFilterTabs } from '@/components/papers/subject-filter-tabs'
import {
  AsyncChapterAccuracySection,
  ChapterAccuracySkeleton,
} from '@/components/papers/async-chapter-accuracy'
import {
  AsyncStudyIndicators,
  StudyIndicatorsSkeleton,
  type RawEnrollment,
} from '@/components/papers/async-study-indicators'

export const metadata: Metadata = {
  title: 'Stats & Analytics',
}

export default async function StatsPage(props: {
  searchParams?: Promise<{ subject?: string }>
}) {
  const searchParamsPromise: Promise<{ subject?: string }> =
    props.searchParams ?? Promise.resolve({})
  const [{ supabase, user }, sp] = await Promise.all([
    getAuthenticatedContext(),
    searchParamsPromise,
  ])
  if (!user) return null

  const activeSubjectId = sp.subject || null

  const papersPromise = activeSubjectId ? getPapersForSubject(activeSubjectId) : getAllPapersWithSubjects()
  const [userSubjectsData, papers, practice] = await Promise.all([
    supabase
      .from('user_subjects')
      .select('id, subject_id, current_stage, study_route, is_archived, subjects(id, name, code, color_hex)')
      .eq('user_id', user.id)
      .eq('is_archived', false),
    papersPromise,
    getPracticeOverview(activeSubjectId ?? undefined),
  ])

  const enrollments = (userSubjectsData.data || []) as unknown as RawEnrollment[]
  const subjects = enrollments
    .map(e => e.subjects)
    .filter((s): s is { id: string; name: string; color_hex: string; code?: string | null } => Boolean(s))
    .map(s => ({ id: s.id, name: s.name, color_hex: s.color_hex ?? '#3b82f6', code: s.code }))

  const activeEnrollment = enrollments.find(e => e.subject_id === activeSubjectId)
  const activeSubject = subjects.find(s => s.id === activeSubjectId)

  const avgScore = markWeightedPaperAverage(papers)
  const best = bestFullPaper(papers)
  const componentReferences = [...new Map(papers.filter(paper => paper.paper_number !== null).map(paper => [
    `${paper.subject_id}:${paper.stage}:${basePaperNumber(paper.paper_number)}`, paper,
  ])).values()]
  const componentStats = rankComponentEvidence(componentReferences.map(reference => ({
    label: `${reference.subjects.name} · ${reference.stage?.toUpperCase() ?? 'Untagged'} · Paper ${basePaperNumber(reference.paper_number)}`,
    ...comparableComponentAnalytics(papers, reference),
  })))

  const summaryStats = [
    { label: 'Papers logged', value: fullPaperCount(papers) },
    { label: 'Full-paper average', value: avgScore != null ? `${avgScore.toFixed(1)}%` : '—' },
    { label: 'Best full paper', value: best ? `${Number(best.accuracy_pct).toFixed(1)}%` : '—' },
  ]

  const targetEnrollments = activeEnrollment ? [activeEnrollment] : enrollments

  const trendSubjects = [
    ...new Map(
      [
        ...subjects,
        ...papers.map(p => ({ id: p.subject_id, name: p.subjects.name, color_hex: '#3b82f6' })),
      ].map(s => [s.id, s])
    ).values(),
  ]

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
      <SubjectFilterTabs subjects={subjects} activeId={activeSubjectId} basePath="/stats" ariaLabel="Filter stats by subject" />

      {/* 1. Score-trend graph */}
      <PracticeTrend points={practice.trend} subjects={trendSubjects} preferredSubjectId={activeSubjectId} />

      {/* 2. Chapter & Topic Accuracy */}
      <Suspense fallback={<ChapterAccuracySkeleton />}>
        <AsyncChapterAccuracySection activeSubjectId={activeSubjectId} />
      </Suspense>

      {/* 3. Remaining numeric content: Study Indicators, Summary Stats Grid, Component Breakdown */}
      <Suspense fallback={<StudyIndicatorsSkeleton activeSubjectName={activeSubject?.name} />}>
        <AsyncStudyIndicators
          userId={user.id}
          targetEnrollments={targetEnrollments}
          papers={papers}
          practiceSessions={practice.sessions}
          activeSubjectName={activeSubject?.name}
        />
      </Suspense>

      {/* Full-Paper Metrics Summary Grid */}
      <div className="past-papers-stats-grid">
        {summaryStats.map((stat, i) => (
          <div key={i} className="card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{stat.label}</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 4 }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Component Breakdown */}
      {componentStats.length > 0 && (
        <section aria-labelledby="component-stats-title" className="card" style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}>
          <div>
            <h2 id="component-stats-title" className="text-heading-3" style={{ margin: 0 }}>Component Performance</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Relative strengths across examined components (minimum 2 attempts per component)
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
            {componentStats.map(stat => (
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
