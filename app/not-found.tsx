import Link from 'next/link'
import { Compass, ArrowLeft } from 'lucide-react'

/**
 * app/not-found.tsx — rendered when notFound() is called or no route matches.
 * Server Component — no 'use client' needed.
 */
export default function NotFound() {
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
          borderRadius: 'var(--radius-xl)',
          padding: '48px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          textAlign: 'center',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* 404 number */}
        <div
          style={{
            fontSize: '5rem',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            marginBottom: 16,
            color: 'var(--accent-primary)',
          }}
        >
          404
        </div>

        {/* Icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--accent-soft)',
            border: '1px solid var(--border-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <Compass size={26} color="var(--accent-primary)" />
        </div>

        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            marginBottom: 10,
          }}
        >
          Page not found
        </h1>

        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
            lineHeight: 1.7,
            marginBottom: 32,
            maxWidth: 320,
          }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 28px',
            height: 48,
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-strong)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.9375rem',
            textDecoration: 'none',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
