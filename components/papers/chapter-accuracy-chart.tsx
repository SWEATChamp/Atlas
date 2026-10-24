'use client'

import { useSyncExternalStore } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { ChapterAccuracy } from '@/types'

function subscribeToMobile(callback: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const mql = window.matchMedia('(max-width: 640px)')
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getMobileSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(max-width: 640px)').matches
}

function getServerSnapshot(): boolean {
  return false
}

export function ChapterAccuracyChart({ data }: { data: ChapterAccuracy[] }) {
  const isMobile = useSyncExternalStore(subscribeToMobile, getMobileSnapshot, getServerSnapshot)

  if (!data || data.length === 0) {
    return (
      <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        Attempt a past paper or log question practice to see chapter breakdown
      </div>
    )
  }

  // Show all relevant evidence without silent .slice(0, 10). Sort lowest accuracy first.
  const chartData = [...data].sort((a, b) => {
    const aHas = a.total_available > 0 && a.attempt_count > 0
    const bHas = b.total_available > 0 && b.attempt_count > 0
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    return a.accuracy_pct - b.accuracy_pct
  })

  const getFillColor = (pct: number, hasEvidence: boolean) => {
    if (!hasEvidence) return 'var(--text-muted)'
    if (pct >= 80) return 'var(--success)'
    if (pct >= 60) return 'var(--warning)'
    return 'var(--danger)'
  }

  const containerHeight = Math.max(260, chartData.length * 36)

  return (
    <div
      style={{
        width: '100%',
        maxHeight: chartData.length > 10 ? '480px' : undefined,
        overflowY: chartData.length > 10 ? 'auto' : undefined,
        paddingRight: chartData.length > 10 ? 'var(--space-2)' : undefined,
      }}
    >
      <div style={{ width: '100%', height: `${containerHeight}px`, minHeight: '260px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 10, right: isMobile ? 12 : 30, left: isMobile ? 72 : 120, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(val) => `${val}%`}
              domain={[0, 100]}
              stroke="var(--text-muted)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="title"
              stroke="var(--text-muted)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => {
                const limit = isMobile ? 11 : 20
                return val && val.length > limit ? `${val.substring(0, limit)}...` : val || 'Chapter'
              }}
            />
            <Tooltip
              cursor={{ fill: 'var(--bg-hover)' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as ChapterAccuracy
                  const hasEvidence = d.total_available > 0 && d.attempt_count > 0
                  return (
                    <div className="card" style={{ padding: 'var(--space-2)' }}>
                      <p style={{ margin: 0, fontWeight: 'bold' }}>{d.title}</p>
                      {d.component && (
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.component}</p>
                      )}
                      <p style={{ margin: 0 }}>
                        Accuracy: {hasEvidence ? `${Number(d.accuracy_pct).toFixed(1)}%` : 'No evidence yet'}
                      </p>
                      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                        {hasEvidence
                          ? `${d.total_obtained} / ${d.total_available} marks (${d.attempt_count} ${d.attempt_count === 1 ? 'attempt' : 'attempts'})`
                          : 'No recorded marks'}
                      </p>
                    </div>
                  )
                }
                return null
              }}
            />
            <Bar dataKey="accuracy_pct" radius={[0, 4, 4, 0]} barSize={20}>
              {chartData.map((entry, index) => {
                const hasEvidence = entry.total_available > 0 && entry.attempt_count > 0
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={getFillColor(entry.accuracy_pct, hasEvidence)}
                    fillOpacity={hasEvidence ? 1 : 0.35}
                  />
                )
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Accessible full chapter breakdown so all names and evidence rows remain discoverable on mobile */}
      <details
        style={{
          marginTop: 'var(--space-3)',
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: 'var(--space-2)',
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            fontSize: '0.8125rem',
            color: 'var(--text-muted)',
            userSelect: 'none',
            padding: '4px 0',
          }}
        >
          View full chapter names &amp; evidence breakdown ({chartData.length} {chartData.length === 1 ? 'chapter' : 'chapters'})
        </summary>
        <div
          data-testid="chapter-evidence-rows"
          style={{
            marginTop: 'var(--space-2)',
            display: 'grid',
            gap: 'var(--space-2)',
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          {chartData.map((d) => {
            const hasEvidence = d.total_available > 0 && d.attempt_count > 0
            return (
              <div
                key={d.chapter_id}
                data-testid={`evidence-row-${d.chapter_id}`}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 'var(--space-2)',
                  fontSize: '0.8125rem',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <span style={{ fontWeight: 600 }}>{d.title}</span>
                  {d.component && (
                    <span style={{ marginLeft: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      ({d.component})
                    </span>
                  )}
                </div>
                <div style={{ whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
                  <span
                    style={{
                      fontWeight: 700,
                      color: hasEvidence
                        ? (d.accuracy_pct >= 80 ? 'var(--success)' : d.accuracy_pct >= 60 ? 'var(--warning)' : 'var(--danger)')
                        : 'var(--text-muted)',
                    }}
                  >
                    {hasEvidence ? `${Number(d.accuracy_pct).toFixed(1)}%` : 'No evidence yet'}
                  </span>
                  <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    {hasEvidence ? `${d.total_obtained}/${d.total_available} marks` : 'No marks'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}

export function ChapterAccuracySkeleton() {
  return (
    <section aria-labelledby="chapter-accuracy-title" className="card" style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}>
      <div>
        <h2 id="chapter-accuracy-title" className="text-heading-3" style={{ margin: 0 }}>Chapter &amp; Topic Accuracy</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Accuracy breakdown across syllabus chapters based on past papers and question practice
        </p>
      </div>
      <div className="skeleton" role="status" aria-label="Loading chapter accuracy" style={{ height: '260px', borderRadius: 'var(--radius-md)' }} />
      <div
        aria-hidden="true"
        style={{
          marginTop: 'var(--space-3)',
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: 'var(--space-2)',
        }}
      >
        <div style={{ padding: '4px 0' }}>
          <div className="skeleton" style={{ height: '16px', width: '240px', borderRadius: 'var(--radius-sm)' }} />
        </div>
      </div>
    </section>
  )
}
