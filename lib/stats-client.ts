import type { StatsOverviewData, StatsSubjectData } from '@/lib/session-cache'
import type { ChapterAccuracy } from '@/types'
import type { IndicatorItem } from '@/components/papers/study-indicators'

export async function fetchStatsOverview(
  subjectId: string | null,
  signal?: AbortSignal
): Promise<StatsOverviewData> {
  const params = new URLSearchParams({ section: 'overview' })
  if (subjectId) params.set('subjectId', subjectId)
  const res = await fetch(`/api/stats?${params.toString()}`, {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null)
    throw new Error(errorBody?.error || 'Failed to load stats overview')
  }
  return res.json() as Promise<StatsOverviewData>
}

export async function fetchStatsChapterAccuracy(
  subjectId: string | null,
  signal?: AbortSignal
): Promise<ChapterAccuracy[]> {
  const params = new URLSearchParams({ section: 'chapters' })
  if (subjectId) params.set('subjectId', subjectId)
  const res = await fetch(`/api/stats?${params.toString()}`, {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null)
    throw new Error(errorBody?.error || 'Failed to load chapter accuracy')
  }
  return res.json() as Promise<ChapterAccuracy[]>
}

export async function fetchStatsStudyIndicators(
  subjectId: string | null,
  signal?: AbortSignal
): Promise<IndicatorItem[]> {
  const params = new URLSearchParams({ section: 'indicators' })
  if (subjectId) params.set('subjectId', subjectId)
  const res = await fetch(`/api/stats?${params.toString()}`, {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null)
    throw new Error(errorBody?.error || 'Failed to load study indicators')
  }
  return res.json() as Promise<IndicatorItem[]>
}

export async function fetchStatsSubjectData(
  subjectId: string | null,
  signal?: AbortSignal
): Promise<StatsSubjectData> {
  const params = new URLSearchParams({ section: 'all' })
  if (subjectId) params.set('subjectId', subjectId)
  const res = await fetch(`/api/stats?${params.toString()}`, {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null)
    throw new Error(errorBody?.error || 'Failed to load statistics')
  }
  return res.json() as Promise<StatsSubjectData>
}
