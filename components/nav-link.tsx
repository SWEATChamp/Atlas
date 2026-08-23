'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen, type LucideIcon } from 'lucide-react'

// Icons live here in the client component — never passed as props from the server
const ICON_MAP: Record<string, LucideIcon> = {
  '/dashboard': LayoutDashboard,
  '/subjects':  BookOpen,
}

interface Props {
  href: string
  children: React.ReactNode
}

/**
 * Nav link with active state highlighting.
 * Looks up its own icon by href — avoids passing functions from Server → Client.
 */
export default function NavLink({ href, children }: Props) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  const Icon = ICON_MAP[href]

  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        padding: '0 12px',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.875rem',
        fontWeight: isActive ? 600 : 500,
        color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
        background: isActive ? 'var(--bg-active)' : 'transparent',
        textDecoration: 'none',
        transition: 'color 150ms ease, background 150ms ease',
      }}
    >
      {Icon && <Icon size={15} strokeWidth={isActive ? 2.5 : 2} />}
      {children}
    </Link>
  )
}
