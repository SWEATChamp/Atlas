'use client'

import { useState } from 'react'
import { LazyLogPaperModal } from './lazy-log-paper-modal'

export function LogPaperButton({
  onSuccess,
  timeZone,
}: {
  onSuccess?: () => void
  timeZone: string
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        className="btn btn-primary"
        onPointerEnter={() => void import('./log-paper-modal')}
        onClick={() => setIsOpen(true)}
      >
        + Log Paper
      </button>
      {isOpen && (
        <LazyLogPaperModal
          timeZone={timeZone}
          onSuccess={() => {
            setIsOpen(false)
            onSuccess?.()
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
