'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Calendar, ChevronRight } from 'lucide-react'
import type { SubjectReadiness } from '@/lib/actions/dashboard'
import { formatExamCountdown } from '@/lib/dashboard-display'

interface SubjectReadinessListProps {
  subjects: SubjectReadiness[]
}

export default function SubjectReadinessList({ subjects }: SubjectReadinessListProps) {
  if (subjects.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {subjects.map((s, i) => {
        const isUnconfirmed = s.study_route === 'unconfirmed'
        const hasSeparateStages = s.study_route === 'full_level' || (s.study_route === 'staged' && s.current_stage === 'a2')
        const days = typeof s.days_until === 'number' && Number.isFinite(s.days_until)
          ? s.days_until
          : null
        const examCountdown = formatExamCountdown(days)

        const examChip = days !== null && examCountdown !== null ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background:
                days <= 14
                  ? 'rgba(199,123,123,0.12)'
                  : days <= 60
                  ? 'rgba(196,160,93,0.10)'
                  : 'var(--bg-overlay)',
              color:
                days <= 14
                  ? 'var(--danger)'
                  : days <= 60
                  ? 'var(--warning)'
                  : 'var(--text-muted)',
              fontSize: '0.7rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            <Calendar size={11} />
            <span>{examCountdown}</span>
          </div>
        ) : null

        return (
          <Link
            key={s.subject_id}
            href={`/subjects/${s.subject_id}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div
              className="card card-interactive"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
            >
              {/* Left: Dot & Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: s.color_hex,
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {s.subject_name}
                  </div>
                  {isUnconfirmed ? (
                    <div style={{ fontSize: '0.72rem', color: 'var(--warning)', marginTop: 2 }}>
                      Route unconfirmed
                    </div>
                  ) : hasSeparateStages ? (
                    <div style={{ display: 'flex', gap: 12, marginTop: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        AS:{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {s.as_readiness !== null ? `${Math.round(s.as_readiness)}%` : '--'}
                        </strong>
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        A2:{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {s.a2_readiness !== null ? `${Math.round(s.a2_readiness)}%` : '--'}
                        </strong>
                      </span>
                    </div>
                  ) : (
                    <div
                      role="progressbar"
                      aria-valuenow={Math.round(s.as_readiness ?? 0)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${s.subject_name} AS readiness`}
                      style={{ height: 4, width: 100, borderRadius: 2, background: 'var(--bg-overlay)', marginTop: 4, overflow: 'hidden' }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(s.as_readiness ?? 0, 100)}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 + i * 0.04 }}
                        style={{
                          height: '100%',
                          borderRadius: 2,
                          background: s.color_hex,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Score/Badge + Exam chip + Chevron */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                {!isUnconfirmed && !hasSeparateStages && (
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      color:
                        (s.as_readiness ?? 0) >= 70
                          ? 'var(--success)'
                          : (s.as_readiness ?? 0) >= 40
                          ? 'var(--warning)'
                          : 'var(--danger)',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {s.as_readiness !== null ? `${Math.round(s.as_readiness)}%` : '--'}
                  </div>
                )}

                {examChip}
                <ChevronRight size={14} color="var(--text-muted)" />
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
