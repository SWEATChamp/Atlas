import type { ChapterAccuracy, PaperWithSubject } from '@/types'
import type {
  AttemptTrendPoint,
  PracticeFormSubjectOption,
  PracticeSessionRead,
} from '@/types/practice-sessions'
import type { ComponentRank } from '@/lib/practice-analytics'
import type { TrendSubject } from '@/lib/practice-trend'
import type { IndicatorItem } from '@/components/papers/study-indicators'

export interface ComponentStatItem {
  label: string
  count: number
  markWeightedAccuracyPct: number | null
  averageRaw: number | null
  averageMax: number | null
  ranking: ComponentRank
}

export interface SummaryStatItem {
  label: string
  value: string | number
}

/** Top-level statistics loaded quickly without blocking on chapter breakdown or readiness RPCs */
export interface StatsOverviewData {
  subjectId: string | null
  trend: AttemptTrendPoint[]
  trendSubjects: TrendSubject[]
  summaryStats: SummaryStatItem[]
  componentStats: ComponentStatItem[]
  activeSubjectName: string | null
  timestamp: number
}

/** Full composite statistics dataset */
export interface StatsSubjectData extends StatsOverviewData {
  chapterAccuracy: ChapterAccuracy[]
  studyIndicators: IndicatorItem[]
}

export interface LogsSubjectData {
  subjectId: string | null
  page: number
  pageSize: number
  sessions: PracticeSessionRead[]
  totalSessions: number
  papers: PaperWithSubject[]
  untaggedPapers: PaperWithSubject[]
  timestamp: number
}

// Bounded in-memory caches isolated to the client session
const MAX_CACHE_ENTRIES = 20
export const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

let currentSessionUserId: string | null = null
let globalGeneration = 0
const subjectGenerations = new Map<string, number>()
const listeners = new Set<(affectedSubjectId?: string | null) => void>()

const statsOverviewCache = new Map<string, StatsOverviewData>()
const statsChapterCache = new Map<string, { data: ChapterAccuracy[]; timestamp: number }>()
const statsIndicatorsCache = new Map<string, { data: IndicatorItem[]; timestamp: number }>()
const logsCache = new Map<string, LogsSubjectData>()
let formCatalogueCache: PracticeFormSubjectOption[] | null = null

function statsKey(subjectId: string | null): string {
  return subjectId ?? 'all'
}

function logsKey(subjectId: string | null, page: number): string {
  return `${subjectId ?? 'all'}:${page}`
}

function enforceCapacity<K, V>(map: Map<K, V>): void {
  if (map.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = map.keys().next().value
    if (oldestKey !== undefined) map.delete(oldestKey)
  }
}

export function getCacheGeneration(): number {
  return globalGeneration
}

/** Retrieve subject-scoped cache generation. Incremented when this subject or global cache is invalidated. */
export function getSubjectGeneration(subjectId: string | null): number {
  const key = statsKey(subjectId)
  return (subjectGenerations.get(key) ?? 0) + globalGeneration
}

/** Set or verify current session user. Clears all cached state if user changed. */
export function setSessionUserId(userId: string | null): void {
  if (userId !== currentSessionUserId) {
    clearSessionCache()
    currentSessionUserId = userId
  }
}

export function getSessionUserId(): string | null {
  return currentSessionUserId
}

/** Subscribe to cache invalidation events (e.g. after mutations). */
export function subscribeSessionCache(listener: (affectedSubjectId?: string | null) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyListeners(affectedSubjectId?: string | null): void {
  for (const listener of listeners) {
    try {
      listener(affectedSubjectId)
    } catch (err) {
      console.error('Error in cache listener', err)
    }
  }
}

/** Retrieve cached Stats overview if available and fresh. */
export function getCachedStatsOverview(subjectId: string | null): StatsOverviewData | null {
  if (!currentSessionUserId) return null
  const key = statsKey(subjectId)
  const entry = statsOverviewCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    statsOverviewCache.delete(key)
    return null
  }
  return entry
}

/** Store Stats overview in bounded client cache. */
export function setCachedStatsOverview(
  subjectId: string | null,
  data: StatsOverviewData,
  ownerUserId?: string | null
): void {
  if (!currentSessionUserId) return
  if (ownerUserId && ownerUserId !== currentSessionUserId) return
  const key = statsKey(subjectId)
  enforceCapacity(statsOverviewCache)
  statsOverviewCache.set(key, { ...data, timestamp: Date.now() })
}

/** Retrieve cached Chapter Accuracy if available and fresh. */
export function getCachedStatsChapterAccuracy(subjectId: string | null): ChapterAccuracy[] | null {
  if (!currentSessionUserId) return null
  const key = statsKey(subjectId)
  const entry = statsChapterCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    statsChapterCache.delete(key)
    return null
  }
  return entry.data
}

/** Store Chapter Accuracy in bounded client cache. */
export function setCachedStatsChapterAccuracy(
  subjectId: string | null,
  data: ChapterAccuracy[],
  ownerUserId?: string | null
): void {
  if (!currentSessionUserId) return
  if (ownerUserId && ownerUserId !== currentSessionUserId) return
  const key = statsKey(subjectId)
  enforceCapacity(statsChapterCache)
  statsChapterCache.set(key, { data, timestamp: Date.now() })
}

/** Retrieve cached Study Indicators if available and fresh. */
export function getCachedStatsStudyIndicators(subjectId: string | null): IndicatorItem[] | null {
  if (!currentSessionUserId) return null
  const key = statsKey(subjectId)
  const entry = statsIndicatorsCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    statsIndicatorsCache.delete(key)
    return null
  }
  return entry.data
}

/** Store Study Indicators in bounded client cache. */
export function setCachedStatsStudyIndicators(
  subjectId: string | null,
  data: IndicatorItem[],
  ownerUserId?: string | null
): void {
  if (!currentSessionUserId) return
  if (ownerUserId && ownerUserId !== currentSessionUserId) return
  const key = statsKey(subjectId)
  enforceCapacity(statsIndicatorsCache)
  statsIndicatorsCache.set(key, { data, timestamp: Date.now() })
}

/** Retrieve cached full Stats data for a subject if available. */
export function getCachedStatsSubjectData(subjectId: string | null): StatsSubjectData | null {
  const overview = getCachedStatsOverview(subjectId)
  if (!overview) return null
  const chapterAccuracy = getCachedStatsChapterAccuracy(subjectId) ?? []
  const studyIndicators = getCachedStatsStudyIndicators(subjectId) ?? []
  return {
    ...overview,
    chapterAccuracy,
    studyIndicators,
  }
}

/** Store full Stats data for a subject in the bounded client cache. */
export function setCachedStatsSubjectData(
  subjectId: string | null,
  data: StatsSubjectData,
  ownerUserId?: string | null
): void {
  setCachedStatsOverview(subjectId, data, ownerUserId)
  setCachedStatsChapterAccuracy(subjectId, data.chapterAccuracy, ownerUserId)
  setCachedStatsStudyIndicators(subjectId, data.studyIndicators, ownerUserId)
}

/** Retrieve cached Logs data for a subject and page if available. */
export function getCachedLogsSubjectData(subjectId: string | null, page: number): LogsSubjectData | null {
  if (!currentSessionUserId) return null
  const key = logsKey(subjectId, page)
  const entry = logsCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    logsCache.delete(key)
    return null
  }
  return entry
}

/** Store Logs data for a subject and page in the bounded client cache. */
export function setCachedLogsSubjectData(
  subjectId: string | null,
  page: number,
  data: LogsSubjectData,
  ownerUserId?: string | null
): void {
  if (!currentSessionUserId) return
  if (ownerUserId && ownerUserId !== currentSessionUserId) return
  const key = logsKey(subjectId, page)
  enforceCapacity(logsCache)
  logsCache.set(key, { ...data, timestamp: Date.now() })
}

/** Retrieve cached practice form catalogue. */
export function getCachedFormCatalogue(): PracticeFormSubjectOption[] | null {
  if (!currentSessionUserId) return null
  return formCatalogueCache
}

/** Store practice form catalogue in memory for the duration of the client session. */
export function setCachedFormCatalogue(catalogue: PracticeFormSubjectOption[] | null): void {
  if (!currentSessionUserId) return
  formCatalogueCache = catalogue
}

/**
 * Invalidate session cache after mutations (create, update, delete, tag).
 * If subjectId is provided, clears entries for that subject and 'all' (aggregates).
 * If no subjectId is provided, clears all cached stats and logs data.
 */
export function invalidateSessionCache(subjectId?: string | null): void {
  if (subjectId && subjectId !== 'all') {
    const currentSubGen = subjectGenerations.get(subjectId) ?? 0
    subjectGenerations.set(subjectId, currentSubGen + 1)

    const currentAllGen = subjectGenerations.get('all') ?? 0
    subjectGenerations.set('all', currentAllGen + 1)

    statsOverviewCache.delete(subjectId)
    statsChapterCache.delete(subjectId)
    statsIndicatorsCache.delete(subjectId)
    // Clear aggregate ('all') because it depends on all subjects
    statsOverviewCache.delete('all')
    statsIndicatorsCache.delete('all')

    for (const key of Array.from(logsCache.keys())) {
      if (key.startsWith(`${subjectId}:`) || key.startsWith('all:')) {
        logsCache.delete(key)
      }
    }
    notifyListeners(subjectId)
  } else {
    globalGeneration++
    subjectGenerations.clear()
    statsOverviewCache.clear()
    statsChapterCache.clear()
    statsIndicatorsCache.clear()
    logsCache.clear()
    notifyListeners(subjectId ?? 'all')
  }
}

/** Completely wipe all client-session caches (e.g. on sign-out or user switch). */
export function clearSessionCache(): void {
  globalGeneration++
  subjectGenerations.clear()
  statsOverviewCache.clear()
  statsChapterCache.clear()
  statsIndicatorsCache.clear()
  logsCache.clear()
  formCatalogueCache = null
  currentSessionUserId = null
}
