import { Zap, Flame, Target, TrendingUp } from 'lucide-react'
import { getDashboardData } from '@/lib/actions/dashboard'
import MissionList from '@/components/dashboard/mission-list'
import XpLevelBar from '@/components/dashboard/xp-level-bar'
import SubjectReadinessList from '@/components/dashboard/subject-readiness-list'
import RouteSelectionBanner from '@/components/subjects/route-selection-banner'
import { dateInTimeZone, hourInTimeZone } from '@/lib/date'
import type { Subject, UserSubject } from '@/types'

function greeting(timeZone: string): string {
  const h = hourInTimeZone(new Date(), timeZone)
  if (h >= 5  && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  if (h >= 17 && h < 21) return 'Good evening'
  return 'Hey'
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--text-muted)' }}>
        Failed to load dashboard. Please refresh.
      </div>
    )
  }

  const {
    profile,
    streak,
    has_exam_dates,
    has_chapter_data,
    has_unconfirmed_routes,
    today_missions,
    subject_readiness,
  } = data

  const firstName = profile.full_name?.split(' ')[0] ?? 'there'
  const activeMissions = today_missions.filter((m) => m.status !== 'skipped')
  const completedToday = activeMissions.filter((m) => m.status === 'completed').length
  const totalMissions  = activeMissions.length
  const localToday     = dateInTimeZone(new Date(), profile.timezone)
  const streakActive   = streak.active_today ?? streak.last_date === localToday

  const unconfirmedSubjects = subject_readiness
    .filter((s) => s.study_route === 'unconfirmed')
    .map((s) => ({
      enrollment: {
        id: s.user_subject_id || s.subject_id,
        user_id: '',
        subject_id: s.subject_id,
        exam_date: s.exam_date,
        target_grade: null,
        priority: 1,
        is_archived: false,
        study_route: s.study_route,
        current_stage: s.current_stage,
        a2_unlocked_at: null,
        a2_unlock_method: null,
        created_at: '',
        updated_at: '',
      } as UserSubject,
      subject: {
        id: s.subject_id,
        name: s.subject_name,
        code: null,
        color_hex: s.color_hex,
        icon: 'BookOpen',
        is_global: true,
        created_by: null,
        created_at: '',
      } as Subject,
    }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 920 }}>
      {/* ── Unconfirmed route banner if any subject is unconfirmed ─────── */}
      {has_unconfirmed_routes && (
        <RouteSelectionBanner unconfirmedSubjects={unconfirmedSubjects} />
      )}

      {/* ── Hero greeting bar ──────────────────────────────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(124,109,250,0.12) 0%, rgba(167,139,250,0.06) 100%)',
          border: '1px solid rgba(124,109,250,0.2)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
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
            {greeting(profile.timezone)}, {firstName}! 👋
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
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              background: streakActive ? 'rgba(255,123,53,0.12)' : 'var(--bg-overlay)',
              border: `1px solid ${streakActive ? 'rgba(255,123,53,0.25)' : 'var(--border-subtle)'}`,
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
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(124,109,250,0.1)',
              border: '1px solid rgba(124,109,250,0.2)',
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
                background: 'rgba(124,109,250,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Target size={17} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Today's Missions
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
            hasExamDates={has_exam_dates}
            hasChapterData={has_chapter_data}
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
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 'var(--radius-md)',
                  background: streakActive ? 'rgba(255,123,53,0.12)' : 'var(--bg-overlay)',
                  border: `1px solid ${streakActive ? 'rgba(255,123,53,0.25)' : 'var(--border-subtle)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                }}
              >
                🔥
              </div>
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
                ⚠️ Study today to keep your streak!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Subject readiness ──────────────────────────────────────────────── */}
      {subject_readiness.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-5)' }}>
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
        </div>
      )}
    </div>
  )
}
