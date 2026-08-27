'use client'

import { useRouter, useSearchParams } from 'next/navigation'

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
          background: activeId === null ? 'var(--accent-strong)' : undefined,
          color: activeId === null ? '#fff' : 'var(--text-secondary)'
        }}
      >
        All
      </button>

      {subjects.map((s) => (
        <button
          key={s.id}
          onClick={() => handleTabClick(s.id)}
          className={`btn ${activeId === s.id ? 'btn-primary' : 'btn-ghost'}`}
          style={{
            background: activeId === s.id ? 'var(--accent-strong)' : undefined,
            color: activeId === s.id ? '#fff' : 'var(--text-secondary)'
          }}
        >
          {s.name}
        </button>
      ))}
    </div>
  )
}
