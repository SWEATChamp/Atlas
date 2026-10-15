import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import {
  createPracticeSession, deletePracticeSession, getCombinedChapterEvidenceForSubject, getPracticeHistory,
  getPracticeSessionDetail, updatePracticeSession,
} from '@/lib/actions/practice-sessions'

const userId = '00000000-0000-4000-a000-000000000001'
const subjectId = '00000000-0000-4000-a000-000000000002'
const sessionId = '00000000-0000-4000-a000-000000000003'
const paperId = '00000000-0000-4000-a000-000000000004'
const chapterId = '00000000-0000-4000-a000-000000000005'
const mockRpc = vi.fn()
const mockFrom = vi.fn()
const mockAuth = vi.fn()

vi.mock('@/lib/supabase/authenticated', () => ({ getAuthenticatedContext: async () => ({ supabase: { from: mockFrom, rpc: mockRpc }, user: mockAuth() }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const valid = {
  subjectId, stage: 'as', sessionDate: '2026-10-13', title: 'Topic drill', durationMins: 30,
  provenance: { subjectPaperId: paperId, examYear: 2025 },
  items: [{ itemOrder: 1, marksObtained: 4, marksAvailable: 5, provenanceMode: 'inherit', chapterIds: [chapterId] }],
}

function query(result: { data?: unknown; error?: unknown; count?: number }) {
  const calls: [string, unknown[]][] = []
  const chain = {
    calls,
    select(...args: unknown[]) { calls.push(['select', args]); return chain },
    eq(...args: unknown[]) { calls.push(['eq', args]); return chain },
    in(...args: unknown[]) { calls.push(['in', args]); return chain },
    order(...args: unknown[]) { calls.push(['order', args]); return chain },
    range(...args: unknown[]) { calls.push(['range', args]); return Promise.resolve(result) },
    single() { return Promise.resolve(result) },
    maybeSingle() { return Promise.resolve(result) },
    then(resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve(result).then(resolve, reject) },
  }
  return chain
}

let queries: Record<string, ReturnType<typeof query>>
beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockReturnValue({ id: userId })
  queries = {
    profiles: query({ data: { timezone: 'Asia/Singapore' } }),
    practice_sessions: query({ data: { subject_id: subjectId } }),
  }
  mockFrom.mockImplementation((table: string) => queries[table] ?? query({ data: [] }))
  mockRpc.mockResolvedValue({ data: { id: sessionId }, error: null })
})

describe('practice actions', () => {
  it('creates through one atomic RPC and refreshes affected routes, never paper metrics actions', async () => {
    expect(await createPracticeSession(valid)).toEqual({ sessionId })
    expect(mockRpc).toHaveBeenCalledWith('log_practice_session_atomic', {
      p_user_id: userId, p_subject_id: subjectId, p_stage: 'as', p_title: 'Topic drill',
      p_session_date: '2026-10-13', p_duration_mins: 30, p_notes: null,
      p_session_provenance: { subject_paper_id: paperId, exam_year: 2025 },
      p_items: [{ item_order: 1, marks_obtained: 4, marks_available: 5, provenance_mode: 'inherit', question_label: null, notes: null, chapter_ids: [chapterId] }],
    })
    expect(queries.profiles.calls).toContainEqual(['eq', ['id', userId]])
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
    expect(revalidatePath).toHaveBeenCalledWith('/past-papers')
    expect(revalidatePath).toHaveBeenCalledWith(`/subjects/${subjectId}`)
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid, future, unauthenticated, and database-rejected writes without revalidation', async () => {
    expect((await createPracticeSession({ ...valid, unknown: true })).error).toBeDefined()
    expect(mockRpc).not.toHaveBeenCalled()
    expect((await createPracticeSession({ ...valid, sessionDate: '2100-01-01' })).error).toMatch(/local today/)
    mockAuth.mockReturnValue(null)
    expect(await createPracticeSession(valid)).toEqual({ error: 'Not authenticated.' })
    mockAuth.mockReturnValue({ id: userId })
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0008', message: 'internal route details' } })
    expect(await createPracticeSession(valid)).toEqual({ error: 'The selected paper is not on the current route.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('requires owner-scoped lookup for full-replacement update and delete', async () => {
    const update = { ...valid, sessionId }
    delete (update as { subjectId?: string }).subjectId
    delete (update as { stage?: string }).stage
    expect(await updatePracticeSession(update)).toEqual({ sessionId })
    expect(mockRpc).toHaveBeenCalledWith('update_practice_session_atomic', expect.objectContaining({ p_user_id: userId, p_session_id: sessionId, p_items: expect.any(Array) }))
    expect(queries.practice_sessions.calls).toContainEqual(['eq', ['user_id', userId]])
    mockRpc.mockResolvedValue({ data: true, error: null })
    expect(await deletePracticeSession({ sessionId })).toEqual({ deleted: true })
    expect(mockRpc).toHaveBeenCalledWith('delete_practice_session', { p_user_id: userId, p_session_id: sessionId })
  })

  it('does not reveal or mutate another owner’s session', async () => {
    queries.practice_sessions = query({ data: null })
    expect(await deletePracticeSession({ sessionId })).toEqual({ error: 'Practice session not found.' })
    expect(await getPracticeSessionDetail(sessionId)).toBeNull()
    expect(mockRpc).not.toHaveBeenCalled()
    expect(queries.practice_sessions.calls).toContainEqual(['eq', ['user_id', userId]])
  })

  it('reads owner-scoped history and decorates current-route eligibility', async () => {
    queries.practice_sessions = query({ data: [{
      id: sessionId, user_id: userId, subject_id: subjectId, stage: 'as', session_date: '2026-10-13',
      title: null, duration_mins: null, notes: null, total_score_raw: 4, total_score_max: 5, accuracy_pct: 80,
      subject_paper_id: paperId, paper_number: 1, exam_year: null, exam_series: null, exam_variant: null,
      source_label: null, created_at: '2026-10-13T12:00:00Z', updated_at: '2026-10-13T12:00:00Z',
      practice_session_items: [{ id: '00000000-0000-4000-a000-000000000006', session_id: sessionId, item_order: 1,
        question_label: null, marks_obtained: 4, marks_available: 5, provenance_mode: 'inherit', subject_paper_id: paperId,
        paper_number: 1, exam_year: null, exam_series: null, exam_variant: null, source_label: null, notes: null,
        created_at: '2026-10-13T12:00:00Z', practice_session_chapters: [{ chapter_id: chapterId }] }],
    }], count: 1 })
    queries.user_subjects = query({ data: { id: 'enrollment', subject_id: subjectId, study_route: 'staged', current_stage: 'as', is_archived: false } })
    queries.subjects = query({ data: { code: '9709' } })
    queries.chapters = query({ data: [{ id: chapterId, subject_id: subjectId, stage: 'as', component: 'Pure 1', is_active: true, chapter_papers: [{ subject_paper_id: paperId }] }] })
    queries.subject_papers = query({ data: [{ id: paperId, subject_id: subjectId, paper_number: 1 }] })
    queries.subject_paper_selections = query({ data: [{ subject_paper_id: paperId, component_name: 'Pure 1', stage: 'as' }] })
    const result = await getPracticeHistory({ subjectId, limit: 10 })
    expect(result).toMatchObject({ total: 1, offset: 0, limit: 10 })
    expect(result.sessions[0]).toMatchObject({ eligible_score_raw: 4, eligible_score_max: 5, route_status: 'current' })
    expect(queries.practice_sessions.calls).toContainEqual(['eq', ['user_id', userId]])
    expect(queries.practice_sessions.calls).toContainEqual(['eq', ['subject_id', subjectId]])
    expect(queries.user_subjects.calls).toContainEqual(['eq', ['user_id', userId]])
  })

  it('scopes full-paper question aggregation to IDs loaded for the owner', async () => {
    queries.practice_sessions = query({ data: [], count: 0 })
    queries.past_papers = query({ data: [{ id: paperId, subject_id: subjectId, stage: 'as', attempted_at: '2026-10-13',
      created_at: '2026-10-13T10:00:00Z', subject_paper_id: paperId, paper_number: 12, score_raw: 4, score_max: 5, accuracy_pct: 80 }] })
    queries.paper_question_attempts = query({ data: [{ id: 'question', marks_available: 5, marks_obtained: 4, chapter_id: chapterId, chapter_ids: [chapterId] }] })
    expect(await getCombinedChapterEvidenceForSubject(subjectId)).toMatchObject([{ chapterId, raw: 4, max: 5, practiceItems: 0, fullPaperAttempts: 1 }])
    expect(queries.past_papers.calls).toContainEqual(['eq', ['user_id', userId]])
    expect(queries.past_papers.calls).toContainEqual(['eq', ['subject_id', subjectId]])
    expect(queries.paper_question_attempts.calls).toContainEqual(['in', ['paper_id', [paperId]]])
  })
})
