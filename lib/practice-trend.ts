import type { AttemptTrendPoint } from '@/types/practice-sessions'
import { trendPointsForMode, type TrendMode } from '@/lib/practice-ui'

export interface TrendSubject { id: string; name: string; code?: string }

const subjectColours: Record<string, string> = {
  '9709': '#67c8ff', '9231': '#bd9aff', '9701': '#ffb454', '9702': '#63d6ad', '9618': '#f78fbd',
}
const subjectNames: Record<string, string> = {
  mathematics: '9709', 'further mathematics': '9231', chemistry: '9701', physics: '9702', 'computer science': '9618',
}

/** Identity-based styling stays stable when subjects or evidence modes are filtered. */
export function trendSubjectStyle(subject: TrendSubject) {
  const code = subject.code ?? subjectNames[subject.name.toLowerCase()]
  let hash = 0
  for (const char of subject.id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  return { colour: subjectColours[code] ?? `hsl(${hash % 360} 70% 65%)`, dash: ['', '8 3', '2 3', '10 3 2 3'][hash % 4] }
}

/** One row per actual attempt; never collapse same-day attempts or expand session items. */
export function buildPracticeTrend(points: readonly AttemptTrendPoint[], subjects: readonly TrendSubject[], mode: TrendMode, subjectId?: string | null) {
  const visible = trendPointsForMode(subjectId ? points.filter(point => point.subjectId === subjectId) : points, mode)
    .sort((a, b) => a.attemptDate.localeCompare(b.attemptDate) || a.createdAt.localeCompare(b.createdAt) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id))
  const metadata = new Map(subjects.map(subject => [subject.id, subject]))
  const series = [...new Set(visible.map(point => point.subjectId))].map(id => {
    const subject = metadata.get(id) ?? { id, name: `Subject (${id.slice(-8)})` }
    return { ...subject, ...trendSubjectStyle(subject), attempts: visible.flatMap((point, index) => point.subjectId === id ? [{ point, index }] : []) }
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  let raw = 0, max = 0
  const overall = visible.map((point, index) => {
    raw += point.raw; max += point.max
    return { index, raw, max, accuracyPct: max > 0 ? raw / max * 100 : 0 }
  })
  return { visible, series, overall, showOverall: !subjectId }
}
