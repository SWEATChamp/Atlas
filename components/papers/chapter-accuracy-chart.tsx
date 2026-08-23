'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts'
import type { ChapterAccuracy } from '@/types'

export function ChapterAccuracyChart({ data }: { data: ChapterAccuracy[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        Attempt a past paper to see chapter breakdown
      </div>
    )
  }

  const chartData = [...data].sort((a, b) => a.accuracy_pct - b.accuracy_pct).slice(0, 10)

  const getFillColor = (pct: number) => {
    if (pct >= 80) return 'var(--success)'
    if (pct >= 60) return 'var(--warning)'
    return 'var(--danger)'
  }

  return (
    <div style={{ width: '100%', height: `${Math.max(300, chartData.length * 40)}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 100, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
          <XAxis type="number" tickFormatter={(val) => `${val}%`} domain={[0, 100]} stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis 
            type="category" 
            dataKey="title" 
            stroke="var(--text-muted)" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false}
            tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val}
          />
          <Tooltip 
            cursor={{ fill: 'var(--bg-hover)' }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload as ChapterAccuracy
                return (
                  <div className="card" style={{ padding: 'var(--space-2)' }}>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>{d.title}</p>
                    <p style={{ margin: 0 }}>Accuracy: {Number(d.accuracy_pct).toFixed(1)}%</p>
                    <p style={{ margin: 0, color: 'var(--text-muted)' }}>{d.total_obtained} / {d.total_available} marks</p>
                  </div>
                )
              }
              return null
            }}
          />
          <Bar dataKey="accuracy_pct" radius={[0, 4, 4, 0]} barSize={20}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getFillColor(entry.accuracy_pct)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
