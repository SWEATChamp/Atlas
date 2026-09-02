'use client'

import { useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'

export interface DialogProps {
  isOpen: boolean
  onClose: () => void
  titleId?: string
  descriptionId?: string
  ariaLabel?: string
  initialFocusRef?: React.RefObject<HTMLElement | null>
  returnFocusRef?: React.RefObject<HTMLElement | null>
  maxWidth?: number | string
  children: React.ReactNode
  showCloseButton?: boolean
  closeButtonAriaLabel?: string
  contentStyle?: React.CSSProperties
  overlayStyle?: React.CSSProperties
}

export function Dialog({
  isOpen,
  onClose,
  titleId,
  descriptionId,
  ariaLabel,
  initialFocusRef,
  returnFocusRef,
  maxWidth = 480,
  children,
  showCloseButton = false,
  closeButtonAriaLabel = 'Close dialog',
  contentStyle,
  overlayStyle,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  // Capture active element when dialog opens, and restore focus on ANY closure or unmount path
  useEffect(() => {
    if (isOpen) {
      const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
      if (!active || active === document.body) {
        previousActiveElementRef.current = returnFocusRef?.current ?? null
      } else {
        previousActiveElementRef.current = active
      }
    } else if (previousActiveElementRef.current) {
      const el = previousActiveElementRef.current
      previousActiveElementRef.current = null
      if (typeof el.focus === 'function') {
        el.focus()
      }
    }
  }, [isOpen, returnFocusRef])

  useEffect(() => {
    return () => {
      if (previousActiveElementRef.current) {
        const el = previousActiveElementRef.current
        previousActiveElementRef.current = null
        if (typeof el.focus === 'function') {
          el.focus()
        }
      }
    }
  }, [])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  // Focus trap, Escape key, and body scroll locking
  useEffect(() => {
    if (!isOpen) return

    // 1. Lock body scrolling
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // 2. Initial focus
    const focusTimer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
      } else if (dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (focusableElements.length > 0) {
          focusableElements[0].focus()
        } else {
          dialogRef.current.focus()
        }
      }
    }, 50)

    // 3. Keydown handler: Escape to dismiss, Tab key containment
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
        return
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (focusableElements.length === 0) {
          e.preventDefault()
          return
        }

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault()
            lastElement.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault()
            firstElement.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, handleClose, initialFocusRef])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(0, 0, 0, 0.7)',
        ...overlayStyle,
      }}
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-label={!titleId ? ariaLabel : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          width: '100%',
          maxWidth,
          maxHeight: 'min(90vh, calc(100dvh - 32px))',
          overflowY: 'auto',
          outline: 'none',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          boxSizing: 'border-box',
          ...contentStyle,
        }}
      >
        {showCloseButton && (
          <button
            type="button"
            aria-label={closeButtonAriaLabel}
            onClick={handleClose}
            className="touch-target-btn"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <X size={18} />
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
