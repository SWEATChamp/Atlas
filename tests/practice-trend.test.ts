import { describe, expect, it } from 'vitest'
import { buildPracticeTrend, trendSubjectStyle } from '@/lib/practice-trend'
import type { AttemptTrendPoint } from '@/types/practice-sessions'

const subjects = [{ id: 'math', name: 'Mathematics', code: '9709' }, { id: 'chem', name: 'Chemistry', code: '9701' }]
const point = (id: string, subjectId: string, source: AttemptTrendPoint['source'], raw: number, max: number, createdAt: string): AttemptTrendPoint => ({
  id, subjectId, source, raw, max, accuracyPct: raw / max * 100, createdAt, attemptDate: '2026-10-16', stage: 'as',
  subjectPaperId: null, paperNumber: null, eligibleRaw: raw, eligibleMax: max, eligibleForCurrentRoute: true, itemCount: source === 'practice' ? 4 : 0,
})
const points = [point('m1', 'math', 'full_paper', 2, 5, '01'), point('c1', 'chem', 'practice', 8, 10, '02'), point('m2', 'math', 'practice', 9, 10, '03')]

describe('subject trend series', () => {
  it('keeps all same-day attempts in chronological order and computes cumulative marks, not averages of averages', () => {
    const result = buildPracticeTrend([...points].reverse(), subjects, 'all')
    expect(result.visible.map(point => point.id)).toEqual(['m1', 'c1', 'm2'])
    expect(result.overall.map(point => [point.raw, point.max])).toEqual([[2, 5], [10, 15], [19, 25]])
    expect(result.overall[2].accuracyPct).toBe(76)
    expect(result.series.find(series => series.id === 'math')?.attempts.map(attempt => attempt.index)).toEqual([0, 2])
    expect(result.series.find(series => series.id === 'math')?.attempts.map(attempt => attempt.point.accuracyPct)).toEqual([40, 90])
    expect(result.series.flatMap(series => series.attempts)).toHaveLength(3)
  })

  it.each(['full_paper', 'practice'] as const)('filters every series and cumulative denominator for %s', mode => {
    const result = buildPracticeTrend(points, subjects, mode)
    expect(result.visible.every(point => point.source === mode)).toBe(true)
    expect(result.series.flatMap(series => series.attempts).length).toBe(result.visible.length)
    expect(result.overall.at(-1)).toMatchObject(mode === 'full_paper' ? { raw: 2, max: 5, accuracyPct: 40 } : { raw: 17, max: 20, accuracyPct: 85 })
  })

  it('uses explicit top-page selection; All has overall even with one subject, specific subject has none', () => {
    const selected = buildPracticeTrend(points, subjects, 'all', 'chem')
    expect(selected.visible.map(point => point.id)).toEqual(['c1'])
    expect(selected.series.map(series => series.name)).toEqual(['Chemistry'])
    expect(selected.showOverall).toBe(false)
    expect(buildPracticeTrend([points[0]], subjects, 'all').showOverall).toBe(true)
  })

  it('retains identity styles across mode, subject and source ordering changes', () => {
    const all = buildPracticeTrend(points, subjects, 'all').series.find(series => series.id === 'math')!
    const filtered = buildPracticeTrend([...points].reverse(), [...subjects].reverse(), 'practice', 'math').series[0]
    expect(filtered.colour).toBe(all.colour)
    expect(filtered.dash).toBe(all.dash)
    expect(trendSubjectStyle(subjects[0]).colour).not.toBe(trendSubjectStyle(subjects[1]).colour)
  })

  it('keeps historical evidence and metadata outside the logging catalogue, with unambiguous fallbacks', () => {
    const result = buildPracticeTrend([point('a', 'historical-a', 'practice', 0, 5, '01'), point('b', 'historical-b', 'practice', 5, 5, '02')], [], 'all')
    expect(result.series).toHaveLength(2)
    expect(new Set(result.series.map(series => series.name)).size).toBe(2)
    expect(result.overall.at(-1)?.accuracyPct).toBe(50)
  })

  it('returns safe empty collections for an empty evidence mode', () => {
    expect(buildPracticeTrend([points[0]], subjects, 'practice')).toMatchObject({ visible: [], series: [], overall: [] })
  })
})
