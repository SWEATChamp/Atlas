'use client'

import { useState } from 'react'
import { LazyLogPaperModal } from './lazy-log-paper-modal'

export function LogPaperButton({
  onSuccess,
  timeZone,
  preferredSubjectId,
}: {
  onSuccess?: () => void
  timeZone: string
  preferredSubjectId?: string | null
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
          preferredSubjectId={preferredSubjectId}
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
