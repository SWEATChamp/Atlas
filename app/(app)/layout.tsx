import Link from 'next/link'
import { redirect } from 'next/navigation'
import { signOut } from '@/lib/supabase/actions'
import { getAuthenticatedContext, getCurrentProfile } from '@/lib/supabase/authenticated'
import NavLink from '@/components/nav-link'
import TimezoneSync from '@/components/timezone-sync'
import WhatsNewModal from '@/components/whats-new-modal'
import MotionProvider from '@/components/motion-provider'
import { CURRENT_RELEASE } from '@/lib/version'

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
  const { user } = await getAuthenticatedContext()

  if (!user) redirect('/login')

  const profile = await getCurrentProfile()

  if (!profile?.onboarding_completed) redirect('/onboarding')

  const displayName = profile?.username ? `@${profile.username}` : profile?.full_name

  return (
    <MotionProvider>
      <div className="app-root-shell">
        <TimezoneSync initialTimezone={profile.timezone ?? 'UTC'} />
        <WhatsNewModal />

        {/* ── Responsive Sticky header ──────────────────────────────────────── */}
        <header className="app-header">
          {/* 1. Logo (Grid area: logo) */}
          <div className="app-header-logo">
            <Link
              href="/dashboard"
              aria-label="A-Level Atlas Dashboard"
              className="touch-target-btn"
              style={{
                fontWeight: 800,
                fontSize: '1.125rem',
                letterSpacing: '-0.03em',
                textDecoration: 'none',
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0 4px',
                flexShrink: 0,
              }}
            >
              <span style={{ color: 'var(--text-primary)' }}>Atlas</span>
            </Link>
          </div>

          {/* 2. Nav links (Grid area: nav) */}
          <nav className="app-header-nav" aria-label="Main Navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} href={item.href}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* 3. User + sign out (Grid area: user) */}
          <div className="app-header-user">
            <span
              style={{
                fontSize: '0.8125rem',
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                maxWidth: 'min(140px, 32vw)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
              }}
            >
              {displayName}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="btn btn-ghost"
                style={{ padding: '0 12px', fontSize: '0.8rem', minHeight: 44 }}
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        {/* ── Page content ───────────────────────────────────────────────── */}
        <main className="app-main-layout">
          {children}
        </main>

        {/* ── Unobtrusive Application Footer Shell ───────────────────────── */}
        <footer
          style={{
            borderTop: '1px solid var(--border-subtle)',
            padding: '16px 24px',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>Atlas v{CURRENT_RELEASE.version}</span>
        </footer>
      </div>
    </MotionProvider>
  )
}
