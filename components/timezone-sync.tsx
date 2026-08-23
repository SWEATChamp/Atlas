'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { syncTimezone } from '@/lib/actions/timezone'

export default function TimezoneSync({ initialTimezone }: { initialTimezone: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  useEffect(() => {
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!detectedTimezone || detectedTimezone === initialTimezone) return

    let cancelled = false
    startTransition(async () => {
      const result = await syncTimezone(detectedTimezone)
      if (result.changed && !cancelled) router.refresh()
    })

    return () => {
      cancelled = true
    }
  }, [initialTimezone, router])

  return null
}
