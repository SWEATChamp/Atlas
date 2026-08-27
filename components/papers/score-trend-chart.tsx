'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type { PaperWithSubject } from '@/types'
import { formatDateOnly } from '@/lib/date'

interface ScoreTrendChartProps {
  papers: PaperWithSubject[]
  activeSubjectId: string | null
}

const fmt = (d: string) =>
  formatDateOnly(d, { day: 'numeric', month: 'short', year: '2-digit' })

type ChartDatum = Record<string, unknown> & {
  attempted_at: string
  paper_code?: string
  accuracy_pct?: string | number
}

function CustomTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload.length) return null

  const firstEntry = payload[0]
  const data = firstEntry.payload as ChartDatum
  const firstDataKey =
    typeof firstEntry.dataKey === 'string' || typeof firstEntry.dataKey === 'number'
      ? String(firstEntry.dataKey)
      : ''
  const fallbackCode = firstDataKey ? data[`${firstDataKey}_code`] : ''
  const paperCode = data.paper_code ?? (typeof fallbackCode === 'string' ? fallbackCode : '')

  return (
    <div className="card" style={{ padding: '10px 14px', minWidth: 160 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: 4 }}>
        {paperCode}
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 4 }}>
        {fmt(data.attempted_at)}
      </div>
      {payload.map((entry, index) => {
        const dataKey =
          typeof entry.dataKey === 'string' || typeof entry.dataKey === 'number'
            ? String(entry.dataKey)
            : ''
        const raw = dataKey ? data[`${dataKey}_raw`] : undefined
        const rawPaper = raw && typeof raw === 'object' ? raw as PaperWithSubject : null
        const entryValue = Array.isArray(entry.value) ? entry.value[0] : entry.value
        const value = rawPaper ? Number(rawPaper.accuracy_pct) : Number(entryValue)
        const valueColor = value >= 80 ? 'var(--success)' : value >= 60 ? 'var(--warning)' : 'var(--danger)'

        return (
          <div key={dataKey || index} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
            <div style={{ width: 8, height: 2, background: entry.stroke || entry.color }} />
            {rawPaper ? `${rawPaper.paper_code}: ${rawPaper.score_raw}/${rawPaper.score_max}` : entry.name}
            <span style={{ marginLeft: 'auto', fontWeight: 700, color: valueColor }}>{value.toFixed(1)}%</span>
          </div>
        )
      })}
    </div>
  )
}

export function ScoreTrendChart({ papers, activeSubjectId }: ScoreTrendChartProps) {
  if (!papers || papers.length === 0) {
    return (
      <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        No papers logged yet
      </div>
    )
  }

  const sorted = [...papers].sort((a, b) => a.attempted_at.localeCompare(b.attempted_at))
  const avg = sorted.reduce((s, p) => s + Number(p.accuracy_pct), 0) / sorted.length

  const axisStyle = { stroke: 'var(--text-muted)', fontSize: 11, tickLine: false, axisLine: false }

  // ── Single-subject view ───────────────────────────────────────────────────
  if (activeSubjectId) {
    return (
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sorted} margin={{ top: 16, right: 48, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="attempted_at" tickFormatter={d => fmt(d)} {...axisStyle} />
            <YAxis tickFormatter={v => `${v}%`} domain={[0, 100]} {...axisStyle} />
            <Tooltip content={CustomTooltip} />
            <ReferenceLine y={avg} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 3">
              <Label value={`Avg ${avg.toFixed(1)}%`} position="right" fill="var(--text-muted)" fontSize={11} />
            </ReferenceLine>
            <Line
              type="monotone"
              dataKey="accuracy_pct"
              stroke="var(--accent-primary)"
              strokeWidth={2.5}
              dot={{ r: 4, fill: 'var(--accent-primary)', strokeWidth: 0 }}
              activeDot={{ r: 6, fill: 'var(--accent-primary)', stroke: 'var(--bg-card)', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // ── All-subjects view ─────────────────────────────────────────────────────
  // Build unified date rows — one row per unique date, each subject as its own column
  const subjectsMap = new Map<string, { name: string; color: string }>()
  sorted.forEach(p => {
    if (!subjectsMap.has(p.subject_id))
      subjectsMap.set(p.subject_id, { name: p.subjects.name, color: p.subjects.color_hex })
  })

  const allDates = Array.from(new Set(sorted.map(p => p.attempted_at))).sort()
  const unifiedData = allDates.map(date => {
    const row: ChartDatum = { attempted_at: date }
    sorted.filter(p => p.attempted_at === date).forEach(p => {
      row[p.subject_id] = Number(p.accuracy_pct)
      row[`${p.subject_id}_raw`] = p
      row[`${p.subject_id}_code`] = p.paper_code
    })
    return row
  })

  const subjectLines = Array.from(subjectsMap.entries()).slice(0, 6)

  return (
    <div style={{ width: '100%', height: 260 }}>
      {/* Subject legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', marginBottom: 12 }}>
        {subjectLines.map(([id, sub]) => (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <div style={{ width: 20, height: 2.5, background: sub.color || 'var(--accent-primary)', borderRadius: 2 }} />
            {sub.name}
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={unifiedData} margin={{ top: 16, right: 48, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="attempted_at" tickFormatter={d => fmt(d)} {...axisStyle} />
          <YAxis tickFormatter={v => `${v}%`} domain={[0, 100]} {...axisStyle} />
          <Tooltip content={CustomTooltip} />
          {/* Overall average reference line — same as single-subject view */}
          <ReferenceLine y={avg} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 3">
            <Label value={`Avg ${avg.toFixed(1)}%`} position="right" fill="var(--text-muted)" fontSize={11} />
          </ReferenceLine>
          {subjectLines.map(([id, sub]) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              name={sub.name}
              stroke={sub.color || 'var(--accent-primary)'}
              strokeWidth={2.5}
              dot={{ r: 4, fill: sub.color || 'var(--accent-primary)', strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: 'var(--bg-card)', strokeWidth: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
