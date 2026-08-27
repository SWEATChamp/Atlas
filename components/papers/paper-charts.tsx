'use client'

import dynamic from 'next/dynamic'
import type { ChapterAccuracy, PaperWithSubject } from '@/types'

function ChartLoading({ height }: { height: number }) {
  return (
    <div
      className="skeleton"
      role="status"
      aria-label="Loading chart"
      style={{ width: '100%', height, borderRadius: 'var(--radius-md)' }}
    />
  )
}

const PaperChartContent = dynamic(
  () => import('./paper-chart-content').then((module) => module.PaperChartContent),
  { loading: () => <ChartLoading height={260} /> }
)

export function LazyScoreTrendChart({
  papers,
  activeSubjectId,
}: {
  papers: PaperWithSubject[]
  activeSubjectId: string | null
}) {
  return (
    <PaperChartContent
      kind="score-trend"
      papers={papers}
      activeSubjectId={activeSubjectId}
    />
  )
}

export function LazyChapterAccuracyChart({ data }: { data: ChapterAccuracy[] }) {
  return <PaperChartContent kind="chapter-accuracy" data={data} />
}
