import type { CambridgeSeries, CambridgeThresholdSource, ThresholdSection } from './types'

export type CompletenessStatus =
  | 'missing'
  | 'staged'
  | 'invalid'
  | 'review_required'
  | 'published'

export interface CountComparison {
  readonly expected: number
  readonly observed: number | null
  readonly matches: boolean
}

export interface SubjectSectionCompleteness {
  readonly component: CountComparison
  readonly 'a-level-linear': CountComparison
  readonly 'a-level-staged': CountComparison
  readonly 'as-level': CountComparison
}

export interface SubjectPersistedTableCompleteness {
  readonly componentVariants: CountComparison
  readonly componentMarks: CountComparison
  readonly combinations: CountComparison
  readonly combinationTokens: CountComparison
  readonly combinationMarks: CountComparison
  readonly weightingEntries?: CountComparison
}

export interface ObservedPublicationCounts {
  readonly subjectId?: string
  readonly publicationId?: string
  readonly revisionNumber?: number
  readonly publicationStatus?: string
  readonly isActive?: boolean
  readonly checksumSha256?: string
  readonly sectionCounts: Readonly<Record<ThresholdSection, number>>
  readonly tableCounts: {
    readonly componentVariants: number
    readonly componentMarks: number
    readonly combinations: number
    readonly combinationTokens: number
    readonly combinationMarks: number
    readonly weightingEntries?: number
  }
  readonly weightingReviewStatus?: string
  readonly openErrorCount?: number
  readonly issueCodes?: readonly string[]
}

export interface SubjectCompletenessReport {
  readonly syllabusCode: string
  readonly syllabusName: string
  readonly year: number
  readonly series: CambridgeSeries
  readonly status: CompletenessStatus
  readonly actionRequired: string
  readonly subjectId?: string
  readonly publicationId?: string
  readonly revisionNumber?: number
  readonly publicationStatus?: string
  readonly checksumSha256?: string
  readonly sections: SubjectSectionCompleteness
  readonly persistedTables: SubjectPersistedTableCompleteness
  readonly issueCodes: readonly string[]
}

export interface GradeThresholdCompletenessReport {
  readonly generatedAt: string
  readonly overallStatus: 'complete' | 'action_required' | 'incomplete'
  readonly totalsByState: Readonly<Record<CompletenessStatus, number>>
  readonly subjects: readonly SubjectCompletenessReport[]
}

export interface SubjectCompletenessInput {
  readonly source: CambridgeThresholdSource
  readonly observed?: ObservedPublicationCounts | null
  readonly reviewRequired?: boolean
  readonly awaitingMultiSourceReview?: boolean
  readonly weightingCovered?: boolean
  readonly invalid?: boolean
  readonly issueCodes?: readonly string[]
  readonly expectedWeightingEntries?: number
  readonly expectedTokenCount?: number
}

function compareCount(expected: number, observed: number | null): CountComparison {
  return {
    expected,
    observed,
    matches: observed !== null && observed === expected,
  }
}

export function buildGradeThresholdCompletenessReport(
  inputs: readonly SubjectCompletenessInput[],
  now: () => Date = () => new Date(),
): GradeThresholdCompletenessReport {
  const generatedAt = now().toISOString()
  const totalsByState: Record<CompletenessStatus, number> = {
    missing: 0,
    staged: 0,
    invalid: 0,
    review_required: 0,
    published: 0,
  }

  const subjects: SubjectCompletenessReport[] = inputs.map((input) => {
    const { source, observed } = input
    const expectedSections = source.expectedStructure.rowCounts
    const expectedVariants = expectedSections.component
    const expectedComponentMarks = expectedVariants * 5
    const expectedCombinations =
      expectedSections['a-level-linear'] +
      expectedSections['a-level-staged'] +
      expectedSections['as-level']
    const expectedCombinationMarks =
      (expectedSections['a-level-linear'] + expectedSections['a-level-staged']) * 6 +
      expectedSections['as-level'] * 5
    const expectedTokens =
      input.expectedTokenCount ??
      source.expectedStructure.expectedTokenCount ??
      observed?.tableCounts.combinationTokens ??
      0

    const sections: SubjectSectionCompleteness = {
      component: compareCount(expectedSections.component, observed ? observed.sectionCounts.component : null),
      'a-level-linear': compareCount(
        expectedSections['a-level-linear'],
        observed ? observed.sectionCounts['a-level-linear'] : null,
      ),
      'a-level-staged': compareCount(
        expectedSections['a-level-staged'],
        observed ? observed.sectionCounts['a-level-staged'] : null,
      ),
      'as-level': compareCount(expectedSections['as-level'], observed ? observed.sectionCounts['as-level'] : null),
    }

    const persistedTables: SubjectPersistedTableCompleteness = {
      componentVariants: compareCount(
        expectedVariants,
        observed ? observed.tableCounts.componentVariants : null,
      ),
      componentMarks: compareCount(
        expectedComponentMarks,
        observed ? observed.tableCounts.componentMarks : null,
      ),
      combinations: compareCount(
        expectedCombinations,
        observed ? observed.tableCounts.combinations : null,
      ),
      combinationTokens: compareCount(
        expectedTokens,
        observed ? observed.tableCounts.combinationTokens : null,
      ),
      combinationMarks: compareCount(
        expectedCombinationMarks,
        observed ? observed.tableCounts.combinationMarks : null,
      ),
      ...(input.expectedWeightingEntries !== undefined
        ? {
            weightingEntries: compareCount(
              input.expectedWeightingEntries,
              observed?.tableCounts.weightingEntries ?? null,
            ),
          }
        : {}),
    }

    const issueCodes = [
      ...new Set([...(input.issueCodes ?? []), ...(observed?.issueCodes ?? [])]),
    ]

    const allSectionsMatch =
      sections.component.matches &&
      sections['a-level-linear'].matches &&
      sections['a-level-staged'].matches &&
      sections['as-level'].matches

    const allTablesMatch =
      persistedTables.componentVariants.matches &&
      persistedTables.componentMarks.matches &&
      persistedTables.combinations.matches &&
      persistedTables.combinationTokens.matches &&
      persistedTables.combinationMarks.matches &&
      (persistedTables.weightingEntries ? persistedTables.weightingEntries.matches : true)

    let status: CompletenessStatus
    let actionRequired: string

    const weightingMissingOrUnapproved =
      input.weightingCovered === false ||
      (observed?.weightingReviewStatus !== undefined && observed.weightingReviewStatus !== 'approved')

    if (
      input.invalid ||
      (observed?.openErrorCount ?? 0) > 0 ||
      observed?.publicationStatus === 'rejected' ||
      (observed && (!allSectionsMatch || !allTablesMatch))
    ) {
      status = 'invalid'
      actionRequired =
        'Inspect validation issues or expected-versus-observed count mismatches before publishing.'
    } else if (!observed) {
      if (input.reviewRequired) {
        status = 'review_required'
        actionRequired = 'Review newly detected manifest change or checksum before importing.'
      } else {
        status = 'missing'
        actionRequired = 'Stage the reviewed threshold publication for this subject and session.'
      }
    } else if (observed.publicationStatus === 'staged') {
      if (input.awaitingMultiSourceReview || input.reviewRequired || weightingMissingOrUnapproved) {
        status = 'review_required'
        actionRequired = weightingMissingOrUnapproved
          ? 'Staged without approved session weighting; planner paper-by-paper allocation is unavailable until reviewed weighting is approved.'
          : 'Staged in a multi-source or revised batch awaiting explicit administrative review and activation.'
      } else {
        status = 'staged'
        actionRequired = 'Staged cleanly; awaiting separate administrative publication.'
      }
    } else if (
      input.reviewRequired ||
      (observed.checksumSha256 &&
        observed.checksumSha256 !== source.expectedChecksumSha256)
    ) {
      status = 'review_required'
      actionRequired = 'Checksum or session drift detected; review manifest and stage new revision.'
    } else if (observed.publicationStatus === 'published' && observed.isActive) {
      if (
        weightingMissingOrUnapproved ||
        (input.expectedWeightingEntries !== undefined && !observed.weightingReviewStatus)
      ) {
        status = 'review_required'
        actionRequired =
          'Session weighting is missing, uncovered, or unapproved; planner allocation is unavailable and requires review.'
      } else {
        status = 'published'
        actionRequired = 'Complete and active; no action required.'
      }
    } else {
      status = 'missing'
      actionRequired = 'No active published revision exists; review and stage publication.'
    }

    totalsByState[status] += 1

    return {
      syllabusCode: source.syllabusCode,
      syllabusName: source.syllabusName,
      year: source.year,
      series: source.series,
      status,
      actionRequired,
      subjectId: observed?.subjectId,
      publicationId: observed?.publicationId,
      revisionNumber: observed?.revisionNumber,
      publicationStatus: observed?.publicationStatus,
      checksumSha256: observed?.checksumSha256,
      sections,
      persistedTables,
      issueCodes,
    }
  })

  const overallStatus =
    totalsByState.invalid > 0 || totalsByState.missing > 0
      ? 'incomplete'
      : totalsByState.staged > 0 || totalsByState.review_required > 0
        ? 'action_required'
        : 'complete'

  return {
    generatedAt,
    overallStatus,
    totalsByState,
    subjects,
  }
}
