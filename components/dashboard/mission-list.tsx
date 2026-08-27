'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Zap, PartyPopper, RefreshCw, Calendar, BookOpen, Clock } from 'lucide-react'
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
              background: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.2)',
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
    <div style={{ position: 'relative' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
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
                    borderRadius: 99,
                    background: allDone ? 'rgba(52,211,153,0.15)' : 'var(--bg-elevated)',
                    color: allDone ? 'var(--success)' : 'var(--text-muted)',
                    border: `1px solid ${allDone ? 'rgba(52,211,153,0.3)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {completedCount}/{activeMissions.length} done
                </span>
                {totalEstimatedMinutes > 0 && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
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
          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Complete missions to earn XP and level up
          </p>
        </div>

        {/* Generate / Refresh button */}
        <button
          onClick={onGenerate}
          disabled={generating}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: generating ? 'not-allowed' : 'pointer',
            transition: 'all 150ms ease',
            opacity: generating ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!generating) {
              e.currentTarget.style.borderColor = 'var(--text-secondary)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          <RefreshCw
            size={12}
            style={{
              animation: generating ? 'spin 1s linear infinite' : 'none',
            }}
          />
          {generating ? 'Generating…' : activeMissions.length === 0 ? 'Generate Missions' : 'Refresh'}
        </button>
      </div>

      {/* Blockers */}
      {renderBlockers()}

      {/* All-done celebratory banner */}
      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            style={{
              background: 'var(--accent-soft)',
              border: '1px solid var(--border-accent)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <PartyPopper size={20} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                All missions complete for today
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 1 }}>
                Great work! Missions refresh tomorrow, or attempt a past paper for bonus XP.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mission list */}
      {activeMissions.length === 0 ? (
        <div
          style={{
            padding: '32px 16px',
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
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            {examDateCoverage === 'all' && hasChapterData
              ? 'Click below to generate your personalised daily study missions.'
              : 'Add your exam dates and start revising chapters to unlock daily missions.'}
          </div>
          {examDateCoverage === 'all' && hasChapterData && (
            <button
              onClick={onGenerate}
              disabled={generating}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-primary)',
                border: 'none',
                color: '#fff',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Zap size={14} />
              Generate Missions
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
