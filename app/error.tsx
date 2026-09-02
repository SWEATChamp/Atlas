'use client'

import { useEffect } from 'react'
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
      <div
        className="glass-strong"
        style={{
          width: '100%',
          maxWidth: 460,
          borderRadius: 'var(--radius-lg)',
          padding: '40px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          textAlign: 'center',
          position: 'relative',
          zIndex: 10,
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(199, 123, 123, 0.15)',
            border: '1px solid rgba(199, 123, 123, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <AlertTriangle size={26} color="var(--danger)" />
        </div>

        <h1
          style={{
            fontSize: '1.375rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            marginBottom: 8,
          }}
        >
          Something went wrong
        </h1>

        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.875rem',
            lineHeight: 1.6,
            marginBottom: 16,
            maxWidth: 340,
          }}
        >
          An unexpected error occurred. Please try again or return to the dashboard.
        </p>

        {/* Error message (dev only) */}
        {error.message && (
          <code
            style={{
              display: 'block',
              background: 'rgba(199, 123, 123, 0.08)',
              border: '1px solid rgba(199, 123, 123, 0.2)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              fontSize: '0.75rem',
              color: 'var(--danger)',
              fontFamily: 'var(--font-mono)',
              marginBottom: 12,
              wordBreak: 'break-word',
              maxWidth: '100%',
              textAlign: 'left',
            }}
          >
            {error.message}
          </code>
        )}

        {error.digest && (
          <p style={{ fontSize: '0.7rem', color: 'var(--text-disabled)', marginBottom: 24 }}>
            Error ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{error.digest}</span>
          </p>
        )}

        <div style={{ width: '100%', display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={unstable_retry}
            className="btn btn-primary"
            style={{ flex: '1 1 140px', minHeight: 44 }}
          >
            <RotateCcw size={16} />
            Try again
          </button>

          <a
            href="/dashboard"
            className="btn btn-ghost"
            style={{ flex: '1 1 140px', minHeight: 44, textDecoration: 'none' }}
          >
            <Home size={16} />
            Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
