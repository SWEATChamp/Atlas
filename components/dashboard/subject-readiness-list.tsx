'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Calendar, ChevronRight } from 'lucide-react'
import type { SubjectReadiness } from '@/lib/actions/dashboard'

interface SubjectReadinessListProps {
  subjects: SubjectReadiness[]
}

export default function SubjectReadinessList({ subjects }: SubjectReadinessListProps) {
  if (subjects.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {subjects.map((s, i) => {
        const pct   = Math.min(Number(s.readiness), 100)
        const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)'
        const days  = s.days_until

        const examChip = days !== null ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            borderRadius: 99,
            background: days <= 14 ? 'rgba(248,113,113,0.12)' : days <= 60 ? 'rgba(251,191,36,0.10)' : 'var(--bg-overlay)',
            color: days <= 14 ? 'var(--danger)' : days <= 60 ? 'var(--warning)' : 'var(--text-muted)',
            fontSize: '0.7rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            <Calendar size={10} />
            {days < 0 ? 'Exam passed' : days === 0 ? 'Today!' : `${days}d`}
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
                display: 'grid',
                gridTemplateColumns: '10px 1fr 48px auto 20px',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                transition: 'border-color 150ms, background 150ms',
              }}
              whileHover={{ borderColor: s.color_hex + '60', backgroundColor: s.color_hex + '06' }}
            >
              {/* Subject colour dot */}
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color_hex, flexShrink: 0 }} />

              {/* Name + bar */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.subject_name}
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 + i * 0.06 }}
                    style={{ height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${s.color_hex}, ${s.color_hex}aa)` }}
                  />
                </div>
              </div>

              {/* Readiness % */}
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {pct.toFixed(0)}%
              </div>

              {/* Exam chip */}
              <div>{examChip}</div>

              {/* Chevron */}
              <ChevronRight size={14} color="var(--text-muted)" />
            </motion.div>
          </Link>
        )
      })}
    </div>
  )
}
