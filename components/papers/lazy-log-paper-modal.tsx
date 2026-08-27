'use client'

import dynamic from 'next/dynamic'

export const LazyLogPaperModal = dynamic(
  () => import('./log-paper-modal').then((module) => module.LogPaperModal),
  {
    loading: () => (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(8, 10, 13, 0.72)',
          color: 'var(--text-secondary)',
          fontSize: '0.875rem',
        }}
      >
        Preparing paper form…
      </div>
    ),
  }
)
