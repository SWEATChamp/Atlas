/**
 * Layout for (auth) route group: /login, /onboarding
 * Centered, full-height authentication shell.
 * No navigation chrome.
 *
 * Auth routing is handled by middleware.ts.
 * The (app)/layout.tsx handles the onboarding-complete redirect.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--bg-base)',
      }}
    >
      <div style={{ position: 'relative', zIndex: 10, width: '100%' }}>
        {children}
      </div>
    </div>
  )
}
