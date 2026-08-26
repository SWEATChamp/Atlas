'use client'

import { useState, useEffect } from 'react'
import type { PaperSelectionInput } from '@/types'
import type { StudyRoute } from '@/types/database'

interface Props {
  subjectCode?: string | null
  route: StudyRoute
  initialSelections?: PaperSelectionInput[]
  onChange: (selections: PaperSelectionInput[]) => void
}

export interface OptionCombination {
  id: string
  label: string
  description: string
  asPapers: string[]
  a2Papers: string[]
  selections: PaperSelectionInput[]
}

export function getMathsCombinations(route: StudyRoute): OptionCombination[] {
  if (route === 'as_only') {
    return [
      {
        id: 'p1_p2',
        label: 'Pure 1 + Pure 2 (Papers 1 & 2)',
        description: 'Pure Mathematics 1 & 2',
        asPapers: ['Pure 1 (Paper 1)', 'Pure 2 (Paper 2)'],
        a2Papers: [],
        selections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Pure 2', paper_number: 2, stage: 'as' },
        ],
      },
      {
        id: 'p1_m1',
        label: 'Pure 1 + Mechanics (Papers 1 & 4)',
        description: 'Pure Mathematics 1 & Mechanics',
        asPapers: ['Pure 1 (Paper 1)', 'Mechanics (Paper 4)'],
        a2Papers: [],
        selections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
        ],
      },
      {
        id: 'p1_s1',
        label: 'Pure 1 + Statistics 1 (Papers 1 & 5)',
        description: 'Pure Mathematics 1 & Probability & Statistics 1',
        asPapers: ['Pure 1 (Paper 1)', 'Statistics 1 (Paper 5)'],
        a2Papers: [],
        selections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Statistics 1', paper_number: 5, stage: 'as' },
        ],
      },
    ]
  }

  if (route === 'staged') {
    return [
      {
        id: 'mech_stats',
        label: 'Pure 1 + Mechanics (AS) → Pure 3 + Stats 1 (A2)',
        description: 'Pure 1 & Mechanics in AS, then Pure 3 & Statistics 1 in A2 (Papers 1, 4, 3, 5)',
        asPapers: ['Pure 1 (Paper 1)', 'Mechanics (Paper 4)'],
        a2Papers: ['Pure 3 (Paper 3)', 'Statistics 1 (Paper 5)'],
        selections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
          { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
          { component_name: 'Statistics 1', paper_number: 5, stage: 'a2' },
        ],
      },
      {
        id: 'stats_mech',
        label: 'Pure 1 + Stats 1 (AS) → Pure 3 + Mechanics (A2)',
        description: 'Pure 1 & Statistics 1 in AS, then Pure 3 & Mechanics in A2 (Papers 1, 5, 3, 4)',
        asPapers: ['Pure 1 (Paper 1)', 'Statistics 1 (Paper 5)'],
        a2Papers: ['Pure 3 (Paper 3)', 'Mechanics (Paper 4)'],
        selections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Statistics 1', paper_number: 5, stage: 'as' },
          { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
          { component_name: 'Mechanics', paper_number: 4, stage: 'a2' },
        ],
      },
      {
        id: 'stats_double',
        label: 'Pure 1 + Stats 1 (AS) → Pure 3 + Stats 2 (A2)',
        description: 'Pure 1 & Statistics 1 in AS, then Pure 3 & Statistics 2 in A2 (Papers 1, 5, 3, 6)',
        asPapers: ['Pure 1 (Paper 1)', 'Statistics 1 (Paper 5)'],
        a2Papers: ['Pure 3 (Paper 3)', 'Statistics 2 (Paper 6)'],
        selections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Statistics 1', paper_number: 5, stage: 'as' },
          { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
          { component_name: 'Statistics 2', paper_number: 6, stage: 'a2' },
        ],
      },
    ]
  }

  if (route === 'full_level') {
    return [
      {
        id: 'full_mech_stats',
        label: 'Pure Mathematics, Mechanics & Statistics 1',
        description: 'Linear A Level with Papers 1, 3, 4 & 5',
        asPapers: ['Pure 1 (Paper 1)', 'Pure 3 (Paper 3)', 'Mechanics (Paper 4)', 'Statistics 1 (Paper 5)'],
        a2Papers: [],
        selections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
          { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
          { component_name: 'Statistics 1', paper_number: 5, stage: 'a2' },
        ],
      },
      {
        id: 'full_stats_double',
        label: 'Pure Mathematics & Statistics 1–2',
        description: 'Linear A Level with Papers 1, 3, 5 & 6',
        asPapers: ['Pure 1 (Paper 1)', 'Pure 3 (Paper 3)', 'Statistics 1 (Paper 5)', 'Statistics 2 (Paper 6)'],
        a2Papers: [],
        selections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
          { component_name: 'Statistics 1', paper_number: 5, stage: 'as' },
          { component_name: 'Statistics 2', paper_number: 6, stage: 'a2' },
        ],
      },
    ]
  }

  return []
}

export function matchSavedMathsCombination(
  route: StudyRoute,
  selections: PaperSelectionInput[]
): OptionCombination | null {
  if (!selections || selections.length === 0) return null
  const combinations = getMathsCombinations(route)

  if (route === 'full_level') {
    for (const combo of combinations) {
      if (combo.selections.length === selections.length) {
        const allMatch = combo.selections.every((sel) =>
          selections.some(
            (init) =>
              init.component_name === sel.component_name &&
              init.paper_number === sel.paper_number
          )
        )
        if (allMatch) return combo
      }
    }
    return null
  }

  for (const combo of combinations) {
    if (combo.selections.length === selections.length) {
      const allMatch = combo.selections.every((sel) =>
        selections.some(
          (init) =>
            init.component_name === sel.component_name &&
            init.stage === sel.stage &&
            init.paper_number === sel.paper_number
        )
      )
      if (allMatch) return combo
    }
  }
  return null
}

export function remapMathsSelectionsOnRouteChange(
  fromRoute: StudyRoute,
  toRoute: StudyRoute,
  currentSelections: PaperSelectionInput[]
): PaperSelectionInput[] {
  if (!currentSelections || currentSelections.length === 0) return []
  if (fromRoute === toRoute) return currentSelections

  // 1. full_level -> staged
  if (fromRoute === 'full_level' && toRoute === 'staged') {
    const fullMatch = matchSavedMathsCombination('full_level', currentSelections)
    // full_mech_stats is ambiguous between Route A and Route B -> clear selection
    if (fullMatch?.id === 'full_mech_stats') {
      return []
    }
    // full_stats_double has only 1 valid staged sequence (stats_double) -> safely remap
    if (fullMatch?.id === 'full_stats_double') {
      const stagedDouble = getMathsCombinations('staged').find((c) => c.id === 'stats_double')
      return stagedDouble?.selections ?? []
    }
    return []
  }

  // 2. staged -> full_level
  if (fromRoute === 'staged' && toRoute === 'full_level') {
    const fullMatch = matchSavedMathsCombination('full_level', currentSelections)
    return fullMatch?.selections ?? []
  }

  // 3. Any route -> as_only or from as_only -> 4-paper routes or unconfirmed
  if (
    toRoute === 'as_only' ||
    fromRoute === 'as_only' ||
    toRoute === 'unconfirmed' ||
    fromRoute === 'unconfirmed'
  ) {
    return []
  }

  // Standard match fallback
  const match = matchSavedMathsCombination(toRoute, currentSelections)
  return match?.selections ?? []
}

export default function PaperSelectionPanel({
  subjectCode,
  route,
  initialSelections = [],
  onChange,
}: Props) {
  const isMaths = subjectCode === '9709'
  const combinations = isMaths ? getMathsCombinations(route) : []

  // Resolve matching combination ID strictly
  const matched = isMaths ? matchSavedMathsCombination(route, initialSelections) : null
  const defaultComboId = matched ? matched.id : ''

  const [selectedComboId, setSelectedComboId] = useState<string>(defaultComboId)

  // Sync state if initialSelections or route change
  useEffect(() => {
    const match = matchSavedMathsCombination(route, initialSelections)
    if (match) {
      setSelectedComboId(match.id)
    } else {
      setSelectedComboId('')
    }
  }, [route, initialSelections])

  if (!isMaths || combinations.length === 0) {
    return null
  }

  const handleSelectCombo = (comboId: string) => {
    setSelectedComboId(comboId)
    const combo = combinations.find((c) => c.id === comboId)
    if (combo) {
      onChange(combo.selections)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Paper combination (Mathematics 9709)
        </label>
        {!selectedComboId && (
          <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>
            Selection required
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {combinations.map((combo) => {
          const isSelected = selectedComboId === combo.id
          return (
            <div
              key={combo.id}
              onClick={() => handleSelectCombo(combo.id)}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border-subtle)'}`,
                background: isSelected ? 'var(--primary-subtle, rgba(91, 127, 255, 0.08))' : 'var(--bg-elevated)',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border-muted)'}`,
                    background: isSelected ? 'var(--primary)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {isSelected && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {combo.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, marginBottom: 8 }}>
                    {combo.description}
                  </div>

                  {/* Paper breakdown */}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {route === 'full_level' ? (
                      combo.asPapers.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem' }}>
                          <span style={{ fontWeight: 700, color: 'var(--accent-primary, #5B7FFF)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Papers:
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {combo.asPapers.join(' + ')}
                          </span>
                        </div>
                      )
                    ) : (
                      <>
                        {combo.asPapers.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem' }}>
                            <span style={{ fontWeight: 700, color: 'var(--accent-primary, #5B7FFF)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              AS:
                            </span>
                            <span style={{ color: 'var(--text-secondary)' }}>
                              {combo.asPapers.join(' + ')}
                            </span>
                          </div>
                        )}
                        {combo.a2Papers.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem' }}>
                            <span style={{ fontWeight: 700, color: 'var(--warning, #FFB74D)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              A2:
                            </span>
                            <span style={{ color: 'var(--text-secondary)' }}>
                              {combo.a2Papers.join(' + ')}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
