'use client'

import React from 'react'
import {
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Calendar,
  Compass,
  Target,
  RefreshCw,
  Scale,
} from 'lucide-react'
import type { PlannerResult } from '@/lib/planner'
import CarryForwardSittingSelector from './carry-forward-sitting-selector'

interface Props {
  readonly result: PlannerResult
  readonly onRetry?: () => void
  readonly hasActiveVariantOverrides?: boolean
  readonly onResetVariants?: () => void
  readonly onSelectCarryForwardToken?: (rawCarryForwardToken: string) => void
}

export default function TargetGradePlannerEmptyState({
  result,
  onRetry,
  hasActiveVariantOverrides = false,
  onResetVariants,
  onSelectCarryForwardToken,
}: Props) {
  if (result.status === 'available') {
    return null
  }

  const containerStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg)',
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    maxWidth: '100%',
  }

  const headerRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  }

  const iconBoxStyle = (bgColor: string, borderColor: string): React.CSSProperties => ({
    width: 44,
    height: 44,
    borderRadius: 'var(--radius-md)',
    background: bgColor,
    border: `1px solid ${borderColor}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  })

  // 1. Unconfirmed Route
  if (result.status === 'unconfirmed-route') {
    return (
      <section aria-labelledby="planner-unconfirmed-heading" style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={iconBoxStyle('rgba(234, 179, 8, 0.12)', 'rgba(234, 179, 8, 0.3)')}>
            <Compass size={22} color="var(--warning)" aria-hidden="true" />
          </div>
          <div style={{ flex: 1 }}>
            <h2
              id="planner-unconfirmed-heading"
              style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}
            >
              Study Route Required
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              {result.message}
            </p>
          </div>
        </div>
      </section>
    )
  }

  // 2. No Target Grade
  if (result.status === 'no-target-grade') {
    return (
      <section aria-labelledby="planner-no-grade-heading" style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={iconBoxStyle('rgba(59, 130, 246, 0.12)', 'rgba(59, 130, 246, 0.3)')}>
            <Target size={22} color="var(--accent)" aria-hidden="true" />
          </div>
          <div style={{ flex: 1 }}>
            <h2
              id="planner-no-grade-heading"
              style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}
            >
              Target Grade Required
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              {result.message}
            </p>
          </div>
        </div>
      </section>
    )
  }

  // 3. No Exam Session
  if (result.status === 'no-exam-session') {
    return (
      <section aria-labelledby="planner-no-session-heading" style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={iconBoxStyle('rgba(168, 85, 247, 0.12)', 'rgba(168, 85, 247, 0.3)')}>
            <Calendar size={22} color="#a855f7" aria-hidden="true" />
          </div>
          <div style={{ flex: 1 }}>
            <h2
              id="planner-no-session-heading"
              style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}
            >
              Examination Session Required
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              {result.message}
            </p>
          </div>
        </div>
      </section>
    )
  }

  // 4. No Approved Combination
  if (result.status === 'no-approved-combination') {
    return (
      <section aria-labelledby="planner-no-comb-heading" style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={iconBoxStyle('rgba(239, 68, 68, 0.12)', 'rgba(239, 68, 68, 0.3)')}>
            <AlertCircle size={22} color="var(--danger)" aria-hidden="true" />
          </div>
          <div style={{ flex: 1 }}>
            <h2
              id="planner-no-comb-heading"
              style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}
            >
              Combination Unapproved
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              {result.message}
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Route: <span style={{ fontWeight: 600 }}>{result.route}</span>
            </p>
          </div>
        </div>
      </section>
    )
  }

  // 5. Missing Weighting
  if (result.status === 'missing-weighting') {
    const summary = result.summary
    return (
      <section aria-labelledby="planner-missing-weight-heading" style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={iconBoxStyle('rgba(234, 179, 8, 0.12)', 'rgba(234, 179, 8, 0.3)')}>
            <Scale size={22} color="var(--warning)" aria-hidden="true" />
          </div>
          <div style={{ flex: 1 }}>
            <h2
              id="planner-missing-weight-heading"
              style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}
            >
              Per-Paper Allocation Unavailable
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              {result.message}
            </p>
            <div
              style={{
                marginTop: 12,
                padding: '12px 14px',
                background: 'var(--bg-base)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Official Overall Benchmark for Target {summary.targetGrade}:
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                {summary.officialCombinedTarget !== null
                  ? `${summary.officialCombinedTarget} / ${summary.combinedMaximumMark} marks`
                  : 'Variant selection required'}
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  // 6. Threshold Unavailable
  if (result.status === 'threshold-unavailable') {
    const isVariantRecoveryAvailable = hasActiveVariantOverrides && Boolean(onResetVariants)
    return (
      <section aria-labelledby="planner-threshold-unavail-heading" style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={iconBoxStyle('rgba(148, 163, 184, 0.12)', 'rgba(148, 163, 184, 0.3)')}>
            <HelpCircle size={22} color="var(--text-muted)" aria-hidden="true" />
          </div>
          <div style={{ flex: 1 }}>
            <h2
              id="planner-threshold-unavail-heading"
              style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}
            >
              Threshold Unavailable
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              {result.message}
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Reason: {result.reason}
            </p>
            {isVariantRecoveryAvailable && onResetVariants && (
              <>
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    marginTop: 8,
                    lineHeight: 1.5,
                    fontWeight: 500,
                  }}
                >
                  The selected paper variant combination is incompatible across published Cambridge option combinations. Reset temporary variant selections to return to the baseline plan and paper controls.
                </p>
                <button
                  type="button"
                  onClick={onResetVariants}
                  className="touch-target-btn"
                  style={{
                    marginTop: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    minHeight: 44,
                    minWidth: 44,
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  Reset variant selections
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    )
  }

  // 7. Impossible Target
  if (result.status === 'impossible-target') {
    return (
      <section aria-labelledby="planner-impossible-heading" style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={iconBoxStyle('rgba(239, 68, 68, 0.12)', 'rgba(239, 68, 68, 0.3)')}>
            <AlertTriangle size={22} color="var(--danger)" aria-hidden="true" />
          </div>
          <div style={{ flex: 1 }}>
            <h2
              id="planner-impossible-heading"
              style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}
            >
              Target Mathematically Unavailable
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              {result.message}
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--danger)', marginTop: 4 }}>
              Details: {result.reason}
            </p>
          </div>
        </div>
      </section>
    )
  }

  // 8. Partial Paper Coverage
  if (result.status === 'partial-paper-coverage') {
    return (
      <section aria-labelledby="planner-partial-heading" style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={iconBoxStyle('rgba(234, 179, 8, 0.12)', 'rgba(234, 179, 8, 0.3)')}>
            <AlertCircle size={22} color="var(--warning)" aria-hidden="true" />
          </div>
          <div style={{ flex: 1 }}>
            <h2
              id="planner-partial-heading"
              style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}
            >
              Partial Threshold Coverage
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              {result.message}
            </p>
            <ul style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 8, paddingLeft: 20 }}>
              {result.unconfiguredPaperNames.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    )
  }

  // 9. Carry-Forward Sitting Selection Required
  if (result.status === 'carry-forward-selection-required') {
    return (
      <section aria-labelledby="planner-cf-selection-heading" style={containerStyle}>
        <div style={headerRowStyle}>
          <div style={iconBoxStyle('rgba(59, 130, 246, 0.12)', 'rgba(59, 130, 246, 0.3)')}>
            <Calendar size={22} color="var(--accent)" aria-hidden="true" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              id="planner-cf-selection-heading"
              style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}
            >
              Select Carried AS Sitting
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              {result.message}
            </p>
            {onSelectCarryForwardToken && (
              <div style={{ marginTop: 12 }}>
                <CarryForwardSittingSelector
                  options={result.options}
                  selectedToken={result.selectedCarryForwardToken}
                  onSelect={onSelectCarryForwardToken}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }

  // 10. Query Failure (Explicit Error State)
  if (result.status === 'query-failure') {
    return (
      <section
        role="alert"
        aria-labelledby="planner-error-heading"
        style={{
          ...containerStyle,
          borderColor: 'var(--danger)',
          background: 'rgba(239, 68, 68, 0.05)',
        }}
      >
        <div style={headerRowStyle}>
          <div style={iconBoxStyle('rgba(239, 68, 68, 0.15)', 'rgba(239, 68, 68, 0.4)')}>
            <AlertCircle size={22} color="var(--danger)" aria-hidden="true" />
          </div>
          <div style={{ flex: 1 }}>
            <h2
              id="planner-error-heading"
              style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--danger)', margin: 0 }}
            >
              Query Failure
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', marginTop: 4, lineHeight: 1.5 }}>
              {result.message}
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Details: {result.error}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="touch-target-btn"
                style={{
                  marginTop: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  minHeight: 44,
                  minWidth: 44,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={14} aria-hidden="true" />
                Retry
              </button>
            )}
          </div>
        </div>
      </section>
    )
  }

  return null
}
