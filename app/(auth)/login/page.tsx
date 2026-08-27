'use client'

import { motion } from 'framer-motion'
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
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: '12px 16px',
        background: 'rgba(248, 113, 113, 0.1)',
        border: '1px solid rgba(248, 113, 113, 0.25)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--danger)',
        fontSize: '0.875rem',
        marginBottom: 24,
        textAlign: 'center',
      }}
    >
      {messages[error] ?? 'An unexpected error occurred.'}
    </motion.div>
  )
}

export default function LoginPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="glass-strong"
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 'var(--radius-lg)',
          padding: '48px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
        }}
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          style={{
            width: 64,
            height: 64,
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
            fontSize: 28,
            fontWeight: 800,
            color: '#fff',
            fontFamily: 'var(--font-sans)',
          }}
        >
          A
        </motion.div>

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          style={{ textAlign: 'center', marginBottom: 8 }}
        >
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              marginBottom: 8,
            }}
          >
            Welcome to{' '}
            <span className="gradient-text">Atlas</span>
          </h1>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '0.9375rem',
              lineHeight: 1.6,
            }}
          >
            Your A-Level revision companion.
            <br />
            Track progress. Hit your target grades.
          </p>
        </motion.div>

        {/* Divider */}
        <div
          style={{
            width: '100%',
            height: 1,
            background: 'var(--border-subtle)',
            margin: '32px 0',
          }}
        />

        {/* Error banner */}
        <div style={{ width: '100%' }}>
          <Suspense fallback={null}>
            <LoginErrorBanner />
          </Suspense>
        </div>

        {/* Google Sign In */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          style={{ width: '100%' }}
        >
          <form action={signInWithGoogle}>
            <motion.button
              type="submit"
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.97 }}
              style={{
                width: '100%',
                height: 52,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                background: 'var(--bg-overlay)',
                border: '1px solid var(--border-muted)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: '0.9375rem',
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                transition: 'border-color 150ms ease, box-shadow 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-strong)'
                e.currentTarget.style.boxShadow = 'var(--shadow-md)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-muted)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <GoogleIcon />
              Continue with Google
            </motion.button>
          </form>
        </motion.div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          style={{
            marginTop: 24,
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          By continuing, you agree to Atlas&apos;s{' '}
          <span style={{ color: 'var(--text-secondary)' }}>Terms of Service</span>{' '}
          and{' '}
          <span style={{ color: 'var(--text-secondary)' }}>Privacy Policy</span>.
        </motion.p>
      </motion.div>
    </div>
  )
}
