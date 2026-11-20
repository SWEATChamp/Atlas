'use client'

import React from 'react'
import {
  ExternalLink,
  Award,
  Info,
} from 'lucide-react'
import type { SafetyMarginOption, SubjectLevelPlanSummary } from '@/lib/planner'

interface Props {
  readonly summary: SubjectLevelPlanSummary
  readonly onSelectSafetyMargin: (margin: SafetyMarginOption) => void
}

export default function TargetGradePlannerSummary({
  summary,
  onSelectSafetyMargin,
}: Props) {
  const {
    targetGrade,
    officialCombinedTarget,
    combinedMaximumMark,
    estimatedCombinedMark,
    marksStillNeeded,
    latestComparableGrade,
    rollingPredictedGrade,
    stagedBreakdown,
    provenance,
    safetyMargin,
    adjustedCombinedTarget,
  } = summary

  const isMarginActive = safetyMargin.type !== 'none'

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* Top Banner: Fallback Disclosure if Applicable */}
      {provenance.isFallback && (
        <div
          role="note"
          aria-label="Publication series fallback notice"
          style={{
            padding: '12px 14px',
            background: 'rgba(234, 179, 8, 0.08)',
            border: '1px solid rgba(234, 179, 8, 0.25)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: '0.8125rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.4,
          }}
        >
          <Info size={16} color="var(--warning)" style={{ flexShrink: 0 }} aria-hidden="true" />
          <div>
            {provenance.fallbackReason === 'intended_series_unpublished' && (
              <>
                <strong>Series Fallback:</strong> Official thresholds for{' '}
                <span style={{ fontWeight: 600 }}>
                  {provenance.intendedSeries} {provenance.intendedYear}
                </span>{' '}
                are not yet published. Targets are calculated using the newest earlier compatible
                publication:{' '}
                <span style={{ fontWeight: 600 }}>
                  {provenance.examSeries} {provenance.examYear}
                </span>
                .
              </>
            )}
            {provenance.fallbackReason === 'incompatible_variants_or_options' && (
              <>
                <strong>Series Fallback:</strong> The intended{' '}
                <span style={{ fontWeight: 600 }}>
                  {provenance.intendedSeries} {provenance.intendedYear}
                </span>{' '}
                series does not contain a compatible option for your selected route and paper variants.
                Targets are calculated using the newest compatible publication:{' '}
                <span style={{ fontWeight: 600 }}>
                  {provenance.examSeries} {provenance.examYear}
                </span>
                .
              </>
            )}
            {!provenance.fallbackReason && (
              <>
                <strong>Series Fallback:</strong> Using compatible publication:{' '}
                <span style={{ fontWeight: 600 }}>
                  {provenance.examSeries} {provenance.examYear}
                </span>
                .
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Grid: Official Combined Threshold & Student Projections */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        {/* Card 1: Official Combined Target */}
        <div
          style={{
            padding: 16,
            background: 'var(--bg-base)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Combined Target ({targetGrade})
              </span>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background:
                    officialCombinedTarget !== null
                      ? 'rgba(16, 185, 129, 0.1)'
                      : 'rgba(234, 179, 8, 0.1)',
                  color:
                    officialCombinedTarget !== null
                      ? 'var(--success)'
                      : 'var(--warning)',
                  border:
                    officialCombinedTarget !== null
                      ? '1px solid rgba(16, 185, 129, 0.3)'
                      : '1px solid rgba(234, 179, 8, 0.3)',
                }}
              >
                {officialCombinedTarget !== null ? 'Official Threshold' : 'Variant Selection Required'}
              </span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {officialCombinedTarget !== null ? (
                <>
                  {officialCombinedTarget}
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                    {' '}
                    / {combinedMaximumMark}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: '1.125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  Threshold Unavailable
                </span>
              )}
            </div>
          </div>
          {officialCombinedTarget === null && summary.overallThresholdUnavailableReason && (
            <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {summary.overallThresholdUnavailableReason}
            </div>
          )}
          {isMarginActive && adjustedCombinedTarget !== null && (
            <div
              style={{
                marginTop: 8,
                fontSize: '0.75rem',
                color: 'var(--accent)',
                fontWeight: 600,
              }}
            >
              With safety margin: {adjustedCombinedTarget} marks
            </div>
          )}
          {summary.safetyMarginImpossible && (
            <div
              style={{
                marginTop: 8,
                fontSize: '0.75rem',
                color: 'var(--warning)',
                fontWeight: 600,
              }}
            >
              {summary.safetyMarginImpossibleReason ?? 'Safety margin exceeds available capacity.'}
            </div>
          )}
        </div>

        {/* Card 2: Estimated Current Combined Mark */}
        <div
          style={{
            padding: 16,
            background: 'var(--bg-base)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Estimated Combined Mark
              </span>
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
                Atlas Estimate
              </span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {estimatedCombinedMark !== null ? (
                <>
                  {estimatedCombinedMark}
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                    {' '}
                    / {combinedMaximumMark}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: '1.125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {summary.studyRoute === 'staged'
                    ? 'Awaiting verified AS mark'
                    : !summary.isOptionResolved
                    ? 'Option code unresolved'
                    : summary.officialCombinedTarget === null
                    ? 'Threshold unavailable'
                    : 'Incomplete coverage'}
                </span>
              )}
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {marksStillNeeded !== null ? (
              marksStillNeeded === 0 ? (
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                  Target threshold reached!
                </span>
              ) : (
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>{marksStillNeeded}</strong> marks
                  still needed
                </span>
              )
            ) : (
              summary.estimatedCombinedUnavailableReason ??
              (summary.studyRoute === 'staged'
                ? 'Official AS mark required for staged route combined total'
                : !summary.isOptionResolved
                ? 'Select paper variants to resolve official combination'
                : 'Log attempts for all papers to calculate')
            )}
          </div>
        </div>

        {/* Card 3: Rolling Predicted Grade */}
        <div
          style={{
            padding: 16,
            background: 'var(--bg-base)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Rolling Predicted Grade
              </span>
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'rgba(168, 85, 247, 0.1)',
                  color: '#a855f7',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                }}
              >
                Sample ≥ 2
              </span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {rollingPredictedGrade ?? (
                <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {summary.studyRoute === 'staged'
                    ? 'Awaiting verified AS mark'
                    : !summary.isOptionResolved
                    ? 'Option code unresolved'
                    : summary.officialCombinedTarget === null
                    ? 'Threshold unavailable'
                    : 'Insufficient sample'}
                </span>
              )}
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {latestComparableGrade ? (
              <span>Latest complete sitting: <strong>Grade {latestComparableGrade}</strong></span>
            ) : summary.studyRoute === 'staged' ? (
              <span>Predictions for staged routes require verified AS performance evidence</span>
            ) : !summary.isOptionResolved ? (
              <span>Select paper variants to enable combination prediction</span>
            ) : (
              <span>No complete historical sitting logged (all papers in one exam series)</span>
            )}
          </div>
        </div>
      </div>

      {/* Staged Route A–E Notice */}
      {summary.studyRoute === 'staged' && summary.targetGrade !== 'A*' && (
        <div
          role="note"
          aria-label="Staged route A-E target notice"
          style={{
            padding: 16,
            background: 'var(--bg-base)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={18} color="var(--accent)" aria-hidden="true" />
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Staged Route · Grade {summary.targetGrade}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            The official Cambridge combined threshold for Grade {summary.targetGrade} is{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{summary.officialCombinedTarget ?? '—'} marks</strong>.
            Because Cambridge does not define a standard halfway AS threshold for non-A* targets,
            A2 component mark allocation, combined marks, and predictions remain unavailable until
            verified official weighted AS results are available.
          </p>
        </div>
      )}

      {/* Staged A* Breakdown Card (if applicable) */}
      {stagedBreakdown && (
        <div
          style={{
            padding: 16,
            background: 'var(--bg-base)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Award size={18} color="var(--warning)" aria-hidden="true" />
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Staged A* Pathway Plan
            </span>
            <span
              style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(234, 179, 8, 0.12)',
                color: 'var(--warning)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
              }}
            >
              Atlas Estimate (Halfway Benchmark)
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginTop: 4,
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Estimated AS Contribution:
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {stagedBreakdown.kind === 'estimated_halfway'
                  ? stagedBreakdown.estimatedAsContribution
                  : stagedBreakdown.officialWeightedAsContribution}{' '}
                marks
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Remaining A2 Requirement:
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {stagedBreakdown.a2MaximumWeightedMark !== null
                  ? `${stagedBreakdown.remainingA2Required} / ${stagedBreakdown.a2MaximumWeightedMark} marks`
                  : `${stagedBreakdown.remainingA2Required} marks (A2 capacity unavailable)`}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status:</div>
              <div
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color:
                    stagedBreakdown.isMathematicallyPossible === true
                      ? 'var(--success)'
                      : stagedBreakdown.isMathematicallyPossible === false
                      ? 'var(--danger)'
                      : 'var(--text-muted)',
                }}
              >
                {stagedBreakdown.isMathematicallyPossible === true
                  ? 'Mathematically viable'
                  : stagedBreakdown.isMathematicallyPossible === false
                  ? 'Exceeds A2 maximum'
                  : 'Capacity check unavailable'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Safety Margin Selector Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          paddingTop: 4,
          opacity: summary.perPaperAllocationEligible ? 1 : 0.6,
        }}
      >
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Safety Margin Target:
        </span>
        <div role="group" aria-label="Safety margin selection" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { label: 'None', option: { type: 'none' } as SafetyMarginOption },
            { label: '+3 marks', option: { type: 'plus_3', marks: 3 } as SafetyMarginOption },
            { label: '+5 marks', option: { type: 'plus_5', marks: 5 } as SafetyMarginOption },
            {
              label: '+5%',
              option: { type: 'percentage', percentageValue: 5 } as SafetyMarginOption,
            },
          ].map((item, idx) => {
            const isSelected =
              (item.option.type === 'none' && safetyMargin.type === 'none') ||
              (item.option.type === 'plus_3' && safetyMargin.type === 'plus_3') ||
              (item.option.type === 'plus_5' && safetyMargin.type === 'plus_5') ||
              (item.option.type === 'percentage' &&
                safetyMargin.type === 'percentage' &&
                safetyMargin.percentageValue === 5)

            return (
              <button
                key={idx}
                type="button"
                className="touch-target-btn"
                aria-pressed={isSelected}
                disabled={!summary.perPaperAllocationEligible}
                onClick={() => onSelectSafetyMargin(item.option)}
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8125rem',
                  fontWeight: isSelected ? 700 : 500,
                  border: isSelected
                    ? '1.5px solid var(--accent)'
                    : '1px solid var(--border-subtle)',
                  background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-base)',
                  color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: summary.perPaperAllocationEligible ? 'pointer' : 'not-allowed',
                  transition: 'all 150ms ease',
                }}
              >
                {item.label}
              </button>
            )
          })}
        </div>
        {!summary.perPaperAllocationEligible && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Safety margin adjustments are unavailable when paper mark allocation is disabled.
          </span>
        )}
      </div>

      {/* Provenance Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: 12,
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          Publication:{' '}
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            {provenance.examSeries} {provenance.examYear}
          </span>
          {provenance.officialPublishedOn && (
            <span> · Published: {provenance.officialPublishedOn}</span>
          )}
        </div>
        {provenance.officialPdfUrl && (
          <a
            href={provenance.officialPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="touch-target-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--accent)',
              textDecoration: 'none',
              minHeight: 44,
              padding: '0 4px',
            }}
          >
            Official Cambridge Table <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  )
}
