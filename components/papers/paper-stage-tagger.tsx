'use client'

import { useState, useTransition } from 'react'
import { Tag } from 'lucide-react'
import { assignPaperStage } from '@/lib/actions/papers'
import type { PaperWithSubject } from '@/types'

interface Props {
  untaggedPapers: PaperWithSubject[]
}

export default function PaperStageTagger({ untaggedPapers }: Props) {
  const [papers, setPapers] = useState<PaperWithSubject[]>(untaggedPapers)
  const [isPending, startTransition] = useTransition()

  if (!papers.length) return null

  const handleTag = (paperId: string, stage: 'as' | 'a2') => {
    startTransition(async () => {
      const res = await assignPaperStage(paperId, stage)
      if (!res.error) {
        setPapers((prev) => prev.filter((p) => p.id !== paperId))
      }
    })
  }

  return (
    <div
      style={{
        background: 'rgba(91, 127, 255, 0.06)',
        border: '1px solid rgba(91, 127, 255, 0.2)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Tag size={16} color="var(--primary)" />
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Tag Past Paper Stage ({papers.length} untagged {papers.length === 1 ? 'paper' : 'papers'})
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {papers.map((paper) => (
          <div
            key={paper.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <span
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: paper.subjects?.color_hex || 'var(--text-primary)',
                  marginRight: 8,
                }}
              >
                {paper.subjects?.name}
              </span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {paper.paper_code}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleTag(paper.id, 'as')}
                disabled={isPending}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Tag AS
              </button>
              <button
                onClick={() => handleTag(paper.id, 'a2')}
                disabled={isPending}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Tag A2
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
