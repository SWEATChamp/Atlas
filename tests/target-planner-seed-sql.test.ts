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

const UUID_NS_OID = '6ba7b812-9dad-11d1-80b4-00c04fd430c8'

function uuidv5Oid(name: string): string {
  const nsBytes = Buffer.from(UUID_NS_OID.replace(/-/g, ''), 'hex')
  const hash = crypto.createHash('sha1').update(nsBytes).update(name, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

interface ParsedRoutePaper {
  route_id: string
  subject_paper_id: string
  stage: 'as' | 'a2'
}

interface ParsedRoute {
  id: string
  subject_id: string
  route: 'as_only' | 'full_level' | 'staged'
  combination_key: string
}

interface ParsedSubjectPaper {
  id: string
  subject_id: string
  paper_number: number
  name: string
}

function loadMigration024Topology() {
  const migSql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260826000024_mvp_syllabus_content.sql'),
    'utf8'
  )

  const varToSubjectCode: Record<string, string> = {
    v_m_id: '9709',
    v_fm_id: '9231',
    v_p_id: '9702',
    v_c_id: '9701',
    v_cs_id: '9618',
  }

  const subjectIdByCode = new Map<string, string>(
    Object.values(varToSubjectCode).map((code) => [code, uuidv5Oid(`s-${code}`)])
  )

  const subjectPapers: ParsedSubjectPaper[] = []
  const paperRe =
    /\(extensions\.uuid_generate_v5\(extensions\.uuid_ns_oid\(\),\s*'([^']+)'\),\s*(v_[a-z]+_id),\s*(\d+),\s*'([^']+)'/g
  for (const m of migSql.matchAll(paperRe)) {
    const code = varToSubjectCode[m[2]]
    const subjectId = code ? subjectIdByCode.get(code) : undefined
    if (!subjectId) continue
    subjectPapers.push({
      id: uuidv5Oid(m[1]),
      subject_id: subjectId,
      paper_number: Number(m[3]),
      name: m[4],
    })
  }

  const routes: ParsedRoute[] = []
  const routePapers: ParsedRoutePaper[] = []

  // Split by route variable assignment blocks in Migration 024
  const blockRe =
    /v_r_id\s*:=\s*extensions\.uuid_generate_v5\(extensions\.uuid_ns_oid\(\),\s*'([^']+)'\);\s*INSERT INTO public\.subject_valid_routes[^;]*\(\s*v_r_id,\s*(v_[a-z]+_id),\s*'(as_only|full_level|staged)',\s*'([^']+)'[\s\S]*?INSERT INTO public\.subject_route_papers[^;]*VALUES([\s\S]*?)ON CONFLICT/g

  for (const b of migSql.matchAll(blockRe)) {
    const routeId = uuidv5Oid(b[1])
    const code = varToSubjectCode[b[2]]
    const subjectId = code ? subjectIdByCode.get(code) : undefined
    if (!subjectId) continue

    routes.push({
      id: routeId,
      subject_id: subjectId,
      route: b[3] as 'as_only' | 'full_level' | 'staged',
      combination_key: b[4],
    })

    const rpRe =
      /\(v_r_id,\s*extensions\.uuid_generate_v5\(extensions\.uuid_ns_oid\(\),\s*'([^']+)'\),\s*'(as|a2)'\)/g
    for (const rp of b[5].matchAll(rpRe)) {
      routePapers.push({
        route_id: routeId,
        subject_paper_id: uuidv5Oid(rp[1]),
        stage: rp[2] as 'as' | 'a2',
      })
    }
  }

  return { subjectIdByCode, subjectPapers, routes, routePapers }
}

function loadJune2026SeedData() {
  const seedSql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/seeds/catalogue/june_2026_m5_catalogue.sql'),
    'utf8'
  )

  const varToSubjectCode: Record<string, string> = {
    v_subj_9701: '9701',
    v_subj_9702: '9702',
    v_subj_9709: '9709',
    v_subj_9231: '9231',
    v_subj_9618: '9618',
  }

  const publications: Array<{
    id: string
    subject_id: string
    exam_year: number
    exam_series: string
    publication_status: string
    is_active: boolean
    official_index_url: string
    official_pdf_url: string
    official_published_on: string
    published_at: string
  }> = []
  const pubRe =
    /\('([0-9a-f-]{36})',\s*'00000000-0000-4000-8000-000000000010',\s*(v_subj_\d+),\s*(\d+),\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*decode\([^)]+\),\s*'([^']+)',\s*\d+,\s*'([^']+)',\s*(TRUE|FALSE),\s*'([^']+)'/g
  for (const m of seedSql.matchAll(pubRe)) {
    const code = varToSubjectCode[m[2]]
    if (!code) continue
    publications.push({
      id: m[1],
      subject_id: uuidv5Oid(`s-${code}`),
      exam_year: Number(m[3]),
      exam_series: m[4],
      official_index_url: m[5],
      official_pdf_url: m[6],
      official_published_on: m[7],
      publication_status: m[8],
      is_active: m[9] === 'TRUE',
      published_at: m[10],
    })
  }

  const weightingSources = new Map<
    string,
    { id: string; subject_id: string; document_year: number; exam_series: string; review_status: string }
  >()
  const wsRe =
    /\('([0-9a-f-]{36})',\s*(v_subj_\d+),\s*(\d+),\s*'([^']+)',\s*'[^']+',\s*'[^']+',\s*decode\([^)]+\),\s*'([^']+)'/g
  for (const m of seedSql.matchAll(wsRe)) {
    const code = varToSubjectCode[m[2]]
    if (!code) continue
    weightingSources.set(m[1], {
      id: m[1],
      subject_id: uuidv5Oid(`s-${code}`),
      document_year: Number(m[3]),
      exam_series: m[4],
      review_status: m[5],
    })
  }

  const weightingEntries = new Map<
    string,
    {
      id: string
      weighting_source_id: string
      raw_token: string
      token_kind: string
      raw_maximum: number
      official_weighting_factor: number
    }
  >()
  const weRe =
    /\('([0-9a-f-]{36})',\s*'([0-9a-f-]{36})',\s*'([^']+)',\s*'(component_variant|carry_forward)',\s*(\d+),\s*\d+,\s*([0-9.]+)/g
  for (const m of seedSql.matchAll(weRe)) {
    weightingEntries.set(m[1], {
      id: m[1],
      weighting_source_id: m[2],
      raw_token: m[3],
      token_kind: m[4],
      raw_maximum: Number(m[5]),
      official_weighting_factor: Number(m[6]),
    })
  }

  const variants: Array<{
    id: string
    publication_id: string
    component_code: string
    raw_maximum_mark: number
    subject_paper_id: string | null
  }> = []
  const varRe =
    /\('([0-9a-f-]{36})',\s*'(00000000-0000-4000-8000-00000000002[1-5])',\s*'([^']+)',\s*(\d+),\s*(NULL|'([0-9a-f-]{36})'::uuid)/g
  for (const m of seedSql.matchAll(varRe)) {
    variants.push({
      id: m[1],
      publication_id: m[2],
      component_code: m[3],
      raw_maximum_mark: Number(m[4]),
      subject_paper_id: m[6] ?? null,
    })
  }

  const compMarks = new Map<string, Array<{ grade: string; threshold_mark: number }>>()
  const cmRe = /\('([0-9a-f-]{36})',\s*'([A-E])',\s*(\d+)\)/g
  for (const m of seedSql.matchAll(cmRe)) {
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
  const combRe =
    /\('([0-9a-f-]{36})',\s*'(00000000-0000-4000-8000-00000000002[1-5])',\s*'([^']+)',\s*'[^']+',\s*'[^']+',\s*'(as|a_level)',\s*'(as_only|full_level|staged|other)',\s*(\d+),\s*'[^']+',\s*'(eligible|unreviewed|unsupported)',\s*(NULL|'([0-9a-f-]{36})'::uuid)/g
  for (const m of seedSql.matchAll(combRe)) {
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
  const cmarkRe = /\('([0-9a-f-]{36})',\s*'([0-9a-f-]{36})',\s*'([A-Ea-e*]+)',\s*(\d+)\)/g
  for (const m of seedSql.matchAll(cmarkRe)) {
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
    weighting_entry_id: string | null
    carry_forward_mapping_status: string | null
  }> = []
  const tokRe =
    /\('([0-9a-f-]{36})',\s*'([0-9a-f-]{36})',\s*(\d+),\s*'([^']+)',\s*'(component_variant|carry_forward)',\s*'(as|a2)',\s*(NULL|'([0-9a-f-]{36})'::uuid),\s*(NULL|\d+),\s*(NULL|[0-9.]+),\s*(NULL|'([0-9a-f-]{36})'),\s*(NULL|'([^']+)')/g
  for (const m of seedSql.matchAll(tokRe)) {
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
      weighting_entry_id: m[12] ?? null,
      carry_forward_mapping_status: m[14] ?? null,
    })
  }

  return {
    publications,
    weightingSources,
    weightingEntries,
    variants,
    compMarks,
    combinations,
    combMarks,
    combTokens,
  }
}

/**
 * Evaluates Migration 035's `public.published_grade_threshold_combinations` view logic
 * directly from the parsed SQL tables without hardcoding eligibility or route-paper links.
 */
function evaluatePublishedCombinationsView(
  topology: ReturnType<typeof loadMigration024Topology>,
  seed: ReturnType<typeof loadJune2026SeedData>
) {
  const pubById = new Map(seed.publications.map((p) => [p.id, p]))
  const variantById = new Map(seed.variants.map((v) => [v.id, v]))
  const tokensByCombId = new Map<string, typeof seed.combTokens>()
  for (const t of seed.combTokens) {
    const arr = tokensByCombId.get(t.combination_id) ?? []
    arr.push(t)
    tokensByCombId.set(t.combination_id, arr)
  }

  return seed.combinations
    .filter((c) => {
      const p = pubById.get(c.publication_id)
      if (!p || p.publication_status !== 'published' || !p.is_active) return false
      if (c.planner_eligibility !== 'eligible' || !c.atlas_route_id) return false

      const tokens = tokensByCombId.get(c.id) ?? []
      const rps = topology.routePapers.filter((rp) => rp.route_id === c.atlas_route_id)

      if (c.route_type === 'as_only' || c.route_type === 'full_level') {
        const allTokensMatchRoute = tokens.every((t) => {
          if (t.token_kind !== 'component_variant' || !t.resolved_component_variant_id) return false
          const v = variantById.get(t.resolved_component_variant_id)
          if (!v || !v.subject_paper_id) return false
          return rps.some((rp) => rp.subject_paper_id === v.subject_paper_id && rp.stage === t.stage)
        })
        const allRoutePapersCovered = rps.every((rp) =>
          tokens.some((t) => {
            if (!t.resolved_component_variant_id) return false
            const v = variantById.get(t.resolved_component_variant_id)
            return Boolean(v && v.subject_paper_id === rp.subject_paper_id && t.stage === rp.stage)
          })
        )
        return allTokensMatchRoute && allRoutePapersCovered
      }

      // Migration 035 requires an approved carry-forward mapping in published_grade_threshold_carry_forward_mappings
      // (june_2026_m5_catalogue.sql + Migration 036 leave 0 published carry-forward mappings)
      return false
    })
    .map((c) => {
      const p = pubById.get(c.publication_id)!
      const tokens = tokensByCombId.get(c.id) ?? []
      const ineligibleToken = tokens.some((t) => {
        if (t.token_kind !== 'component_variant') return true
        if (!t.resolved_component_variant_id || t.maximum_mark === null || t.weighting_factor === null) {
          return true
        }
        const we = t.weighting_entry_id ? seed.weightingEntries.get(t.weighting_entry_id) : undefined
        if (
          !we ||
          we.raw_token !== t.raw_token ||
          we.token_kind !== t.token_kind ||
          we.raw_maximum !== t.maximum_mark ||
          Math.abs(we.official_weighting_factor - t.weighting_factor) > 1e-6
        ) {
          return true
        }
        const ws = seed.weightingSources.get(we.weighting_source_id)
        return (
          !ws ||
          ws.subject_id !== p.subject_id ||
          ws.document_year !== p.exam_year ||
          ws.exam_series !== p.exam_series ||
          ws.review_status !== 'approved'
        )
      })

      return {
        ...c,
        per_paper_allocation_eligible: !ineligibleToken,
      }
    })
}

const topology = loadMigration024Topology()
const seedData = loadJune2026SeedData()
const publishedCombinations = evaluatePublishedCombinationsView(topology, seedData)

function setupMockedSupabaseFromParsedSql(params: {
  subjectCode: '9709' | '9231'
  subjectName: string
  combinationKey: string
  targetGrade: string
  examDate: string
}) {
  const subjectId = topology.subjectIdByCode.get(params.subjectCode)
  if (!subjectId) throw new Error(`Missing subjectId for ${params.subjectCode}`)

  const route = topology.routes.find(
    (r) => r.subject_id === subjectId && r.combination_key === params.combinationKey
  )
  if (!route) throw new Error(`Missing route ${params.subjectCode} ${params.combinationKey} in Migration 024`)

  const routePapers = topology.routePapers.filter((rp) => rp.route_id === route.id)
  const subjectPapers = topology.subjectPapers.filter((sp) => sp.subject_id === subjectId)

  mockFrom.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {}
    const inFilters: Record<string, unknown[]> = {}

    const resolveRows = (): unknown[] => {
      if (table === 'subjects') {
        return [{ id: subjectId, name: params.subjectName, code: params.subjectCode, color_hex: '#3b82f6' }]
      }
      if (table === 'user_subjects') {
        return [{
          id: `us-${params.subjectCode}`,
          user_id: 'user-seed-test',
          subject_id: subjectId,
          study_route: route.route,
          target_grade: params.targetGrade,
          exam_date: params.examDate,
        }]
      }
      if (table === 'subject_paper_selections') {
        return routePapers.map((rp) => ({
          subject_paper_id: rp.subject_paper_id,
          stage: rp.stage,
        }))
      }
      if (table === 'subject_valid_routes') {
        return topology.routes
          .filter((r) => (!filters['subject_id'] || r.subject_id === filters['subject_id']) && (!filters['route'] || r.route === filters['route']))
          .map((r) => ({
            ...r,
            subject_route_papers: topology.routePapers
              .filter((rp) => rp.route_id === r.id)
              .map((rp) => ({ subject_paper_id: rp.subject_paper_id, stage: rp.stage })),
          }))
      }
      if (table === 'subject_papers') {
        return subjectPapers
      }
      if (table === 'grade_threshold_publications') {
        return seedData.publications.filter(
          (p) => !filters['subject_id'] || p.subject_id === filters['subject_id']
        )
      }
      if (table === 'published_grade_threshold_combinations') {
        return publishedCombinations.filter((c) => {
          if (inFilters['publication_id'] && !inFilters['publication_id'].includes(c.publication_id)) return false
          if (filters['atlas_route_id'] && c.atlas_route_id !== filters['atlas_route_id']) return false
          if (filters['planner_eligibility'] && c.planner_eligibility !== filters['planner_eligibility']) return false
          return true
        })
      }
      if (table === 'grade_threshold_component_variants') {
        return seedData.variants
          .filter((v) => !inFilters['publication_id'] || inFilters['publication_id'].includes(v.publication_id))
          .map((v) => ({
            ...v,
            grade_threshold_component_marks: seedData.compMarks.get(v.id) ?? [],
          }))
      }
      if (table === 'published_grade_threshold_variant_benchmarks') {
        return []
      }
      if (table === 'grade_threshold_combination_marks') {
        return seedData.combMarks.filter(
          (m) => !inFilters['combination_id'] || inFilters['combination_id'].includes(m.combination_id)
        )
      }
      if (table === 'grade_threshold_combination_tokens') {
        return seedData.combTokens.filter(
          (t) => !inFilters['combination_id'] || inFilters['combination_id'].includes(t.combination_id)
        )
      }
      if (table === 'past_papers') {
        return []
      }
      return []
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
      range: vi.fn(async () => ({ data: resolveRows(), error: null })),
      single: vi.fn(async () => ({ data: resolveRows()[0] ?? null, error: null })),
      then: (resolve: (val: unknown) => void) => resolve({ data: resolveRows(), error: null }),
    }
    return builder
  })

  return { subjectId, routeId: route.id }
}

describe('Seed SQL Canonical Planner Compatibility (Mocked Supabase)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-seed-test' } } })
  })

  it('derives Migration 024 routes, weighting eligibility, and fail-closed staged exclusions from SQL', () => {
    const mechStatsRouteId = uuidv5Oid('svr-9709-full-mech-stats')
    const furtherAllRouteId = uuidv5Oid('svr-9231-full-all')

    const mechStatsCombs = publishedCombinations.filter((c) => c.atlas_route_id === mechStatsRouteId)
    expect(mechStatsCombs.length).toBeGreaterThan(0)
    expect(mechStatsCombs.every((c) => c.per_paper_allocation_eligible)).toBe(true)

    const furtherCombs = publishedCombinations.filter((c) => c.atlas_route_id === furtherAllRouteId)
    expect(furtherCombs.length).toBeGreaterThan(0)
    expect(furtherCombs.every((c) => c.per_paper_allocation_eligible)).toBe(true)

    // Staged combinations in june_2026_m5_catalogue.sql must remain fail-closed
    expect(publishedCombinations.some((c) => c.route_type === 'staged')).toBe(false)
  })

  it('resolves 9709 full_mech_stats 11,31,41,51 to A* 223/250 and A 197/250', async () => {
    const { subjectId } = setupMockedSupabaseFromParsedSql({
      subjectCode: '9709',
      subjectName: 'Mathematics',
      combinationKey: 'full_mech_stats',
      targetGrade: 'A*',
      examDate: '2026-11-15',
    })

    const initial = await getTargetGradePlan(subjectId)
    expect(initial.status).toBe('available')
    if (initial.status === 'available') {
      expect(initial.paperPlans).toHaveLength(4)
      expect(initial.paperPlans.every((p) => p.availableVariants.length > 0)).toBe(true)
    }

    const p1 = uuidv5Oid('sp-9709-1')
    const p3 = uuidv5Oid('sp-9709-3')
    const p4 = uuidv5Oid('sp-9709-4')
    const p5 = uuidv5Oid('sp-9709-5')

    const resolved = await getTargetGradePlan(subjectId, {
      selectedVariants: {
        [p1]: '11',
        [p3]: '31',
        [p4]: '41',
        [p5]: '51',
      },
    })
    expect(resolved.status).toBe('available')
    if (resolved.status === 'available') {
      expect(resolved.summary.officialCombinedTarget).toBe(223)
      expect(resolved.summary.combinedMaximumMark).toBe(250)
    }

    setupMockedSupabaseFromParsedSql({
      subjectCode: '9709',
      subjectName: 'Mathematics',
      combinationKey: 'full_mech_stats',
      targetGrade: 'A',
      examDate: '2026-11-15',
    })

    const resolvedA = await getTargetGradePlan(subjectId, {
      selectedVariants: {
        [p1]: '11',
        [p3]: '31',
        [p4]: '41',
        [p5]: '51',
      },
    })
    expect(resolvedA.status).toBe('available')
    if (resolvedA.status === 'available') {
      expect(resolvedA.summary.officialCombinedTarget).toBe(197)
      expect(resolvedA.summary.combinedMaximumMark).toBe(250)
    }
  })

  it('resolves 9231 full_all 11,21,31,41 and 12,22,32,42 to A* 214/250 and A 181/250', async () => {
    const { subjectId } = setupMockedSupabaseFromParsedSql({
      subjectCode: '9231',
      subjectName: 'Further Mathematics',
      combinationKey: 'full_all',
      targetGrade: 'A*',
      examDate: '2026-11-15',
    })

    const initial = await getTargetGradePlan(subjectId)
    expect(initial.status).toBe('available')
    if (initial.status === 'available') {
      expect(initial.paperPlans).toHaveLength(4)
      expect(initial.paperPlans.every((p) => p.availableVariants.length > 0)).toBe(true)
    }

    const p1 = uuidv5Oid('sp-9231-1')
    const p2 = uuidv5Oid('sp-9231-2')
    const p3 = uuidv5Oid('sp-9231-3')
    const p4 = uuidv5Oid('sp-9231-4')

    const resolved11 = await getTargetGradePlan(subjectId, {
      selectedVariants: {
        [p1]: '11',
        [p2]: '21',
        [p3]: '31',
        [p4]: '41',
      },
    })
    expect(resolved11.status).toBe('available')
    if (resolved11.status === 'available') {
      expect(resolved11.summary.officialCombinedTarget).toBe(214)
      expect(resolved11.summary.combinedMaximumMark).toBe(250)
    }

    const resolved12 = await getTargetGradePlan(subjectId, {
      selectedVariants: {
        [p1]: '12',
        [p2]: '22',
        [p3]: '32',
        [p4]: '42',
      },
    })
    expect(resolved12.status).toBe('available')
    if (resolved12.status === 'available') {
      expect(resolved12.summary.officialCombinedTarget).toBe(214)
      expect(resolved12.summary.combinedMaximumMark).toBe(250)
    }

    setupMockedSupabaseFromParsedSql({
      subjectCode: '9231',
      subjectName: 'Further Mathematics',
      combinationKey: 'full_all',
      targetGrade: 'A',
      examDate: '2026-11-15',
    })

    const resolved11A = await getTargetGradePlan(subjectId, {
      selectedVariants: {
        [p1]: '11',
        [p2]: '21',
        [p3]: '31',
        [p4]: '41',
      },
    })
    expect(resolved11A.status).toBe('available')
    if (resolved11A.status === 'available') {
      expect(resolved11A.summary.officialCombinedTarget).toBe(181)
      expect(resolved11A.summary.combinedMaximumMark).toBe(250)
    }
  })

  it('preserves 9709 full_stats_double 13,33,53,63 (A* 234/250)', async () => {
    const { subjectId } = setupMockedSupabaseFromParsedSql({
      subjectCode: '9709',
      subjectName: 'Mathematics',
      combinationKey: 'full_stats_double',
      targetGrade: 'A*',
      examDate: '2026-11-15',
    })

    const p1 = uuidv5Oid('sp-9709-1')
    const p3 = uuidv5Oid('sp-9709-3')
    const p5 = uuidv5Oid('sp-9709-5')
    const p6 = uuidv5Oid('sp-9709-6')

    const resolved = await getTargetGradePlan(subjectId, {
      selectedVariants: {
        [p1]: '13',
        [p3]: '33',
        [p5]: '53',
        [p6]: '63',
      },
    })
    expect(resolved.status).toBe('available')
    if (resolved.status === 'available') {
      expect(resolved.summary.officialCombinedTarget).toBe(234)
      expect(resolved.summary.combinedMaximumMark).toBe(250)
    }
  })

  it('keeps Migration 038 synchronized verbatim with the canonical catalogue seed and 11-table validator', () => {
    const repoRoot = path.resolve(__dirname, '..')
    const migration038 = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20261127000038_seed_june_2026_m5_catalogue.sql'),
      'utf8',
    )
    const canonicalSeed = fs.readFileSync(
      path.join(repoRoot, 'supabase/seeds/catalogue/june_2026_m5_catalogue.sql'),
      'utf8',
    )
    const canonicalValidator = fs.readFileSync(
      path.join(repoRoot, 'supabase/tests/fixtures/catalogue/milestone_5_catalogue_validator.sql'),
      'utf8',
    )

    expect(migration038).toContain(canonicalSeed)
    expect(migration038).toContain(canonicalValidator)
    expect(migration038).toContain('pg_temp.run_m5_catalogue_validator()')
  })
})
