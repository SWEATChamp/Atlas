'use client'

import { useState, useEffect, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, RefreshCw, FileSearch, AlertTriangle, Star, Check, Zap, RotateCcw, AlertCircle, Clock } from 'lucide-react'
import { completeMission, undoMission, replaceMission } from '@/lib/actions/dashboard'
import { isMissionUndoAvailable, missionUndoRemainingMs } from '@/lib/mission-undo'
import type { DailyMission, CompleteMissionResult } from '@/lib/actions/dashboard'
import type { UndoMissionResult, ReplaceMissionResult } from '@/types/database'

interface MissionCardProps {
  mission: DailyMission
  onComplete?: (id: string, result: CompleteMissionResult) => void
  onUndo?: (id: string, result: UndoMissionResult) => void
  onReplace?: (id: string, result: ReplaceMissionResult) => void
  onError?: (error: string) => void
}

const MISSION_META: Record<DailyMission['type'], {
  icon: React.ReactNode
  color: string
  bg: string
  label: string
}> = {
  complete_notes:    { icon: <BookOpen size={16} />,      color: 'var(--accent-primary)',  bg: 'rgba(124,109,250,0.12)', label: 'Notes'      },
  review_chapter:    { icon: <RefreshCw size={16} />,     color: '#5B7FFF',                bg: 'rgba(91,127,255,0.12)',  label: 'Review'     },
  attempt_paper:     { icon: <FileSearch size={16} />,    color: '#38D9F5',                bg: 'rgba(56,217,245,0.12)', label: 'Past Paper'  },
  revisit_weak_topic:{ icon: <AlertTriangle size={16} />, color: 'var(--danger)',          bg: 'rgba(248,113,113,0.12)',label: 'Weak Topic'  },
  confidence_check:  { icon: <Star size={16} />,          color: '#FFD166',                bg: 'rgba(255,209,102,0.12)',label: 'Confidence'  },
}

export default function MissionCard({ mission, onComplete, onUndo, onReplace, onError }: MissionCardProps) {
  const [done, setDone] = useState(mission.status === 'completed')
  const [completedAt, setCompletedAt] = useState<string | null>(mission.completed_at)
  const [canUndo, setCanUndo] = useState(
    () => mission.status === 'completed' && isMissionUndoAvailable(mission.completed_at)
  )
  const [cardError, setCardError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isReplacing, startReplaceTransition] = useTransition()
  const meta = MISSION_META[mission.type]

  // Close the undo window ten minutes after completion.
  useEffect(() => {
    if (!done || !completedAt || !canUndo) return
    const timeout = setTimeout(
      () => setCanUndo(false),
      missionUndoRemainingMs(completedAt)
    )
    return () => clearTimeout(timeout)
  }, [done, completedAt, canUndo])

  const handleComplete = () => {
    if (done || isPending || isReplacing) return
    setCardError(null)
    setDone(true) // optimistic
    const nowIso = new Date().toISOString()
    setCompletedAt(nowIso)
    setCanUndo(true)

    startTransition(async () => {
      const { result, error } = await completeMission(mission.id)
      if (error) {
        setDone(false)
        setCompletedAt(null)
        setCanUndo(false)
        setCardError(error)
        onError?.(`Completion failed: ${error}`)
        return
      }
      onComplete?.(mission.id, result!)
    })
  }

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!done || isPending || isReplacing) return
    setCardError(null)

    startTransition(async () => {
      const { result, error } = await undoMission(mission.id)
      if (error) {
        setCardError(error)
        onError?.(`Undo failed: ${error}`)
        return
      }
      setDone(false)
      setCompletedAt(null)
      setCanUndo(false)
      onUndo?.(mission.id, result!)
    })
  }

  const handleReplace = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (done || isPending || isReplacing) return
    setCardError(null)

    startReplaceTransition(async () => {
      const { result, error } = await replaceMission(mission.id)
      if (error) {
        setCardError(error)
        onError?.(`Replace failed: ${error}`)
        return
      }
      if (result) {
        onReplace?.(mission.id, result)
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 'var(--radius-md)',
          background: done ? 'rgba(52,211,153,0.05)' : 'var(--bg-card)',
          border: `1px solid ${cardError ? 'var(--danger)' : done ? 'rgba(52,211,153,0.2)' : 'var(--border-subtle)'}`,
          transition: 'background 300ms ease, border-color 300ms ease',
          cursor: done ? 'default' : 'pointer',
          userSelect: 'none',
        }}
        onClick={handleComplete}
        whileHover={done ? {} : { scale: 1.005, borderColor: meta.color + '60' }}
        whileTap={done ? {} : { scale: 0.995 }}
      >
        {/* Checkbox */}
        <motion.div
          animate={{ scale: done ? [1, 1.3, 1] : 1 }}
          transition={{ duration: 0.3 }}
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: `2px solid ${done ? 'var(--success)' : 'var(--border-muted)'}`,
            background: done ? 'var(--success)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 200ms ease, border-color 200ms ease',
          }}
        >
          <AnimatePresence>
            {done && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <Check size={13} color="#fff" strokeWidth={3} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Type icon pill */}
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: meta.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: meta.color,
            flexShrink: 0,
          }}
        >
          {meta.icon}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: done ? 'var(--text-muted)' : 'var(--text-primary)',
              textDecorationLine: done ? 'line-through' : 'none',
              textDecorationColor: 'var(--text-disabled)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transition: 'color 200ms',
            }}
          >
            {mission.title}
          </div>
          {mission.description && (
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {mission.description}
            </div>
          )}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              marginTop: 3,
            }}
          >
            <Clock size={11} style={{ opacity: 0.7 }} />
            <span>~{mission.estimated_minutes ?? 30} min</span>
          </div>
        </div>

        {/* Action / XP badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {!done && mission.status === 'pending' && (
            <button
              type="button"
              onClick={handleReplace}
              disabled={isPending || isReplacing}
              title="Replace this mission with another available task"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: isPending || isReplacing ? 'not-allowed' : 'pointer',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                if (!isPending && !isReplacing) {
                  e.currentTarget.style.borderColor = 'var(--text-secondary)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <RefreshCw size={10} style={{ animation: isReplacing ? 'spin 1s linear infinite' : 'none' }} />
              {isReplacing ? 'Replacing…' : 'Replace'}
            </button>
          )}

          {done && canUndo && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={isPending || isReplacing}
              title="Undo completion (available for 10 minutes)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: isPending || isReplacing ? 'not-allowed' : 'pointer',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--text-secondary)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)'
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              <RotateCcw size={10} />
              Undo
            </button>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: '3px 8px',
              borderRadius: 99,
              background: done ? 'rgba(52,211,153,0.1)' : 'rgba(124,109,250,0.12)',
              color: done ? 'var(--success)' : 'var(--accent-primary)',
              fontSize: '0.75rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            <Zap size={11} strokeWidth={2.5} />
            +{mission.xp_reward} XP
          </div>
        </div>
      </motion.div>

      {/* Visible inline error if failed */}
      {cardError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(248, 113, 113, 0.1)',
            border: '1px solid rgba(248, 113, 113, 0.25)',
            color: 'var(--danger)',
            fontSize: '0.75rem',
            fontWeight: 500,
          }}
        >
          <AlertCircle size={13} style={{ flexShrink: 0 }} />
          <span>{cardError}</span>
        </div>
      )}
    </div>
  )
}
