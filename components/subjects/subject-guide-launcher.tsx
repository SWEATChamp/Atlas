'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { BookOpen } from 'lucide-react'
import {
  evaluateSubjectGuideAutoOpen,
  STORAGE_KEY_SUBJECT_CONTROLS_GUIDE,
} from '@/lib/subject-guide-state'
import { isReleaseNotificationPending } from '@/lib/release-state'
import { dialogCoordinator } from '@/lib/dialog-coordinator'

const LazySubjectControlsGuide = dynamic(
  () => import('./subject-controls-guide'),
  { ssr: false }
)

export interface SubjectGuideLauncherProps {
  subjectColor?: string
  storageKey?: string
}

export default function SubjectGuideLauncher({
  subjectColor = 'var(--accent-primary)',
  storageKey = STORAGE_KEY_SUBJECT_CONTROLS_GUIDE,
}: SubjectGuideLauncherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const launcherButtonRef = useRef<HTMLButtonElement>(null)

  const checkAndAutoOpen = useCallback(() => {
    const decision = evaluateSubjectGuideAutoOpen(storageKey)
    if (decision === 'open') {
      setIsOpen(true)
      return true
    }
    return false
  }, [storageKey])

  useEffect(() => {
    let isMounted = true

    // Check asynchronously upon mount to prevent cascading synchronous renders
    const timer = setTimeout(() => {
      if (!isMounted) return
      const opened = checkAndAutoOpen()
      if (!opened && isReleaseNotificationPending()) {
        // If deferred, subscription below will handle dismissal
      }
    }, 0)

    const unsubscribe = dialogCoordinator.subscribeReleaseDismissal(() => {
      if (!isMounted) return
      checkAndAutoOpen()
    })

    return () => {
      isMounted = false
      clearTimeout(timer)
      unsubscribe()
    }
  }, [checkAndAutoOpen])

  return (
    <>
      <button
        ref={launcherButtonRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className="btn-ghost touch-target-btn"
        aria-label="Open subject controls guide"
        title="Open guide for rating confidence and tracking notes"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 14px',
          minHeight: 44,
          fontSize: '0.8125rem',
          fontWeight: 600,
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >
        <BookOpen size={15} color={subjectColor} />
        <span>Guide</span>
      </button>

      {isOpen && (
        <LazySubjectControlsGuide
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          subjectColor={subjectColor}
          storageKey={storageKey}
          returnFocusRef={launcherButtonRef}
        />
      )}
    </>
  )
}
