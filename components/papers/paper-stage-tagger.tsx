'use client'

import { Tag, Loader2, AlertCircle } from 'lucide-react'
import type { PaperWithSubject } from '@/types'

interface Props {
  untaggedPapers: PaperWithSubject[]
  pendingAssignments: Record<string, 'as' | 'a2'>
  onTag: (paperId: string, stage: 'as' | 'a2') => void
  errorMessage?: string | null
}

export default function PaperStageTagger({
  untaggedPapers,
  pendingAssignments,
  onTag,
  errorMessage,
}: Props) {
  if (!untaggedPapers.length && !errorMessage) return null

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Tag size={16} color="var(--primary)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Tag Past Paper Stage ({untaggedPapers.length} untagged {untaggedPapers.length === 1 ? 'paper' : 'papers'})
          </span>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--danger)',
            fontSize: '0.8rem',
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {untaggedPapers.map((paper) => {
          const pendingStage = pendingAssignments[paper.id]
          const isPending = Boolean(pendingStage)

          return (
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
              <div style={{ minWidth: 0 }}>
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

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isPending ? (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(91, 127, 255, 0.12)',
                      color: 'var(--accent-primary)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    <Loader2 size={12} className="animate-spin" />
                    <span>Saving {pendingStage?.toUpperCase()}…</span>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onTag(paper.id, 'as')}
                      disabled={isPending}
                      aria-label={`Tag ${paper.paper_code} as AS`}
                      className="btn btn-ghost tagger-stage-btn"
                      style={{
                        padding: '8px 14px',
                        minHeight: 44,
                        minWidth: 68,
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      Tag AS
                    </button>
                    <button
                      type="button"
                      onClick={() => onTag(paper.id, 'a2')}
                      disabled={isPending}
                      aria-label={`Tag ${paper.paper_code} as A2`}
                      className="btn btn-ghost tagger-stage-btn"
                      style={{
                        padding: '8px 14px',
                        minHeight: 44,
                        minWidth: 68,
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      Tag A2
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
