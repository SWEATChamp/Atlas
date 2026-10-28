'use client'

import dynamic from 'next/dynamic'
import { startTransition, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@/components/ui/dialog'
import { LogPaperButton } from './log-paper-button'
import { deletePracticeSession } from '@/lib/actions/practice-sessions'
import { summarizeEvidence } from '@/lib/practice-analytics'
import { trendModes, type TrendMode } from '@/lib/practice-ui'
import { buildPracticeTrend, type TrendSubject } from '@/lib/practice-trend'
import { formatDateOnly } from '@/lib/date'
import type { AttemptTrendPoint, PracticeFormSubjectOption, PracticeSessionRead } from '@/types/practice-sessions'

const LogQuestionsModal = dynamic(() => import('./log-questions-modal').then(module => module.LogQuestionsModal), {
  loading: () => <p role="status">Preparing question form…</p>,
})

function formatPercent(value: number | null) { return value === null ? '—' : `${value.toFixed(1)}%` }
function formatDate(value: string) { return formatDateOnly(value, { day: 'numeric', month: 'short', year: 'numeric' }) }

const attemptTabs = [
  { id: 'full_paper', label: 'Full papers' },
  { id: 'practice', label: 'Question practice' },
] as const

export function PracticeTrend({ points, subjects = [], preferredSubjectId }: {
  points: AttemptTrendPoint[]
  subjects?: TrendSubject[]
  preferredSubjectId?: string | null
}) {
  const [mode, setMode] = useState<TrendMode>('all')
  const { visible, series, overall, showOverall } = buildPracticeTrend(points, subjects, mode, preferredSubjectId)
  const subjectNames = new Map(series.map(subject => [subject.id, subject.name]))
  const summary = summarizeEvidence(visible)
  const itemCount = visible.reduce((sum, point) => sum + point.itemCount, 0)
  const coordinate = (index: number, pct: number) => ({
    x: visible.length === 1 ? 400 : 35 + (index / (visible.length - 1)) * 730,
    y: 208 - Math.min(100, Math.max(0, pct)) * 1.72,
  })
  const overallLine = overall.map((point) => {
    const { x, y } = coordinate(point.index, point.accuracyPct)
    return `${x},${y}`
  }).join(' ')

  return <section className="card practice-trend-card" aria-labelledby="practice-trend-title">
    <header className="practice-trend-heading">
      <h2 id="practice-trend-title" className="text-heading-3">Score trend</h2>
      <p className="practice-trend-description">{showOverall ? 'Subject lines show each attempt. Overall is the running mark-weighted average.' : 'Attempt scores for the subject selected above.'}</p>
    </header>
    <div role="group" aria-label="Trend evidence type" className="practice-trend-tabs">
      {trendModes.map(option => <button key={option.id} type="button" aria-pressed={mode === option.id} className={`btn ${mode === option.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode(option.id)}>{option.label}</button>)}
    </div>
    <div role="region" aria-label={`${trendModes.find(option => option.id === mode)?.label} trend`} className="practice-trend-content">
      {visible.length === 0 ? <p role="status" className="practice-trend-description">No {mode === 'full_paper' ? 'full-paper' : mode === 'practice' ? 'question-practice' : 'practice'} attempts yet.</p> : <>
        <div className="practice-trend-summary" aria-live="polite">
          <p className="practice-trend-summary-lifetime"><strong>Lifetime:</strong> {formatPercent(summary.lifetime.weightedAccuracyPct)} mark-weighted · {summary.lifetime.raw}/{summary.lifetime.max} marks · {summary.lifetime.attempts} {summary.lifetime.attempts === 1 ? 'attempt' : 'attempts'}{mode !== 'full_paper' ? ` · ${itemCount} question ${itemCount === 1 ? 'item' : 'items'}` : ''}</p>
          <div className="practice-trend-summary-route-wrap">
            <p className="practice-trend-summary-route"><strong>Current route evidence:</strong> {formatPercent(summary.currentRoute.weightedAccuracyPct)} · {summary.currentRoute.raw}/{summary.currentRoute.max} eligible marks · {summary.currentRoute.attempts} contributing {summary.currentRoute.attempts === 1 ? 'attempt' : 'attempts'}.</p>
            <p className="practice-trend-help">Partial sessions contribute eligible items only.</p>
          </div>
        </div>
        <ul aria-label="Trend legend" className="practice-trend-legend">
          {series.map(subject => <li key={subject.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <svg aria-hidden="true" width="28" height="12" style={{ flexShrink: 0 }}><line x1="0" y1="6" x2="28" y2="6" stroke={subject.colour} strokeWidth="3" strokeDasharray={subject.dash} /></svg>
            <span style={{ overflowWrap: 'anywhere' }}>{subject.name}</span>
          </li>)}
          {showOverall && <li style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><svg aria-hidden="true" width="28" height="12" style={{ flexShrink: 0 }}><line x1="0" y1="6" x2="28" y2="6" stroke="var(--text-primary)" strokeWidth="3" strokeDasharray="6 5" /></svg><span style={{ overflowWrap: 'anywhere' }}>Overall · cumulative weighted</span></li>}
        </ul>
        <svg viewBox="0 0 800 250" role="img" aria-label={`${visible.length} attempt${visible.length === 1 ? '' : 's'} in date order; ${series.map(subject => subject.name).join(', ')}${showOverall ? '; overall cumulative mark-weighted trend' : ''}; full papers are circles and question sessions are diamonds`} style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 280 }}>
          {[0, 25, 50, 75, 100].map(pct => <g key={pct}><line x1="35" x2="765" y1={coordinate(0, pct).y} y2={coordinate(0, pct).y} stroke="var(--border-subtle)" /><text x="0" y={coordinate(0, pct).y + 4} fill="var(--text-muted)" fontSize="11">{pct}%</text></g>)}
          {showOverall && overall.length > 1 && <polyline aria-label="Overall cumulative mark-weighted accuracy" points={overallLine} fill="none" stroke="var(--text-primary)" strokeWidth="3" strokeDasharray="6 5" />}
          {series.map(subject => <g key={subject.id} aria-label={`${subject.name} attempt scores`}>
            {subject.attempts.length > 1 && <polyline points={subject.attempts.map(({ point, index }) => { const { x, y } = coordinate(index, point.accuracyPct); return `${x},${y}` }).join(' ')} fill="none" stroke={subject.colour} strokeWidth="2" strokeDasharray={subject.dash} />}
            {subject.attempts.map(({ point, index }) => {
              const { x, y } = coordinate(index, point.accuracyPct)
              const title = `${subject.name}: ${formatDate(point.attemptDate)}, ${point.raw}/${point.max} marks (${point.accuracyPct.toFixed(1)}%)`
              return point.source === 'full_paper'
                ? <circle key={`${point.source}-${point.id}`} cx={x} cy={y} r="7" fill={subject.colour} stroke="var(--bg-card)" strokeWidth="2"><title>{title}</title></circle>
                : <rect key={`${point.source}-${point.id}`} x={x - 6} y={y - 6} width="12" height="12" transform={`rotate(45 ${x} ${y})`} fill={subject.colour} stroke="var(--bg-card)" strokeWidth="2"><title>{title}</title></rect>
            })}
          </g>)}
          {visible.length > 0 && <>
            <text x="35" y="238" fill="var(--text-muted)" fontSize="11">{formatDate(visible[0].attemptDate)}</text>
            {visible.length > 1 && <text x="765" y="238" textAnchor="end" fill="var(--text-muted)" fontSize="11">{formatDate(visible[visible.length - 1].attemptDate)}</text>}
          </>}
        </svg>
        <p className="practice-trend-description practice-trend-marker-note">● Full paper &nbsp; ◆ Question session. Each marker is one attempt, including attempts made on the same day.</p>
        <details>
          <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
            {visible.length === 1
              ? 'Text evidence for 1 attempt'
              : `Text evidence for all ${visible.length} attempts`}
          </summary>
          <ol className="practice-trend-evidence">
            {visible.map((point, index) => <li key={`${point.source}-${point.id}`}>
              {subjectNames.get(point.subjectId)} · {formatDate(point.attemptDate)} · {point.source === 'full_paper' ? 'Full paper' : `Question practice (${point.itemCount} items)`} · {point.stage?.toUpperCase() ?? 'Stage untagged'} · {point.raw}/{point.max} marks ({point.accuracyPct.toFixed(1)}%). {showOverall ? `Overall to this attempt: ${overall[index].raw}/${overall[index].max} marks (${overall[index].accuracyPct.toFixed(1)}%). ` : ''}{point.eligibleForCurrentRoute ? `Current route: ${point.eligibleRaw}/${point.eligibleMax} eligible marks.` : 'Historical/off-route; no current-route marks.'}
            </li>)}
          </ol>
        </details>
      </>}
    </div>
  </section>
}

export function PracticeWorkspace({ sessions, trend, subjects, trendSubjects = subjects, preferredSubjectId, timeZone, children }: {
  sessions: PracticeSessionRead[]
  trend: AttemptTrendPoint[]
  subjects: PracticeFormSubjectOption[]
  trendSubjects?: TrendSubject[]
  preferredSubjectId: string | null
  timeZone: string
  children?: ReactNode
}) {
  const router = useRouter()
  const [attemptType, setAttemptType] = useState<(typeof attemptTabs)[number]['id']>('full_paper')
  const tabsId = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editSession, setEditSession] = useState<PracticeSessionRead | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PracticeSessionRead | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const deleteErrorRef = useRef<HTMLParagraphElement>(null)
  const practicePoints = trend.filter(point => point.source === 'practice')
  const practiceSummary = summarizeEvidence(practicePoints)
  const subjectNames = new Map(subjects.map(subject => [subject.id, subject.name]))

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % attemptTabs.length
      : event.key === 'ArrowLeft' ? (index + attemptTabs.length - 1) % attemptTabs.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? attemptTabs.length - 1 : null
    if (next === null) return
    event.preventDefault()
    setAttemptType(attemptTabs[next].id)
    tabRefs.current[next]?.focus()
  }

  function confirmDelete() {
    if (!deleteTarget || deleteBusy) return
    setDeleteBusy(true); setDeleteError('')
    startTransition(async () => {
      try {
        const result = await deletePracticeSession({ sessionId: deleteTarget.id })
        if (result.error) {
          setDeleteError(result.error)
          requestAnimationFrame(() => deleteErrorRef.current?.focus())
        } else { setDeleteTarget(null); router.refresh() }
      } catch {
        setDeleteError('Could not delete the session. Please retry.')
        requestAnimationFrame(() => deleteErrorRef.current?.focus())
      } finally { setDeleteBusy(false) }
    })
  }

  return <>
    <PracticeTrend points={trend} subjects={trendSubjects} preferredSubjectId={preferredSubjectId} />
    <div className="past-papers-attempt-tabs" role="tablist" aria-label="Log and review attempts">
      {attemptTabs.map((tab, index) => <button key={tab.id} ref={element => { tabRefs.current[index] = element }}
        id={`${tabsId}-${tab.id}-tab`} type="button" role="tab"
        aria-selected={attemptType === tab.id} aria-controls={`${tabsId}-${tab.id}-panel`}
        tabIndex={attemptType === tab.id ? 0 : -1}
        className={`btn ${attemptType === tab.id ? 'btn-primary' : 'btn-ghost'}`}
        onClick={() => setAttemptType(tab.id)} onKeyDown={event => navigateTabs(event, index)}>{tab.label}</button>)}
    </div>
    <section role="tabpanel" id={`${tabsId}-full_paper-panel`} aria-labelledby={`${tabsId}-full_paper-tab`}
      tabIndex={0} hidden={attemptType !== 'full_paper'} className="past-papers-attempt-panel">
      {attemptType === 'full_paper' && <>
        <div className="practice-workspace-heading">
          <div><h2 className="text-heading-2" style={{ margin: 0 }}>Full papers</h2><p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>Record complete papers and review your results.</p></div>
          <LogPaperButton timeZone={timeZone} preferredSubjectId={preferredSubjectId} />
        </div>
        {children}
      </>}
    </section>
    <section role="tabpanel" id={`${tabsId}-practice-panel`} aria-labelledby={`${tabsId}-practice-tab`}
      tabIndex={0} hidden={attemptType !== 'practice'} className="past-papers-attempt-panel">
    {attemptType === 'practice' && <>
    <div className="practice-workspace-heading">
      <div><h2 className="text-heading-2" style={{ margin: 0 }}>Question practice</h2><p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>Separate from full-paper results and paper achievements.</p></div>
      <button className="btn btn-primary" type="button" disabled={subjects.length === 0} onClick={() => setCreateOpen(true)}>+ Log Questions</button>
    </div>
    {subjects.length === 0 && <p role="status">Confirm a study route for an active subject before logging questions.</p>}
    <div className="practice-metrics" aria-label="Question practice summary">
      <div className="card"><span>Question sessions</span><strong>{sessions.length}</strong></div>
      <div className="card"><span>Question-practice accuracy</span><strong>{formatPercent(practiceSummary.lifetime.weightedAccuracyPct)}</strong><small>{practiceSummary.lifetime.raw}/{practiceSummary.lifetime.max} lifetime marks</small></div>
      <div className="card"><span>Current-route question evidence</span><strong>{formatPercent(practiceSummary.currentRoute.weightedAccuracyPct)}</strong><small>{practiceSummary.currentRoute.raw}/{practiceSummary.currentRoute.max} eligible marks</small></div>
    </div>
    <section aria-labelledby="practice-history-title" style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <h2 id="practice-history-title" className="text-heading-3" style={{ margin: 0 }}>Question-practice history</h2>
      {sessions.length === 0 ? <p className="card" role="status" style={{ padding: 'var(--space-5)', color: 'var(--text-muted)' }}>No question sessions yet. Use Log Questions to record a topical, past-year, or mixed group.</p> : sessions.map(session => {
        const canEdit = subjects.some(subject => subject.id === session.subject_id)
        const partial = session.eligible_score_max > 0 && session.eligible_score_max < session.total_score_max
        return <article key={session.id} className="card practice-history-card">
          <div className="practice-history-top">
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, overflowWrap: 'anywhere' }}>{session.title || `${session.items.length} question${session.items.length === 1 ? '' : 's'}`}</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>{subjectNames.get(session.subject_id) ?? 'Archived subject'} · {session.stage.toUpperCase()} · {formatDate(session.session_date)} · {session.items.length} items</p>
            </div>
            <strong>{session.total_score_raw}/{session.total_score_max} · {Number(session.accuracy_pct).toFixed(1)}%</strong>
          </div>
          <p style={{ margin: 0, color: session.eligible_score_max ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            {partial ? `Partial current-route evidence: ${session.eligible_score_raw}/${session.eligible_score_max} eligible marks; ${session.total_score_raw}/${session.total_score_max} remains lifetime history.` :
              session.eligible_score_max ? `Current-route evidence: ${session.eligible_score_raw}/${session.eligible_score_max} marks.` : 'Historical/off-route: 0 marks currently eligible for readiness.'}
          </p>
          <details>
            <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>View question details and sources</summary>
            <ol className="practice-item-list">{session.items.map(item => <li key={item.id}>
              <strong>{item.question_label ? `Question ${item.question_label}` : `Question ${item.item_order}`}</strong> · {item.marks_obtained}/{item.marks_available} marks · {item.provenance_mode === 'inherit' ? 'shared source' : item.provenance_mode === 'override' ? 'own source' : 'topical/source-only'}
              {item.paper_number ? ` · Paper ${item.paper_number}` : ''}{item.exam_year ? ` · ${item.exam_year}` : ''}{item.exam_series ? ` · ${item.exam_series.replace('_', '/')}` : ''}{item.exam_variant ? ` · variant ${item.exam_variant}` : ''}{item.source_label ? ` · ${item.source_label}` : ''}
              <br /><span style={{ color: 'var(--text-muted)' }}>{item.eligible_for_readiness ? 'Currently eligible' : `Historical/off-route (${item.eligibility_reason.replaceAll('_', ' ')})`} · {item.chapter_ids.length} mapped chapters</span>
            </li>)}</ol>
            {session.notes && <p>Notes: {session.notes}</p>}
          </details>
          <div className="practice-history-actions">
            <button className="btn btn-ghost" type="button" disabled={!canEdit} title={!canEdit ? 'Archived or unconfirmed subject cannot be edited' : undefined} onClick={() => setEditSession(session)}>Edit</button>
            <button className="btn btn-danger" type="button" onClick={() => { setDeleteTarget(session); setDeleteError('') }}>Delete</button>
          </div>
        </article>
      })}
    </section>
    </>}
    </section>
    {(createOpen || editSession) && <LogQuestionsModal
      subjects={subjects} timeZone={timeZone} preferredSubjectId={preferredSubjectId} existing={editSession ?? undefined}
      onClose={() => { setCreateOpen(false); setEditSession(null) }}
      onSuccess={() => { setCreateOpen(false); setEditSession(null); router.refresh() }}
    />}
    {deleteTarget && <Dialog isOpen onClose={() => { if (!deleteBusy) setDeleteTarget(null) }} titleId="practice-delete-title" maxWidth={440} showCloseButton>
      <div style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}>
        <h2 id="practice-delete-title" className="text-heading-2" style={{ margin: 0 }}>Delete question session?</h2>
        <p style={{ margin: 0 }}>This removes the whole session, its {deleteTarget.items.length} questions, and chapter mappings. Full-paper records are unaffected.</p>
        {deleteError && <p ref={deleteErrorRef} tabIndex={-1} role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{deleteError}</p>}
        <div className="practice-modal-actions"><button className="btn btn-ghost" type="button" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>Cancel</button><button className="btn btn-danger" type="button" disabled={deleteBusy} onClick={confirmDelete}>{deleteBusy ? 'Deleting…' : 'Delete session'}</button></div>
      </div>
    </Dialog>}
  </>
}
