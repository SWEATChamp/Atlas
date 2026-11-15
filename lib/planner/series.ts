/**
 * Milestone 5: Target-Grade Marks Planner - Series & Session Ordering
 *
 * Maps database paper session tokens ('feb_mar', 'may_jun', 'oct_nov') to official
 * Cambridge series ('march', 'june', 'november'), enforces chronological ordering
 * (March < June < November within a calendar year), and implements publication
 * selection with strictly earlier fallback (never future).
 */

import type { PaperSession } from '@/types/database'
import type { CambridgeExamSeries, ExamSessionSpec } from './types'

export function mapPaperSessionToSeries(session: PaperSession): CambridgeExamSeries {
  switch (session) {
    case 'feb_mar':
      return 'march'
    case 'may_jun':
      return 'june'
    case 'oct_nov':
      return 'november'
  }
}

export function mapSeriesToPaperSession(series: CambridgeExamSeries): PaperSession {
  switch (series) {
    case 'march':
      return 'feb_mar'
    case 'june':
      return 'may_jun'
    case 'november':
      return 'oct_nov'
  }
}

export function seriesRank(series: CambridgeExamSeries): number {
  switch (series) {
    case 'march':
      return 1
    case 'june':
      return 2
    case 'november':
      return 3
  }
}

/**
 * Total ordering on Cambridge examination sessions.
 * Returns negative if a is earlier than b, positive if a is after b, 0 if equal.
 */
export function compareSessions(a: ExamSessionSpec, b: ExamSessionSpec): number {
  if (a.year !== b.year) {
    return a.year - b.year
  }
  return seriesRank(a.series) - seriesRank(b.series)
}

export function isSessionEarlier(candidate: ExamSessionSpec, intended: ExamSessionSpec): boolean {
  return compareSessions(candidate, intended) < 0
}

export function isSessionFuture(candidate: ExamSessionSpec, intended: ExamSessionSpec): boolean {
  return compareSessions(candidate, intended) > 0
}

export function isSameSession(a: ExamSessionSpec, b: ExamSessionSpec): boolean {
  return a.year === b.year && a.series === b.series
}

export interface CandidatePublication extends ExamSessionSpec {
  readonly id: string
  readonly isActive: boolean
  readonly publicationStatus: string
}

export interface SelectedPublicationResult<T extends CandidatePublication> {
  readonly publication: T
  readonly isFallback: boolean
  readonly intendedYear: number
  readonly intendedSeries: CambridgeExamSeries
}

/**
 * Select the applicable Cambridge publication for an intended exam session:
 * 1. An exact match on (year, series) if active and published.
 * 2. Or the newest earlier compatible publication (strictly earlier, never future).
 * 3. Returns null if no compatible publication is available on or before the intended session.
 */
export function selectApplicablePublication<T extends CandidatePublication>(
  publications: readonly T[],
  intended: ExamSessionSpec
): SelectedPublicationResult<T> | null {
  const activePublished = publications.filter(
    (p) => p.isActive && p.publicationStatus === 'published'
  )

  // 1. Exact match
  const exact = activePublished.find((p) => isSameSession(p, intended))
  if (exact) {
    return {
      publication: exact,
      isFallback: false,
      intendedYear: intended.year,
      intendedSeries: intended.series,
    }
  }

  // 2. Strict earlier fallback: filter candidates with compareSessions(candidate, intended) < 0
  const earlier = activePublished.filter((p) => isSessionEarlier(p, intended))
  if (earlier.length === 0) {
    return null
  }

  // Sort descending: newest candidate first
  const sorted = [...earlier].sort((a, b) => compareSessions(b, a))
  const newestEarlier = sorted[0]

  return {
    publication: newestEarlier,
    isFallback: true,
    intendedYear: intended.year,
    intendedSeries: intended.series,
  }
}

/**
 * Format a human-readable label for a session, e.g. "June 2026".
 */
export function formatSessionLabel(year: number, series: CambridgeExamSeries): string {
  const seriesName = series === 'march' ? 'March' : series === 'june' ? 'June' : 'November'
  return `${seriesName} ${year}`
}

/**
 * Derive exam session from a date string (YYYY-MM-DD).
 * Feb/Mar examination window -> March
 * May/Jun examination window -> June
 * Oct/Nov examination window -> November
 */
export function deriveSessionFromDate(dateStr: string | null): ExamSessionSpec | null {
  if (!dateStr) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!match) return null

  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)

  if (month >= 1 && month <= 3) {
    return { year, series: 'march' }
  } else if (month >= 4 && month <= 6) {
    return { year, series: 'june' }
  } else if (month >= 7 && month <= 12) {
    return { year, series: 'november' }
  }
  return null
}
