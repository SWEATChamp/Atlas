'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'

/**
 * app/error.tsx — catches runtime errors inside route segments.
 * Must be a Client Component. Wraps each page in an error boundary.
 * In Next.js 16 the retry callback is `unstable_retry` (renamed from `reset`).
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[Atlas Error]', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient glow */}
      <div
        className="glow-orb"
        style={{
          width: 500,
          height: 500,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(248,113,113,0.15) 0%, transparent 70%)',
          opacity: 0.6,
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-strong"
        style={{
          width: '100%',
          maxWidth: 460,
          borderRadius: 'var(--radius-xl)',
          padding: '48px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          textAlign: 'center',
          position: 'relative',
          zIndex: 10,
          border: '1px solid rgba(248,113,113,0.2)',
        }}
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
          style={{
            width: 64,
            height: 64,
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(248,113,113,0.15)',
            border: '1px solid rgba(248,113,113,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <AlertTriangle size={28} color="var(--danger)" />
        </motion.div>

        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            marginBottom: 10,
          }}
        >
          Something went wrong
        </h1>

        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
            lineHeight: 1.7,
            marginBottom: 8,
            maxWidth: 340,
          }}
        >
          An unexpected error occurred. This has been logged automatically.
        </p>

        {/* Error message (dev only) */}
        {error.message && (
          <code
            style={{
              display: 'block',
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.15)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 14px',
              fontSize: '0.75rem',
              color: 'var(--danger)',
              fontFamily: 'var(--font-mono)',
              marginBottom: 8,
              wordBreak: 'break-word',
              maxWidth: '100%',
              textAlign: 'left',
            }}
          >
            {error.message}
          </code>
        )}

        {error.digest && (
          <p style={{ fontSize: '0.7rem', color: 'var(--text-disabled)', marginBottom: 32 }}>
            Error ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{error.digest}</span>
          </p>
        )}

        <div style={{ width: '100%', display: 'flex', gap: 10, marginTop: 16 }}>
          <motion.button
            onClick={unstable_retry}
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="btn btn-primary"
            style={{ flex: 1, height: 48 }}
          >
            <RotateCcw size={16} />
            Try again
          </motion.button>

          <motion.a
            href="/dashboard"
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="btn btn-ghost"
            style={{ flex: 1, height: 48, textDecoration: 'none' }}
          >
            <Home size={16} />
            Dashboard
          </motion.a>
        </div>
      </motion.div>
    </div>
  )
}
