'use client'

import { useState, useEffect, useTransition } from 'react'
import { useReducedMotion } from 'framer-motion'
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
  complete_notes:    { icon: <BookOpen size={16} />,      color: 'var(--accent-primary)',  bg: 'var(--accent-soft)',                 label: 'Notes'      },
  review_chapter:    { icon: <RefreshCw size={16} />,     color: 'var(--accent-primary)',  bg: 'var(--accent-soft)',                 label: 'Review'     },
  attempt_paper:     { icon: <FileSearch size={16} />,    color: 'var(--info)',            bg: 'var(--accent-soft)',                 label: 'Past Paper' },
  revisit_weak_topic:{ icon: <AlertTriangle size={16} />, color: 'var(--danger)',          bg: 'rgba(199, 123, 123, 0.12)',         label: 'Weak Topic' },
  confidence_check:  { icon: <Star size={16} />,          color: 'var(--warning)',         bg: 'rgba(196, 160, 93, 0.12)',          label: 'Confidence' },
}

export default function MissionCard({ mission, onComplete, onUndo, onReplace, onError }: MissionCardProps) {
  const isServerDone = mission.status === 'completed'
  const [optimisticDone, setOptimisticDone] = useState<boolean | null>(null)
  const [prevStatus, setPrevStatus] = useState(mission.status)
  const [prevCompletedAt, setPrevCompletedAt] = useState(mission.completed_at)
  const [, setTick] = useState(0)
  const prefersReduced = useReducedMotion()

  // Reset optimistic state during render when props change
  if (prevStatus !== mission.status || prevCompletedAt !== mission.completed_at) {
    setPrevStatus(mission.status)
    setPrevCompletedAt(mission.completed_at)
    setOptimisticDone(null)
  }

  const [cardError, setCardError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isReplacing, startReplaceTransition] = useTransition()
  const meta = MISSION_META[mission.type]

  const done = optimisticDone !== null ? optimisticDone : isServerDone
  const canUndo = done && isMissionUndoAvailable(mission.completed_at)

  // Trigger re-render when the 10-minute undo window expires
  useEffect(() => {
    if (!done || !mission.completed_at || !canUndo) return
    const remainingMs = missionUndoRemainingMs(mission.completed_at)
    if (remainingMs <= 0) return

    const timeout = setTimeout(() => {
      setTick((t) => t + 1)
    }, remainingMs)
    return () => clearTimeout(timeout)
  }, [done, mission.completed_at, canUndo])

  const handleComplete = () => {
    if (done || isPending || isReplacing) return
    setCardError(null)
    setOptimisticDone(true)

    startTransition(async () => {
      const { result, error } = await completeMission(mission.id)
      if (error) {
        setOptimisticDone(false)
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
    setOptimisticDone(false)

    startTransition(async () => {
      const { result, error } = await undoMission(mission.id)
      if (error) {
        setOptimisticDone(true)
        setCardError(error)
        onError?.(`Undo failed: ${error}`)
        return
      }
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
    <div className="mission-card-shell" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        className="mission-card-surface"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 'var(--radius-md)',
          background: done ? 'rgba(121, 169, 139, 0.06)' : 'var(--bg-card)',
          border: `1px solid ${cardError ? 'var(--danger)' : done ? 'rgba(121, 169, 139, 0.25)' : 'var(--border-subtle)'}`,
          transition: prefersReduced ? 'none' : 'background 200ms ease, border-color 200ms ease',
          cursor: done ? 'default' : 'pointer',
          userSelect: 'none',
          width: '100%',
          minWidth: 0,
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
        onClick={handleComplete}
      >
        <div className="mission-card-inner">
          <div className="mission-card-top">
            {/* Native semantic button for completing the mission, or static status indicator when completed */}
            {!done ? (
              <button
                type="button"
                aria-label={`Complete mission: ${mission.title}`}
                onClick={(e) => {
                  e.stopPropagation()
                  handleComplete()
                }}
                className="touch-target-btn"
                style={{
                  width: 44,
                  height: 44,
                  minWidth: 44,
                  minHeight: 44,
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    minWidth: 24,
                    minHeight: 24,
                    borderRadius: 6,
                    border: '2px solid var(--border-muted)',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: prefersReduced ? 'none' : 'background 150ms ease, border-color 150ms ease',
                  }}
                />
              </button>
            ) : (
              <div
                aria-hidden="true"
                style={{
                  width: 44,
                  height: 44,
                  minWidth: 44,
                  minHeight: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    minWidth: 24,
                    minHeight: 24,
                    borderRadius: 6,
                    border: '2px solid var(--success)',
                    background: 'var(--success)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={14} color="#fff" strokeWidth={3} />
                </div>
              </div>
            )}

            {/* Type icon pill */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-sm)',
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

            {/* Title & Description text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="mission-card-title"
                style={{
                  color: done ? 'var(--text-muted)' : 'var(--text-primary)',
                  textDecorationLine: done ? 'line-through' : 'none',
                  textDecorationColor: 'var(--text-disabled)',
                }}
              >
                {mission.title}
              </div>
              {mission.description && (
                <div className="mission-card-desc">
                  {mission.description}
                </div>
              )}
            </div>
          </div>

          {/* Action / Time / XP row */}
          <div className="mission-card-bottom">
            <div
              className="mission-card-time"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                flexShrink: 0,
              }}
            >
              <Clock size={12} style={{ opacity: 0.7 }} />
              <span>~{mission.estimated_minutes ?? 30} min</span>
            </div>

            <div className="mission-card-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {!done && mission.status === 'pending' && (
                <button
                  type="button"
                  className="mission-action-btn mission-action-btn-replace touch-target-btn"
                  onClick={handleReplace}
                  disabled={isPending || isReplacing}
                  aria-label={`Replace mission: ${mission.title}`}
                  title="Replace this mission with another available task"
                  style={{
                    cursor: isPending || isReplacing ? 'not-allowed' : 'pointer',
                  }}
                >
                  <RefreshCw size={12} style={{ animation: isReplacing && !prefersReduced ? 'spin 1s linear infinite' : 'none' }} />
                  <span>{isReplacing ? 'Replacing…' : 'Replace'}</span>
                </button>
              )}

              {done && canUndo && (
                <button
                  type="button"
                  className="mission-action-btn mission-action-btn-undo touch-target-btn"
                  onClick={handleUndo}
                  disabled={isPending || isReplacing}
                  aria-label={`Undo completion for mission: ${mission.title}`}
                  title="Undo completion (available for 10 minutes)"
                  style={{
                    cursor: isPending || isReplacing ? 'not-allowed' : 'pointer',
                  }}
                >
                  <RotateCcw size={12} />
                  <span>Undo</span>
                </button>
              )}

              <div
                className="mission-card-xp"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-full)',
                  background: done ? 'rgba(121, 169, 139, 0.12)' : 'var(--accent-soft)',
                  color: done ? 'var(--success)' : 'var(--accent-primary)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                <Zap size={11} strokeWidth={2.5} />
                <span>+{mission.xp_reward} XP</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Visible inline error if failed */}
      {cardError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(199, 123, 123, 0.1)',
            border: '1px solid rgba(199, 123, 123, 0.25)',
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
