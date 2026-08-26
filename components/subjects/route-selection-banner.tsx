'use client'

import { useState } from 'react'
import { AlertCircle, ArrowRight } from 'lucide-react'
import RouteSetupSheet from './route-setup-sheet'
import type { Subject, UserSubject } from '@/types'

interface Props {
  unconfirmedSubjects: Array<{
    enrollment: UserSubject
    subject: Subject
  }>
}

export default function RouteSelectionBanner({ unconfirmedSubjects }: Props) {
  const [activeSubject, setActiveSubject] = useState<{
    enrollment: UserSubject
    subject: Subject
  } | null>(null)

  if (!unconfirmedSubjects.length) return null

  return (
    <>
      <div
        style={{
          background: 'rgba(255, 171, 0, 0.08)',
          border: '1px solid rgba(255, 171, 0, 0.25)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 171, 0, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--warning)',
              flexShrink: 0,
            }}
          >
            <AlertCircle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Confirm your study route
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {unconfirmedSubjects.length === 1
                ? `Select your study path for ${unconfirmedSubjects[0].subject.name} (AS only, Staged, or Full A Level).`
                : `You have ${unconfirmedSubjects.length} subjects without a confirmed study route.`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {unconfirmedSubjects.map(({ enrollment, subject }) => (
            <button
              key={enrollment.id}
              onClick={() => setActiveSubject({ enrollment, subject })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 'var(--radius-md)',
                background: subject.color_hex || 'var(--primary)',
                color: '#fff',
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1'
              }}
            >
              Configure {subject.name}
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      </div>

      {activeSubject && (
        <RouteSetupSheet
          isOpen={true}
          onClose={() => setActiveSubject(null)}
          enrollment={activeSubject.enrollment}
          subject={activeSubject.subject}
        />
      )}
    </>
  )
}
