import type { Metadata } from 'next'
import { getAuthenticatedContext } from '@/lib/supabase/authenticated'
import { getAllPapersWithSubjects, getPapersForSubject } from '@/lib/actions/papers'
import { getCombinedChapterEvidenceForSubject, getPracticeOverview } from '@/lib/actions/practice-sessions'
import {
  basePaperNumber,
  bestFullPaper,
  comparableComponentAnalytics,
  computePredictedExamMark,
  fullPaperCount,
  markWeightedPaperAverage,
  rankComponentEvidence,
} from '@/lib/practice-analytics'
import { PracticeTrend } from '@/components/papers/practice-workspace'
import { SubjectFilterTabs } from '@/components/papers/subject-filter-tabs'
import { LazyChapterAccuracyChart } from '@/components/papers/paper-charts'
import { StudyIndicators, type IndicatorItem } from '@/components/papers/study-indicators'
import type { ChapterAccuracy } from '@/types'
import type { PaperStage } from '@/types/database'
import type { PracticeRouteContext } from '@/types/practice-sessions'

export const metadata: Metadata = {
  title: 'Stats & Analytics',
}

interface RawEnrollment {
  id: string
  subject_id: string
  current_stage: string
  study_route: string
  is_archived: boolean
  subjects: {
    id: string
    name: string
    code?: string | null
    color_hex?: string | null
  } | null
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
  const [userSubjectsData, papers, practice, chapterEvidence] = await Promise.all([
    supabase
      .from('user_subjects')
      .select('id, subject_id, current_stage, study_route, is_archived, subjects(id, name, code, color_hex)')
      .eq('user_id', user.id)
      .eq('is_archived', false),
    papersPromise,
    getPracticeOverview(activeSubjectId ?? undefined),
    activeSubjectId ? getCombinedChapterEvidenceForSubject(activeSubjectId) : Promise.resolve([]),
  ])

  const enrollments = (userSubjectsData.data || []) as unknown as RawEnrollment[]
  const subjects = enrollments
    .map(e => e.subjects)
    .filter((s): s is { id: string; name: string; color_hex: string; code?: string | null } => Boolean(s))
    .map(s => ({ id: s.id, name: s.name, color_hex: s.color_hex ?? '#3b82f6', code: s.code }))

  const activeEnrollment = enrollments.find(e => e.subject_id === activeSubjectId)
  const activeSubject = subjects.find(s => s.id === activeSubjectId)

  // Load chapter titles directly without calling getPracticeFormCatalogue()
  const chapterIds = chapterEvidence.map(row => row.chapterId)
  let chapterTitles = new Map<string, { title: string; component: string | null }>()
  if (chapterIds.length > 0) {
    const { data: chaptersData } = await supabase
      .from('chapters')
      .select('id, title, component')
      .in('id', chapterIds)
    if (chaptersData) {
      chapterTitles = new Map(chaptersData.map(ch => [ch.id, { title: ch.title ?? 'Chapter', component: ch.component }]))
    }
  }

  const chapterAccuracy: ChapterAccuracy[] = chapterEvidence.map(row => ({
    chapter_id: row.chapterId,
    title: chapterTitles.get(row.chapterId)?.title ?? 'Chapter',
    component: chapterTitles.get(row.chapterId)?.component ?? null,
    total_obtained: row.raw,
    total_available: row.max,
    accuracy_pct: row.accuracyPct,
    attempt_count: row.attempts,
  }))

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

  // Compute Dual Study Indicators for target subjects, exposing separately inspectable AS and A2 stages
  const targetEnrollments = activeEnrollment ? [activeEnrollment] : enrollments
  const indicatorItems: IndicatorItem[] = (
    await Promise.all(
      targetEnrollments.map(async enrollment => {
        if (enrollment.study_route === 'unconfirmed') return []
        const sId = enrollment.subject_id
        const sName = enrollment.subjects?.name ?? 'Subject'
        const sCode = enrollment.subjects?.code ?? undefined
        const route = enrollment.study_route

        // Fetch route context for this subject
        const [chData, spData, selData] = await Promise.all([
          supabase.from('chapters').select('id, subject_id, stage, component, is_active').eq('subject_id', sId).eq('is_active', true),
          supabase.from('subject_papers').select('id, subject_id, paper_number, stage_behavior, default_stage').eq('subject_id', sId),
          supabase.from('subject_paper_selections').select('subject_paper_id, component_name, stage').eq('user_subject_id', enrollment.id),
        ])

        const context: PracticeRouteContext = {
          enrollment: {
            id: enrollment.id,
            subjectId: sId,
            subjectCode: sCode ?? '',
            currentStage: enrollment.current_stage as 'as' | 'a2' | 'full',
            studyRoute: enrollment.study_route as 'as_only' | 'full_level' | 'staged' | 'unconfirmed',
            isArchived: enrollment.is_archived,
          },
          chapters: (chData.data ?? []).map(ch => ({
            id: ch.id,
            subjectId: ch.subject_id,
            stage: ch.stage,
            component: ch.component,
            isActive: ch.is_active,
            paperIds: [],
          })),
          papers: (spData.data ?? []).map(sp => ({
            id: sp.id,
            subjectId: sp.subject_id,
            paperNumber: sp.paper_number,
            stageBehavior: sp.stage_behavior,
            defaultStage: sp.default_stage,
          })),
          selections: (selData.data ?? []).map(sel => ({
            subjectPaperId: sel.subject_paper_id,
            componentName: sel.component_name,
            stage: sel.stage,
          })),
        }

        const stages: PaperStage[] = route === 'as_only' ? ['as'] : ['as', 'a2']

        const itemsForEnrollment = await Promise.all(
          stages.map(async stage => {
            const isCurrent =
              enrollment.current_stage === 'full'
                ? true
                : enrollment.current_stage === stage
            const isLockedA2 = stage === 'a2' && enrollment.current_stage === 'as'

            const predicted = computePredictedExamMark(sId, stage, papers, practice.sessions, context)

            const hasRecordedHistory =
              practice.sessions.some(s => s.subject_id === sId && s.stage === stage) ||
              papers.some(p => p.subject_id === sId && p.stage === stage)

            let readinessScore: number | null = null
            if (!isLockedA2) {
              const rpcRes = await supabase.rpc('compute_readiness_score', {
                p_user_id: user.id,
                p_subject_id: sId,
                p_stage: stage,
              })
              readinessScore = typeof rpcRes.data === 'number' ? rpcRes.data : null
            }

            return {
              subjectId: sId,
              subjectName: sName,
              subjectCode: sCode,
              stage,
              isCurrentStage: isCurrent,
              isLockedA2,
              predicted,
              readinessScore,
              hasRecordedHistory,
            }
          })
        )

        return itemsForEnrollment
      })
    )
  ).flat()

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

      {/* Study Indicators */}
      <StudyIndicators indicators={indicatorItems} activeSubjectName={activeSubject?.name} />

      {/* Score Trend */}
      <PracticeTrend points={practice.trend} subjects={trendSubjects} preferredSubjectId={activeSubjectId} />

      {/* Full-Paper Metrics Summary Grid */}
      <div className="past-papers-stats-grid">
        {summaryStats.map((stat, i) => (
          <div key={i} className="card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{stat.label}</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 4 }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Chapter Accuracy / Weak Topics Breakdown */}
      {activeSubjectId && (
        <section aria-labelledby="chapter-accuracy-title">
          <LazyChapterAccuracyChart data={chapterAccuracy} />
        </section>
      )}

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
