'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { logPaper, updatePaper, LogPaperInput, QuestionInput } from '@/lib/actions/papers'
import { dateInTimeZone } from '@/lib/date'

// ── CAIE paper number → component name(s) ─────────────────────────────────
// Maps subject code → paper number → component names in chapters table.
// Papers not listed here (e.g. practicals) show ALL chapters.
const PAPER_COMPONENT_MAP: Record<string, Record<number, string[]>> = {
  '9709': { // Mathematics
    1: ['Pure 1'],
    2: ['Pure 2'],
    3: ['Pure 3'],
    4: ['Mechanics'],
    5: ['Statistics 1'],
    6: ['Statistics 2'],
  },
  '9702': { // Physics
    1: ['AS Core'],
    2: ['AS Core'],
    4: ['A2 Core'],
    5: ['A2 Core'],
  },
  '9701': { // Chemistry
    1: ['AS Physical', 'AS Inorganic', 'AS Organic'],
    2: ['AS Physical', 'AS Inorganic', 'AS Organic'],
    4: ['A2 Physical', 'A2 Inorganic', 'A2 Organic'],
  },
  '9700': { // Biology
    1: ['AS'],
    2: ['AS'],
    4: ['A2'],
    5: ['A2'],
  },
}

// ── Future paper prevention ────────────────────────────────────────────────
// CAIE results release schedule (conservative — papers must be sat first):
//   Feb/Mar → sat Mar, available from month >= 3
//   May/Jun → sat Jun, available from month >= 6
//   Oct/Nov → sat Nov, available from month >= 10
function getAvailableSessions(
  year: number,
  currentYear: number,
  currentMonth: number
): ('feb_mar' | 'may_jun' | 'oct_nov')[] {
  if (year < currentYear) return ['feb_mar', 'may_jun', 'oct_nov']
  if (year > currentYear) return []
  const sessions: ('feb_mar' | 'may_jun' | 'oct_nov')[] = []
  if (currentMonth >= 3)  sessions.push('feb_mar')
  if (currentMonth >= 6)  sessions.push('may_jun')
  if (currentMonth >= 10) sessions.push('oct_nov')
  return sessions
}

const SESSION_LABELS: Record<string, string> = {
  feb_mar: 'Feb/Mar',
  may_jun: 'May/Jun',
  oct_nov: 'Oct/Nov',
}

// ── Trigger button ─────────────────────────────────────────────────────────
export function LogPaperButton({
  onSuccess,
  timeZone,
}: {
  onSuccess?: () => void
  timeZone: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <button className="btn btn-primary" onClick={() => setIsOpen(true)}>+ Log Paper</button>
      <AnimatePresence>
        {isOpen && (
          <LogPaperModal
            timeZone={timeZone}
            onSuccess={() => { setIsOpen(false); onSuccess?.() }}
            onClose={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────────
export function LogPaperModal({
  onSuccess,
  onClose,
  existingPaperId,
  existingPaper,
  timeZone,
}: {
  onSuccess?: () => void
  onClose: () => void
  existingPaperId?: string
  timeZone: string
  existingPaper?: {
    subjectId: string
    year: number
    session: 'feb_mar' | 'may_jun' | 'oct_nov'
    paperNumber: number
    variant: number
    attemptedAt: string
    timeTakenMins?: number
    notes?: string
  }
}) {
  const isEditing = !!existingPaperId
  const supabase = createClient()
  const localToday = dateInTimeZone(new Date(), timeZone)
  const currentYear = Number(localToday.slice(0, 4))
  const currentMonth = Number(localToday.slice(5, 7))

  const [step, setStep]             = useState<1 | 2 | 3>(1)
  const [loading, setLoading]       = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [subjects, setSubjects]     = useState<any[]>([])
  const [chapters, setChapters]     = useState<any[]>([])

  const initialSession: 'feb_mar' | 'may_jun' | 'oct_nov' = existingPaper?.session ?? (() => {
    const avail = getAvailableSessions(currentYear, currentYear, currentMonth)
    return avail[avail.length - 1] ?? 'may_jun'
  })()

  const [subjectId,   setSubjectId]   = useState(existingPaper?.subjectId   ?? '')
  const [paperNumber, setPaperNumber] = useState(existingPaper?.paperNumber  ?? 1)
  const [variant,     setVariant]     = useState(existingPaper?.variant      ?? 1)
  const [year,        setYear]        = useState(existingPaper?.year         ?? currentYear)
  const [session,     setSession]     = useState<'feb_mar' | 'may_jun' | 'oct_nov'>(initialSession)
  const [attemptedAt, setAttemptedAt] = useState(existingPaper?.attemptedAt ?? localToday)
  const [timeTaken,   setTimeTaken]   = useState(existingPaper?.timeTakenMins ? String(existingPaper.timeTakenMins) : '')
  const [notes,       setNotes]       = useState(existingPaper?.notes ?? '')
  const [questions,       setQuestions]       = useState<QuestionInput[]>(
    isEditing ? [] : [{ questionNumber: '1', chapterId: null, marksObtained: 0, marksAvailable: 1 }]
  )
  const [questionsLoading, setQuestionsLoading] = useState(isEditing)

  // Fetch enrolled subjects on mount
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('user_subjects')
        .select('subjects(id, name, code, color_hex)')
        .eq('user_id', user.id)
      if (data) {
        const subs = data.map((d: any) => d.subjects).filter(Boolean)
        setSubjects(subs)
        // Only auto-select if not in edit mode (edit mode has pre-filled subjectId)
        if (!isEditing && subs.length > 0) setSubjectId(subs[0].id)
      }
    }
    load()
  }, [])

  // In edit mode, load existing questions
  useEffect(() => {
    if (!isEditing || !existingPaperId) return
    async function loadQuestions() {
      const { data } = await supabase
        .from('paper_question_attempts')
        .select('id, question_number, chapter_id, marks_obtained, marks_available')
        .eq('paper_id', existingPaperId)
        .order('question_number')
      if (data && data.length > 0) {
        setQuestions(data.map((q: any) => ({
          questionNumber: q.question_number,
          chapterId: q.chapter_id,
          marksObtained: q.marks_obtained,
          marksAvailable: q.marks_available,
        })))
      }
      setQuestionsLoading(false)
    }
    loadQuestions()
  }, [existingPaperId, isEditing])

  // Fetch chapters when subject changes
  useEffect(() => {
    if (!subjectId) return
    async function load() {
      const { data } = await supabase
        .from('chapters')
        .select('id, title, component, number')
        .eq('subject_id', subjectId)
        .order('component', { ascending: true, nullsFirst: false })
        .order('number',    { ascending: true })
      if (data) setChapters(data)
    }
    load()
  }, [subjectId])

  // Filter chapters by CAIE paper→component mapping
  const activeSubject = subjects.find(s => s.id === subjectId)
  const filteredChapters = useMemo(() => {
    if (!activeSubject?.code) return chapters
    const mapping = PAPER_COMPONENT_MAP[activeSubject.code]
    if (!mapping) return chapters
    const components = mapping[paperNumber]
    if (!components) return chapters // practical / unmapped paper — show all
    return chapters.filter(c => c.component && components.includes(c.component))
  }, [chapters, activeSubject, paperNumber])

  // Session availability based on year
  const availableSessions = useMemo(
    () => getAvailableSessions(year, currentYear, currentMonth),
    [year, currentYear, currentMonth]
  )

  // Auto-correct session when year changes to a year that doesn't support current session
  useEffect(() => {
    if (!availableSessions.includes(session)) {
      const last = availableSessions[availableSessions.length - 1]
      if (last) setSession(last)
    }
  }, [availableSessions])

  const previewCode = activeSubject
    ? `${activeSubject.code}/${paperNumber}${variant}/${SESSION_LABELS[session]}/${year.toString().slice(-2)}`
    : ''

  // Marks update with validation
  const updateQuestion = (index: number, field: keyof QuestionInput, raw: any) => {
    const updated = [...questions]
    if (field === 'marksAvailable' || field === 'marksObtained') {
      let val = parseInt(String(raw))
      if (isNaN(val) || val < 0) val = 0
      if (field === 'marksAvailable' && val < 1) val = 1
      if (field === 'marksObtained' && val > updated[index].marksAvailable) {
        val = updated[index].marksAvailable
      }
      updated[index] = { ...updated[index], [field]: val }
    } else {
      updated[index] = { ...updated[index], [field]: raw }
    }
    setQuestions(updated)
  }

  const addQuestion = () => {
    const last = questions[questions.length - 1]
    const nextNum = last && !isNaN(Number(last.questionNumber))
      ? String(Number(last.questionNumber) + 1)
      : ''
    setQuestions([...questions, { questionNumber: nextNum, chapterId: null, marksObtained: 0, marksAvailable: 1 }])
  }

  const removeQuestion = (i: number) => setQuestions(questions.filter((_, idx) => idx !== i))

  const totalObtained  = questions.reduce((s, q) => s + (q.marksObtained  || 0), 0)
  const totalAvailable = questions.reduce((s, q) => s + (q.marksAvailable || 0), 0)
  const pct = totalAvailable > 0 ? ((totalObtained / totalAvailable) * 100).toFixed(1) : '0'

  const step1Valid = !!(subjectId && year && attemptedAt && availableSessions.includes(session))

  const handleSubmit = async () => {
    setSubmitError('')
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q.questionNumber.trim()) { setSubmitError(`Q${i + 1}: question number is required`); return }
      if (q.marksAvailable < 1)    { setSubmitError(`Q${i + 1}: max marks must be at least 1`); return }
      if (q.marksObtained < 0)     { setSubmitError(`Q${i + 1}: marks cannot be negative`); return }
      if (q.marksObtained > q.marksAvailable) { setSubmitError(`Q${i + 1}: marks obtained exceeds max marks`); return }
    }
    setLoading(true)
    const input: LogPaperInput = {
      subjectId, year, session, paperNumber, variant, attemptedAt,
      timeTakenMins: timeTaken ? parseInt(timeTaken) : undefined,
      notes: notes || undefined,
      questions,
    }
    const { error } = isEditing && existingPaperId
      ? await updatePaper(existingPaperId, input)
      : await logPaper(input)
    setLoading(false)
    if (error) { setSubmitError(error); return }
    setStep(3)
    setTimeout(() => onSuccess?.(), 1500)
  }

  const accentColor = Number(pct) >= 80 ? 'var(--success)' : Number(pct) >= 60 ? 'var(--warning)' : 'var(--danger)'
  const componentHint = activeSubject && PAPER_COMPONENT_MAP[activeSubject.code]?.[paperNumber]
    ? PAPER_COMPONENT_MAP[activeSubject.code][paperNumber].join(' + ')
    : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }} onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass-strong"
        style={{ position: 'relative', width: '100%', maxWidth: 620, maxHeight: '92vh', overflowY: 'auto', padding: 'var(--space-6)', borderRadius: 'var(--radius-xl)' }}
      >
        {/* Close button */}
        <button onClick={onClose} className="btn btn-ghost"
          style={{ position: 'absolute', top: 12, right: 12, width: 36, height: 36, padding: 0 }}>
          <X size={18} />
        </button>

        {/* ── Step 1: Paper info ─────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700 }}>
                {isEditing ? 'Edit Paper' : 'Log Past Paper'}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Step 1 of 2 — Paper details</p>
            </div>

            {/* Subject */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Subject</label>
              <select className="input" value={subjectId} onChange={e => setSubjectId(e.target.value)} style={{ width: '100%' }}>
                {subjects.length === 0 && <option>Loading…</option>}
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </div>

            {/* Paper / Variant / Year */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Paper</label>
                <select className="input" value={paperNumber} onChange={e => setPaperNumber(parseInt(e.target.value))} style={{ width: '100%' }}>
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>Paper {n}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Variant</label>
                <select className="input" value={variant} onChange={e => setVariant(parseInt(e.target.value))} style={{ width: '100%' }}>
                  {[1,2,3].map(n => <option key={n} value={n}>Variant {n}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Year</label>
                <input type="number" className="input" value={year}
                  min={1990} max={currentYear}
                  onChange={e => {
                    const v = Math.min(parseInt(e.target.value) || currentYear, currentYear)
                    setYear(v)
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {/* Session pills */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Session</label>
              <div style={{ display: 'flex', gap: 6, background: 'var(--bg-overlay)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                {(['feb_mar', 'may_jun', 'oct_nov'] as const).map(s => {
                  const avail = availableSessions.includes(s)
                  const active = session === s
                  return (
                    <button key={s} onClick={() => avail && setSession(s)} disabled={!avail}
                      style={{
                        flex: 1, padding: '8px 4px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: avail ? 'pointer' : 'not-allowed',
                        background: active ? 'var(--accent-primary)' : 'transparent',
                        color: active ? '#fff' : avail ? 'var(--text-secondary)' : 'var(--text-disabled)',
                        fontWeight: active ? 600 : 400, fontSize: '0.875rem',
                        opacity: avail ? 1 : 0.4, transition: 'all 150ms ease',
                      }}>
                      {SESSION_LABELS[s]}
                      {!avail && <div style={{ fontSize: '0.6rem', marginTop: 2, opacity: 0.7 }}>Not yet</div>}
                    </button>
                  )
                })}
              </div>
              {availableSessions.length === 0 && (
                <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--danger)' }}>
                  No past papers exist for {year} yet. Choose an earlier year.
                </p>
              )}
            </div>

            {/* Date / Time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Date Attempted</label>
                <input type="date" className="input" value={attemptedAt}
                  max={localToday}
                  onChange={e => setAttemptedAt(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Time Taken (mins)</label>
                <input type="number" className="input" min={1} value={timeTaken}
                  onChange={e => setTimeTaken(e.target.value)} placeholder="Optional" style={{ width: '100%' }} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Notes</label>
              <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Optional — e.g. timed, skipped Q4"
                style={{ width: '100%', minHeight: 68, padding: '10px 14px', resize: 'vertical' }} />
            </div>

            {/* Code preview */}
            <div style={{ background: 'var(--bg-overlay)', padding: '12px 16px', borderRadius: 'var(--radius-md)', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Paper Code Preview</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.375rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                {previewCode || '—'}
              </div>
            </div>

            <button className="btn btn-primary" onClick={() => step1Valid && setStep(2)}
              disabled={!step1Valid || availableSessions.length === 0 || questionsLoading} style={{ width: '100%' }}>
              {questionsLoading ? 'Loading questions…' : 'Next → Add Questions'}
            </button>
          </div>
        )}

        {/* ── Step 2: Questions ──────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700 }}>Questions</h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-secondary)' }}>{previewCode}</span>
                {componentHint && (
                  <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>· chapters: {componentHint}</span>
                )}
              </p>
            </div>

            {/* Running total */}
            <div style={{ background: 'var(--bg-elevated)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                {totalObtained} <span style={{ color: 'var(--text-muted)', fontSize: '1.25rem' }}>/ {totalAvailable}</span>
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: accentColor, marginTop: 4 }}>{pct}%</div>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 64px 12px 64px 36px', gap: 6, padding: '0 2px' }}>
              {['Q#', 'Chapter', 'Got', '', 'Max', ''].map((h, i) => (
                <div key={i} style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
              ))}
            </div>

            {/* Question rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {questions.map((q, i) => {
                const overMax = q.marksObtained > q.marksAvailable
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 64px 12px 64px 36px', gap: 6, alignItems: 'center' }}>
                    <input className="input" placeholder="1a" value={q.questionNumber}
                      onChange={e => updateQuestion(i, 'questionNumber', e.target.value)}
                      style={{ height: 40, padding: '0 6px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }} />

                    <select className="input" value={q.chapterId || ''}
                      onChange={e => updateQuestion(i, 'chapterId', e.target.value || null)}
                      style={{ height: 40, padding: '0 8px', fontSize: '0.8125rem' }}>
                      <option value="">— chapter —</option>
                      {filteredChapters.map(c => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>

                    <input type="number" className="input" min={0} max={q.marksAvailable}
                      value={q.marksObtained === 0 ? '' : q.marksObtained} placeholder="0"
                      onChange={e => updateQuestion(i, 'marksObtained', e.target.value)}
                      style={{ height: 40, padding: '0 6px', textAlign: 'center', borderColor: overMax ? 'var(--danger)' : undefined }} />

                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>/</div>

                    <input type="number" className="input" min={1}
                      value={q.marksAvailable}
                      onChange={e => updateQuestion(i, 'marksAvailable', e.target.value)}
                      style={{ height: 40, padding: '0 6px', textAlign: 'center' }} />

                    <button className="btn btn-ghost" onClick={() => removeQuestion(i)} disabled={questions.length === 1}
                      style={{ height: 36, width: 36, padding: 0, color: 'var(--danger)', opacity: questions.length === 1 ? 0.2 : 1 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>

            <button className="btn btn-ghost" onClick={addQuestion}
              style={{ width: '100%', border: '1px dashed var(--border-strong)', gap: 6 }}>
              <Plus size={16} /> Add Question
            </button>

            {submitError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.875rem' }}>
                <AlertCircle size={15} style={{ flexShrink: 0 }} /> {submitError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button className="btn btn-ghost" onClick={() => { setSubmitError(''); setStep(1) }} style={{ flex: 1 }}>← Back</button>
              <button className="btn btn-primary" onClick={handleSubmit}
                disabled={loading || questions.length === 0} style={{ flex: 2 }}>
                {loading ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Paper'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Success ────────────────────────────────────────────── */}
        {step === 3 && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: 16 }}>
            <CheckCircle2 size={64} color="var(--success)" />
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700 }}>
              {isEditing ? 'Changes Saved!' : 'Paper Logged!'}
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{previewCode}</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
