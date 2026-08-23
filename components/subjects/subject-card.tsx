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
  const { subject, enrollment, totalChapters, completedChapters, inProgressChapters, readiness, daysUntilExam } = data
  const Icon = ICON_MAP[subject.icon] ?? GraduationCap

  return (
    <Link
      href={`/subjects/${subject.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: `1px solid var(--border-subtle)`,
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          transition: 'border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget
          el.style.borderColor = `${subject.color_hex}50`
          el.style.transform = 'translateY(-3px)'
          el.style.boxShadow = `0 8px 32px ${subject.color_hex}18`
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget
          el.style.borderColor = 'var(--border-subtle)'
          el.style.transform = 'translateY(0)'
          el.style.boxShadow = 'none'
        }}
      >
        {/* Colour accent bar */}
        <div
          style={{
            height: 4,
            background: `linear-gradient(90deg, ${subject.color_hex}, ${subject.color_hex}80)`,
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
                {subject.code && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>
                    {subject.code}
                  </div>
                )}
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
            <ReadinessBar value={readiness} />
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
