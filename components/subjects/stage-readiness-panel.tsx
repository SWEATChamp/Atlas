'use client'

import { useState } from 'react'
import { Unlock, Settings, Award, AlertCircle, CheckCircle2 } from 'lucide-react'
import ReadinessBar from './readiness-bar'
import A2TransitionModal from './a2-transition-modal'
import RouteSetupSheet from './route-setup-sheet'
import type { Subject, UserSubject, SubjectPaperSelection, SubjectStageResult } from '@/types'

interface Props {
  enrollment: UserSubject
  subject: Subject
  asReadiness: number | null
  a2Readiness: number | null
  paperSelections?: SubjectPaperSelection[]
  stageResults?: SubjectStageResult[]
}

const SESSION_MAP: Record<string, string> = {
  may_jun: 'May/Jun',
  oct_nov: 'Oct/Nov',
  feb_mar: 'Feb/Mar',
}

export default function StageReadinessPanel({
  enrollment,
  subject,
  asReadiness,
  a2Readiness,
  paperSelections = [],
  stageResults = [],
}: Props) {
  const [showA2Modal, setShowA2Modal] = useState(false)
  const [showRouteModal, setShowRouteModal] = useState(false)

  const { study_route: route, current_stage: stage } = enrollment
  const isUnconfirmed = route === 'unconfirmed'
  const isAsOnly = route === 'as_only'
  const isStagedAs = route === 'staged' && stage === 'as'
  const isStagedA2 = route === 'staged' && stage === 'a2'
  const isFullLevel = route === 'full_level'

  // Find AS stage result if any
  const asResult = stageResults.find((r) => r.stage === 'as')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Readiness & Stage ({route === 'unconfirmed' ? 'Unconfirmed' : route === 'as_only' ? 'AS Level Only' : route === 'staged' ? `Staged (${stage?.toUpperCase()})` : 'Full A Level'})
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(isStagedAs || isAsOnly) && (
            <button
              type="button"
              onClick={() => setShowA2Modal(true)}
              className="touch-target-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 14px',
                minHeight: 44,
                minWidth: 44,
                borderRadius: 99,
                background: `${subject.color_hex}15`,
                border: `1px solid ${subject.color_hex}40`,
                color: subject.color_hex,
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Unlock size={14} />
              <span>Unlock A2</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowRouteModal(true)}
            className="touch-target-btn btn btn-ghost"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 14px',
              minHeight: 44,
              minWidth: 44,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Settings size={14} />
            <span>Route</span>
          </button>
        </div>
      </div>

      {isUnconfirmed && (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)',
            border: '1px dashed var(--border-muted)',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span>Select your study path to activate readiness tracking.</span>
          <button
            type="button"
            onClick={() => setShowRouteModal(true)}
            className="btn btn-primary touch-target-btn"
            style={{
              padding: '0 16px',
              minHeight: 44,
              minWidth: 44,
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Configure
          </button>
        </div>
      )}

      {(isAsOnly || isStagedAs) && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              AS Readiness
            </span>
          </div>
          <ReadinessBar value={asReadiness} height={8} />
        </div>
      )}

      {(isStagedA2 || isFullLevel) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                AS Readiness
              </span>
            </div>
            <ReadinessBar value={asReadiness} height={7} />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                A2 Readiness
              </span>
            </div>
            <ReadinessBar value={a2Readiness} height={7} />
          </div>

          {/* AS Result Context Section */}
          <div
            style={{
              marginTop: 4,
              padding: '14px 16px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                AS Result Context
              </span>
              {asResult && asResult.carry_forward && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: 'var(--success)',
                    background: 'rgba(121, 169, 139, 0.12)',
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}
                >
                  <CheckCircle2 size={12} />
                  Carried Forward
                </span>
              )}
            </div>

            {asResult ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Award size={18} color={subject.color_hex} />
                  <div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {asResult.score_obtained} / {asResult.score_maximum}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 6 }}>
                      ({((asResult.score_obtained / asResult.score_maximum) * 100).toFixed(1)}%)
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      color: asResult.result_type === 'actual' ? 'var(--text-primary)' : 'var(--warning)',
                      background: 'var(--bg-overlay)',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    {asResult.result_type === 'actual' ? 'Official Actual' : `${asResult.result_type} (Estimate)`}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {SESSION_MAP[asResult.exam_series] ?? asResult.exam_series} {asResult.exam_year}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                No AS examination result recorded yet.
              </div>
            )}

            {/* Overall Projection: always shown separately */}
            <div
              style={{
                marginTop: 6,
                paddingTop: 8,
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
              }}
            >
              <AlertCircle size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              <span>
                Overall Projection: <strong style={{ color: 'var(--text-secondary)' }}>Projection unavailable</strong> (official weighting & boundary calibration pending)
              </span>
            </div>
          </div>
        </div>
      )}

      {showA2Modal && (
        <A2TransitionModal
          isOpen={showA2Modal}
          onClose={() => setShowA2Modal(false)}
          enrollment={enrollment}
          subject={subject}
        />
      )}

      {showRouteModal && (
        <RouteSetupSheet
          isOpen={showRouteModal}
          onClose={() => setShowRouteModal(false)}
          enrollment={enrollment}
          subject={subject}
          initialPaperSelections={paperSelections}
        />
      )}
    </div>
  )
}
