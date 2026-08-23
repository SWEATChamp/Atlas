import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock, Calendar, BookOpen, Target, FileText } from 'lucide-react'
import { getPaperDetail } from '@/lib/actions/papers'
import { formatDateOnly } from '@/lib/date'

export default async function PaperDetailPage(props: {
  params: Promise<{ paperId: string }>
}) {
  const params = await props.params
  const paper = await getPaperDetail(params.paperId)
  if (!paper) notFound()

  const pct = Number(paper.accuracy_pct)
  const pctColor = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)'

  const sortedQuestions = [...paper.paper_question_attempts].sort((a, b) =>
    a.question_number.localeCompare(b.question_number, undefined, { numeric: true })
  )

  const date = formatDateOnly(paper.attempted_at, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  // Group questions by chapter component for the sidebar stats
  const componentMap = new Map<string, { obtained: number; available: number }>()
  sortedQuestions.forEach(q => {
    const key = q.chapters?.component ?? q.chapters?.title ?? 'Untagged'
    if (!componentMap.has(key)) componentMap.set(key, { obtained: 0, available: 0 })
    componentMap.get(key)!.obtained  += q.marks_obtained
    componentMap.get(key)!.available += q.marks_available
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 900, margin: '0 auto' }}>

      {/* Back link */}
      <Link href="/past-papers" className="btn btn-ghost" style={{ alignSelf: 'flex-start', gap: 6 }}>
        <ArrowLeft size={16} /> Back to Papers
      </Link>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 6 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              backgroundColor: paper.subjects.color_hex || 'var(--accent-primary)',
            }} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              {paper.subjects.name}
            </span>
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
            {paper.paper_code}
          </h1>
        </div>

        {/* Big score */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
            {paper.score_raw}
            <span style={{ fontSize: '1.5rem', color: 'var(--text-muted)', fontWeight: 400 }}> / {paper.score_max}</span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: pctColor, marginTop: 4 }}>
            {pct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* ── Meta row ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: '0.875rem' }}>
          <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
          {date}
        </div>
        {paper.time_taken_mins && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: '0.875rem' }}>
            <Clock size={14} style={{ color: 'var(--text-muted)' }} />
            {paper.time_taken_mins} minutes
          </div>
        )}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: '0.875rem' }}>
          <FileText size={14} style={{ color: 'var(--text-muted)' }} />
          {sortedQuestions.length} question{sortedQuestions.length !== 1 ? 's' : ''} logged
        </div>
      </div>

      {paper.notes && (
        <div className="card" style={{ padding: 'var(--space-4)', borderLeft: '3px solid var(--accent-primary)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes</div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontSize: '0.9375rem' }}>{paper.notes}</p>
        </div>
      )}

      {/* ── Questions ─────────────────────────────────────────────────────── */}
      {sortedQuestions.length === 0 ? (
        <div className="card" style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-muted)' }}>
          <BookOpen size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No questions logged</div>
          <div style={{ fontSize: '0.875rem' }}>Edit this paper to add question-level breakdowns.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: componentMap.size > 1 ? '1fr 220px' : '1fr', gap: 'var(--space-4)', alignItems: 'start' }}>

          {/* Question table */}
          <div className="card" style={{ overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '44px 1fr 90px 90px 56px',
              padding: '10px 16px', background: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--border-subtle)',
              fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              <div>Q#</div>
              <div>Chapter</div>
              <div style={{ textAlign: 'right' }}>Marks</div>
              <div style={{ paddingLeft: 8 }}>Progress</div>
              <div style={{ textAlign: 'right' }}>%</div>
            </div>

            {/* Rows */}
            {sortedQuestions.map((q, i) => {
              const qPct = q.marks_available > 0 ? (q.marks_obtained / q.marks_available) * 100 : 0
              const rowColor = qPct >= 80 ? 'var(--success)' : qPct >= 60 ? 'var(--warning)' : 'var(--danger)'
              const chapterLabel = q.chapters
                ? q.chapters.component
                  ? `${q.chapters.component} · ${q.chapters.title}`
                  : q.chapters.title
                : null

              return (
                <div key={q.id} style={{
                  display: 'grid', gridTemplateColumns: '44px 1fr 90px 90px 56px',
                  padding: '12px 16px', alignItems: 'center',
                  borderBottom: i < sortedQuestions.length - 1 ? '1px solid var(--border-subtle)' : undefined,
                  transition: 'background 100ms',
                }}>
                  {/* Q# */}
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9375rem' }}>
                    {q.question_number}
                  </div>

                  {/* Chapter */}
                  <div style={{ minWidth: 0 }}>
                    {chapterLabel ? (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {chapterLabel}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-disabled)' }}>—</div>
                    )}
                  </div>

                  {/* Marks */}
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                    {q.marks_obtained} / {q.marks_available}
                  </div>

                  {/* Mini bar */}
                  <div style={{ paddingLeft: 8 }}>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        width: `${qPct}%`,
                        background: rowColor,
                        transition: 'width 400ms ease',
                      }} />
                    </div>
                  </div>

                  {/* Pct */}
                  <div style={{ textAlign: 'right', fontWeight: 700, color: rowColor, fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                    {qPct.toFixed(0)}%
                  </div>
                </div>
              )
            })}

            {/* Totals footer */}
            <div style={{
              display: 'grid', gridTemplateColumns: '44px 1fr 90px 90px 56px',
              padding: '12px 16px', background: 'var(--bg-elevated)',
              borderTop: '1px solid var(--border-subtle)',
            }}>
              <div />
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total</div>
              <div style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {paper.score_raw} / {paper.score_max}
              </div>
              <div />
              <div style={{ textAlign: 'right', fontWeight: 800, color: pctColor, fontSize: '0.875rem' }}>
                {pct.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Component accuracy sidebar — only if multiple components */}
          {componentMap.size > 1 && (
            <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                By Component
              </div>
              {Array.from(componentMap.entries()).map(([comp, stats]) => {
                const cPct = stats.available > 0 ? (stats.obtained / stats.available) * 100 : 0
                const cColor = cPct >= 80 ? 'var(--success)' : cPct >= 60 ? 'var(--warning)' : 'var(--danger)'
                return (
                  <div key={comp}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{comp}</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: cColor }}>{cPct.toFixed(0)}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, width: `${cPct}%`, background: cColor, transition: 'width 400ms ease' }} />
                    </div>
                    <div style={{ marginTop: 4, fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                      {stats.obtained} / {stats.available} marks
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
