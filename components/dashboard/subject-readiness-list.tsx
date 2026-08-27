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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
              padding: '3px 8px',
              borderRadius: 99,
              background:
                days <= 14
                  ? 'rgba(248,113,113,0.12)'
                  : days <= 60
                  ? 'rgba(251,191,36,0.10)'
                  : 'var(--bg-overlay)',
              color:
                days <= 14
                  ? 'var(--danger)'
                  : days <= 60
                  ? 'var(--warning)'
                  : 'var(--text-muted)',
              fontSize: '0.7rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            <Calendar size={10} />
            {examCountdown}
          </div>
        ) : null

        return (
          <Link
            key={s.subject_id}
            href={`/subjects/${s.subject_id}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
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
                transition: 'border-color 150ms, background 150ms',
              }}
              whileHover={{
                borderColor: s.color_hex + '60',
                backgroundColor: s.color_hex + '06',
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
                    <div style={{ height: 4, width: 100, borderRadius: 2, background: 'var(--bg-overlay)', marginTop: 4, overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(s.as_readiness ?? 0, 100)}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 + i * 0.06 }}
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
            </motion.div>
          </Link>
        )
      })}
    </div>
  )
}
