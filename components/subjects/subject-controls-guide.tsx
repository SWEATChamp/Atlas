'use client'

import { useState, useRef, useCallback } from 'react'
import { Star, CheckCircle2, Clock, Circle, ArrowRight, ArrowLeft } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import {
  CONFIDENCE_LEVELS,
  GUIDE_COPY,
  STATUS_CONFIG,
} from '@/lib/subject-controls'
import {
  markSubjectGuideSeen,
  STORAGE_KEY_SUBJECT_CONTROLS_GUIDE,
} from '@/lib/subject-guide-state'

export function SubjectControlsGuideStep1Content({
  subjectColor = 'var(--accent-primary)',
}: {
  subjectColor?: string
}) {
  return (
    <div id="subject-guide-desc" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
        {GUIDE_COPY.step1.intro}
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px',
        }}
      >
        {CONFIDENCE_LEVELS.map((item) => (
          <div
            key={item.level}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: '0.8125rem',
              color: 'var(--text-primary)',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontWeight: 500 }}>{item.text}</span>
            {/* Five-star visual representation matching the real control */}
            <div
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                flexShrink: 0,
              }}
            >
              {[1, 2, 3, 4, 5].map((starIndex) => {
                const isFilled = starIndex <= item.level
                return (
                  <Star
                    key={starIndex}
                    size={14}
                    fill={isFilled ? subjectColor : 'transparent'}
                    color={isFilled ? subjectColor : 'var(--text-disabled)'}
                    strokeWidth={1.5}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
        {GUIDE_COPY.step1.footer}
      </p>
    </div>
  )
}

export function SubjectControlsGuideStep2Content({
  subjectColor = 'var(--accent-primary)',
}: {
  subjectColor?: string
}) {
  return (
    <div id="subject-guide-desc" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '14px',
        }}
      >
        {/* Not started */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Circle size={18} color="var(--text-disabled)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {STATUS_CONFIG.none.label}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Notes have not been started.
            </div>
          </div>
        </div>

        {/* In progress */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Clock size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {STATUS_CONFIG.in_progress.label}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Records that you have begun.
            </div>
          </div>
        </div>

        {/* Complete */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <CheckCircle2 size={18} color={subjectColor} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {STATUS_CONFIG.complete.label}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Adds this chapter to Notes readiness. Completed chapters are no longer suggested for notes missions.
            </div>
          </div>
        </div>
      </div>

      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
        You can update either control at any time. Reopen this explanation from <strong>Guide</strong> beside Chapters.
      </p>
    </div>
  )
}

export interface SubjectControlsGuideProps {
  isOpen: boolean
  onClose: () => void
  subjectColor?: string
  storageKey?: string
  returnFocusRef?: React.RefObject<HTMLElement | null>
}

export default function SubjectControlsGuide({
  isOpen,
  onClose,
  subjectColor = 'var(--accent-primary)',
  storageKey = STORAGE_KEY_SUBJECT_CONTROLS_GUIDE,
  returnFocusRef,
}: SubjectControlsGuideProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const doneButtonRef = useRef<HTMLButtonElement>(null)

  const handleDismiss = useCallback(() => {
    markSubjectGuideSeen(storageKey)
    setStep(1)
    onClose()
  }, [onClose, storageKey])

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleDismiss}
      titleId="subject-guide-title"
      descriptionId="subject-guide-desc"
      initialFocusRef={step === 1 ? nextButtonRef : doneButtonRef}
      returnFocusRef={returnFocusRef}
      maxWidth={500}
      showCloseButton
      closeButtonAriaLabel="Close guide"
    >
      <div style={{ padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Step indicator and title */}
        <div>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
              marginBottom: 4,
            }}
          >
            {step === 1 ? GUIDE_COPY.step1.stepLabel : GUIDE_COPY.step2.stepLabel}
          </div>
          <h2
            id="subject-guide-title"
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            {step === 1 ? GUIDE_COPY.step1.title : GUIDE_COPY.step2.title}
          </h2>
        </div>

        {/* Step 1: Confidence Rating Guide */}
        {step === 1 && <SubjectControlsGuideStep1Content subjectColor={subjectColor} />}

        {/* Step 2: Notes Status Guide */}
        {step === 2 && <SubjectControlsGuideStep2Content subjectColor={subjectColor} />}

        {/* Footer controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            paddingTop: 12,
            borderTop: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
          }}
        >
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={handleDismiss}
                className="btn btn-ghost"
                style={{ minHeight: 44, padding: '0 16px', fontSize: '0.875rem' }}
              >
                Skip
              </button>
              <button
                ref={nextButtonRef}
                type="button"
                onClick={() => setStep(2)}
                className="btn btn-primary"
                style={{ minHeight: 44, padding: '0 20px', fontSize: '0.875rem', gap: 6 }}
              >
                <span>Next</span>
                <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn btn-ghost"
                style={{ minHeight: 44, padding: '0 16px', fontSize: '0.875rem', gap: 6 }}
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <button
                ref={doneButtonRef}
                type="button"
                onClick={handleDismiss}
                className="btn btn-primary"
                style={{ minHeight: 44, padding: '0 24px', fontSize: '0.875rem' }}
              >
                Got it
              </button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}
