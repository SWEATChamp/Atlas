'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Loader2, CalendarCheck2 } from 'lucide-react'
import { setExamDates, completeOnboarding } from '@/lib/actions/onboarding'
import { createClient } from '@/lib/supabase/client'
import type { UserSubjectWithSubject } from '@/types'

// ─── CAIE Exam Sessions ───────────────────────────────────────────────────────
// Representative dates used for countdown / mission engine scheduling.
// Each session maps to a stable date string stored in user_subjects.exam_date.

const EXAM_SESSIONS = [
  { label: 'Oct / Nov 2026', short: 'ON26', date: '2026-11-01', soon: true },
  { label: 'May / Jun 2027', short: 'MJ27', date: '2027-06-01', soon: false },
  { label: 'Oct / Nov 2027', short: 'ON27', date: '2027-11-01', soon: false },
] as const

const GRADES = ['A*', 'A', 'B', 'C', 'D', 'E'] as const

type Session = (typeof EXAM_SESSIONS)[number]['date']
type Grade   = (typeof GRADES)[number]

interface ExamEntry {
  subjectId: string
  examDate: Session | ''
  targetGrade: Grade
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SessionPicker({
  value,
  onChange,
  color,
}: {
  value: string
  onChange: (date: string) => void
  color: string
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {EXAM_SESSIONS.map((s) => {
        const selected = value === s.date
        return (
          <motion.button
            key={s.date}
            type="button"
            onClick={() => onChange(s.date)}
            whileTap={{ scale: 0.94 }}
            style={{
              flex: 1,
              padding: '10px 8px',
              borderRadius: 'var(--radius-md)',
              border: `1.5px solid ${selected ? color : 'var(--border-subtle)'}`,
              background: selected ? `${color}20` : 'var(--bg-base)',
              color: selected ? color : 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: selected ? 700 : 500,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              lineHeight: 1.3,
              textAlign: 'center',
              transition: 'all 150ms ease',
              position: 'relative',
              whiteSpace: 'nowrap',
            }}
          >
            {s.label}
            {s.soon && (
              <span
                style={{
                  position: 'absolute',
                  top: -8,
                  right: 4,
                  fontSize: '0.58rem',
                  fontWeight: 700,
                  background: color,
                  color: '#fff',
                  padding: '1px 5px',
                  borderRadius: 99,
                  letterSpacing: '0.04em',
                }}
              >
                SOON
              </span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

function GradePicker({
  value,
  onChange,
  color,
}: {
  value: string
  onChange: (g: Grade) => void
  color: string
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {GRADES.map((g) => {
        const selected = value === g
        return (
          <motion.button
            key={g}
            type="button"
            onClick={() => onChange(g)}
            whileTap={{ scale: 0.9 }}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 'var(--radius-md)',
              border: `1.5px solid ${selected ? color : 'var(--border-subtle)'}`,
              background: selected ? color : 'var(--bg-base)',
              color: selected ? '#fff' : 'var(--text-muted)',
              fontSize: '0.8125rem',
              fontWeight: 700,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            {g}
          </motion.button>
        )
      })}
    </div>
  )
}

// ─── Main Step ─────────────────────────────────────────────────────────────────

export default function ExamDatesStep({ subjectIds }: { subjectIds: string[] }) {
  const [userSubjects, setUserSubjects] = useState<UserSubjectWithSubject[]>([])
  const [entries, setEntries]           = useState<Record<string, ExamEntry>>({})
  const [loading, setLoading]           = useState(true)
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return

      // Build the query — if we received IDs from step 2, use them directly;
      // otherwise fall back to querying all user_subjects for this user.
      let query = supabase
        .from('user_subjects')
        .select('*, subjects(*)')
        .eq('user_id', user.id)

      if (subjectIds.length > 0) {
        query = query.in('subject_id', subjectIds)
      }

      query.then(({ data }) => {
        const rows = (data as UserSubjectWithSubject[]) ?? []
        setUserSubjects(rows)

        const initial: Record<string, ExamEntry> = {}
        rows.forEach((r) => {
          const knownSession = EXAM_SESSIONS.find((s) => s.date === r.exam_date)
          initial[r.subject_id] = {
            subjectId:   r.subject_id,
            examDate:    knownSession ? (r.exam_date as Session) : '',
            targetGrade: (r.target_grade as Grade) ?? 'A',
          }
        })
        setEntries(initial)
        setLoading(false)
      })
    })
  }, [subjectIds])

  const update = <K extends keyof ExamEntry>(
    subjectId: string,
    field: K,
    val: ExamEntry[K]
  ) => {
    setEntries((prev) => ({
      ...prev,
      [subjectId]: { ...prev[subjectId], [field]: val },
    }))
  }

  const handleSubmit = async () => {
    setError('')
    const enrollments = Object.values(entries)
    const missing = enrollments.filter((e) => !e.examDate)
    if (missing.length > 0) {
      setError('Please pick an exam session for every subject.')
      return
    }

    setSubmitting(true)
    const result = await setExamDates(enrollments)
    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      return
    }
    await completeOnboarding() // redirects internally
  }

  const allSelected = Object.values(entries).every((e) => e.examDate)

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Loader2 size={24} style={{ color: 'var(--accent-primary)', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center' }}>
        Pick your exam session and target grade for each subject.
      </p>

      {/* Subject rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {userSubjects.map((us, i) => {
          const subject = us.subjects
          const entry   = entries[us.subject_id] ?? { subjectId: us.subject_id, examDate: '', targetGrade: 'A' }

          return (
            <motion.div
              key={us.subject_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                background: entry.examDate ? `${subject.color_hex}08` : 'var(--bg-overlay)',
                border: `1px solid ${entry.examDate ? `${subject.color_hex}30` : 'var(--border-subtle)'}`,
                transition: 'background 200ms ease, border-color 200ms ease',
              }}
            >
              {/* Subject label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: `${subject.color_hex}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: `1px solid ${subject.color_hex}30`,
                  }}
                >
                  <CalendarCheck2 size={13} color={subject.color_hex} />
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: subject.color_hex }}>
                    {subject.name}
                  </div>
                  {subject.code && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{subject.code}</div>
                  )}
                </div>
              </div>

              {/* Session row */}
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Exam session
                </div>
                <SessionPicker
                  value={entry.examDate}
                  onChange={(date) => update(us.subject_id, 'examDate', date as Session)}
                  color={subject.color_hex}
                />
              </div>

              {/* Grade row */}
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Target grade
                </div>
                <GradePicker
                  value={entry.targetGrade}
                  onChange={(g) => update(us.subject_id, 'targetGrade', g)}
                  color={subject.color_hex}
                />
              </div>
            </motion.div>
          )
        })}
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ fontSize: '0.8125rem', color: 'var(--danger)', textAlign: 'center' }}
        >
          {error}
        </motion.p>
      )}

      <motion.button
        type="button"
        onClick={handleSubmit}
        disabled={!allSelected || submitting}
        className="btn btn-primary"
        whileHover={allSelected ? { scale: 1.02, y: -1 } : {}}
        whileTap={allSelected ? { scale: 0.97 } : {}}
        style={{ width: '100%', height: 52, fontSize: '1rem', marginTop: 4 }}
      >
        {submitting ? (
          <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
        ) : (
          '🚀  Launch Atlas'
        )}
      </motion.button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
