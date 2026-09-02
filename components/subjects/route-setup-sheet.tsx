'use client'

import { useState, useTransition } from 'react'
import { BookOpen, Layers, Award } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { configureSubjectRoute } from '@/lib/actions/route'
import PaperSelectionPanel, {
  getSubjectCombinations,
  isElectiveSubject,
  matchSavedCombination,
  remapSelectionsOnRouteChange,
} from './paper-selection-panel'
import type { Subject, UserSubject, StudyRoute } from '@/types'
import type { PaperSelectionInput } from '@/types'

interface Props {
  isOpen: boolean
  onClose: () => void
  enrollment: UserSubject
  subject: Subject
  initialPaperSelections?: PaperSelectionInput[]
}

const ROUTE_OPTIONS: Array<{
  id: StudyRoute
  title: string
  subtitle: string
  description: string
  icon: typeof BookOpen
}> = [
  {
    id: 'as_only',
    title: 'AS Level Only',
    subtitle: '1-Year Standalone',
    description: 'You are studying for the AS Level qualification only. A2 chapters and papers will remain hidden.',
    icon: BookOpen,
  },
  {
    id: 'staged',
    title: 'Staged A Level',
    subtitle: 'AS in Year 1, A2 in Year 2',
    description: 'Take AS exams first, then transition to A2 with your AS results to unlock A2 content.',
    icon: Layers,
  },
  {
    id: 'full_level',
    title: 'Full A Level (Linear)',
    subtitle: 'All papers in one series',
    description: 'Study both AS and A2 content concurrently. All chapters and past papers are immediately accessible.',
    icon: Award,
  },
]

export default function RouteSetupSheet({
  isOpen,
  onClose,
  enrollment,
  subject,
  initialPaperSelections = [],
}: Props) {
  const [selectedRoute, setSelectedRoute] = useState<StudyRoute>(
    enrollment.study_route === 'unconfirmed' ? 'staged' : enrollment.study_route
  )

  const isElective = isElectiveSubject(subject.code)
  const subjectCombinations = getSubjectCombinations(subject.code, selectedRoute)
  const defaultSelections = isElective
    ? []
    : subjectCombinations[0]?.selections ?? []

  const [paperSelections, setPaperSelections] = useState<PaperSelectionInput[]>(
    initialPaperSelections.length > 0 ? initialPaperSelections : defaultSelections
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleRouteChange = (route: StudyRoute) => {
    const prevRoute = selectedRoute
    setSelectedRoute(route)
    const remapped = remapSelectionsOnRouteChange(subject.code, prevRoute, route, paperSelections)
    setPaperSelections(remapped)
  }

  const handleSave = () => {
    if (selectedRoute === 'unconfirmed') {
      setError('Please choose a valid study route')
      return
    }

    if (isElective) {
      const match = matchSavedCombination(subject.code, selectedRoute, paperSelections)
      if (!match) {
        setError('Please select a valid paper combination for the chosen route')
        return
      }
    }

    setError(null)
    startTransition(async () => {
      const res = await configureSubjectRoute({
        userSubjectId: enrollment.id,
        route: selectedRoute,
        paperSelections,
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
      titleId="route-setup-title"
      descriptionId="route-setup-desc"
      maxWidth={540}
      showCloseButton
      closeButtonAriaLabel="Close route setup sheet"
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            paddingRight: 48,
          }}
        >
          <h2 id="route-setup-title" style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Configure Study Route
          </h2>
          <p id="route-setup-desc" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {subject.name} {subject.code ? `(${subject.code})` : ''}
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span
              id="route-choice-label"
              style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}
            >
              Select your qualification route
            </span>
            <div
              role="radiogroup"
              aria-labelledby="route-choice-label"
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              {ROUTE_OPTIONS.map((opt) => {
                const isSelected = selectedRoute === opt.id
                const Icon = opt.icon
                return (
                  <label
                    key={opt.id}
                    htmlFor={`route-${opt.id}`}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderRadius: 'var(--radius-md)',
                      border: `1.5px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                      background: isSelected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      minHeight: 44,
                    }}
                  >
                    <input
                      type="radio"
                      id={`route-${opt.id}`}
                      name="study_route"
                      value={opt.id}
                      checked={isSelected}
                      onChange={() => handleRouteChange(opt.id)}
                      style={{
                        marginTop: 4,
                        accentColor: 'var(--accent-primary)',
                        width: 18,
                        height: 18,
                        minWidth: 18,
                        minHeight: 18,
                        flexShrink: 0,
                        cursor: 'pointer',
                      }}
                    />
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        minWidth: 36,
                        minHeight: 36,
                        borderRadius: 'var(--radius-md)',
                        background: isSelected ? 'var(--accent-soft)' : 'var(--bg-card)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={18} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {opt.title}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                          {opt.subtitle}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.4 }}>
                        {opt.description}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Official paper configuration */}
          {subjectCombinations.length > 0 && (
            <PaperSelectionPanel
              subjectCode={subject.code}
              route={selectedRoute}
              initialSelections={paperSelections}
              onChange={setPaperSelections}
            />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
          }}
        >
          <button
            type="button"
            className="btn btn-ghost touch-target-btn"
            onClick={onClose}
            disabled={isPending}
            style={{ minHeight: 44, padding: '0 16px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary touch-target-btn"
            onClick={handleSave}
            disabled={isPending}
            style={{ minHeight: 44, padding: '0 20px' }}
          >
            {isPending ? 'Saving...' : 'Confirm Route'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
