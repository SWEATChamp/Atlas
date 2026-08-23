/**
 * Layout for (auth) route group: /login, /onboarding
 * Centered, full-height, dark with ambient glow orbs.
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
      {/* Ambient glow orbs */}
      <div
        className="glow-orb"
        style={{
          width: 600,
          height: 600,
          top: -200,
          left: -200,
          background: 'radial-gradient(circle, #7c6dfa 0%, transparent 70%)',
        }}
      />
      <div
        className="glow-orb"
        style={{
          width: 400,
          height: 400,
          bottom: -100,
          right: -100,
          background: 'radial-gradient(circle, #a78bfa 0%, transparent 70%)',
        }}
      />
      <div style={{ position: 'relative', zIndex: 10, width: '100%' }}>
        {children}
      </div>
    </div>
  )
}
