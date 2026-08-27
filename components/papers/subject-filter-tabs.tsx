import Link from 'next/link'

export interface SubjectFilterTabsProps {
  subjects: { id: string; name: string; color_hex: string }[]
  activeId: string | null
}

export function SubjectFilterTabs({ subjects, activeId }: SubjectFilterTabsProps) {
  return (
    <nav
      aria-label="Filter past papers by subject"
      style={{
        display: 'flex',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        maxWidth: '100%',
        width: '100%',
        minWidth: 0,
        gap: 'var(--space-2)',
        paddingBottom: 'var(--space-2)',
      }}
    >
      <Link
        href="/past-papers"
        scroll={false}
        aria-current={activeId === null ? 'page' : undefined}
        className={`btn ${activeId === null ? 'btn-primary' : 'btn-ghost'}`}
        style={{
          background: activeId === null ? 'var(--accent-strong)' : undefined,
          color: activeId === null ? '#fff' : 'var(--text-secondary)',
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          flexShrink: 0,
          minHeight: 44,
          padding: '0 16px',
        }}
      >
        All
      </Link>

      {subjects.map((s) => {
        const isActive = activeId === s.id
        return (
          <Link
            key={s.id}
            href={`/past-papers?subject=${encodeURIComponent(s.id)}`}
            scroll={false}
            aria-current={isActive ? 'page' : undefined}
            className={`btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              background: isActive ? 'var(--accent-strong)' : undefined,
              color: isActive ? '#fff' : 'var(--text-secondary)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              flexShrink: 0,
              minHeight: 44,
              padding: '0 16px',
            }}
          >
            {s.name}
          </Link>
        )
      })}
    </nav>
  )
}
