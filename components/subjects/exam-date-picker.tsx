'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CalendarDays, Check, X } from 'lucide-react'
import { updateExamDate } from '@/lib/actions/subjects'

interface Props {
  subjectId: string
  currentDate: string | null
  countdownLabel: string | null
  countdownColor: string
}

function formatDate(value: string | null): string {
  if (!value) return 'Set exam date'

  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

export default function ExamDatePicker({
  subjectId,
  currentDate,
  countdownLabel,
  countdownColor,
}: Props) {
  const [savedDate, setSavedDate] = useState(currentDate)
  const [date, setDate] = useState(currentDate ?? '')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const prefersReduced = useReducedMotion()

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setDate(savedDate ?? '')
        setError(null)
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [savedDate])

  const close = () => {
    setDate(savedDate ?? '')
    setError(null)
    setOpen(false)
  }

  const save = () => {
    if (!date || date === savedDate) return

    setError(null)
    startTransition(async () => {
      const result = await updateExamDate(subjectId, date)
      if (result.error) {
        setError(result.error)
        return
      }

      setSavedDate(date)
      setOpen(false)
    })
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        title="Change exam date"
        aria-label={`Exam date: ${countdownLabel ?? formatDate(savedDate)}. Click to change.`}
        aria-expanded={open}
        className="touch-target-btn"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 12px',
          minHeight: 44,
          minWidth: 44,
          borderRadius: 99,
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-overlay)',
          color: countdownColor,
          fontFamily: 'var(--font-sans)',
          fontSize: '0.8125rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <CalendarDays size={14} />
        <span>{countdownLabel ?? formatDate(savedDate)}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: prefersReduced ? 0 : 0.15 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              zIndex: 100,
              width: 270,
              padding: 14,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <label
              htmlFor={`exam-date-${subjectId}`}
              style={{
                display: 'block',
                marginBottom: 7,
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              Exam date
            </label>
            <input
              id={`exam-date-${subjectId}`}
              type="date"
              value={date}
              onChange={event => setDate(event.target.value)}
              disabled={isPending}
              style={{
                width: '100%',
                height: 44,
                minHeight: 44,
                padding: '0 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-muted)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                colorScheme: 'dark',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.875rem',
              }}
            />

            {error && (
              <p style={{ margin: '7px 0 0', color: 'var(--danger)', fontSize: '0.75rem' }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={close}
                disabled={isPending}
                className="btn btn-ghost touch-target-btn"
                style={{ height: 44, minHeight: 44, padding: '0 14px', fontSize: '0.8125rem' }}
              >
                <X size={14} />
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={isPending || !date || date === savedDate}
                className="btn btn-primary touch-target-btn"
                style={{ height: 44, minHeight: 44, padding: '0 14px', fontSize: '0.8125rem' }}
              >
                <Check size={14} />
                {isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
