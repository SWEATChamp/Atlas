import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getTargetGradePlan } from '@/lib/actions/target-planner'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/authenticated', () => ({
  getAuthenticatedContext: vi.fn(async () => {
    const authRes = await mockGetUser()
    return {
      supabase: {
        from: mockFrom,
      },
      user: authRes?.data?.user ?? null,
    }
  }),
}))

interface MockQueryBuilder {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  in?: ReturnType<typeof vi.fn>
  maybeSingle?: ReturnType<typeof vi.fn>
  single?: ReturnType<typeof vi.fn>
  range?: ReturnType<typeof vi.fn>
  then?: (resolve: (val: unknown) => void) => void
}

describe('Target-Grade Marks Planner Server Action (getTargetGradePlan)', () => {
  const currentUserId = 'user-current-1111'
  const subjectId = 'subject-9709-uuid'

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({
      data: { user: { id: currentUserId } },
    })
  })

  // ─── 1. Authenticated owner scoping & cross-user exclusion ─────────────────
  it('strictly scopes user_subjects and past_papers queries to the authenticated user ID', async () => {
    const queriedTables: Record<string, { eqFilters: Array<[string, unknown]> }> = {}

    mockFrom.mockImplementation((table: string) => {
      const eqFilters: Array<[string, unknown]> = []
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((col: string, val: unknown) => {
          eqFilters.push([col, val])
          return builder
        }),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Mathematics', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'unconfirmed',
                target_grade: 'A',
                exam_date: '2026-11-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }
      queriedTables[table] = { eqFilters }
      return builder
    })

    const result = await getTargetGradePlan(subjectId)
    expect(result.status).toBe('unconfirmed-route')

    // Verify user_subjects query had .eq('user_id', currentUserId)
    const userSubjectFilters = queriedTables['user_subjects']?.eqFilters
    expect(userSubjectFilters).toContainEqual(['user_id', currentUserId])
    expect(userSubjectFilters).toContainEqual(['subject_id', subjectId])
  })

  // ─── 2. Unauthenticated caller handling ───────────────────────────────────
  it('returns query-failure when no authenticated user is present', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const result = await getTargetGradePlan(subjectId)
    expect(result.status).toBe('query-failure')
    if (result.status === 'query-failure') {
      expect(result.message).toContain('User authentication required')
    }
  })

  // ─── 3. Unconfirmed route state ───────────────────────────────────────────
  it('returns unconfirmed-route state when enrollment study_route is unconfirmed', async () => {
    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Mathematics', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'unconfirmed',
                target_grade: 'A',
                exam_date: '2026-11-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }
      return builder
    })

    const result = await getTargetGradePlan(subjectId)
    expect(result.status).toBe('unconfirmed-route')
    if (result.status === 'unconfirmed-route') {
      expect(result.message).toContain('Select a study route')
    }
  })

  // ─── 4. Missing target grade state ────────────────────────────────────────
  it('returns no-target-grade state when target_grade is null', async () => {
    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Mathematics', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'as_only',
                target_grade: null, // No target grade
                exam_date: '2026-11-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }
      return builder
    })

    const result = await getTargetGradePlan(subjectId)
    expect(result.status).toBe('no-target-grade')
  })

  // ─── 5. Missing exam session state ────────────────────────────────────────
  it('returns no-exam-session state when exam_date is null', async () => {
    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Mathematics', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'as_only',
                target_grade: 'A',
                exam_date: null, // No exam date
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }
      return builder
    })

    const result = await getTargetGradePlan(subjectId)
    expect(result.status).toBe('no-exam-session')
  })

  // ─── 6. Database query error vs empty data behavior ───────────────────────
  it('returns query-failure with exact database error message without masking as empty data', async () => {
    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: null,
              error: { message: 'Database connection failed: 503' },
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }
      return builder
    })

    const result = await getTargetGradePlan(subjectId)
    expect(result.status).toBe('query-failure')
    if (result.status === 'query-failure') {
      expect(result.error).toBe('Database connection failed: 503')
    }
  })

  // ─── 7. Full complete plan with fallback disclosure & pagination ──────────
  it('assembles a complete available plan with earlier series fallback and complete pagination', async () => {
    const routeId = 'route-p1-p2-uuid'
    const paper1Id = 'sp-p1-uuid'
    const paper2Id = 'sp-p2-uuid'
    const pubId = 'pub-june-2026-uuid'
    const combId = 'comb-p1-p2-uuid'

    let pastPaperPageCalls = 0

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockImplementation(() => {
          if (table === 'published_grade_threshold_combinations') {
            return Promise.resolve({
              data: {
                id: combId,
                publication_id: pubId,
                canonical_key: '12, 22',
                qualification_level: 'as',
                route_type: 'as_only',
                maximum_mark: 125,
                weighting_basis: 'raw_total',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Mathematics', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'as_only',
                target_grade: 'A',
                exam_date: '2026-11-01', // Intended: November 2026
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        range: vi.fn().mockImplementation((from: number) => {
          if (table === 'past_papers') {
            pastPaperPageCalls++
            if (from === 0) {
              // First page: return 1 attempt
              return Promise.resolve({
                data: [
                  {
                    id: 'attempt-1',
                    subject_id: subjectId,
                    subject_paper_id: paper1Id,
                    paper_number: 12,
                    year: 2026,
                    session: 'may_jun',
                    stage: 'as',
                    attempted_at: '2026-05-10',
                    created_at: '2026-05-10T10:00:00Z',
                    score_raw: 58,
                    score_max: 75,
                  },
                ],
                error: null,
              })
            }
            return Promise.resolve({ data: [], error: null })
          }
          return Promise.resolve({ data: [], error: null })
        }),
      }

      // Default data arrays for table queries
      if (table === 'subject_paper_selections') {
        builder.then = (resolve: (val: unknown) => void) =>
          resolve({
            data: [
              { user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' },
              { user_subject_id: 'us-1', subject_paper_id: paper2Id, stage: 'as' },
            ],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (resolve: (val: unknown) => void) =>
          resolve({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'as_only',
                combination_key: 'p1_p2',
                subject_route_papers: [
                  { subject_paper_id: paper1Id, stage: 'as' },
                  { subject_paper_id: paper2Id, stage: 'as' },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (resolve: (val: unknown) => void) =>
          resolve({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: '12, 22',
                qualification_level: 'as',
                route_type: 'as_only',
                maximum_mark: 125,
                weighting_basis: 'raw_total',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (resolve: (val: unknown) => void) =>
          resolve({
            data: [
              { id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Pure Mathematics 1' },
              { id: paper2Id, subject_id: subjectId, paper_number: 2, name: 'Pure Mathematics 2' },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (resolve: (val: unknown) => void) =>
          resolve({
            data: [
              // Only June 2026 is published. Intended was November 2026.
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
                official_index_url: 'https://example.com/index',
                official_pdf_url: 'https://example.com/june2026.pdf',
                official_published_on: '2026-06-29',
                published_at: '2026-06-29T00:00:00Z',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (resolve: (val: unknown) => void) =>
          resolve({
            data: [
              { combination_id: combId, grade: 'a', threshold_mark: 101 },
              { combination_id: combId, grade: 'b', threshold_mark: 87 },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (resolve: (val: unknown) => void) =>
          resolve({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
              {
                combination_id: combId,
                token_position: 2,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-22',
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (resolve: (val: unknown) => void) =>
          resolve({
            data: [
              {
                benchmark_group_id: 'bg-1',
                publication_id: pubId,
                subject_paper_id: paper1Id,
                component_grade: 'A',
                raw_maximum_mark: 75,
                ceiling_average_mark: 60,
                included_variants: ['11', '12', '13'],
              },
              {
                benchmark_group_id: 'bg-2',
                publication_id: pubId,
                subject_paper_id: paper2Id,
                component_grade: 'A',
                raw_maximum_mark: 50,
                ceiling_average_mark: 41,
                included_variants: ['21', '22', '23'],
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (resolve: (val: unknown) => void) =>
          resolve({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 61 }],
              },
              {
                id: 'var-22',
                publication_id: pubId,
                component_code: '22',
                raw_maximum_mark: 50,
                subject_paper_id: paper2Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 40 }],
              },
            ],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId)
    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      expect(plan.summary.officialCombinedTarget).toBe(101)
      expect(plan.summary.combinedMaximumMark).toBe(125)

      // Fallback disclosure: intended was November 2026, benchmark used is June 2026
      expect(plan.summary.provenance.isFallback).toBe(true)
      expect(plan.summary.provenance.intendedSeries).toBe('november')
      expect(plan.summary.provenance.examSeries).toBe('june')

      // Papers included
      expect(plan.paperPlans.length).toBe(2)
      expect(plan.paperPlans[0].componentName).toBe('Pure Mathematics 1')
      expect(plan.paperPlans[1].componentName).toBe('Pure Mathematics 2')

      // Paper 1 required mark and ceiling average included variants
      expect(plan.paperPlans[0].requiredMark).toBe(60)
      expect(plan.paperPlans[0].includedVariants).toEqual(['11', '12', '13'])

      // Pagination was called
      expect(pastPaperPageCalls).toBeGreaterThanOrEqual(1)
    }
  })

  // ─── 8. Two eligible combinations sharing a route & variant switching ───────
  it('correctly resolves combination when two eligible combinations share a route and switches threshold on variant change', async () => {
    const pubId = 'pub-june-2026'
    const routeId = 'route-as-only'
    const combAxId = 'comb-ax'
    const combAyId = 'comb-ay'
    const paper1Id = 'p1-uuid'
    const paper2Id = 'p2-uuid'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Mathematics', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'as_only',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [
              { user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' },
              { user_subject_id: 'us-1', subject_paper_id: paper2Id, stage: 'as' },
            ],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'as_only',
                subject_route_papers: [
                  { subject_paper_id: paper1Id, stage: 'as' },
                  { subject_paper_id: paper2Id, stage: 'as' },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [
              { id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Pure 1' },
              { id: paper2Id, subject_id: subjectId, paper_number: 2, name: 'Pure 2' },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
                official_index_url: 'https://example.com',
                official_pdf_url: 'https://example.com/pdf',
                official_published_on: '2026-06-29',
                published_at: '2026-06-29T00:00:00Z',
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combAxId,
                publication_id: pubId,
                canonical_key: 'AX',
                route_type: 'as_only',
                qualification_level: 'as',
                maximum_mark: 125,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
              {
                id: combAyId,
                publication_id: pubId,
                canonical_key: 'AY',
                route_type: 'as_only',
                qualification_level: 'as',
                maximum_mark: 125,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [
              { combination_id: combAxId, grade: 'a', threshold_mark: 100 },
              { combination_id: combAyId, grade: 'a', threshold_mark: 105 },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              // AX tokens: 11, 21
              {
                combination_id: combAxId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-11',
              },
              {
                combination_id: combAxId,
                token_position: 2,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-21',
              },
              // AY tokens: 12, 22
              {
                combination_id: combAyId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
              {
                combination_id: combAyId,
                token_position: 2,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-22',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-11',
                publication_id: pubId,
                component_code: '11',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 60 }],
              },
              {
                id: 'var-21',
                publication_id: pubId,
                component_code: '21',
                raw_maximum_mark: 50,
                subject_paper_id: paper2Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 40 }],
              },
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 63 }],
              },
              {
                id: 'var-22',
                publication_id: pubId,
                component_code: '22',
                raw_maximum_mark: 50,
                subject_paper_id: paper2Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 42 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [
              {
                benchmark_group_id: 'bg-1',
                publication_id: pubId,
                subject_paper_id: paper1Id,
                component_grade: 'A',
                raw_maximum_mark: 75,
                ceiling_average_mark: 62,
                included_variants: ['11', '12'],
              },
              {
                benchmark_group_id: 'bg-2',
                publication_id: pubId,
                subject_paper_id: paper2Id,
                component_grade: 'A',
                raw_maximum_mark: 50,
                ceiling_average_mark: 41,
                included_variants: ['21', '22'],
              },
            ],
            error: null,
          })
      }

      return builder
    })

    // Selection 1: Variant 11 & 21 -> resolves to Option AX (threshold 100)
    const planAx = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '11', [paper2Id]: '21' },
    })
    expect(planAx.status).toBe('available')
    if (planAx.status === 'available') {
      expect(planAx.summary.officialCombinedTarget).toBe(100)
    }

    // Selection 2: Variant 12 & 22 -> switches threshold to Option AY (threshold 105)
    const planAy = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12', [paper2Id]: '22' },
    })
    expect(planAy.status).toBe('available')
    if (planAy.status === 'available') {
      expect(planAy.summary.officialCombinedTarget).toBe(105)
    }

    // Selection 3: Unknown variants -> does NOT pick an arbitrary combination!
    // officialCombinedTarget remains null with explanation
    const planUnknown = await getTargetGradePlan(subjectId, {
      selectedVariants: {},
    })
    expect(planUnknown.status).toBe('available')
    if (planUnknown.status === 'available') {
      expect(planUnknown.summary.officialCombinedTarget).toBeNull()
      expect(planUnknown.summary.overallThresholdUnavailableReason).toContain('Select specific paper variants')
      // Component-level approved benchmarks remain visible as benchmarks, not required allocations
      expect(planUnknown.paperPlans.length).toBe(2)
      expect(planUnknown.paperPlans[0].requiredMark).toBeNull()
      expect(planUnknown.paperPlans[0].benchmarkFloorMark).toBe(62)
      expect(planUnknown.paperPlans[0].isAllocationAvailable).toBe(false)
    }
  })

  // ─── 9. Fallback when newest publication lacks compatible combination ───────
  it('falls back to earlier publication when newest publication lacks a compatible combination for the route', async () => {
    const pubNewestId = 'pub-2026-june'
    const pubEarlierId = 'pub-2025-nov'
    const routeId = 'route-staged'
    const combId = 'comb-staged-2025'
    const paper1Id = 'p1-uuid'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Physics', code: '9702', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'full_level',
                target_grade: 'A',
                exam_date: '2026-06-01', // Intended: June 2026
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'full_level',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        // Return both 2026 June and 2025 November
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubNewestId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
                official_index_url: 'https://example.com/2026',
                official_pdf_url: 'https://example.com/2026.pdf',
              },
              {
                id: pubEarlierId,
                subject_id: subjectId,
                exam_year: 2025,
                exam_series: 'november',
                publication_status: 'published',
                is_active: true,
                official_index_url: 'https://example.com/2025',
                official_pdf_url: 'https://example.com/2025.pdf',
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        // ONLY the earlier publication (2025-nov) has a combination for routeId!
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubEarlierId,
                canonical_key: 'A',
                route_type: 'full_level',
                qualification_level: 'a_level',
                maximum_mark: 100,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'A', threshold_mark: 70 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12-earlier',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12-earlier',
                publication_id: pubEarlierId,
                component_code: '12',
                raw_maximum_mark: 100,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 70 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [
              {
                benchmark_group_id: 'bg-1',
                publication_id: pubEarlierId,
                subject_paper_id: paper1Id,
                component_grade: 'A',
                raw_maximum_mark: 100,
                ceiling_average_mark: 70,
                included_variants: ['12'],
              },
            ],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId)
    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Confirms earlier publication was selected because newest lacked compatible combination
      expect(plan.summary.provenance.isFallback).toBe(true)
      expect(plan.summary.provenance.intendedYear).toBe(2026)
      expect(plan.summary.provenance.intendedSeries).toBe('june')
      expect(plan.summary.provenance.examYear).toBe(2025)
      expect(plan.summary.provenance.examSeries).toBe('november')
      expect(plan.summary.officialCombinedTarget).toBe(70)
    }
  })

  // ─── 10. Deterministic pagination across 1000+ attempts with identical dates ─
  it('paginates 1,000-plus past_papers deterministically with identical dates across page boundaries', async () => {
    const pubId = 'pub-june-2026'
    const routeId = 'route-1'
    const combId = 'comb-1'
    const paper1Id = 'p1-uuid'

    const requestedRanges: Array<[number, number]> = []

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Maths', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'as_only',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        range: vi.fn().mockImplementation((from: number, to: number) => {
          if (table === 'past_papers') {
            requestedRanges.push([from, to])
            if (from === 0) {
              // Page 1: exactly 1000 items
              const page1 = Array.from({ length: 1000 }, (_, i) => ({
                id: `attempt-${i}`,
                subject_id: subjectId,
                subject_paper_id: paper1Id,
                paper_number: 12,
                year: 2026,
                session: 'may_jun',
                stage: 'as',
                attempted_at: '2026-05-15', // Same date on attempt 999
                created_at: `2026-05-15T10:${String(i % 60).padStart(2, '0')}:00Z`,
                score_raw: 50,
                score_max: 75,
              }))
              return Promise.resolve({ data: page1, error: null })
            }
            if (from === 1000) {
              // Page 2: 250 items with identical date as attempt 999
              const page2 = Array.from({ length: 250 }, (_, i) => ({
                id: `attempt-${1000 + i}`,
                subject_id: subjectId,
                subject_paper_id: paper1Id,
                paper_number: 12,
                year: 2026,
                session: 'may_jun',
                stage: 'as',
                attempted_at: '2026-05-15', // Same date as boundary
                created_at: `2026-05-15T11:${String(i % 60).padStart(2, '0')}:00Z`,
                score_raw: 50,
                score_max: 75,
              }))
              return Promise.resolve({ data: page2, error: null })
            }
            return Promise.resolve({ data: [], error: null })
          }
          return Promise.resolve({ data: [], error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'as_only',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'A',
                route_type: 'as_only',
                qualification_level: 'as',
                maximum_mark: 75,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'a', threshold_mark: 55 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 55 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [
              {
                benchmark_group_id: 'bg-1',
                publication_id: pubId,
                subject_paper_id: paper1Id,
                component_grade: 'A',
                raw_maximum_mark: 75,
                ceiling_average_mark: 55,
                included_variants: ['12'],
              },
            ],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId)
    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Assert exact requested ranges for page 1 and page 2
      expect(requestedRanges).toEqual([
        [0, 999],
        [1000, 1999],
      ])
      // Assert all 1,250 attempts were processed completely
      expect(plan.paperPlans[0].evidence.attemptCount).toBe(1250)
    }
  })

  // ─── 11. Historical-query failure propagation ──────────────────────────────
  it('propagates historical query errors without silently swallowing or converting to empty data', async () => {
    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Maths', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'as_only',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        range: vi.fn().mockImplementation((from: number) => {
          if (table === 'past_papers') {
            if (from === 0) {
              return Promise.resolve({
                data: [
                  {
                    id: 'att-1',
                    subject_id: subjectId,
                    subject_paper_id: 'p1-uuid',
                    paper_number: 12,
                    year: 2024,
                    session: 'may_jun',
                    stage: 'as',
                    attempted_at: '2024-05-10',
                    created_at: '2024-05-10T10:00:00Z',
                    score_raw: 50,
                    score_max: 75,
                  },
                ],
                error: null,
              })
            }
          }
          return Promise.resolve({ data: [], error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: 'p1-uuid', stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'route-1',
                subject_id: subjectId,
                route: 'as_only',
                subject_route_papers: [{ subject_paper_id: 'p1-uuid', stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: 'p1-uuid', subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'pub-1',
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'comb-1',
                publication_id: 'pub-1',
                canonical_key: 'A',
                route_type: 'as_only',
                qualification_level: 'as',
                maximum_mark: 75,
                per_paper_allocation_eligible: true,
                atlas_route_id: 'route-1',
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: 'comb-1', grade: 'a', threshold_mark: 55 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: 'comb-1',
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-1',
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [
              {
                benchmark_group_id: 'bg-1',
                publication_id: 'pub-1',
                subject_paper_id: 'p1-uuid',
                component_grade: 'A',
                raw_maximum_mark: 75,
                ceiling_average_mark: 55,
                included_variants: ['12'],
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        let isHistoricalCall = false
        builder.in = vi.fn((col: string) => {
          if (col.includes('exam_year')) {
            isHistoricalCall = true
          }
          return builder
        })
        builder.then = (r) => {
          if (isHistoricalCall) {
            return r({
              data: null,
              error: { message: 'Database connection failed during historical query' },
            })
          }
          return r({
            data: [
              {
                id: 'var-1',
                publication_id: 'pub-1',
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: 'p1-uuid',
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 55 }],
              },
            ],
            error: null,
          })
        }
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId)
    expect(plan.status).toBe('query-failure')
    if (plan.status === 'query-failure') {
      expect(plan.message).toBe('Failed to query historical grade thresholds')
      expect(plan.error).toBe('Database connection failed during historical query')
    }
  })

  // ─── 12. Unsupported variant recovery & no approved average with valid exact variants ─
  it('recovers with per-paper error on unsupported variant and provides valid exact variants when no approved average exists', async () => {
    const pubId = 'pub-1'
    const routeId = 'route-1'
    const combId = 'comb-1'
    const paper1Id = 'p1-uuid'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Maths', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'as_only',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'as_only',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'A',
                route_type: 'as_only',
                qualification_level: 'as',
                maximum_mark: 75,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'a', threshold_mark: 55 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 55 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        // NO approved ceiling average benchmark row exists!
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    // Case 1: Unknown variant when no approved ceiling average exists
    const planNoAvg = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: 'unknown' },
    })
    expect(planNoAvg.status).toBe('available')
    if (planNoAvg.status === 'available') {
      const paper1 = planNoAvg.paperPlans[0]
      expect(paper1.hasApprovedAverage).toBe(false)
      // Valid exact variant is still available for selection
      expect(paper1.availableVariants).toEqual([{ variantCode: '12', label: 'Variant 12' }])
      expect(paper1.variantError).toContain('No approved ceiling average benchmark')
    }

    // Case 2: User chooses an invalid variant (e.g. '99')
    const planInvalidVar = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '99' },
    })
    expect(planInvalidVar.status).toBe('available')
    if (planInvalidVar.status === 'available') {
      const paper1 = planInvalidVar.paperPlans[0]
      // Recoverable per-paper error without destroying the planner!
      expect(paper1.variantError).toContain('Variant 99 is not available')
      expect(paper1.availableVariants).toEqual([{ variantCode: '12', label: 'Variant 12' }])
    }
  })

  // ─── 13. Regression: Newest publication incompatible with selected variants but older publication compatible ─
  it('falls back to an older publication when newest lacks the requested variant but older contains it', async () => {
    const pub2026Id = 'pub-2026'
    const pub2025Id = 'pub-2025'
    const routeId = 'route-1'
    const comb2026AyId = 'comb-2026-ay'
    const comb2025AxId = 'comb-2025-ax'
    const paper1Id = 'p1-uuid'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Maths', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'as_only',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'as_only',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pub2026Id,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
                official_index_url: 'https://example.com/2026',
                official_pdf_url: 'https://example.com/2026.pdf',
              },
              {
                id: pub2025Id,
                subject_id: subjectId,
                exam_year: 2025,
                exam_series: 'november',
                publication_status: 'published',
                is_active: true,
                official_index_url: 'https://example.com/2025',
                official_pdf_url: 'https://example.com/2025.pdf',
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              // 2026 only has Option AY (variant 12)
              {
                id: comb2026AyId,
                publication_id: pub2026Id,
                canonical_key: 'AY',
                route_type: 'as_only',
                qualification_level: 'as',
                maximum_mark: 75,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
              // 2025 has Option AX (variant 11)
              {
                id: comb2025AxId,
                publication_id: pub2025Id,
                canonical_key: 'AX',
                route_type: 'as_only',
                qualification_level: 'as',
                maximum_mark: 75,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [
              { combination_id: comb2026AyId, grade: 'a', threshold_mark: 58 },
              { combination_id: comb2025AxId, grade: 'a', threshold_mark: 52 },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: comb2026AyId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-2026-12',
              },
              {
                combination_id: comb2025AxId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-2025-11',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-2026-12',
                publication_id: pub2026Id,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 58 }],
              },
              {
                id: 'var-2025-11',
                publication_id: pub2025Id,
                component_code: '11',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 52 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    // User chooses Variant 11 (which is only present in 2025 November)
    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '11' },
    })

    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Must select 2025 November fallback publication
      expect(plan.summary.provenance.publicationId).toBe(pub2025Id)
      expect(plan.summary.provenance.examYear).toBe(2025)
      expect(plan.summary.provenance.examSeries).toBe('november')
      expect(plan.summary.provenance.isFallback).toBe(true)
      expect(plan.summary.officialCombinedTarget).toBe(52)
      expect(plan.summary.resolvedOptionCode).toBe('AX')
      expect(plan.paperPlans[0].targetVariantChoice).toBe('11')
      expect(plan.paperPlans[0].requiredMark).toBe(52)
    }
  })

  // ─── 14. Regression: Never guesses marks on missing threshold, weighting, or invalid variant ─
  it('never guesses marks and leaves unavailable values explicit on missing thresholds, weighting, or invalid variants', async () => {
    const pubId = 'pub-1'
    const routeId = 'route-1'
    const combId = 'comb-1'
    const paper1Id = 'p1-uuid'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Maths', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'as_only',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'as_only',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'A',
                route_type: 'as_only',
                qualification_level: 'as',
                maximum_mark: 75,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'a', threshold_mark: 55 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        // Component variant has NO marks row (missing threshold)!
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12' },
    })

    expect(plan.status).toBe('threshold-unavailable')
    if (plan.status === 'threshold-unavailable') {
      expect(plan.reason).toContain('Official component threshold mark for grade A is missing')
      expect(plan.message).toContain('Official Cambridge threshold mark for grade A is unavailable')
    }
  })

  // ─── 15. Regression: Rolling prediction strictly uses uniquely resolved combination ─
  it('restricts rolling prediction to the uniquely resolved option code and does not combine codes', async () => {
    const pubId = 'pub-1'
    const routeId = 'route-1'
    const combAxId = 'comb-ax'
    const combAyId = 'comb-ay'
    const paper1Id = 'p1-uuid'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Maths', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'as_only',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        range: vi.fn().mockImplementation((from: number) => {
          if (table === 'past_papers') {
            if (from === 0) {
              return Promise.resolve({
                data: [
                  {
                    id: 'att-1',
                    subject_id: subjectId,
                    subject_paper_id: paper1Id,
                    paper_number: 11,
                    year: 2026,
                    session: 'may_jun',
                    stage: 'as',
                    attempted_at: '2026-05-01',
                    created_at: '2026-05-01T10:00:00Z',
                    score_raw: 60,
                    score_max: 75,
                  },
                  {
                    id: 'att-2',
                    subject_id: subjectId,
                    subject_paper_id: paper1Id,
                    paper_number: 11,
                    year: 2026,
                    session: 'may_jun',
                    stage: 'as',
                    attempted_at: '2026-05-10',
                    created_at: '2026-05-10T10:00:00Z',
                    score_raw: 60,
                    score_max: 75,
                  },
                ],
                error: null,
              })
            }
          }
          return Promise.resolve({ data: [], error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'as_only',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combAxId,
                publication_id: pubId,
                canonical_key: 'AX',
                route_type: 'as_only',
                qualification_level: 'as',
                maximum_mark: 75,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
              {
                id: combAyId,
                publication_id: pubId,
                canonical_key: 'AY',
                route_type: 'as_only',
                qualification_level: 'as',
                maximum_mark: 75,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [
              // AX threshold for A is 55, B is 45
              { combination_id: combAxId, grade: 'a', threshold_mark: 55 },
              { combination_id: combAxId, grade: 'b', threshold_mark: 45 },
              // AY threshold for A is 65, B is 55
              { combination_id: combAyId, grade: 'a', threshold_mark: 65 },
              { combination_id: combAyId, grade: 'b', threshold_mark: 55 },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combAxId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-11',
              },
              {
                combination_id: combAyId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-11',
                publication_id: pubId,
                component_code: '11',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 55 }],
              },
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 65 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    // Resolves uniquely to AX with score 60.
    // In AX, 60 >= 55 -> Grade 'a'. (If AY was used, 60 < 65 -> Grade 'b').
    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '11' },
    })

    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      expect(plan.summary.resolvedOptionCode).toBe('AX')
      expect(plan.summary.estimatedCombinedMark).toBe(60)
      expect(plan.summary.rollingPredictedGrade).toBe('a')
    }
  })

  // ─── 16. Regression: Staged route planning estimate is excluded from performance claims ─
  it('excludes staged planning assumption ceil(T/2) from earned performance claims and rolling prediction', async () => {
    const pubId = 'pub-1'
    const routeId = 'route-staged'
    const combId = 'comb-staged'
    const paper1Id = 'p1-as'
    const paper3Id = 'p3-a2'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Maths', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'staged',
                target_grade: 'A*',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        range: vi.fn().mockImplementation((from: number) => {
          if (table === 'past_papers') {
            if (from === 0) {
              return Promise.resolve({
                data: [
                  {
                    id: 'att-1',
                    subject_id: subjectId,
                    subject_paper_id: paper3Id,
                    paper_number: 32,
                    year: 2026,
                    session: 'may_jun',
                    stage: 'a2',
                    attempted_at: '2026-05-01',
                    created_at: '2026-05-01T10:00:00Z',
                    score_raw: 70,
                    score_max: 75,
                  },
                  {
                    id: 'att-2',
                    subject_id: subjectId,
                    subject_paper_id: paper3Id,
                    paper_number: 32,
                    year: 2026,
                    session: 'may_jun',
                    stage: 'a2',
                    attempted_at: '2026-05-10',
                    created_at: '2026-05-10T10:00:00Z',
                    score_raw: 70,
                    score_max: 75,
                  },
                ],
                error: null,
              })
            }
          }
          return Promise.resolve({ data: [], error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [
              { user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' },
              { user_subject_id: 'us-1', subject_paper_id: paper3Id, stage: 'a2' },
            ],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'staged',
                subject_route_papers: [
                  { subject_paper_id: paper1Id, stage: 'as' },
                  { subject_paper_id: paper3Id, stage: 'a2' },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [
              { id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Pure 1' },
              { id: paper3Id, subject_id: subjectId, paper_number: 3, name: 'Pure 3' },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'BY',
                route_type: 'staged',
                qualification_level: 'a_level',
                maximum_mark: 250,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'A*', threshold_mark: 140 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'carry_forward',
                stage: 'as',
                weighting_factor: 1.0,
                carry_forward_mapping_status: 'approved',
              },
              {
                combination_id: combId,
                token_position: 2,
                token_kind: 'component_variant',
                stage: 'a2',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-32',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-32',
                publication_id: pubId,
                component_code: '32',
                raw_maximum_mark: 75,
                subject_paper_id: paper3Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 60 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper3Id]: '32' },
    })

    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Staged breakdown exists with ceil(140 / 2) = 70
      expect(plan.summary.stagedBreakdown?.kind).toBe('estimated_halfway')
      if (plan.summary.stagedBreakdown?.kind === 'estimated_halfway') {
        expect(plan.summary.stagedBreakdown.estimatedAsContribution).toBe(70)
        expect(plan.summary.stagedBreakdown.remainingA2Required).toBe(70)
      }

      // BUT estimatedCombinedMark, marksStillNeeded, and predictedGrade remain null
      expect(plan.summary.estimatedCombinedMark).toBeNull()
      expect(plan.summary.marksStillNeeded).toBeNull()
      expect(plan.summary.rollingPredictedGrade).toBeNull()
      expect(plan.summary.latestComparableGrade).toBeNull()
    }
  })

  // ─── 17. Regression: Historical combination/token/mark query failure returns query-failure ─
  it('propagates historical combination, token, or mark query failure as query-failure', async () => {
    const testHistoricalError = async (failingTable: string) => {
      mockFrom.mockImplementation((table: string) => {
        const builder: MockQueryBuilder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            if (table === 'subjects') {
              return Promise.resolve({
                data: { id: subjectId, name: 'Maths', code: '9709', color_hex: '#3b82f6' },
                error: null,
              })
            }
            if (table === 'user_subjects') {
              return Promise.resolve({
                data: {
                  id: 'us-1',
                  user_id: currentUserId,
                  subject_id: subjectId,
                  study_route: 'as_only',
                  target_grade: 'A',
                  exam_date: '2026-06-01',
                },
                error: null,
              })
            }
            return Promise.resolve({ data: null, error: null })
          }),
          range: vi.fn().mockImplementation((from: number) => {
            if (table === 'past_papers') {
              if (from === 0) {
                return Promise.resolve({
                  data: [
                    {
                      id: 'att-1',
                      subject_id: subjectId,
                      subject_paper_id: 'p1-uuid',
                      paper_number: 12,
                      year: 2024,
                      session: 'may_jun',
                      stage: 'as',
                      attempted_at: '2024-05-10',
                      created_at: '2024-05-10T10:00:00Z',
                      score_raw: 50,
                      score_max: 75,
                    },
                  ],
                  error: null,
                })
              }
            }
            return Promise.resolve({ data: [], error: null })
          }),
        }

        if (table === failingTable) {
          builder.then = (r) =>
            r({
              data: null,
              error: { message: `Simulated error in ${failingTable}` },
            })
          return builder
        }

        if (table === 'subject_paper_selections') {
          builder.then = (r) =>
            r({
              data: [{ user_subject_id: 'us-1', subject_paper_id: 'p1-uuid', stage: 'as' }],
              error: null,
            })
        } else if (table === 'subject_valid_routes') {
          builder.then = (r) =>
            r({
              data: [
                {
                  id: 'route-1',
                  subject_id: subjectId,
                  route: 'as_only',
                  subject_route_papers: [{ subject_paper_id: 'p1-uuid', stage: 'as' }],
                },
              ],
              error: null,
            })
        } else if (table === 'subject_papers') {
          builder.then = (r) =>
            r({
              data: [{ id: 'p1-uuid', subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
              error: null,
            })
        } else if (table === 'grade_threshold_publications') {
          builder.then = (r) =>
            r({
              data: [
                {
                  id: 'pub-1',
                  subject_id: subjectId,
                  exam_year: 2026,
                  exam_series: 'june',
                  publication_status: 'published',
                  is_active: true,
                },
              ],
              error: null,
            })
        } else if (table === 'published_grade_threshold_combinations') {
          builder.then = (r) =>
            r({
              data: [
                {
                  id: 'comb-1',
                  publication_id: 'pub-1',
                  canonical_key: 'A',
                  route_type: 'as_only',
                  qualification_level: 'as',
                  maximum_mark: 75,
                  per_paper_allocation_eligible: true,
                  atlas_route_id: 'route-1',
                  planner_eligibility: 'eligible',
                },
              ],
              error: null,
            })
        } else if (table === 'grade_threshold_combination_marks') {
          builder.then = (r) =>
            r({
              data: [{ combination_id: 'comb-1', grade: 'a', threshold_mark: 55 }],
              error: null,
            })
        } else if (table === 'grade_threshold_combination_tokens') {
          builder.then = (r) =>
            r({
              data: [
                {
                  combination_id: 'comb-1',
                  token_position: 1,
                  token_kind: 'component_variant',
                  stage: 'as',
                  weighting_factor: 1.0,
                  resolved_component_variant_id: 'var-1',
                },
              ],
              error: null,
            })
        } else if (table === 'published_grade_threshold_variant_benchmarks') {
          builder.then = (r) =>
            r({
              data: [
                {
                  benchmark_group_id: 'bg-1',
                  publication_id: 'pub-1',
                  subject_paper_id: 'p1-uuid',
                  component_grade: 'A',
                  raw_maximum_mark: 75,
                  ceiling_average_mark: 55,
                  included_variants: ['12'],
                },
              ],
              error: null,
            })
        } else if (table === 'grade_threshold_component_variants') {
          builder.then = (r) =>
            r({
              data: [
                {
                  id: 'var-1',
                  publication_id: 'pub-1',
                  component_code: '12',
                  raw_maximum_mark: 75,
                  subject_paper_id: 'p1-uuid',
                  grade_threshold_publications: { id: 'pub-hist-1', exam_year: 2024, exam_series: 'june' },
                  grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 55 }],
                },
              ],
              error: null,
            })
        }

        return builder
      })

      const plan = await getTargetGradePlan(subjectId)
      expect(plan.status).toBe('query-failure')
      if (plan.status === 'query-failure') {
        expect(plan.error).toContain(`Simulated error in ${failingTable}`)
      }
    }

    await testHistoricalError('grade_threshold_combination_tokens')
    await testHistoricalError('grade_threshold_combination_marks')
  })

  // ─── 18. Staged A–E: No halfway inference, official threshold visible, A2 allocation unavailable ─
  it('withholds AS halfway inference and A2 allocations for staged routes targeting Grade A while keeping official combined target visible', async () => {
    const pubId = 'pub-1'
    const routeId = 'route-staged'
    const combId = 'comb-staged'
    const paper1Id = 'p1-as'
    const paper3Id = 'p3-a2'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Maths', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'staged',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [
              { user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' },
              { user_subject_id: 'us-1', subject_paper_id: paper3Id, stage: 'a2' },
            ],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'staged',
                subject_route_papers: [
                  { subject_paper_id: paper1Id, stage: 'as' },
                  { subject_paper_id: paper3Id, stage: 'a2' },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [
              { id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Pure 1' },
              { id: paper3Id, subject_id: subjectId, paper_number: 3, name: 'Pure 3' },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'BY',
                route_type: 'staged',
                qualification_level: 'a_level',
                maximum_mark: 250,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'A', threshold_mark: 130 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'carry_forward',
                stage: 'as',
                weighting_factor: 1.0,
                carry_forward_mapping_status: 'approved',
              },
              {
                combination_id: combId,
                token_position: 2,
                token_kind: 'component_variant',
                stage: 'a2',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-32',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-32',
                publication_id: pubId,
                component_code: '32',
                raw_maximum_mark: 75,
                subject_paper_id: paper3Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 58 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper3Id]: '32' },
    })

    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Official combined target mark is visible
      expect(plan.summary.officialCombinedTarget).toBe(130)

      // Staged halfway estimate is NOT applied for non-A*
      expect(plan.summary.stagedBreakdown).toBeNull()

      // Allocation is not eligible
      expect(plan.summary.perPaperAllocationEligible).toBe(false)
      expect(plan.summary.estimatedCombinedMark).toBeNull()
      expect(plan.summary.marksStillNeeded).toBeNull()
      expect(plan.summary.rollingPredictedGrade).toBeNull()

      // Paper plans have allocation marked unavailable with explicit explanation
      expect(plan.paperPlans.length).toBe(1)
      const a2Plan = plan.paperPlans[0]
      expect(a2Plan.isAllocationAvailable).toBe(false)
      expect(a2Plan.allocationUnavailableReason).toContain('requires verified official AS results')
      expect(a2Plan.benchmarkFloorMark).toBe(58)
    }
  })

  // ─── 19. Structured fallback reasons for publications ─────────────────────
  it('differentiates unpublished intended series from incompatible variants in fallback reason', async () => {
    const pubEarlierId = 'pub-2025-nov'
    const routeId = 'route-1'
    const combEarlierId = 'comb-2025-nov'
    const paper1Id = 'p1-uuid'

    // Case A: Intended series is unpublished (no 2026 publication in DB)
    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Physics', code: '9702', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'full_level',
                target_grade: 'A',
                exam_date: '2026-06-01', // Intended: June 2026
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'full_level',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubEarlierId,
                subject_id: subjectId,
                exam_year: 2025,
                exam_series: 'november',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combEarlierId,
                publication_id: pubEarlierId,
                canonical_key: 'AX',
                qualification_level: 'a_level',
                maximum_mark: 100,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combEarlierId, grade: 'A', threshold_mark: 70 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combEarlierId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12-earlier',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12-earlier',
                publication_id: pubEarlierId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 55 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const planUnpublished = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12' },
    })

    expect(planUnpublished.status).toBe('available')
    if (planUnpublished.status === 'available') {
      expect(planUnpublished.summary.provenance.isFallback).toBe(true)
      expect(planUnpublished.summary.provenance.fallbackReason).toBe('intended_series_unpublished')
    }

    // Case B: Intended series exists in DB, but only has variant 11, while user selected variant 12
    const pubNewestId = 'pub-2026-june'
    const combNewestId = 'comb-2026-june'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Physics', code: '9702', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'full_level',
                target_grade: 'A',
                exam_date: '2026-06-01', // Intended: June 2026
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'full_level',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubNewestId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
              {
                id: pubEarlierId,
                subject_id: subjectId,
                exam_year: 2025,
                exam_series: 'november',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              // Newest pub has only combination for variant 11
              {
                id: combNewestId,
                publication_id: pubNewestId,
                canonical_key: 'AX',
                qualification_level: 'a_level',
                maximum_mark: 100,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
              // Earlier pub has combination for variant 12
              {
                id: combEarlierId,
                publication_id: pubEarlierId,
                canonical_key: 'AY',
                qualification_level: 'a_level',
                maximum_mark: 100,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [
              { combination_id: combNewestId, grade: 'A', threshold_mark: 72 },
              { combination_id: combEarlierId, grade: 'A', threshold_mark: 70 },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combNewestId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-11-newest',
              },
              {
                combination_id: combEarlierId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12-earlier',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-11-newest',
                publication_id: pubNewestId,
                component_code: '11',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 56 }],
              },
              {
                id: 'var-12-earlier',
                publication_id: pubEarlierId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 55 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const planIncompatible = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12' },
    })

    expect(planIncompatible.status).toBe('available')
    if (planIncompatible.status === 'available') {
      expect(planIncompatible.summary.provenance.isFallback).toBe(true)
      expect(planIncompatible.summary.provenance.fallbackReason).toBe('incompatible_variants_or_options')
      expect(planIncompatible.summary.provenance.publicationId).toBe(pubEarlierId)
    }
  })

  // ─── 20. Historical threshold loading: reject zero defaults ───────────────
  it('omits historical component variants with incomplete A-E marks rather than defaulting missing thresholds to zero', async () => {
    const pubId = 'pub-1'
    const routeId = 'route-1'
    const combId = 'comb-1'
    const paper1Id = 'p1-uuid'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Physics', code: '9702', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'full_level',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        range: vi.fn().mockImplementation((from: number) => {
          if (table === 'past_papers') {
            if (from === 0) {
              return Promise.resolve({
                data: [
                  {
                    id: 'att-hist-1',
                    subject_id: subjectId,
                    subject_paper_id: paper1Id,
                    paper_number: 12,
                    year: 2024,
                    session: 'may_jun',
                    stage: 'as',
                    attempted_at: '2024-05-15',
                    created_at: '2024-05-15T10:00:00Z',
                    score_raw: 10,
                    score_max: 75,
                  },
                ],
                error: null,
              })
            }
          }
          return Promise.resolve({ data: [], error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'full_level',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'AX',
                qualification_level: 'a_level',
                maximum_mark: 75,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2026, exam_series: 'june' },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'A', threshold_mark: 55 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_publications: {
                  id: 'pub-2024',
                  exam_year: 2024,
                  exam_series: 'june',
                  publication_status: 'published',
                  is_active: true,
                },
                // INCOMPLETE MARKS: Grade B is missing!
                grade_threshold_component_marks: [
                  { grade: 'A', threshold_mark: 55 },
                  { grade: 'C', threshold_mark: 40 },
                  { grade: 'D', threshold_mark: 30 },
                  { grade: 'E', threshold_mark: 20 },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12' },
    })

    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Historical grade for attempt must be null (not graded as B because missing threshold was defaulted to 0)
      const paperPlan = plan.paperPlans[0]
      expect(paperPlan.evidence.latestHistoricalGrade).toBeNull()
    }
  })

  // ─── 21. Scoped historical token and mark queries with .in('combination_id', ids) ─
  it('scopes historical combination tokens and marks queries with .in(combination_id, ids) preventing >1000 row truncation', async () => {
    const pubId = 'pub-2026'
    const routeId = 'route-1'
    const combId = 'comb-2026'
    const paper1Id = 'p1-uuid'
    const histCombId = 'comb-hist-2024'

    // Model at least 1001 unrelated tokens and 1001 unrelated marks that appear in the database
    // BEFORE the relevant rows. Without .in('combination_id', ...), an unscoped query with the
    // default 1000-row limit would receive only these unrelated rows and truncate the target rows.
    const unrelatedTokens = Array.from({ length: 1001 }, (_, i) => ({
      combination_id: `comb-unrelated-${i}`,
      token_position: 1,
      token_kind: 'component_variant',
      stage: 'as',
      weighting_factor: 1.0,
      resolved_component_variant_id: `var-unrelated-${i}`,
      grade_threshold_component_variants: null,
    }))

    const unrelatedMarks = Array.from({ length: 1001 }, (_, i) => ({
      combination_id: `comb-unrelated-${i}`,
      grade: 'A',
      threshold_mark: 50,
    }))

    const relevantTokens = [
      {
        combination_id: combId,
        token_position: 1,
        token_kind: 'component_variant',
        stage: 'as',
        weighting_factor: 1.0,
        resolved_component_variant_id: 'var-12',
        grade_threshold_component_variants: {
          subject_paper_id: paper1Id,
          component_code: '12',
          raw_maximum_mark: 75,
        },
      },
      {
        combination_id: histCombId,
        token_position: 1,
        token_kind: 'component_variant',
        stage: 'as',
        weighting_factor: 1.0,
        resolved_component_variant_id: 'var-12-hist',
        grade_threshold_component_variants: {
          subject_paper_id: paper1Id,
          component_code: '12',
          raw_maximum_mark: 75,
        },
      },
    ]

    const relevantMarks = [
      { combination_id: combId, grade: 'A', threshold_mark: 55 },
      { combination_id: histCombId, grade: 'A*', threshold_mark: 70 },
      { combination_id: histCombId, grade: 'A', threshold_mark: 60 },
      { combination_id: histCombId, grade: 'B', threshold_mark: 50 },
      { combination_id: histCombId, grade: 'C', threshold_mark: 40 },
      { combination_id: histCombId, grade: 'D', threshold_mark: 30 },
      { combination_id: histCombId, grade: 'E', threshold_mark: 20 },
    ]

    const fullTokensDatabase = [...unrelatedTokens, ...relevantTokens]
    const fullMarksDatabase = [...unrelatedMarks, ...relevantMarks]

    // Verify that the first 1000 rows contain zero relevant historical rows
    expect(fullTokensDatabase.slice(0, 1000).some((t) => t.combination_id === histCombId)).toBe(false)
    expect(fullMarksDatabase.slice(0, 1000).some((m) => m.combination_id === histCombId)).toBe(false)

    const inQueries: Record<string, Array<[string, unknown]>> = {}

    mockFrom.mockImplementation((table: string) => {
      const inCalls: Array<[string, unknown]> = []
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'att-1',
              subject_id: subjectId,
              subject_paper_id: paper1Id,
              paper_number: 12,
              year: 2024,
              session: 'may_jun',
              stage: 'as',
              attempted_at: '2024-05-10',
              created_at: '2024-05-10T10:00:00Z',
              score_raw: 65,
              score_max: 75,
            },
          ],
          error: null,
        }),
        in: vi.fn((col: string, val: unknown) => {
          inCalls.push([col, val])
          return builder
        }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Physics', code: '9702', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'full_level',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      inQueries[table] = inCalls

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'full_level',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'AX',
                maximum_mark: 75,
                qualification_level: 'a_level',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2026, exam_series: 'june' },
              },
              {
                id: histCombId,
                publication_id: 'pub-hist-2024',
                canonical_key: 'AY',
                maximum_mark: 75,
                qualification_level: 'a_level',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2024, exam_series: 'june' },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) => {
          // Model server-side filtering: when .in('combination_id', ...) is present,
          // filter the full dataset before capping to the 1000-row limit.
          const combInFilter = inCalls.find(([col]) => col === 'combination_id')
          if (combInFilter && Array.isArray(combInFilter[1])) {
            const allowedIds = combInFilter[1] as string[]
            const filtered = fullMarksDatabase.filter((row) => allowedIds.includes(row.combination_id))
            return r({ data: filtered.slice(0, 1000), error: null })
          }
          // Unscoped response drops the relevant rows because index 1001+ is truncated
          return r({ data: fullMarksDatabase.slice(0, 1000), error: null })
        }
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) => {
          // Model server-side filtering: when .in('combination_id', ...) is present,
          // filter the full dataset before capping to the 1000-row limit.
          const combInFilter = inCalls.find(([col]) => col === 'combination_id')
          if (combInFilter && Array.isArray(combInFilter[1])) {
            const allowedIds = combInFilter[1] as string[]
            const filtered = fullTokensDatabase.filter((row) => allowedIds.includes(row.combination_id))
            return r({ data: filtered.slice(0, 1000), error: null })
          }
          // Unscoped response drops the relevant rows because index 1001+ is truncated
          return r({ data: fullTokensDatabase.slice(0, 1000), error: null })
        }
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_publications: {
                  id: 'pub-hist-2024',
                  exam_year: 2024,
                  exam_series: 'june',
                  publication_status: 'published',
                  is_active: true,
                },
                grade_threshold_component_marks: [
                  { grade: 'A', threshold_mark: 60 },
                  { grade: 'B', threshold_mark: 50 },
                  { grade: 'C', threshold_mark: 40 },
                  { grade: 'D', threshold_mark: 30 },
                  { grade: 'E', threshold_mark: 20 },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12' },
    })

    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Historical sitting produced grade 'A' because scoped query retained the relevant tokens and marks
      expect(plan.summary.latestComparableGrade).toBe('A')

      // Verify that tokens and marks queries were explicitly scoped with .in('combination_id', ...)
      const tokenInCalls = inQueries['grade_threshold_combination_tokens'] ?? []
      const markInCalls = inQueries['grade_threshold_combination_marks'] ?? []

      const tokenCombIn = tokenInCalls.find(([col]) => col === 'combination_id')
      const markCombIn = markInCalls.find(([col]) => col === 'combination_id')

      expect(tokenCombIn).toBeDefined()
      expect(markCombIn).toBeDefined()
      expect(tokenCombIn?.[1]).toContain(histCombId)
      expect(markCombIn?.[1]).toContain(histCombId)
    }
  })

  // ─── 22. Missing exact component threshold yields sourceKind: null & unavailable notice ─
  it('assigns sourceKind: null and displays threshold unavailable when exact component threshold mark is missing in published variant', async () => {
    const pubId = 'pub-2026'
    const routeId = 'route-1'
    const combId = 'comb-2026'
    const paper1Id = 'p1-uuid'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Physics', code: '9702', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'full_level',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'full_level',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'AX',
                qualification_level: 'a_level',
                maximum_mark: 75,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'A', threshold_mark: 55 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                // Missing Grade A component mark!
                grade_threshold_component_marks: [
                  { grade: 'B', threshold_mark: 45 },
                  { grade: 'C', threshold_mark: 35 },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12' },
    })

    expect(plan.status).toBe('threshold-unavailable')
    if (plan.status === 'threshold-unavailable') {
      expect(plan.reason).toContain('Official component threshold mark for grade A is missing')
      expect(plan.message).toContain('Official Cambridge threshold mark for grade A is unavailable')
    }
  })

  // ─── 23. Rolling predicted grade highest-grade tie-break ───────────────────
  it('evaluates rolling predicted grade with highest-grade tie-break when thresholds are equal, regardless of database row order', async () => {
    const pubId = 'pub-2026'
    const routeId = 'route-1'
    const combId = 'comb-2026'
    const paper1Id = 'p1-uuid'

    // Mock where A* and A both have threshold_mark = 60, but A appears BEFORE A* in DB array
    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [
            // 2 attempts to satisfy allPapersHaveSufficientSample (score 60 / 75)
            {
              id: 'att-1',
              subject_id: subjectId,
              subject_paper_id: paper1Id,
              paper_number: 12,
              year: 2026,
              session: 'may_jun',
              stage: 'as',
              attempted_at: '2026-05-10',
              created_at: '2026-05-10T10:00:00Z',
              score_raw: 60,
              score_max: 75,
            },
            {
              id: 'att-2',
              subject_id: subjectId,
              subject_paper_id: paper1Id,
              paper_number: 12,
              year: 2026,
              session: 'may_jun',
              stage: 'as',
              attempted_at: '2026-05-15',
              created_at: '2026-05-15T10:00:00Z',
              score_raw: 60,
              score_max: 75,
            },
          ],
          error: null,
        }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Physics', code: '9702', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'full_level',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'full_level',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'AX',
                maximum_mark: 75,
                qualification_level: 'a_level',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        // Intentionally put Grade A before Grade A* in array order
        builder.then = (r) =>
          r({
            data: [
              { combination_id: combId, grade: 'A', threshold_mark: 60 },
              { combination_id: combId, grade: 'A*', threshold_mark: 60 },
              { combination_id: combId, grade: 'B', threshold_mark: 50 },
              { combination_id: combId, grade: 'C', threshold_mark: 40 },
              { combination_id: combId, grade: 'D', threshold_mark: 30 },
              { combination_id: combId, grade: 'E', threshold_mark: 20 },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 60 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12' },
    })

    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Must return 'A*' due to qualification rank tie-break (A* > A), despite 'A' appearing first in DB marks
      expect(plan.summary.estimatedCombinedMark).toBe(60)
      expect(plan.summary.rollingPredictedGrade).toBe('A*')
    }
  })

  // ─── 24. Missing or unexpected qualification_level in historical combination ─
  it('yields latestComparableGrade null when qualification_level is missing or unexpected in published combinations', async () => {
    const pubId = 'pub-2026'
    const routeId = 'route-1'
    const combId = 'comb-2026'
    const paper1Id = 'p1-uuid'
    const histCombId = 'comb-hist-2024'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'att-1',
              subject_id: subjectId,
              subject_paper_id: paper1Id,
              paper_number: 12,
              year: 2024,
              session: 'may_jun',
              stage: 'as',
              attempted_at: '2024-05-10',
              created_at: '2024-05-10T10:00:00Z',
              score_raw: 65,
              score_max: 75,
            },
          ],
          error: null,
        }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Physics', code: '9702', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'full_level',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'full_level',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'AX',
                maximum_mark: 75,
                qualification_level: 'a_level',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2026, exam_series: 'june' },
              },
              // Historical combination has null qualification_level! Must NOT be inferred as 'a_level'
              {
                id: histCombId,
                publication_id: 'pub-hist-2024',
                canonical_key: 'AY',
                maximum_mark: 75,
                qualification_level: null, // MISSING
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2024, exam_series: 'june' },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [
              { combination_id: combId, grade: 'A', threshold_mark: 55 },
              { combination_id: histCombId, grade: 'A*', threshold_mark: 70 },
              { combination_id: histCombId, grade: 'A', threshold_mark: 60 },
              { combination_id: histCombId, grade: 'B', threshold_mark: 50 },
              { combination_id: histCombId, grade: 'C', threshold_mark: 40 },
              { combination_id: histCombId, grade: 'D', threshold_mark: 30 },
              { combination_id: histCombId, grade: 'E', threshold_mark: 20 },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
                grade_threshold_component_variants: {
                  subject_paper_id: paper1Id,
                  component_code: '12',
                  raw_maximum_mark: 75,
                },
              },
              {
                combination_id: histCombId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12-hist',
                grade_threshold_component_variants: {
                  subject_paper_id: paper1Id,
                  component_code: '12',
                  raw_maximum_mark: 75,
                },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_publications: {
                  id: 'pub-hist-2024',
                  exam_year: 2024,
                  exam_series: 'june',
                  publication_status: 'published',
                  is_active: true,
                },
                grade_threshold_component_marks: [
                  { grade: 'A', threshold_mark: 60 },
                  { grade: 'B', threshold_mark: 50 },
                  { grade: 'C', threshold_mark: 40 },
                  { grade: 'D', threshold_mark: 30 },
                  { grade: 'E', threshold_mark: 20 },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12' },
    })

    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Because qualification_level was null, historical definition was rejected and latestComparableGrade is null
      expect(plan.summary.latestComparableGrade).toBeNull()
    }
  })

  // ─── 25. Historical publication identity: invalid or missing exam_year / exam_series ─
  it('yields latestComparableGrade null when historical publication identity has invalid year or series', async () => {
    const pubId = 'pub-current'
    const routeId = 'route-1'
    const combId = 'comb-current'
    const histCombId = 'comb-hist-invalid-pub'
    const paper1Id = 'p1-uuid'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockImplementation((from: number) => {
          if (table === 'past_papers') {
            if (from === 0) {
              return Promise.resolve({
                data: [
                  {
                    id: 'att-1',
                    subject_id: subjectId,
                    subject_paper_id: paper1Id,
                    paper_number: 12,
                    year: 2024,
                    session: 'may_jun',
                    stage: 'as',
                    attempted_at: '2024-05-15',
                    created_at: '2024-05-15T10:00:00Z',
                    score_raw: 65,
                    score_max: 75,
                  },
                ],
                error: null,
              })
            }
          }
          return Promise.resolve({ data: [], error: null })
        }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Physics', code: '9702', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'full_level',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'full_level',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'AX',
                maximum_mark: 75,
                qualification_level: 'a_level',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2026, exam_series: 'june' },
              },
              // Historical combination with invalid exam_year (0) and invalid series ('october')
              {
                id: histCombId,
                publication_id: 'pub-invalid',
                canonical_key: 'AX-2024',
                maximum_mark: 75,
                qualification_level: 'a_level',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 0, exam_series: 'october' },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [
              { combination_id: combId, grade: 'A', threshold_mark: 60 },
              { combination_id: histCombId, grade: 'A*', threshold_mark: 70 },
              { combination_id: histCombId, grade: 'A', threshold_mark: 60 },
              { combination_id: histCombId, grade: 'B', threshold_mark: 50 },
              { combination_id: histCombId, grade: 'C', threshold_mark: 40 },
              { combination_id: histCombId, grade: 'D', threshold_mark: 30 },
              { combination_id: histCombId, grade: 'E', threshold_mark: 20 },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
              {
                combination_id: histCombId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-hist',
                grade_threshold_component_variants: {
                  subject_paper_id: paper1Id,
                  component_code: '12',
                  raw_maximum_mark: 75,
                },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_publications: {
                  id: 'pub-hist-2024',
                  exam_year: 2024,
                  exam_series: 'june',
                  publication_status: 'published',
                  is_active: true,
                },
                grade_threshold_component_marks: [
                  { grade: 'A', threshold_mark: 60 },
                  { grade: 'B', threshold_mark: 50 },
                  { grade: 'C', threshold_mark: 40 },
                  { grade: 'D', threshold_mark: 30 },
                  { grade: 'E', threshold_mark: 20 },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12' },
    })

    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Historical definition was rejected due to invalid year (0) and series ('october')
      expect(plan.summary.latestComparableGrade).toBeNull()
    }
  })

  // ─── 26. Malformed current combination qualification_level ─────────────────
  it('rejects combination with missing or unexpected qualification_level for current enrollment', async () => {
    const pubId = 'pub-1'
    const routeId = 'route-1'
    const combId = 'comb-1'
    const paper1Id = 'p1-uuid'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Maths', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'full_level',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'full_level',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        // Combination has unexpected qualification_level 'other'
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'AX',
                maximum_mark: 75,
                qualification_level: 'other',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'A', threshold_mark: 55 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId)
    expect(plan.status).toBe('threshold-unavailable')
  })

  // ─── 27. as_only route cannot consume an a_level combination ───────────────
  it('rejects an a_level combination when user is enrolled on an as_only route', async () => {
    const pubId = 'pub-1'
    const routeId = 'route-1'
    const combId = 'comb-1'
    const paper1Id = 'p1-uuid'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Maths', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'as_only',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'as_only',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        // Combination has qualification_level 'a_level', but enrollment is 'as_only' (requires 'as')
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'AX',
                maximum_mark: 75,
                qualification_level: 'a_level',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'a', threshold_mark: 55 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId)
    expect(plan.status).toBe('threshold-unavailable')
  })

  // ─── 28. full_level route cannot consume an as combination ─────────────────
  it('rejects an as combination when user is enrolled on a full_level route', async () => {
    const pubId = 'pub-1'
    const routeId = 'route-1'
    const combId = 'comb-1'
    const paper1Id = 'p1-uuid'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Maths', code: '9709', color_hex: '#3b82f6' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'full_level',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'full_level',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        // Combination has qualification_level 'as', but enrollment is 'full_level' (requires 'a_level')
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'AX',
                maximum_mark: 75,
                qualification_level: 'as',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'A', threshold_mark: 55 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId)
    expect(plan.status).toBe('threshold-unavailable')
  })

  // ─── 29. as_only enrollment rejects complete historical a_level combination ─
  it('excludes mismatched a_level historical combination for as_only enrollment and leaves latestComparableGrade null', async () => {
    const pubId = 'pub-current'
    const routeId = 'route-1'
    const combId = 'comb-current'
    const mismatchedHistCombId = 'comb-hist-a-level'
    const paper1Id = 'p1-uuid'
    const queriedTokensCombIds: string[][] = []

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockImplementation((col: string, vals: string[]) => {
          if (table === 'grade_threshold_combination_tokens' && col === 'combination_id') {
            queriedTokensCombIds.push(vals)
          }
          return builder
        }),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockImplementation((from: number) => {
          if (table === 'past_papers') {
            if (from === 0) {
              return Promise.resolve({
                data: [
                  {
                    id: 'att-1',
                    subject_id: subjectId,
                    subject_paper_id: paper1Id,
                    paper_number: 12,
                    year: 2024,
                    session: 'may_jun',
                    stage: 'as',
                    attempted_at: '2024-05-15',
                    created_at: '2024-05-15T10:00:00Z',
                    score_raw: 65,
                    score_max: 75,
                  },
                ],
                error: null,
              })
            }
          }
          return Promise.resolve({ data: [], error: null })
        }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Physics', code: '9702', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'as_only',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'as_only',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'AX',
                maximum_mark: 75,
                qualification_level: 'as',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2026, exam_series: 'june' },
              },
              // Historical combination has complete A-Level structure, but enrolment is as_only!
              {
                id: mismatchedHistCombId,
                publication_id: 'pub-hist-2024',
                canonical_key: 'AY',
                maximum_mark: 75,
                qualification_level: 'a_level', // Mismatched qualification level!
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2024, exam_series: 'june' },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [
              { combination_id: combId, grade: 'a', threshold_mark: 55 },
              { combination_id: mismatchedHistCombId, grade: 'A*', threshold_mark: 70 },
              { combination_id: mismatchedHistCombId, grade: 'A', threshold_mark: 60 },
              { combination_id: mismatchedHistCombId, grade: 'B', threshold_mark: 50 },
              { combination_id: mismatchedHistCombId, grade: 'C', threshold_mark: 40 },
              { combination_id: mismatchedHistCombId, grade: 'D', threshold_mark: 30 },
              { combination_id: mismatchedHistCombId, grade: 'E', threshold_mark: 20 },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
              {
                combination_id: mismatchedHistCombId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12-hist',
                grade_threshold_component_variants: {
                  subject_paper_id: paper1Id,
                  component_code: '12',
                  raw_maximum_mark: 75,
                },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_publications: {
                  id: 'pub-hist-2024',
                  exam_year: 2024,
                  exam_series: 'june',
                  publication_status: 'published',
                  is_active: true,
                },
                grade_threshold_component_marks: [
                  { grade: 'A', threshold_mark: 60 },
                  { grade: 'B', threshold_mark: 50 },
                  { grade: 'C', threshold_mark: 40 },
                  { grade: 'D', threshold_mark: 30 },
                  { grade: 'E', threshold_mark: 20 },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12' },
    })

    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Must not produce a historical comparable grade from an a_level combination on as_only route
      expect(plan.summary.latestComparableGrade).toBeNull()
      // Child-query scoping: mismatched historical combination ID was excluded
      expect(queriedTokensCombIds.flat()).not.toContain(mismatchedHistCombId)
    }
  })

  // ─── 30. full_level enrollment rejects complete historical as combination ───
  it('excludes mismatched as historical combination for full_level enrollment and leaves latestComparableGrade null', async () => {
    const pubId = 'pub-current'
    const routeId = 'route-1'
    const combId = 'comb-current'
    const mismatchedHistCombId = 'comb-hist-as'
    const paper1Id = 'p1-uuid'
    const queriedTokensCombIds: string[][] = []

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockImplementation((col: string, vals: string[]) => {
          if (table === 'grade_threshold_combination_tokens' && col === 'combination_id') {
            queriedTokensCombIds.push(vals)
          }
          return builder
        }),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockImplementation((from: number) => {
          if (table === 'past_papers') {
            if (from === 0) {
              return Promise.resolve({
                data: [
                  {
                    id: 'att-1',
                    subject_id: subjectId,
                    subject_paper_id: paper1Id,
                    paper_number: 12,
                    year: 2024,
                    session: 'may_jun',
                    stage: 'as',
                    attempted_at: '2024-05-15',
                    created_at: '2024-05-15T10:00:00Z',
                    score_raw: 65,
                    score_max: 75,
                  },
                ],
                error: null,
              })
            }
          }
          return Promise.resolve({ data: [], error: null })
        }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Physics', code: '9702', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'full_level',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'full_level',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'AX',
                maximum_mark: 75,
                qualification_level: 'a_level',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2026, exam_series: 'june' },
              },
              // Historical combination has complete AS structure, but enrolment is full_level!
              {
                id: mismatchedHistCombId,
                publication_id: 'pub-hist-2024',
                canonical_key: 'AY',
                maximum_mark: 75,
                qualification_level: 'as', // Mismatched qualification level!
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2024, exam_series: 'june' },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [
              { combination_id: combId, grade: 'A', threshold_mark: 55 },
              { combination_id: mismatchedHistCombId, grade: 'a', threshold_mark: 60 },
              { combination_id: mismatchedHistCombId, grade: 'b', threshold_mark: 50 },
              { combination_id: mismatchedHistCombId, grade: 'c', threshold_mark: 40 },
              { combination_id: mismatchedHistCombId, grade: 'd', threshold_mark: 30 },
              { combination_id: mismatchedHistCombId, grade: 'e', threshold_mark: 20 },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
              {
                combination_id: mismatchedHistCombId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12-hist',
                grade_threshold_component_variants: {
                  subject_paper_id: paper1Id,
                  component_code: '12',
                  raw_maximum_mark: 75,
                },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_publications: {
                  id: 'pub-hist-2024',
                  exam_year: 2024,
                  exam_series: 'june',
                  publication_status: 'published',
                  is_active: true,
                },
                grade_threshold_component_marks: [
                  { grade: 'A', threshold_mark: 60 },
                  { grade: 'B', threshold_mark: 50 },
                  { grade: 'C', threshold_mark: 40 },
                  { grade: 'D', threshold_mark: 30 },
                  { grade: 'E', threshold_mark: 20 },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12' },
    })

    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Must not produce a historical comparable grade from an as combination on full_level route
      expect(plan.summary.latestComparableGrade).toBeNull()
      // Child-query scoping: mismatched historical combination ID was excluded
      expect(queriedTokensCombIds.flat()).not.toContain(mismatchedHistCombId)
    }
  })

  // ─── 31. Matching AS historical combination produces latestComparableGrade ─
  it('correctly grades matching AS historical combination for as_only enrollment', async () => {
    const pubId = 'pub-current'
    const routeId = 'route-1'
    const combId = 'comb-current'
    const matchingHistCombId = 'comb-hist-as-matching'
    const paper1Id = 'p1-uuid'
    const queriedTokensCombIds: string[][] = []

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockImplementation((col: string, vals: string[]) => {
          if (table === 'grade_threshold_combination_tokens' && col === 'combination_id') {
            queriedTokensCombIds.push(vals)
          }
          return builder
        }),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockImplementation((from: number) => {
          if (table === 'past_papers') {
            if (from === 0) {
              return Promise.resolve({
                data: [
                  {
                    id: 'att-1',
                    subject_id: subjectId,
                    subject_paper_id: paper1Id,
                    paper_number: 12,
                    year: 2024,
                    session: 'may_jun',
                    stage: 'as',
                    attempted_at: '2024-05-15',
                    created_at: '2024-05-15T10:00:00Z',
                    score_raw: 65,
                    score_max: 75,
                  },
                ],
                error: null,
              })
            }
          }
          return Promise.resolve({ data: [], error: null })
        }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Physics', code: '9702', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'as_only',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'as_only',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'AX',
                maximum_mark: 75,
                qualification_level: 'as',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2026, exam_series: 'june' },
              },
              // Historical AS combination matching as_only qualification level
              {
                id: matchingHistCombId,
                publication_id: 'pub-hist-2024',
                canonical_key: 'AY',
                maximum_mark: 75,
                qualification_level: 'as',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2024, exam_series: 'june' },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [
              { combination_id: combId, grade: 'a', threshold_mark: 55 },
              { combination_id: matchingHistCombId, grade: 'a', threshold_mark: 60 },
              { combination_id: matchingHistCombId, grade: 'b', threshold_mark: 50 },
              { combination_id: matchingHistCombId, grade: 'c', threshold_mark: 40 },
              { combination_id: matchingHistCombId, grade: 'd', threshold_mark: 30 },
              { combination_id: matchingHistCombId, grade: 'e', threshold_mark: 20 },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
              {
                combination_id: matchingHistCombId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12-hist',
                grade_threshold_component_variants: {
                  subject_paper_id: paper1Id,
                  component_code: '12',
                  raw_maximum_mark: 75,
                },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_publications: {
                  id: 'pub-hist-2024',
                  exam_year: 2024,
                  exam_series: 'june',
                  publication_status: 'published',
                  is_active: true,
                },
                grade_threshold_component_marks: [
                  { grade: 'A', threshold_mark: 60 },
                  { grade: 'B', threshold_mark: 50 },
                  { grade: 'C', threshold_mark: 40 },
                  { grade: 'D', threshold_mark: 30 },
                  { grade: 'E', threshold_mark: 20 },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12' },
    })

    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Matching AS combination grades score of 65 >= 60 as grade 'a'
      expect(plan.summary.latestComparableGrade).toBe('a')
      expect(queriedTokensCombIds.flat()).toContain(matchingHistCombId)
    }
  })

  // ─── 32. Matching A-Level historical combination produces latestComparableGrade ─
  it('correctly grades matching A-Level historical combination for full_level enrollment', async () => {
    const pubId = 'pub-current'
    const routeId = 'route-1'
    const combId = 'comb-current'
    const matchingHistCombId = 'comb-hist-a-level-matching'
    const paper1Id = 'p1-uuid'
    const queriedTokensCombIds: string[][] = []

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockImplementation((col: string, vals: string[]) => {
          if (table === 'grade_threshold_combination_tokens' && col === 'combination_id') {
            queriedTokensCombIds.push(vals)
          }
          return builder
        }),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockImplementation((from: number) => {
          if (table === 'past_papers') {
            if (from === 0) {
              return Promise.resolve({
                data: [
                  {
                    id: 'att-1',
                    subject_id: subjectId,
                    subject_paper_id: paper1Id,
                    paper_number: 12,
                    year: 2024,
                    session: 'may_jun',
                    stage: 'as',
                    attempted_at: '2024-05-15',
                    created_at: '2024-05-15T10:00:00Z',
                    score_raw: 65,
                    score_max: 75,
                  },
                ],
                error: null,
              })
            }
          }
          return Promise.resolve({ data: [], error: null })
        }),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Physics', code: '9702', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-1',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'full_level',
                target_grade: 'A',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [{ user_subject_id: 'us-1', subject_paper_id: paper1Id, stage: 'as' }],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'full_level',
                subject_route_papers: [{ subject_paper_id: paper1Id, stage: 'as' }],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [{ id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1' }],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'AX',
                maximum_mark: 75,
                qualification_level: 'a_level',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2026, exam_series: 'june' },
              },
              // Historical A-Level combination matching full_level qualification level
              {
                id: matchingHistCombId,
                publication_id: 'pub-hist-2024',
                canonical_key: 'AY',
                maximum_mark: 75,
                qualification_level: 'a_level',
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
                grade_threshold_publications: { exam_year: 2024, exam_series: 'june' },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [
              { combination_id: combId, grade: 'A', threshold_mark: 55 },
              { combination_id: matchingHistCombId, grade: 'A*', threshold_mark: 70 },
              { combination_id: matchingHistCombId, grade: 'A', threshold_mark: 60 },
              { combination_id: matchingHistCombId, grade: 'B', threshold_mark: 50 },
              { combination_id: matchingHistCombId, grade: 'C', threshold_mark: 40 },
              { combination_id: matchingHistCombId, grade: 'D', threshold_mark: 30 },
              { combination_id: matchingHistCombId, grade: 'E', threshold_mark: 20 },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12',
              },
              {
                combination_id: matchingHistCombId,
                token_position: 1,
                token_kind: 'component_variant',
                stage: 'as',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-12-hist',
                grade_threshold_component_variants: {
                  subject_paper_id: paper1Id,
                  component_code: '12',
                  raw_maximum_mark: 75,
                },
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-12',
                publication_id: pubId,
                component_code: '12',
                raw_maximum_mark: 75,
                subject_paper_id: paper1Id,
                grade_threshold_publications: {
                  id: 'pub-hist-2024',
                  exam_year: 2024,
                  exam_series: 'june',
                  publication_status: 'published',
                  is_active: true,
                },
                grade_threshold_component_marks: [
                  { grade: 'A', threshold_mark: 60 },
                  { grade: 'B', threshold_mark: 50 },
                  { grade: 'C', threshold_mark: 40 },
                  { grade: 'D', threshold_mark: 30 },
                  { grade: 'E', threshold_mark: 20 },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper1Id]: '12' },
    })

    expect(plan.status).toBe('available')
    if (plan.status === 'available') {
      // Matching A-Level combination grades score of 65 (between 60 and 70) as grade 'A'
      expect(plan.summary.latestComparableGrade).toBe('A')
      expect(queriedTokensCombIds.flat()).toContain(matchingHistCombId)
    }
  })

  // ─── 22. Staged A* missing-weighting and capacity-availability regressions ──
  it('preserves 227 target, 114 AS estimate, and 113 A2 remaining with null capacity/viability and missing-weighting status when component weighting is missing', async () => {
    const pubId = 'pub-chem-2026'
    const routeId = 'route-staged-chem'
    const combId = 'comb-staged-s3'
    const paper1Id = 'p1-chem-as'
    const paper4Id = 'p4-chem-a2'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Chemistry', code: '9701', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-staged-chem',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'staged',
                target_grade: 'A*',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [
              { user_subject_id: 'us-staged-chem', subject_paper_id: paper1Id, stage: 'as' },
              { user_subject_id: 'us-staged-chem', subject_paper_id: paper4Id, stage: 'a2' },
            ],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'staged',
                subject_route_papers: [
                  { subject_paper_id: paper1Id, stage: 'as' },
                  { subject_paper_id: paper4Id, stage: 'a2' },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [
              { id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1 (AS)' },
              { id: paper4Id, subject_id: subjectId, paper_number: 4, name: 'Paper 4 (A2)' },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'S3',
                route_type: 'staged',
                qualification_level: 'a_level',
                maximum_mark: 260,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'A*', threshold_mark: 227 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'carry_forward',
                stage: 'as',
                weighting_factor: 1.0,
                carry_forward_mapping_status: 'approved',
              },
              {
                combination_id: combId,
                token_position: 2,
                token_kind: 'component_variant',
                stage: 'a2',
                weighting_factor: null, // MISSING WEIGHTING FACTOR
                resolved_component_variant_id: 'var-42',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-42',
                publication_id: pubId,
                component_code: '42',
                raw_maximum_mark: 100,
                subject_paper_id: paper4Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 60 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper4Id]: '42' },
    })

    // Returns missing-weighting status, NOT impossible-target
    expect(plan.status).toBe('missing-weighting')
    if (plan.status === 'missing-weighting') {
      expect(plan.summary.officialCombinedTarget).toBe(227)
      expect(plan.summary.stagedBreakdown).not.toBeNull()
      expect(plan.summary.stagedBreakdown?.kind).toBe('estimated_halfway')

      if (plan.summary.stagedBreakdown?.kind === 'estimated_halfway') {
        expect(plan.summary.stagedBreakdown.estimatedAsContribution).toBe(114) // ceil(227 / 2)
        expect(plan.summary.stagedBreakdown.remainingA2Required).toBe(113)      // 227 - 114
        // Capacity and viability explicitly unavailable: null, never 0 or false
        expect(plan.summary.stagedBreakdown.a2MaximumWeightedMark).toBeNull()
        expect(plan.summary.stagedBreakdown.isMathematicallyPossible).toBeNull()
      }

      // Per-paper allocation disabled and no paper targets invented
      expect(plan.summary.perPaperAllocationEligible).toBe(false)
      expect(plan.paperPlans.length).toBe(1)
      expect(plan.paperPlans[0].isAllocationAvailable).toBe(false)
      expect(plan.paperPlans[0].requiredMark).toBeNull()
    }
  })

  it('produces unknown capacity rather than false impossibility when raw maximum mark is missing on staged route', async () => {
    const pubId = 'pub-chem-2026'
    const routeId = 'route-staged-chem'
    const combId = 'comb-staged-s3'
    const paper1Id = 'p1-chem-as'
    const paper4Id = 'p4-chem-a2'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Chemistry', code: '9701', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-staged-chem',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'staged',
                target_grade: 'A*',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [
              { user_subject_id: 'us-staged-chem', subject_paper_id: paper1Id, stage: 'as' },
              { user_subject_id: 'us-staged-chem', subject_paper_id: paper4Id, stage: 'a2' },
            ],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'staged',
                subject_route_papers: [
                  { subject_paper_id: paper1Id, stage: 'as' },
                  { subject_paper_id: paper4Id, stage: 'a2' },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [
              { id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1 (AS)' },
              { id: paper4Id, subject_id: subjectId, paper_number: 4, name: 'Paper 4 (A2)' },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'S3',
                route_type: 'staged',
                qualification_level: 'a_level',
                maximum_mark: 260,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'A*', threshold_mark: 227 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'carry_forward',
                stage: 'as',
                weighting_factor: 1.0,
                carry_forward_mapping_status: 'approved',
              },
              {
                combination_id: combId,
                token_position: 2,
                token_kind: 'component_variant',
                stage: 'a2',
                weighting_factor: 1.0, // Weighting is present
                resolved_component_variant_id: 'var-42',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-42',
                publication_id: pubId,
                component_code: '42',
                raw_maximum_mark: null, // MISSING RAW MAXIMUM MARK
                subject_paper_id: paper4Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 60 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper4Id]: '42' },
    })

    // Returns threshold-unavailable, NOT available, missing-weighting, or impossible-target
    expect(plan.status).toBe('threshold-unavailable')
    expect(plan.status).not.toBe('available')
    expect(plan.status).not.toBe('missing-weighting')
    expect(plan.status).not.toBe('impossible-target')
    if (plan.status === 'threshold-unavailable') {
      expect(plan.message).toContain('Official Cambridge maximum mark data is unavailable')
      expect(plan.reason).toContain('Official maximum mark missing or invalid')
    }
  })

  it('returns threshold-unavailable reporting grade A floor when component threshold is missing on staged A* route', async () => {
    const pubId = 'pub-chem-2026'
    const routeId = 'route-staged-chem'
    const combId = 'comb-staged-s3'
    const paper1Id = 'p1-chem-as'
    const paper4Id = 'p4-chem-a2'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Chemistry', code: '9701', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-staged-chem',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'staged',
                target_grade: 'A*',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [
              { user_subject_id: 'us-staged-chem', subject_paper_id: paper1Id, stage: 'as' },
              { user_subject_id: 'us-staged-chem', subject_paper_id: paper4Id, stage: 'a2' },
            ],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'staged',
                subject_route_papers: [
                  { subject_paper_id: paper1Id, stage: 'as' },
                  { subject_paper_id: paper4Id, stage: 'a2' },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [
              { id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1 (AS)' },
              { id: paper4Id, subject_id: subjectId, paper_number: 4, name: 'Paper 4 (A2)' },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'S3',
                route_type: 'staged',
                qualification_level: 'a_level',
                maximum_mark: 260,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'A*', threshold_mark: 227 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'carry_forward',
                stage: 'as',
                weighting_factor: 1.0,
                carry_forward_mapping_status: 'approved',
              },
              {
                combination_id: combId,
                token_position: 2,
                token_kind: 'component_variant',
                stage: 'a2',
                weighting_factor: 1.0,
                resolved_component_variant_id: 'var-42',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-42',
                publication_id: pubId,
                component_code: '42',
                raw_maximum_mark: 125, // Valid raw maximum
                subject_paper_id: paper4Id,
                grade_threshold_component_marks: [], // MISSING FLOOR MARK FOR GRADE A
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper4Id]: '42' },
    })

    // Returns threshold-unavailable reporting grade A floor, NOT grade A*
    expect(plan.status).toBe('threshold-unavailable')
    if (plan.status === 'threshold-unavailable') {
      expect(plan.message).toContain('grade A')
      expect(plan.message).not.toContain('grade A*')
      expect(plan.reason).toContain('grade A')
      expect(plan.reason).not.toContain('grade A*')
    }
  })

  it('threshold-unavailable takes precedence when weighting and raw maximum mark are both missing', async () => {
    const pubId = 'pub-chem-2026'
    const routeId = 'route-staged-chem'
    const combId = 'comb-staged-s3'
    const paper1Id = 'p1-chem-as'
    const paper4Id = 'p4-chem-a2'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Chemistry', code: '9701', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-staged-chem',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'staged',
                target_grade: 'A*',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [
              { user_subject_id: 'us-staged-chem', subject_paper_id: paper1Id, stage: 'as' },
              { user_subject_id: 'us-staged-chem', subject_paper_id: paper4Id, stage: 'a2' },
            ],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'staged',
                subject_route_papers: [
                  { subject_paper_id: paper1Id, stage: 'as' },
                  { subject_paper_id: paper4Id, stage: 'a2' },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [
              { id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1 (AS)' },
              { id: paper4Id, subject_id: subjectId, paper_number: 4, name: 'Paper 4 (A2)' },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'S3',
                route_type: 'staged',
                qualification_level: 'a_level',
                maximum_mark: 260,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'A*', threshold_mark: 227 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'carry_forward',
                stage: 'as',
                weighting_factor: null, // MISSING WEIGHTING
                carry_forward_mapping_status: 'approved',
              },
              {
                combination_id: combId,
                token_position: 2,
                token_kind: 'component_variant',
                stage: 'a2',
                weighting_factor: null, // MISSING WEIGHTING
                resolved_component_variant_id: 'var-42',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-42',
                publication_id: pubId,
                component_code: '42',
                raw_maximum_mark: null, // MISSING RAW MAXIMUM TOO
                subject_paper_id: paper4Id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 60 }],
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper4Id]: '42' },
    })

    // Precedence: threshold-unavailable takes precedence over missing-weighting
    expect(plan.status).toBe('threshold-unavailable')
    expect(plan.status).not.toBe('missing-weighting')
    if (plan.status === 'threshold-unavailable') {
      expect(plan.message).toContain('Official Cambridge maximum mark data is unavailable')
      expect(plan.reason).toContain('Official maximum mark missing or invalid')
    }
  })

  it('threshold-unavailable takes precedence when weighting and component floor are both missing, without returning available plan or zero capacity', async () => {
    const pubId = 'pub-chem-2026'
    const routeId = 'route-staged-chem'
    const combId = 'comb-staged-s3'
    const paper1Id = 'p1-chem-as'
    const paper4Id = 'p4-chem-a2'

    mockFrom.mockImplementation((table: string) => {
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (table === 'subjects') {
            return Promise.resolve({
              data: { id: subjectId, name: 'Chemistry', code: '9701', color_hex: '#10b981' },
              error: null,
            })
          }
          if (table === 'user_subjects') {
            return Promise.resolve({
              data: {
                id: 'us-staged-chem',
                user_id: currentUserId,
                subject_id: subjectId,
                study_route: 'staged',
                target_grade: 'A*',
                exam_date: '2026-06-01',
              },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      if (table === 'subject_paper_selections') {
        builder.then = (r) =>
          r({
            data: [
              { user_subject_id: 'us-staged-chem', subject_paper_id: paper1Id, stage: 'as' },
              { user_subject_id: 'us-staged-chem', subject_paper_id: paper4Id, stage: 'a2' },
            ],
            error: null,
          })
      } else if (table === 'subject_valid_routes') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: routeId,
                subject_id: subjectId,
                route: 'staged',
                subject_route_papers: [
                  { subject_paper_id: paper1Id, stage: 'as' },
                  { subject_paper_id: paper4Id, stage: 'a2' },
                ],
              },
            ],
            error: null,
          })
      } else if (table === 'subject_papers') {
        builder.then = (r) =>
          r({
            data: [
              { id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1 (AS)' },
              { id: paper4Id, subject_id: subjectId, paper_number: 4, name: 'Paper 4 (A2)' },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_publications') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: pubId,
                subject_id: subjectId,
                exam_year: 2026,
                exam_series: 'june',
                publication_status: 'published',
                is_active: true,
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_combinations') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: combId,
                publication_id: pubId,
                canonical_key: 'S3',
                route_type: 'staged',
                qualification_level: 'a_level',
                maximum_mark: 260,
                per_paper_allocation_eligible: true,
                atlas_route_id: routeId,
                planner_eligibility: 'eligible',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_marks') {
        builder.then = (r) =>
          r({
            data: [{ combination_id: combId, grade: 'A*', threshold_mark: 227 }],
            error: null,
          })
      } else if (table === 'grade_threshold_combination_tokens') {
        builder.then = (r) =>
          r({
            data: [
              {
                combination_id: combId,
                token_position: 1,
                token_kind: 'carry_forward',
                stage: 'as',
                weighting_factor: null, // MISSING WEIGHTING
                carry_forward_mapping_status: 'approved',
              },
              {
                combination_id: combId,
                token_position: 2,
                token_kind: 'component_variant',
                stage: 'a2',
                weighting_factor: null, // MISSING WEIGHTING
                resolved_component_variant_id: 'var-42',
              },
            ],
            error: null,
          })
      } else if (table === 'grade_threshold_component_variants') {
        builder.then = (r) =>
          r({
            data: [
              {
                id: 'var-42',
                publication_id: pubId,
                component_code: '42',
                raw_maximum_mark: 125,
                subject_paper_id: paper4Id,
                grade_threshold_component_marks: [], // MISSING COMPONENT FLOOR TOO
              },
            ],
            error: null,
          })
      } else if (table === 'published_grade_threshold_variant_benchmarks') {
        builder.then = (r) =>
          r({
            data: [],
            error: null,
          })
      }

      return builder
    })

    const plan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper4Id]: '42' },
    })

    // Precedence: threshold-unavailable takes precedence over missing-weighting
    expect(plan.status).toBe('threshold-unavailable')
    expect(plan.status).not.toBe('missing-weighting')
    expect(plan.status).not.toBe('available')
    if (plan.status === 'threshold-unavailable') {
      expect(plan.message).toContain('Official Cambridge threshold mark for grade A is unavailable')
      expect(plan.reason).toContain('Official component threshold mark for grade A is missing')
      // No calculated plan, summary, or capacity exposed
      expect((plan as Record<string, unknown>).summary).toBeUndefined()
      expect((plan as Record<string, unknown>).paperPlans).toBeUndefined()
    }
  })

  it('correctly handles fully weighted viable and impossible staged A* routes', async () => {
    const pubId = 'pub-chem-2026'
    const routeId = 'route-staged-chem'
    const combId = 'comb-staged-s3'
    const paper1Id = 'p1-chem-as'
    const paper4Id = 'p4-chem-a2'

    const createMock = (rawMax: number) => {
      return (table: string) => {
        const builder: MockQueryBuilder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            if (table === 'subjects') {
              return Promise.resolve({
                data: { id: subjectId, name: 'Chemistry', code: '9701', color_hex: '#10b981' },
                error: null,
              })
            }
            if (table === 'user_subjects') {
              return Promise.resolve({
                data: {
                  id: 'us-staged-chem',
                  user_id: currentUserId,
                  subject_id: subjectId,
                  study_route: 'staged',
                  target_grade: 'A*',
                  exam_date: '2026-06-01',
                },
                error: null,
              })
            }
            return Promise.resolve({ data: null, error: null })
          }),
          range: vi.fn().mockResolvedValue({ data: [], error: null }),
        }

        if (table === 'subject_paper_selections') {
          builder.then = (r) =>
            r({
              data: [
                { user_subject_id: 'us-staged-chem', subject_paper_id: paper1Id, stage: 'as' },
                { user_subject_id: 'us-staged-chem', subject_paper_id: paper4Id, stage: 'a2' },
              ],
              error: null,
            })
        } else if (table === 'subject_valid_routes') {
          builder.then = (r) =>
            r({
              data: [
                {
                  id: routeId,
                  subject_id: subjectId,
                  route: 'staged',
                  subject_route_papers: [
                    { subject_paper_id: paper1Id, stage: 'as' },
                    { subject_paper_id: paper4Id, stage: 'a2' },
                  ],
                },
              ],
              error: null,
            })
        } else if (table === 'subject_papers') {
          builder.then = (r) =>
            r({
              data: [
                { id: paper1Id, subject_id: subjectId, paper_number: 1, name: 'Paper 1 (AS)' },
                { id: paper4Id, subject_id: subjectId, paper_number: 4, name: 'Paper 4 (A2)' },
              ],
              error: null,
            })
        } else if (table === 'grade_threshold_publications') {
          builder.then = (r) =>
            r({
              data: [
                {
                  id: pubId,
                  subject_id: subjectId,
                  exam_year: 2026,
                  exam_series: 'june',
                  publication_status: 'published',
                  is_active: true,
                },
              ],
              error: null,
            })
        } else if (table === 'published_grade_threshold_combinations') {
          builder.then = (r) =>
            r({
              data: [
                {
                  id: combId,
                  publication_id: pubId,
                  canonical_key: 'S3',
                  route_type: 'staged',
                  qualification_level: 'a_level',
                  maximum_mark: 260,
                  per_paper_allocation_eligible: true,
                  atlas_route_id: routeId,
                  planner_eligibility: 'eligible',
                },
              ],
              error: null,
            })
        } else if (table === 'grade_threshold_combination_marks') {
          builder.then = (r) =>
            r({
              data: [{ combination_id: combId, grade: 'A*', threshold_mark: 227 }],
              error: null,
            })
        } else if (table === 'grade_threshold_combination_tokens') {
          builder.then = (r) =>
            r({
              data: [
                {
                  combination_id: combId,
                  token_position: 1,
                  token_kind: 'carry_forward',
                  stage: 'as',
                  weighting_factor: 1.0,
                  carry_forward_mapping_status: 'approved',
                },
                {
                  combination_id: combId,
                  token_position: 2,
                  token_kind: 'component_variant',
                  stage: 'a2',
                  weighting_factor: 1.0,
                  resolved_component_variant_id: 'var-42',
                },
              ],
              error: null,
            })
        } else if (table === 'grade_threshold_component_variants') {
          builder.then = (r) =>
            r({
              data: [
                {
                  id: 'var-42',
                  publication_id: pubId,
                  component_code: '42',
                  raw_maximum_mark: rawMax,
                  subject_paper_id: paper4Id,
                  grade_threshold_component_marks: [{ grade: 'A', threshold_mark: 60 }],
                },
              ],
              error: null,
            })
        } else if (table === 'published_grade_threshold_variant_benchmarks') {
          builder.then = (r) =>
            r({
              data: [],
              error: null,
            })
        }

        return builder
      }
    }

    // 1. Viable route (capacity 125 >= remaining 113)
    mockFrom.mockImplementation(createMock(125))
    const viablePlan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper4Id]: '42' },
    })

    expect(viablePlan.status).toBe('available')
    if (viablePlan.status === 'available') {
      expect(viablePlan.summary.stagedBreakdown?.a2MaximumWeightedMark).toBe(125)
      expect(viablePlan.summary.stagedBreakdown?.isMathematicallyPossible).toBe(true)
      expect(viablePlan.summary.perPaperAllocationEligible).toBe(true)
    }

    // 2. Impossible route (capacity 100 < remaining 113)
    mockFrom.mockImplementation(createMock(100))
    const impossiblePlan = await getTargetGradePlan(subjectId, {
      selectedVariants: { [paper4Id]: '42' },
    })

    expect(impossiblePlan.status).toBe('impossible-target')
    if (impossiblePlan.status === 'impossible-target') {
      expect(impossiblePlan.summary.stagedBreakdown?.a2MaximumWeightedMark).toBe(100)
      expect(impossiblePlan.summary.stagedBreakdown?.isMathematicallyPossible).toBe(false)
      expect(impossiblePlan.reason).toContain('exceeds the maximum possible score')
    }
  })

  // ─── 11. Five-subject June 2026 completeness: 9231 Further Maths & 9618 CS ─
  it('computes eligible AS and full-level paper-by-paper gap plans for Further Mathematics 9231 and Computer Science 9618', async () => {
    const createSubjectMock = (cfg: {
      subjectId: string
      subjectName: string
      subjectCode: string
      routeId: string
      studyRoute: 'as_only' | 'full_level'
      targetGrade: 'A' | 'A*'
      combId: string
      canonicalKey: string
      qualificationLevel: 'as' | 'a_level'
      combMax: number
      targetThreshold: number
      papers: Array<{ id: string; num: number; name: string; stage: 'as' | 'a2'; code: string; rawMax: number; rawA: number; weight: number }>
      attempts: Array<{ paperId: string; paperNum: number; scoreRaw: number; scoreMax: number }>
    }) => {
      return (table: string) => {
        const builder: MockQueryBuilder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockImplementation(() => {
            if (table === 'published_grade_threshold_combinations') {
              return Promise.resolve({
                data: {
                  id: cfg.combId,
                  publication_id: `pub-${cfg.subjectCode}`,
                  canonical_key: cfg.canonicalKey,
                  qualification_level: cfg.qualificationLevel,
                  route_type: cfg.studyRoute,
                  maximum_mark: cfg.combMax,
                  weighting_basis: 'weighted_total',
                  per_paper_allocation_eligible: true,
                  atlas_route_id: cfg.routeId,
                  planner_eligibility: 'eligible',
                },
                error: null,
              })
            }
            return Promise.resolve({ data: null, error: null })
          }),
          single: vi.fn().mockImplementation(() => {
            if (table === 'subjects') {
              return Promise.resolve({
                data: { id: cfg.subjectId, name: cfg.subjectName, code: cfg.subjectCode, color_hex: '#6366f1' },
                error: null,
              })
            }
            if (table === 'user_subjects') {
              return Promise.resolve({
                data: {
                  id: `us-${cfg.subjectCode}`,
                  user_id: currentUserId,
                  subject_id: cfg.subjectId,
                  study_route: cfg.studyRoute,
                  target_grade: cfg.targetGrade,
                  exam_date: '2026-06-01',
                },
                error: null,
              })
            }
            return Promise.resolve({ data: null, error: null })
          }),
          range: vi.fn().mockImplementation((from: number) => {
            if (table === 'past_papers') {
              return Promise.resolve({
                data:
                  from === 0
                    ? cfg.attempts.map((a, idx) => ({
                        id: `att-${cfg.subjectCode}-${idx}`,
                        subject_id: cfg.subjectId,
                        subject_paper_id: a.paperId,
                        paper_number: a.paperNum,
                        year: 2025,
                        session: 'may_jun',
                        stage: cfg.papers.find((p) => p.id === a.paperId)?.stage ?? 'as',
                        attempted_at: '2025-10-01',
                        created_at: '2025-10-01T10:00:00Z',
                        score_raw: a.scoreRaw,
                        score_max: a.scoreMax,
                      }))
                    : [],
                error: null,
              })
            }
            return Promise.resolve({ data: [], error: null })
          }),
          then: undefined,
        }

        if (table === 'subject_valid_routes') {
          builder.then = (r) =>
            r({
              data: [
                {
                  id: cfg.routeId,
                  subject_id: cfg.subjectId,
                  route: cfg.studyRoute,
                  subject_route_papers: cfg.papers.map((p) => ({
                    subject_paper_id: p.id,
                    stage: p.stage,
                  })),
                },
              ],
              error: null,
            })
        } else if (table === 'subject_paper_selections') {
          builder.then = (r) =>
            r({
              data: cfg.papers.map((p) => ({
                user_subject_id: `us-${cfg.subjectCode}`,
                subject_paper_id: p.id,
                stage: p.stage,
              })),
              error: null,
            })
        } else if (table === 'subject_papers') {
          builder.then = (r) =>
            r({
              data: cfg.papers.map((p) => ({
                id: p.id,
                subject_id: cfg.subjectId,
                paper_number: p.num,
                name: p.name,
              })),
              error: null,
            })
        } else if (table === 'grade_threshold_publications') {
          builder.then = (r) =>
            r({
              data: [
                {
                  id: `pub-${cfg.subjectCode}`,
                  subject_id: cfg.subjectId,
                  exam_year: 2026,
                  exam_series: 'june',
                  publication_status: 'published',
                  is_active: true,
                },
              ],
              error: null,
            })
        } else if (table === 'published_grade_threshold_combinations') {
          builder.then = (r) =>
            r({
              data: [
                {
                  id: cfg.combId,
                  publication_id: `pub-${cfg.subjectCode}`,
                  canonical_key: cfg.canonicalKey,
                  qualification_level: cfg.qualificationLevel,
                  route_type: cfg.studyRoute,
                  maximum_mark: cfg.combMax,
                  weighting_basis: 'weighted_total',
                  per_paper_allocation_eligible: true,
                  atlas_route_id: cfg.routeId,
                  planner_eligibility: 'eligible',
                },
              ],
              error: null,
            })
        } else if (table === 'grade_threshold_combination_marks') {
          const markGrade = cfg.qualificationLevel === 'as' ? cfg.targetGrade.toLowerCase() : cfg.targetGrade
          builder.then = (r) =>
            r({
              data: [{ combination_id: cfg.combId, grade: markGrade, threshold_mark: cfg.targetThreshold }],
              error: null,
            })
        } else if (table === 'grade_threshold_combination_tokens') {
          builder.then = (r) =>
            r({
              data: cfg.papers.map((p, idx) => ({
                combination_id: cfg.combId,
                token_position: idx + 1,
                token_kind: 'component_variant',
                stage: p.stage,
                weighting_factor: p.weight,
                resolved_component_variant_id: `var-${cfg.subjectCode}-${p.code}`,
              })),
              error: null,
            })
        } else if (table === 'grade_threshold_component_variants') {
          builder.then = (r) =>
            r({
              data: cfg.papers.map((p) => ({
                id: `var-${cfg.subjectCode}-${p.code}`,
                publication_id: `pub-${cfg.subjectCode}`,
                component_code: p.code,
                raw_maximum_mark: p.rawMax,
                subject_paper_id: p.id,
                grade_threshold_component_marks: [{ grade: 'A', threshold_mark: p.rawA }],
              })),
              error: null,
            })
        } else if (table === 'published_grade_threshold_variant_benchmarks') {
          builder.then = (r) => r({ data: [], error: null })
        }
        return builder
      }
    }

    // 9231 Further Mathematics Full A-Level Linear (AY: 12, 22, 32, 42 -> 250 max, A* = 216)
    mockFrom.mockImplementation(
      createSubjectMock({
        subjectId: 'subj-9231',
        subjectName: 'Further Mathematics',
        subjectCode: '9231',
        routeId: 'route-9231-full',
        studyRoute: 'full_level',
        targetGrade: 'A*',
        combId: 'comb-9231-ay',
        canonicalKey: 'AY',
        qualificationLevel: 'a_level',
        combMax: 250,
        targetThreshold: 216,
        papers: [
          { id: 'sp-9231-1', num: 1, name: 'Further Pure 1', stage: 'as', code: '12', rawMax: 75, rawA: 64, weight: 1 },
          { id: 'sp-9231-2', num: 2, name: 'Further Pure 2', stage: 'a2', code: '22', rawMax: 75, rawA: 56, weight: 1 },
          { id: 'sp-9231-3', num: 3, name: 'Further Mechanics', stage: 'as', code: '32', rawMax: 50, rawA: 37, weight: 1 },
          { id: 'sp-9231-4', num: 4, name: 'Further Prob & Stats', stage: 'a2', code: '42', rawMax: 50, rawA: 39, weight: 1 },
        ],
        attempts: [{ paperId: 'sp-9231-1', paperNum: 12, scoreRaw: 60, scoreMax: 75 }],
      }),
    )
    const fmPlan = await getTargetGradePlan('subj-9231', {
      selectedVariants: {
        'sp-9231-1': '12',
        'sp-9231-2': '22',
        'sp-9231-3': '32',
        'sp-9231-4': '42',
      },
    })
    expect(fmPlan.status).toBe('available')
    if (fmPlan.status === 'available') {
      expect(fmPlan.summary.targetGrade).toBe('A*')
      expect(fmPlan.paperPlans).toHaveLength(4)
      expect(fmPlan.paperPlans[0]?.evidence.latestRawScore).toBe(60)
      expect(fmPlan.paperPlans[0]?.requiredMark).toBeGreaterThanOrEqual(64)
      expect(fmPlan.paperPlans[0]?.latestGap).toBeGreaterThanOrEqual(4)
    }

    // 9618 Computer Science AS Only (SY: 12, 22 -> 150 max, A = 109)
    mockFrom.mockImplementation(
      createSubjectMock({
        subjectId: 'subj-9618',
        subjectName: 'Computer Science',
        subjectCode: '9618',
        routeId: 'route-9618-as',
        studyRoute: 'as_only',
        targetGrade: 'A',
        combId: 'comb-9618-sy',
        canonicalKey: 'SY',
        qualificationLevel: 'as',
        combMax: 150,
        targetThreshold: 109,
        papers: [
          { id: 'sp-9618-1', num: 1, name: 'Theory Fundamentals', stage: 'as', code: '12', rawMax: 75, rawA: 56, weight: 1 },
          { id: 'sp-9618-2', num: 2, name: 'Fundamental Problem-solving', stage: 'as', code: '22', rawMax: 75, rawA: 53, weight: 1 },
        ],
        attempts: [
          { paperId: 'sp-9618-1', paperNum: 12, scoreRaw: 50, scoreMax: 75 },
          { paperId: 'sp-9618-2', paperNum: 22, scoreRaw: 55, scoreMax: 75 },
        ],
      }),
    )
    const csPlan = await getTargetGradePlan('subj-9618', {
      selectedVariants: {
        'sp-9618-1': '12',
        'sp-9618-2': '22',
      },
    })
    expect(csPlan.status).toBe('available')
    if (csPlan.status === 'available') {
      expect(csPlan.summary.targetGrade).toBe('A')
      expect(csPlan.paperPlans).toHaveLength(2)
      expect(csPlan.paperPlans.reduce((s, p) => s + (p.requiredMark ?? 0), 0)).toBeGreaterThanOrEqual(109)
    }

    // Withheld staged / special option for 9618 (published view yields no eligible combination -> missing-official-thresholds)
    mockFrom.mockImplementation((table: string) => {
      const base = createSubjectMock({
        subjectId: 'subj-9618',
        subjectName: 'Computer Science',
        subjectCode: '9618',
        routeId: 'route-9618-as',
        studyRoute: 'as_only',
        targetGrade: 'A',
        combId: 'comb-9618-sy',
        canonicalKey: 'SY',
        qualificationLevel: 'as',
        combMax: 150,
        targetThreshold: 109,
        papers: [
          { id: 'sp-9618-1', num: 1, name: 'Theory Fundamentals', stage: 'as', code: '12', rawMax: 75, rawA: 56, weight: 1 },
          { id: 'sp-9618-2', num: 2, name: 'Fundamental Problem-solving', stage: 'as', code: '22', rawMax: 75, rawA: 53, weight: 1 },
        ],
        attempts: [],
      })(table)
      if (table === 'published_grade_threshold_combinations') {
        base.then = (r) => r({ data: [], error: null })
      }
      return base
    })
    const withheldCs = await getTargetGradePlan('subj-9618')
    expect(withheldCs.status).toBe('threshold-unavailable')
  })
})
