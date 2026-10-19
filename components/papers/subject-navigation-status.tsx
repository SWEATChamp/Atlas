'use client'

import { useLinkStatus } from 'next/link'

/** Immediate accessible feedback without permanently reserving trailing space. */
export function SubjectNavigationStatus({ name }: { name: string }) {
  const { pending } = useLinkStatus()
  return (
    <>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: pending ? 1 : 0,
          pointerEvents: 'none',
          fontSize: '0.875rem',
          lineHeight: 1,
        }}
      >
        …
      </span>
      <span role="status" className="sr-only">
        {pending ? `Loading ${name}…` : ''}
      </span>
    </>
  )
}
