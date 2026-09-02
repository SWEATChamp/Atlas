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
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-xl)',
          padding: '48px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          textAlign: 'center',
          position: 'relative',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {/* 404 number */}
        <div
          style={{
            fontSize: '4.5rem',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            marginBottom: 16,
            color: 'var(--accent-primary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          404
        </div>

        {/* Icon */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--accent-soft)',
            border: '1px solid var(--border-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <Compass size={24} color="var(--accent-primary)" />
        </div>

        <h1
          style={{
            fontSize: '1.35rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            marginBottom: 8,
          }}
        >
          Page not found
        </h1>

        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.875rem',
            lineHeight: 1.6,
            marginBottom: 28,
            maxWidth: 320,
          }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <Link
          href="/dashboard"
          className="btn btn-primary touch-target-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 24px',
            minHeight: 44,
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </Link>
      </div>
    </div>
  )
}
