import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  getSubjectsWithProgress,
  getSubjectDetail,
  getAvailableMvpSubjects,
} from '@/lib/actions/subjects'
import type { Subject, UserSubject, Chapter, UserChapter, SubjectPaperSelection } from '@/types'

// Mock getAuthenticatedContext and getCurrentProfile
const mockFrom = vi.fn()
const mockRpc = vi.fn()
const mockAuthUser = { id: 'user-123' }

vi.mock('@/lib/supabase/authenticated', () => ({
  getAuthenticatedContext: async () => ({
    supabase: { from: mockFrom, rpc: mockRpc },
    user: mockAuthUser,
  }),
  getCurrentProfile: async () => ({
    id: 'user-123',
    timezone: 'UTC',
    onboarding_completed: true,
  }),
}))

interface QueryChain {
  select: (...args: unknown[]) => QueryChain
  eq: (...args: unknown[]) => QueryChain
  in: (...args: unknown[]) => QueryChain
  not: (...args: unknown[]) => QueryChain
  order: (...args: unknown[]) => QueryChain
  single: () => Promise<{ data?: unknown; error?: unknown; count?: number }>
  maybeSingle: () => Promise<{ data?: unknown; error?: unknown; count?: number }>
  then: <TResult1 = { data?: unknown; error?: unknown; count?: number }, TResult2 = never>(
    resolve: (value: { data?: unknown; error?: unknown; count?: number }) => TResult1 | PromiseLike<TResult1>,
    reject?: (reason: unknown) => TResult2 | PromiseLike<TResult2>
  ) => Promise<TResult1 | TResult2>
}

function createQueryChain(result: { data?: unknown; error?: unknown; count?: number }): QueryChain {
  const chain: QueryChain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    not: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

type EnrollmentFixture = UserSubject & { subjects: Subject }

function mockEnrollment(partial: Partial<EnrollmentFixture>): EnrollmentFixture {
  return {
    id: 'us-123',
    user_id: 'user-123',
    subject_id: 'subj-maths-9709',
    target_grade: 'A',
    exam_date: '2026-06-01',
    study_route: 'staged',
    current_stage: 'as',
    is_archived: false,
    priority: 1,
    a2_unlocked_at: null,
    a2_unlock_method: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    subjects: {
      id: 'subj-maths-9709',
      code: '9709',
      name: 'Mathematics',
      icon: 'Calculator',
      color_hex: '#1E40AF',
      is_available: true,
      is_global: true,
      created_at: '2026-01-01',
      created_by: null,
    },
    ...partial,
  }
}

describe('Fix 1: Chapter Summary Route- and Stage-Accuracy', () => {
  const subjectId = 'subj-maths-9709'
  const userSubjectId = 'us-123'

  const mockSubject: Subject = {
    id: subjectId,
    code: '9709',
    name: 'Mathematics',
    icon: 'Calculator',
    color_hex: '#1E40AF',
    is_available: true,
    is_global: true,
    created_at: '2026-01-01',
    created_by: null,
  }

  // 4 Chapters: 1 AS, 1 Shared, 1 A2, 1 Route-dependent (Mechanics)
  const chapters: Chapter[] = [
    {
      id: 'ch-1',
      subject_id: subjectId,
      title: 'Algebra 1',
      number: 1,
      component: 'Pure Mathematics 1',
      description: null,
      is_global: true,
      is_active: true,
      stage: 'as',
      created_at: '2026-01-01',
    },
    {
      id: 'ch-2',
      subject_id: subjectId,
      title: 'Shared Foundations',
      number: 2,
      component: 'Core',
      description: null,
      is_global: true,
      is_active: true,
      stage: 'shared',
      created_at: '2026-01-01',
    },
    {
      id: 'ch-3',
      subject_id: subjectId,
      title: 'Complex Numbers',
      number: 3,
      component: 'Pure Mathematics 3',
      description: null,
      is_global: true,
      is_active: true,
      stage: 'a2',
      created_at: '2026-01-01',
    },
    {
      id: 'ch-4',
      subject_id: subjectId,
      title: 'Forces & Equilibrium',
      number: 4,
      component: 'Mechanics',
      description: null,
      is_global: true,
      is_active: true,
      stage: 'route_dependent',
      created_at: '2026-01-01',
    },
  ]

  const paperMechanicsId = 'sp-paper-4'

  const chapterPapers = [
    { chapter_id: 'ch-4', subject_paper_id: paperMechanicsId },
  ]

  function mockUserChapter(partial: Partial<UserChapter>): UserChapter {
    return {
      id: 'uc-1',
      user_id: 'user-123',
      chapter_id: 'ch-1',
      notes_status: 'none',
      confidence_level: null,
      google_doc_url: null,
      google_doc_id: null,
      last_reviewed_at: null,
      first_completed_at: null,
      revision_count: 0,
      personal_notes: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...partial,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: 75.0, error: null })
  })

  it('excludes locked A2 and unselected route-dependent historical progress for a staged AS learner', async () => {
    // Staged AS learner without Mechanics paper selection
    const enrollment = mockEnrollment({
      study_route: 'staged',
      current_stage: 'as',
    })

    // Historical progress:
    // ch-1 (AS, accessible): in_progress, confidence 3
    // ch-2 (Shared, accessible): complete, confidence 5
    // ch-3 (A2, locked): complete, confidence 5 (historical!)
    // ch-4 (Mechanics, unselected/locked): complete, confidence 4 (historical!)
    const userChapters: UserChapter[] = [
      mockUserChapter({ id: 'uc-1', chapter_id: 'ch-1', notes_status: 'in_progress', confidence_level: 3 }),
      mockUserChapter({ id: 'uc-2', chapter_id: 'ch-2', notes_status: 'complete', confidence_level: 5 }),
      mockUserChapter({ id: 'uc-3', chapter_id: 'ch-3', notes_status: 'complete', confidence_level: 5 }),
      mockUserChapter({ id: 'uc-4', chapter_id: 'ch-4', notes_status: 'complete', confidence_level: 4 }),
    ]

    // Setup DB mocks for getSubjectDetail
    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'subjects':
          return createQueryChain({ data: mockSubject, error: null })
        case 'user_subjects':
          return createQueryChain({ data: enrollment, error: null })
        case 'chapters':
          return createQueryChain({ data: chapters, error: null })
        case 'subject_paper_selections':
          return createQueryChain({ data: [], error: null }) // no elective selected
        case 'subject_stage_results':
          return createQueryChain({ data: [], error: null })
        case 'user_chapters':
          return createQueryChain({ data: userChapters, error: null })
        case 'past_papers':
          return createQueryChain({ data: [], error: null })
        case 'chapter_papers':
          return createQueryChain({ data: chapterPapers, error: null })
        case 'paper_question_attempts':
          return createQueryChain({ data: [], error: null })
        default:
          return createQueryChain({ data: [], error: null })
      }
    })

    const detail = await getSubjectDetail(subjectId)
    expect(detail).not.toBeNull()

    // Accessible chapters: ch-1 (AS) and ch-2 (Shared) = exactly 2 chapters!
    // ch-3 (A2) and ch-4 (route-dependent without selection) are locked.
    expect(detail!.totalChapters).toBe(2)
    // Completed chapters among accessible: only ch-2 is complete. ch-3 and ch-4 do NOT inflate headline count!
    expect(detail!.completedChapters).toBe(1)
    // In progress among accessible: ch-1 is in progress.
    expect(detail!.inProgressChapters).toBe(1)
    // Average confidence among accessible: (3 + 5) / 2 = 4.0. Inaccessible confidence (5, 4) excluded!
    expect(detail!.avgConfidence).toBe(4.0)

    // Verification: Locked chapters remain present in detailed groups, with isAccessible = false
    const allDetailChapters = detail!.groups.flatMap((g) => g.chapters)
    const ch3Detail = allDetailChapters.find((c) => c.chapter.id === 'ch-3')
    expect(ch3Detail).toBeDefined()
    expect(ch3Detail!.isAccessible).toBe(false)
    expect(ch3Detail!.userChapter?.notes_status).toBe('complete') // Historical data preserved in DB/group row

    const ch4Detail = allDetailChapters.find((c) => c.chapter.id === 'ch-4')
    expect(ch4Detail).toBeDefined()
    expect(ch4Detail!.isAccessible).toBe(false)
  })

  it('respects route-dependent paper selections (selected vs unselected)', async () => {
    const enrollment = mockEnrollment({
      study_route: 'staged',
      current_stage: 'as',
    })

    // Mechanics IS selected via normalized paper identity
    const paperSelections: SubjectPaperSelection[] = [
      {
        id: 'sps-1',
        user_subject_id: userSubjectId,
        subject_paper_id: paperMechanicsId,
        component_name: 'Mechanics',
        paper_number: 4,
        stage: 'as',
        created_at: '2026-01-01',
      },
    ]

    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'subjects':
          return createQueryChain({ data: mockSubject, error: null })
        case 'user_subjects':
          return createQueryChain({ data: enrollment, error: null })
        case 'chapters':
          return createQueryChain({ data: chapters, error: null })
        case 'subject_paper_selections':
          return createQueryChain({ data: paperSelections, error: null })
        case 'subject_stage_results':
          return createQueryChain({ data: [], error: null })
        case 'user_chapters':
          return createQueryChain({ data: [], error: null })
        case 'past_papers':
          return createQueryChain({ data: [], error: null })
        case 'chapter_papers':
          return createQueryChain({ data: chapterPapers, error: null })
        default:
          return createQueryChain({ data: [], error: null })
      }
    })

    const detail = await getSubjectDetail(subjectId)
    expect(detail).not.toBeNull()
    // Accessible: ch-1 (AS), ch-2 (Shared), ch-4 (Mechanics, selected as AS) = 3 chapters!
    // ch-3 (A2) remains locked.
    expect(detail!.totalChapters).toBe(3)
  })

  it('unlocks A2 chapters under staged A2 and full-level routes', async () => {
    const a2Enrollment = mockEnrollment({
      study_route: 'staged',
      current_stage: 'a2',
      a2_unlocked_at: '2026-01-01',
      a2_unlock_method: 'manual',
    })

    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'subjects':
          return createQueryChain({ data: mockSubject, error: null })
        case 'user_subjects':
          return createQueryChain({ data: a2Enrollment, error: null })
        case 'chapters':
          return createQueryChain({ data: chapters, error: null })
        case 'subject_paper_selections':
          return createQueryChain({ data: [], error: null })
        case 'subject_stage_results':
          return createQueryChain({ data: [], error: null })
        case 'user_chapters':
          return createQueryChain({ data: [], error: null })
        case 'past_papers':
          return createQueryChain({ data: [], error: null })
        case 'chapter_papers':
          return createQueryChain({ data: chapterPapers, error: null })
        default:
          return createQueryChain({ data: [], error: null })
      }
    })

    const detail = await getSubjectDetail(subjectId)
    expect(detail).not.toBeNull()
    // Under staged A2: ch-1 (AS), ch-2 (Shared), ch-3 (A2) are all accessible! (ch-4 locked due to no elective selection)
    expect(detail!.totalChapters).toBe(3)
  })

  it('accurately summarizes an enrollment on an actual full_level route', async () => {
    const fullLevelEnrollment = mockEnrollment({
      study_route: 'full_level',
      current_stage: 'full',
    })

    // 1. Without elective paper selection: AS (ch-1), Shared (ch-2), and A2 (ch-3) accessible; ch-4 locked
    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'subjects':
          return createQueryChain({ data: mockSubject, error: null })
        case 'user_subjects':
          return createQueryChain({ data: fullLevelEnrollment, error: null })
        case 'chapters':
          return createQueryChain({ data: chapters, error: null })
        case 'subject_paper_selections':
          return createQueryChain({ data: [], error: null })
        case 'subject_stage_results':
          return createQueryChain({ data: [], error: null })
        case 'user_chapters':
          return createQueryChain({ data: [], error: null })
        case 'past_papers':
          return createQueryChain({ data: [], error: null })
        case 'chapter_papers':
          return createQueryChain({ data: chapterPapers, error: null })
        default:
          return createQueryChain({ data: [], error: null })
      }
    })

    const detailWithoutElective = await getSubjectDetail(subjectId)
    expect(detailWithoutElective).not.toBeNull()
    expect(detailWithoutElective!.totalChapters).toBe(3)

    // 2. With elective paper selection (Mechanics): all 4 chapters accessible under full_level
    const paperSelections: SubjectPaperSelection[] = [
      {
        id: 'sps-full-1',
        user_subject_id: userSubjectId,
        subject_paper_id: paperMechanicsId,
        component_name: 'Mechanics',
        paper_number: 4,
        stage: 'a2',
        created_at: '2026-01-01',
      },
    ]

    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'subjects':
          return createQueryChain({ data: mockSubject, error: null })
        case 'user_subjects':
          return createQueryChain({ data: fullLevelEnrollment, error: null })
        case 'chapters':
          return createQueryChain({ data: chapters, error: null })
        case 'subject_paper_selections':
          return createQueryChain({ data: paperSelections, error: null })
        case 'subject_stage_results':
          return createQueryChain({ data: [], error: null })
        case 'user_chapters':
          return createQueryChain({ data: [], error: null })
        case 'past_papers':
          return createQueryChain({ data: [], error: null })
        case 'chapter_papers':
          return createQueryChain({ data: chapterPapers, error: null })
        default:
          return createQueryChain({ data: [], error: null })
      }
    })

    const detailWithElective = await getSubjectDetail(subjectId)
    expect(detailWithElective).not.toBeNull()
    expect(detailWithElective!.totalChapters).toBe(4)
  })

  it('aggregates route-dependent paper selections accurately in list loader (getSubjectsWithProgress)', async () => {
    // Two staged AS enrollments for different users/subjects
    const enrollmentWithMechanics = mockEnrollment({
      id: 'us-with-mech',
      subject_id: subjectId,
      study_route: 'staged',
      current_stage: 'as',
    })

    const paperSelections: SubjectPaperSelection[] = [
      {
        id: 'sps-mech',
        user_subject_id: 'us-with-mech',
        subject_paper_id: paperMechanicsId,
        component_name: 'Mechanics',
        paper_number: 4,
        stage: 'as',
        created_at: '2026-01-01',
      },
    ]

    // 1. With Mechanics selected in getSubjectsWithProgress
    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'user_subjects':
          return createQueryChain({ data: [enrollmentWithMechanics], error: null })
        case 'chapters':
          return createQueryChain({ data: chapters, error: null })
        case 'subject_paper_selections':
          return createQueryChain({ data: paperSelections, error: null })
        case 'past_papers':
          return createQueryChain({ data: [], error: null })
        case 'chapter_papers':
          return createQueryChain({ data: chapterPapers, error: null })
        case 'paper_question_attempts':
          return createQueryChain({ data: [], error: null })
        case 'user_chapters':
          return createQueryChain({ data: [], error: null })
        default:
          return createQueryChain({ data: [], error: null })
      }
    })

    const listWithMech = await getSubjectsWithProgress()
    expect(listWithMech).toHaveLength(1)
    // ch-1 (AS), ch-2 (Shared), ch-4 (Mechanics selected as AS) = 3 accessible
    expect(listWithMech[0].totalChapters).toBe(3)

    // 2. Without Mechanics selected in getSubjectsWithProgress
    const enrollmentWithoutMechanics = mockEnrollment({
      id: 'us-no-mech',
      subject_id: subjectId,
      study_route: 'staged',
      current_stage: 'as',
    })

    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'user_subjects':
          return createQueryChain({ data: [enrollmentWithoutMechanics], error: null })
        case 'chapters':
          return createQueryChain({ data: chapters, error: null })
        case 'subject_paper_selections':
          return createQueryChain({ data: [], error: null }) // no selection
        case 'past_papers':
          return createQueryChain({ data: [], error: null })
        case 'chapter_papers':
          return createQueryChain({ data: chapterPapers, error: null })
        case 'paper_question_attempts':
          return createQueryChain({ data: [], error: null })
        case 'user_chapters':
          return createQueryChain({ data: [], error: null })
        default:
          return createQueryChain({ data: [], error: null })
      }
    })

    const listWithoutMech = await getSubjectsWithProgress()
    expect(listWithoutMech).toHaveLength(1)
    // Only ch-1 (AS) and ch-2 (Shared) = 2 accessible
    expect(listWithoutMech[0].totalChapters).toBe(2)
  })

  it('returns 0 accessible chapters for an unconfirmed route', async () => {
    const unconfirmedEnrollment = mockEnrollment({
      study_route: 'unconfirmed',
      current_stage: null,
    })

    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'subjects':
          return createQueryChain({ data: mockSubject, error: null })
        case 'user_subjects':
          return createQueryChain({ data: unconfirmedEnrollment, error: null })
        case 'chapters':
          return createQueryChain({ data: chapters, error: null })
        case 'subject_paper_selections':
          return createQueryChain({ data: [], error: null })
        case 'subject_stage_results':
          return createQueryChain({ data: [], error: null })
        case 'user_chapters':
          return createQueryChain({ data: [], error: null })
        case 'past_papers':
          return createQueryChain({ data: [], error: null })
        case 'chapter_papers':
          return createQueryChain({ data: chapterPapers, error: null })
        default:
          return createQueryChain({ data: [], error: null })
      }
    })

    const detail = await getSubjectDetail(subjectId)
    expect(detail).not.toBeNull()
    expect(detail!.totalChapters).toBe(0)
    expect(detail!.completedChapters).toBe(0)
    expect(detail!.inProgressChapters).toBe(0)
    expect(detail!.avgConfidence).toBeNull()
  })

  it('guarantees identical aggregation between getSubjectsWithProgress and getSubjectDetail', async () => {
    const enrollment = mockEnrollment({
      study_route: 'staged',
      current_stage: 'as',
    })

    const userChapters: UserChapter[] = [
      mockUserChapter({ id: 'uc-1', chapter_id: 'ch-1', notes_status: 'complete', confidence_level: 4 }),
      mockUserChapter({ id: 'uc-2', chapter_id: 'ch-2', notes_status: 'in_progress', confidence_level: 3 }),
      mockUserChapter({ id: 'uc-3', chapter_id: 'ch-3', notes_status: 'complete', confidence_level: 5 }),
    ]

    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'subjects':
          return createQueryChain({ data: mockSubject, error: null })
        case 'user_subjects':
          return createQueryChain({ data: [enrollment], error: null })
        case 'chapters':
          return createQueryChain({ data: chapters, error: null })
        case 'subject_paper_selections':
          return createQueryChain({ data: [], error: null })
        case 'subject_stage_results':
          return createQueryChain({ data: [], error: null })
        case 'user_chapters':
          return createQueryChain({ data: userChapters, error: null })
        case 'past_papers':
          return createQueryChain({ data: [], error: null })
        case 'chapter_papers':
          return createQueryChain({ data: chapterPapers, error: null })
        case 'paper_question_attempts':
          return createQueryChain({ data: [], error: null })
        default:
          return createQueryChain({ data: [], error: null })
      }
    })

    const listProgress = await getSubjectsWithProgress()
    expect(listProgress).toHaveLength(1)
    const listSummary = listProgress[0]

    // Override single() response for getSubjectDetail
    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'subjects':
          return createQueryChain({ data: mockSubject, error: null })
        case 'user_subjects':
          return createQueryChain({ data: enrollment, error: null })
        case 'chapters':
          return createQueryChain({ data: chapters, error: null })
        case 'subject_paper_selections':
          return createQueryChain({ data: [], error: null })
        case 'subject_stage_results':
          return createQueryChain({ data: [], error: null })
        case 'user_chapters':
          return createQueryChain({ data: userChapters, error: null })
        case 'past_papers':
          return createQueryChain({ data: [], error: null })
        case 'chapter_papers':
          return createQueryChain({ data: chapterPapers, error: null })
        case 'paper_question_attempts':
          return createQueryChain({ data: [], error: null })
        default:
          return createQueryChain({ data: [], error: null })
      }
    })

    const detailSummary = await getSubjectDetail(subjectId)
    expect(detailSummary).not.toBeNull()

    // Both must agree exactly on accessible totals, completion, in progress, and confidence
    expect(listSummary.totalChapters).toBe(detailSummary!.totalChapters)
    expect(listSummary.completedChapters).toBe(detailSummary!.completedChapters)
    expect(listSummary.inProgressChapters).toBe(detailSummary!.inProgressChapters)
    expect(listSummary.avgConfidence).toBe(detailSummary!.avgConfidence)

    // Values: exactly 2 accessible (ch-1, ch-2). ch-1 complete (1), ch-2 in_progress (1), avgConf (4+3)/2 = 3.5
    expect(listSummary.totalChapters).toBe(2)
    expect(listSummary.completedChapters).toBe(1)
    expect(listSummary.inProgressChapters).toBe(1)
    expect(listSummary.avgConfidence).toBe(3.5)
  })
})

describe('Fix 2: Distinguish Database Failures From Legitimate Empty or Missing Data', () => {
  const subjectId = 'subj-chem-9701'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enrollment-query failure throws Error and does not render empty-enrollment state', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_subjects') {
        return createQueryChain({ data: null, error: { message: 'Connection timeout', code: '500' } })
      }
      return createQueryChain({ data: [], error: null })
    })

    await expect(getSubjectsWithProgress()).rejects.toThrow('Failed to load enrolled subjects')
  })

  it('chapter-query failure throws Error and does not report zero chapters', async () => {
    const enrollment = {
      id: 'us-1',
      user_id: 'user-123',
      subject_id: subjectId,
      is_archived: false,
      priority: 1,
      subjects: { id: subjectId, name: 'Chemistry', code: '9701' },
    }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_subjects') {
        return createQueryChain({ data: [enrollment], error: null })
      }
      if (table === 'chapters') {
        return createQueryChain({ data: null, error: { message: 'Deadlock detected', code: '40P01' } })
      }
      return createQueryChain({ data: [], error: null })
    })

    await expect(getSubjectsWithProgress()).rejects.toThrow('Failed to load chapters')
  })

  it('distinguishes genuine missing subject (PGRST116 -> null) from database failure (throws Error)', async () => {
    // 1. Genuine missing subject: PGRST116
    mockFrom.mockImplementation((table: string) => {
      if (table === 'subjects') {
        return createQueryChain({ data: null, error: { code: 'PGRST116', message: 'The result contains 0 rows' } })
      }
      return createQueryChain({ data: null, error: null })
    })

    const resultMissing = await getSubjectDetail('non-existent-subject')
    expect(resultMissing).toBeNull() // triggers notFound() / 404

    // 2. Database outage: 500 error code
    mockFrom.mockImplementation((table: string) => {
      if (table === 'subjects') {
        return createQueryChain({ data: null, error: { code: 'XX000', message: 'Internal server error' } })
      }
      return createQueryChain({ data: null, error: null })
    })

    await expect(getSubjectDetail('existing-subject')).rejects.toThrow('Failed to load subject')
  })

  it('surfaces dependent query and RPC failures in getSubjectDetail', async () => {
    const enrollment = {
      id: 'us-1',
      user_id: 'user-123',
      subject_id: subjectId,
      study_route: 'as_only',
      current_stage: 'as',
      is_archived: false,
    }

    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'subjects':
          return createQueryChain({ data: { id: subjectId, name: 'Chemistry' }, error: null })
        case 'user_subjects':
          return createQueryChain({ data: enrollment, error: null })
        case 'chapters':
          return createQueryChain({ data: [{ id: 'ch-1', subject_id: subjectId, stage: 'as', is_active: true }], error: null })
        case 'subject_paper_selections':
          return createQueryChain({ data: null, error: { code: '500', message: 'Query error' } }) // Fails!
        default:
          return createQueryChain({ data: [], error: null })
      }
    })

    await expect(getSubjectDetail(subjectId)).rejects.toThrow('Failed to load paper selections')
  })

  it('surfaces readiness RPC failure in getSubjectDetail', async () => {
    const enrollment = {
      id: 'us-1',
      user_id: 'user-123',
      subject_id: subjectId,
      study_route: 'as_only',
      current_stage: 'as',
      is_archived: false,
    }

    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'subjects':
          return createQueryChain({ data: { id: subjectId, name: 'Chemistry' }, error: null })
        case 'user_subjects':
          return createQueryChain({ data: enrollment, error: null })
        case 'chapters':
          return createQueryChain({ data: [{ id: 'ch-1', subject_id: subjectId, stage: 'as', is_active: true }], error: null })
        default:
          return createQueryChain({ data: [], error: null })
      }
    })

    // Mock RPC returning database error
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Readiness function crashed', code: 'P0001' } })

    await expect(getSubjectDetail(subjectId)).rejects.toThrow('Failed to compute readiness score')
  })

  it('surfaces readiness dashboard RPC failure in getSubjectsWithProgress', async () => {
    const enrollment = {
      id: 'us-1',
      user_id: 'user-123',
      subject_id: subjectId,
      study_route: 'as_only',
      current_stage: 'as',
      is_archived: false,
      priority: 1,
      subjects: { id: subjectId, name: 'Chemistry', code: '9701' },
    }

    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'user_subjects':
          return createQueryChain({ data: [enrollment], error: null })
        case 'chapters':
          return createQueryChain({ data: [], error: null })
        case 'past_papers':
          return createQueryChain({ data: [], error: null })
        case 'subject_paper_selections':
          return createQueryChain({ data: [], error: null })
        default:
          return createQueryChain({ data: [], error: null })
      }
    })

    // Mock dashboard RPC failure
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Dashboard summary failed', code: 'P0001' } })

    await expect(getSubjectsWithProgress()).rejects.toThrow('Failed to load readiness scores')
  })

  it('surfaces database failure in getAvailableMvpSubjects', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'subjects') {
        return createQueryChain({ data: null, error: { message: 'Database query timeout', code: '57014' } })
      }
      return createQueryChain({ data: [], error: null })
    })

    await expect(getAvailableMvpSubjects()).rejects.toThrow('Failed to load available subjects')
  })

  it('handles legitimate empty cases correctly without throwing', async () => {
    // Legitimate user with 0 enrollments
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_subjects') {
        return createQueryChain({ data: [], error: null })
      }
      return createQueryChain({ data: [], error: null })
    })

    const result = await getSubjectsWithProgress()
    expect(result).toEqual([]) // Genuine empty state

    // Legitimate available subjects
    mockFrom.mockImplementation((table: string) => {
      if (table === 'subjects') {
        return createQueryChain({ data: [{ id: 's-1', name: 'Maths' }], error: null })
      }
      return createQueryChain({ data: [], error: null })
    })

    const available = await getAvailableMvpSubjects()
    expect(available).toHaveLength(1)
  })
})
