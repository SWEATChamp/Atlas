import { getCombinedChapterEvidenceForSubject, getPracticeRouteContext } from '@/lib/actions/practice-sessions'
import { LazyChapterAccuracyChart } from './paper-charts'
import type { ChapterAccuracy } from '@/types'

export function ChapterAccuracySkeleton() {
  return (
    <section aria-labelledby="chapter-accuracy-title" className="card" style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}>
      <div>
        <h2 id="chapter-accuracy-title" className="text-heading-3" style={{ margin: 0 }}>Chapter &amp; Topic Accuracy</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Accuracy breakdown across syllabus chapters based on past papers and question practice
        </p>
      </div>
      <div className="skeleton" role="status" aria-label="Loading chapter accuracy" style={{ height: '260px', borderRadius: 'var(--radius-md)' }} />
    </section>
  )
}

export async function AsyncChapterAccuracySection({
  activeSubjectId,
}: {
  activeSubjectId: string | null
}) {
  if (!activeSubjectId) {
    return (
      <section aria-labelledby="chapter-accuracy-title" className="card" style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}>
        <div>
          <h2 id="chapter-accuracy-title" className="text-heading-3" style={{ margin: 0 }}>Chapter &amp; Topic Accuracy</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Select a subject from the filter tabs above to inspect chapter and subtopic accuracy
          </p>
        </div>
        <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)' }}>
          Chapter accuracy is specific to each syllabus. Select a subject above to view chapter breakdown.
        </div>
      </section>
    )
  }

  const [chapterEvidence, activeContext] = await Promise.all([
    getCombinedChapterEvidenceForSubject(activeSubjectId),
    getPracticeRouteContext(activeSubjectId),
  ])

  const chapterTitles = new Map<string, { title: string; component: string | null }>(
    (activeContext?.chapters ?? []).map(ch => [ch.id, { title: ch.title ?? 'Chapter', component: ch.component }])
  )

  const chapterAccuracy: ChapterAccuracy[] = chapterEvidence.map(row => ({
    chapter_id: row.chapterId,
    title: chapterTitles.get(row.chapterId)?.title ?? 'Chapter',
    component: chapterTitles.get(row.chapterId)?.component ?? null,
    total_obtained: row.raw,
    total_available: row.max,
    accuracy_pct: row.accuracyPct,
    attempt_count: row.attempts,
  }))

  return (
    <section aria-labelledby="chapter-accuracy-title" className="card" style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}>
      <div>
        <h2 id="chapter-accuracy-title" className="text-heading-3" style={{ margin: 0 }}>Chapter &amp; Topic Accuracy</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Accuracy breakdown across syllabus chapters based on past papers and question practice
        </p>
      </div>
      <LazyChapterAccuracyChart data={chapterAccuracy} />
    </section>
  )
}
