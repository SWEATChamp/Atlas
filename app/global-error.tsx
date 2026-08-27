'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
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
          color: '#f4f2ed',
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 440,
            background: '#1d2229',
            border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: 12,
            padding: '48px 36px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'rgba(248,113,113,0.12)',
              border: '1px solid rgba(248,113,113,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <AlertTriangle size={26} color="#d17676" />
          </div>

          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '0 0 10px',
            }}
          >
            Atlas encountered a critical error
          </h1>

          <p
            style={{
              color: '#a6abb3',
              fontSize: '0.9rem',
              lineHeight: 1.7,
              margin: '0 0 28px',
            }}
          >
            Something went wrong at the application level.
            {error.digest && (
              <>
                {' '}Error ID:{' '}
                <code style={{ fontFamily: 'monospace', color: '#f87171' }}>
                  {error.digest}
                </code>
              </>
            )}
          </p>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={unstable_retry}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 10,
                background: '#4c7094',
                border: 'none',
                color: '#fff',
                fontSize: '0.9375rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                flex: 1,
                height: 48,
                borderRadius: 10,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#a6abb3',
                fontSize: '0.9375rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
              }}
            >
              Go home
            </Link>
          </div>
        </div>
      </body>
    </html>
  )
}
