import { beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

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

import { getTargetGradePlan } from '@/lib/actions/target-planner'
import { evaluateStagedAStar, weightedMark } from '@/lib/planner'
import type { TargetGrade } from '@/types/database'

const UUID_NS_OID = '6ba7b812-9dad-11d1-80b4-00c04fd430c8'

function uuidv5Oid(name: string): string {
  const nsBytes = Buffer.from(UUID_NS_OID.replace(/-/g, ''), 'hex')
  const hash = crypto.createHash('sha1').update(nsBytes).update(name, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

interface StagedRouteSpec {
  subjectCode: '9709' | '9231' | '9701' | '9702' | '9618'
  subjectName: string
  pubId: string
  routeKey: string
  routeSeedName: string
  asPaperNums: number[]
  a2PaperNums: number[]
  juneKey: string
  novKey: string
  exactVariants: Record<number, string>
}

const STAGED_ROUTES: StagedRouteSpec[] = [
  {
    subjectCode: '9709',
    subjectName: 'Mathematics',
    pubId: '00000000-0000-4000-8000-000000000023',
    routeKey: 'mech_stats',
    routeSeedName: 'svr-9709-staged-mech-stats',
    asPaperNums: [1, 4],
    a2PaperNums: [3, 5],
    juneKey: '35,55,82',
    novKey: '35,55,92',
    exactVariants: { 3: '35', 5: '55' },
  },
  {
    subjectCode: '9709',
    subjectName: 'Mathematics',
    pubId: '00000000-0000-4000-8000-000000000023',
    routeKey: 'stats_mech',
    routeSeedName: 'svr-9709-staged-stats-mech',
    asPaperNums: [1, 5],
    a2PaperNums: [3, 4],
    juneKey: '35,45,83',
    novKey: '35,45,93',
    exactVariants: { 3: '35', 4: '45' },
  },
  {
    subjectCode: '9709',
    subjectName: 'Mathematics',
    pubId: '00000000-0000-4000-8000-000000000023',
    routeKey: 'stats_double',
    routeSeedName: 'svr-9709-staged-stats-double',
    asPaperNums: [1, 5],
    a2PaperNums: [3, 6],
    juneKey: '35,65,83',
    novKey: '35,65,93',
    exactVariants: { 3: '35', 6: '65' },
  },
  {
    subjectCode: '9231',
    subjectName: 'Further Mathematics',
    pubId: '00000000-0000-4000-8000-000000000024',
    routeKey: 'fm_fps',
    routeSeedName: 'svr-9231-staged-fm-fps',
    asPaperNums: [1, 3],
    a2PaperNums: [2, 4],
    juneKey: '24,44,62',
    novKey: '24,44,72',
    exactVariants: { 2: '24', 4: '44' },
  },
  {
    subjectCode: '9231',
    subjectName: 'Further Mathematics',
    pubId: '00000000-0000-4000-8000-000000000024',
    routeKey: 'fps_fm',
    routeSeedName: 'svr-9231-staged-fps-fm',
    asPaperNums: [1, 4],
    a2PaperNums: [2, 3],
    juneKey: '24,34,63',
    novKey: '24,34,73',
    exactVariants: { 2: '24', 3: '34' },
  },
  {
    subjectCode: '9701',
    subjectName: 'Chemistry',
    pubId: '00000000-0000-4000-8000-000000000021',
    routeKey: 'standard',
    routeSeedName: 'svr-9701-staged',
    asPaperNums: [1, 2, 3],
    a2PaperNums: [4, 5],
    juneKey: '44,54,62',
    novKey: '44,54,72',
    exactVariants: { 4: '44', 5: '54' },
  },
  {
    subjectCode: '9702',
    subjectName: 'Physics',
    pubId: '00000000-0000-4000-8000-000000000022',
    routeKey: 'standard',
    routeSeedName: 'svr-9702-staged',
    asPaperNums: [1, 2, 3],
    a2PaperNums: [4, 5],
    juneKey: '44,54,62',
    novKey: '44,54,72',
    exactVariants: { 4: '44', 5: '54' },
  },
  {
    subjectCode: '9618',
    subjectName: 'Computer Science',
    pubId: '00000000-0000-4000-8000-000000000025',
    routeKey: 'standard',
    routeSeedName: 'svr-9618-staged',
    asPaperNums: [1, 2],
    a2PaperNums: [3, 4],
    juneKey: '33,43,89',
    novKey: '33,43,98',
    exactVariants: { 3: '33', 4: '43' },
  },
]

const ALL_GRADES: TargetGrade[] = ['A*', 'A', 'B', 'C', 'D', 'E']

function loadSeedForStagedTests() {
  const seedSql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/seeds/catalogue/june_2026_m5_catalogue.sql'),
    'utf8'
  )

  const variants = new Map<
    string,
    { id: string; publication_id: string; component_code: string; raw_maximum_mark: number; subject_paper_id: string | null }
  >()
  for (const m of seedSql.matchAll(
    /\('([0-9a-f-]{36})',\s*'(00000000-0000-4000-8000-00000000002[1-5])',\s*'([^']+)',\s*(\d+),\s*(NULL|'([0-9a-f-]{36})'::uuid)/g
  )) {
    variants.set(m[1], {
      id: m[1],
      publication_id: m[2],
      component_code: m[3],
      raw_maximum_mark: Number(m[4]),
      subject_paper_id: m[6] ?? null,
    })
  }

  const compMarks = new Map<string, Array<{ grade: string; threshold_mark: number }>>()
  for (const m of seedSql.matchAll(/\('([0-9a-f-]{36})',\s*'([A-E])',\s*(\d+)\)/g)) {
    const arr = compMarks.get(m[1]) ?? []
    arr.push({ grade: m[2], threshold_mark: Number(m[3]) })
    compMarks.set(m[1], arr)
  }

  const combinations: Array<{
    id: string
    publication_id: string
    canonical_key: string
    qualification_level: string
    route_type: string
    maximum_mark: number
    planner_eligibility: string
    atlas_route_id: string | null
  }> = []
  for (const m of seedSql.matchAll(
    /\('([0-9a-f-]{36})',\s*'(00000000-0000-4000-8000-00000000002[1-5])',\s*'([^']+)',\s*'[^']+',\s*'[^']+',\s*'(as|a_level)',\s*'(as_only|full_level|staged|other)',\s*(\d+),\s*'[^']+',\s*'(eligible|unreviewed|unsupported)',\s*(NULL|'([0-9a-f-]{36})'::uuid)/g
  )) {
    combinations.push({
      id: m[1],
      publication_id: m[2],
      canonical_key: m[3],
      qualification_level: m[4],
      route_type: m[5],
      maximum_mark: Number(m[6]),
      planner_eligibility: m[7],
      atlas_route_id: m[9] ?? null,
    })
  }

  const combMarks: Array<{ combination_id: string; grade: string; threshold_mark: number }> = []
  for (const m of seedSql.matchAll(/\('([0-9a-f-]{36})',\s*'([0-9a-f-]{36})',\s*'([A-Ea-e*]+)',\s*(\d+)\)/g)) {
    combMarks.push({
      combination_id: m[2],
      grade: m[3],
      threshold_mark: Number(m[4]),
    })
  }

  const combTokens: Array<{
    id: string
    combination_id: string
    token_position: number
    raw_token: string
    token_kind: string
    stage: string
    resolved_component_variant_id: string | null
    maximum_mark: number | null
    weighting_factor: number | null
    carry_forward_mapping_status: string | null
  }> = []
  for (const m of seedSql.matchAll(
    /\('([0-9a-f-]{36})',\s*'([0-9a-f-]{36})',\s*(\d+),\s*'([^']+)',\s*'(component_variant|carry_forward)',\s*'(as|a2)',\s*(NULL|'([0-9a-f-]{36})'::uuid),\s*(NULL|\d+),\s*(NULL|[0-9.]+),\s*(NULL|'([0-9a-f-]{36})'),\s*(NULL|'([^']+)')/g
  )) {
    combTokens.push({
      id: m[1],
      combination_id: m[2],
      token_position: Number(m[3]),
      raw_token: m[4],
      token_kind: m[5],
      stage: m[6],
      resolved_component_variant_id: m[8] ?? null,
      maximum_mark: m[9] === 'NULL' ? null : Number(m[9]),
      weighting_factor: m[10] === 'NULL' ? null : Number(m[10]),
      carry_forward_mapping_status: m[13] ?? null,
    })
  }

  return { variants, compMarks, combinations, combMarks, combTokens }
}

const seed = loadSeedForStagedTests()

function setupMockForStagedRoute(
  spec: StagedRouteSpec,
  targetGrade: TargetGrade,
  opts: {
    simulateApprovedZone5?: boolean
    missingWeighting?: boolean
    missingA2Weighting?: boolean
    onlyJuneMapping?: boolean
    cfWeightingOverride?: { maximum_mark?: number | null; weighting_factor?: number | null }
    stageResults?: Array<Record<string, unknown>>
    stageResultsError?: string
    pastPapers?: Array<{ id: string; subject_id: string; subject_paper_id: string; paper_number: number; year: number; session: string; stage: string; attempted_at: string; created_at: string; score_raw: number; score_max: number }>
  } = {}
) {
  const subjectId = uuidv5Oid(`s-${spec.subjectCode}`)
  const routeId = uuidv5Oid(spec.routeSeedName)
  const enrollmentId = `us-${spec.subjectCode}-${spec.routeKey}`
  const routePapers = [
    ...spec.asPaperNums.map((p) => ({ subject_paper_id: uuidv5Oid(`sp-${spec.subjectCode}-${p}`), stage: 'as' as const, paper_number: p })),
    ...spec.a2PaperNums.map((p) => ({ subject_paper_id: uuidv5Oid(`sp-${spec.subjectCode}-${p}`), stage: 'a2' as const, paper_number: p })),
  ]

  const simulateApproved = opts.simulateApprovedZone5 ?? true
  const allowedKeys = new Set(opts.onlyJuneMapping ? [spec.juneKey] : [spec.juneKey, spec.novKey])

  mockFrom.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {}
    const inFilters: Record<string, unknown[]> = {}

    const resolveRows = (): { data: unknown[]; error: { message: string } | null } => {
      if (table === 'subjects') {
        return { data: [{ id: subjectId, name: spec.subjectName, code: spec.subjectCode, color_hex: '#3b82f6' }], error: null }
      }
      if (table === 'user_subjects') {
        return {
          data: [{
            id: enrollmentId,
            user_id: 'user-staged-1',
            subject_id: subjectId,
            study_route: 'staged',
            current_stage: 'a2',
            target_grade: targetGrade,
            exam_date: '2026-06-15',
          }],
          error: null,
        }
      }
      if (table === 'subject_paper_selections') {
        return { data: routePapers.map((rp) => ({ subject_paper_id: rp.subject_paper_id, stage: rp.stage })), error: null }
      }
      if (table === 'subject_valid_routes') {
        return {
          data: [{
            id: routeId,
            subject_id: subjectId,
            route: 'staged',
            subject_route_papers: routePapers.map((rp) => ({ subject_paper_id: rp.subject_paper_id, stage: rp.stage })),
          }],
          error: null,
        }
      }
      if (table === 'subject_papers') {
        return {
          data: routePapers.map((rp) => ({
            id: rp.subject_paper_id,
            subject_id: subjectId,
            paper_number: rp.paper_number,
            name: `Paper ${rp.paper_number}`,
          })),
          error: null,
        }
      }
      if (table === 'grade_threshold_publications') {
        return {
          data: [{
            id: spec.pubId,
            subject_id: subjectId,
            exam_year: 2026,
            exam_series: 'june',
            publication_status: 'published',
            is_active: true,
            official_index_url: 'https://www.cambridgeinternational.org/',
            official_pdf_url: 'https://www.cambridgeinternational.org/Images/test.pdf',
            official_published_on: '2026-08-10',
            published_at: '2026-08-11T00:00:00Z',
          }],
          error: null,
        }
      }
      if (table === 'published_grade_threshold_combinations') {
        if (!simulateApproved) return { data: [], error: null }
        return {
          data: seed.combinations
            .filter((c) => c.publication_id === spec.pubId && allowedKeys.has(c.canonical_key))
            .map((c) => ({
              ...c,
              atlas_route_id: routeId,
              planner_eligibility: 'eligible',
              per_paper_allocation_eligible: !opts.missingWeighting,
            })),
          error: null,
        }
      }
      if (table === 'published_grade_threshold_carry_forward_mappings') {
        if (!simulateApproved) return { data: [], error: null }
        const matchedCombs = seed.combinations.filter(
          (c) => c.publication_id === spec.pubId && allowedKeys.has(c.canonical_key)
        )
        return {
          data: matchedCombs.map((c) => {
            const cfTok = seed.combTokens.find(
              (t) => t.combination_id === c.id && t.token_kind === 'carry_forward'
            )
            const isJune = c.canonical_key === spec.juneKey
            return {
              combination_id: c.id,
              token_id: cfTok?.id ?? `tok-${c.id}`,
              entry_option_code: c.canonical_key,
              raw_carry_forward_token: cfTok?.raw_token ?? c.canonical_key.split(',').at(-1)!,
              carried_exam_year: 2025,
              carried_exam_series: isJune ? 'june' : 'november',
              carried_as_components: spec.asPaperNums.map((p) => String(p)),
            }
          }),
          error: null,
        }
      }
      if (table === 'grade_threshold_component_variants') {
        return {
          data: [...seed.variants.values()]
            .filter((v) => v.publication_id === spec.pubId)
            .map((v) => ({
              ...v,
              grade_threshold_component_marks: seed.compMarks.get(v.id) ?? [],
            })),
          error: null,
        }
      }
      if (table === 'published_grade_threshold_variant_benchmarks') {
        return { data: [], error: null }
      }
      if (table === 'grade_threshold_combination_marks') {
        return {
          data: seed.combMarks.filter(
            (m) => !inFilters['combination_id'] || inFilters['combination_id'].includes(m.combination_id)
          ),
          error: null,
        }
      }
      if (table === 'grade_threshold_combination_tokens') {
        return {
          data: seed.combTokens
            .filter((t) => !inFilters['combination_id'] || inFilters['combination_id'].includes(t.combination_id))
            .map((t) => {
              const isCf = t.token_kind === 'carry_forward'
              return {
                ...t,
                maximum_mark:
                  isCf && opts.cfWeightingOverride && 'maximum_mark' in opts.cfWeightingOverride
                    ? opts.cfWeightingOverride.maximum_mark
                    : t.maximum_mark,
                weighting_factor:
                  opts.missingWeighting || (!isCf && opts.missingA2Weighting)
                    ? null
                    : isCf && opts.cfWeightingOverride && 'weighting_factor' in opts.cfWeightingOverride
                      ? opts.cfWeightingOverride.weighting_factor
                      : t.weighting_factor,
                carry_forward_mapping_status:
                  isCf && simulateApproved ? 'approved' : t.carry_forward_mapping_status,
              }
            }),
          error: null,
        }
      }
      if (table === 'subject_stage_results') {
        if (opts.stageResultsError) {
          return { data: [], error: { message: opts.stageResultsError } }
        }
        return { data: opts.stageResults ?? [], error: null }
      }
      if (table === 'past_papers') {
        return { data: opts.pastPapers ?? [], error: null }
      }
      return { data: [], error: null }
    }

    const builder: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((col: string, val: unknown) => {
        filters[col] = val
        return builder
      }),
      in: vi.fn((col: string, vals: unknown[]) => {
        inFilters[col] = vals
        return builder
      }),
      order: vi.fn().mockReturnThis(),
      range: vi.fn(async () => resolveRows()),
      single: vi.fn(async () => {
        const res = resolveRows()
        return { data: res.data[0] ?? null, error: res.error }
      }),
      then: (resolve: (val: unknown) => void) => resolve(resolveRows()),
    }
    return builder
  })

  return { subjectId, routeId, enrollmentId }
}

describe('Staged Planner A* through E across all 8 routes and 5 subjects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-staged-1' } } })
  })

  it('evaluateStagedAStar handles estimated, verified above/below, zero remaining, and impossible A2 targets', () => {
    const est = evaluateStagedAStar({
      officialCombinedTarget: weightedMark(197),
      a2MaximumWeightedMark: weightedMark(125),
      carryForwardWeightingShare: 0.5,
    })
    expect(est.kind).toBe('estimated_halfway')
    expect(est.kind === 'estimated_halfway' && est.estimatedAsContribution).toBe(99)
    expect(est.remainingA2Required).toBe(98)
    expect(est.isMathematicallyPossible).toBe(true)

    const lowerActual = evaluateStagedAStar({
      officialCombinedTarget: weightedMark(197),
      a2MaximumWeightedMark: weightedMark(125),
      carryForwardWeightingShare: 0.5,
      verifiedAsContribution: {
        kind: 'verified_official_weighted_as_mark',
        weightedMark: weightedMark(65),
        maxWeightedMark: weightedMark(125),
      },
    })
    expect(lowerActual.kind).toBe('verified_official')
    expect(lowerActual.remainingA2Required).toBe(132)
    expect(lowerActual.isMathematicallyPossible).toBe(false)

    const metActual = evaluateStagedAStar({
      officialCombinedTarget: weightedMark(90),
      a2MaximumWeightedMark: weightedMark(125),
      carryForwardWeightingShare: 0.5,
      verifiedAsContribution: {
        kind: 'verified_official_weighted_as_mark',
        weightedMark: weightedMark(95),
        maxWeightedMark: weightedMark(125),
      },
    })
    expect(metActual.remainingA2Required).toBe(0)
    expect(metActual.isMathematicallyPossible).toBe(true)

    // Invalid or missing carryForwardWeightingShare must throw instead of assuming 0.5
    for (const invalidShare of [0, -0.5, 1, 1.2, Number.NaN]) {
      expect(() =>
        evaluateStagedAStar({
          officialCombinedTarget: weightedMark(200),
          a2MaximumWeightedMark: weightedMark(125),
          carryForwardWeightingShare: invalidShare,
        })
      ).toThrow(TypeError)
    }
  })

  it.each(
    STAGED_ROUTES.flatMap((spec) =>
      ALL_GRADES.map((grade) => ({
        label: `${spec.subjectCode} ${spec.routeKey} Grade ${grade}`,
        spec,
        grade,
      }))
    )
  )('resolves $label with Atlas provisional AS estimate and exact A2 allocations', async ({ spec, grade }) => {
    const { subjectId } = setupMockForStagedRoute(spec, grade)
    const selectedVariants: Record<string, string> = {}
    for (const p of spec.a2PaperNums) {
      selectedVariants[uuidv5Oid(`sp-${spec.subjectCode}-${p}`)] = spec.exactVariants[p]
    }
    const juneCfToken = spec.juneKey.split(',').at(-1)!
    const novCfToken = spec.novKey.split(',').at(-1)!

    // Without selectedCarryForwardToken, multiple sittings must never be guessed
    const selectionRequired = await getTargetGradePlan(subjectId, { selectedVariants })
    expect(selectionRequired.status).toBe('carry-forward-selection-required')
    if (selectionRequired.status === 'carry-forward-selection-required') {
      expect(selectionRequired.options.map((o) => o.label)).toEqual([
        'June 2025 AS result',
        'November 2025 AS result',
      ])
      expect(selectionRequired.options.map((o) => o.rawCarryForwardToken)).toEqual(
        expect.arrayContaining([juneCfToken, novCfToken])
      )
    }

    const res = await getTargetGradePlan(subjectId, {
      selectedVariants,
      selectedCarryForwardToken: juneCfToken,
    })
    expect(res.status).toBe('available')
    if (res.status !== 'available') return

    expect(res.summary.studyRoute).toBe('staged')
    expect(res.summary.officialCombinedTarget).not.toBeNull()
    expect(res.summary.stagedBreakdown).not.toBeNull()
    expect(res.summary.stagedBreakdown?.kind).toBe('estimated_halfway')
    expect(res.summary.selectedCarryForwardOption?.label).toBe('June 2025 AS result')
    expect(res.summary.availableCarryForwardOptions?.map((o) => o.label)).toEqual([
      'June 2025 AS result',
      'November 2025 AS result',
    ])

    const expectedTarget = res.summary.officialCombinedTarget!
    const expectedAsEst = Math.ceil(expectedTarget * 0.5)
    if (res.summary.stagedBreakdown?.kind === 'estimated_halfway') {
      expect(res.summary.stagedBreakdown.estimatedAsContribution).toBe(expectedAsEst)
      expect(res.summary.stagedBreakdown.remainingA2Required).toBe(expectedTarget - expectedAsEst)
    }

    expect(res.paperPlans).toHaveLength(spec.a2PaperNums.length)
    expect(res.paperPlans.every((p) => p.stage === 'a2')).toBe(true)
    expect(res.paperPlans.every((p) => p.requiredMark !== null)).toBe(true)
  })

  it.each(STAGED_ROUTES)(
    'infers exact A2 variants from the resolved $subjectCode $routeKey Cambridge option',
    async (spec) => {
      const { subjectId } = setupMockForStagedRoute(spec, 'A')
      const juneCfToken = spec.juneKey.split(',').at(-1)!

      const res = await getTargetGradePlan(subjectId, {
        selectedCarryForwardToken: juneCfToken,
      })

      expect(res.status).toBe('available')
      if (res.status !== 'available') return

      expect(res.summary.stagedBreakdown?.kind).toBe('estimated_halfway')
      expect(res.paperPlans).toHaveLength(spec.a2PaperNums.length)
      for (const paper of res.paperPlans) {
        expect(paper.targetVariantChoice).toBe(
          spec.exactVariants[paper.componentPaperNumber]
        )
        expect(paper.sourceKind).toBe('official_exact')
        expect(paper.officialWeightingFactor).not.toBeNull()
        expect(paper.requiredMark).not.toBeNull()
      }
    }
  )

  it('auto-resolves when only one approved carry-forward sitting matches', async () => {
    const spec = STAGED_ROUTES[5] // 9701 standard
    const { subjectId } = setupMockForStagedRoute(spec, 'A', { onlyJuneMapping: true })
    const selectedVariants: Record<string, string> = {}
    for (const p of spec.a2PaperNums) {
      selectedVariants[uuidv5Oid(`sp-${spec.subjectCode}-${p}`)] = spec.exactVariants[p]
    }
    const res = await getTargetGradePlan(subjectId, { selectedVariants })
    expect(res.status).toBe('available')
    if (res.status === 'available') {
      expect(res.summary.selectedCarryForwardOption?.label).toBe('June 2025 AS result')
    }
  })

  it('loads verified actual AS carry-forward result server-side and ignores forged client input', async () => {
    const spec = STAGED_ROUTES[0] // 9709 mech_stats (AS max 125)
    const selectedVariants: Record<string, string> = {}
    for (const p of spec.a2PaperNums) {
      selectedVariants[uuidv5Oid(`sp-${spec.subjectCode}-${p}`)] = spec.exactVariants[p]
    }
    const novCfToken = spec.novKey.split(',').at(-1)!
    const enrollmentId = `us-${spec.subjectCode}-${spec.routeKey}`

    const { subjectId } = setupMockForStagedRoute(spec, 'A', {
      stageResults: [
        {
          id: 'ssr-valid-nov',
          user_subject_id: enrollmentId,
          stage: 'as',
          result_type: 'actual',
          score_obtained: 110,
          score_maximum: 125,
          exam_series: 'november',
          exam_year: 2025,
          carry_forward: true,
        },
      ],
    })

    const res = await getTargetGradePlan(subjectId, {
      selectedVariants,
      selectedCarryForwardToken: novCfToken,
      safetyMargin: { type: 'plus_3', marks: 3 },
    })
    expect(res.status).toBe('available')
    if (res.status === 'available') {
      expect(res.summary.stagedBreakdown?.kind).toBe('verified_official')
      expect(res.summary.stagedBreakdown?.remainingA2Required).toBe(res.summary.officialCombinedTarget! - 110)
      expect(res.summary.adjustedCombinedTarget).toBe(res.summary.officialCombinedTarget! + 3)
    }

    // Forged client verifiedAsContribution must be ignored when server DB has no matching actual result
    setupMockForStagedRoute(spec, 'A', { stageResults: [] })
    const forgedRes = await getTargetGradePlan(subjectId, {
      selectedVariants,
      selectedCarryForwardToken: novCfToken,
      verifiedAsContribution: {
        kind: 'verified_official_weighted_as_mark',
        weightedMark: weightedMark(120),
        maxWeightedMark: weightedMark(125),
      },
    } as unknown as Parameters<typeof getTargetGradePlan>[1])
    expect(forgedRes.status).toBe('available')
    if (forgedRes.status === 'available') {
      expect(forgedRes.summary.stagedBreakdown?.kind).toBe('estimated_halfway')
    }
  })

  it.each([
    {
      name: 'another user / enrollment result (user_subject_id mismatch)',
      row: { user_subject_id: 'other-enrollment', stage: 'as', result_type: 'actual', score_obtained: 110, score_maximum: 125, exam_series: 'june', exam_year: 2025, carry_forward: true },
    },
    {
      name: 'wrong exam_year',
      row: { user_subject_id: 'us-9709-mech_stats', stage: 'as', result_type: 'actual', score_obtained: 110, score_maximum: 125, exam_series: 'june', exam_year: 2024, carry_forward: true },
    },
    {
      name: 'wrong exam_series',
      row: { user_subject_id: 'us-9709-mech_stats', stage: 'as', result_type: 'actual', score_obtained: 110, score_maximum: 125, exam_series: 'november', exam_year: 2025, carry_forward: true },
    },
    {
      name: 'expected result_type',
      row: { user_subject_id: 'us-9709-mech_stats', stage: 'as', result_type: 'expected', score_obtained: 110, score_maximum: 125, exam_series: 'june', exam_year: 2025, carry_forward: true },
    },
    {
      name: 'forecast result_type',
      row: { user_subject_id: 'us-9709-mech_stats', stage: 'as', result_type: 'forecast', score_obtained: 110, score_maximum: 125, exam_series: 'june', exam_year: 2025, carry_forward: true },
    },
    {
      name: 'carry_forward = false',
      row: { user_subject_id: 'us-9709-mech_stats', stage: 'as', result_type: 'actual', score_obtained: 110, score_maximum: 125, exam_series: 'june', exam_year: 2025, carry_forward: false },
    },
    {
      name: 'mismatched score_maximum (not silently normalized)',
      row: { user_subject_id: 'us-9709-mech_stats', stage: 'as', result_type: 'actual', score_obtained: 88, score_maximum: 100, exam_series: 'june', exam_year: 2025, carry_forward: true },
    },
  ])('rejects $name and keeps provisional Atlas estimate', async ({ row }) => {
    const spec = STAGED_ROUTES[0]
    const selectedVariants: Record<string, string> = {}
    for (const p of spec.a2PaperNums) {
      selectedVariants[uuidv5Oid(`sp-${spec.subjectCode}-${p}`)] = spec.exactVariants[p]
    }
    const juneCfToken = spec.juneKey.split(',').at(-1)!
    const { subjectId } = setupMockForStagedRoute(spec, 'A', { stageResults: [row] })

    const res = await getTargetGradePlan(subjectId, {
      selectedVariants,
      selectedCarryForwardToken: juneCfToken,
    })
    expect(res.status).toBe('available')
    if (res.status === 'available') {
      expect(res.summary.stagedBreakdown?.kind).toBe('estimated_halfway')
    }
  })

  it('rejects duplicate/ambiguous stage results and propagates stage result query failures', async () => {
    const spec = STAGED_ROUTES[0]
    const selectedVariants: Record<string, string> = {}
    for (const p of spec.a2PaperNums) {
      selectedVariants[uuidv5Oid(`sp-${spec.subjectCode}-${p}`)] = spec.exactVariants[p]
    }
    const juneCfToken = spec.juneKey.split(',').at(-1)!
    const row = {
      user_subject_id: 'us-9709-mech_stats',
      stage: 'as',
      result_type: 'actual',
      score_obtained: 110,
      score_maximum: 125,
      exam_series: 'june',
      exam_year: 2025,
      carry_forward: true,
    }
    const { subjectId } = setupMockForStagedRoute(spec, 'A', { stageResults: [row, { ...row, id: 'dup' }] })
    const dupRes = await getTargetGradePlan(subjectId, {
      selectedVariants,
      selectedCarryForwardToken: juneCfToken,
    })
    expect(dupRes.status).toBe('available')
    if (dupRes.status === 'available') {
      expect(dupRes.summary.stagedBreakdown?.kind).toBe('estimated_halfway')
    }

    setupMockForStagedRoute(spec, 'A', { stageResultsError: 'RLS or DB timeout' })
    const errRes = await getTargetGradePlan(subjectId, {
      selectedVariants,
      selectedCarryForwardToken: juneCfToken,
    })
    expect(errRes.status).toBe('query-failure')
  })

  it('fails closed when carry-forward evidence is unreviewed or weighting is missing/zero/inconsistent', async () => {
    const spec = STAGED_ROUTES[5] // 9701 standard
    const { subjectId } = setupMockForStagedRoute(spec, 'A', { simulateApprovedZone5: false })
    const unapprovedRes = await getTargetGradePlan(subjectId)
    expect(unapprovedRes.status).toBe('threshold-unavailable')

    const selectedVariants: Record<string, string> = {}
    for (const p of spec.a2PaperNums) {
      selectedVariants[uuidv5Oid(`sp-${spec.subjectCode}-${p}`)] = spec.exactVariants[p]
    }
    const juneCfToken = spec.juneKey.split(',').at(-1)!

    for (const override of [
      undefined,
      { weighting_factor: 0 },
      { weighting_factor: 2 },
      { maximum_mark: 0 },
      { maximum_mark: 100 }, // under-capacity: 100 + 130 = 230 < 260
      { maximum_mark: 150 }, // over-capacity: 150 + 130 = 280 > 260
    ]) {
      setupMockForStagedRoute(spec, 'A', {
        simulateApprovedZone5: true,
        missingWeighting: override === undefined,
        cfWeightingOverride: override,
      })
      const failRes = await getTargetGradePlan(subjectId, {
        selectedVariants,
        selectedCarryForwardToken: juneCfToken,
      })
      expect(failRes.status).toBe('missing-weighting')
      if (failRes.status === 'missing-weighting') {
        expect(failRes.summary.stagedBreakdown).toBeNull()
        expect(failRes.summary.officialCombinedTarget).not.toBeNull()
        expect(failRes.summary.provenance.examYear).toBe(2026)
        expect(failRes.paperPlans.every((p) => p.requiredMark === null)).toBe(true)
      }
    }

    // Missing A2 weighting while carry-forward weighting is present must fail closed without a staged numeric estimate
    setupMockForStagedRoute(spec, 'A', {
      simulateApprovedZone5: true,
      missingA2Weighting: true,
    })
    const missingA2Res = await getTargetGradePlan(subjectId, {
      selectedVariants,
      selectedCarryForwardToken: juneCfToken,
    })
    expect(missingA2Res.status).toBe('missing-weighting')
    if (missingA2Res.status === 'missing-weighting') {
      expect(missingA2Res.summary.stagedBreakdown).toBeNull()
      expect(missingA2Res.summary.officialCombinedTarget).not.toBeNull()
      expect(missingA2Res.summary.provenance.examSeries).toBe('june')
      expect(missingA2Res.paperPlans.every((p) => p.requiredMark === null)).toBe(true)
    }

    // Exact-capacity weighting (130 + 130 = 260) succeeds
    setupMockForStagedRoute(spec, 'A', { simulateApprovedZone5: true })
    const exactRes = await getTargetGradePlan(subjectId, {
      selectedVariants,
      selectedCarryForwardToken: juneCfToken,
    })
    expect(exactRes.status).toBe('available')
  })
})
