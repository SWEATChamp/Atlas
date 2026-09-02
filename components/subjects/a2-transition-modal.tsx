'use client'

import { useState, useTransition } from 'react'
import { Unlock, AlertTriangle, ChevronRight } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { transitionToA2 } from '@/lib/actions/route'
import type { Subject, UserSubject, ResultType, PaperSession } from '@/types'

interface Props {
  isOpen: boolean
  onClose: () => void
  enrollment: UserSubject
  subject: Subject
}

export default function A2TransitionModal({
  isOpen,
  onClose,
  enrollment,
  subject,
}: Props) {
  const [mode, setMode] = useState<'select' | 'normal' | 'manual'>('select')
  const resultType: ResultType = 'actual'
  const [scoreObtained, setScoreObtained] = useState<string>('')
  const [scoreMaximum, setScoreMaximum] = useState<string>('100')
  const [examSeries, setExamSeries] = useState<PaperSession>('may_jun')
  const [examYear, setExamYear] = useState<number>(new Date().getFullYear())
  const [carryForward, setCarryForward] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isAsOnly = enrollment.study_route === 'as_only'

  const handleNormalSubmit = () => {
    setError(null)
    const obtained = parseInt(scoreObtained, 10)
    const maximum = parseInt(scoreMaximum, 10)

    if (isNaN(obtained) || isNaN(maximum) || obtained < 0 || maximum <= 0) {
      setError('Please enter valid scores')
      return
    }
    if (obtained > maximum) {
      setError('Score obtained cannot exceed maximum score')
      return
    }

    startTransition(async () => {
      const res = await transitionToA2({
        userSubjectId: enrollment.id,
        unlockMethod: 'normal_transition',
        resultType: 'actual',
        scoreObtained: obtained,
        scoreMaximum: maximum,
        examSeries,
        examYear,
        carryForward,
      })

      if (res.error) {
        setError(res.error)
      } else {
        onClose()
      }
    })
  }

  const handleManualSubmit = (withResult: boolean) => {
    setError(null)
    let obtained: number | undefined
    let maximum: number | undefined

    if (withResult) {
      obtained = parseInt(scoreObtained, 10)
      maximum = parseInt(scoreMaximum, 10)
      if (isNaN(obtained) || isNaN(maximum) || obtained < 0 || maximum <= 0) {
        setError('Please enter valid scores')
        return
      }
      if (obtained > maximum) {
        setError('Score obtained cannot exceed maximum score')
        return
      }
    }

    startTransition(async () => {
      const res = await transitionToA2({
        userSubjectId: enrollment.id,
        unlockMethod: 'manual',
        resultType: withResult ? resultType : undefined,
        scoreObtained: withResult ? obtained : undefined,
        scoreMaximum: withResult ? maximum : undefined,
        examSeries: withResult ? examSeries : undefined,
        examYear: withResult ? examYear : undefined,
        carryForward: withResult && resultType === 'actual' ? carryForward : false,
      })

      if (res.error) {
        setError(res.error)
      } else {
        onClose()
      }
    })
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      titleId="a2-modal-title"
      descriptionId="a2-modal-desc"
      maxWidth={520}
      showCloseButton
      closeButtonAriaLabel="Close A2 transition modal"
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            paddingRight: 48,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              background: `${subject.color_hex}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: subject.color_hex,
              flexShrink: 0,
            }}
          >
            <Unlock size={18} />
          </div>
          <div>
            <h2 id="a2-modal-title" style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Unlock A2 Content
            </h2>
            <p id="a2-modal-desc" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {subject.name}
            </p>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div
              role="alert"
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(199, 123, 123, 0.1)',
                border: '1px solid rgba(199, 123, 123, 0.25)',
                color: 'var(--danger)',
                fontSize: '0.82rem',
              }}
            >
              {error}
            </div>
          )}

          {mode === 'select' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {isAsOnly && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(196, 160, 93, 0.08)',
                    border: '1px solid rgba(196, 160, 93, 0.2)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    Your current route is <strong>AS Level Only</strong>. Unlocking A2 content will convert your route to <strong>Staged A Level</strong>.
                  </div>
                </div>
              )}

              {!isAsOnly && (
                <button
                  type="button"
                  onClick={() => setMode('normal')}
                  className="touch-target-btn"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--border-subtle)',
                    background: 'var(--bg-elevated)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    minHeight: 44,
                    transition: 'border-color 150ms ease',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Completed AS Exams (Standard Transition)
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Record your official AS results and carry forward your score to A2.
                    </div>
                  </div>
                  <ChevronRight size={18} color="var(--text-muted)" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setMode('manual')}
                className="touch-target-btn"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  minHeight: 44,
                  transition: 'border-color 150ms ease',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {isAsOnly ? 'Continue to A2 (Switch to Staged)' : 'Early Unlock / Preview A2'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Start revising A2 chapters immediately without official results.
                  </div>
                </div>
                <ChevronRight size={18} color="var(--text-muted)" />
              </button>
            </div>
          )}

          {mode === 'normal' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Enter your official AS result
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label htmlFor="score-obtained-input" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Score Obtained
                  </label>
                  <input
                    id="score-obtained-input"
                    type="number"
                    value={scoreObtained}
                    onChange={(e) => setScoreObtained(e.target.value)}
                    placeholder="e.g. 85"
                    className="input"
                    style={{ width: '100%', marginTop: 4, minHeight: 44 }}
                  />
                </div>
                <div>
                  <label htmlFor="score-max-input" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Total Available
                  </label>
                  <input
                    id="score-max-input"
                    type="number"
                    value={scoreMaximum}
                    onChange={(e) => setScoreMaximum(e.target.value)}
                    placeholder="e.g. 100"
                    className="input"
                    style={{ width: '100%', marginTop: 4, minHeight: 44 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label htmlFor="exam-series-select" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Exam Series
                  </label>
                  <select
                    id="exam-series-select"
                    value={examSeries}
                    onChange={(e) => setExamSeries(e.target.value as PaperSession)}
                    className="input"
                    style={{ width: '100%', marginTop: 4, minHeight: 44 }}
                  >
                    <option value="may_jun">May/June</option>
                    <option value="oct_nov">Oct/Nov</option>
                    <option value="feb_mar">Feb/March</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="exam-year-input" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Exam Year
                  </label>
                  <input
                    id="exam-year-input"
                    type="number"
                    value={examYear}
                    onChange={(e) => setExamYear(parseInt(e.target.value, 10))}
                    className="input"
                    style={{ width: '100%', marginTop: 4, minHeight: 44 }}
                  />
                </div>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.8125rem',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  marginTop: 4,
                  minHeight: 44,
                }}
              >
                <input
                  type="checkbox"
                  checked={carryForward}
                  onChange={(e) => setCarryForward(e.target.checked)}
                />
                Carry forward this AS result to final A Level grade
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost touch-target-btn"
                  onClick={() => setMode('select')}
                  style={{ minHeight: 44 }}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary touch-target-btn"
                  onClick={handleNormalSubmit}
                  disabled={isPending}
                  style={{ background: subject.color_hex || 'var(--accent-primary)', minHeight: 44 }}
                >
                  {isPending ? 'Unlocking...' : 'Unlock A2'}
                </button>
              </div>
            </div>
          )}

          {mode === 'manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--accent-soft)',
                  border: '1px solid var(--border-accent)',
                  fontSize: '0.8125rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}
              >
                Manual unlock grants immediate access to all A2 chapters and past papers. You can enter an expected/forecast score now or skip this step.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost touch-target-btn"
                  onClick={() => setMode('select')}
                  style={{ minHeight: 44 }}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary touch-target-btn"
                  onClick={() => handleManualSubmit(false)}
                  disabled={isPending}
                  style={{ background: subject.color_hex || 'var(--accent-primary)', minHeight: 44 }}
                >
                  {isPending ? 'Unlocking...' : 'Unlock Now'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
