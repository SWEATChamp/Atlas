'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ChapterRow from './chapter-row'
import type { ComponentGroup } from '@/lib/actions/subjects'

// ─── Maths (9709) combinations ────────────────────────────────────────────────
// CAIE A Level students pick TWO applied papers alongside Pure 1 & 3.
// These are the two most common routes.

const MATHS_COMBOS = [
  {
    id: 'mech',
    label: 'Mechanics route',
    description: 'Papers 1, 3, 4, 5 — Pure 1 + Pure 3 + Mechanics + Stats 1',
    components: ['Pure 1', 'Pure 3', 'Mechanics', 'Statistics 1'],
  },
  {
    id: 'stats',
    label: 'Statistics route',
    description: 'Papers 1, 3, 5, 6 — Pure 1 + Pure 3 + Stats 1 + Stats 2',
    components: ['Pure 1', 'Pure 3', 'Statistics 1', 'Statistics 2'],
  },
  {
    id: 'all',
    label: 'All components',
    description: 'Show every component (useful if taking AS + A Level)',
    components: null, // null = no filter
  },
] as const

type ComboId = (typeof MATHS_COMBOS)[number]['id']

interface Props {
  subjectId: string
  isMaths: boolean
  groups: ComponentGroup[]
  subjectColor: string
}

export default function ChapterGroups({ subjectId, isMaths, groups, subjectColor }: Props) {
  const storageKey = `atlas_combo_${subjectId}`
  const [combo, setCombo] = useState<ComboId>('all')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(storageKey) as ComboId | null
    if (saved) setCombo(saved)
    setMounted(true)
  }, [storageKey])

  const handleComboChange = (id: ComboId) => {
    setCombo(id)
    localStorage.setItem(storageKey, id)
  }

  const activeCombo = MATHS_COMBOS.find((c) => c.id === combo)
  const filteredGroups =
    isMaths && activeCombo?.components
      ? groups.filter((g) => (activeCombo.components as readonly string[]).includes(g.name))
      : groups

  if (!mounted) return null // avoid hydration mismatch

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Combination picker (Maths only) ─────────────────────────── */}
      {isMaths && (
        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
          }}
        >
          <p style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}>
            Paper combination
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MATHS_COMBOS.map((c) => {
              const selected = combo === c.id
              return (
                <motion.button
                  key={c.id}
                  onClick={() => handleComboChange(c.id)}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${selected ? subjectColor : 'var(--border-subtle)'}`,
                    background: selected ? `${subjectColor}10` : 'var(--bg-base)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 150ms ease, background 150ms ease',
                  }}
                >
                  {/* Radio dot */}
                  <div style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: `2px solid ${selected ? subjectColor : 'var(--border-muted)'}`,
                    background: selected ? subjectColor : 'transparent',
                    flexShrink: 0,
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 150ms ease',
                  }}>
                    {selected && (
                      <div style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#fff',
                      }} />
                    )}
                  </div>
                  <div>
                    <div style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: selected ? subjectColor : 'var(--text-primary)',
                      marginBottom: 2,
                    }}>
                      {c.label}
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      lineHeight: 1.5,
                    }}>
                      {c.description}
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Chapter groups ───────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={combo}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
        >
          {filteredGroups.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 32px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
            }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No chapters for this combination.
              </p>
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.name}>
                {/* Component header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 8,
                  paddingBottom: 8,
                  borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <h2 style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: subjectColor,
                    margin: 0,
                  }}>
                    {group.name}
                  </h2>
                  <span style={{
                    fontSize: '0.7rem',
                    color: 'var(--text-muted)',
                    background: 'var(--bg-overlay)',
                    border: '1px solid var(--border-subtle)',
                    padding: '1px 8px',
                    borderRadius: 99,
                  }}>
                    {group.chapters.filter(c => c.userChapter?.notes_status === 'complete').length}/{group.chapters.length}
                  </span>
                </div>

                {/* Chapter rows */}
                <div style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                }}>
                  {group.chapters.map((cws, idx) => (
                    <div
                      key={cws.chapter.id}
                      style={{
                        borderBottom: idx < group.chapters.length - 1
                          ? '1px solid var(--border-subtle)'
                          : 'none',
                      }}
                    >
                      <ChapterRow
                        chapter={cws.chapter}
                        userChapter={cws.userChapter}
                        avgScore={cws.avgScore}
                        subjectColor={subjectColor}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
