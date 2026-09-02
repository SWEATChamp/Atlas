'use client'

import { signInWithGoogle } from '@/lib/supabase/actions'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function LoginErrorBanner() {
  const params = useSearchParams()
  const error = params.get('error')
  if (!error) return null

  const messages: Record<string, string> = {
    oauth_failed: 'Google sign-in failed. Please try again.',
    auth_failed: 'Authentication failed. Please try again.',
    no_code: 'Something went wrong with the sign-in flow.',
    no_user: 'Could not retrieve your account. Please try again.',
  }

  return (
    <div
      role="alert"
      style={{
        padding: '12px 16px',
        background: 'rgba(199, 123, 123, 0.1)',
        border: '1px solid rgba(199, 123, 123, 0.25)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--danger)',
        fontSize: '0.875rem',
        marginBottom: 24,
        textAlign: 'center',
      }}
    >
      {messages[error] ?? 'An unexpected error occurred.'}
    </div>
  )
}

export default function LoginPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '44px 36px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
        }}
      >
        {/* Logo Icon */}
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-soft)',
            border: '1px solid var(--border-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            fontSize: 24,
            fontWeight: 800,
            color: 'var(--accent-primary)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          A
        </div>

        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              marginBottom: 6,
            }}
          >
            Welcome to Atlas
          </h1>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '0.875rem',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Your A-Level revision operating system.
            <br />
            Track syllabus progress and hit target grades.
          </p>
        </div>

        {/* Divider */}
        <div
          style={{
            width: '100%',
            height: 1,
            background: 'var(--border-subtle)',
            margin: '28px 0',
          }}
        />

        {/* Error banner */}
        <div style={{ width: '100%' }}>
          <Suspense fallback={null}>
            <LoginErrorBanner />
          </Suspense>
        </div>

        {/* Google Sign In */}
        <div style={{ width: '100%' }}>
          <form action={signInWithGoogle}>
            <button
              type="submit"
              className="touch-target-btn"
              style={{
                width: '100%',
                height: 48,
                minHeight: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-muted)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: '0.9375rem',
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                transition: 'border-color 150ms ease, background 150ms ease',
              }}
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>
          </form>
        </div>

        {/* Footer note */}
        <p
          style={{
            marginTop: 24,
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            lineHeight: 1.5,
            marginBottom: 0,
          }}
        >
          By continuing, you agree to Atlas&apos;s{' '}
          <span style={{ color: 'var(--text-secondary)' }}>Terms of Service</span>{' '}
          and{' '}
          <span style={{ color: 'var(--text-secondary)' }}>Privacy Policy</span>.
        </p>
      </div>
    </div>
  )
}
