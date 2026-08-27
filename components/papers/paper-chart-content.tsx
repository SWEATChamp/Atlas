'use client'

import type { ChapterAccuracy, PaperWithSubject } from '@/types'
import { ChapterAccuracyChart } from './chapter-accuracy-chart'
import { ScoreTrendChart } from './score-trend-chart'

export type PaperChartContentProps =
  | {
      kind: 'score-trend'
      papers: PaperWithSubject[]
      activeSubjectId: string | null
    }
  | {
      kind: 'chapter-accuracy'
      data: ChapterAccuracy[]
    }

export function PaperChartContent(props: PaperChartContentProps) {
  if (props.kind === 'score-trend') {
    return (
      <ScoreTrendChart
        papers={props.papers}
        activeSubjectId={props.activeSubjectId}
      />
    )
  }

  return <ChapterAccuracyChart data={props.data} />
}
