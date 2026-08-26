'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, PartyPopper, RefreshCw, Calendar, BookOpen, AlertCircle, RotateCcw } from 'lucide-react'
import MissionCard from './mission-card'
import { generateMissions } from '@/lib/actions/dashboard'
import type { DailyMission, CompleteMissionResult } from '@/lib/actions/dashboard'
import type { UndoMissionResult } from '@/types/database'

interface MissionListProps {
  missions: DailyMission[]
  hasExamDates: boolean
  hasChapterData: boolean
}

interface XpToast {
  id: string
  text: string
  levelUp?: boolean
  levelTitle?: string
}

export default function MissionList({ missions: initialMissions, hasExamDates, hasChapterData }: MissionListProps) {
  const router = useRouter()
  const [missions, setMissions]     = useState<DailyMission[]>(initialMissions)
  const [toasts, setToasts]         = useState<XpToast[]>([])
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError]     = useState<string | null>(null)

  useEffect(() => {
    setMissions(initialMissions)
  }, [initialMissions])

  const completedCount = missions.filter(m => m.status === 'completed').length
  const allDone = completedCount === missions.length && missions.length > 0

  const handleComplete = (id: string, result: CompleteMissionResult) => {
    setMissions(prev =>
      prev.map(m => (m.id === id ? { ...m, status: 'completed', completed_at: new Date().toISOString() } : m))
    )

    const toastId = crypto.randomUUID()
    setToasts(prev => [
      ...prev,
      {
        id: toastId,
        text: `+${result.xp_awarded + result.achievement_xp} XP`,
        levelUp: result.levelled_up,
        levelTitle: result.level_title,
      },
    ])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 2800)

    router.refresh()
  }

  const handleUndo = (id: string, result: UndoMissionResult) => {
    setMissions(prev =>
      prev.map(m => (m.id === id ? { ...m, status: 'pending', completed_at: null } : m))
    )

    const toastId = crypto.randomUUID()
    setToasts(prev => [
      ...prev,
      {
        id: toastId,
        text: `-${result.xp_reversed} XP (Reversed)`,
      },
    ])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 2800)

    router.refresh()
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError(null)
    const { error } = await generateMissions()
    if (error) {
      setGenError(error)
      setGenerating(false)
      return
    }
    router.refresh()
    setGenerating(false)
  }

  // ── Pre-requisite warnings ──────────────────────────────────────────────
  const renderBlockers = () => {
    if (hasExamDates && hasChapterData) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {!hasExamDates && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.2)',
          }}>
            <Calendar size={15} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--warning)', marginBottom: 2 }}>
                No exam dates set
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                The Mission Engine needs an exam date to calculate urgency scores. Set one in your subject settings.
              </div>
            </div>
          </div>
        )}
        {!hasChapterData && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(124,109,250,0.08)',
            border: '1px solid rgba(124,109,250,0.15)',
          }}>
            <BookOpen size={15} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 2 }}>
                No chapter activity yet
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Visit a subject and interact with at least one chapter so the Mission Engine has data to score.
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* XP Toast stack */}
      <div style={{ position: 'fixed', top: 80, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              style={{
                background: t.levelUp
                  ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  : 'var(--bg-card)',
                border: `1px solid ${t.levelUp ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: t.levelUp ? '#fff' : 'var(--text-primary)',
                fontSize: '0.875rem',
                fontWeight: 700,
                boxShadow: t.levelUp ? '0 0 20px rgba(124,109,250,0.4)' : 'var(--shadow-md)',
                pointerEvents: 'none',
              }}
            >
              {t.text.startsWith('-') ? (
                <RotateCcw size={16} color="var(--warning)" strokeWidth={2.5} />
              ) : (
                <Zap size={16} strokeWidth={2.5} />
              )}
              {t.levelUp ? `Level Up — ${t.levelTitle}!` : t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* No missions state */}
      {missions.length === 0 ? (
        <div>
          {renderBlockers()}
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <Zap size={28} color="var(--accent-primary)" style={{ margin: '0 auto 12px', opacity: 0.6 }} />
            <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.875rem', lineHeight: 1.6 }}>
              {hasExamDates && hasChapterData
                ? 'No missions generated yet for today.'
                : 'Resolve the issues above, then generate your missions.'}
            </p>
            {genError && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.2)',
                marginBottom: 12,
                textAlign: 'left',
                fontSize: '0.8rem',
                color: 'var(--danger)',
              }}>
                <AlertCircle size={14} />
                {genError}
              </div>
            )}
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={generating}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={14} style={{ animation: generating ? 'spin 1s linear infinite' : 'none' }} />
              {generating ? 'Generating…' : 'Generate Missions'}
            </button>
          </div>
        </div>
      ) : allDone ? (
        /* All missions complete */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              textAlign: 'center',
              padding: '24px 20px',
              background: 'linear-gradient(135deg, rgba(52,211,153,0.08), rgba(52,211,153,0.03))',
              border: '1px solid rgba(52,211,153,0.2)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <PartyPopper size={30} color="var(--success)" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--success)', marginBottom: 2 }}>
              All missions complete!
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Come back tomorrow for new missions.
            </div>
          </motion.div>

          {/* Render cards so user can still see them and undo if needed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {missions.map(mission => (
              <MissionCard
                key={mission.id}
                mission={mission}
                onComplete={handleComplete}
                onUndo={handleUndo}
              />
            ))}
          </div>
        </div>
      ) : (
        /* Mission list */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {completedCount} / {missions.length} done
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {missions.map((m, i) => (
                <div key={i} style={{
                  width: 20,
                  height: 4,
                  borderRadius: 2,
                  background: m.status === 'completed' ? 'var(--success)' : 'var(--bg-overlay)',
                  transition: 'background 300ms ease',
                }} />
              ))}
            </div>
          </div>
          <AnimatePresence>
            {missions.map(mission => (
              <MissionCard
                key={mission.id}
                mission={mission}
                onComplete={handleComplete}
                onUndo={handleUndo}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
