import Link from 'next/link'
import { SubjectNavigationStatus } from './subject-navigation-status'

export interface SubjectFilterTabsProps {
  subjects: { id: string; name: string; color_hex: string }[]
  activeId: string | null
  basePath?: string
  ariaLabel?: string
}

export function SubjectFilterTabs({
  subjects,
  activeId,
  basePath = '/past-papers',
  ariaLabel = 'Filter by subject',
}: SubjectFilterTabsProps) {
  return (
    <nav
      aria-label={ariaLabel}
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
      {/* Use App Router default prefetch={null} to prefetch only down to loading.js on viewport entry, avoiding full dynamic server component burst requests across all subjects */}
      <Link
        href={basePath}
        scroll={false}
        prefetch={null}
        aria-current={activeId === null ? 'page' : undefined}
        className={`btn ${activeId === null ? 'btn-primary' : 'btn-ghost'}`}
        style={{
          position: 'relative',
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
        <SubjectNavigationStatus name="all subjects" />
      </Link>

      {subjects.map((s) => {
        const isActive = activeId === s.id
        return (
          <Link
            key={s.id}
            href={`${basePath}?subject=${encodeURIComponent(s.id)}`}
            scroll={false}
            prefetch={null}
            aria-current={isActive ? 'page' : undefined}
            className={`btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              position: 'relative',
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
            <SubjectNavigationStatus name={s.name} />
          </Link>
        )
      })}
    </nav>
  )
}
