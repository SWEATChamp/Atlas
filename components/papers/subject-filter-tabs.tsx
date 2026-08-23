'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'

export interface SubjectFilterTabsProps {
  subjects: { id: string; name: string; color_hex: string }[]
  activeId: string | null
}

export function SubjectFilterTabs({ subjects, activeId }: SubjectFilterTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleTabClick = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id) {
      params.set('subject', id)
    } else {
      params.delete('subject')
    }
    router.push(`/past-papers?${params.toString()}`)
  }

  return (
    <div style={{ display: 'flex', overflowX: 'auto', gap: 'var(--space-2)', paddingBottom: 'var(--space-2)' }}>
      <button
        onClick={() => handleTabClick(null)}
        className={`btn ${activeId === null ? 'btn-primary' : 'btn-ghost'}`}
        style={{
          position: 'relative',
          background: activeId === null ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' : undefined,
          color: activeId === null ? '#fff' : 'var(--text-secondary)'
        }}
      >
        All
        {activeId === null && (
          <motion.div
            layoutId="activeTab"
            style={{ position: 'absolute', inset: 0, borderRadius: 'var(--radius-md)', zIndex: -1 }}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
      </button>

      {subjects.map((s) => (
        <button
          key={s.id}
          onClick={() => handleTabClick(s.id)}
          className={`btn ${activeId === s.id ? 'btn-primary' : 'btn-ghost'}`}
          style={{
            position: 'relative',
            background: activeId === s.id ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' : undefined,
            color: activeId === s.id ? '#fff' : 'var(--text-secondary)'
          }}
        >
          {s.name}
          {activeId === s.id && (
            <motion.div
              layoutId="activeTab"
              style={{ position: 'absolute', inset: 0, borderRadius: 'var(--radius-md)', zIndex: -1 }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
            />
          )}
        </button>
      ))}
    </div>
  )
}
