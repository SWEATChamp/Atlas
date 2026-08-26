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

interface OptionCombination {
  id: string
  label: string
  description: string
  selections: PaperSelectionInput[]
}

export function getMathsCombinations(route: StudyRoute): OptionCombination[] {
  if (route === 'as_only') {
    return [
      {
        id: 'p1_m1',
        label: 'Pure 1 + Mechanics (Papers 1 & 4)',
        description: 'Standard Mechanics AS combination',
        selections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
        ],
      },
      {
        id: 'p1_s1',
        label: 'Pure 1 + Statistics 1 (Papers 1 & 5)',
        description: 'Standard Statistics AS combination',
        selections: [
          { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
          { component_name: 'Statistics 1', paper_number: 5, stage: 'as' },
        ],
      },
    ]
  }

  // Staged A Level or Full A Level
  return [
    {
      id: 'mech_stats',
      label: 'Mechanics + Statistics 1 (Papers 1, 3, 4, 5)',
      description: 'Pure 1 (AS) + Pure 3 (A2) + Mechanics (AS) + Statistics 1 (A2)',
      selections: [
        { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
        { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
        { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
        { component_name: 'Statistics 1', paper_number: 5, stage: 'a2' },
      ],
    },
    {
      id: 'stats_double',
      label: 'Statistics 1 + Statistics 2 (Papers 1, 3, 5, 6)',
      description: 'Pure 1 (AS) + Pure 3 (A2) + Statistics 1 (AS) + Statistics 2 (A2)',
      selections: [
        { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
        { component_name: 'Pure 3', paper_number: 3, stage: 'a2' },
        { component_name: 'Statistics 1', paper_number: 5, stage: 'as' },
        { component_name: 'Statistics 2', paper_number: 6, stage: 'a2' },
      ],
    },
  ]
}

export default function PaperSelectionPanel({
  subjectCode,
  route,
  initialSelections = [],
  onChange,
}: Props) {
  const isMaths = subjectCode === '9709'
  const combinations = isMaths ? getMathsCombinations(route) : []

  // Match initial selection to a combination ID if possible
  const findMatchingCombo = () => {
    if (!initialSelections.length && combinations.length > 0) return combinations[0].id
    for (const combo of combinations) {
      const match = combo.selections.every((sel) =>
        initialSelections.some(
          (init) => init.component_name === sel.component_name && init.stage === sel.stage
        )
      )
      if (match) return combo.id
    }
    return combinations[0]?.id ?? ''
  }

  const [selectedComboId, setSelectedComboId] = useState<string>(findMatchingCombo)

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
      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
        Paper combination (Mathematics 9709)
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border-muted)'}`,
                    background: isSelected ? 'var(--primary)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isSelected && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {combo.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {combo.description}
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
