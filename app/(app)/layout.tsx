import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signOut } from '@/lib/supabase/actions'
import NavLink from '@/components/nav-link'
import TimezoneSync from '@/components/timezone-sync'

const NAV_ITEMS = [
  { href: '/dashboard',   label: 'Dashboard'   },
  { href: '/subjects',    label: 'Subjects'    },
  { href: '/past-papers', label: 'Past Papers' },
]

/**
 * App shell — sticky header with nav links + user info.
 * All /(app) routes render inside this layout.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, username, onboarding_completed, timezone')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_completed) redirect('/onboarding')

  const displayName = profile?.username ? `@${profile.username}` : profile?.full_name

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
      }}
    >
      <TimezoneSync initialTimezone={profile.timezone ?? 'UTC'} />

      {/* ── Sticky header ──────────────────────────────────────────────── */}
      <header
        style={{
          height: 56,
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          padding: '0 24px',
          background: 'var(--bg-elevated)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        {/* Logo */}
        <Link
          href="/dashboard"
          style={{
            fontWeight: 800,
            fontSize: '1.125rem',
            letterSpacing: '-0.03em',
            textDecoration: 'none',
            marginRight: 32,
            flexShrink: 0,
          }}
        >
          <span style={{ color: 'var(--text-primary)' }}>Atlas</span>
        </Link>

        {/* Nav links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User + sign out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            {displayName}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="btn btn-ghost"
              style={{ height: 32, padding: '0 12px', fontSize: '0.8rem' }}
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* ── Page content ───────────────────────────────────────────────── */}
      <main style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  )
}
