'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Sparkles, X, CheckCircle2 } from 'lucide-react'
import { CURRENT_RELEASE } from '@/lib/version'
import {
  isReleaseNotificationPending,
  dismissReleaseNotification,
} from '@/lib/release-state'
import { Dialog } from '@/components/ui/dialog'

export default function WhatsNewModal() {
  const [isOpen, setIsOpen] = useState(false)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Check safe storage on client after hydration
    const timer = setTimeout(() => {
      if (isReleaseNotificationPending()) {
        setIsOpen(true)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  const handleDismiss = useCallback(() => {
    dismissReleaseNotification(CURRENT_RELEASE.version)
    setIsOpen(false)
  }, [])

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleDismiss}
      titleId="whats-new-title"
      descriptionId="whats-new-desc"
      initialFocusRef={confirmButtonRef}
      maxWidth={460}
    >
      {/* Header */}
      <div
        style={{
          padding: '18px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              minWidth: 36,
              minHeight: 36,
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-soft)',
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <h2
                id="whats-new-title"
                style={{
                  margin: 0,
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                What’s New in Atlas
              </h2>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--accent-soft)',
                  color: 'var(--accent-primary)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--border-accent)',
                }}
              >
                v{CURRENT_RELEASE.version}
              </span>
            </div>
            <div
              id="whats-new-desc"
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                marginTop: 2,
              }}
            >
              {CURRENT_RELEASE.title}
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="Close release notification"
          onClick={handleDismiss}
          className="touch-target-btn"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            width: 44,
            height: 44,
            minWidth: 44,
            minHeight: 44,
            padding: 0,
            borderRadius: 'var(--radius-sm)',
            flexShrink: 0,
          }}
        >
          <X size={19} />
        </button>
      </div>

      {/* Changes List */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Highlights in this update:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CURRENT_RELEASE.changes.map((item, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
              }}
            >
              <CheckCircle2
                size={16}
                color="var(--accent-primary)"
                style={{ flexShrink: 0, marginTop: 2 }}
              />
              <span
                style={{
                  fontSize: '0.8125rem',
                  lineHeight: 1.45,
                  color: 'var(--text-primary)',
                }}
              >
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer action */}
      <div
        style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button
          ref={confirmButtonRef}
          type="button"
          className="btn btn-primary"
          onClick={handleDismiss}
          style={{
            width: '100%',
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: '0.875rem',
          }}
        >
          Got it
        </button>
      </div>
    </Dialog>
  )
}
