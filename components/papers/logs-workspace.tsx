'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  startTransition,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@/components/ui/dialog'
import { LogPaperButton } from './log-paper-button'
import { deletePracticeSession } from '@/lib/actions/practice-sessions'
import { formatDateOnly } from '@/lib/date'
import type { PracticeFormSubjectOption, PracticeSessionRead } from '@/types/practice-sessions'

const LogQuestionsModal = dynamic(
  () => import('./log-questions-modal').then(module => module.LogQuestionsModal),
  { loading: () => <p role="status">Preparing question form…</p> }
)

function formatPercent(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)}%`
}

function formatDate(value: string) {
  return formatDateOnly(value, { day: 'numeric', month: 'short', year: 'numeric' })
}

export const attemptTabs = [
  { id: 'full_paper', label: 'Full papers' },
  { id: 'practice', label: 'Question practice' },
] as const

export interface LogsWorkspaceProps {
  sessions: PracticeSessionRead[]
  totalSessions?: number
  currentPage?: number
  pageSize?: number
  subjects?: PracticeFormSubjectOption[]
  cataloguePromise?: Promise<PracticeFormSubjectOption[] | null> | PromiseLike<PracticeFormSubjectOption[] | null>
  userSubjects?: { id: string; name: string }[]
  preferredSubjectId: string | null
  timeZone: string
  formError?: string | null
  historyError?: string | null
  children?: ReactNode
}

const EMPTY_SUBJECTS: PracticeFormSubjectOption[] = []

export function LogsWorkspace({
  sessions,
  totalSessions,
  currentPage = 1,
  pageSize = 50,
  subjects: initialSubjects = EMPTY_SUBJECTS,
  cataloguePromise,
  userSubjects,
  preferredSubjectId,
  timeZone,
  formError: initialFormError = null,
  historyError = null,
  children,
}: LogsWorkspaceProps) {
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

  const [prevCataloguePromise, setPrevCataloguePromise] = useState(cataloguePromise)
  const [prevInitialSubjects, setPrevInitialSubjects] = useState(initialSubjects)
  const [formCatalogue, setFormCatalogue] = useState<PracticeFormSubjectOption[]>(initialSubjects)
  const [formCatalogueLoading, setFormCatalogueLoading] = useState<boolean>(
    Boolean(cataloguePromise)
  )
  const [catalogueError, setCatalogueError] = useState<string | null>(initialFormError)
  const activeRequestIdRef = useRef(0)

  // Adjust loading state immediately during render when a replacement request arrives
  if (cataloguePromise !== prevCataloguePromise) {
    setPrevCataloguePromise(cataloguePromise)
    if (cataloguePromise) {
      setFormCatalogueLoading(true)
      setCatalogueError(null)
    } else {
      setFormCatalogueLoading(false)
    }
  } else if (!cataloguePromise && initialSubjects !== prevInitialSubjects) {
    setPrevInitialSubjects(initialSubjects)
    setFormCatalogue(initialSubjects)
    setFormCatalogueLoading(false)
  }

  useEffect(() => {
    if (!cataloguePromise) return
    const currentRequestId = ++activeRequestIdRef.current
    let active = true

    new Promise<PracticeFormSubjectOption[] | null>((resolve, reject) => {
      cataloguePromise.then(resolve, reject)
    })
      .then(res => {
        // Ignore if component unmounted or request superseded
        if (!active || currentRequestId !== activeRequestIdRef.current) return
        if (res === null) {
          setCatalogueError('Could not load practice subjects. Please refresh to retry.')
          setFormCatalogue([])
        } else if (res.length === 0) {
          setFormCatalogue([])
          setCatalogueError(null)
        } else {
          setFormCatalogue(res)
          setCatalogueError(null)
        }
        setFormCatalogueLoading(false)
      })
      .catch(() => {
        // Ignore if component unmounted or request superseded
        if (!active || currentRequestId !== activeRequestIdRef.current) return
        setCatalogueError('Could not load practice subjects. Please refresh to retry.')
        setFormCatalogue([])
        setFormCatalogueLoading(false)
      })

    return () => {
      active = false
    }
  }, [cataloguePromise])

  const subjects = formCatalogue
  const formError = catalogueError

  const sessionCount = totalSessions ?? sessions.length
  const totalPages = Math.max(1, Math.ceil(sessionCount / pageSize))

  // Compute question practice metrics directly from current page sessions
  const pageRaw = sessions.reduce((sum, s) => sum + s.total_score_raw, 0)
  const pageMax = sessions.reduce((sum, s) => sum + s.total_score_max, 0)
  const eligibleRaw = sessions.reduce((sum, s) => sum + s.eligible_score_raw, 0)
  const eligibleMax = sessions.reduce((sum, s) => sum + s.eligible_score_max, 0)

  const pagePct = pageMax > 0 ? (pageRaw / pageMax) * 100 : null
  const eligiblePct = eligibleMax > 0 ? (eligibleRaw / eligibleMax) * 100 : null

  function getPageUrl(targetPage: number) {
    const params = new URLSearchParams()
    if (preferredSubjectId) params.set('subject', preferredSubjectId)
    if (targetPage > 1) params.set('page', String(targetPage))
    const query = params.toString()
    return `/logs${query ? `?${query}` : ''}`
  }

  const subjectNames = new Map((userSubjects ?? subjects).map(subject => [subject.id, subject.name]))

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % attemptTabs.length
        : event.key === 'ArrowLeft'
        ? (index + attemptTabs.length - 1) % attemptTabs.length
        : event.key === 'Home'
        ? 0
        : event.key === 'End'
        ? attemptTabs.length - 1
        : null
    if (next === null) return
    event.preventDefault()
    setAttemptType(attemptTabs[next].id)
    tabRefs.current[next]?.focus()
  }

  function confirmDelete() {
    if (!deleteTarget || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError('')
    startTransition(async () => {
      try {
        const result = await deletePracticeSession({ sessionId: deleteTarget.id })
        if (result.error) {
          setDeleteError(result.error)
          requestAnimationFrame(() => deleteErrorRef.current?.focus())
        } else {
          setDeleteTarget(null)
          router.refresh()
        }
      } catch {
        setDeleteError('Could not delete the session. Please retry.')
        requestAnimationFrame(() => deleteErrorRef.current?.focus())
      } finally {
        setDeleteBusy(false)
      }
    })
  }

  return (
    <>
      <div className="past-papers-attempt-tabs" role="tablist" aria-label="Log and review attempts">
        {attemptTabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={element => {
              tabRefs.current[index] = element
            }}
            id={`${tabsId}-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={attemptType === tab.id}
            aria-controls={`${tabsId}-${tab.id}-panel`}
            tabIndex={attemptType === tab.id ? 0 : -1}
            className={`btn ${attemptType === tab.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setAttemptType(tab.id)}
            onKeyDown={event => navigateTabs(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        role="tabpanel"
        id={`${tabsId}-full_paper-panel`}
        aria-labelledby={`${tabsId}-full_paper-tab`}
        tabIndex={0}
        hidden={attemptType !== 'full_paper'}
        className="past-papers-attempt-panel"
      >
        {attemptType === 'full_paper' && (
          <>
            <div className="practice-workspace-heading">
              <div>
                <h2 className="text-heading-2" style={{ margin: 0 }}>
                  Full papers
                </h2>
                <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  Record complete papers and review your results.
                </p>
              </div>
              <LogPaperButton timeZone={timeZone} />
            </div>
            {children}
          </>
        )}
      </section>

      <section
        role="tabpanel"
        id={`${tabsId}-practice-panel`}
        aria-labelledby={`${tabsId}-practice-tab`}
        tabIndex={0}
        hidden={attemptType !== 'practice'}
        className="past-papers-attempt-panel"
      >
        {attemptType === 'practice' && (
          <>
            <div className="practice-workspace-heading">
              <div>
                <h2 className="text-heading-2" style={{ margin: 0 }}>
                  Question practice
                </h2>
                <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  Separate from full-paper results and paper achievements.
                </p>
              </div>
              <button
                className="btn btn-primary"
                type="button"
                disabled={formCatalogueLoading || subjects.length === 0}
                aria-busy={formCatalogueLoading ? 'true' : undefined}
                title={formCatalogueLoading ? 'Updating available subjects…' : undefined}
                onClick={() => setCreateOpen(true)}
              >
                + Log Questions
              </button>
            </div>

            {formError && (
              <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
                {formError}
              </p>
            )}

            {!formError && !formCatalogueLoading && subjects.length === 0 && (
              <p role="status">
                Confirm a study route for an active subject before logging questions.
              </p>
            )}

            <div className="practice-metrics" aria-label="Question practice summary">
              <div className="card">
                <span>Total sessions</span>
                <strong>{sessionCount}</strong>
              </div>
              <div className="card">
                <span>Page accuracy</span>
                <strong>{formatPercent(pagePct)}</strong>
                <small>
                  {pageRaw}/{pageMax} marks on this page
                </small>
              </div>
              <div className="card">
                <span>Page route evidence</span>
                <strong>{formatPercent(eligiblePct)}</strong>
                <small>
                  {eligibleRaw}/{eligibleMax} eligible marks on this page
                </small>
              </div>
            </div>

            <section aria-labelledby="practice-history-title" style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <h2 id="practice-history-title" className="text-heading-3" style={{ margin: 0 }}>
                Question-practice history
              </h2>

              {historyError && (
                <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
                  {historyError}
                </p>
              )}

              {!historyError && sessions.length === 0 ? (
                <p className="card" role="status" style={{ padding: 'var(--space-5)', color: 'var(--text-muted)' }}>
                  No question sessions yet. Use Log Questions to record a topical, past-year, or mixed group.
                </p>
              ) : (
                sessions.map(session => {
                  const canEdit = subjects.some(subject => subject.id === session.subject_id)
                  const partial = session.eligible_score_max > 0 && session.eligible_score_max < session.total_score_max

                  return (
                    <article key={session.id} className="card practice-history-card">
                      <div className="practice-history-top">
                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ margin: 0, overflowWrap: 'anywhere' }}>
                            {session.title || `${session.items.length} question${session.items.length === 1 ? '' : 's'}`}
                          </h3>
                          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
                            {subjectNames.get(session.subject_id) ?? 'Archived subject'} · {session.stage.toUpperCase()} ·{' '}
                            {formatDate(session.session_date)} · {session.items.length} items
                          </p>
                        </div>
                        <strong>
                          {session.total_score_raw}/{session.total_score_max} · {Number(session.accuracy_pct).toFixed(1)}%
                        </strong>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          color: session.eligible_score_max ? 'var(--text-secondary)' : 'var(--text-muted)',
                        }}
                      >
                        {partial
                          ? `Partial current-route evidence: ${session.eligible_score_raw}/${session.eligible_score_max} eligible marks; ${session.total_score_raw}/${session.total_score_max} remains lifetime history.`
                          : session.eligible_score_max
                          ? `Current-route evidence: ${session.eligible_score_raw}/${session.eligible_score_max} marks.`
                          : 'Historical/off-route: 0 marks currently eligible for readiness.'}
                      </p>
                      <details>
                        <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
                          View question details and sources
                        </summary>
                        <ol className="practice-item-list">
                          {session.items.map(item => (
                            <li key={item.id}>
                              <strong>{item.question_label ? `Question ${item.question_label}` : `Question ${item.item_order}`}</strong> ·{' '}
                              {item.marks_obtained}/{item.marks_available} marks ·{' '}
                              {item.provenance_mode === 'inherit'
                                ? 'shared source'
                                : item.provenance_mode === 'override'
                                ? 'own source'
                                : 'topical/source-only'}
                              {item.paper_number ? ` · Paper ${item.paper_number}` : ''}
                              {item.exam_year ? ` · ${item.exam_year}` : ''}
                              {item.exam_series ? ` · ${item.exam_series.replace('_', '/')}` : ''}
                              {item.exam_variant ? ` · variant ${item.exam_variant}` : ''}
                              {item.source_label ? ` · ${item.source_label}` : ''}
                              <br />
                              <span style={{ color: 'var(--text-muted)' }}>
                                {item.eligible_for_readiness
                                  ? 'Currently eligible'
                                  : `Historical/off-route (${item.eligibility_reason.replaceAll('_', ' ')})`} ·{' '}
                                {item.chapter_ids.length} mapped chapters
                              </span>
                            </li>
                          ))}
                        </ol>
                        {session.notes && <p>Notes: {session.notes}</p>}
                      </details>
                      <div className="practice-history-actions">
                        <button
                          className="btn btn-ghost"
                          type="button"
                          disabled={formCatalogueLoading || !canEdit}
                          aria-busy={formCatalogueLoading ? 'true' : undefined}
                          title={
                            formCatalogueLoading
                              ? 'Updating available subjects…'
                              : !canEdit
                              ? 'Archived or unconfirmed subject cannot be edited'
                              : undefined
                          }
                          onClick={() => setEditSession(session)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => {
                            setDeleteTarget(session)
                            setDeleteError('')
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  )
                })
              )}
              {totalPages > 1 && (
                <nav
                  aria-label="Question practice pagination"
                  className="practice-pagination"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-3)',
                    marginTop: 'var(--space-4)',
                  }}
                >
                  {currentPage > 1 ? (
                    <Link
                      href={getPageUrl(currentPage - 1)}
                      className="btn btn-ghost"
                    >
                      ← Previous
                    </Link>
                  ) : (
                    <span
                      className="btn btn-ghost"
                      style={{ opacity: 0.5, pointerEvents: 'none' }}
                      aria-disabled="true"
                    >
                      ← Previous
                    </span>
                  )}
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Page {currentPage} of {totalPages} ({sessionCount} {sessionCount === 1 ? 'session' : 'sessions'})
                  </span>
                  {currentPage < totalPages ? (
                    <Link
                      href={getPageUrl(currentPage + 1)}
                      className="btn btn-ghost"
                    >
                      Next →
                    </Link>
                  ) : (
                    <span
                      className="btn btn-ghost"
                      style={{ opacity: 0.5, pointerEvents: 'none' }}
                      aria-disabled="true"
                    >
                      Next →
                    </span>
                  )}
                </nav>
              )}
            </section>
          </>
        )}
      </section>

      {(createOpen || editSession) && (
        <LogQuestionsModal
          subjects={subjects}
          catalogueLoading={formCatalogueLoading}
          catalogueError={formError}
          timeZone={timeZone}
          preferredSubjectId={preferredSubjectId}
          existing={editSession ?? undefined}
          onClose={() => {
            setCreateOpen(false)
            setEditSession(null)
          }}
          onSuccess={() => {
            setCreateOpen(false)
            setEditSession(null)
            router.refresh()
          }}
        />
      )}

      {deleteTarget && (
        <Dialog
          isOpen
          onClose={() => {
            if (!deleteBusy) setDeleteTarget(null)
          }}
          titleId="practice-delete-title"
          maxWidth={440}
          showCloseButton
        >
          <div style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}>
            <h2 id="practice-delete-title" className="text-heading-2" style={{ margin: 0 }}>
              Delete question session?
            </h2>
            <p style={{ margin: 0 }}>
              This removes the whole session, its {deleteTarget.items.length} questions, and chapter mappings. Full-paper
              records are unaffected.
            </p>
            {deleteError && (
              <p ref={deleteErrorRef} tabIndex={-1} role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
                {deleteError}
              </p>
            )}
            <div className="practice-modal-actions">
              <button className="btn btn-ghost" type="button" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" type="button" disabled={deleteBusy} onClick={confirmDelete}>
                {deleteBusy ? 'Deleting…' : 'Delete session'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}
