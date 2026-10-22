'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function SubjectsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[Subjects Error]', error)
  }, [error])

  return (
    <div
      role="alert"
      style={{
        padding: '48px 24px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 16,
        maxWidth: 520,
        margin: '40px auto',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 'var(--radius-md)',
          background: 'rgba(199, 123, 123, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AlertTriangle size={24} color="var(--danger)" />
      </div>

      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
          Failed to load subjects
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          A database error occurred while loading subject data. Please try again.
        </p>
      </div>

      <button
        type="button"
        onClick={() => unstable_retry()}
        className="btn btn-primary touch-target-btn"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 20px' }}
      >
        <RotateCcw size={16} />
        <span>Try again</span>
      </button>
    </div>
  )
}
