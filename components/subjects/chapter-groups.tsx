'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ChapterRow from './chapter-row'
import type { ComponentGroup } from '@/lib/actions/subjects'
import type { SubjectPaperSelection } from '@/types'

interface Props {
  subjectId: string
  isMaths: boolean
  groups: ComponentGroup[]
  subjectColor: string
  paperSelections?: SubjectPaperSelection[]
}

export default function ChapterGroups({
  subjectId,
  isMaths,
  groups,
  subjectColor,
  paperSelections = [],
}: Props) {
  // If the student has chosen paper selections for Maths in the database,
  // we default to showing their selected components, with a toggle to view all.
  const [filterMode, setFilterMode] = useState<'selected' | 'all'>('selected')

  const selectedComponentNames = useMemo(() => {
    if (!paperSelections.length) return null
    return paperSelections.map((s) => s.component_name)
  }, [paperSelections])

  const filteredGroups = useMemo(() => {
    if (isMaths && filterMode === 'selected' && selectedComponentNames?.length) {
      return groups.filter((g) =>
        selectedComponentNames.includes(g.name) ||
        g.name === 'Pure 1' ||
        g.name === 'Pure 3'
      )
    }
    return groups
  }, [groups, isMaths, filterMode, selectedComponentNames])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* View filter toggle for Maths if paper selections are configured */}
      {isMaths && selectedComponentNames && selectedComponentNames.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 16px',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Showing: <strong>{filterMode === 'selected' ? 'My Selected Papers' : 'All Components'}</strong>
          </span>
          <button
            onClick={() => setFilterMode((m) => (m === 'selected' ? 'all' : 'selected'))}
            style={{
              background: 'transparent',
              border: `1px solid ${subjectColor}`,
              borderRadius: 'var(--radius-sm)',
              color: subjectColor,
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            {filterMode === 'selected' ? 'View All Components' : 'View Selected Only'}
          </button>
        </div>
      )}

      {/* ── Chapter groups ───────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={filterMode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
        >
          {filteredGroups.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 32px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No chapters found.
              </p>
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.name}>
                {/* Component header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 8,
                    paddingBottom: 8,
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <h2
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: subjectColor,
                      margin: 0,
                    }}
                  >
                    {group.name}
                  </h2>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      background: 'var(--bg-overlay)',
                      border: '1px solid var(--border-subtle)',
                      padding: '1px 8px',
                      borderRadius: 99,
                    }}
                  >
                    {group.chapters.filter((c) => c.userChapter?.notes_status === 'complete').length}/{group.chapters.length}
                  </span>
                </div>

                {/* Chapter rows */}
                <div
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                  }}
                >
                  {group.chapters.map((cws, idx) => (
                    <div
                      key={cws.chapter.id}
                      style={{
                        borderBottom:
                          idx < group.chapters.length - 1
                            ? '1px solid var(--border-subtle)'
                            : 'none',
                      }}
                    >
                      <ChapterRow
                        chapter={cws.chapter}
                        userChapter={cws.userChapter}
                        avgScore={cws.avgScore}
                        subjectColor={subjectColor}
                        isAccessible={cws.isAccessible}
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
