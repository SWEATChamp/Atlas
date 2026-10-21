import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchStatsOverview,
  fetchStatsChapterAccuracy,
  fetchStatsStudyIndicators,
  fetchStatsSubjectData,
} from '@/lib/stats-client'

describe('Stats Client Data Layer (lib/stats-client.ts)', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('fetchStatsOverview calls fetch with cache: no-store and forwards supplied AbortSignal', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ subjectId: 'math-1', summaryStats: [] }),
    })
    globalThis.fetch = mockFetch

    const controller = new AbortController()
    const result = await fetchStatsOverview('math-1', controller.signal)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/stats?section=overview&subjectId=math-1')
    expect(options.cache).toBe('no-store')
    expect(options.signal).toBe(controller.signal)
    expect(options.headers).toEqual({ Accept: 'application/json' })
    expect(result).toEqual({ subjectId: 'math-1', summaryStats: [] })
  })

  it('fetchStatsChapterAccuracy calls fetch with cache: no-store and forwards supplied AbortSignal', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ chapter_id: 'ch-1', accuracy_pct: 85 }],
    })
    globalThis.fetch = mockFetch

    const controller = new AbortController()
    const result = await fetchStatsChapterAccuracy('math-1', controller.signal)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/stats?section=chapters&subjectId=math-1')
    expect(options.cache).toBe('no-store')
    expect(options.signal).toBe(controller.signal)
    expect(result).toEqual([{ chapter_id: 'ch-1', accuracy_pct: 85 }])
  })

  it('fetchStatsStudyIndicators calls fetch with cache: no-store and forwards supplied AbortSignal', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ subjectId: 'math-1', readinessScore: 90 }],
    })
    globalThis.fetch = mockFetch

    const controller = new AbortController()
    const result = await fetchStatsStudyIndicators('math-1', controller.signal)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/stats?section=indicators&subjectId=math-1')
    expect(options.cache).toBe('no-store')
    expect(options.signal).toBe(controller.signal)
    expect(result).toEqual([{ subjectId: 'math-1', readinessScore: 90 }])
  })

  it('fetchStatsSubjectData calls fetch with cache: no-store and forwards supplied AbortSignal', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ subjectId: 'math-1', trend: [] }),
    })
    globalThis.fetch = mockFetch

    const controller = new AbortController()
    const result = await fetchStatsSubjectData('math-1', controller.signal)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/stats?section=all&subjectId=math-1')
    expect(options.cache).toBe('no-store')
    expect(options.signal).toBe(controller.signal)
    expect(result).toEqual({ subjectId: 'math-1', trend: [] })
  })

  it('throws descriptive error on server failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Failed to load statistics. Please retry.' }),
    })
    globalThis.fetch = mockFetch

    await expect(fetchStatsOverview('math-1')).rejects.toThrow('Failed to load statistics. Please retry.')
  })
})
