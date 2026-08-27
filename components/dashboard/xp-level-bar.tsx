'use client'

import { motion } from 'framer-motion'
import { xpProgress } from '@/lib/xp'

interface XpLevelBarProps {
  totalXp: number
  level: number
  levelTitle: string
}

export default function XpLevelBar({ totalXp, level, levelTitle }: XpLevelBarProps) {
  const { pct, xpInLevel, xpNeeded } = xpProgress(totalXp, level)
  const isMaxLevel = level >= 15

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Level badge + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-md)',
          background: 'var(--accent-strong)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: '1.125rem',
          color: '#fff',
          flexShrink: 0,
        }}>
          {level}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>
            {levelTitle}
          </div>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Level {level}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
            {totalXp.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total XP</div>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div style={{
          height: 8,
          borderRadius: 4,
          background: 'var(--bg-overlay)',
          overflow: 'hidden',
          position: 'relative',
        }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
            style={{
              height: '100%',
              borderRadius: 4,
              background: 'var(--accent-primary)',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {isMaxLevel ? 'Max level reached' : `${xpInLevel} / ${xpNeeded} XP`}
          </span>
          {!isMaxLevel && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Level {level + 1}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
