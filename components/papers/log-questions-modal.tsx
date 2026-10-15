'use client'

import { startTransition, useRef, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { createPracticeSession, updatePracticeSession } from '@/lib/actions/practice-sessions'
import { eligiblePracticeChapterIds } from '@/lib/practice-analytics'
import {
  blankPracticeDraft, blankPracticeItem, blankProvenance, draftFromPracticeSession, toPracticeWriteInput,
  type PracticeDraft, type PracticeItemDraft, type ProvenanceDraft,
} from '@/lib/practice-ui'
import { PracticeCreateSchema, PracticeUpdateSchema } from '@/lib/validations/practice-sessions'
import type { PracticeFormSubjectOption, PracticeSessionRead } from '@/types/practice-sessions'

type Props = {
  subjects: PracticeFormSubjectOption[]
  timeZone: string
  preferredSubjectId?: string | null
  existing?: PracticeSessionRead
  onClose: () => void
  onSuccess: () => void
}

function ProvenanceFields({ value, onChange, subject, stage, prefix }: {
  value: ProvenanceDraft
  onChange: (next: ProvenanceDraft) => void
  subject: PracticeFormSubjectOption | undefined
  stage: 'as' | 'a2'
  prefix: string
}) {
  const papers = subject?.context.papers ?? []
  const selected = new Set(subject?.context.selections.filter(row => row.stage === stage).map(row => row.subjectPaperId) ?? [])
  return (
    <div className="practice-form-grid">
      <label className="practice-field">Known paper component
        <select className="input" value={value.subjectPaperId} onChange={event => onChange({ ...value, subjectPaperId: event.target.value })} aria-label={`${prefix} paper component`}>
          <option value="">Not known / topical</option>
          {papers.map(paper => <option key={paper.id} value={paper.id}>Paper {paper.paperNumber} · {paper.name ?? 'Component'}{selected.has(paper.id) ? ' · current route' : ' · historical/off-route'}</option>)}
        </select>
      </label>
      <label className="practice-field">Source label
        <input className="input" value={value.sourceLabel} maxLength={120} placeholder="e.g. textbook exercise" onChange={event => onChange({ ...value, sourceLabel: event.target.value })} aria-label={`${prefix} source label`} />
      </label>
      <label className="practice-field">Exam year, if known
        <input className="input" type="number" min={1990} max={2100} value={value.examYear} onChange={event => onChange({ ...value, examYear: event.target.value })} aria-label={`${prefix} exam year`} />
      </label>
      <label className="practice-field">Exam series, if known
        <select className="input" value={value.examSeries} onChange={event => onChange({ ...value, examSeries: event.target.value as ProvenanceDraft['examSeries'] })} aria-label={`${prefix} exam series`}>
          <option value="">Not known</option><option value="feb_mar">Feb/Mar</option><option value="may_jun">May/Jun</option><option value="oct_nov">Oct/Nov</option>
        </select>
      </label>
      <label className="practice-field">Variant, if known
        <input className="input" type="number" min={1} max={9} value={value.examVariant} onChange={event => onChange({ ...value, examVariant: event.target.value })} aria-label={`${prefix} variant`} />
      </label>
    </div>
  )
}

export function LogQuestionsModal({ subjects, timeZone, preferredSubjectId, existing, onClose, onSuccess }: Props) {
  const initialSubject = subjects.find(subject => subject.id === (existing?.subject_id ?? preferredSubjectId)) ?? subjects[0]
  const [draft, setDraft] = useState<PracticeDraft>(() => existing ? draftFromPracticeSession(existing) : blankPracticeDraft(initialSubject?.id ?? '', timeZone))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)
  const subject = subjects.find(option => option.id === draft.subjectId)
  const a2Open = subject?.context.enrollment?.currentStage === 'a2' || subject?.context.enrollment?.currentStage === 'full'
  const localToday = blankPracticeDraft('', timeZone).sessionDate
  const nextKey = useRef(draft.items.length + 1)

  const updateItem = (key: string, change: Partial<PracticeItemDraft>) => setDraft(current => ({
    ...current, items: current.items.map(item => item.key === key ? { ...item, ...change } : item),
  }))
  const updateParent = (value: ProvenanceDraft) => setDraft(current => ({
    ...current, provenance: value,
    items: current.provenance.subjectPaperId === value.subjectPaperId ? current.items :
      current.items.map(item => item.provenanceMode === 'inherit' ? { ...item, chapterIds: [] } : item),
  }))

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const input = toPracticeWriteInput(draft, existing?.id)
    const parsed = existing ? PracticeUpdateSchema.safeParse(input) : PracticeCreateSchema.safeParse(input)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form fields.')
      requestAnimationFrame(() => errorRef.current?.focus())
      return
    }
    setBusy(true); setError('')
    startTransition(async () => {
      try {
        const result = existing ? await updatePracticeSession(input) : await createPracticeSession(input)
        if (result.error) {
          setError(result.error)
          requestAnimationFrame(() => errorRef.current?.focus())
        } else onSuccess()
      } catch {
        setError('The session could not be saved. Please retry; your entries are still here.')
        requestAnimationFrame(() => errorRef.current?.focus())
      } finally { setBusy(false) }
    })
  }

  return (
    <Dialog isOpen onClose={() => { if (!busy) onClose() }} titleId="practice-dialog-title" descriptionId="practice-dialog-description" maxWidth={780} showCloseButton>
      <form onSubmit={submit} style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)', minWidth: 0 }}>
        <div>
          <h2 id="practice-dialog-title" className="text-heading-2" style={{ margin: 0 }}>{existing ? 'Edit question practice' : 'Log Questions'}</h2>
          <p id="practice-dialog-description" style={{ color: 'var(--text-muted)', marginBottom: 0 }}>Record one question or a group. Unknown paper details can stay blank. This is separate from full-paper results.</p>
        </div>
        {error && <p ref={errorRef} tabIndex={-1} role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
        <div className="practice-form-grid">
          <label className="practice-field">Subject
            <select className="input" required value={draft.subjectId} disabled={!!existing || busy} onChange={event => setDraft(current => ({ ...current, subjectId: event.target.value, stage: 'as', provenance: blankProvenance(), items: current.items.map(item => ({ ...item, chapterIds: [], provenance: blankProvenance() })) }))}>
              {subjects.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          <label className="practice-field">Actual stage
            <select className="input" value={draft.stage} disabled={!!existing || busy} onChange={event => setDraft(current => ({ ...current, stage: event.target.value as 'as' | 'a2', provenance: blankProvenance(), items: current.items.map(item => ({ ...item, chapterIds: [], provenance: blankProvenance() })) }))}>
              <option value="as">AS</option>{a2Open && <option value="a2">A2</option>}
            </select>
          </label>
          <label className="practice-field">Attempt date
            <input className="input" type="date" required min="1990-01-01" max={localToday} value={draft.sessionDate} onChange={event => setDraft(current => ({ ...current, sessionDate: event.target.value }))} />
          </label>
          <label className="practice-field">Session title (optional)
            <input className="input" maxLength={100} value={draft.title} placeholder="e.g. Mechanics revision" onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} />
          </label>
          <label className="practice-field">Duration in minutes (optional)
            <input className="input" type="number" min={1} max={1440} value={draft.durationMins} onChange={event => setDraft(current => ({ ...current, durationMins: event.target.value }))} />
          </label>
        </div>
        <details>
          <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Shared source for inherited questions (optional)</summary>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>Only questions set to “Inherit shared source” use these details. Other modes never fill missing fields from here.</p>
          <ProvenanceFields value={draft.provenance} onChange={updateParent} subject={subject} stage={draft.stage} prefix="Shared" />
        </details>
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {draft.items.map((item, index) => {
            const paperId = item.provenanceMode === 'inherit' ? draft.provenance.subjectPaperId : item.provenanceMode === 'override' ? item.provenance.subjectPaperId : ''
            const allowed = new Set(subject ? eligiblePracticeChapterIds(subject.context, draft.stage, paperId || null) : [])
            const recordedChapterIds = existing?.items.find(recorded => recorded.id === item.key)?.chapter_ids ?? []
            const chapters = subject?.context.chapters.filter(chapter => allowed.has(chapter.id) || item.chapterIds.includes(chapter.id) || recordedChapterIds.includes(chapter.id)) ?? []
            return <fieldset key={item.key} className="card" style={{ border: '1px solid var(--border-subtle)', padding: 'var(--space-4)', minWidth: 0, display: 'grid', gap: 'var(--space-3)' }}>
              <legend style={{ fontWeight: 700 }}>Question {index + 1}</legend>
              <div className="practice-form-grid">
                <label className="practice-field">Marks obtained
                  <input className="input" type="number" required min={0} max={1000} step={1} value={item.marksObtained} onChange={event => updateItem(item.key, { marksObtained: event.target.value })} />
                </label>
                <label className="practice-field">Marks available
                  <input className="input" type="number" required min={1} max={1000} step={1} value={item.marksAvailable} onChange={event => updateItem(item.key, { marksAvailable: event.target.value })} />
                </label>
                <label className="practice-field">Question label (optional)
                  <input className="input" maxLength={50} value={item.questionLabel} placeholder="e.g. 2(a)" onChange={event => updateItem(item.key, { questionLabel: event.target.value })} />
                </label>
                <label className="practice-field">Source mode
                  <select className="input" value={item.provenanceMode} onChange={event => updateItem(item.key, { provenanceMode: event.target.value as PracticeItemDraft['provenanceMode'], chapterIds: [] })}>
                    <option value="none">Topical / source label only</option>
                    <option value="inherit">Inherit shared source</option>
                    <option value="override">Own source (past-paper or mixed)</option>
                  </select>
                </label>
              </div>
              {item.provenanceMode === 'override' && <ProvenanceFields value={item.provenance} onChange={value => updateItem(item.key, { provenance: value, chapterIds: value.subjectPaperId === item.provenance.subjectPaperId ? item.chapterIds : [] })} subject={subject} stage={draft.stage} prefix={`Question ${index + 1}`} />}
              {item.provenanceMode === 'none' && <label className="practice-field">Source label (optional)
                <input className="input" maxLength={120} value={item.provenance.sourceLabel} placeholder="e.g. topical worksheet" onChange={event => updateItem(item.key, { provenance: { ...item.provenance, sourceLabel: event.target.value } })} />
              </label>}
              {item.provenanceMode === 'inherit' && <p style={{ color: 'var(--text-muted)', margin: 0 }}>Uses the shared source above; it must contain at least one known detail.</p>}
              <details>
                <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Chapter mappings (optional) · {item.chapterIds.length} selected</summary>
                {item.chapterIds.some(id => !allowed.has(id)) && <p style={{ color: 'var(--text-muted)' }}>Deselect chapters that are no longer eligible before saving. They cannot be selected again for this stage and source.</p>}
                {chapters.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No accessible chapters for this stage and source.</p> :
                  <div className="practice-chapter-options">{chapters.map(chapter => <label key={chapter.id} className="practice-chapter-option">
                    <input type="checkbox" checked={item.chapterIds.includes(chapter.id)} disabled={!allowed.has(chapter.id) && !item.chapterIds.includes(chapter.id)} onChange={event => {
                      if (event.target.checked && !allowed.has(chapter.id)) return
                      updateItem(item.key, { chapterIds: event.target.checked ? [...item.chapterIds, chapter.id] : item.chapterIds.filter(id => id !== chapter.id) })
                    }} />
                    <span>{chapter.title ?? chapter.component ?? 'Chapter'}{!allowed.has(chapter.id) ? ' · no longer eligible' : ''}</span>
                  </label>)}</div>}
              </details>
              <label className="practice-field">Question notes (optional)
                <textarea className="input practice-textarea" maxLength={1000} value={item.notes} onChange={event => updateItem(item.key, { notes: event.target.value })} />
              </label>
              {draft.items.length > 1 && <button className="btn btn-ghost" type="button" onClick={() => setDraft(current => ({ ...current, items: current.items.filter(other => other.key !== item.key) }))}>Remove question {index + 1}</button>}
            </fieldset>
          })}
          <button className="btn btn-ghost" type="button" disabled={draft.items.length >= 200} onClick={() => { const key = `item-${nextKey.current++}`; setDraft(current => ({ ...current, items: [...current.items, blankPracticeItem(key)] })) }}>+ Add question</button>
        </div>
        <label className="practice-field">Session notes (optional)
          <textarea className="input practice-textarea" maxLength={2000} value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} />
        </label>
        <div className="practice-modal-actions">
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={busy || !subject}>{busy ? 'Saving…' : existing ? 'Save changes' : 'Log questions'}</button>
        </div>
      </form>
    </Dialog>
  )
}
