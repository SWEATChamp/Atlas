import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/stats/route'

const {
  mockGetAuthenticatedContext,
  mockGetStatsOverviewData,
  mockGetStatsChapterAccuracy,
  mockGetStatsStudyIndicators,
  mockGetStatsSubjectData,
} = vi.hoisted(() => ({
  mockGetAuthenticatedContext: vi.fn(),
  mockGetStatsOverviewData: vi.fn(),
  mockGetStatsChapterAccuracy: vi.fn(),
  mockGetStatsStudyIndicators: vi.fn(),
  mockGetStatsSubjectData: vi.fn(),
}))

vi.mock('@/lib/supabase/authenticated', () => ({
  getAuthenticatedContext: mockGetAuthenticatedContext,
}))

vi.mock('@/lib/actions/practice-sessions', () => ({
  getStatsOverviewData: mockGetStatsOverviewData,
  getStatsChapterAccuracy: mockGetStatsChapterAccuracy,
  getStatsStudyIndicators: mockGetStatsStudyIndicators,
  getStatsSubjectData: mockGetStatsSubjectData,
}))

describe('GET /api/stats Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 Unauthorized when user session is missing with private no-store cache headers', async () => {
    mockGetAuthenticatedContext.mockResolvedValue({ user: null, supabase: {} })

    const request = new NextRequest('http://localhost:3000/api/stats?section=overview')
    const response = await GET(request)

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    const json = await response.json()
    expect(json.error).toBe('Unauthorized')
    expect(mockGetStatsOverviewData).not.toHaveBeenCalled()
  })

  it('returns overview data when section=overview with private no-store cache headers', async () => {
    mockGetAuthenticatedContext.mockResolvedValue({ user: { id: 'user-1' }, supabase: {} })
    mockGetStatsOverviewData.mockResolvedValue({ subjectId: 'sub-1', summaryStats: [] })

    const request = new NextRequest('http://localhost:3000/api/stats?section=overview&subjectId=sub-1')
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    const json = await response.json()
    expect(json.subjectId).toBe('sub-1')
    expect(mockGetStatsOverviewData).toHaveBeenCalledWith('sub-1')
  })

  it('returns chapter accuracy data when section=chapters with private no-store cache headers', async () => {
    mockGetAuthenticatedContext.mockResolvedValue({ user: { id: 'user-1' }, supabase: {} })
    mockGetStatsChapterAccuracy.mockResolvedValue([{ chapter_id: 'ch-1', accuracy_pct: 80 }])

    const request = new NextRequest('http://localhost:3000/api/stats?section=chapters&subjectId=sub-1')
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    const json = await response.json()
    expect(json).toEqual([{ chapter_id: 'ch-1', accuracy_pct: 80 }])
    expect(mockGetStatsChapterAccuracy).toHaveBeenCalledWith('sub-1')
  })

  it('returns study indicators when section=indicators with private no-store cache headers', async () => {
    mockGetAuthenticatedContext.mockResolvedValue({ user: { id: 'user-1' }, supabase: {} })
    mockGetStatsStudyIndicators.mockResolvedValue([{ subjectId: 'sub-1', readinessScore: 85 }])

    const request = new NextRequest('http://localhost:3000/api/stats?section=indicators&subjectId=sub-1')
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    const json = await response.json()
    expect(json).toEqual([{ subjectId: 'sub-1', readinessScore: 85 }])
    expect(mockGetStatsStudyIndicators).toHaveBeenCalledWith('sub-1')
  })

  it('returns composite data when section=all with private no-store cache headers', async () => {
    mockGetAuthenticatedContext.mockResolvedValue({ user: { id: 'user-1' }, supabase: {} })
    mockGetStatsSubjectData.mockResolvedValue({
      subjectId: 'sub-1',
      trend: [],
      chapterAccuracy: [],
      studyIndicators: [],
    })

    const request = new NextRequest('http://localhost:3000/api/stats?section=all&subjectId=sub-1')
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    const json = await response.json()
    expect(json.subjectId).toBe('sub-1')
    expect(mockGetStatsSubjectData).toHaveBeenCalledWith('sub-1')
  })

  it('returns 400 Bad Request for invalid section with private no-store cache headers', async () => {
    mockGetAuthenticatedContext.mockResolvedValue({ user: { id: 'user-1' }, supabase: {} })

    const request = new NextRequest('http://localhost:3000/api/stats?section=invalid')
    const response = await GET(request)

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    const json = await response.json()
    expect(json.error).toBe('Invalid section')
  })

  it('returns 500 with generic error message and private no-store cache headers without leaking internal exception text', async () => {
    mockGetAuthenticatedContext.mockResolvedValue({ user: { id: 'user-1' }, supabase: {} })
    mockGetStatsOverviewData.mockRejectedValue(new Error('FATAL: psql connection refused on port 5432 with secret_key_123'))

    const request = new NextRequest('http://localhost:3000/api/stats?section=overview')
    const response = await GET(request)

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    const json = await response.json()
    expect(json.error).toBe('Failed to load statistics. Please retry.')
    expect(json.error).not.toContain('psql')
    expect(json.error).not.toContain('secret_key_123')
  })
})
