import Link from 'next/link'
import { BookOpen, Target } from 'lucide-react'

export type SubjectDetailView = 'chapters' | 'planner'

export function resolveSubjectDetailView(rawView?: string | string[] | null): SubjectDetailView {
  const value = Array.isArray(rawView) ? rawView[0] : rawView
  return value === 'planner' ? 'planner' : 'chapters'
}

interface Props {
  subjectId: string
  activeView: SubjectDetailView
  accentColor: string
}

export default function SubjectViewTabs({ subjectId, activeView, accentColor }: Props) {
  const items: Array<{ id: SubjectDetailView; label: string; href: string; icon: typeof BookOpen }> = [
    {
      id: 'chapters',
      label: 'Chapters',
      href: `/subjects/${subjectId}?view=chapters`,
      icon: BookOpen,
    },
    {
      id: 'planner',
      label: 'Threshold Planner',
      href: `/subjects/${subjectId}?view=planner`,
      icon: Target,
    },
  ]

  return (
    <nav
      aria-label="Subject sections"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      {items.map((item) => {
        const isActive = activeView === item.id
        const Icon = item.icon
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className="touch-target-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 44,
              minWidth: 44,
              padding: '0 16px',
              borderRadius: 'var(--radius-md)',
              border: isActive
                ? `1.5px solid ${accentColor}`
                : '1px solid var(--border-subtle)',
              background: isActive ? `${accentColor}1a` : 'var(--bg-card)',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: '0.875rem',
              fontWeight: isActive ? 700 : 500,
              textDecoration: 'none',
              boxSizing: 'border-box',
              maxWidth: '100%',
            }}
          >
            <Icon size={16} aria-hidden="true" color={isActive ? accentColor : 'currentColor'} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
