'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Circle, Clock, Star, Lock } from 'lucide-react'
import { updateChapterStatus, updateChapterConfidence } from '@/lib/actions/chapters'
import type { Chapter, UserChapter, NotesStatus } from '@/types'

interface Props {
  chapter: Chapter
  userChapter: UserChapter | null
  avgScore: number | null
  subjectColor: string
  isAccessible?: boolean
}

const STATUS_CYCLE: NotesStatus[] = ['none', 'in_progress', 'complete']

function StatusButton({
  status,
  color,
  isAccessible = true,
  onClick,
}: {
  status: NotesStatus
  color: string
  isAccessible?: boolean
  onClick: () => void
}) {
  if (!isAccessible) {
    return (
      <div
        title="Locked: Unlock A2 or configure study route to study this chapter"
        style={{
          width: 44,
          height: 44,
          minWidth: 44,
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-disabled)',
          flexShrink: 0,
        }}
      >
        <Lock size={16} color="var(--text-disabled)" />
      </div>
    )
  }

  const icon =
    status === 'complete' ? (
      <CheckCircle2 size={20} color={color} strokeWidth={2.5} />
    ) : status === 'in_progress' ? (
      <Clock size={20} color="var(--warning)" strokeWidth={2.5} />
    ) : (
      <Circle size={20} color="var(--text-disabled)" strokeWidth={2} />
    )

  const label =
    status === 'complete'
      ? 'Complete'
      : status === 'in_progress'
      ? 'In Progress'
      : 'Not started'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={`Notes: ${label} — click to cycle`}
      aria-label={`Notes status: ${label}. Click to cycle status.`}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        width: 44,
        height: 44,
        minWidth: 44,
        minHeight: 44,
        padding: 0,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 150ms ease',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)' }}
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
  isAccessible = true,
  onChange,
}: {
  value: number | null
  color: string
  isAccessible?: boolean
  onChange: (level: number | null) => void
}) {
  const [hovered, setHovered] = useState<number | null>(null)

  if (!isAccessible) {
    return (
      <div
        style={{ display: 'flex', gap: 0, alignItems: 'center', opacity: 0.3, pointerEvents: 'none' }}
        title="Locked"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            style={{
              width: 44,
              height: 44,
              minWidth: 44,
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Star
              size={15}
              fill="transparent"
              color="var(--text-disabled)"
              strokeWidth={1.5}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      style={{ display: 'flex', gap: 0, alignItems: 'center' }}
      title={value ? `Confidence: ${value}/5 — click same star to clear` : 'Set confidence (1–5 stars)'}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const isLit = (hovered ?? value ?? 0) >= n
        return (
          <button
            key={n}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange(value === n ? null : n)
            }}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(null)}
            aria-label={`Rate confidence ${n} of 5`}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              width: 44,
              height: 44,
              minWidth: 44,
              minHeight: 44,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Star
              size={16}
              fill={isLit ? color : 'transparent'}
              color={isLit ? color : 'var(--text-disabled)'}
              strokeWidth={1.5}
              style={{ transition: 'all 120ms ease', pointerEvents: 'none' }}
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
      <div
        style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color,
          background: `${color}15`,
          border: `1px solid ${color}30`,
          borderRadius: 'var(--radius-full)',
          padding: '2px 7px',
          whiteSpace: 'nowrap',
          letterSpacing: '0.01em',
        }}
      >
        {pct.toFixed(0)}%
      </div>
    </div>
  )
}

// ── Status label (tooltip-quality, shown as tiny pill) ────────────────────────
const STATUS_META: Record<NotesStatus, { label: string; color: string }> = {
  none:        { label: 'Not started', color: 'var(--text-disabled)' },
  in_progress: { label: 'In progress', color: 'var(--warning)' },
  complete:    { label: 'Complete',    color: 'var(--success)' },
}

export default function ChapterRow({
  chapter,
  userChapter,
  avgScore,
  subjectColor,
  isAccessible = true,
}: Props) {
  const [status,     setStatus]     = useState<NotesStatus>(userChapter?.notes_status ?? 'none')
  const [confidence, setConfidence] = useState<number | null>(userChapter?.confidence_level ?? null)
  const [, startTransition] = useTransition()

  const handleStatusClick = () => {
    if (!isAccessible) return
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
    if (!isAccessible) return
    const prev = confidence
    setConfidence(level)
    startTransition(async () => {
      const result = await updateChapterConfidence(chapter.id, level)
      if (result.error) { console.error('Failed to update chapter confidence:', result.error); setConfidence(prev) }
    })
  }

  const rowBg = !isAccessible
    ? 'rgba(0, 0, 0, 0.15)'
    : status === 'complete'
    ? `${subjectColor}08`
    : status === 'in_progress'
    ? 'rgba(251,191,36,0.04)'
    : 'transparent'

  const { label: statusLabel, color: statusColor } = !isAccessible
    ? { label: 'Locked (A2 Stage)', color: 'var(--text-disabled)' }
    : STATUS_META[status]

  return (
    <motion.div
      layout
      className="chapter-row-responsive"
      style={{
        padding: '6px 12px',
        background: rowBg,
        opacity: isAccessible ? 1 : 0.6,
        transition: 'background 250ms ease, opacity 200ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
        {/* ① Status toggle icon (44x44px touch target) */}
        <StatusButton
          status={status}
          color={subjectColor}
          isAccessible={isAccessible}
          onClick={handleStatusClick}
        />

        {/* ② Chapter number + title + status label */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: '0.875rem',
              fontWeight: status === 'complete' ? 500 : 400,
              color: !isAccessible
                ? 'var(--text-disabled)'
                : status === 'complete'
                ? 'var(--text-secondary)'
                : 'var(--text-primary)',
              textDecorationLine: isAccessible && status === 'complete' ? 'line-through' : 'none',
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

        {/* ③ Paper avg score pill */}
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
            <div
              style={{
                fontSize: '0.68rem',
                color: 'var(--text-disabled)',
                whiteSpace: 'nowrap',
                textAlign: 'right',
                paddingRight: 4,
              }}
            >
              No paper data
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* ④ Confidence star rating (5 x 44x44px touch targets) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
        <ConfidenceStars
          value={confidence}
          color={subjectColor}
          isAccessible={isAccessible}
          onChange={handleConfidenceChange}
        />
      </div>
    </motion.div>
  )
}
