'use client'

import type { PredictedExamMarkResult } from '@/lib/practice-analytics'

export interface IndicatorItem {
  subjectId: string
  subjectName: string
  subjectCode?: string
  stage: 'as' | 'a2'
  isCurrentStage: boolean
  isLockedA2: boolean
  predicted: PredictedExamMarkResult
  readinessScore: number | null
  hasRecordedHistory?: boolean
}

export function StudyIndicators({
  indicators,
  activeSubjectName,
}: {
  indicators: IndicatorItem[]
  activeSubjectName?: string | null
}) {
  if (indicators.length === 0) {
    return (
      <div className="card" style={{ padding: 'var(--space-5)', color: 'var(--text-muted)' }}>
        Confirm a study route for an active subject to view study indicators.
      </div>
    )
  }

  return (
    <section aria-labelledby="study-indicators-title" style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2 id="study-indicators-title" className="text-heading-3" style={{ margin: 0 }}>
          Study Indicators {activeSubjectName ? `· ${activeSubjectName}` : ''}
        </h2>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Practice-informed performance & readiness
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {indicators.map(item => {
          const hasEvidence = item.predicted.predictedPercentage !== null
          const pctStr = hasEvidence ? `${item.predicted.predictedPercentage!.toFixed(1)}%` : '—'
          const readyStr = item.readinessScore !== null ? `${item.readinessScore.toFixed(1)}%` : '—'

          return (
            <div
              key={`${item.subjectId}-${item.stage}`}
              className="card"
              style={{
                display: 'grid',
                gap: 'var(--space-4)',
                padding: 'var(--space-5)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                  {item.subjectName}
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-secondary)',
                    letterSpacing: '0.05em',
                  }}
                >
                  {item.stage} Stage
                </span>
              </div>

              {/* Indicator 1: Predicted Exam Mark */}
              <div
                style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-subtle)',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Predicted Exam Mark
                  </span>
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: 'var(--accent)',
                    }}
                  >
                    Estimate
                  </span>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', color: hasEvidence ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {pctStr}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  {hasEvidence
                    ? `${item.predicted.obtainedMarks}/${item.predicted.availableMarks} eligible marks · ${item.predicted.fullPaperCount} full paper${item.predicted.fullPaperCount === 1 ? '' : 's'}, ${item.predicted.practiceItemCount} question${item.predicted.practiceItemCount === 1 ? '' : 's'}`
                    : 'No current-route evidence yet'}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Practice-informed estimate mark-weighted across current-route full papers and question practice. Non-official.
                </p>
              </div>

              {/* Indicator 2: Readiness Score */}
              <div
                style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-subtle)',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Readiness Score
                  </span>
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: 'rgba(16, 185, 129, 0.1)',
                      color: 'var(--success)',
                    }}
                  >
                    Readiness
                  </span>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', color: item.readinessScore !== null ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {readyStr}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  35% notes + 40% assessment accuracy + 25% confidence
                </div>
                {item.isLockedA2 && (
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: '0.75rem',
                      color: item.hasRecordedHistory ? 'var(--warning)' : 'var(--text-muted)',
                      lineHeight: 1.4,
                    }}
                  >
                    {item.hasRecordedHistory
                      ? 'Early A2 practice recorded as preparation history. Activation for A2 readiness requires unlocking A2 with a matching route.'
                      : 'A2 readiness locked while studying AS. Complete or advance from AS to unlock A2 readiness.'}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
