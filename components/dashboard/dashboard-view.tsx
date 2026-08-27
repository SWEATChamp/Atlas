'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Flame, Target, TrendingUp, AlertTriangle, AlertCircle, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import MissionList from '@/components/dashboard/mission-list'
import XpLevelBar from '@/components/dashboard/xp-level-bar'
import SubjectReadinessList from '@/components/dashboard/subject-readiness-list'
import RouteSelectionBanner from '@/components/subjects/route-selection-banner'
import { dateInTimeZone, hourInTimeZone } from '@/lib/date'
import { getExamDateCoverage } from '@/lib/dashboard-display'
import {
  type ClientDashboardState,
  applyMissionCompletion,
  applyMissionUndo,
  applyMissionReplace,
} from '@/lib/dashboard-state'
import { generateMissions } from '@/lib/actions/dashboard'
import type { DashboardData, CompleteMissionResult } from '@/lib/actions/dashboard'
import type { UndoMissionResult, ReplaceMissionResult } from '@/types/database'
import type { Subject, UserSubject } from '@/types'

function greeting(timeZone: string): string {
  const h = hourInTimeZone(new Date(), timeZone)
  if (h >= 5  && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  if (h >= 17 && h < 21) return 'Good evening'
  return 'Hey'
}

interface XpToast {
  id: string
  text: string
  type?: 'success' | 'reversal' | 'error'
  levelUp?: boolean
  levelTitle?: string
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

interface DashboardViewProps {
  initialData: DashboardData
  unconfirmedSubjects: { enrollment: UserSubject; subject: Subject }[]
}

export default function DashboardView({ initialData, unconfirmedSubjects }: DashboardViewProps) {
  const router = useRouter()
  const [prevInitialData, setPrevInitialData] = useState(initialData)
  const [state, setState] = useState<ClientDashboardState>({
    profile: initialData.profile,
    streak: initialData.streak,
    missions: initialData.today_missions.filter((m) => m.status !== 'skipped'),
  })
  const [toasts, setToasts] = useState<XpToast[]>([])
  const [generating, setGenerating] = useState(false)

  // Sync state when server initialData updates (adjusting state during render)
  if (prevInitialData !== initialData) {
    setPrevInitialData(initialData)
    setState({
      profile: initialData.profile,
      streak: initialData.streak,
      missions: initialData.today_missions.filter((m) => m.status !== 'skipped'),
    })
  }

  const { profile, streak, missions } = state
  const {
    has_exam_dates,
    has_chapter_data,
    has_unconfirmed_routes,
    subject_readiness,
  } = initialData

  const activeMissions = missions.filter((m) => m.status !== 'skipped')
  const completedToday = activeMissions.filter((m) => m.status === 'completed').length
  const totalMissions  = activeMissions.length
  const localToday     = dateInTimeZone(new Date(), profile.timezone)
  const streakActive   = streak.active_today ?? streak.last_date === localToday
  const greetingName   = profile.username || (profile.full_name?.split(' ')[0] ?? 'there')
  const examDateCoverage = getExamDateCoverage(
    subject_readiness.map((subject) => subject.exam_date)
  )

  const handleComplete = (id: string, result: CompleteMissionResult) => {
    setState((prev) => applyMissionCompletion(prev, id, result))

    const breakdownText = formatCompletionBreakdown(result)
    const toastId = crypto.randomUUID()
    setToasts((prev) => [
      ...prev,
      {
        id: toastId,
        text: breakdownText,
        type: 'success',
        levelUp: result.levelled_up,
        levelTitle: result.level_title,
      },
    ])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 3500)

    router.refresh()
  }

  const handleUndo = (id: string, result: UndoMissionResult) => {
    setState((prev) => applyMissionUndo(prev, id, result))

    const breakdownText = formatUndoBreakdown(result)
    const toastId = crypto.randomUUID()
    setToasts((prev) => [
      ...prev,
      {
        id: toastId,
        text: breakdownText,
        type: 'reversal',
      },
    ])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 3500)

    router.refresh()
  }

  const handleReplace = (id: string, result: ReplaceMissionResult) => {
    setState((prev) => applyMissionReplace(prev, id, result))

    const toastId = crypto.randomUUID()
    setToasts((prev) => [
      ...prev,
      {
        id: toastId,
        text: `Replaced with "${result.new_mission.title}"`,
        type: 'success',
      },
    ])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 3500)

    router.refresh()
  }

  const handleError = (errorMsg: string) => {
    const toastId = crypto.randomUUID()
    setToasts((prev) => [
      ...prev,
      {
        id: toastId,
        text: errorMsg,
        type: 'error',
      },
    ])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 4000)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    const { error } = await generateMissions()
    if (error) {
      handleError(`Generation failed: ${error}`)
      setGenerating(false)
      return
    }
    router.refresh()
    setGenerating(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 920 }}>
      {/* XP Toast stack */}
      <div style={{ position: 'fixed', top: 80, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              style={{
                background: t.levelUp
                  ? 'var(--accent-strong)'
                  : t.type === 'error'
                  ? 'rgba(239, 68, 68, 0.92)'
                  : 'var(--bg-card)',
                border: `1px solid ${t.levelUp ? 'var(--accent-primary)' : t.type === 'error' ? 'var(--danger)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: t.levelUp || t.type === 'error' ? '#fff' : 'var(--text-primary)',
                fontSize: '0.875rem',
                fontWeight: 700,
                boxShadow: 'var(--shadow-md)',
                pointerEvents: 'none',
              }}
            >
              {t.type === 'error' ? (
                <AlertCircle size={16} color="#fff" strokeWidth={2.5} />
              ) : t.type === 'reversal' || t.text.startsWith('-') ? (
                <RotateCcw size={16} color="var(--warning)" strokeWidth={2.5} />
              ) : (
                <Zap size={16} strokeWidth={2.5} />
              )}
              {t.levelUp ? `Level Up — ${t.levelTitle}!` : t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Unconfirmed route banner if any subject is unconfirmed ─────── */}
      {has_unconfirmed_routes && (
        <RouteSelectionBanner unconfirmedSubjects={unconfirmedSubjects} />
      )}

      {/* ── Hero greeting bar ──────────────────────────────────────────────── */}
      <div
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          padding: '4px 0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              fontFamily: 'var(--font-display)',
            }}
          >
            {greeting(profile.timezone)}, {greetingName}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {totalMissions > 0
              ? `${completedToday}/${totalMissions} missions done today`
              : "Your missions are ready. Let's study!"}
          </p>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Streak chip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 0',
            }}
          >
            <Flame size={16} color={streakActive ? '#FF7B35' : 'var(--text-muted)'} />
            <span
              style={{
                fontWeight: 700,
                fontSize: '0.9rem',
                color: streakActive ? '#FF7B35' : 'var(--text-muted)',
              }}
            >
              {streak.current} day{streak.current !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Level chip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 0',
            }}
          >
            <Zap size={16} color="var(--accent-primary)" />
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-primary)' }}>
              Lv.{profile.current_level} · {profile.level_title}
            </span>
          </div>
        </div>
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 280px',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {/* Left: Missions */}
        <div className="card" style={{ padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'var(--accent-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Target size={17} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Today&apos;s Missions
              </h2>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Complete missions to earn XP
              </div>
            </div>
            {totalMissions > 0 && (
              <div
                style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                }}
              >
                {completedToday}/{totalMissions}
              </div>
            )}
          </div>
          <MissionList
            missions={activeMissions}
            examDateCoverage={has_exam_dates ? 'all' : examDateCoverage}
            hasChapterData={has_chapter_data}
            onComplete={handleComplete}
            onUndo={handleUndo}
            onReplace={handleReplace}
            onError={handleError}
            onGenerate={handleGenerate}
            generating={generating}
          />
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* XP & Level card */}
          <div className="card" style={{ padding: 'var(--space-5)' }}>
            <div
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 14,
              }}
            >
              XP & Level
            </div>
            <XpLevelBar
              totalXp={profile.total_xp}
              level={profile.current_level}
              levelTitle={profile.level_title}
            />
          </div>

          {/* Streak card */}
          <div className="card" style={{ padding: 'var(--space-5)' }}>
            <div
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 14,
              }}
            >
              Study Streak
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Flame size={28} color={streakActive ? '#b98255' : 'var(--text-muted)'} />
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.75rem',
                    fontWeight: 800,
                    lineHeight: 1,
                    color: streakActive ? '#FF7B35' : 'var(--text-muted)',
                  }}
                >
                  {streak.current}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  day{streak.current !== 1 ? 's' : ''} · best: {streak.longest}
                </div>
              </div>
            </div>
            {!streakActive && streak.current > 0 && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: '0.7rem',
                  color: 'var(--warning)',
                  background: 'rgba(251,191,36,0.08)',
                  border: '1px solid rgba(251,191,36,0.15)',
                  borderRadius: 6,
                  padding: '6px 10px',
                }}
              >
                <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                Study today to keep your streak.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Subject readiness ──────────────────────────────────────────────── */}
      {subject_readiness.length > 0 && (
        <section
          style={{
            paddingTop: 'var(--space-5)',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(52,211,153,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TrendingUp size={17} color="var(--success)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Subject Readiness
              </h2>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Notes 35% · Papers 40% · Confidence 25%
              </div>
            </div>
          </div>
          <SubjectReadinessList subjects={subject_readiness} />
        </section>
      )}
    </div>
  )
}
