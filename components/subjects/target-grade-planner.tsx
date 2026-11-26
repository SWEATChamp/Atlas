'use client'

import React, { useRef, useState, useTransition } from 'react'
import type {
  PlannerResult,
  SafetyMarginOption,
} from '@/lib/planner'
import { getTargetGradePlan } from '@/lib/actions/target-planner'
import TargetGradePlannerSummary from './target-grade-planner-summary'
import TargetGradePlannerPaperCard from './target-grade-planner-paper-card'
import TargetGradePlannerEmptyState from './target-grade-planner-empty-states'

interface Props {
  readonly subjectId: string
  readonly subjectColor: string
  readonly initialResult: PlannerResult
}

export default function TargetGradePlanner({
  subjectId,
  subjectColor,
  initialResult,
}: Props) {
  const [result, setResult] = useState<PlannerResult>(initialResult)
  const [prevInitialResult, setPrevInitialResult] = useState<PlannerResult>(initialResult)
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({})
  const [safetyMargin, setSafetyMargin] = useState<SafetyMarginOption>({ type: 'none' })
  const [isPending, startTransition] = useTransition()
  const requestIdRef = useRef(0)

  // Synchronize planner state when parent passes a new initialResult
  if (prevInitialResult !== initialResult) {
    setPrevInitialResult(initialResult)
    setResult(initialResult)
    setSelectedVariants({})
    setSafetyMargin({ type: 'none' })
  }

  React.useEffect(() => {
    requestIdRef.current++
  }, [initialResult])

  // Handler for variant selection per paper (race-condition protected)
  const handleSelectVariant = (paperId: string, variant: string) => {
    const nextVariants = { ...selectedVariants, [paperId]: variant }
    setSelectedVariants(nextVariants)
    const reqId = ++requestIdRef.current

    startTransition(async () => {
      const updated = await getTargetGradePlan(subjectId, {
        selectedVariants: nextVariants,
        safetyMargin,
      })
      if (reqId === requestIdRef.current) {
        setResult(updated)
      }
    })
  }

  // Handler for safety margin selection (race-condition protected)
  const handleSelectSafetyMargin = (margin: SafetyMarginOption) => {
    setSafetyMargin(margin)
    const reqId = ++requestIdRef.current

    startTransition(async () => {
      const updated = await getTargetGradePlan(subjectId, {
        selectedVariants,
        safetyMargin: margin,
      })
      if (reqId === requestIdRef.current) {
        setResult(updated)
      }
    })
  }

  // Retry handler for query failures
  const handleRetry = () => {
    const reqId = ++requestIdRef.current
    startTransition(async () => {
      const updated = await getTargetGradePlan(subjectId, {
        selectedVariants,
        safetyMargin,
      })
      if (reqId === requestIdRef.current) {
        setResult(updated)
      }
    })
  }

  const hasActiveVariantOverrides = Object.values(selectedVariants).some(
    (variant) => Boolean(variant) && variant !== 'unknown'
  )

  // Clear incompatible temporary variant selections and safety margin, then recompute
  const handleResetVariants = () => {
    const resetVariants: Record<string, string> = {}
    const resetMargin: SafetyMarginOption = { type: 'none' }
    setSelectedVariants(resetVariants)
    setSafetyMargin(resetMargin)
    const reqId = ++requestIdRef.current

    startTransition(async () => {
      const updated = await getTargetGradePlan(subjectId, {
        selectedVariants: resetVariants,
        safetyMargin: resetMargin,
      })
      if (reqId === requestIdRef.current) {
        setResult(updated)
      }
    })
  }

  return (
    <section
      aria-labelledby="target-grade-planner-heading"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        opacity: isPending ? 0.7 : 1,
        transition: 'opacity 150ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2
          id="target-grade-planner-heading"
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Target-Grade Marks Planner
        </h2>
        {isPending && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Updating plan...</span>
        )}
      </div>

      {result.status === 'available' || result.status === 'missing-weighting' ? (
        <>
          {result.status === 'missing-weighting' && (
            <div
              role="alert"
              style={{
                padding: '12px 14px',
                background: 'rgba(234, 179, 8, 0.08)',
                border: '1px solid rgba(234, 179, 8, 0.25)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
              }}
            >
              <strong>Allocation Notice:</strong> {result.message}
            </div>
          )}

          <TargetGradePlannerSummary
            summary={result.summary}
            onSelectSafetyMargin={handleSelectSafetyMargin}
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              marginTop: 4,
            }}
          >
            {result.paperPlans.map((paperPlan) => (
              <TargetGradePlannerPaperCard
                key={paperPlan.subjectPaperId}
                paperPlan={paperPlan}
                subjectColor={subjectColor}
                selectedVariant={selectedVariants[paperPlan.subjectPaperId] ?? 'unknown'}
                onSelectVariant={handleSelectVariant}
              />
            ))}
          </div>
        </>
      ) : (
        <TargetGradePlannerEmptyState
          result={result}
          onRetry={handleRetry}
          hasActiveVariantOverrides={hasActiveVariantOverrides}
          onResetVariants={
            result.status === 'threshold-unavailable' && hasActiveVariantOverrides
              ? handleResetVariants
              : undefined
          }
        />
      )}
    </section>
  )
}
