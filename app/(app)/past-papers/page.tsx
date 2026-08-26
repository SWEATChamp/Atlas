import { createClient } from '@/lib/supabase/server'
import { getAllPapersWithSubjects, getPapersForSubject, getChapterAccuracy, getUntaggedPapers } from '@/lib/actions/papers'
import { LogPaperButton } from '@/components/papers/log-paper-modal'
import { SubjectFilterTabs } from '@/components/papers/subject-filter-tabs'
import { ScoreTrendChart } from '@/components/papers/score-trend-chart'
import { ChapterAccuracyChart } from '@/components/papers/chapter-accuracy-chart'
import { PaperCard } from '@/components/papers/paper-card'
import PaperStageTagger from '@/components/papers/paper-stage-tagger'

export default async function PastPapersPage(props: {
  searchParams?: Promise<{ subject?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const sp = props.searchParams ? await props.searchParams : {}
  const activeSubjectId = sp.subject || null

  // ── Parallel fetch ────────────────────────────────────────────────────────
  const [userSubjectsData, papers, chapterAccuracy, untaggedPapers, profileResult] = await Promise.all([
    supabase.from('user_subjects').select('subjects(id, name, color_hex)').eq('user_id', user.id),
    activeSubjectId ? getPapersForSubject(activeSubjectId) : getAllPapersWithSubjects(),
    activeSubjectId ? getChapterAccuracy(activeSubjectId) : Promise.resolve([]),
    getUntaggedPapers(),
    supabase.from('profiles').select('timezone').eq('id', user.id).single(),
  ])
  const timeZone = profileResult.data?.timezone ?? 'UTC'

  const subjects = (userSubjectsData.data || [])
    .map((d: any) => d.subjects)
    .filter(Boolean)

  const avgScore = papers.length > 0
    ? (papers.reduce((s, p) => s + Number(p.accuracy_pct), 0) / papers.length).toFixed(1)
    : null

  const bestScore = papers.length > 0
    ? Math.max(...papers.map(p => Number(p.accuracy_pct))).toFixed(1)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Untagged papers notice */}
      {untaggedPapers.length > 0 && (
        <PaperStageTagger untaggedPapers={untaggedPapers} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
          {[  
            { label: 'Papers logged', value: papers.length },
            { label: 'Average score', value: avgScore != null ? `${avgScore}%` : '—' },
            { label: 'Best score', value: bestScore != null ? `${bestScore}%` : '—' },
          ].map(stat => (
            <div key={stat.label} className="card" style={{ padding: 'var(--space-5)' }}>
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
          <ScoreTrendChart papers={papers} activeSubjectId={activeSubjectId} />
        </div>
      )}

      {/* Subject selected: two-column layout */}
      {activeSubjectId ? (
        <div style={{ display: 'grid', gridTemplateColumns: chapterAccuracy.length > 0 ? '1fr 1fr' : '1fr', gap: 'var(--space-4)', alignItems: 'start' }}>
          {chapterAccuracy.length > 0 && (
            <div className="card" style={{ padding: 'var(--space-5)' }}>
              <h3 className="text-heading-3" style={{ margin: '0 0 var(--space-4) 0' }}>Chapter Accuracy</h3>
              <ChapterAccuracyChart data={chapterAccuracy} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <h3 className="text-heading-3" style={{ margin: 0 }}>Attempts</h3>
            {papers.map(p => <PaperCard key={p.id} paper={p} timeZone={timeZone} />)}
            {papers.length === 0 && (
              <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                No papers logged for this subject yet.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* All subjects: stats + full-width paper list */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Stats for All view */}
          {papers.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
              {[
                { label: 'Papers logged', value: papers.length },
                { label: 'Average score', value: avgScore != null ? `${avgScore}%` : '—' },
                { label: 'Best score',    value: bestScore != null ? `${bestScore}%` : '—' },
              ].map(stat => (
                <div key={stat.label} className="card" style={{ padding: 'var(--space-5)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    {stat.label}
                  </div>
                  <div className="text-heading-2" style={{ margin: 0 }}>{stat.value}</div>
                </div>
              ))}
            </div>
          )}
          <h3 className="text-heading-3" style={{ margin: '0 0 var(--space-4) 0' }}>All Attempts</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {papers.map(p => <PaperCard key={p.id} paper={p} timeZone={timeZone} />)}
            {papers.length === 0 && (
              <div className="card" style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📄</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>No papers logged yet</div>
                <div style={{ fontSize: '0.875rem' }}>Hit "+ Log Paper" to record your first attempt</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
