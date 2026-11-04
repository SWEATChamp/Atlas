'use client'

import { useState, useRef, useEffect } from 'react'
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
      role="group"
      aria-label="Confidence rating"
      style={{ display: 'flex', gap: 0, alignItems: 'center' }}
      title={value ? `Confidence: ${value}/5 — select same star again to clear` : 'Set confidence (1–5 stars)'}
    >
      {CONFIDENCE_LEVELS.map((item) => {
        const n = item.level
        const isLit = (hovered ?? value ?? 0) >= n
        const isSelected = value === n
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
            aria-pressed={isSelected}
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
  // Confirmed server state tracking
  const confirmedStatusRef = useRef<NotesStatus>(userChapter?.notes_status ?? 'none')
  const [status, setStatus] = useState<NotesStatus>(userChapter?.notes_status ?? 'none')
  const [statusError, setStatusError] = useState<string | null>(null)
  const inFlightStatusRef = useRef<boolean>(false)
  const queuedStatusRef = useRef<NotesStatus | null>(null)

  const confirmedConfidenceRef = useRef<number | null>(userChapter?.confidence_level ?? null)
  const [confidence, setConfidence] = useState<number | null>(userChapter?.confidence_level ?? null)
  const [confidenceError, setConfidenceError] = useState<string | null>(null)
  const inFlightConfidenceRef = useRef<boolean>(false)
  const queuedConfidenceRef = useRef<number | null | undefined>(undefined)

  const isMountedRef = useRef<boolean>(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Reconcile refreshed props from server revalidation when idle.
  // When a mutation queue is active (in-flight or queued), do not let incoming props
  // overwrite confirmedStatusRef / confirmedConfidenceRef so rollbacks restore the
  // last successfully persisted local value.
  useEffect(() => {
    const propStatus = userChapter?.notes_status ?? 'none'
    if (!inFlightStatusRef.current && queuedStatusRef.current === null) {
      confirmedStatusRef.current = propStatus
      setStatus(propStatus)
    }
  }, [userChapter?.notes_status])

  useEffect(() => {
    const propConfidence = userChapter?.confidence_level ?? null
    if (!inFlightConfidenceRef.current && queuedConfidenceRef.current === undefined) {
      confirmedConfidenceRef.current = propConfidence
      setConfidence(propConfidence)
    }
  }, [userChapter?.confidence_level])

  // Single-flight serialized mutation runner for status
  const processNextStatusMutation = async (targetStatus: NotesStatus) => {
    inFlightStatusRef.current = true
    let nextToSend: NotesStatus | null = targetStatus

    while (nextToSend !== null) {
      const currentAttempt = nextToSend
      nextToSend = null

      let hasError = false
      let errorMsg = 'Failed to update notes status'

      try {
        const result = await updateChapterStatus(chapter.id, currentAttempt)
        if (result?.error) {
          hasError = true
          errorMsg = result.error
        }
      } catch (err) {
        hasError = true
        if (err instanceof Error && err.message) {
          errorMsg = err.message
        }
      }

      if (!isMountedRef.current) return

      if (!hasError) {
        confirmedStatusRef.current = currentAttempt
      }

      if (queuedStatusRef.current !== null) {
        nextToSend = queuedStatusRef.current
        queuedStatusRef.current = null
      } else {
        inFlightStatusRef.current = false
        if (hasError) {
          setStatus(confirmedStatusRef.current)
          setStatusError(errorMsg)
        }
      }
    }
  }

  const handleStatusClick = () => {
    if (!isAccessible) return
    setStatusError(null)

    const baseStatus = queuedStatusRef.current ?? status
    const currentIdx = STATUS_CYCLE.indexOf(baseStatus)
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length]

    setStatus(nextStatus)

    if (inFlightStatusRef.current) {
      queuedStatusRef.current = nextStatus
    } else {
      processNextStatusMutation(nextStatus)
    }
  }

  // Single-flight serialized mutation runner for confidence
  const processNextConfidenceMutation = async (targetLevel: number | null) => {
    inFlightConfidenceRef.current = true
    let nextToSend: number | null | undefined = targetLevel

    while (nextToSend !== undefined) {
      const currentAttempt = nextToSend
      nextToSend = undefined

      let hasError = false
      let errorMsg = 'Failed to update confidence rating'

      try {
        const result = await updateChapterConfidence(chapter.id, currentAttempt)
        if (result?.error) {
          hasError = true
          errorMsg = result.error
        }
      } catch (err) {
        hasError = true
        if (err instanceof Error && err.message) {
          errorMsg = err.message
        }
      }

      if (!isMountedRef.current) return

      if (!hasError) {
        confirmedConfidenceRef.current = currentAttempt
      }

      if (queuedConfidenceRef.current !== undefined) {
        nextToSend = queuedConfidenceRef.current
        queuedConfidenceRef.current = undefined
      } else {
        inFlightConfidenceRef.current = false
        if (hasError) {
          setConfidence(confirmedConfidenceRef.current)
          setConfidenceError(errorMsg)
        }
      }
    }
  }

  const handleConfidenceChange = (level: number | null) => {
    if (!isAccessible) return
    setConfidenceError(null)

    setConfidence(level)

    if (inFlightConfidenceRef.current) {
      queuedConfidenceRef.current = level
    } else {
      processNextConfidenceMutation(level)
    }
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
    <div style={{ display: 'flex', flexDirection: 'column' }}>
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

    {/* Accessible visible failure feedback */}
    {(statusError || confidenceError) && (
      <div
        role="alert"
        aria-live="polite"
        style={{
          padding: '4px 12px',
          fontSize: '0.75rem',
          color: 'var(--danger)',
          background: 'rgba(199, 123, 123, 0.12)',
          borderBottomLeftRadius: 'var(--radius-sm)',
          borderBottomRightRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span>{statusError ?? confidenceError}</span>
        <button
          type="button"
          onClick={() => {
            setStatusError(null)
            setConfidenceError(null)
          }}
          aria-label="Dismiss error"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.75rem',
            padding: '2px 6px',
            minHeight: '28px',
          }}
        >
          ✕
        </button>
      </div>
    )}
  </div>
  )
}
