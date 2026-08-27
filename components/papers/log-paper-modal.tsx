'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { logPaper, updatePaper, LogPaperInput, QuestionInput } from '@/lib/actions/papers'
import { dateInTimeZone } from '@/lib/date'

// ── CAIE paper number → component name(s) ─────────────────────────────────
const PAPER_COMPONENT_MAP: Record<string, Record<number, string[]>> = {
  '9709': { // Mathematics
    1: ['Pure 1'],
    2: ['Pure 2'],
    3: ['Pure 3'],
    4: ['Mechanics'],
    5: ['Statistics 1'],
    6: ['Statistics 2'],
  },
  '9231': { // Further Mathematics
    1: ['Further Pure 1'],
    2: ['Further Pure 2'],
    3: ['Further Mechanics'],
    4: ['Further Probability & Statistics'],
  },
  '9702': { // Physics
    1: ['AS Core'],
    2: ['AS Core'],
    4: ['A2 Core', 'A2 Applied'],
    5: ['A2 Core', 'A2 Applied'],
  },
  '9701': { // Chemistry
    1: ['AS Physical', 'AS Inorganic', 'AS Organic', 'AS Analysis'],
    2: ['AS Physical', 'AS Inorganic', 'AS Organic', 'AS Analysis'],
    4: ['A2 Physical', 'A2 Inorganic', 'A2 Organic', 'A2 Analysis'],
  },
  '9618': { // Computer Science
    1: ['Theory Fundamentals'],
    2: ['Fundamental Problem-solving & Programming'],
    3: ['Advanced Theory'],
    4: ['Further Problem-solving & Programming'],
  },
  '9700': { // Biology
    1: ['AS'],
    2: ['AS'],
    4: ['A2'],
    5: ['A2'],
  },
}

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

const MVP_SUBJECT_CODES = new Set(['9709', '9231', '9702', '9701', '9618'])

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

interface RawSubject {
  id: string
  name: string
  code?: string | null
  color_hex?: string | null
}

interface RawEnrollment {
  id: string
  user_id: string
  subject_id: string
  current_stage?: string | null
  study_route?: string | null
  subjects?: RawSubject | null
}

interface RawChapter {
  id: string
  title: string
  component?: string | null
  number: number
  stage?: string | null
}

interface RawSubjectPaper {
  id: string
  name: string
  paper_number: number
  stage?: 'as' | 'a2'
}

interface RawChapterPaper {
  chapter_id: string
  subject_paper_id: string
}

interface RawPaperSelection {
  subject_paper_id?: string | null
  paper_number: number
  stage?: string | null
  component_name?: string | null
}

export interface ChapterOption {
  id: string
  title?: string
  component?: string | null
  number: number
  stage?: string | null
}

export function matchPaperOption<T extends { id: string; paper_number: number; stage?: 'as' | 'a2' }>(
  papers: T[],
  targetSubjectPaperId?: string | null,
  targetPaperNumber?: number | null
): T | null {
  if (!papers || papers.length === 0) return null
  if (targetSubjectPaperId) {
    const found = papers.find(p => p.id === targetSubjectPaperId)
    if (found) return found
  }
  if (targetPaperNumber != null) {
    const found = papers.find(p => p.paper_number === targetPaperNumber)
    if (found) return found
  }
  return papers[0] ?? null
}

export function filterChaptersForPaper<T extends ChapterOption>(
  subjectCode: string | undefined | null,
  paperNumber: number,
  subjectPaperId: string | null | undefined,
  chapters: T[],
  chapterPapers: { chapter_id: string; subject_paper_id: string }[]
): T[] {
  let list = chapters
  if (!subjectCode) return list

  // Physics 9702 & Chemistry 9701 Practical cross-cutting rules
  if ((subjectCode === '9702' || subjectCode === '9701') && paperNumber === 3) {
    return list.filter(c => c.stage === 'as' || c.stage === 'shared')
  }
  if ((subjectCode === '9702' || subjectCode === '9701') && paperNumber === 5) {
    return list
  }
  // Computer Science 9618 Paper 4: Practical Programming (Topics 19 & 20)
  if (subjectCode === '9618' && paperNumber === 4) {
    return list.filter(c => c.number === 19 || c.number === 20)
  }

  // If chapter_papers mappings exist for the chosen subject_paper_id
  if (subjectPaperId && chapterPapers.length > 0) {
    const allowedChapterIds = new Set(
      chapterPapers
        .filter(cp => cp.subject_paper_id === subjectPaperId)
        .map(cp => cp.chapter_id)
    )
    if (allowedChapterIds.size > 0) {
      return list.filter(c => allowedChapterIds.has(c.id))
    }
  }

  // Fallback: legacy component map
  const mapping = PAPER_COMPONENT_MAP[subjectCode]
  if (mapping && mapping[paperNumber]) {
    const components = mapping[paperNumber]
    list = list.filter(c => c.component && components.includes(c.component))
  }
  return list
}

// ── Modal ──────────────────────────────────────────────────────────────────
export function LogPaperModal({
  onSuccess,
  onClose,
  timeZone,
  existingPaperId,
  existingPaper,
}: {
  onSuccess?: () => void
  onClose: () => void
  timeZone: string
  existingPaperId?: string
  existingPaper?: {
    subjectId: string
    subjectPaperId?: string | null
    year: number
    session: 'feb_mar' | 'may_jun' | 'oct_nov'
    paperNumber: number
    variant: number
    stage?: 'as' | 'a2'
    attemptedAt: string
    timeTakenMins?: number
    notes?: string
  }
}) {
  const isEditing = !!existingPaperId
  const supabase = useMemo(() => createClient(), [])
  const localToday = dateInTimeZone(new Date(), timeZone)
  const currentYear = Number(localToday.slice(0, 4))
  const currentMonth = Number(localToday.slice(5, 7))

  const [step, setStep]               = useState<1 | 2 | 3>(1)
  const [loading, setLoading]         = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [subjects, setSubjects]       = useState<RawSubject[]>([])
  const [enrollments, setEnrollments]     = useState<RawEnrollment[]>([])
  const [chapters, setChapters]           = useState<RawChapter[]>([])
  const [subjectPapers, setSubjectPapers] = useState<RawSubjectPaper[]>([])
  const [chapterPapers, setChapterPapers] = useState<RawChapterPaper[]>([])

  const initialSession: 'feb_mar' | 'may_jun' | 'oct_nov' = existingPaper?.session ?? (() => {
    const avail = getAvailableSessions(currentYear, currentYear, currentMonth)
    return avail[avail.length - 1] ?? 'may_jun'
  })()

  const [subjectId,          setSubjectId]          = useState(existingPaper?.subjectId          ?? '')
  const [subjectPaperId,     setSubjectPaperId]     = useState<string | null>(existingPaper?.subjectPaperId ?? null)
  const [paperNumber,        setPaperNumber]        = useState(existingPaper?.paperNumber         ?? 1)
  const [variant,            setVariant]            = useState(existingPaper?.variant             ?? 1)
  const [stage,              setStage]              = useState<'as' | 'a2'>(existingPaper?.stage  ?? 'as')
  const [year,               setYear]               = useState(existingPaper?.year                ?? currentYear)
  const [session,            setSession]            = useState<'feb_mar' | 'may_jun' | 'oct_nov'>(initialSession)
  const [attemptedAt,        setAttemptedAt]        = useState(existingPaper?.attemptedAt        ?? localToday)
  const [timeTaken,          setTimeTaken]          = useState(existingPaper?.timeTakenMins ? String(existingPaper.timeTakenMins) : '')
  const [notes,              setNotes]              = useState(existingPaper?.notes              ?? '')
  const [questions,          setQuestions]          = useState<QuestionInput[]>(
    isEditing ? [] : [{ questionNumber: '1', chapterId: null, marksObtained: 0, marksAvailable: 1 }]
  )
  const [questionsLoading, setQuestionsLoading] = useState(isEditing)

  // Fetch enrolled subjects + route information on mount
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('user_subjects')
        .select('*, subjects(id, name, code, color_hex)')
        .eq('user_id', user.id)
        .eq('is_archived', false)
      if (data) {
        const rawEnrollments = data as unknown as RawEnrollment[]
        setEnrollments(rawEnrollments)
        const subs = rawEnrollments.map(d => d.subjects).filter((s): s is RawSubject => Boolean(s))
        setSubjects(subs)
        if (!isEditing && subs.length > 0) {
          setSubjectId(subs[0].id)
        }
      }
    }
    load()
  }, [isEditing, supabase])

  // In edit mode, load existing questions
  useEffect(() => {
    if (!isEditing || !existingPaperId) return
    async function loadQuestions() {
      const { data } = await supabase
        .from('paper_question_attempts')
        .select('question_number, chapter_id, marks_obtained, marks_available')
        .eq('paper_id', existingPaperId)
        .order('question_number', { ascending: true })

      if (data && data.length > 0) {
        setQuestions(
          data.map(q => ({
            questionNumber: q.question_number,
            chapterId: q.chapter_id,
            marksObtained: q.marks_obtained,
            marksAvailable: q.marks_available,
          }))
        )
      } else {
        setQuestions([{ questionNumber: '1', chapterId: null, marksObtained: 0, marksAvailable: 1 }])
      }
      setQuestionsLoading(false)
    }
    loadQuestions()
  }, [existingPaperId, isEditing, supabase])

  // Fetch chapters, subject_papers, and chapter_papers when subject changes
  useEffect(() => {
    if (!subjectId) return
    async function load() {
      const activeEnrollment = enrollments.find(e => e.subject_id === subjectId)
      const [chRes, spRes, cpRes, selRes] = await Promise.all([
        supabase
          .from('chapters')
          .select('id, title, component, number, stage')
          .eq('subject_id', subjectId)
          .eq('is_active', true)
          .order('component', { ascending: true, nullsFirst: false })
          .order('number',    { ascending: true }),
        supabase
          .from('subject_papers')
          .select('id, name, paper_number')
          .eq('subject_id', subjectId)
          .order('paper_number', { ascending: true }),
        supabase
          .from('chapter_papers')
          .select('chapter_id, subject_paper_id'),
        supabase
          .from('subject_paper_selections')
          .select('subject_paper_id, paper_number, stage, component_name')
          .eq('user_subject_id', activeEnrollment?.id ?? ''),
      ])

      if (chRes.data) setChapters(chRes.data as RawChapter[])
      if (cpRes.data) setChapterPapers(cpRes.data as RawChapterPaper[])

      const allPapers = (spRes.data ?? []) as RawSubjectPaper[]
      const userSelections = (selRes.data ?? []) as RawPaperSelection[]
      const currentSubject = subjects.find(s => s.id === subjectId)
      const isMVP = currentSubject?.code ? MVP_SUBJECT_CODES.has(currentSubject.code) : false

      let availablePapers: RawSubjectPaper[] = []
      if (isMVP) {
        if (userSelections.length > 0) {
          availablePapers = userSelections.map(sel => {
            const sp = allPapers.find(p => p.id === sel.subject_paper_id || p.paper_number === sel.paper_number)
            return {
              id: sel.subject_paper_id || sp?.id || '',
              name: sp?.name || sel.component_name || `Paper ${sel.paper_number}`,
              paper_number: sel.paper_number,
              stage: (sel.stage || 'as') as 'as' | 'a2',
            }
          }).filter(p => {
            if (activeEnrollment?.current_stage === 'as' && p.stage === 'a2') return false
            return true
          })
        }
      }

      setSubjectPapers(availablePapers)

      if (isMVP) {
        if (availablePapers.length > 0) {
          const selected = isEditing
            ? matchPaperOption(availablePapers, existingPaper?.subjectPaperId, existingPaper?.paperNumber)
            : availablePapers[0]

          if (selected) {
            setSubjectPaperId(selected.id)
            setPaperNumber(selected.paper_number)
            setStage(selected.stage ?? 'as')
          }
        } else {
          setSubjectPaperId(null)
        }
      }
    }
    load()
  }, [subjectId, enrollments, isEditing, existingPaper, subjects, supabase])

  // Current subject check
  const activeSubject = subjects.find(s => s.id === subjectId)
  const isMVP = activeSubject?.code ? MVP_SUBJECT_CODES.has(activeSubject.code) : false

  // Filter chapters dynamically by chapter_papers mapping and practical rules
  const filteredChapters = useMemo(() => {
    return filterChaptersForPaper(
      activeSubject?.code,
      paperNumber,
      subjectPaperId,
      chapters,
      chapterPapers
    )
  }, [chapters, chapterPapers, subjectPaperId, activeSubject, paperNumber])

  // Session availability based on year
  const availableSessions = useMemo(
    () => getAvailableSessions(year, currentYear, currentMonth),
    [year, currentYear, currentMonth]
  )

  const selectedSession = availableSessions.includes(session)
    ? session
    : (availableSessions[availableSessions.length - 1] ?? session)

  const previewCode = activeSubject
    ? `${activeSubject.code}/${paperNumber}${variant}/${SESSION_LABELS[selectedSession]}/${year.toString().slice(-2)}`
    : ''

  // Marks update with validation
  const updateQuestion = (index: number, field: keyof QuestionInput, raw: string | number | null) => {
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

  const step1Valid = !!(
    subjectId &&
    year &&
    attemptedAt &&
    availableSessions.includes(selectedSession) &&
    (!isMVP || subjectPapers.length > 0)
  )

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
      subjectId,
      subjectPaperId: subjectPaperId || undefined,
      year,
      session: selectedSession,
      paperNumber,
      variant,
      stage,
      attemptedAt,
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
  const componentHint = activeSubject && activeSubject.code && PAPER_COMPONENT_MAP[activeSubject.code]?.[paperNumber]
    ? PAPER_COMPONENT_MAP[activeSubject.code][paperNumber].join(' + ')
    : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
      />

      {/* Modal dialog */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'relative', width: '100%', maxWidth: step === 2 ? 680 : 540,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          background: 'var(--bg-elevated)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-subtle)', boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden', transition: 'max-width 200ms ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {step === 3 ? 'Paper Logged!' : isEditing ? 'Edit Past Paper' : 'Log Past Paper'}
            </h2>
            {step < 3 && (
              <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Step {step} of 2 — {step === 1 ? 'Paper Details' : 'Question Breakdown'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="btn-icon" style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Unconfigured MVP Subject Banner */}
        {isMVP && subjectPapers.length === 0 && (
          <div style={{ margin: 'var(--space-4) var(--space-6) 0', padding: 12, borderRadius: 'var(--radius-md)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <AlertCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--danger)' }}>
                Route configuration required
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                This subject does not have confirmed paper selections yet. Please configure your study route in the Subjects section before logging past papers.
              </p>
            </div>
          </div>
        )}

        {/* Step 1: Paper metadata */}
        {step === 1 && (
          <div style={{ padding: 'var(--space-6)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Subject selector */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Subject</label>
              <select
                className="input"
                value={subjectId}
                disabled={isEditing}
                onChange={e => {
                  setSubjectId(e.target.value)
                  setSubjectPaperId(null)
                  if (!isEditing) {
                    setQuestions([{ questionNumber: '1', chapterId: null, marksObtained: 0, marksAvailable: 1 }])
                  }
                }}
                style={{ width: '100%' }}
              >
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>

            {/* Stage Selector (Legacy custom fallback) */}
            {!isMVP && (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Stage</label>
                <div style={{ display: 'flex', gap: 6, background: 'var(--bg-overlay)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <button
                    type="button"
                    onClick={() => setStage('as')}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                      background: stage === 'as' ? 'var(--accent-primary)' : 'transparent',
                      color: stage === 'as' ? '#fff' : 'var(--text-secondary)',
                      fontWeight: stage === 'as' ? 600 : 400, fontSize: '0.875rem',
                    }}
                  >
                    AS Level
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage('a2')}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 'var(--radius-sm)', border: 'none',
                      background: stage === 'a2' ? 'var(--accent-primary)' : 'transparent',
                      color: stage === 'a2' ? '#fff' : 'var(--text-secondary)',
                      fontWeight: stage === 'a2' ? 600 : 400, fontSize: '0.875rem',
                    }}
                  >
                    A2 Level
                  </button>
                </div>
              </div>
            )}

            {/* Paper Selector */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Paper</label>
              {isMVP ? (
                  <select
                    className="input"
                    value={subjectPaperId || ''}
                    disabled={subjectPapers.length === 0}
                    onChange={e => {
                      const spId = e.target.value
                      setSubjectPaperId(spId)
                      const sp = subjectPapers.find(p => p.id === spId)
                      if (sp) {
                        setPaperNumber(sp.paper_number)
                        setStage((sp.stage || 'as') as 'as' | 'a2')
                      }
                    }}
                    style={{ width: '100%' }}
                  >
                    {subjectPapers.length === 0 && <option value="">No papers available</option>}
                    {subjectPapers.map(sp => (
                      <option key={sp.id} value={sp.id}>
                        P{sp.paper_number}: {sp.name} ({(sp.stage || 'as').toUpperCase()})
                      </option>
                    ))}
                  </select>
                ) : (
                  <select className="input" value={paperNumber} onChange={e => setPaperNumber(parseInt(e.target.value))} style={{ width: '100%' }}>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>Paper {n}</option>)}
                  </select>
                )}
            </div>

            {/* Variant / Year */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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

            {/* Session selection */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Session</label>
              <div style={{ display: 'flex', gap: 6, background: 'var(--bg-overlay)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                {(['feb_mar', 'may_jun', 'oct_nov'] as const).map(s => {
                  const avail = availableSessions.includes(s)
                  const active = selectedSession === s
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
