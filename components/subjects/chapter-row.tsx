'use client'

import { useState, useTransition, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Circle, Clock, Star } from 'lucide-react'
import { updateChapterStatus, updateChapterConfidence } from '@/lib/actions/chapters'
import type { Chapter, UserChapter, NotesStatus } from '@/types'

interface Props {
  chapter: Chapter
  userChapter: UserChapter | null
  avgScore: number | null
  subjectColor: string
}

const STATUS_CYCLE: NotesStatus[] = ['none', 'in_progress', 'complete']

function StatusButton({
  status,
  color,
  onClick,
}: {
  status: NotesStatus
  color: string
  onClick: () => void
}) {
  const icon =
    status === 'complete' ? (
      <CheckCircle2 size={18} color={color} strokeWidth={2.5} />
    ) : status === 'in_progress' ? (
      <Clock size={18} color="var(--warning)" strokeWidth={2.5} />
    ) : (
      <Circle size={18} color="var(--text-disabled)" strokeWidth={2} />
    )

  const label =
    status === 'complete'
      ? 'Complete'
      : status === 'in_progress'
      ? 'In Progress'
      : 'Not started'

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={`Notes: ${label} — click to cycle`}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 4,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 150ms ease',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)' }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={status}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{ display: 'flex', pointerEvents: 'none' }}
        >
          {icon}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

function ConfidenceStars({
  value,
  color,
  onChange,
}: {
  value: number | null
  color: string
  onChange: (level: number | null) => void
}) {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <div
      style={{ display: 'flex', gap: 2, alignItems: 'center' }}
      title={value ? `Confidence: ${value}/5 — click same star to clear` : 'Set confidence (1–5 stars)'}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (hovered ?? value ?? 0) >= n
        return (
          <button
            key={n}
            onClick={(e) => {
              e.stopPropagation()
              onChange(value === n ? null : n)
            }}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 1,
              display: 'flex',
              transition: 'transform 100ms ease',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.85)' }}
            onMouseUp={(e)   => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            <Star
              size={13}
              fill={filled ? color : 'transparent'}
              color={filled ? color : 'var(--text-disabled)'}
              strokeWidth={1.5}
            />
          </button>
        )
      })}
    </div>
  )
}

// ── Avg score pill ─────────────────────────────────────────────────────────────
function ScorePill({ pct }: { pct: number }) {
  const color =
    pct >= 80 ? 'var(--success)' :
    pct >= 60 ? 'var(--warning)' :
    'var(--danger)'

  return (
    <div
      title={`Paper avg: ${pct.toFixed(1)}%`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        flexShrink: 0,
      }}
    >
      {/* Mini bar */}
      <div style={{
        width: 36,
        height: 4,
        borderRadius: 2,
        background: 'var(--bg-overlay)',
        overflow: 'hidden',
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(pct, 100)}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ height: '100%', borderRadius: 2, background: color }}
        />
      </div>
      {/* Percentage label */}
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.7rem',
        fontWeight: 700,
        color,
        minWidth: 32,
        textAlign: 'right',
      }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

// ── Status label (tooltip-quality, shown as tiny pill) ────────────────────────
const STATUS_META: Record<NotesStatus, { label: string; color: string }> = {
  none:        { label: 'Not started', color: 'var(--text-disabled)' },
  in_progress: { label: 'In progress', color: 'var(--warning)' },
  complete:    { label: 'Complete',    color: 'var(--success)' },
}

export default function ChapterRow({ chapter, userChapter, avgScore, subjectColor }: Props) {
  const [status,     setStatus]     = useState<NotesStatus>(userChapter?.notes_status ?? 'none')
  const [confidence, setConfidence] = useState<number | null>(userChapter?.confidence_level ?? null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (userChapter?.notes_status)                setStatus(userChapter.notes_status)
    if (userChapter?.confidence_level !== undefined) setConfidence(userChapter.confidence_level ?? null)
  }, [userChapter?.notes_status, userChapter?.confidence_level])

  const handleStatusClick = () => {
    const currentIdx  = STATUS_CYCLE.indexOf(status)
    const nextStatus  = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length]
    const prevStatus  = status
    setStatus(nextStatus)
    startTransition(async () => {
      const result = await updateChapterStatus(chapter.id, nextStatus)
      if (result.error) { console.error('Failed to update chapter status:', result.error); setStatus(prevStatus) }
    })
  }

  const handleConfidenceChange = (level: number | null) => {
    const prev = confidence
    setConfidence(level)
    startTransition(async () => {
      const result = await updateChapterConfidence(chapter.id, level)
      if (result.error) { console.error('Failed to update chapter confidence:', result.error); setConfidence(prev) }
    })
  }

  const rowBg =
    status === 'complete'    ? `${subjectColor}08` :
    status === 'in_progress' ? 'rgba(251,191,36,0.04)' :
    'transparent'

  const { label: statusLabel, color: statusColor } = STATUS_META[status]

  return (
    <motion.div
      layout
      style={{
        display: 'grid',
        gridTemplateColumns: '26px 1fr auto auto auto',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        background: rowBg,
        transition: 'background 250ms ease',
      }}
    >
      {/* ① Status toggle icon */}
      <StatusButton status={status} color={subjectColor} onClick={handleStatusClick} />

      {/* ② Chapter number + title + status label */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.875rem',
            fontWeight: status === 'complete' ? 500 : 400,
            color: status === 'complete' ? 'var(--text-secondary)' : 'var(--text-primary)',
            textDecorationLine: status === 'complete' ? 'line-through' : 'none',
            textDecorationColor: 'var(--text-disabled)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            transition: 'color 200ms ease',
          }}
        >
          <span style={{ color: 'var(--text-muted)', marginRight: 6, fontSize: '0.8rem' }}>
            {chapter.number}.
          </span>
          {chapter.title}
        </div>
        {/* Status label — tiny, below title */}
        <div style={{
          fontSize: '0.68rem',
          fontWeight: 600,
          color: statusColor,
          marginTop: 1,
          letterSpacing: '0.02em',
        }}>
          {statusLabel}
        </div>
      </div>

      {/* ③ Paper avg score pill (only when data exists) */}
      <AnimatePresence>
        {avgScore !== null && (
          <motion.div
            initial={{ opacity: 0, x: 4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
          >
            <ScorePill pct={avgScore} />
          </motion.div>
        )}
        {avgScore === null && (
          <div style={{
            fontSize: '0.68rem',
            color: 'var(--text-disabled)',
            whiteSpace: 'nowrap',
            minWidth: 70,
            textAlign: 'right',
          }}>
            No paper data
          </div>
        )}
      </AnimatePresence>

      {/* ④ Confidence stars */}
      <ConfidenceStars value={confidence} color={subjectColor} onChange={handleConfidenceChange} />
    </motion.div>
  )
}
