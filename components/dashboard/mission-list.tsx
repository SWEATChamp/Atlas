'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Zap, CheckCircle2, RefreshCw, Calendar, BookOpen, Clock } from 'lucide-react'
import MissionCard from './mission-card'
import type { DailyMission, CompleteMissionResult } from '@/lib/actions/dashboard'
import type { UndoMissionResult, ReplaceMissionResult } from '@/types/database'
import type { ExamDateCoverage } from '@/lib/dashboard-display'

interface MissionListProps {
  missions: DailyMission[]
  examDateCoverage: ExamDateCoverage
  hasChapterData: boolean
  onComplete: (id: string, result: CompleteMissionResult) => void
  onUndo: (id: string, result: UndoMissionResult) => void
  onReplace: (id: string, result: ReplaceMissionResult) => void
  onError: (errorMsg: string) => void
  onGenerate: () => Promise<void>
  generating: boolean
}

export function calculateCompletionTotalXp(result: CompleteMissionResult): number {
  return (
    result.total_xp_awarded ??
    (result.mission_xp +
      result.daily_bonus_xp +
      result.achievement_xp +
      (result.streak_bonus_xp ?? 0))
  )
}

export function formatCompletionBreakdown(result: CompleteMissionResult): string {
  const totalAwarded = calculateCompletionTotalXp(result)
  const parts: string[] = []
  if (result.mission_xp) parts.push(`+${result.mission_xp} Mission`)
  if (result.daily_bonus_xp) parts.push(`+${result.daily_bonus_xp} All-Done Bonus`)
  if (result.achievement_xp) parts.push(`+${result.achievement_xp} Achievement`)
  if (result.streak_bonus_xp) parts.push(`+${result.streak_bonus_xp} Streak Bonus`)

  return parts.length > 1
    ? `+${totalAwarded} XP (${parts.join(', ')})`
    : `+${totalAwarded} XP`
}

export function formatUndoBreakdown(result: UndoMissionResult): string {
  const parts: string[] = []
  if (result.mission_xp_reversed) parts.push(`-${result.mission_xp_reversed} Mission`)
  if (result.daily_bonus_xp_reversed) parts.push(`-${result.daily_bonus_xp_reversed} Bonus`)
  if (result.achievement_xp_reversed) parts.push(`-${result.achievement_xp_reversed} Achievement`)
  if (result.streak_bonus_xp_reversed) parts.push(`-${result.streak_bonus_xp_reversed} Streak Bonus`)

  return parts.length > 1
    ? `-${result.xp_reversed} XP (${parts.join(', ')})`
    : `-${result.xp_reversed} XP (Reversed)`
}

export default function MissionList({
  missions,
  examDateCoverage,
  hasChapterData,
  onComplete,
  onUndo,
  onReplace,
  onError,
  onGenerate,
  generating,
}: MissionListProps) {
  const activeMissions = missions.filter((m) => m.status !== 'skipped')
  const completedCount = activeMissions.filter((m) => m.status === 'completed').length
  const allDone = completedCount === activeMissions.length && activeMissions.length > 0
  const totalEstimatedMinutes = activeMissions.reduce(
    (acc, m) => acc + (m.estimated_minutes || 30),
    0
  )

  // ── Pre-requisite warnings ──────────────────────────────────────────────
  const renderBlockers = () => {
    if (examDateCoverage === 'all' && hasChapterData) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {examDateCoverage !== 'all' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(196,160,93,0.08)',
              border: '1px solid rgba(196,160,93,0.2)',
            }}
          >
            <Calendar size={15} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--warning)',
                  marginBottom: 2,
                }}
              >
                {examDateCoverage === 'some'
                  ? 'Some subjects are missing exam dates'
                  : 'No exam dates set'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {examDateCoverage === 'some'
                  ? 'Add the remaining dates so urgency stays accurate across every subject.'
                  : 'The Mission Engine needs an exam date to calculate urgency scores. Set one in your subject settings.'}
              </div>
            </div>
          </div>
        )}
        {!hasChapterData && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-soft)',
              border: '1px solid var(--border-accent)',
            }}
          >
            <BookOpen size={15} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--accent-primary)',
                  marginBottom: 2,
                }}
              >
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
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Section Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2
              style={{
                fontSize: '1.125rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.015em',
              }}
            >
              Daily Missions
            </h2>
            {activeMissions.length > 0 && (
              <>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: allDone ? 'rgba(121,169,139,0.15)' : 'var(--bg-elevated)',
                    color: allDone ? 'var(--success)' : 'var(--text-secondary)',
                    border: `1px solid ${allDone ? 'rgba(121,169,139,0.3)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {completedCount}/{activeMissions.length} completed
                </span>
                {totalEstimatedMinutes > 0 && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Clock size={12} style={{ opacity: 0.7 }} />
                    ~{totalEstimatedMinutes} min planned
                  </span>
                )}
              </>
            )}
          </div>
          <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Complete missions to earn XP and level up
          </p>
        </div>

        {/* Generate / Refresh button */}
        <button
          type="button"
          className="mission-header-btn touch-target-btn"
          onClick={onGenerate}
          disabled={generating}
          aria-label={generating ? 'Generating missions' : activeMissions.length === 0 ? 'Generate Missions' : 'Refresh daily missions'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: generating ? 'not-allowed' : 'pointer',
            transition: 'all 150ms ease',
            opacity: generating ? 0.6 : 1,
            minHeight: 44,
          }}
        >
          <RefreshCw
            size={13}
            style={{
              animation: generating ? 'spin 1s linear infinite' : 'none',
            }}
          />
          <span>{generating ? 'Generating…' : activeMissions.length === 0 ? 'Generate Missions' : 'Refresh'}</span>
        </button>
      </div>

      {/* Blockers */}
      {renderBlockers()}

      {/* All-done celebratory banner */}
      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 4 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            style={{
              background: 'rgba(121,169,139,0.08)',
              border: '1px solid rgba(121,169,139,0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <CheckCircle2 size={20} color="var(--success)" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                All missions complete for today
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                Great work! Missions refresh tomorrow, or log a past paper attempt for additional XP.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mission list */}
      {activeMissions.length === 0 ? (
        <div
          style={{
            padding: '36px 20px',
            textAlign: 'center',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-card)',
            border: '1px dashed var(--border-subtle)',
          }}
        >
          <div
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: 4,
            }}
          >
            No missions generated for today yet
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 14 }}>
            {examDateCoverage === 'all' && hasChapterData
              ? 'Click below to generate your personalised daily study missions.'
              : 'Add your exam dates and start revising chapters to unlock daily missions.'}
          </div>
          {examDateCoverage === 'all' && hasChapterData && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onGenerate}
              disabled={generating}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 18px',
                minHeight: 40,
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Zap size={14} />
              <span>Generate Missions</span>
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeMissions.map((m) => (
            <MissionCard
              key={m.id}
              mission={m}
              onComplete={onComplete}
              onUndo={onUndo}
              onReplace={onReplace}
              onError={onError}
            />
          ))}
        </div>
      )}
    </div>
  )
}
