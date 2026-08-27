'use client'

import { useState } from 'react'
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

export function isElectiveSubject(subjectCode?: string | null): boolean {
  return subjectCode === '9709' || subjectCode === '9231'
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

export function getFurtherMathsCombinations(route: StudyRoute): OptionCombination[] {
  if (route === 'as_only') {
    return [
      {
        id: 'fp1_fm',
        label: 'Further Pure 1 + Further Mechanics (Papers 1 & 3)',
        description: 'Further Pure Mathematics 1 & Further Mechanics',
        asPapers: ['Further Pure 1 (Paper 1)', 'Further Mechanics (Paper 3)'],
        a2Papers: [],
        selections: [
          { component_name: 'Further Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Further Mechanics', paper_number: 3, stage: 'as' },
        ],
      },
      {
        id: 'fp1_fps',
        label: 'Further Pure 1 + Further Stats (Papers 1 & 4)',
        description: 'Further Pure Mathematics 1 & Further Probability & Statistics',
        asPapers: ['Further Pure 1 (Paper 1)', 'Further Probability & Statistics (Paper 4)'],
        a2Papers: [],
        selections: [
          { component_name: 'Further Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Further Probability & Statistics', paper_number: 4, stage: 'as' },
        ],
      },
    ]
  }

  if (route === 'staged') {
    return [
      {
        id: 'fm_fps',
        label: 'Further Pure 1 + FM (AS) → Further Pure 2 + FPS (A2)',
        description: 'Further Pure 1 & Mechanics in AS, then Further Pure 2 & Statistics in A2 (Papers 1, 3, 2, 4)',
        asPapers: ['Further Pure 1 (Paper 1)', 'Further Mechanics (Paper 3)'],
        a2Papers: ['Further Pure 2 (Paper 2)', 'Further Probability & Statistics (Paper 4)'],
        selections: [
          { component_name: 'Further Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Further Mechanics', paper_number: 3, stage: 'as' },
          { component_name: 'Further Pure 2', paper_number: 2, stage: 'a2' },
          { component_name: 'Further Probability & Statistics', paper_number: 4, stage: 'a2' },
        ],
      },
      {
        id: 'fps_fm',
        label: 'Further Pure 1 + FPS (AS) → Further Pure 2 + FM (A2)',
        description: 'Further Pure 1 & Statistics in AS, then Further Pure 2 & Mechanics in A2 (Papers 1, 4, 2, 3)',
        asPapers: ['Further Pure 1 (Paper 1)', 'Further Probability & Statistics (Paper 4)'],
        a2Papers: ['Further Pure 2 (Paper 2)', 'Further Mechanics (Paper 3)'],
        selections: [
          { component_name: 'Further Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Further Probability & Statistics', paper_number: 4, stage: 'as' },
          { component_name: 'Further Pure 2', paper_number: 2, stage: 'a2' },
          { component_name: 'Further Mechanics', paper_number: 3, stage: 'a2' },
        ],
      },
    ]
  }

  if (route === 'full_level') {
    return [
      {
        id: 'full_all',
        label: 'All Four Papers (Papers 1, 2, 3 & 4)',
        description: 'Complete Linear A Level covering Further Pure 1 & 2, Further Mechanics, and Further Statistics',
        asPapers: ['Further Pure 1 (Paper 1)', 'Further Mechanics (Paper 3)'],
        a2Papers: ['Further Pure 2 (Paper 2)', 'Further Probability & Statistics (Paper 4)'],
        selections: [
          { component_name: 'Further Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Further Mechanics', paper_number: 3, stage: 'as' },
          { component_name: 'Further Pure 2', paper_number: 2, stage: 'a2' },
          { component_name: 'Further Probability & Statistics', paper_number: 4, stage: 'a2' },
        ],
      },
    ]
  }

  return []
}

export function getFixedSubjectCombinations(subjectCode: string, route: StudyRoute): OptionCombination[] {
  if (subjectCode === '9702') {
    if (route === 'as_only') {
      return [{
        id: 'standard',
        label: 'AS Level Physics (Papers 1, 2 & 3)',
        description: 'Multiple Choice, AS Structured Questions, and Advanced Practical Skills',
        asPapers: ['Multiple Choice (Paper 1)', 'AS Structured Questions (Paper 2)', 'Advanced Practical Skills (Paper 3)'],
        a2Papers: [],
        selections: [
          { component_name: 'Multiple Choice (AS)', paper_number: 1, stage: 'as' },
          { component_name: 'AS Level Structured Questions', paper_number: 2, stage: 'as' },
          { component_name: 'Advanced Practical Skills', paper_number: 3, stage: 'as' },
        ],
      }]
    }
    if (route === 'staged' || route === 'full_level') {
      return [{
        id: 'standard',
        label: route === 'staged' ? 'Staged A Level Physics (AS: P1–P3 → A2: P4–P5)' : 'Full A Level Physics (All Papers 1–5)',
        description: route === 'staged' ? 'Papers 1–3 in AS, then Papers 4–5 in A2' : 'All 5 papers taken in linear series',
        asPapers: ['Multiple Choice (Paper 1)', 'AS Structured Questions (Paper 2)', 'Advanced Practical Skills (Paper 3)'],
        a2Papers: ['A Level Structured Questions (Paper 4)', 'Planning, Analysis and Evaluation (Paper 5)'],
        selections: [
          { component_name: 'Multiple Choice (AS)', paper_number: 1, stage: 'as' },
          { component_name: 'AS Level Structured Questions', paper_number: 2, stage: 'as' },
          { component_name: 'Advanced Practical Skills', paper_number: 3, stage: 'as' },
          { component_name: 'A Level Structured Questions', paper_number: 4, stage: 'a2' },
          { component_name: 'Planning, Analysis and Evaluation', paper_number: 5, stage: 'a2' },
        ],
      }]
    }
  }

  if (subjectCode === '9701') {
    if (route === 'as_only') {
      return [{
        id: 'standard',
        label: 'AS Level Chemistry (Papers 1, 2 & 3)',
        description: 'Multiple Choice, AS Structured Questions, and Advanced Practical Skills',
        asPapers: ['Multiple Choice (Paper 1)', 'AS Structured Questions (Paper 2)', 'Advanced Practical Skills (Paper 3)'],
        a2Papers: [],
        selections: [
          { component_name: 'Multiple Choice (AS)', paper_number: 1, stage: 'as' },
          { component_name: 'AS Level Structured Questions', paper_number: 2, stage: 'as' },
          { component_name: 'Advanced Practical Skills', paper_number: 3, stage: 'as' },
        ],
      }]
    }
    if (route === 'staged' || route === 'full_level') {
      return [{
        id: 'standard',
        label: route === 'staged' ? 'Staged A Level Chemistry (AS: P1–P3 → A2: P4–P5)' : 'Full A Level Chemistry (All Papers 1–5)',
        description: route === 'staged' ? 'Papers 1–3 in AS, then Papers 4–5 in A2' : 'All 5 papers taken in linear series',
        asPapers: ['Multiple Choice (Paper 1)', 'AS Structured Questions (Paper 2)', 'Advanced Practical Skills (Paper 3)'],
        a2Papers: ['A Level Structured Questions (Paper 4)', 'Planning, Analysis and Evaluation (Paper 5)'],
        selections: [
          { component_name: 'Multiple Choice (AS)', paper_number: 1, stage: 'as' },
          { component_name: 'AS Level Structured Questions', paper_number: 2, stage: 'as' },
          { component_name: 'Advanced Practical Skills', paper_number: 3, stage: 'as' },
          { component_name: 'A Level Structured Questions', paper_number: 4, stage: 'a2' },
          { component_name: 'Planning, Analysis and Evaluation', paper_number: 5, stage: 'a2' },
        ],
      }]
    }
  }

  if (subjectCode === '9618') {
    if (route === 'as_only') {
      return [{
        id: 'standard',
        label: 'AS Level Computer Science (Papers 1 & 2)',
        description: 'Theory Fundamentals and Problem-solving & Programming Skills',
        asPapers: ['Theory Fundamentals (Paper 1)', 'Fundamental Problem-solving & Programming Skills (Paper 2)'],
        a2Papers: [],
        selections: [
          { component_name: 'Theory Fundamentals', paper_number: 1, stage: 'as' },
          { component_name: 'Fundamental Problem-solving & Programming Skills', paper_number: 2, stage: 'as' },
        ],
      }]
    }
    if (route === 'staged' || route === 'full_level') {
      return [{
        id: 'standard',
        label: route === 'staged' ? 'Staged A Level Computer Science (AS: P1–P2 → A2: P3–P4)' : 'Full A Level Computer Science (All Papers 1–4)',
        description: route === 'staged' ? 'Papers 1 & 2 in AS, then Advanced Theory and Practical in A2' : 'All 4 papers taken in linear series',
        asPapers: ['Theory Fundamentals (Paper 1)', 'Fundamental Problem-solving & Programming Skills (Paper 2)'],
        a2Papers: ['Advanced Theory (Paper 3)', 'Practical (Paper 4)'],
        selections: [
          { component_name: 'Theory Fundamentals', paper_number: 1, stage: 'as' },
          { component_name: 'Fundamental Problem-solving & Programming Skills', paper_number: 2, stage: 'as' },
          { component_name: 'Advanced Theory', paper_number: 3, stage: 'a2' },
          { component_name: 'Practical', paper_number: 4, stage: 'a2' },
        ],
      }]
    }
  }

  return []
}

export function getSubjectCombinations(subjectCode: string | null | undefined, route: StudyRoute): OptionCombination[] {
  if (subjectCode === '9709') return getMathsCombinations(route)
  if (subjectCode === '9231') return getFurtherMathsCombinations(route)
  if (subjectCode === '9702' || subjectCode === '9701' || subjectCode === '9618') {
    return getFixedSubjectCombinations(subjectCode, route)
  }
  return []
}

export function matchSavedCombination(
  subjectCode: string | null | undefined,
  route: StudyRoute,
  selections: PaperSelectionInput[]
): OptionCombination | null {
  if (!selections || selections.length === 0) return null
  const combinations = getSubjectCombinations(subjectCode, route)

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

export function remapSelectionsOnRouteChange(
  subjectCode: string | null | undefined,
  fromRoute: StudyRoute,
  toRoute: StudyRoute,
  currentSelections: PaperSelectionInput[]
): PaperSelectionInput[] {
  if (!currentSelections || currentSelections.length === 0) return []
  if (fromRoute === toRoute) return currentSelections

  // Fixed subjects auto-remap to the canonical set for toRoute
  if (subjectCode === '9702' || subjectCode === '9701' || subjectCode === '9618') {
    const fixedCombos = getFixedSubjectCombinations(subjectCode, toRoute)
    return fixedCombos[0]?.selections ?? []
  }

  // Maths 9709
  if (subjectCode === '9709') {
    if (fromRoute === 'full_level' && toRoute === 'staged') {
      const fullMatch = matchSavedCombination('9709', 'full_level', currentSelections)
      if (fullMatch?.id === 'full_mech_stats') return []
      if (fullMatch?.id === 'full_stats_double') {
        const stagedDouble = getMathsCombinations('staged').find((c) => c.id === 'stats_double')
        return stagedDouble?.selections ?? []
      }
      return []
    }
    if (fromRoute === 'staged' && toRoute === 'full_level') {
      const fullMatch = matchSavedCombination('9709', 'full_level', currentSelections)
      return fullMatch?.selections ?? []
    }
    return []
  }

  // Further Maths 9231
  if (subjectCode === '9231') {
    if (toRoute === 'full_level') {
      const fullCombo = getFurtherMathsCombinations('full_level')[0]
      return fullCombo?.selections ?? []
    }
    return []
  }

  return []
}

// Backward compatibility aliases
export const matchSavedMathsCombination = (route: StudyRoute, selections: PaperSelectionInput[]) =>
  matchSavedCombination('9709', route, selections)

export const remapMathsSelectionsOnRouteChange = (from: StudyRoute, to: StudyRoute, sel: PaperSelectionInput[]) =>
  remapSelectionsOnRouteChange('9709', from, to, sel)

export default function PaperSelectionPanel({
  subjectCode,
  route,
  initialSelections = [],
  onChange,
}: Props) {
  const isElective = isElectiveSubject(subjectCode)
  const combinations = getSubjectCombinations(subjectCode, route)

  const matched = matchSavedCombination(subjectCode, route, initialSelections)
  const defaultComboId = matched ? matched.id : (isElective ? '' : (combinations[0]?.id ?? ''))

  const [selectedComboId, setSelectedComboId] = useState<string>(defaultComboId)
  const [prevProps, setPrevProps] = useState({ subjectCode, route, initialSelections })

  if (
    prevProps.subjectCode !== subjectCode ||
    prevProps.route !== route ||
    prevProps.initialSelections !== initialSelections
  ) {
    setPrevProps({ subjectCode, route, initialSelections })
    const match = matchSavedCombination(subjectCode, route, initialSelections)
    if (match) {
      setSelectedComboId(match.id)
    } else if (!isElective && combinations.length > 0) {
      setSelectedComboId(combinations[0].id)
    } else {
      setSelectedComboId('')
    }
  }

  if (combinations.length === 0) {
    return null
  }

  const handleSelectCombo = (comboId: string) => {
    setSelectedComboId(comboId)
    const combo = combinations.find((c) => c.id === comboId)
    if (combo) {
      onChange(combo.selections)
    }
  }

  // Non-elective (Fixed) subjects: show a clean canonical summary
  if (!isElective) {
    const combo = combinations[0]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Canonical Exam Papers ({combo.label})
        </div>
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1.5px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            {combo.description}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
          </div>
        </div>
      </div>
    )
  }

  // Elective subjects (Maths 9709 & Further Maths 9231)
  const subjectName = subjectCode === '9231' ? 'Further Mathematics 9231' : 'Mathematics 9709'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Paper combination ({subjectName})
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
