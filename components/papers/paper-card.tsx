'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Pencil, Clock, Calendar, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { PaperWithSubject } from '@/types'
import { deletePaper } from '@/lib/actions/papers'
import { LogPaperModal } from '@/components/papers/log-paper-modal'

export function PaperCard({ paper }: { paper: PaperWithSubject }) {
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

  const date = new Date(paper.attempted_at + 'T00:00:00')
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })

  return (
    <>
      <motion.div
        whileHover={{ y: -2 }}
        className="card"
        onClick={() => router.push(`/past-papers/${paper.id}`)}
        style={{
          cursor: 'pointer',
          opacity: isDeleting ? 0.4 : 1,
          pointerEvents: isDeleting ? 'none' : 'auto',
          padding: '14px 16px',
          display: 'grid',
          gridTemplateColumns: '14px 1fr auto auto',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {/* Subject colour dot */}
        <div style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          backgroundColor: paper.subjects.color_hex || 'var(--accent-primary)',
        }} />

        {/* Left: paper code + subject */}
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
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {paper.subjects.name}
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
            onClick={e => { e.stopPropagation(); setEditOpen(true) }}
            className="btn btn-ghost"
            title="Edit paper"
            style={{ width: 32, height: 32, padding: 0, color: 'var(--text-muted)' }}
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
      <AnimatePresence>
        {editOpen && (
          <LogPaperModal
            existingPaperId={paper.id}
            existingPaper={{
              subjectId: paper.subject_id,
              year: paper.year,
              session: paper.session,
              paperNumber: Math.floor(paper.paper_number / 10),
              variant: paper.paper_number % 10,
              attemptedAt: paper.attempted_at,
              timeTakenMins: paper.time_taken_mins ?? undefined,
              notes: paper.notes ?? undefined,
            }}
            onSuccess={() => { setEditOpen(false); router.refresh() }}
            onClose={() => setEditOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
