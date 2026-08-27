'use client'

import { useState, useTransition } from 'react'
import { X, BookOpen, Layers, Award } from 'lucide-react'
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

  if (!isOpen) return null

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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: 540,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-xl, 0 20px 25px -5px rgba(0,0,0,0.5))',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Configure Study Route
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {subject.name} {subject.code ? `(${subject.code})` : ''}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close route setup sheet"
            onClick={onClose}
            className="touch-target-btn"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              width: 44,
              height: 44,
              minWidth: 44,
              minHeight: 44,
              padding: 0,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <X size={19} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: 'var(--danger)',
                fontSize: '0.82rem',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Select your qualification route
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ROUTE_OPTIONS.map((opt) => {
                const isSelected = selectedRoute === opt.id
                const Icon = opt.icon
                return (
                  <div
                    key={opt.id}
                    onClick={() => handleRouteChange(opt.id)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 'var(--radius-md)',
                      border: `1.5px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                      background: isSelected ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
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
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                  </div>
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
            className="btn btn-ghost"
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isPending}
            style={{
              padding: '8px 20px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-primary)',
              border: 'none',
              color: '#fff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? 'Saving...' : 'Confirm Route'}
          </button>
        </div>
      </div>
    </div>
  )
}
