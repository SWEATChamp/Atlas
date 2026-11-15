import { describe, expect, it } from 'vitest'
import type {
  CarryForwardEvidenceRecord,
  CarryForwardOptionGroup,
  ConfirmedCarryForwardEvidenceRecord,
  ConfirmedTerritoryScope,
  ExamSessionIdentity,
  NonEmptyReadonlyArray,
  OfficialDocumentSourceProvenance,
  TerritoryScope,
} from '@/lib/grade-thresholds/types'
import {
  rawMark,
  weightedMark,
  percentage,
  pum,
  type CalendarValidityAssessment,
  type CalendarValidityMeasurement,
  type CalendarValidityOutcome,
  type CarryForwardPlannerResolution,
  type ExamSessionSpec,
  type PolicyProvenance,
  type RawMark,
  type WeightedMark,
} from '@/lib/planner'

/**
 * Fictional test provenance builder.
 * Purely synthetic identifiers; no real-world authorities or real territory codes.
 */
function createSyntheticProvenance(
  overrides?: Partial<OfficialDocumentSourceProvenance>
): OfficialDocumentSourceProvenance {
  return {
    documentTitle: 'Synthetic Syllabus Guide 2099',
    issuer: 'Fictional Assessment Authority',
    sourceUrl: 'https://fictional-authority.example.test/synthetic-guide.pdf',
    checksumSha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    pageLocator: 'Section 99, Page 999',
    publicationOrEffectiveDate: '2099-01-01',
    reviewerIdentity: 'synthetic-auditor-99',
    reviewTimestamp: '2099-01-02T00:00:00.000Z',
    evidenceVersion: 'v99.0-synthetic',
    ...overrides,
  }
}

function createSyntheticPolicyProvenance(
  overrides?: Partial<PolicyProvenance>
): PolicyProvenance {
  return {
    policyDocumentTitle: 'Fictional Staged Assessment Regulations 2099',
    policyPublisher: 'Fictional Assessment Authority',
    policyUrl: 'https://fictional-authority.example.test/regulations-2099.pdf',
    policyLocator: 'Regulation 14.2',
    publishedOrEffectiveDate: '2098-12-01',
    ...overrides,
  }
}

describe('Milestone 5 Slice 2B: Hardened Carry-Forward Evidence Contracts & Resolution Types', () => {
  // ─── 1. Non-empty arrays enforced for confirmed evidence ───────────────────
  it('1. enforces non-empty readonly arrays for confirmed components, variants, and territory scope', () => {
    const emptyStringArray: readonly string[] = []

    // Compile-time checks: NonEmptyReadonlyArray rejects empty arrays
    // @ts-expect-error NonEmptyReadonlyArray cannot be empty
    const _invalidEmptyComponents: NonEmptyReadonlyArray<string> = emptyStringArray
    expect(_invalidEmptyComponents).toBeDefined()

    const validComponents: NonEmptyReadonlyArray<string> = ['32', '52']
    expect(validComponents).toHaveLength(2)

    // Confirmed scope basis: administrative_zone requires non-empty administrativeZones
    const _invalidZoneScope: ConfirmedTerritoryScope = {
      scopeBasis: 'administrative_zone',
      // @ts-expect-error administrativeZones cannot be empty in administrative_zone scope
      administrativeZones: emptyStringArray,
      scopeDeclaration: 'Synthetic Zone A declared',
    }
    expect(_invalidZoneScope).toBeDefined()

    // Confirmed scope basis: territory requires non-empty includedTerritories
    const _invalidTerritoryScope: ConfirmedTerritoryScope = {
      scopeBasis: 'territory',
      // @ts-expect-error includedTerritories cannot be empty in territory scope
      includedTerritories: emptyStringArray,
      scopeDeclaration: 'Territory Alpha declared',
    }
    expect(_invalidTerritoryScope).toBeDefined()

    // Valid confirmed scopes
    const validZoneScope: ConfirmedTerritoryScope = {
      scopeBasis: 'administrative_zone',
      administrativeZones: ['Synthetic Zone A'],
      scopeDeclaration: 'Confirmed for Synthetic Zone A',
    }
    const validTerritoryScope: ConfirmedTerritoryScope = {
      scopeBasis: 'territory',
      includedTerritories: ['Territory Alpha'],
      scopeDeclaration: 'Confirmed for Territory Alpha',
    }
    const validGlobalScope: ConfirmedTerritoryScope = {
      scopeBasis: 'global',
      scopeDeclaration: 'Confirmed global scope for all synthetic jurisdictions',
    }

    const validScopeWrapper: TerritoryScope = {
      status: 'confirmed',
      ...validTerritoryScope,
    }

    expect(validZoneScope.scopeBasis).toBe('administrative_zone')
    expect(validTerritoryScope.scopeBasis).toBe('territory')
    expect(validGlobalScope.scopeBasis).toBe('global')
    expect(validScopeWrapper.status).toBe('confirmed')
  })

  // ─── 2. Many-to-one option codes mapping to identical raw token ────────────
  it('2. losslessly represents multiple option codes mapping to the same raw carry-forward token without collapsing them', () => {
    const sittingSession: ExamSessionIdentity = {
      year: 2099,
      series: 'june',
      qualificationTitle: 'Fictional Synthetic Qualification',
      syllabusCode: 'SYNTH_9901',
    }
    const carriedFromSession: ExamSessionIdentity = {
      year: 2098,
      series: 'june',
      qualificationTitle: 'Fictional Synthetic Qualification',
      syllabusCode: 'SYNTH_9901',
    }

    const recordAlpha: ConfirmedCarryForwardEvidenceRecord = {
      status: 'confirmed',
      id: 'synth-rec-alpha-001',
      syllabusCode: 'SYNTH_9901',
      entryOptionCode: 'SYNTH_OPT_ALPHA',
      combinationKey: 'SYNTH_9901_ALPHA',
      rawCarryForwardToken: 'SYNTH_SHARED_TOKEN_888',
      sittingSession,
      carriedFromSession,
      sittingComponents: ['32', '52'],
      carriedAsComponents: ['12', '22'],
      applicablePaperVariants: ['12', '22', '32', '52'],
      territoryScope: {
        status: 'confirmed',
        scopeBasis: 'territory',
        includedTerritories: ['Territory Alpha'],
        scopeDeclaration: 'Confirmed for Territory Alpha in synthetic guide',
      },
      provenance: createSyntheticProvenance(),
      authorization: {
        authorizedBy: 'synthetic-auditor-alpha',
        authorizedAt: '2099-01-02T12:00:00.000Z',
      },
    }

    const recordBeta: ConfirmedCarryForwardEvidenceRecord = {
      status: 'confirmed',
      id: 'synth-rec-beta-002',
      syllabusCode: 'SYNTH_9901',
      entryOptionCode: 'SYNTH_OPT_BETA',
      combinationKey: 'SYNTH_9901_BETA',
      rawCarryForwardToken: 'SYNTH_SHARED_TOKEN_888',
      sittingSession,
      carriedFromSession,
      sittingComponents: ['32', '42'],
      carriedAsComponents: ['12', '22'],
      applicablePaperVariants: ['12', '22', '32', '42'],
      territoryScope: {
        status: 'confirmed',
        scopeBasis: 'territory',
        includedTerritories: ['Territory Alpha'],
        scopeDeclaration: 'Confirmed for Territory Alpha in synthetic guide',
      },
      provenance: createSyntheticProvenance(),
      authorization: {
        authorizedBy: 'synthetic-auditor-beta',
        authorizedAt: '2099-01-02T12:00:00.000Z',
      },
    }

    expect(recordAlpha.rawCarryForwardToken).toBe('SYNTH_SHARED_TOKEN_888')
    expect(recordBeta.rawCarryForwardToken).toBe('SYNTH_SHARED_TOKEN_888')
    expect(recordAlpha.id).not.toBe(recordBeta.id)
    expect(recordAlpha.entryOptionCode).toBe('SYNTH_OPT_ALPHA')
    expect(recordBeta.entryOptionCode).toBe('SYNTH_OPT_BETA')
    expect(recordAlpha.sittingComponents).toEqual(['32', '52'])
    expect(recordBeta.sittingComponents).toEqual(['32', '42'])

    const group: CarryForwardOptionGroup = {
      groupId: 'synth-group-001',
      syllabusCode: 'SYNTH_9901',
      sittingSession,
      mappings: [recordAlpha, recordBeta],
    }
    expect(group.mappings).toHaveLength(2)
    expect(group.mappings[0].entryOptionCode).toBe('SYNTH_OPT_ALPHA')
    expect(group.mappings[1].entryOptionCode).toBe('SYNTH_OPT_BETA')
  })

  // ─── 3. Single canonical evidence source in resolved_compatible ────────────
  it('3. builds resolved_compatible from one canonical confirmed evidence object and rejects contradictory duplicate properties', () => {
    const confirmedRecord: ConfirmedCarryForwardEvidenceRecord = {
      status: 'confirmed',
      id: 'rec-confirmed-canonical',
      syllabusCode: 'SYNTH_9902',
      entryOptionCode: 'OPT_CANONICAL',
      combinationKey: 'SYNTH_9902_CANONICAL',
      rawCarryForwardToken: 'SYNTH_TOKEN_CANONICAL',
      sittingSession: {
        year: 2099,
        series: 'june',
        qualificationTitle: 'Fictional Qualification',
        syllabusCode: 'SYNTH_9902',
      },
      carriedFromSession: {
        year: 2098,
        series: 'june',
        qualificationTitle: 'Fictional Qualification',
        syllabusCode: 'SYNTH_9902',
      },
      sittingComponents: ['32', '52'],
      carriedAsComponents: ['12', '22'],
      territoryScope: {
        status: 'confirmed',
        scopeBasis: 'territory',
        includedTerritories: ['Territory Alpha'],
        scopeDeclaration: 'Confirmed for Territory Alpha',
      },
      provenance: createSyntheticProvenance(),
      authorization: {
        authorizedBy: 'auditor-verifier',
        authorizedAt: '2099-01-01T00:00:00.000Z',
      },
    }

    const calendarValidity: CalendarValidityAssessment & {
      readonly outcome: { readonly status: 'within_window'; readonly withinWindowReason: string }
    } = {
      measurementBasis: 'elapsed_months',
      elapsedMonths: 12,
      maximumAllowedMonths: 13,
      policyProvenance: createSyntheticPolicyProvenance(),
      outcome: {
        status: 'within_window',
        withinWindowReason: 'Elapsed 12 months is within 13-month calendar policy',
      },
    }

    // Valid resolved_compatible retains only planner results and embeds confirmedEvidence
    const validResolution: CarryForwardPlannerResolution = {
      status: 'resolved_compatible',
      confirmedEvidence: confirmedRecord,
      studentTerritoryOrZone: 'Territory Alpha',
      officialWeightedAsContribution: weightedMark(85),
      maxWeightedAsContribution: weightedMark(100),
      calendarValidity,
    }

    expect(validResolution.status).toBe('resolved_compatible')
    expect(validResolution.confirmedEvidence.syllabusCode).toBe('SYNTH_9902')
    expect(validResolution.confirmedEvidence.entryOptionCode).toBe('OPT_CANONICAL')
    expect(validResolution.confirmedEvidence.sittingComponents).toEqual(['32', '52'])
    expect(validResolution.confirmedEvidence.carriedAsComponents).toEqual(['12', '22'])

    // Compile-time checks: duplicate evidence-derived properties are rejected on resolved_compatible
    const _invalidContradictorySyllabus: CarryForwardPlannerResolution = {
      status: 'resolved_compatible',
      // @ts-expect-error contradictory duplicate property syllabusCode is not permitted on resolved_compatible
      syllabusCode: 'SYNTH_CONTRADICTORY_CODE',
      confirmedEvidence: confirmedRecord,
      studentTerritoryOrZone: 'Territory Alpha',
      officialWeightedAsContribution: weightedMark(85),
      maxWeightedAsContribution: weightedMark(100),
      calendarValidity,
    }
    expect(_invalidContradictorySyllabus).toBeDefined()

    const _invalidContradictoryOption: CarryForwardPlannerResolution = {
      status: 'resolved_compatible',
      // @ts-expect-error contradictory duplicate property entryOptionCode is not permitted on resolved_compatible
      entryOptionCode: 'OPT_CONTRADICTORY',
      confirmedEvidence: confirmedRecord,
      studentTerritoryOrZone: 'Territory Alpha',
      officialWeightedAsContribution: weightedMark(85),
      maxWeightedAsContribution: weightedMark(100),
      calendarValidity,
    }
    expect(_invalidContradictoryOption).toBeDefined()
  })

  // ─── 4. Rejection of unconfirmed records from resolved_compatible ──────────
  it('4. strictly requires confirmed evidence for resolved_compatible and rejects unconfirmed records at compile-time', () => {
    const sittingSession: ExamSessionIdentity = {
      year: 2099,
      series: 'june',
      qualificationTitle: 'Fictional Qualification',
      syllabusCode: 'SYNTH_9904',
    }

    const unresolvedRecord: CarryForwardEvidenceRecord = {
      status: 'unresolved',
      id: 'rec-unresolved',
      syllabusCode: 'SYNTH_9904',
      entryOptionCode: 'OPT_UNRESOLVED',
      combinationKey: 'SYNTH_9904_UNRESOLVED',
      rawCarryForwardToken: 'TOKEN_X',
      sittingSession,
      unresolvedReasons: ['Awaiting regional guide verification'],
      territoryScope: null,
    }

    const ambiguousRecord: CarryForwardEvidenceRecord = {
      status: 'ambiguous',
      id: 'rec-ambig',
      syllabusCode: 'SYNTH_9904',
      entryOptionCode: 'OPT_AMBIG',
      combinationKey: 'SYNTH_9904_AMBIG',
      rawCarryForwardToken: 'TOKEN_Y',
      sittingSession,
      candidateMappings: [],
      ambiguityReason: 'Conflicting historical circulars',
    }

    const unsupportedRecord: CarryForwardEvidenceRecord = {
      status: 'unsupported',
      id: 'rec-unsupported',
      syllabusCode: 'SYNTH_9904',
      entryOptionCode: 'OPT_UNSUPP',
      combinationKey: 'SYNTH_9904_UNSUPP',
      rawCarryForwardToken: 'TOKEN_U',
      sittingSession,
      unsupportedReason: 'Not supported in territory',
    }

    const rejectedRecord: CarryForwardEvidenceRecord = {
      status: 'rejected',
      id: 'rec-rejected',
      syllabusCode: 'SYNTH_9904',
      entryOptionCode: 'OPT_REJ',
      combinationKey: 'SYNTH_9904_REJ',
      rawCarryForwardToken: 'TOKEN_Z',
      sittingSession,
      rejectionReason: 'Non-official source',
      rejectedBy: 'auditor-1',
      rejectedAt: '2099-01-01T00:00:00.000Z',
    }

    const noEvidenceRecord: CarryForwardEvidenceRecord = {
      status: 'no_evidence',
      syllabusCode: 'SYNTH_9904',
      combinationKey: 'SYNTH_9904_NONE',
      rawCarryForwardToken: 'TOKEN_NONE',
      sittingSession,
      explanation: 'No evidence submitted',
    }

    // Compile-time checks: unconfirmed records cannot satisfy ConfirmedCarryForwardEvidenceRecord
    // @ts-expect-error unresolved record is not assignable to ConfirmedCarryForwardEvidenceRecord
    const _invalidUnresolved: ConfirmedCarryForwardEvidenceRecord = unresolvedRecord
    expect(_invalidUnresolved).toBeDefined()

    // @ts-expect-error ambiguous record is not assignable to ConfirmedCarryForwardEvidenceRecord
    const _invalidAmbig: ConfirmedCarryForwardEvidenceRecord = ambiguousRecord
    expect(_invalidAmbig).toBeDefined()

    // @ts-expect-error unsupported record is not assignable to ConfirmedCarryForwardEvidenceRecord
    const _invalidUnsupported: ConfirmedCarryForwardEvidenceRecord = unsupportedRecord
    expect(_invalidUnsupported).toBeDefined()

    // @ts-expect-error rejected record is not assignable to ConfirmedCarryForwardEvidenceRecord
    const _invalidRej: ConfirmedCarryForwardEvidenceRecord = rejectedRecord
    expect(_invalidRej).toBeDefined()

    // @ts-expect-error no_evidence record is not assignable to ConfirmedCarryForwardEvidenceRecord
    const _invalidNoEvidence: ConfirmedCarryForwardEvidenceRecord = noEvidenceRecord
    expect(_invalidNoEvidence).toBeDefined()

    // Free-form string cannot satisfy confirmedEvidence boundary
    // @ts-expect-error free-form string cannot satisfy ConfirmedCarryForwardEvidenceRecord
    const _invalidStringEvidence: ConfirmedCarryForwardEvidenceRecord = 'rec-confirmed-valid'
    expect(_invalidStringEvidence).toBeDefined()
  })

  // ─── 5. Calendar validity measurement basis model ──────────────────────────
  it('5. requires an explicit measurement basis and rejects assessments missing required basis fields', () => {
    const policy = createSyntheticPolicyProvenance()
    const outcomeWithin: CalendarValidityOutcome = {
      status: 'within_window',
      withinWindowReason: 'Policy satisfied',
    }

    // 1. Assessment missing measurement basis entirely is rejected
    const _invalidNoBasis = {
      maximumAllowedMonths: 13,
      policyProvenance: policy,
      outcome: outcomeWithin,
    }
    // @ts-expect-error calendar assessment with no measurementBasis is rejected
    const _typeCheckedNoBasis: CalendarValidityAssessment = _invalidNoBasis
    expect(_typeCheckedNoBasis).toBeDefined()

    // 2. elapsed_months basis without elapsedMonths is rejected
    const _invalidMissingMonths = {
      measurementBasis: 'elapsed_months' as const,
      maximumAllowedMonths: 13,
      policyProvenance: policy,
      outcome: outcomeWithin,
    }
    // @ts-expect-error elapsed_months basis requires elapsedMonths property
    const _typeCheckedMissingMonths: CalendarValidityAssessment = _invalidMissingMonths
    expect(_typeCheckedMissingMonths).toBeDefined()

    // 3. exact_dates basis without evaluatedDates is rejected
    const _invalidNoDatesObject = {
      measurementBasis: 'exact_dates' as const,
      maximumAllowedMonths: 13,
      policyProvenance: policy,
      outcome: outcomeWithin,
    }
    // @ts-expect-error exact_dates basis requires evaluatedDates object
    const _typeCheckedNoDates: CalendarValidityAssessment = _invalidNoDatesObject
    expect(_typeCheckedNoDates).toBeDefined()

    // 4. exact_dates basis with missing target date is rejected
    const _invalidIncompleteDates = {
      measurementBasis: 'exact_dates' as const,
      evaluatedDates: {
        carriedFromSessionDate: '2098-06-01',
      },
      maximumAllowedMonths: 13,
      policyProvenance: policy,
      outcome: outcomeWithin,
    }
    // @ts-expect-error evaluatedDates requires both carriedFromSessionDate and targetSittingSessionDate
    const _typeCheckedIncompleteDates: CalendarValidityAssessment = _invalidIncompleteDates
    expect(_typeCheckedIncompleteDates).toBeDefined()

    // Valid elapsed_months assessment compiles cleanly
    const validElapsedMonthsAssessment: CalendarValidityAssessment = {
      measurementBasis: 'elapsed_months',
      elapsedMonths: 12,
      maximumAllowedMonths: 13,
      policyProvenance: policy,
      outcome: outcomeWithin,
    }
    const measurementElapsed: CalendarValidityMeasurement = validElapsedMonthsAssessment
    expect(measurementElapsed.measurementBasis).toBe('elapsed_months')
    expect(validElapsedMonthsAssessment.elapsedMonths).toBe(12)

    // Valid exact_dates assessment compiles cleanly with optional derivedElapsedMonths
    const validExactDatesAssessment: CalendarValidityAssessment = {
      measurementBasis: 'exact_dates',
      evaluatedDates: {
        carriedFromSessionDate: '2098-06-01',
        targetSittingSessionDate: '2099-06-01',
      },
      derivedElapsedMonths: 12,
      maximumAllowedMonths: 13,
      policyProvenance: policy,
      outcome: outcomeWithin,
    }
    const measurementExact: CalendarValidityMeasurement = validExactDatesAssessment
    expect(measurementExact.measurementBasis).toBe('exact_dates')
    expect(validExactDatesAssessment.evaluatedDates.carriedFromSessionDate).toBe('2098-06-01')
    expect(validExactDatesAssessment.derivedElapsedMonths).toBe(12)
  })

  // ─── 6. Separate evidence scope from student evaluation (territory mismatch) ─
  it('6. models territory mismatch as a planner outcome while preserving confirmed evidence integrity', () => {
    const confirmedEvidenceBeta: ConfirmedCarryForwardEvidenceRecord = {
      status: 'confirmed',
      id: 'synth-rec-beta-only',
      syllabusCode: 'SYNTH_9903',
      entryOptionCode: 'OPT_BETA_ONLY',
      combinationKey: 'SYNTH_9903_BETA',
      rawCarryForwardToken: 'SYNTH_TOKEN_BETA',
      sittingSession: {
        year: 2099,
        series: 'june',
        qualificationTitle: 'Fictional Synthetic Qualification',
        syllabusCode: 'SYNTH_9903',
      },
      carriedFromSession: {
        year: 2098,
        series: 'june',
        qualificationTitle: 'Fictional Synthetic Qualification',
        syllabusCode: 'SYNTH_9903',
      },
      sittingComponents: ['33', '53'],
      carriedAsComponents: ['13', '23'],
      territoryScope: {
        status: 'confirmed',
        scopeBasis: 'territory',
        includedTerritories: ['Territory Beta'],
        scopeDeclaration: 'Confirmed exclusively for Territory Beta per synthetic guide',
      },
      provenance: createSyntheticProvenance(),
      authorization: {
        authorizedBy: 'auditor-regional',
        authorizedAt: '2099-01-05T00:00:00.000Z',
      },
    }

    const mismatchResolution: CarryForwardPlannerResolution = {
      status: 'territory_mismatch',
      confirmedEvidence: confirmedEvidenceBeta,
      studentTerritoryOrZone: 'Territory Alpha',
      mismatchReason:
        'Option OPT_BETA_ONLY is confirmed for Territory Beta but candidate is registered in Territory Alpha',
    }

    expect(mismatchResolution.status).toBe('territory_mismatch')
    expect(mismatchResolution.confirmedEvidence.status).toBe('confirmed')
    expect(mismatchResolution.studentTerritoryOrZone).toBe('Territory Alpha')
    expect(mismatchResolution.mismatchReason).toContain('Territory Beta')

    const unresolvedScopeResolution: CarryForwardPlannerResolution = {
      status: 'territory_scope_unresolved',
      syllabusCode: 'SYNTH_9903',
      entryOptionCode: 'OPT_UNRESOLVED',
      studentTerritoryOrZone: 'Territory Alpha',
      reason: 'Official documentation does not specify regional scope for this option code',
    }
    expect(unresolvedScopeResolution.status).toBe('territory_scope_unresolved')
    expect(unresolvedScopeResolution.status).not.toBe(mismatchResolution.status)
  })

  // ─── 7. Stale outside validity window models session context at boundary ────
  it('7. models stale outcome context at the outcome boundary without internal duplication', () => {
    const historicalSession: ExamSessionSpec = { year: 2097, series: 'june' }
    const targetSittingSession: ExamSessionSpec = { year: 2099, series: 'june' }

    const staleAssessment: CalendarValidityAssessment & {
      readonly outcome: { readonly status: 'stale'; readonly staleReason: string }
    } = {
      measurementBasis: 'elapsed_months',
      elapsedMonths: 24,
      maximumAllowedMonths: 13,
      policyProvenance: createSyntheticPolicyProvenance(),
      outcome: {
        status: 'stale',
        staleReason: 'Elapsed 24 calendar months exceeds maximum 13 months allowed by Regulation 14.2',
      },
    }

    const staleResolution: CarryForwardPlannerResolution = {
      status: 'stale_outside_validity_window',
      syllabusCode: 'SYNTH_9905',
      entryOptionCode: 'OPT_STALE',
      historicalSession,
      targetSittingSession,
      calendarValidity: staleAssessment,
      reason: 'Carried AS result is outside the 13-month calendar validity window',
    }

    expect(staleResolution.status).toBe('stale_outside_validity_window')
    expect(staleResolution.historicalSession.year).toBe(2097)
    expect(staleResolution.targetSittingSession.year).toBe(2099)
    expect(staleResolution.calendarValidity.maximumAllowedMonths).toBe(13)
    expect(staleResolution.calendarValidity.outcome.status).toBe('stale')
  })

  // ─── 8. Raw and weighted mark types noninterchangeable ──────────────────────
  it('8. enforces that branded RawMark and WeightedMark are strictly noninterchangeable', () => {
    const raw = rawMark(50)
    const weighted = weightedMark(50)
    const pct = percentage(50)
    const p = pum(50)

    expect(raw).toBe(50)
    expect(weighted).toBe(50)
    expect(pct).toBe(50)
    expect(p).toBe(50)

    // @ts-expect-error RawMark is not assignable to WeightedMark
    const _invalidW: WeightedMark = raw
    expect(_invalidW).toBeDefined()

    // @ts-expect-error WeightedMark is not assignable to RawMark
    const _invalidR: RawMark = weighted
    expect(_invalidR).toBeDefined()

    // @ts-expect-error Plain number is not assignable to WeightedMark
    const _invalidPlainW: WeightedMark = 50
    expect(_invalidPlainW).toBeDefined()

    // @ts-expect-error Plain number is not assignable to RawMark
    const _invalidPlainR: RawMark = 50
    expect(_invalidPlainR).toBeDefined()

    // @ts-expect-error Percentage is not assignable to WeightedMark
    const _invalidPctToW: WeightedMark = pct
    expect(_invalidPctToW).toBeDefined()

    // @ts-expect-error Pum is not assignable to RawMark
    const _invalidPumToR: RawMark = p
    expect(_invalidPumToR).toBeDefined()
  })

  // ─── 9. Exhaustive discrimination across all planner resolution outcomes ───
  it('9. discriminates cleanly across all planner resolution outcomes', () => {
    function getResolutionSummary(resolution: CarryForwardPlannerResolution): string {
      switch (resolution.status) {
        case 'resolved_compatible':
          return `Resolved: AS mark ${resolution.officialWeightedAsContribution}`
        case 'territory_mismatch':
          return `Mismatch: student in ${resolution.studentTerritoryOrZone}`
        case 'territory_scope_unresolved':
          return `Territory unresolved: ${resolution.reason}`
        case 'ambiguous_historical_result':
          return `Ambiguous: ${resolution.candidateHistoricalSessions.length} sessions`
        case 'stale_outside_validity_window':
          return `Stale: max ${resolution.calendarValidity.maximumAllowedMonths} months`
        case 'missing_official_weighted_as_contribution':
          return `Missing weighting: raw was ${resolution.rawMarkProvided}`
        case 'unsupported_option_or_combination':
          return `Unsupported: ${resolution.reason}`
      }
    }

    const testSitting: ExamSessionSpec = { year: 2099, series: 'june' }
    const testCarried: ExamSessionSpec = { year: 2098, series: 'june' }

    const confirmedEv: ConfirmedCarryForwardEvidenceRecord = {
      status: 'confirmed',
      id: 'rec-test-9',
      syllabusCode: 'SYNTH_9907',
      entryOptionCode: 'OPT_9',
      combinationKey: 'SYNTH_9907_OPT9',
      rawCarryForwardToken: 'TOKEN_9',
      sittingSession: {
        year: 2099,
        series: 'june',
        qualificationTitle: 'Fictional Qualification',
        syllabusCode: 'SYNTH_9907',
      },
      carriedFromSession: {
        year: 2098,
        series: 'june',
        qualificationTitle: 'Fictional Qualification',
        syllabusCode: 'SYNTH_9907',
      },
      sittingComponents: ['31', '51'],
      carriedAsComponents: ['11', '21'],
      territoryScope: {
        status: 'confirmed',
        scopeBasis: 'territory',
        includedTerritories: ['Territory Alpha'],
        scopeDeclaration: 'Confirmed for Territory Alpha',
      },
      provenance: createSyntheticProvenance(),
      authorization: { authorizedBy: 'auditor-9', authorizedAt: '2099-01-01T00:00:00.000Z' },
    }

    const res1: CarryForwardPlannerResolution = {
      status: 'resolved_compatible',
      confirmedEvidence: confirmedEv,
      studentTerritoryOrZone: 'Territory Alpha',
      officialWeightedAsContribution: weightedMark(75),
      maxWeightedAsContribution: weightedMark(100),
      calendarValidity: {
        measurementBasis: 'elapsed_months',
        elapsedMonths: 12,
        maximumAllowedMonths: 13,
        policyProvenance: createSyntheticPolicyProvenance(),
        outcome: { status: 'within_window', withinWindowReason: 'Within 13 months' },
      },
    }

    const res2: CarryForwardPlannerResolution = {
      status: 'territory_mismatch',
      confirmedEvidence: confirmedEv,
      studentTerritoryOrZone: 'Territory Beta',
      mismatchReason: 'Evidence is confirmed for Territory Alpha, not Territory Beta',
    }

    const resStale: CarryForwardPlannerResolution = {
      status: 'stale_outside_validity_window',
      syllabusCode: 'SYNTH_9907',
      historicalSession: testCarried,
      targetSittingSession: testSitting,
      calendarValidity: {
        measurementBasis: 'exact_dates',
        evaluatedDates: {
          carriedFromSessionDate: '2097-06-01',
          targetSittingSessionDate: '2099-06-01',
        },
        derivedElapsedMonths: 24,
        maximumAllowedMonths: 13,
        policyProvenance: createSyntheticPolicyProvenance(),
        outcome: { status: 'stale', staleReason: 'Expired' },
      },
      reason: 'Expired result',
    }

    expect(getResolutionSummary(res1)).toBe('Resolved: AS mark 75')
    expect(getResolutionSummary(res2)).toBe('Mismatch: student in Territory Beta')
    expect(getResolutionSummary(resStale)).toBe('Stale: max 13 months')
  })
})
