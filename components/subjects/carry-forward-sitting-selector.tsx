'use client'

import React, { useId } from 'react'
import type { CarryForwardSittingOption } from '@/lib/planner'

interface Props {
  readonly options: readonly CarryForwardSittingOption[]
  readonly selectedToken: string | null
  readonly onSelect: (rawCarryForwardToken: string) => void
  readonly disabled?: boolean
  readonly compact?: boolean
}

export default function CarryForwardSittingSelector({
  options,
  selectedToken,
  onSelect,
  disabled = false,
  compact = false,
}: Props) {
  const groupId = useId()
  const legendId = `${groupId}-legend`
  const radioName = `carry-forward-sitting-${groupId}`

  if (options.length === 0) {
    return null
  }

  return (
    <fieldset
      aria-labelledby={legendId}
      disabled={disabled}
      style={{
        border: 'none',
        margin: 0,
        padding: 0,
        minWidth: 0,
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 8 : 10,
      }}
    >
      <legend
        id={legendId}
        style={{
          fontSize: compact ? '0.8125rem' : '0.875rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          padding: 0,
          marginBottom: 4,
        }}
      >
        Carried AS examination sitting
      </legend>

      <div
        role="radiogroup"
        aria-labelledby={legendId}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          minWidth: 0,
          maxWidth: '100%',
        }}
      >
        {options.map((opt) => {
          const isSelected = selectedToken === opt.rawCarryForwardToken
          const inputId = `${groupId}-${opt.rawCarryForwardToken}`
          return (
            <label
              key={opt.rawCarryForwardToken}
              htmlFor={inputId}
              className="touch-target-btn"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                minHeight: 44,
                minWidth: 0,
                flex: '1 1 220px',
                maxWidth: '100%',
                boxSizing: 'border-box',
                padding: compact ? '10px 12px' : '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: isSelected
                  ? '2px solid var(--accent)'
                  : '1px solid var(--border-subtle)',
                background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-base)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                overflowWrap: 'anywhere',
              }}
            >
              <input
                id={inputId}
                type="radio"
                name={radioName}
                value={opt.rawCarryForwardToken}
                checked={isSelected}
                onChange={() => onSelect(opt.rawCarryForwardToken)}
                style={{
                  marginTop: 3,
                  width: 18,
                  height: 18,
                  flexShrink: 0,
                  accentColor: 'var(--accent)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              />
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    lineHeight: 1.3,
                  }}
                >
                  {opt.label}
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.3,
                  }}
                >
                  Option {opt.entryOptionCode} · Carried token {opt.rawCarryForwardToken}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
