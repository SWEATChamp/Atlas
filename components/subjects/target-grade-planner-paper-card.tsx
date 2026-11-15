'use client'

import React from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  ShieldCheck,
} from 'lucide-react'
import type { PaperPlanResult } from '@/lib/planner'

interface Props {
  readonly paperPlan: PaperPlanResult
  readonly subjectColor: string
  readonly selectedVariant: string
  readonly onSelectVariant: (paperId: string, variant: string) => void
}

export default function TargetGradePlannerPaperCard({
  paperPlan,
  subjectColor,
  selectedVariant,
  onSelectVariant,
}: Props) {
  const {
    subjectPaperId,
    componentPaperNumber,
    componentName,
    stage,
    sourceKind,
    rawMaximumMark,
    requiredMark,
    requiredMarkWithSafetyMargin,
    evidence,
    latestGap,
    lifetimeAverageGap,
    baselineGap,
    includedVariants,
  } = paperPlan

  // Trend icon and text
  const renderTrend = () => {
    if (evidence.trend === 'improving') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--success)',
            fontWeight: 600,
          }}
        >
          <TrendingUp size={14} aria-hidden="true" />
          Improving ({evidence.trendDelta > 0 ? `+${evidence.trendDelta}` : evidence.trendDelta})
        </span>
      )
    }
    if (evidence.trend === 'declining') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--danger)',
            fontWeight: 600,
          }}
        >
          <TrendingDown size={14} aria-hidden="true" />
          Declining ({evidence.trendDelta})
        </span>
      )
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--text-muted)',
          fontWeight: 500,
        }}
      >
        <Minus size={14} aria-hidden="true" />
        Stable
      </span>
    )
  }

  // Format mark gap (e.g. "+3 marks needed" or "5 marks above target")
  const renderGap = (gap: number | null, label: string) => {
    if (gap === null) return <span style={{ color: 'var(--text-muted)' }}>None logged</span>
    if (gap <= 0) {
      return (
        <span style={{ color: 'var(--success)', fontWeight: 600 }}>
          {Math.abs(gap)} marks above {label}
        </span>
      )
    }
    return (
      <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
        {gap} marks below {label}
      </span>
    )
  }

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Header: Title, Stage, and Official/Estimate Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: 4,
                background: `${subjectColor}15`,
                color: subjectColor,
                border: `1px solid ${subjectColor}35`,
              }}
            >
              Paper {componentPaperNumber} · {stage.toUpperCase()}
            </span>
          </div>
          <h3
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            {componentName}
          </h3>
        </div>

        {/* Badge */}
        <div>
          {sourceKind === 'official_exact' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.6875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '3px 8px',
                borderRadius: 4,
                background: 'rgba(16, 185, 129, 0.1)',
                color: 'var(--success)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              <ShieldCheck size={12} aria-hidden="true" />
              Official component threshold
            </span>
          ) : sourceKind === 'atlas_estimate_ceiling_average' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.6875rem',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 4,
                background: 'rgba(59, 130, 246, 0.1)',
                color: 'var(--accent)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
            >
              <Sparkles size={12} aria-hidden="true" />
              Atlas benchmark
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.6875rem',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 4,
                background: 'rgba(239, 68, 68, 0.08)',
                color: 'var(--danger)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
              }}
            >
              Threshold unavailable
            </span>
          )}
        </div>
      </div>

      {/* Target Variant Selector Row */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'var(--bg-base)',
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Target Variant:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {[
              ...(paperPlan.hasApprovedAverage
                ? [{ label: 'Unknown (Average)', value: 'unknown' }]
                : []),
              ...(paperPlan.availableVariants ?? []).map((v) => ({
                label: v.label,
                value: v.variantCode,
              })),
            ].map((v) => {
              const isSelected = selectedVariant === v.value
              return (
                <button
                  key={v.value}
                  type="button"
                  className="touch-target-btn"
                  aria-pressed={isSelected}
                  onClick={() => onSelectVariant(subjectPaperId, v.value)}
                  style={{
                    minHeight: 44,
                    minWidth: 44,
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.75rem',
                    fontWeight: isSelected ? 700 : 500,
                    border: isSelected
                      ? '1.5px solid var(--accent)'
                      : '1px solid var(--border-subtle)',
                    background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-card)',
                    color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {v.label}
                </button>
              )
            })}
          </div>
        </div>

        {paperPlan.variantError && (
          <div
            role="alert"
            style={{
              fontSize: '0.75rem',
              color: 'var(--danger)',
              fontWeight: 500,
              paddingTop: 2,
            }}
          >
            {paperPlan.variantError}
          </div>
        )}
      </div>

      {/* Included Variants Disclosure if Ceiling Average */}
      {sourceKind === 'atlas_estimate_ceiling_average' && includedVariants.length > 0 && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Included variants in ceiling average:{' '}
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            {includedVariants.join(', ')}
          </span>
        </div>
      )}

      {/* Required Mark Hero Card or Unavailable Notice */}
      {paperPlan.isAllocationAvailable && requiredMark !== null ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '16px',
            background: 'var(--bg-base)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Required Mark:</span>
                <span
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: 'var(--accent)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                  }}
                >
                  Atlas estimate
                </span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {requiredMark}
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  {' '}
                  / {rawMaximumMark ?? '—'}
                </span>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Safety Margin Target:
                </span>
                <span
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: 'var(--accent)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                  }}
                >
                  Atlas estimate
                </span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>
                {requiredMarkWithSafetyMargin ?? requiredMark}
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  {' '}
                  / {rawMaximumMark ?? '—'}
                </span>
              </div>
            </div>
          </div>

          {paperPlan.benchmarkFloorMark !== null && (
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                paddingTop: 8,
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <span>
                {sourceKind === 'official_exact'
                  ? 'Official component threshold'
                  : 'Atlas benchmark'}
                :
              </span>
              <strong style={{ color: 'var(--text-secondary)' }}>
                {paperPlan.benchmarkFloorMark} / {rawMaximumMark ?? '—'}
              </strong>
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                (component floor)
              </span>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--bg-base)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Allocation Unavailable:</strong>{' '}
            {paperPlan.allocationUnavailableReason ?? 'Select paper variants to resolve official required marks.'}
          </div>
          {paperPlan.benchmarkFloorMark !== null && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.8125rem',
                paddingTop: 6,
                borderTop: '1px solid var(--border-subtle)',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>
                {sourceKind === 'official_exact'
                  ? 'Official component threshold'
                  : 'Atlas benchmark'}
                :
              </span>
              <strong style={{ color: 'var(--text-primary)' }}>
                {paperPlan.benchmarkFloorMark} / {rawMaximumMark ?? '—'}
              </strong>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'rgba(59, 130, 246, 0.1)',
                  color: 'var(--accent)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                }}
              >
                Benchmark Floor only · Not an allocated target
              </span>
            </div>
          )}
        </div>
      )}

      {/* Evidence & Gaps Breakdown */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          fontSize: '0.8125rem',
        }}
      >
        {/* Recency Weighted Baseline */}
        <div style={{ padding: '8px 0' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Recency-Weighted Baseline:
          </div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
            {evidence.recencyWeightedBaseline !== null ? (
              <>
                {evidence.recencyWeightedBaseline.toFixed(1)} / {rawMaximumMark ?? '—'}
                <div style={{ fontSize: '0.75rem', marginTop: 2 }}>
                  {renderGap(baselineGap, 'baseline')}
                </div>
              </>
            ) : (
              'No attempts logged'
            )}
          </div>
        </div>

        {/* Latest Full Paper */}
        <div style={{ padding: '8px 0' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Latest Full Paper:
          </div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
            {evidence.latestRawScore !== null ? (
              <>
                {evidence.latestRawMax !== null && rawMaximumMark !== null && evidence.latestRawMax !== rawMaximumMark ? (
                  <span>
                    {evidence.latestRawScore} / {evidence.latestRawMax}{' '}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      ({evidence.latestNormalizedScore?.toFixed(1)} / {rawMaximumMark} norm)
                    </span>
                  </span>
                ) : (
                  <span>
                    {evidence.latestRawScore} / {rawMaximumMark ?? evidence.latestRawMax ?? '—'}
                  </span>
                )}
                {evidence.latestHistoricalGrade && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: 'var(--accent)',
                    }}
                  >
                    Grade {evidence.latestHistoricalGrade}
                  </span>
                )}
                <div style={{ fontSize: '0.75rem', marginTop: 2 }}>
                  {renderGap(latestGap, 'latest')}
                </div>
              </>
            ) : (
              'No attempts logged'
            )}
          </div>
        </div>

        {/* Lifetime Average */}
        <div style={{ padding: '8px 0' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Lifetime Average:
          </div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
            {evidence.unweightedLifetimeAverage !== null ? (
              <>
                {evidence.unweightedLifetimeAverage.toFixed(1)} / {rawMaximumMark ?? '—'}
                <div style={{ fontSize: '0.75rem', marginTop: 2 }}>
                  {renderGap(lifetimeAverageGap, 'average')}
                </div>
              </>
            ) : (
              'No attempts logged'
            )}
          </div>
        </div>

        {/* Trend & Variability */}
        <div style={{ padding: '8px 0' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Performance Metrics:
          </div>
          <div style={{ marginTop: 2 }}>
            <div>
              Attempts:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{evidence.attemptCount}</strong>
              {evidence.variability !== null && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                  (σ = ±{evidence.variability.toFixed(1)})
                </span>
              )}
            </div>
            <div style={{ marginTop: 2 }}>{renderTrend()}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
