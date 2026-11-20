'use server'

import { cache } from 'react'
import { getAuthenticatedContext } from '@/lib/supabase/authenticated'
import type { PaperStage } from '@/types/database'
import {
  allocateComponentMarks,
  applySafetyMarginToCombinedTarget,
  deriveSessionFromDate,
  evaluateComponentEvidence,
  evaluateGradeFromThresholds,
  evaluateStagedAStar,
  filterAndNormalizeAttempts,
  findLatestComparableSitting,
  rawMark,
  weightedMark,
  weightingFactor,
  type AllocationComponentInput,
  type CambridgeExamSeries,
  type ComponentVariantBenchmark,
  type ExamSessionSpec,
  type FallbackReason,
  type HistoricalCombinationDefinition,
  type PaperPlanResult,
  type PlannerResult,
  type QualificationLevel,
  type RawMark,
  type RawPastPaperAttempt,
  type SafetyMarginOption,
  type SubjectLevelPlanSummary,
  type ThresholdProvenance,
  type VariantOption,
  type WeightedMark,
  type WeightingFactor,
} from '@/lib/planner'

export interface GetTargetPlanOptions {
  readonly selectedVariants?: Readonly<Record<string, string>> // subjectPaperId -> variantCode (e.g. "12")
  readonly safetyMargin?: SafetyMarginOption
  readonly overrideSession?: ExamSessionSpec
}

/**
 * Fetch and assemble the complete Target-Grade Marks Plan for an enrolled subject.
 */
export const getTargetGradePlan = cache(
  async (
    subjectId: string,
    options: GetTargetPlanOptions = {}
  ): Promise<PlannerResult> => {
    try {
      const { supabase, user } = await getAuthenticatedContext()
      if (!user) {
        return {
          status: 'query-failure',
          message: 'User authentication required',
          error: 'Not authenticated',
        }
      }

      // ─── 1. Fetch Subject & Enrollment Data ─────────────────────────────────
      const [subjectRes, enrollmentRes] = await Promise.all([
        supabase.from('subjects').select('*').eq('id', subjectId).single(),
        supabase
          .from('user_subjects')
          .select('*')
          .eq('user_id', user.id)
          .eq('subject_id', subjectId)
          .eq('is_archived', false)
          .single(),
      ])

      if (subjectRes.error) {
        return {
          status: 'query-failure',
          message: 'Failed to load subject metadata',
          error: subjectRes.error.message,
        }
      }
      if (enrollmentRes.error) {
        if (enrollmentRes.error.code === 'PGRST116') {
          return {
            status: 'query-failure',
            message: 'Subject enrollment not found',
            error: 'Not enrolled',
          }
        }
        return {
          status: 'query-failure',
          message: 'Failed to load subject enrollment',
          error: enrollmentRes.error.message,
        }
      }

      const subject = subjectRes.data
      const enrollment = enrollmentRes.data

      // ─── 2. Precondition Checks ─────────────────────────────────────────────

      // 2a. Unconfirmed Route
      if (enrollment.study_route === 'unconfirmed') {
        return {
          status: 'unconfirmed-route',
          message: 'Select a study route to view your target-grade mark plan.',
        }
      }

      // 2b. No Target Grade
      if (!enrollment.target_grade) {
        return {
          status: 'no-target-grade',
          message: 'Choose a target grade to view required marks and allocations.',
        }
      }

      // 2c. Intended Examination Session
      const derivedSession = deriveSessionFromDate(enrollment.exam_date)
      const intendedSession: ExamSessionSpec | null =
        options.overrideSession ?? derivedSession

      if (!intendedSession) {
        return {
          status: 'no-exam-session',
          message: 'Set an exam date or session to view thresholds and required marks.',
        }
      }

      // ─── 3. Strict Route Matching (Fix 3) ──────────────────────────────────
      const [selectionsRes, validRoutesRes, subjectPapersRes] = await Promise.all([
        supabase
          .from('subject_paper_selections')
          .select('*')
          .eq('user_subject_id', enrollment.id),
        supabase
          .from('subject_valid_routes')
          .select('*, subject_route_papers(*)')
          .eq('subject_id', subjectId)
          .eq('route', enrollment.study_route),
        supabase
          .from('subject_papers')
          .select('*')
          .eq('subject_id', subjectId)
          .order('paper_number'),
      ])

      if (selectionsRes.error) {
        return {
          status: 'query-failure',
          message: 'Failed to load paper selections',
          error: selectionsRes.error.message,
        }
      }
      if (validRoutesRes.error) {
        return {
          status: 'query-failure',
          message: 'Failed to load valid route combinations',
          error: validRoutesRes.error.message,
        }
      }
      if (subjectPapersRes.error) {
        return {
          status: 'query-failure',
          message: 'Failed to load subject paper definitions',
          error: subjectPapersRes.error.message,
        }
      }

      const paperSelections = selectionsRes.data ?? []
      const validRoutes = validRoutesRes.data ?? []
      const subjectPapers = subjectPapersRes.data ?? []

      // Match student's paper selections exactly by subject_paper_id and stage
      type RouteWithPapers = (typeof validRoutes)[number]
      let matchingRoute: RouteWithPapers | null = null

      for (const route of validRoutes) {
        const routePapers = (
          route as unknown as {
            subject_route_papers: Array<{
              subject_paper_id: string
              stage: PaperStage
            }>
          }
        ).subject_route_papers

        const matches =
          routePapers.length === paperSelections.length &&
          routePapers.every((rp) =>
            paperSelections.some(
              (ps) => ps.subject_paper_id === rp.subject_paper_id && ps.stage === rp.stage
            )
          )

        if (matches) {
          matchingRoute = route
          break
        }
      }

      // Strict route matching: no arbitrary fallback accepting mismatched paper selections
      if (!matchingRoute) {
        return {
          status: 'no-approved-combination',
          message: 'No approved qualification combination mapped for your selected route and papers.',
          route: enrollment.study_route,
          subjectCode: subject.code,
        }
      }

      // ─── 4. Publications & Compatibility-Aware Fallback (Fix 2) ───────────
      const publicationsRes = await supabase
        .from('grade_threshold_publications')
        .select('*')
        .eq('subject_id', subjectId)
        .eq('publication_status', 'published')
        .eq('is_active', true)

      if (publicationsRes.error) {
        return {
          status: 'query-failure',
          message: 'Failed to query grade threshold publications',
          error: publicationsRes.error.message,
        }
      }

      const rawPublications = publicationsRes.data ?? []
      if (rawPublications.length === 0) {
        return {
          status: 'threshold-unavailable',
          message: 'No published grade threshold data available for this subject.',
          reason: 'No published publications exist',
        }
      }

      // Filter publications on or before intended session, sorted newest first
      const seriesOrder: Record<CambridgeExamSeries, number> = {
        november: 3,
        june: 2,
        march: 1,
      }

      const candidatePublications = rawPublications
        .map((p) => ({
          id: p.id,
          year: p.exam_year,
          series: p.exam_series as CambridgeExamSeries,
          isActive: p.is_active,
          publicationStatus: p.publication_status,
          officialIndexUrl: p.official_index_url,
          officialPdfUrl: p.official_pdf_url,
          officialPublishedOn: p.official_published_on,
          publishedAt: p.published_at,
        }))
        .filter((p) => {
          if (p.year < intendedSession.year) return true
          if (p.year === intendedSession.year) {
            return seriesOrder[p.series] <= seriesOrder[intendedSession.series]
          }
          return false
        })
        .sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year
          return seriesOrder[b.series] - seriesOrder[a.series]
        })

      if (candidatePublications.length === 0) {
        return {
          status: 'threshold-unavailable',
          message: `No published Cambridge threshold series available on or before ${intendedSession.series} ${intendedSession.year}.`,
          reason: 'Future publication fallback prohibited',
        }
      }

      const candidatePubIds = candidatePublications.map((p) => p.id)

      // Component floor grade: Cambridge components are A-E. For A*, floor is Grade A!
      const componentFloorGrade =
        enrollment.target_grade === 'A*' ? 'A' : enrollment.target_grade

      // Target grade key for combinations: AS Level combinations use lowercase 'a'-'e', A-Level uses 'A*'-'E'
      const targetGradeKey =
        enrollment.study_route === 'as_only'
          ? enrollment.target_grade.toLowerCase()
          : enrollment.target_grade

      // Query combinations, marks, tokens, component variants, and benchmarks for candidate publications
      const [combinationsRes, compVariantsRes, variantBenchmarksRes] = await Promise.all([
        supabase
          .from('published_grade_threshold_combinations')
          .select('*')
          .in('publication_id', candidatePubIds)
          .eq('atlas_route_id', matchingRoute.id)
          .eq('planner_eligibility', 'eligible'),
        supabase
          .from('grade_threshold_component_variants')
          .select('id, publication_id, subject_paper_id, component_code, raw_maximum_mark, grade_threshold_component_marks(grade, threshold_mark)')
          .in('publication_id', candidatePubIds),
        supabase
          .from('published_grade_threshold_variant_benchmarks')
          .select('*')
          .in('publication_id', candidatePubIds)
          .eq('component_grade', componentFloorGrade),
      ])

      if (combinationsRes.error) {
        return {
          status: 'query-failure',
          message: 'Failed to query published combinations',
          error: combinationsRes.error.message,
        }
      }
      if (compVariantsRes.error) {
        return {
          status: 'query-failure',
          message: 'Failed to query component variants',
          error: compVariantsRes.error.message,
        }
      }
      if (variantBenchmarksRes.error) {
        return {
          status: 'query-failure',
          message: 'Failed to query approved variant benchmarks',
          error: variantBenchmarksRes.error.message,
        }
      }

      // Derive qualification level required by the route:
      // as_only requires 'as'; full_level and staged require 'a_level'.
      const expectedQualificationLevel: QualificationLevel =
        enrollment.study_route === 'as_only' ? 'as' : 'a_level'

      // Only combinations matching the exact route qualification level are eligible
      const allEligibleCombinations = (combinationsRes.data ?? []).filter(
        (c) => c.qualification_level === expectedQualificationLevel
      )
      const allComponentVariants = compVariantsRes.data ?? []
      const allVariantBenchmarks = variantBenchmarksRes.data ?? []

      const combIds = allEligibleCombinations.map((c) => c.id)

      // Query tokens and marks for these combinations
      const [combMarksRes, combTokensRes] = await Promise.all([
        combIds.length > 0
          ? supabase
              .from('grade_threshold_combination_marks')
              .select('*')
              .in('combination_id', combIds)
          : Promise.resolve({ data: [], error: null }),
        combIds.length > 0
          ? supabase
              .from('grade_threshold_combination_tokens')
              .select('*')
              .in('combination_id', combIds)
              .order('token_position')
          : Promise.resolve({ data: [], error: null }),
      ])

      if (combMarksRes.error) {
        return {
          status: 'query-failure',
          message: 'Failed to query combination grade marks',
          error: combMarksRes.error.message,
        }
      }
      if (combTokensRes.error) {
        return {
          status: 'query-failure',
          message: 'Failed to query combination tokens',
          error: combTokensRes.error.message,
        }
      }

      const allCombMarks = combMarksRes.data ?? []
      const allCombTokens = combTokensRes.data ?? []

      // Identify required route papers
      const routePapers = (
        matchingRoute as unknown as {
          subject_route_papers: Array<{
            subject_paper_id: string
            stage: PaperStage
          }>
        }
      ).subject_route_papers

      // Staged route model: AS papers are modeled as 1 carry-forward token; planning components are A2 components!
      const isStagedRoute = enrollment.study_route === 'staged'
      const requiredPlanningPapers = isStagedRoute
        ? routePapers.filter((rp) => rp.stage === 'a2')
        : routePapers

      const userVariantSelections = options.selectedVariants ?? {}

      // Identify explicit variant choices that exist in published component data
      const activeExplicitVariants = new Map<string, string>()
      for (const rp of requiredPlanningPapers) {
        const v = userVariantSelections[rp.subject_paper_id]
        if (v && v !== 'unknown') {
          const existsInAnyPub = allComponentVariants.some(
            (cv) => cv.subject_paper_id === rp.subject_paper_id && cv.component_code === v
          )
          if (existsInAnyPub) {
            activeExplicitVariants.set(rp.subject_paper_id, v)
          }
        }
      }

      // Find newest compatible publication containing eligible combination and required component data
      let selectedPublication = null
      let publicationEligibleCombinations: typeof allEligibleCombinations = []

      for (const pub of candidatePublications) {
        const pubCombs = allEligibleCombinations.filter((c) => c.publication_id === pub.id)
        if (pubCombs.length === 0) continue

        // Check if at least one combination has combination mark for targetGradeKey
        const validCombs = pubCombs.filter((c) =>
          allCombMarks.some((m) => m.combination_id === c.id && m.grade === targetGradeKey)
        )
        if (validCombs.length === 0) continue

        // Variant-aware check: combination must be compatible with selected variants, required tokens, and weighting
        const compatibleCombsForPub: typeof allEligibleCombinations = []

        for (const comb of validCombs) {
          const tokens = allCombTokens.filter((t) => t.combination_id === comb.id)

          // Staged route requirement: carry_forward token for AS
          if (isStagedRoute) {
            const hasApprovedCf = tokens.some(
              (t) =>
                t.token_kind === 'carry_forward' &&
                t.stage === 'as' &&
                t.carry_forward_mapping_status === 'approved'
            )
            if (!hasApprovedCf) continue
          }

          let combMatches = true
          for (const rp of requiredPlanningPapers) {
            const token = tokens.find(
              (t) =>
                t.token_kind === 'component_variant' &&
                t.stage === rp.stage &&
                allComponentVariants.some(
                  (v) => v.id === t.resolved_component_variant_id && v.subject_paper_id === rp.subject_paper_id
                )
            )

            if (!token) {
              combMatches = false
              break
            }

            const cv = allComponentVariants.find((v) => v.id === token.resolved_component_variant_id)
            if (!cv) {
              combMatches = false
              break
            }

            const explicitVariant = activeExplicitVariants.get(rp.subject_paper_id)
            if (explicitVariant && cv.component_code !== explicitVariant) {
              combMatches = false
              break
            }
          }

          if (combMatches) {
            compatibleCombsForPub.push(comb)
          }
        }

        if (compatibleCombsForPub.length > 0) {
          selectedPublication = pub
          publicationEligibleCombinations = validCombs
          break
        }
      }

      if (!selectedPublication || publicationEligibleCombinations.length === 0) {
        return {
          status: 'threshold-unavailable',
          message: `No compatible published Cambridge threshold series available on or before ${intendedSession.series} ${intendedSession.year}.`,
          reason: 'No published series contains an eligible combination with required components and weighting',
        }
      }

      const activePub = selectedPublication
      const isFallbackSeries =
        activePub.year !== intendedSession.year || activePub.series !== intendedSession.series

      let fallbackReason: FallbackReason | undefined = undefined
      if (isFallbackSeries) {
        const intendedPub = rawPublications.find(
          (p) => p.exam_year === intendedSession.year && p.exam_series === intendedSession.series
        )
        fallbackReason = intendedPub
          ? 'incompatible_variants_or_options'
          : 'intended_series_unpublished'
      }

      const provenance: ThresholdProvenance = {
        publicationId: activePub.id,
        examYear: activePub.year,
        examSeries: activePub.series,
        officialIndexUrl: activePub.officialIndexUrl,
        officialPdfUrl: activePub.officialPdfUrl,
        officialPublishedOn: activePub.officialPublishedOn,
        publishedAt: activePub.publishedAt,
        isFallback: isFallbackSeries,
        fallbackReason,
        intendedYear: intendedSession.year,
        intendedSeries: intendedSession.series,
      }

      // ─── 5. Variant-Aware Combination Resolution ─────────────────────────
      type CombinationRecord = (typeof publicationEligibleCombinations)[number]
      const matchingCombinations: CombinationRecord[] = []

      for (const comb of publicationEligibleCombinations) {
        const tokens = allCombTokens.filter((t) => t.combination_id === comb.id)

        // For staged route: ensure 1 approved carry_forward token for AS
        if (isStagedRoute) {
          const hasApprovedCf = tokens.some(
            (t) =>
              t.token_kind === 'carry_forward' &&
              t.stage === 'as' &&
              t.carry_forward_mapping_status === 'approved'
          )
          if (!hasApprovedCf) continue
        }

        // Check explicit component variants
        let matchesVariants = true
        for (const rp of requiredPlanningPapers) {
          const explicitVariant = userVariantSelections[rp.subject_paper_id]
          if (explicitVariant && explicitVariant !== 'unknown') {
            const token = tokens.find((t) => {
              if (t.token_kind !== 'component_variant' || t.stage !== rp.stage) return false
              const cv = allComponentVariants.find((v) => v.id === t.resolved_component_variant_id)
              return cv && cv.subject_paper_id === rp.subject_paper_id && cv.component_code === explicitVariant
            })
            if (!token) {
              matchesVariants = false
              break
            }
          }
        }

        if (matchesVariants) {
          matchingCombinations.push(comb)
        }
      }

      let resolvedCombination: CombinationRecord | null = null
      let officialCombinedTarget: WeightedMark | null = null
      let overallThresholdUnavailableReason: string | undefined = undefined
      let perPaperAllocationEligible = false

      if (matchingCombinations.length === 1) {
        // Exactly one combination resolved
        resolvedCombination = matchingCombinations[0]
        const markRow = allCombMarks.find(
          (m) => m.combination_id === resolvedCombination!.id && m.grade === targetGradeKey
        )
        if (markRow && markRow.threshold_mark != null) {
          officialCombinedTarget = weightedMark(Number(markRow.threshold_mark))
          perPaperAllocationEligible = Boolean(resolvedCombination.per_paper_allocation_eligible)
        } else {
          overallThresholdUnavailableReason = `Threshold mark missing for grade ${enrollment.target_grade}`
        }
      } else if (matchingCombinations.length > 1) {
        // Multiple combinations match (unknown variants): do NOT guess an arbitrary combination!
        officialCombinedTarget = null
        overallThresholdUnavailableReason =
          'Multiple Cambridge option combinations match this route. Select specific paper variants to resolve the exact official overall threshold.'
        perPaperAllocationEligible = false
      } else {
        // 0 combinations match (unsupported variant combination): recoverable
        officialCombinedTarget = null
        overallThresholdUnavailableReason =
          'The selected variant combination is not an approved Cambridge option code. Please adjust your paper variant selection.'
        perPaperAllocationEligible = false
      }

      // Maximum mark for combination: strictly from resolved combination, never arbitrary or averaged
      const combinedMaximumMark = resolvedCombination
        ? weightedMark(Number(resolvedCombination.maximum_mark))
        : null

      // ─── 6. Build Component Models & Available Variants ───────────────────
      const planningComponents: ComponentVariantBenchmark[] = []
      const availableVariantsMap = new Map<string, VariantOption[]>()
      const hasApprovedAverageMap = new Map<string, boolean>()
      const paperVariantErrors = new Map<string, string>()

      for (const rp of requiredPlanningPapers) {
        const paperDef = subjectPapers.find((sp) => sp.id === rp.subject_paper_id)
        if (!paperDef) continue

        // Published variants for this paper in active publication belonging to eligible combinations
        const paperVariantsInPub = allComponentVariants.filter(
          (cv) =>
            cv.publication_id === activePub.id &&
            cv.subject_paper_id === rp.subject_paper_id
        )

        // Filter to variants that actually appear in publication's eligible combinations
        const pubTokens = allCombTokens.filter((t) =>
          publicationEligibleCombinations.some((c) => c.id === t.combination_id)
        )
        const validVariants = paperVariantsInPub.filter((cv) =>
          pubTokens.some((t) => t.resolved_component_variant_id === cv.id)
        )

        const variantOptions: VariantOption[] = validVariants
          .map((v) => ({
            variantCode: v.component_code,
            label: `Variant ${v.component_code}`,
          }))
          .sort((a, b) => a.variantCode.localeCompare(b.variantCode))

        availableVariantsMap.set(rp.subject_paper_id, variantOptions)

        // Check if approved ceiling average exists
        const benchmarkRow = allVariantBenchmarks.find(
          (vb) =>
            vb.publication_id === activePub.id &&
            vb.subject_paper_id === rp.subject_paper_id
        )
        const hasApprovedAverage = Boolean(benchmarkRow && benchmarkRow.ceiling_average_mark != null)
        hasApprovedAverageMap.set(rp.subject_paper_id, hasApprovedAverage)

        // Weighting factor: sourced strictly from uniquely resolved combination, never arbitrary candidate
        let factor: WeightingFactor | null = null
        if (resolvedCombination) {
          const combTokensForComp = allCombTokens.filter((t) => t.combination_id === resolvedCombination!.id)
          const tokenForPaper = combTokensForComp.find((t) => {
            if (t.token_kind !== 'component_variant' || t.stage !== rp.stage) return false
            const cv = allComponentVariants.find((v) => v.id === t.resolved_component_variant_id)
            return cv && cv.subject_paper_id === rp.subject_paper_id
          })
          if (tokenForPaper?.weighting_factor && Number(tokenForPaper.weighting_factor) > 0) {
            factor = weightingFactor(Number(tokenForPaper.weighting_factor))
          }
        }

        const chosenVariant = userVariantSelections[rp.subject_paper_id]

        if (chosenVariant && chosenVariant !== 'unknown') {
          // Explicit variant chosen
          const variantRecord = validVariants.find((v) => v.component_code === chosenVariant)
          if (!variantRecord) {
            paperVariantErrors.set(
              rp.subject_paper_id,
              `Variant ${chosenVariant} is not available for ${paperDef.name}.`
            )
            // Model unavailable explicitly - no fallback guessing
            planningComponents.push({
              subjectPaperId: rp.subject_paper_id,
              componentPaperNumber: paperDef.paper_number,
              componentName: paperDef.name,
              stage: rp.stage,
              sourceKind: null,
              targetVariantCode: chosenVariant,
              rawMaximumMark: null,
              targetGradeFloorMark: null,
              officialWeightingFactor: factor,
              includedVariants: [],
            })
          } else {
            const marks = (
              variantRecord as unknown as {
                grade_threshold_component_marks?: Array<{
                  grade: string
                  threshold_mark: number
                }>
              }
            ).grade_threshold_component_marks

            const rawMaxNum =
              variantRecord.raw_maximum_mark != null
                ? Number(variantRecord.raw_maximum_mark)
                : null
            const isRawMaxValid =
              rawMaxNum != null && Number.isFinite(rawMaxNum) && rawMaxNum > 0

            const mRow = marks?.find((m) => m.grade === componentFloorGrade)
            const thresholdNum =
              mRow?.threshold_mark != null ? Number(mRow.threshold_mark) : null
            const isThresholdValid =
              thresholdNum != null && Number.isFinite(thresholdNum) && thresholdNum >= 0

            const isExactSourceValid = isRawMaxValid && isThresholdValid

            if (isExactSourceValid) {
              planningComponents.push({
                subjectPaperId: rp.subject_paper_id,
                componentPaperNumber: paperDef.paper_number,
                componentName: paperDef.name,
                stage: rp.stage,
                sourceKind: 'official_exact',
                targetVariantCode: chosenVariant,
                rawMaximumMark: rawMark(rawMaxNum),
                targetGradeFloorMark: rawMark(thresholdNum),
                officialWeightingFactor: factor,
                includedVariants: [chosenVariant],
              })
            } else {
              paperVariantErrors.set(
                rp.subject_paper_id,
                !isThresholdValid
                  ? `Official threshold mark for grade ${componentFloorGrade} is missing for ${paperDef.name} variant ${chosenVariant}.`
                  : `Official maximum mark is invalid for ${paperDef.name} variant ${chosenVariant}.`
              )
              planningComponents.push({
                subjectPaperId: rp.subject_paper_id,
                componentPaperNumber: paperDef.paper_number,
                componentName: paperDef.name,
                stage: rp.stage,
                sourceKind: null,
                targetVariantCode: chosenVariant,
                rawMaximumMark: isRawMaxValid ? rawMark(rawMaxNum) : null,
                targetGradeFloorMark: isThresholdValid ? rawMark(thresholdNum) : null,
                officialWeightingFactor: factor,
                includedVariants: [],
              })
            }
          }
        } else {
          // Unknown variant
          if (benchmarkRow && benchmarkRow.ceiling_average_mark != null && benchmarkRow.raw_maximum_mark != null) {
            planningComponents.push({
              subjectPaperId: rp.subject_paper_id,
              componentPaperNumber: paperDef.paper_number,
              componentName: paperDef.name,
              stage: rp.stage,
              sourceKind: 'atlas_estimate_ceiling_average',
              targetVariantCode: null,
              rawMaximumMark: rawMark(Number(benchmarkRow.raw_maximum_mark)),
              targetGradeFloorMark: rawMark(Number(benchmarkRow.ceiling_average_mark)),
              officialWeightingFactor: factor,
              includedVariants: benchmarkRow.included_variants ?? [],
            })
          } else {
            // No approved average exists: require explicit variant selection without guessing
            paperVariantErrors.set(
              rp.subject_paper_id,
              `No approved ceiling average benchmark for ${paperDef.name}. Please select an exact variant.`
            )
            planningComponents.push({
              subjectPaperId: rp.subject_paper_id,
              componentPaperNumber: paperDef.paper_number,
              componentName: paperDef.name,
              stage: rp.stage,
              sourceKind: null,
              targetVariantCode: null,
              rawMaximumMark: null,
              targetGradeFloorMark: null,
              officialWeightingFactor: factor,
              includedVariants: [],
            })
          }
        }
      }

      // ─── 7. Full-Paper History (Strictly past_papers, paginated) (Fix 8) ───
      const allPastPapers: RawPastPaperAttempt[] = []
      const pageSize = 1000
      let from = 0
      let hasMore = true

      while (hasMore) {
        const { data: pageData, error: pageErr } = await supabase
          .from('past_papers')
          .select(
            'id, subject_id, subject_paper_id, paper_number, year, session, stage, attempted_at, created_at, score_raw, score_max'
          )
          .eq('user_id', user.id)
          .eq('subject_id', subjectId)
          .order('attempted_at', { ascending: true })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1)

        if (pageErr) {
          return {
            status: 'query-failure',
            message: 'Failed to paginate full-paper attempts',
            error: pageErr.message,
          }
        }

        if (pageData && pageData.length > 0) {
          allPastPapers.push(...(pageData as unknown as RawPastPaperAttempt[]))
          if (pageData.length < pageSize) {
            hasMore = false
          } else {
            from += pageSize
          }
        } else {
          hasMore = false
        }
      }

      // Query historical component publications for past attempts
      const historicalAttemptsYears = [
        ...new Set(allPastPapers.map((p) => p.year)),
      ]

      const historicalVariantsRes = await supabase
        .from('grade_threshold_component_variants')
        .select(
          'component_code, raw_maximum_mark, grade_threshold_publications!inner(id, exam_year, exam_series, publication_status, is_active), grade_threshold_component_marks(grade, threshold_mark)'
        )
        .eq('grade_threshold_publications.subject_id', subjectId)
        .eq('grade_threshold_publications.publication_status', 'published')
        .eq('grade_threshold_publications.is_active', true)
        .in('grade_threshold_publications.exam_year', historicalAttemptsYears)

      // Propagate historical threshold query failures (Fix 6)
      if (historicalVariantsRes.error) {
        return {
          status: 'query-failure',
          message: 'Failed to query historical grade thresholds',
          error: historicalVariantsRes.error.message,
        }
      }

      const historicalMap = new Map<
        string,
        {
          rawMaximumMark: number
          thresholds: { A: number; B: number; C: number; D: number; E: number }
        }
      >()

      if (historicalVariantsRes.data) {
        type HistRow = {
          component_code: string
          raw_maximum_mark: number
          grade_threshold_publications: { exam_year: number; exam_series: string } | null
          grade_threshold_component_marks: Array<{ grade: string; threshold_mark: number }> | null
        }
        for (const row of historicalVariantsRes.data as unknown as HistRow[]) {
          const pub = row.grade_threshold_publications
          const code = row.component_code
          const marks = row.grade_threshold_component_marks
          if (pub && code && marks) {
            const rawMax = Number(row.raw_maximum_mark)
            if (!Number.isFinite(rawMax) || rawMax <= 0) continue

            const markA = marks.find((m) => m.grade === 'A')?.threshold_mark
            const markB = marks.find((m) => m.grade === 'B')?.threshold_mark
            const markC = marks.find((m) => m.grade === 'C')?.threshold_mark
            const markD = marks.find((m) => m.grade === 'D')?.threshold_mark
            const markE = marks.find((m) => m.grade === 'E')?.threshold_mark

            // Reject if any required A-E threshold is missing, negative, or non-finite (0 is valid)
            if (
              markA == null || !Number.isFinite(Number(markA)) || Number(markA) < 0 ||
              markB == null || !Number.isFinite(Number(markB)) || Number(markB) < 0 ||
              markC == null || !Number.isFinite(Number(markC)) || Number(markC) < 0 ||
              markD == null || !Number.isFinite(Number(markD)) || Number(markD) < 0 ||
              markE == null || !Number.isFinite(Number(markE)) || Number(markE) < 0
            ) {
              continue
            }

            const key = `${pub.exam_year}:${pub.exam_series}:${code}`
            historicalMap.set(key, {
              rawMaximumMark: rawMax,
              thresholds: {
                A: Number(markA),
                B: Number(markB),
                C: Number(markC),
                D: Number(markD),
                E: Number(markE),
              },
            })
          }
        }
      }

      const historicalLookup = (
        year: number,
        series: CambridgeExamSeries,
        variantCode: string
      ) => {
        const key = `${year}:${series}:${variantCode}`
        return historicalMap.get(key) ?? null
      }

      // ─── 8. Evaluate Evidence Per Component ────────────────────────────────
      const paperEvidenceMap = new Map<string, ReturnType<typeof evaluateComponentEvidence>>()

      for (const comp of planningComponents) {
        const { compatible } = filterAndNormalizeAttempts(allPastPapers, {
          subjectId,
          subjectPaperId: comp.subjectPaperId,
          componentPaperNumber: comp.componentPaperNumber,
          stage: comp.stage,
          officialComponentMax: comp.rawMaximumMark,
          targetVariantCode: comp.targetVariantCode,
          allowedVariants: comp.includedVariants,
        })

        const evidence = evaluateComponentEvidence(
          compatible,
          historicalLookup,
          comp.rawMaximumMark
        )
        paperEvidenceMap.set(comp.subjectPaperId, evidence)
      }

      // ─── 9. Latest Comparable Grade from Complete Historical Sitting ─────────
      const historicalPubIds = [
        ...new Set(
          (historicalVariantsRes.data ?? []).map(
            (r: unknown) =>
              (r as { grade_threshold_publications?: { id?: string } })
                .grade_threshold_publications?.id
          )
        ),
      ].filter(Boolean) as string[]

      let latestComparableGrade: string | null = null

      // Staged historical sitting requires AS contribution: without verified weighted AS mark, return null
      if (!isStagedRoute && historicalPubIds.length > 0) {
        const histCombsRes = await supabase
          .from('published_grade_threshold_combinations')
          .select('id, publication_id, canonical_key, qualification_level, grade_threshold_publications!inner(exam_year, exam_series)')
          .in('publication_id', historicalPubIds)
          .eq('atlas_route_id', matchingRoute.id)
          .eq('planner_eligibility', 'eligible')

        // Propagate query errors instead of silently masking them
        if (histCombsRes.error) {
          return {
            status: 'query-failure',
            message: 'Failed to query historical combinations',
            error: histCombsRes.error.message,
          }
        }

        type HistCombRow = {
          id: string
          canonical_key: string
          qualification_level?: string | null
          grade_threshold_publications: { exam_year: number; exam_series: string }
        }

        const rawHistCombs = (histCombsRes.data ?? []) as unknown as HistCombRow[]
        // Require every historical combination to have c.qualification_level === expectedQualificationLevel.
        // Filter historical combinations before constructing historicalCombinationIds to prevent unnecessary token/mark child queries.
        const histCombs = rawHistCombs.filter(
          (c) => c.qualification_level === expectedQualificationLevel
        )
        const historicalCombinationIds = histCombs.map((c) => c.id)

        if (historicalCombinationIds.length > 0) {
          const [histTokensRes, histMarksRes] = await Promise.all([
            supabase
              .from('grade_threshold_combination_tokens')
              .select('combination_id, token_kind, stage, weighting_factor, resolved_component_variant_id, grade_threshold_component_variants(subject_paper_id, component_code, raw_maximum_mark)')
              .in('combination_id', historicalCombinationIds),
            supabase
              .from('grade_threshold_combination_marks')
              .select('combination_id, grade, threshold_mark')
              .in('combination_id', historicalCombinationIds),
          ])

          if (histTokensRes.error) {
            return {
              status: 'query-failure',
              message: 'Failed to query historical combination tokens',
              error: histTokensRes.error.message,
            }
          }
          if (histMarksRes.error) {
            return {
              status: 'query-failure',
              message: 'Failed to query historical combination marks',
              error: histMarksRes.error.message,
            }
          }

          type HistTokenRow = {
            combination_id: string
            token_kind: string
            stage: string
            weighting_factor: number
            grade_threshold_component_variants: {
              subject_paper_id: string
              component_code: string
              raw_maximum_mark: number
            } | null
          }
          type HistMarkRow = {
            combination_id: string
            grade: string
            threshold_mark: number
          }

          const histTokens = (histTokensRes.data ?? []) as unknown as HistTokenRow[]
          const histMarks = (histMarksRes.data ?? []) as unknown as HistMarkRow[]

          const expectedRouteSet = routePapers.map((rp) => ({
            subjectPaperId: rp.subject_paper_id,
            stage: rp.stage,
          }))

          const historicalDefinitions: HistoricalCombinationDefinition[] = []

          for (const c of histCombs) {
            // Require every historical combination to match the route qualification level exactly
            if (c.qualification_level !== expectedQualificationLevel) {
              continue
            }
            const qualLevel: QualificationLevel = expectedQualificationLevel

            // Publication identity validation: joined record exists, year is finite integer, series is exactly march, june, or november
            const pub = c.grade_threshold_publications
            if (!pub) continue

            const yearNum = Number(pub.exam_year)
            if (!Number.isInteger(yearNum) || yearNum <= 0) continue

            const seriesStr = pub.exam_series
            if (
              seriesStr !== 'march' &&
              seriesStr !== 'june' &&
              seriesStr !== 'november'
            ) {
              continue
            }
            const validSeries: CambridgeExamSeries = seriesStr

            const tokens = histTokens.filter((t) => t.combination_id === c.id)
            const marks = histMarks.filter((m) => m.combination_id === c.id)

            const requiredComponents = tokens
              .filter(
                (t) =>
                  t.token_kind === 'component_variant' &&
                  t.grade_threshold_component_variants
              )
              .map((t) => ({
                subjectPaperId: t.grade_threshold_component_variants!.subject_paper_id,
                componentCode: t.grade_threshold_component_variants!.component_code,
                stage: t.stage as PaperStage,
                weightingFactor: Number(t.weighting_factor),
                rawMax: Number(t.grade_threshold_component_variants!.raw_maximum_mark),
              }))

            const isRouteMatch =
              requiredComponents.length === expectedRouteSet.length &&
              expectedRouteSet.every((rp) =>
                requiredComponents.some(
                  (comp) => comp.subjectPaperId === rp.subjectPaperId && comp.stage === rp.stage
                )
              )
            const hasMarks = marks.length > 0
            const hasValidComponents = requiredComponents.every(
              (comp) =>
                Number.isFinite(comp.weightingFactor) &&
                comp.weightingFactor > 0 &&
                Number.isFinite(comp.rawMax) &&
                comp.rawMax > 0
            )
            const hasValidMarks = marks.every(
              (m) =>
                m.threshold_mark != null &&
                Number.isFinite(Number(m.threshold_mark)) &&
                Number(m.threshold_mark) >= 0
            )

            if (isRouteMatch && hasMarks && hasValidComponents && hasValidMarks) {
              historicalDefinitions.push({
                combinationId: c.id,
                year: yearNum,
                series: validSeries,
                canonicalKey: c.canonical_key,
                qualificationLevel: qualLevel,
                expectedRoutePapers: expectedRouteSet,
                requiredComponents,
                combinationMarks: marks.map((m) => ({
                  grade: m.grade,
                  thresholdMark: Number(m.threshold_mark),
                })),
              })
            }
          }

          latestComparableGrade = findLatestComparableSitting(
            allPastPapers,
            historicalDefinitions,
            expectedRouteSet
          )
        }
      }

      // ─── 10. Staged Route & A* Modeling ───────────────────────────────────
      const isAStar = enrollment.target_grade === 'A*'
      const isStagedAStar = isStagedRoute && isAStar
      const isStagedNonAStar = isStagedRoute && !isAStar
      let stagedBreakdown = null

      // Weighting is only applicable to a uniquely resolved Cambridge combination
      const hasMissingWeighting =
        resolvedCombination !== null &&
        planningComponents.some((c) => c.officialWeightingFactor === null)
      const hasMissingFloorOrMax = planningComponents.some(
        (c) => c.targetGradeFloorMark === null || c.rawMaximumMark === null
      )

      // Calculate A2 maximum weighted capacity
      // Only compute capacity when ALL required components have both official weighting and raw maximum marks
      const allComponentsHaveWeightingAndMax =
        planningComponents.length > 0 &&
        planningComponents.every(
          (c) => c.officialWeightingFactor !== null && c.rawMaximumMark !== null
        )

      let a2MaxWeightedCapacity: number | null = null
      if (allComponentsHaveWeightingAndMax) {
        let capacitySum = 0
        for (const c of planningComponents) {
          capacitySum += c.officialWeightingFactor! * c.rawMaximumMark!
        }
        a2MaxWeightedCapacity = capacitySum
      }

      let asEstimatedContribution = 0
      let remainingA2Required = officialCombinedTarget ? (officialCombinedTarget as number) : 0

      if (isStagedAStar && officialCombinedTarget !== null) {
        // Model AS carry-forward as one planning contribution: ceil(combined target / 2) ONLY for Staged A*
        const breakdown = evaluateStagedAStar({
          officialCombinedTarget,
          a2MaximumWeightedMark:
            a2MaxWeightedCapacity !== null ? weightedMark(a2MaxWeightedCapacity) : null,
        })
        stagedBreakdown = breakdown
        asEstimatedContribution =
          breakdown.kind === 'estimated_halfway'
            ? breakdown.estimatedAsContribution
            : breakdown.officialWeightedAsContribution
        remainingA2Required = breakdown.remainingA2Required
      }

      // Allocation eligibility: strictly requires resolved combination, official target, weighting, and floors/maxes.
      // For staged routes targeting A-E, per-paper allocation is withheld until verified weighted AS evidence exists.
      const isAllocationEligible =
        !isStagedNonAStar &&
        resolvedCombination !== null &&
        officialCombinedTarget !== null &&
        perPaperAllocationEligible &&
        !hasMissingWeighting &&
        !hasMissingFloorOrMax

      // Safety margin calculation
      const safetyMargin: SafetyMarginOption = options.safetyMargin ?? { type: 'none' }
      const adjustedCombinedTarget =
        officialCombinedTarget !== null && combinedMaximumMark !== null
          ? applySafetyMarginToCombinedTarget(
              officialCombinedTarget,
              combinedMaximumMark,
              safetyMargin
            )
          : null

      let safetyMarginImpossible = false
      let safetyMarginImpossibleReason: string | undefined = undefined

      let targetToAllocate = weightedMark(0)
      let targetToAllocateWithMargin = targetToAllocate

      if (isAllocationEligible && officialCombinedTarget !== null) {
        targetToAllocate = weightedMark(
          isStagedRoute ? remainingA2Required : (officialCombinedTarget as number)
        )

        targetToAllocateWithMargin = targetToAllocate
        if (adjustedCombinedTarget !== null) {
          const marginBase = isStagedRoute
            ? (adjustedCombinedTarget as number) - asEstimatedContribution
            : (adjustedCombinedTarget as number)

          if (a2MaxWeightedCapacity !== null && marginBase > a2MaxWeightedCapacity) {
            safetyMarginImpossible = true
            safetyMarginImpossibleReason = `Safety margin target (${adjustedCombinedTarget}) exceeds total combination capacity.`
            targetToAllocateWithMargin = targetToAllocate
          } else {
            targetToAllocateWithMargin = weightedMark(marginBase)
          }
        }
      }

      const allocationInputs: AllocationComponentInput[] = planningComponents.map(
        (c) => ({
          subjectPaperId: c.subjectPaperId,
          componentPaperNumber: c.componentPaperNumber,
          componentName: c.componentName,
          floorRawMark: c.targetGradeFloorMark,
          maxRawMark: c.rawMaximumMark,
          weightingFactor: c.officialWeightingFactor,
          studentBaselineRawMark:
            paperEvidenceMap.get(c.subjectPaperId)?.recencyWeightedBaseline ?? null,
        })
      )

      let baseAllocation: ReturnType<typeof allocateComponentMarks> | null = null
      let marginAllocation: ReturnType<typeof allocateComponentMarks> | null = null

      if (isAllocationEligible && a2MaxWeightedCapacity !== null) {
        baseAllocation = allocateComponentMarks({
          targetCombinedMark: targetToAllocate,
          combinationMaxMark: weightedMark(a2MaxWeightedCapacity),
          components: allocationInputs,
          isAStar,
        })

        marginAllocation = allocateComponentMarks({
          targetCombinedMark: targetToAllocateWithMargin,
          combinationMaxMark: weightedMark(a2MaxWeightedCapacity),
          components: allocationInputs,
          isAStar,
        })
      }

      // Impossibility check
      const isTargetImpossible =
        isAllocationEligible &&
        baseAllocation !== null &&
        (!baseAllocation.isMathematicallyPossible ||
          (isStagedRoute &&
            a2MaxWeightedCapacity !== null &&
            remainingA2Required > a2MaxWeightedCapacity))

      // Assemble PaperPlanResults
      const paperPlans: PaperPlanResult[] = []
      let totalEstimatedCombined = 0
      let hasAllBaselines = true
      let allPapersHaveSufficientSample = true

      for (const comp of planningComponents) {
        const evidence = paperEvidenceMap.get(comp.subjectPaperId)!

        let requiredRaw: RawMark | null = null
        let requiredWithMargin: RawMark | null = null
        let isPaperAllocationAvailable = false
        let allocationUnavailableReason: string | undefined = undefined

        if (isAllocationEligible && baseAllocation && marginAllocation) {
          requiredRaw =
            baseAllocation.roundedPaperTargets.get(comp.subjectPaperId) ??
            comp.targetGradeFloorMark
          requiredWithMargin =
            marginAllocation.roundedPaperTargets.get(comp.subjectPaperId) ??
            requiredRaw
          isPaperAllocationAvailable = requiredRaw !== null
        } else {
          isPaperAllocationAvailable = false
          allocationUnavailableReason =
            paperVariantErrors.get(comp.subjectPaperId) ??
            (isStagedNonAStar
              ? 'A2 mark allocation for staged routes targeting grades A–E requires verified official AS results.'
              : overallThresholdUnavailableReason ??
                (hasMissingWeighting
                  ? 'Missing official Cambridge weighting'
                  : hasMissingFloorOrMax
                  ? 'Missing official threshold or maximum mark'
                  : 'Per-paper allocation unavailable'))
        }

        if (evidence.recencyWeightedBaseline !== null && comp.officialWeightingFactor) {
          totalEstimatedCombined +=
            comp.officialWeightingFactor * evidence.recencyWeightedBaseline
        } else {
          hasAllBaselines = false
        }

        if (!evidence.hasSufficientSample) {
          allPapersHaveSufficientSample = false
        }

        const latestGap =
          requiredRaw !== null && evidence.latestNormalizedScore !== null
            ? rawMark(requiredRaw - evidence.latestNormalizedScore)
            : null

        const lifetimeAverageGap =
          requiredRaw !== null && evidence.unweightedLifetimeAverage !== null
            ? rawMark(requiredRaw - evidence.unweightedLifetimeAverage)
            : null

        const baselineGap =
          requiredRaw !== null && evidence.recencyWeightedBaseline !== null
            ? rawMark(requiredRaw - evidence.recencyWeightedBaseline)
            : null

        paperPlans.push({
          subjectPaperId: comp.subjectPaperId,
          componentPaperNumber: comp.componentPaperNumber,
          componentName: comp.componentName,
          stage: comp.stage,
          targetVariantChoice: comp.targetVariantCode ?? 'unknown',
          sourceKind: comp.sourceKind,
          rawMaximumMark: comp.rawMaximumMark,
          benchmarkFloorMark: comp.targetGradeFloorMark,
          requiredMark: requiredRaw,
          requiredMarkWithSafetyMargin: requiredWithMargin,
          isAllocationAvailable: isPaperAllocationAvailable,
          allocationUnavailableReason,
          officialWeightingFactor: comp.officialWeightingFactor,
          evidence,
          latestGap,
          lifetimeAverageGap,
          baselineGap,
          includedVariants: comp.includedVariants,
          availableVariants: availableVariantsMap.get(comp.subjectPaperId) ?? [],
          hasApprovedAverage: hasApprovedAverageMap.get(comp.subjectPaperId) ?? false,
          variantError: paperVariantErrors.get(comp.subjectPaperId),
          isAStarEstimate: isAStar || comp.sourceKind === 'atlas_estimate_ceiling_average',
        })
      }

      // Performance claims:
      // For staged route: AS planning contribution is NOT earned student score.
      // Do not treat as earned score; keep estimatedCombinedMark, marksStillNeeded, and predicted grade null.
      let estimatedCombinedMark: WeightedMark | null = null
      let marksStillNeeded: WeightedMark | null = null
      let rollingPredictedGrade: string | null = null
      let estimatedCombinedUnavailableReason: string | undefined = undefined

      if (isStagedRoute) {
        estimatedCombinedUnavailableReason =
          'For staged routes, official AS marks must be verified before calculating combined totals.'
      } else if (!resolvedCombination) {
        estimatedCombinedUnavailableReason =
          overallThresholdUnavailableReason ??
          'Select paper variants to resolve official combination weighting.'
      } else if (hasMissingWeighting) {
        estimatedCombinedUnavailableReason =
          'Official Cambridge weighting factors are missing for this series.'
      } else if (officialCombinedTarget === null) {
        estimatedCombinedUnavailableReason =
          overallThresholdUnavailableReason ?? 'Official threshold is unavailable.'
      } else if (!hasAllBaselines) {
        estimatedCombinedUnavailableReason =
          'Log attempts for all required papers to calculate combined mark.'
      } else {
        estimatedCombinedMark = weightedMark(Math.round(totalEstimatedCombined * 10) / 10)
        marksStillNeeded =
          officialCombinedTarget !== null
            ? weightedMark(
                Math.max(0, Math.round((officialCombinedTarget - estimatedCombinedMark) * 10) / 10)
              )
            : null

        // Rolling predicted grade: strictly restricted to resolvedCombination ONLY
        if (
          allPapersHaveSufficientSample &&
          resolvedCombination &&
          resolvedCombination.qualification_level === expectedQualificationLevel
        ) {
          const combMarks = allCombMarks
            .filter((m) => m.combination_id === resolvedCombination.id)
            .map((m) => ({
              grade: m.grade,
              thresholdMark: Number(m.threshold_mark),
            }))

          rollingPredictedGrade = evaluateGradeFromThresholds(
            estimatedCombinedMark,
            combMarks,
            expectedQualificationLevel
          )
        }
      }

      const summary: SubjectLevelPlanSummary = {
        subjectId,
        subjectName: subject.name,
        subjectCode: subject.code,
        colorHex: subject.color_hex,
        studyRoute: enrollment.study_route,
        targetGrade: enrollment.target_grade!,
        officialCombinedTarget,
        combinedMaximumMark,
        estimatedCombinedMark,
        marksStillNeeded,
        latestComparableGrade,
        rollingPredictedGrade,
        stagedBreakdown,
        provenance,
        perPaperAllocationEligible: isAllocationEligible,
        safetyMargin,
        adjustedCombinedTarget,
        resolvedOptionCode: resolvedCombination?.canonical_key ?? null,
        isOptionResolved: resolvedCombination !== null,
        overallThresholdUnavailableReason,
        estimatedCombinedUnavailableReason,
        safetyMarginImpossible,
        safetyMarginImpossibleReason,
      }

      // Check for missing required threshold/maximum source data
      const hasMissingOrInvalidMax =
        combinedMaximumMark === null ||
        (combinedMaximumMark as number) <= 0 ||
        planningComponents.some(
          (c) =>
            c.targetVariantCode !== null &&
            !paperVariantErrors.get(c.subjectPaperId)?.includes('not available') &&
            (c.rawMaximumMark === null || (c.rawMaximumMark as number) <= 0)
        )

      const hasMissingFloor = planningComponents.some(
        (c) =>
          c.targetVariantCode !== null &&
          !paperVariantErrors.get(c.subjectPaperId)?.includes('not available') &&
          (c.targetGradeFloorMark === null || (c.targetGradeFloorMark as number) < 0)
      )

      const hasMissingOverallTarget =
        officialCombinedTarget === null || (officialCombinedTarget as number) < 0

      // Precedence: Threshold/Maximum unavailable takes precedence over missing-weighting and impossible-target.
      // The partial-result exception (status: 'missing-weighting') applies ONLY when weighting is the sole missing requirement.
      if (
        resolvedCombination !== null &&
        (hasMissingOrInvalidMax || hasMissingFloor || hasMissingOverallTarget)
      ) {
        if (hasMissingOrInvalidMax) {
          return {
            status: 'threshold-unavailable',
            message:
              'Official Cambridge maximum mark data is unavailable for one or more components of this option combination.',
            reason: 'Official maximum mark missing or invalid',
          }
        }
        if (hasMissingFloor) {
          return {
            status: 'threshold-unavailable',
            message: `Official Cambridge threshold mark for grade ${componentFloorGrade} is unavailable for one or more components.`,
            reason: `Official component threshold mark for grade ${componentFloorGrade} is missing`,
          }
        }
        return {
          status: 'threshold-unavailable',
          message:
            overallThresholdUnavailableReason ??
            `Official Cambridge threshold mark for grade ${enrollment.target_grade} is unavailable for option ${resolvedCombination.canonical_key}.`,
          reason: `Official combination threshold mark missing for grade ${enrollment.target_grade}`,
        }
      }

      // Check impossible target
      if (isTargetImpossible && baseAllocation) {
        return {
          status: 'impossible-target',
          summary,
          message: 'The requested target grade is mathematically impossible for this combination.',
          reason:
            baseAllocation.impossibleReason ??
            (a2MaxWeightedCapacity !== null
              ? `Target exceeds available capacity of ${a2MaxWeightedCapacity} marks.`
              : 'Target exceeds combination capacity.'),
        }
      }

      // Check missing weighting (Fix 9: Preserve useful partial results!)
      if (resolvedCombination !== null && hasMissingWeighting) {
        return {
          status: 'missing-weighting',
          summary,
          paperPlans,
          message:
            'Official combination benchmark is available, but per-paper allocation is unavailable because official Cambridge weighting is missing for one or more components.',
        }
      }

      return {
        status: 'available',
        summary,
        paperPlans,
      }
    } catch (err: unknown) {
      console.error('[getTargetGradePlan] Unexpected error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      return {
        status: 'query-failure',
        message: 'An unexpected error occurred while loading the target-grade plan.',
        error: errorMessage,
      }
    }
  }
)
