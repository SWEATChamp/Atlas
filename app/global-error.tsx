'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import Link from 'next/link'

/**
 * app/global-error.tsx — catches errors thrown inside the root layout.
 * Unlike error.tsx, this replaces the entire page including <html> and <body>,
 * so it must render its own document structure.
 * Must be a Client Component.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[Atlas GlobalError]', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          background: '#101216',
          color: '#f1eee8',
          fontFamily: "'Avenir Next', Inter, ui-sans-serif, system-ui, sans-serif",
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 440,
            background: '#1d2229',
            border: '1px solid #292f37',
            borderRadius: 12,
            padding: '40px 28px',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 8,
              background: 'rgba(199, 123, 123, 0.15)',
              border: '1px solid rgba(199, 123, 123, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <AlertTriangle size={26} color="#c77b7b" />
          </div>

          <h1
            style={{
              fontSize: '1.375rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '0 0 8px',
            }}
          >
            Atlas encountered a critical error
          </h1>

          <p
            style={{
              color: '#b2b8c0',
              fontSize: '0.875rem',
              lineHeight: 1.6,
              margin: '0 0 24px',
            }}
          >
            An unexpected application error occurred.
            {error.digest && (
              <>
                {' '}Error ID:{' '}
                <code style={{ fontFamily: 'monospace', color: '#c77b7b' }}>
                  {error.digest}
                </code>
              </>
            )}
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={unstable_retry}
              style={{
                flex: '1 1 140px',
                height: 44,
                minHeight: 44,
                borderRadius: 8,
                background: '#4c7094',
                border: 'none',
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <RotateCcw size={15} />
              Try again
            </button>
            <Link
              href="/"
              style={{
                flex: '1 1 140px',
                height: 44,
                minHeight: 44,
                borderRadius: 8,
                background: 'transparent',
                border: '1px solid #343c46',
                color: '#b2b8c0',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
                gap: 6,
                boxSizing: 'border-box',
              }}
            >
              <Home size={15} />
              Go home
            </Link>
          </div>
        </div>
      </body>
    </html>
  )
}
