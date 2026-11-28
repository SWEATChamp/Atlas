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

function extractCfTokenFromResult(res: PlannerResult): string | null {
  if (res.status === 'available' || res.status === 'missing-weighting') {
    return res.summary.selectedCarryForwardOption?.rawCarryForwardToken ?? null
  }
  if (res.status === 'carry-forward-selection-required') {
    return res.selectedCarryForwardToken
  }
  return null
}

function isCfTokenCompatibleWithResult(res: PlannerResult, token: string | null): boolean {
  if (!token) return false
  if (res.status === 'available' || res.status === 'missing-weighting') {
    return (
      res.summary.availableCarryForwardOptions?.some(
        (opt) => opt.rawCarryForwardToken === token
      ) ?? false
    )
  }
  if (res.status === 'carry-forward-selection-required') {
    return res.options.some((opt) => opt.rawCarryForwardToken === token)
  }
  return false
}

export default function TargetGradePlanner({
  subjectId,
  subjectColor,
  initialResult,
}: Props) {
  const [result, setResult] = useState<PlannerResult>(initialResult)
  const [prevInitialResult, setPrevInitialResult] = useState<PlannerResult>(initialResult)
  const [prevSubjectId, setPrevSubjectId] = useState<string>(subjectId)
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({})
  const [selectedCarryForwardToken, setSelectedCarryForwardToken] = useState<string | null>(() =>
    extractCfTokenFromResult(initialResult)
  )
  const [safetyMargin, setSafetyMargin] = useState<SafetyMarginOption>({ type: 'none' })
  const [isPending, startTransition] = useTransition()
  const requestIdRef = useRef(0)

  // Synchronize planner state when parent passes a new initialResult or subjectId
  if (prevInitialResult !== initialResult || prevSubjectId !== subjectId) {
    const subjectChanged = prevSubjectId !== subjectId
    setPrevSubjectId(subjectId)
    setPrevInitialResult(initialResult)
    setResult(initialResult)
    setSelectedVariants({})
    setSafetyMargin({ type: 'none' })
    if (subjectChanged) {
      setSelectedCarryForwardToken(extractCfTokenFromResult(initialResult))
    } else if (!isCfTokenCompatibleWithResult(initialResult, selectedCarryForwardToken)) {
      setSelectedCarryForwardToken(extractCfTokenFromResult(initialResult))
    }
  }

  React.useEffect(() => {
    requestIdRef.current++
  }, [initialResult])

  const buildPlanOptions = (
    overrides: {
      variants?: Record<string, string>
      margin?: SafetyMarginOption
      cfToken?: string | null
    } = {}
  ) => {
    const cf = overrides.cfToken !== undefined ? overrides.cfToken : selectedCarryForwardToken
    return {
      selectedVariants: overrides.variants ?? selectedVariants,
      safetyMargin: overrides.margin ?? safetyMargin,
      ...(cf ? { selectedCarryForwardToken: cf } : {}),
    }
  }

  // Handler for carry-forward sitting selection (race-condition protected)
  const handleSelectCarryForwardToken = (token: string) => {
    setSelectedCarryForwardToken(token)
    const reqId = ++requestIdRef.current

    startTransition(async () => {
      const updated = await getTargetGradePlan(
        subjectId,
        buildPlanOptions({ cfToken: token })
      )
      if (reqId === requestIdRef.current) {
        setResult(updated)
      }
    })
  }

  // Handler for variant selection per paper (race-condition protected)
  const handleSelectVariant = (paperId: string, variant: string) => {
    const nextVariants = { ...selectedVariants, [paperId]: variant }
    setSelectedVariants(nextVariants)
    const reqId = ++requestIdRef.current

    startTransition(async () => {
      const updated = await getTargetGradePlan(
        subjectId,
        buildPlanOptions({ variants: nextVariants })
      )
      if (reqId === requestIdRef.current) {
        if (
          selectedCarryForwardToken &&
          !isCfTokenCompatibleWithResult(updated, selectedCarryForwardToken)
        ) {
          setSelectedCarryForwardToken(extractCfTokenFromResult(updated))
        }
        setResult(updated)
      }
    })
  }

  // Handler for safety margin selection (race-condition protected)
  const handleSelectSafetyMargin = (margin: SafetyMarginOption) => {
    setSafetyMargin(margin)
    const reqId = ++requestIdRef.current

    startTransition(async () => {
      const updated = await getTargetGradePlan(
        subjectId,
        buildPlanOptions({ margin })
      )
      if (reqId === requestIdRef.current) {
        setResult(updated)
      }
    })
  }

  // Retry handler for query failures
  const handleRetry = () => {
    const reqId = ++requestIdRef.current
    startTransition(async () => {
      const updated = await getTargetGradePlan(subjectId, buildPlanOptions())
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
      const updated = await getTargetGradePlan(
        subjectId,
        buildPlanOptions({ variants: resetVariants, margin: resetMargin })
      )
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
            onSelectCarryForwardToken={handleSelectCarryForwardToken}
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
                selectedVariant={
                  selectedVariants[paperPlan.subjectPaperId] ??
                  paperPlan.targetVariantChoice ??
                  'unknown'
                }
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
          onSelectCarryForwardToken={handleSelectCarryForwardToken}
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
