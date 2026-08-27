'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Trash2, Pencil, Clock, Calendar, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { PaperWithSubject } from '@/types'
import { deletePaper } from '@/lib/actions/papers'
import { formatDateOnly } from '@/lib/date'
import { LazyLogPaperModal } from './lazy-log-paper-modal'

export function PaperCard({ paper, timeZone }: { paper: PaperWithSubject; timeZone: string }) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting,    setIsDeleting]    = useState(false)
  const [editOpen,      setEditOpen]      = useState(false)

  const pct = Number(paper.accuracy_pct)
  const pctColor =
    pct >= 80 ? 'var(--success)' :
    pct >= 60 ? 'var(--warning)' :
    'var(--danger)'

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    setIsDeleting(true)
    await deletePaper(paper.id)
  }

  const date = formatDateOnly(paper.attempted_at, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })

  return (
    <>
      <motion.div
        className="card card-interactive"
        onClick={() => router.push(`/past-papers/${paper.id}`)}
        style={{
          cursor: 'pointer',
          opacity: isDeleting ? 0.4 : 1,
          pointerEvents: isDeleting ? 'none' : 'auto',
          padding: '14px 16px',
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {/* Left: paper code + subject + stage */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: '0.9375rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {paper.paper_code}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {paper.subjects.name}
            </span>
            {paper.stage ? (
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: paper.stage === 'a2' ? 'rgba(167, 139, 250, 0.15)' : 'rgba(91, 127, 255, 0.15)',
                  color: paper.stage === 'a2' ? 'var(--accent-secondary)' : 'var(--accent-primary)',
                }}
              >
                {paper.stage.toUpperCase()}
              </span>
            ) : (
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: 'rgba(255, 171, 0, 0.12)',
                  color: 'var(--warning)',
                }}
              >
                Untagged
              </span>
            )}
          </div>
        </div>

        {/* Centre: score + meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          {/* Score */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', whiteSpace: 'nowrap' }}>
              {paper.score_raw} / {paper.score_max}
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: pctColor, textAlign: 'right' }}>
              {pct.toFixed(1)}%
            </div>
          </div>

          {/* Date + time */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              <Calendar size={11} />
              {date}
            </div>
            {paper.time_taken_mins && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                <Clock size={11} />
                {paper.time_taken_mins}m
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); if (paper.paper_number !== null) setEditOpen(true) }}
            onPointerEnter={() => void import('./log-paper-modal')}
            className="btn btn-ghost"
            title={paper.paper_number === null ? 'Edit unavailable (no paper number recorded)' : 'Edit paper'}
            disabled={paper.paper_number === null}
            style={{ width: 32, height: 32, padding: 0, color: paper.paper_number === null ? 'var(--text-disabled, var(--text-muted))' : 'var(--text-muted)', opacity: paper.paper_number === null ? 0.4 : 1 }}
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={handleDelete}
            className="btn btn-ghost"
            title={confirmDelete ? 'Click again to confirm delete' : 'Delete paper'}
            style={{
              width: 32, height: 32, padding: 0,
              color: confirmDelete ? 'var(--danger)' : 'var(--text-muted)',
              background: confirmDelete ? 'rgba(248,113,113,0.1)' : undefined,
            }}
          >
            {confirmDelete ? <X size={14} /> : <Trash2 size={13} />}
          </button>
        </div>
      </motion.div>

      {/* Edit modal */}
      {editOpen && paper.paper_number !== null && (
          <LazyLogPaperModal
            timeZone={timeZone}
            existingPaperId={paper.id}
            existingPaper={{
              subjectId: paper.subject_id,
              subjectPaperId: paper.subject_paper_id ?? undefined,
              year: paper.year,
              session: paper.session,
              paperNumber: Math.floor(paper.paper_number / 10),
              variant: paper.paper_number % 10,
              stage: paper.stage ?? 'as',
              attemptedAt: paper.attempted_at,
              timeTakenMins: paper.time_taken_mins ?? undefined,
              notes: paper.notes ?? undefined,
            }}
            onSuccess={() => { setEditOpen(false); router.refresh() }}
            onClose={() => setEditOpen(false)}
          />
      )}
    </>
  )
}
