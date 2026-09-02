'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { updateTargetGrade } from '@/lib/actions/subjects'

const GRADES = ['A*', 'A', 'B', 'C', 'D', 'E'] as const
type Grade = (typeof GRADES)[number]

interface Props {
  subjectId: string
  currentGrade: string | null
  color: string
}

export default function TargetGradePicker({ subjectId, currentGrade, color }: Props) {
  const [grade, setGrade] = useState<string>(currentGrade ?? 'A')
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const prefersReduced = useReducedMotion()

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const handleSelect = (g: Grade) => {
    setGrade(g)
    setOpen(false)
    startTransition(async () => {
      await updateTargetGrade(subjectId, g)
    })
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger badge */}
      <button
        type="button"
        className="target-grade-trigger touch-target-btn"
        onClick={() => setOpen((v) => !v)}
        title="Change target grade"
        aria-label={`Target grade: ${grade}. Click to change.`}
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 12px',
          minHeight: 44,
          minWidth: 44,
          borderRadius: 99,
          background: `${color}18`,
          border: `1.5px solid ${color}40`,
          fontSize: '0.8125rem',
          fontWeight: 700,
          color,
          cursor: 'pointer',
          transition: 'border-color 150ms ease, background 150ms ease',
          opacity: isPending ? 0.6 : 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = color
          e.currentTarget.style.background = `${color}28`
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = `${color}40`
          e.currentTarget.style.background = `${color}18`
        }}
      >
        Target {grade}
        <ChevronDown
          size={13}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 200ms ease',
          }}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.95 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.95 }}
            transition={{ duration: prefersReduced ? 0 : 0.15 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              zIndex: 100,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              padding: 6,
              display: 'flex',
              gap: 6,
            }}
          >
            {GRADES.map((g) => {
              const selected = grade === g
              return (
                <motion.button
                  key={g}
                  type="button"
                  className="target-grade-option touch-target-btn"
                  onClick={() => handleSelect(g)}
                  whileTap={prefersReduced ? undefined : { scale: 0.88 }}
                  aria-label={`Select grade ${g}`}
                  aria-pressed={selected}
                  style={{
                    width: 44,
                    height: 44,
                    minWidth: 44,
                    minHeight: 44,
                    borderRadius: 'var(--radius-sm)',
                    border: `1.5px solid ${selected ? color : 'var(--border-subtle)'}`,
                    background: selected ? color : 'transparent',
                    color: selected ? '#fff' : 'var(--text-secondary)',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 120ms ease',
                    fontFamily: 'var(--font-sans)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) {
                      e.currentTarget.style.borderColor = color
                      e.currentTarget.style.color = color
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)'
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }
                  }}
                >
                  {g}
                </motion.button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
