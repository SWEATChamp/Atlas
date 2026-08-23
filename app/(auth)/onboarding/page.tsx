'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Suspense, useState } from 'react'
import { signOut } from '@/lib/supabase/actions'
import { X } from 'lucide-react'
import UsernameStep from './steps/username-step'
import SubjectsStep from './steps/subjects-step'
import ExamDatesStep from './steps/exam-dates-step'

const STEPS = [
  { id: 1, label: 'Choose a username' },
  { id: 2, label: 'Pick your subjects' },
  { id: 3, label: 'Set exam dates' },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        marginBottom: 32,
        justifyContent: 'center',
      }}
    >
      {STEPS.map((step, i) => (
        <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
          <motion.div
            animate={{
              background:
                step.id < current
                  ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  : step.id === current
                  ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  : 'var(--bg-overlay)',
              borderColor:
                step.id <= current ? 'var(--accent-primary)' : 'var(--border-subtle)',
              scale: step.id === current ? 1.1 : 1,
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '2px solid',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: step.id <= current ? '#fff' : 'var(--text-muted)',
            }}
          >
            {step.id < current ? '✓' : step.id}
          </motion.div>
          {i < STEPS.length - 1 && (
            <motion.div
              animate={{
                background: step.id < current
                  ? 'var(--accent-primary)'
                  : 'var(--border-subtle)',
              }}
              style={{ width: 48, height: 2, borderRadius: 2 }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const step = Number(searchParams.get('step') ?? '1')

  // Keep selected subject IDs in memory so step 3 doesn't need to re-fetch
  const [enrolledSubjectIds, setEnrolledSubjectIds] = useState<string[]>([])

  const goNext = (subjectIds?: string[]) => {
    const next = step + 1
    if (next > STEPS.length) return
    if (subjectIds) setEnrolledSubjectIds(subjectIds)
    router.push(`/onboarding?step=${next}`)
  }

  const stepLabel = STEPS[step - 1]?.label ?? ''

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px',
        minHeight: '100dvh',
        justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-strong"
        style={{
          width: '100%',
          maxWidth: step === 2 ? 680 : step === 3 ? 580 : 480,
          borderRadius: 'var(--radius-xl)',
          padding: '40px 40px',
          transition: 'max-width 400ms ease',
          position: 'relative',
        }}
      >
        {/* Cancel / back to login button */}
        <form action={signOut}>
          <motion.button
            type="submit"
            title="Cancel onboarding and sign out"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.78rem',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)'
              e.currentTarget.style.background = 'var(--bg-overlay)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.background = 'none'
            }}
          >
            <X size={14} />
            Cancel
          </motion.button>
        </form>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--accent-secondary)',
              marginBottom: 8,
            }}
          >
            Step {step} of {STEPS.length}
          </div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              marginBottom: 4,
            }}
          >
            {stepLabel}
          </h1>
        </div>

        <StepIndicator current={step} />

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25 }}
          >
            {step === 1 && <UsernameStep onNext={goNext} />}
            {step === 2 && <SubjectsStep onNext={goNext} />}
            {step === 3 && <ExamDatesStep subjectIds={enrolledSubjectIds} />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingContent />
    </Suspense>
  )
}
