import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCombinedChapterEvidenceForSubject, getPracticeFormCatalogue, getPracticeOverview } from '@/lib/actions/practice-sessions'

const state = vi.hoisted(() => ({ request: 0, context: vi.fn() }))
// A controlled React request-cache contract, not a production latency benchmark.
// Ordinary Vitest rendering does not install the Server Component dispatcher.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    let request = -1
    let entries: { args: A; value: R }[] = []
    return (...args: A): R => {
      if (request !== state.request) { request = state.request; entries = [] }
      const hit = entries.find(entry => entry.args.length === args.length && entry.args.every((arg, index) => Object.is(arg, args[index])))
      if (hit) return hit.value
      const value = fn(...args)
      entries.push({ args, value })
      return value
    }
  },
}))
vi.mock('@/lib/supabase/authenticated', () => ({ getAuthenticatedContext: state.context }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const owner = '00000000-0000-4000-a000-000000000001'
const subject = '00000000-0000-4000-a000-000000000002'
const otherSubject = '00000000-0000-4000-a000-000000000003'
const paper = '00000000-0000-4000-a000-000000000004'
const chapter = '00000000-0000-4000-a000-000000000005'
type Read = { table: string; select: string; filters: Record<string, unknown>; range?: [number, number] }
let reads: Read[]
let total: number
let fail: string | undefined

function session(index: number, userId: string, subjectId: string) {
  const id = `00000000-0000-4000-a000-${String(index + 100).padStart(12, '0')}`
  return {
    id, user_id: userId, subject_id: subjectId, stage: 'as', session_date: '2026-10-13', title: null,
    duration_mins: null, notes: null, total_score_raw: 4, total_score_max: 5, accuracy_pct: 80,
    subject_paper_id: null, paper_number: null, exam_year: null, exam_series: null, exam_variant: null,
    source_label: null, created_at: '2026-10-13T12:00:00Z', updated_at: '2026-10-13T12:00:00Z',
    practice_session_items: [],
  }
}

function client() {
  return { from(table: string) {
    const read: Read = { table, select: '', filters: {} }
    function result() {
      reads.push(read)
      if (table === fail) return { data: null, error: { message: 'test failure' } }
      const userId = read.filters.user_id as string
      const subjectId = read.filters.subject_id as string ?? subject
      if (table === 'user_subjects') return read.select.includes('subjects(')
        ? { data: [{ subject_id: subject, study_route: 'staged', is_archived: false, subjects: { id: subject, name: 'Maths', code: '9709' } }] }
        : { data: { id: 'enrollment', subject_id: subjectId, study_route: 'staged', current_stage: 'as', is_archived: false } }
      if (table === 'subjects') return { data: { code: '9709' } }
      if (table === 'chapters') return { data: [{ id: chapter, subject_id: subjectId, title: 'Algebra', number: 1, stage: 'as', component: 'Pure 1', is_active: true, chapter_papers: [{ subject_paper_id: paper }] }] }
      if (table === 'subject_papers') return { data: [{ id: paper, subject_id: subjectId, paper_number: 1, name: 'Pure 1' }] }
      if (table === 'subject_paper_selections') return { data: [{ subject_paper_id: paper, component_name: 'Pure 1', stage: 'as' }] }
      const [start, end] = read.range ?? [0, 99]
      if (table === 'practice_sessions') return { data: Array.from({ length: total }, (_, index) => session(index, userId, subjectId)).slice(start, end + 1), count: total }
      if (table === 'past_papers') return { data: Array.from({ length: total }, (_, index) => ({
        id: `paper-${index}`, subject_id: subjectId, stage: 'as', attempted_at: '2026-10-13', created_at: '2026-10-13T10:00:00Z',
        subject_paper_id: paper, paper_number: 12, score_raw: 4, score_max: 5, accuracy_pct: 80,
      })).slice(start, end + 1) }
      return { data: [] }
    }
    const chain = {
      select(value: string) { read.select = value; return chain },
      eq(key: string, value: unknown) { read.filters[key] = value; return chain },
      in(key: string, value: unknown) { read.filters[key] = value; return chain },
      order() { return chain },
      range(start: number, end: number) { read.range = [start, end]; return Promise.resolve(result()) },
      maybeSingle() { return Promise.resolve(result()) },
      then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve) },
    }
    return chain
  } }
}

beforeEach(() => {
  state.request++
  reads = []; total = 1; fail = undefined
  state.context.mockResolvedValue({ supabase: client(), user: { id: owner } })
})

describe('practice Server Component request loading contract', () => {
  it('shares complete evidence and route reads across overview, chapters and form catalogue', async () => {
    await Promise.all([getPracticeOverview(subject), getCombinedChapterEvidenceForSubject(subject), getPracticeFormCatalogue()])
    expect(reads.filter(read => read.table === 'past_papers')).toHaveLength(1)
    expect(reads.filter(read => read.table === 'practice_sessions')).toHaveLength(1)
    expect(reads.filter(read => read.table === 'chapters')).toHaveLength(1)
    expect(reads.filter(read => read.table === 'subject_paper_selections')).toHaveLength(1)
    expect(reads).toHaveLength(9)
    for (const read of reads.filter(read => ['past_papers', 'practice_sessions'].includes(read.table))) {
      expect(read.filters).toMatchObject({ user_id: owner, subject_id: subject })
    }
    expect(reads.find(read => read.table === 'paper_question_attempts')?.filters.paper_id).toEqual(['paper-0'])
  })

  it('does not share another subject, owner, client or request', async () => {
    const supabase = client()
    state.context.mockResolvedValue({ supabase, user: { id: owner } })
    await getPracticeOverview(subject)
    await getPracticeOverview(otherSubject)
    const anotherOwner = '00000000-0000-4000-a000-000000000006'
    state.context.mockResolvedValue({ supabase, user: { id: anotherOwner } })
    await getPracticeOverview(subject)
    state.context.mockResolvedValue({ supabase: client(), user: { id: owner } })
    await getPracticeOverview(subject)
    state.request++
    await getPracticeOverview(subject)
    expect(reads.filter(read => read.table === 'past_papers')).toHaveLength(5)
    expect(reads.filter(read => read.table === 'practice_sessions')).toHaveLength(5)
    expect(reads.some(read => read.filters.user_id === anotherOwner)).toBe(true)
  })

  it('retains complete >100-row pagination while reusing route context across history pages', async () => {
    total = 101
    const [overview] = await Promise.all([getPracticeOverview(subject), getCombinedChapterEvidenceForSubject(subject)])
    expect(overview.sessions).toHaveLength(101)
    expect(overview.trend).toHaveLength(202)
    for (const table of ['past_papers', 'practice_sessions']) {
      expect(reads.filter(read => read.table === table).map(read => read.range)).toEqual([[0, 99], [100, 199]])
    }
    expect(reads.filter(read => read.table === 'chapters')).toHaveLength(1)
    const questions = reads.filter(read => read.table === 'paper_question_attempts')
    expect(questions.map(read => (read.filters.paper_id as string[]).length)).toEqual([100, 1])
  })

  it('does no reads without auth or for invalid subjects, and preserves read failures', async () => {
    state.context.mockResolvedValue({ supabase: client(), user: null })
    expect(await getPracticeOverview(subject)).toEqual({ sessions: [], trend: [] })
    expect(await getCombinedChapterEvidenceForSubject(subject)).toEqual([])
    expect(await getPracticeFormCatalogue()).toEqual([])
    expect(reads).toEqual([])
    state.context.mockResolvedValue({ supabase: client(), user: { id: owner } })
    expect(await getPracticeOverview('invalid')).toEqual({ sessions: [], trend: [] })
    expect(await getCombinedChapterEvidenceForSubject('invalid')).toEqual([])
    expect(reads).toEqual([])
    fail = 'practice_sessions'
    await expect(getPracticeOverview(subject)).rejects.toThrow('Could not load practice history.')
  })
})
