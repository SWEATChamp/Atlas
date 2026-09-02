'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Circle, Clock, Star, Lock } from 'lucide-react'
import { updateChapterStatus, updateChapterConfidence } from '@/lib/actions/chapters'
import {
  STATUS_CYCLE,
  STATUS_CONFIG,
  CONFIDENCE_LEVELS,
} from '@/lib/subject-controls'
import type { Chapter, UserChapter, NotesStatus } from '@/types'

interface Props {
  chapter: Chapter
  userChapter: UserChapter | null
  avgScore: number | null
  subjectColor: string
  isAccessible?: boolean
}

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

  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.none

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={`Notes: ${config.label} — select to cycle`}
      aria-label={`Notes status: ${config.label}. Select to cycle status.`}
      className="touch-target-btn"
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        width: 44,
        height: 44,
        minWidth: 44,
        minHeight: 44,
        padding: 0,
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={status}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ duration: 0.12 }}
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
        {CONFIDENCE_LEVELS.map((item) => (
          <div
            key={item.level}
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
      title={value ? `Confidence: ${value}/5 — select same star again to clear` : 'Set confidence (1–5 stars)'}
    >
      {CONFIDENCE_LEVELS.map((item) => {
        const n = item.level
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
            aria-label={`Rate confidence ${n} of 5: ${item.description}`}
            className="touch-target-btn"
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
              borderRadius: 'var(--radius-sm)',
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
      title={`Paper average: ${pct.toFixed(1)}%`}
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

export default function ChapterRow({
  chapter,
  userChapter,
  avgScore,
  subjectColor,
  isAccessible = true,
}: Props) {
  const [status, setStatus] = useState<NotesStatus>(userChapter?.notes_status ?? 'none')
  const [confidence, setConfidence] = useState<number | null>(userChapter?.confidence_level ?? null)
  const [, startTransition] = useTransition()

  const handleStatusClick = () => {
    if (!isAccessible) return
    const currentIdx = STATUS_CYCLE.indexOf(status)
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length]
    const prevStatus = status
    setStatus(nextStatus)
    startTransition(async () => {
      const result = await updateChapterStatus(chapter.id, nextStatus)
      if (result.error) {
        console.error('Failed to update chapter status:', result.error)
        setStatus(prevStatus)
      }
    })
  }

  const handleConfidenceChange = (level: number | null) => {
    if (!isAccessible) return
    const prev = confidence
    setConfidence(level)
    startTransition(async () => {
      const result = await updateChapterConfidence(chapter.id, level)
      if (result.error) {
        console.error('Failed to update chapter confidence:', result.error)
        setConfidence(prev)
      }
    })
  }

  const rowBg = !isAccessible
    ? 'rgba(0, 0, 0, 0.15)'
    : status === 'complete'
    ? `${subjectColor}08`
    : status === 'in_progress'
    ? 'rgba(196,160,93,0.06)'
    : 'transparent'

  const statusMeta = !isAccessible
    ? { label: 'Locked (A2 Stage)', color: 'var(--text-disabled)' }
    : STATUS_CONFIG[status] ?? STATUS_CONFIG.none

  return (
    <div
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
          {/* Status label below title */}
          <div
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              color: statusMeta.color,
              marginTop: 1,
              letterSpacing: '0.02em',
            }}
          >
            {statusMeta.label}
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
    </div>
  )
}
