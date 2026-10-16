import type { Metadata } from 'next'
import { getAuthenticatedContext, getCurrentProfile } from '@/lib/supabase/authenticated'
import { getAllPapersWithSubjects, getPapersForSubject, getUntaggedPapers } from '@/lib/actions/papers'
import { getCombinedChapterEvidenceForSubject, getPracticeFormCatalogue, getPracticeOverview } from '@/lib/actions/practice-sessions'
import { basePaperNumber, bestFullPaper, comparableComponentAnalytics, fullPaperCount, latestFullPaper, markWeightedPaperAverage, rankComponentEvidence } from '@/lib/practice-analytics'
import { PracticeWorkspace } from '@/components/papers/practice-workspace'
import { SubjectFilterTabs } from '@/components/papers/subject-filter-tabs'
import { LazyChapterAccuracyChart } from '@/components/papers/paper-charts'
import {
  PaperStageProvider,
  PaperStageTaggerSlot,
  PaperAttemptsListSlot,
} from '@/components/papers/paper-stage-provider'
import type { ChapterAccuracy, PaperWithSubject } from '@/types'

export const metadata: Metadata = {
  title: 'Past Papers',
}

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
  let subjects: { id: string; name: string; color_hex: string }[] = []

  if (activeSubjectId) {
    const [userSubjectsData, subjectPapers, globalUntagged] = await Promise.all([
      supabase.from('user_subjects').select('subjects(id, name, color_hex)').eq('user_id', user.id),
      getPapersForSubject(activeSubjectId),
      getUntaggedPapers(), // Ensure global untagged papers across all subjects remain visible on filtered views
    ])
    subjects = (userSubjectsData.data || []).flatMap((row) => row.subjects ?? [])
    papers = subjectPapers
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
  const [practice, formSubjects, chapterEvidence] = await Promise.all([
    getPracticeOverview(activeSubjectId ?? undefined),
    getPracticeFormCatalogue(),
    activeSubjectId ? getCombinedChapterEvidenceForSubject(activeSubjectId) : Promise.resolve([]),
  ])
  const chapterTitles = new Map(formSubjects.flatMap(subject => subject.context.chapters.map(chapter => [chapter.id, { title: chapter.title ?? 'Chapter', component: chapter.component }] as const)))
  const chapterAccuracy: ChapterAccuracy[] = chapterEvidence.map(row => ({
    chapter_id: row.chapterId, title: chapterTitles.get(row.chapterId)?.title ?? 'Chapter',
    component: chapterTitles.get(row.chapterId)?.component ?? null, total_obtained: row.raw,
    total_available: row.max, accuracy_pct: row.accuracyPct, attempt_count: row.attempts,
  }))

  const avgScore = markWeightedPaperAverage(papers)
  const best = bestFullPaper(papers)
  const latest = latestFullPaper(papers)
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

  return (
    <PaperStageProvider
      initialPapers={papers}
      initialUntaggedPapers={untaggedPapers}
      timeZone={timeZone}
      key={activeSubjectId ?? 'all'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="text-heading-1" style={{ margin: 0 }}>Past Papers</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Track your paper attempts and spot weak chapters
            </p>
          </div>
        </div>

        {/* Subject filter tabs */}
        <SubjectFilterTabs subjects={subjects} activeId={activeSubjectId} />

        <PracticeWorkspace sessions={practice.sessions} trend={practice.trend} subjects={formSubjects}
          trendSubjects={[...new Map([...formSubjects, ...subjects, ...papers.map(paper => ({ id: paper.subject_id, name: paper.subjects.name }))].map(subject => [subject.id, subject])).values()]}
          preferredSubjectId={activeSubjectId} timeZone={timeZone}>
        {/* Keep server-rendered full-paper content separate from question evidence. */}
        <PaperStageTaggerSlot />
        {/* Full-paper-only metrics remain separate from question-practice evidence. */}
        <div className="past-papers-stats-grid">
          {summaryStats.map((stat, index) => <div key={stat.label} className="past-papers-stat-cell" style={{ borderLeft: index > 0 ? '1px solid var(--border-subtle)' : undefined }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{stat.label}</div>
            <div className="text-heading-2" style={{ margin: 0 }}>{stat.value}</div>
          </div>)}
        </div>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>Full-paper metrics exclude question sessions. {latest ? `Latest: Paper ${latest.paper_number ?? 'unidentified'} on ${latest.attempted_at}, ${latest.score_raw}/${latest.score_max} marks (${Number(latest.accuracy_pct).toFixed(1)}%).` : 'No full-paper result yet.'}</p>
        {activeSubjectId && componentStats.length > 0 && <section className="card" aria-label="Comparable full-paper components" style={{ padding: 'var(--space-5)' }}>
          <h2 className="text-heading-3" style={{ marginTop: 0 }}>Full-paper components</h2>
          <p style={{ color: 'var(--text-muted)' }}>Comparison requires at least 2 attempts per component and 2 qualifying components. Equal scores are unranked.</p>
          <ul className="practice-item-list">{componentStats.map(stat => <li key={stat.label}>{stat.ranking === 'weakest' ? 'Weakest · ' : stat.ranking === 'strongest' ? 'Strongest · ' : stat.ranking === 'tied' ? 'Equal score · ' : ''}{stat.label}: {stat.count} attempts · {stat.markWeightedAccuracyPct?.toFixed(1) ?? '—'}% mark-weighted · average {stat.averageRaw?.toFixed(1)}/{stat.averageMax?.toFixed(1)} marks · latest {stat.latest?.score_raw}/{stat.latest?.score_max} marks</li>)}</ul>
        </section>}

        {/* Subject selected: responsive 2-column to 1-column layout */}
        {activeSubjectId ? (
          <div className="past-papers-2col">
            {chapterAccuracy.length > 0 && (
              <div className="card" style={{ padding: 'var(--space-5)' }}>
                <h3 className="text-heading-3" style={{ margin: '0 0 var(--space-4) 0' }}>Chapter accuracy · full-paper questions + eligible practice</h3>
                <LazyChapterAccuracyChart data={chapterAccuracy} />
                {chapterEvidence.some(row => row.weakTopic) && <div>
                  <h4 style={{ marginBottom: 4 }}>Weak topics (below 60%)</h4>
                  <ul className="practice-item-list">{chapterEvidence.filter(row => row.weakTopic).slice(0, 5).map(row => <li key={row.chapterId}>{chapterTitles.get(row.chapterId)?.title ?? 'Chapter'}: {row.raw}/{row.max} marks ({row.accuracyPct.toFixed(1)}%); {row.fullPaperAttempts} full-paper questions and {row.practiceItems} eligible practice items</li>)}</ul>
                </div>}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <h3 className="text-heading-3" style={{ margin: 0 }}>Full-paper history</h3>
              <PaperAttemptsListSlot emptyMessage="No papers logged for this subject yet." />
            </div>
          </div>
        ) : (
          /* All subjects: full-width paper list */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <h3 className="text-heading-3" style={{ margin: '0 0 var(--space-4) 0' }}>Full-paper history</h3>
            <PaperAttemptsListSlot emptyMessage="No papers logged yet. Select Log Paper to record your first attempt." />
          </div>
        )}
        </PracticeWorkspace>
      </div>
    </PaperStageProvider>
  )
}
