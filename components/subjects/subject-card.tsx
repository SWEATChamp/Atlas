'use client'

import Link from 'next/link'
import {
  Calculator, Sigma, Zap, FlaskConical, Leaf, Code2, TrendingUp,
  BookOpen, Globe, Type, BookMarked, Brain, Users, Briefcase,
  Receipt, Scale, Film, Waves, GraduationCap,
  type LucideIcon,
} from 'lucide-react'
import ReadinessBar from './readiness-bar'
import type { SubjectWithProgress } from '@/lib/actions/subjects'

const ICON_MAP: Record<string, LucideIcon> = {
  Calculator, Sigma, Zap, FlaskConical, Leaf, Code2, TrendingUp,
  BookOpen, Globe, Type, BookMarked, Brain, Users, Briefcase,
  Receipt, Scale, Film, Waves,
}

function ExamCountdown({ days }: { days: number | null }) {
  if (days === null) return null

  const text =
    days < 0
      ? 'Exam passed'
      : days === 0
      ? 'Exam today!'
      : days === 1
      ? '1 day left'
      : `${days} days left`

  const urgency =
    days !== null && days < 0
      ? 'var(--text-muted)'
      : days !== null && days <= 14
      ? 'var(--danger)'
      : days !== null && days <= 60
      ? 'var(--warning)'
      : 'var(--text-muted)'

  return (
    <span style={{ fontSize: '0.75rem', color: urgency, fontWeight: 500 }}>
      {text}
    </span>
  )
}

export default function SubjectCard({ data }: { data: SubjectWithProgress }) {
  const {
    subject,
    enrollment,
    totalChapters,
    completedChapters,
    inProgressChapters,
    as_readiness,
    a2_readiness,
    daysUntilExam,
  } = data

  const Icon = ICON_MAP[subject.icon] ?? GraduationCap
  const isUnconfirmed = enrollment.study_route === 'unconfirmed'
  const isSeparateStages =
    enrollment.study_route === 'full_level' ||
    (enrollment.study_route === 'staged' && enrollment.current_stage === 'a2')

  return (
    <Link
      href={`/subjects/${subject.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        className="card card-interactive"
        style={{
          overflow: 'hidden',
          cursor: 'pointer',
        }}
      >
        {/* Colour accent bar */}
        <div
          style={{
            height: 4,
            background: subject.color_hex,
          }}
        />

        <div style={{ padding: '20px 22px 22px' }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 'var(--radius-md)',
                  background: `${subject.color_hex}18`,
                  border: `1px solid ${subject.color_hex}30`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={20} color={subject.color_hex} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                  {subject.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  {subject.code && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {subject.code}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      color: isUnconfirmed ? 'var(--warning)' : 'var(--text-secondary)',
                      background: 'var(--bg-overlay)',
                      padding: '1px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {isUnconfirmed
                      ? 'Route Unconfirmed'
                      : enrollment.study_route === 'as_only'
                      ? 'AS Only'
                      : enrollment.study_route === 'staged'
                      ? `Staged (${enrollment.current_stage?.toUpperCase()})`
                      : 'Full A Level'}
                  </span>
                </div>
              </div>
            </div>

            {/* Target grade */}
            {enrollment.target_grade && (
              <div
                style={{
                  padding: '3px 10px',
                  borderRadius: 99,
                  background: `${subject.color_hex}18`,
                  border: `1px solid ${subject.color_hex}30`,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: subject.color_hex,
                  flexShrink: 0,
                }}
              >
                Target {enrollment.target_grade}
              </div>
            )}
          </div>

          {/* Readiness */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Readiness
              </span>
              <ExamCountdown days={daysUntilExam} />
            </div>

            {isUnconfirmed ? (
              <div style={{ fontSize: '0.75rem', color: 'var(--warning)', fontStyle: 'italic' }}>
                Configure study route to track readiness
              </div>
            ) : isSeparateStages ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                    AS Stage
                  </div>
                  <ReadinessBar value={as_readiness} height={5} />
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                    A2 Stage
                  </div>
                  <ReadinessBar value={a2_readiness} height={5} />
                </div>
              </div>
            ) : (
              <ReadinessBar value={as_readiness} />
            )}
          </div>

          {/* Chapter stats */}
          {totalChapters > 0 ? (
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { label: 'Complete', value: completedChapters, color: 'var(--success)' },
                { label: 'In Progress', value: inProgressChapters, color: 'var(--warning)' },
                { label: 'Total', value: totalChapters, color: 'var(--text-muted)' },
              ].map((s) => (
                <div key={s.label} style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: s.color }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-disabled)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              No chapters seeded yet
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}
