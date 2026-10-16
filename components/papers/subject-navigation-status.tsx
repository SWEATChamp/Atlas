'use client'

import { useLinkStatus } from 'next/link'

/** Keep normal Link navigation and reserve space so pending feedback never shifts tabs. */
export function SubjectNavigationStatus({ name }: { name: string }) {
  const { pending } = useLinkStatus()
  return <>
    <span aria-hidden="true" style={{ width: '1em', marginLeft: 6, opacity: pending ? 1 : 0, textAlign: 'center' }}>…</span>
    <span role="status" className="sr-only">{pending ? `Loading ${name}…` : ''}</span>
  </>
}
