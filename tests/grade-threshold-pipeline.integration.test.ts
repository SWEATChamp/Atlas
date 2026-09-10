import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { SupabaseGradeThresholdPersistence } from '../lib/grade-thresholds/supabase-persistence'
import type {
  StagedVariantParams,
  StagedPublicationBundleParams,
} from '../lib/grade-thresholds'

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

function randomSha256Hex(): string {
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

describe('SupabaseGradeThresholdPersistence local integration tests', () => {
  let persistence: SupabaseGradeThresholdPersistence
  let client: ReturnType<SupabaseGradeThresholdPersistence['getClient']>
  let mathSubjectId: string
  let testRunIds: string[] = []
  let testPubIds: string[] = []

  beforeAll(async () => {
    persistence = new SupabaseGradeThresholdPersistence({
      supabaseUrl: LOCAL_SUPABASE_URL,
      supabaseServiceRoleKey: LOCAL_SERVICE_ROLE_KEY,
    })
    client = persistence.getClient()

    const subject = await persistence.getSubjectBySyllabus('9709')
    expect(subject).not.toBeNull()
    mathSubjectId = subject!.id
  })

  afterEach(async () => {
    // Delete in reverse order: combinations, variants, then publications
    for (const pubId of [...testPubIds].reverse()) {
      await client
        .from('grade_threshold_combinations')
        .delete()
        .eq('publication_id', pubId)
      await client
        .from('grade_threshold_component_variants')
        .delete()
        .eq('publication_id', pubId)
      await client
        .from('grade_threshold_publications')
        .delete()
        .eq('id', pubId)
    }
    testPubIds = []

    // Cascade cleanup runs
    for (const runId of testRunIds) {
      await client.from('grade_threshold_import_runs').delete().eq('id', runId)
    }
    testRunIds = []
  })

  test('executes full staging and publication lifecycle against local database', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1.0.0-integration',
    })
    testRunIds.push(runId)

    // Query subject paper 1
    const p1 = await persistence.getSubjectPaper(mathSubjectId, 1)
    expect(p1).not.toBeNull()

    const checksumHex = randomSha256Hex()
    const publicationId = await persistence.stagePublicationBundle({
      publication: {
        runId,
        subjectId: mathSubjectId,
        year: 2026,
        series: 'june',
        officialIndexUrl: 'https://www.cambridgeinternational.org/test-index',
        officialPdfUrl: 'https://www.cambridgeinternational.org/test.pdf',
        sourceChecksumSha256: checksumHex,
        revisionNumber: 1,
        parserVersion: 'v1',
      },
      variants: [
        {
          componentCode: '12',
          rawMaximumMark: 75,
          subjectPaperId: p1!.id,
          sourceLabel: 'Paper 12 Pure Mathematics 1',
          marks: [
            { grade: 'A', thresholdMark: 61 },
            { grade: 'B', thresholdMark: 51 },
            { grade: 'C', thresholdMark: 37 },
            { grade: 'D', thresholdMark: 23 },
            { grade: 'E', thresholdMark: 10 },
          ],
        },
      ],
      combinations: [
        {
          canonicalKey: '12',
          officialOptionLabel: '12',
          qualificationLevel: 'as',
          routeType: 'as_only',
          maximumMark: 75,
          weightingBasis: 'weighted_total',
          plannerEligibility: 'unreviewed',
          marks: [
            { grade: 'a', thresholdMark: 61 },
            { grade: 'b', thresholdMark: 51 },
            { grade: 'c', thresholdMark: 37 },
            { grade: 'd', thresholdMark: 23 },
            { grade: 'e', thresholdMark: 10 },
          ],
          tokens: [
            {
              tokenPosition: 1,
              rawToken: '12',
              tokenKind: 'component_variant',
              resolvedComponentCode: '12',
              stage: 'as',
              maximumMark: 75,
              carryForwardMappingStatus: null,
            },
          ],
        },
      ],
      issues: [],
      autoPublish: false,
    })
    testPubIds.push(publicationId)

    // Verify database row presence
    const { data: pubRow } = await client
      .from('grade_threshold_publications')
      .select('*')
      .eq('id', publicationId)
      .single()
    expect(pubRow.publication_status).toBe('staged')
    expect(pubRow.is_active).toBe(false)

    // Atomically publish via database function
    const publishedId = await persistence.publishPublication(publicationId)
    expect(publishedId).toBe(publicationId)

    const { data: publishedRow } = await client
      .from('grade_threshold_publications')
      .select('*')
      .eq('id', publicationId)
      .single()
    expect(publishedRow.publication_status).toBe('published')
    expect(publishedRow.is_active).toBe(true)
    expect(publishedRow.published_at).not.toBeNull()
  })

  test('negative test: PostgreSQL rejects component mark exceeding maximum mark (ERRCODE 23514)', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    // Variant has max 50, but mark A is 55
    const invalidVariants: StagedVariantParams[] = [
      {
        componentCode: '11',
        rawMaximumMark: 50,
        subjectPaperId: null,
        marks: [
          { grade: 'A', thresholdMark: 55 }, // Exceeds 50!
          { grade: 'B', thresholdMark: 40 },
          { grade: 'C', thresholdMark: 30 },
          { grade: 'D', thresholdMark: 20 },
          { grade: 'E', thresholdMark: 10 },
        ],
      },
    ]

    await expect(
      persistence.stagePublicationBundle({
        publication: {
          runId,
          subjectId: mathSubjectId,
          year: 2026,
          series: 'june',
          officialIndexUrl: 'https://www.cambridgeinternational.org/test',
          officialPdfUrl: 'https://www.cambridgeinternational.org/test.pdf',
          sourceChecksumSha256: '2222222222222222222222222222222222222222222222222222222222222222',
          revisionNumber: 1,
          parserVersion: 'v1',
        },
        variants: invalidVariants,
        combinations: [],
        issues: [],
      }),
    ).rejects.toThrow(/exceeds maximum/)
  })

  test('negative test: PostgreSQL rejects non-monotonic component marks (ERRCODE 23514)', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    // Mark B (50) is greater than mark A (45)
    const nonMonotonicVariants: StagedVariantParams[] = [
      {
        componentCode: '11',
        rawMaximumMark: 75,
        subjectPaperId: null,
        marks: [
          { grade: 'A', thresholdMark: 45 },
          { grade: 'B', thresholdMark: 50 }, // Non-monotonic!
          { grade: 'C', thresholdMark: 30 },
          { grade: 'D', thresholdMark: 20 },
          { grade: 'E', thresholdMark: 10 },
        ],
      },
    ]

    await expect(
      persistence.stagePublicationBundle({
        publication: {
          runId,
          subjectId: mathSubjectId,
          year: 2026,
          series: 'june',
          officialIndexUrl: 'https://www.cambridgeinternational.org/test',
          officialPdfUrl: 'https://www.cambridgeinternational.org/test.pdf',
          sourceChecksumSha256: '3333333333333333333333333333333333333333333333333333333333333333',
          revisionNumber: 1,
          parserVersion: 'v1',
        },
        variants: nonMonotonicVariants,
        combinations: [],
        issues: [],
      }),
    ).rejects.toThrow(/must be non-increasing/)
  })

  test('negative test: PostgreSQL rejects token maximum disagreeing with component maximum', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    // Token specifies maximumMark = 100, but variant has 75
    await expect(
      persistence.stagePublicationBundle({
        publication: {
          runId,
          subjectId: mathSubjectId,
          year: 2026,
          series: 'june',
          officialIndexUrl: 'https://www.cambridgeinternational.org/test',
          officialPdfUrl: 'https://www.cambridgeinternational.org/test.pdf',
          sourceChecksumSha256: '4444444444444444444444444444444444444444444444444444444444444444',
          revisionNumber: 1,
          parserVersion: 'v1',
        },
        variants: [
          {
            componentCode: '12',
            rawMaximumMark: 75,
            subjectPaperId: null,
            marks: [
              { grade: 'A', thresholdMark: 60 },
              { grade: 'B', thresholdMark: 50 },
              { grade: 'C', thresholdMark: 40 },
              { grade: 'D', thresholdMark: 30 },
              { grade: 'E', thresholdMark: 20 },
            ],
          },
        ],
        combinations: [
          {
            canonicalKey: '12',
            qualificationLevel: 'as',
            routeType: 'as_only',
            maximumMark: 75,
            weightingBasis: 'weighted_total',
            plannerEligibility: 'unreviewed',
            marks: [
              { grade: 'a', thresholdMark: 60 },
              { grade: 'b', thresholdMark: 50 },
              { grade: 'c', thresholdMark: 40 },
              { grade: 'd', thresholdMark: 30 },
              { grade: 'e', thresholdMark: 20 },
            ],
            tokens: [
              {
                tokenPosition: 1,
                rawToken: '12',
                tokenKind: 'component_variant',
                resolvedComponentCode: '12',
                stage: 'as',
                maximumMark: 100, // Disagrees with 75!
                carryForwardMappingStatus: null,
              },
            ],
          },
        ],
        issues: [],
      }),
    ).rejects.toThrow(/Resolved token maximum disagrees with component maximum/)
  })

  test('negative test: PostgreSQL rejects carry_forward token with non-as stage or null mapping status', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    // Carry-forward token with stage 'a2' violates constraint
    await expect(
      persistence.stagePublicationBundle({
        publication: {
          runId,
          subjectId: mathSubjectId,
          year: 2026,
          series: 'june',
          officialIndexUrl: 'https://www.cambridgeinternational.org/test',
          officialPdfUrl: 'https://www.cambridgeinternational.org/test.pdf',
          sourceChecksumSha256: '5555555555555555555555555555555555555555555555555555555555555555',
          revisionNumber: 1,
          parserVersion: 'v1',
        },
        variants: [],
        combinations: [
          {
            canonicalKey: '88',
            qualificationLevel: 'a_level',
            routeType: 'staged',
            maximumMark: 250,
            weightingBasis: 'weighted_total',
            plannerEligibility: 'unreviewed',
            marks: [
              { grade: 'A*', thresholdMark: 200 },
              { grade: 'A', thresholdMark: 180 },
              { grade: 'B', thresholdMark: 160 },
              { grade: 'C', thresholdMark: 140 },
              { grade: 'D', thresholdMark: 120 },
              { grade: 'E', thresholdMark: 100 },
            ],
            tokens: [
              {
                tokenPosition: 1,
                rawToken: '88',
                tokenKind: 'carry_forward',
                stage: 'a2', // Carry forward must be 'as'!
                carryForwardMappingStatus: 'unreviewed',
              },
            ],
          },
        ],
        issues: [],
      }),
    ).rejects.toThrow(/grade_threshold_token_carry_forward_mapping/)
  })

  test('negative test: publish_grade_threshold_publication blocks when open error issues exist', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    const pubId = await persistence.stagePublicationBundle({
      publication: {
        runId,
        subjectId: mathSubjectId,
        year: 2026,
        series: 'june',
        officialIndexUrl: 'https://www.cambridgeinternational.org/test',
        officialPdfUrl: 'https://www.cambridgeinternational.org/test.pdf',
        sourceChecksumSha256: '6666666666666666666666666666666666666666666666666666666666666666',
        revisionNumber: 1,
        parserVersion: 'v1',
      },
      variants: [],
      combinations: [],
      issues: [
        {
          runId,
          severity: 'error',
          issueCode: 'test-blocking-error',
          message: 'Unresolved critical parse error blocking publication.',
        },
      ],
    })
    testPubIds.push(pubId)

    await expect(
      persistence.publishPublication(pubId),
    ).rejects.toThrow(/Publication has unresolved validation errors/)
  })

  test('failure injection: errors during publication bundle leave zero partial rows in PostgreSQL', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    const checksumHex = randomSha256Hex()
    const bundle: StagedPublicationBundleParams = {
      publication: {
        runId,
        subjectId: mathSubjectId,
        year: 2026,
        series: 'june',
        officialIndexUrl: 'https://www.cambridgeinternational.org/test-err',
        officialPdfUrl: 'https://www.cambridgeinternational.org/test-err.pdf',
        sourceChecksumSha256: checksumHex,
        revisionNumber: 1,
        parserVersion: 'v1',
      },
      variants: [
        {
          componentCode: '12',
          rawMaximumMark: 75,
          subjectPaperId: null,
          marks: [
            { grade: 'A', thresholdMark: 60 },
            { grade: 'B', thresholdMark: 50 },
            { grade: 'C', thresholdMark: 40 },
            { grade: 'D', thresholdMark: 30 },
            { grade: 'E', thresholdMark: 20 },
          ],
        },
      ],
      combinations: [
        {
          canonicalKey: '12',
          qualificationLevel: 'as',
          routeType: 'as_only',
          maximumMark: 75,
          weightingBasis: 'weighted_total',
          plannerEligibility: 'unreviewed',
          marks: [
            // Error injection: combination mark 85 exceeds maximumMark 75
            { grade: 'a', thresholdMark: 85 },
            { grade: 'b', thresholdMark: 50 },
            { grade: 'c', thresholdMark: 40 },
            { grade: 'd', thresholdMark: 30 },
            { grade: 'e', thresholdMark: 20 },
          ],
          tokens: [
            {
              tokenPosition: 1,
              rawToken: '12',
              tokenKind: 'component_variant',
              resolvedComponentCode: '12',
              stage: 'as',
              maximumMark: 75,
            },
          ],
        },
      ],
      issues: [
        {
          runId,
          severity: 'info',
          issueCode: 'test-issue',
          message: 'Test issue message',
        },
      ],
    }

    await expect(persistence.stagePublicationBundle(bundle)).rejects.toThrow(
      /exceeds weighted maximum/,
    )

    // Verify atomic rollback: zero partial rows exist for this checksum or component variant
    const formattedBytea = `\\x${checksumHex}`
    const { data: pubs } = await client
      .from('grade_threshold_publications')
      .select('id')
      .eq('source_checksum_sha256', formattedBytea)
    expect(pubs).toHaveLength(0)

    const { data: issues } = await client
      .from('grade_threshold_import_issues')
      .select('id')
      .eq('import_run_id', runId)
      .eq('issue_code', 'test-issue')
    expect(issues).toHaveLength(0)
  })

  test('negative test: PostgreSQL rejects combination mark exceeding maximum mark', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    const checksum = randomSha256Hex()
    // Combination max is 75, but mark 'a' is 80
    await expect(
      persistence.stagePublicationBundle({
        publication: {
          runId,
          subjectId: mathSubjectId,
          year: 2026,
          series: 'june',
          officialIndexUrl: 'https://www.cambridgeinternational.org/test',
          officialPdfUrl: 'https://www.cambridgeinternational.org/test.pdf',
          sourceChecksumSha256: checksum,
          revisionNumber: 1,
          parserVersion: 'v1',
        },
        variants: [
          {
            componentCode: '12',
            rawMaximumMark: 75,
            subjectPaperId: null,
            marks: [
              { grade: 'A', thresholdMark: 60 },
              { grade: 'B', thresholdMark: 50 },
              { grade: 'C', thresholdMark: 40 },
              { grade: 'D', thresholdMark: 30 },
              { grade: 'E', thresholdMark: 20 },
            ],
          },
        ],
        combinations: [
          {
            canonicalKey: '12',
            qualificationLevel: 'as',
            routeType: 'as_only',
            maximumMark: 75,
            weightingBasis: 'weighted_total',
            plannerEligibility: 'unreviewed',
            marks: [
              { grade: 'a', thresholdMark: 80 }, // Exceeds 75!
              { grade: 'b', thresholdMark: 50 },
              { grade: 'c', thresholdMark: 40 },
              { grade: 'd', thresholdMark: 30 },
              { grade: 'e', thresholdMark: 20 },
            ],
            tokens: [
              {
                tokenPosition: 1,
                rawToken: '12',
                tokenKind: 'unresolved',
                carryForwardMappingStatus: null,
              },
            ],
          },
        ],
        issues: [],
      }),
    ).rejects.toThrow(/exceeds weighted maximum/)
  })

  test('negative test: PostgreSQL rejects combination mark grade invalid for qualification level', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    const checksum = randomSha256Hex()
    // AS combination having A-level grade 'A*'
    await expect(
      persistence.stagePublicationBundle({
        publication: {
          runId,
          subjectId: mathSubjectId,
          year: 2026,
          series: 'june',
          officialIndexUrl: 'https://www.cambridgeinternational.org/test',
          officialPdfUrl: 'https://www.cambridgeinternational.org/test.pdf',
          sourceChecksumSha256: checksum,
          revisionNumber: 1,
          parserVersion: 'v1',
        },
        variants: [
          {
            componentCode: '12',
            rawMaximumMark: 75,
            subjectPaperId: null,
            marks: [
              { grade: 'A', thresholdMark: 60 },
              { grade: 'B', thresholdMark: 50 },
              { grade: 'C', thresholdMark: 40 },
              { grade: 'D', thresholdMark: 30 },
              { grade: 'E', thresholdMark: 20 },
            ],
          },
        ],
        combinations: [
          {
            canonicalKey: '12',
            qualificationLevel: 'as',
            routeType: 'as_only',
            maximumMark: 75,
            weightingBasis: 'weighted_total',
            plannerEligibility: 'unreviewed',
            marks: [
              { grade: 'A*', thresholdMark: 65 }, // Invalid for AS level!
              { grade: 'a', thresholdMark: 60 },
              { grade: 'b', thresholdMark: 50 },
              { grade: 'c', thresholdMark: 40 },
              { grade: 'd', thresholdMark: 30 },
            ],
            tokens: [
              {
                tokenPosition: 1,
                rawToken: '12',
                tokenKind: 'unresolved',
                carryForwardMappingStatus: null,
              },
            ],
          },
        ],
        issues: [],
      }),
    ).rejects.toThrow(/is invalid for qualification level/)
  })

  test('negative test: PostgreSQL rejects token raw_token disagreeing with resolved component code', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    const checksum = randomSha256Hex()
    // Token has rawToken '13' but resolves to component code '12'
    await expect(
      persistence.stagePublicationBundle({
        publication: {
          runId,
          subjectId: mathSubjectId,
          year: 2026,
          series: 'june',
          officialIndexUrl: 'https://www.cambridgeinternational.org/test',
          officialPdfUrl: 'https://www.cambridgeinternational.org/test.pdf',
          sourceChecksumSha256: checksum,
          revisionNumber: 1,
          parserVersion: 'v1',
        },
        variants: [
          {
            componentCode: '12',
            rawMaximumMark: 75,
            subjectPaperId: null,
            marks: [
              { grade: 'A', thresholdMark: 60 },
              { grade: 'B', thresholdMark: 50 },
              { grade: 'C', thresholdMark: 40 },
              { grade: 'D', thresholdMark: 30 },
              { grade: 'E', thresholdMark: 20 },
            ],
          },
        ],
        combinations: [
          {
            canonicalKey: '13',
            qualificationLevel: 'as',
            routeType: 'as_only',
            maximumMark: 75,
            weightingBasis: 'weighted_total',
            plannerEligibility: 'unreviewed',
            marks: [
              { grade: 'a', thresholdMark: 60 },
              { grade: 'b', thresholdMark: 50 },
              { grade: 'c', thresholdMark: 40 },
              { grade: 'd', thresholdMark: 30 },
              { grade: 'e', thresholdMark: 20 },
            ],
            tokens: [
              {
                tokenPosition: 1,
                rawToken: '13', // Disagrees with resolved component code '12'!
                tokenKind: 'component_variant',
                resolvedComponentCode: '12',
                stage: 'as',
                maximumMark: 75,
                carryForwardMappingStatus: null,
              },
            ],
          },
        ],
        issues: [],
      }),
    ).rejects.toThrow(/Raw token must exactly equal the resolved official component code/)
  })

  test('negative test: PostgreSQL rejects token linking to unapproved weighting source', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    // Stage unreviewed weighting source with unique checksum
    const wsChecksum = randomSha256Hex()
    const ws = await persistence.stageWeightingSource({
      subjectId: mathSubjectId,
      documentYear: 2026,
      examSeries: 'june',
      officialDocumentUrl: 'https://www.cambridgeinternational.org/factors.pdf',
      sourceChecksumSha256: wsChecksum,
      sourceLabel: 'Weighting Factors 2026',
      entries: [
        {
          rawToken: '12',
          tokenKind: 'component_variant',
          rawMaximum: 75,
          weightedMaximum: 75,
          officialWeightingFactor: 1.0,
          sourcePage: 1,
        },
      ],
    })
    const entryId = ws.entries.get('12')!.id

    const pubChecksum = randomSha256Hex()
    await expect(
      persistence.stagePublicationBundle({
        publication: {
          runId,
          subjectId: mathSubjectId,
          year: 2026,
          series: 'june',
          officialIndexUrl: 'https://www.cambridgeinternational.org/test',
          officialPdfUrl: 'https://www.cambridgeinternational.org/test.pdf',
          sourceChecksumSha256: pubChecksum,
          revisionNumber: 1,
          parserVersion: 'v1',
        },
        variants: [
          {
            componentCode: '12',
            rawMaximumMark: 75,
            subjectPaperId: null,
            marks: [
              { grade: 'A', thresholdMark: 60 },
              { grade: 'B', thresholdMark: 50 },
              { grade: 'C', thresholdMark: 40 },
              { grade: 'D', thresholdMark: 30 },
              { grade: 'E', thresholdMark: 20 },
            ],
          },
        ],
        combinations: [
          {
            canonicalKey: '12',
            qualificationLevel: 'as',
            routeType: 'as_only',
            maximumMark: 75,
            weightingBasis: 'weighted_total',
            plannerEligibility: 'unreviewed',
            marks: [
              { grade: 'a', thresholdMark: 60 },
              { grade: 'b', thresholdMark: 50 },
              { grade: 'c', thresholdMark: 40 },
              { grade: 'd', thresholdMark: 30 },
              { grade: 'e', thresholdMark: 20 },
            ],
            tokens: [
              {
                tokenPosition: 1,
                rawToken: '12',
                tokenKind: 'component_variant',
                resolvedComponentCode: '12',
                stage: 'as',
                maximumMark: 75,
                weightingFactor: 1.0,
                weightingEntryId: entryId, // Links to unapproved source!
                carryForwardMappingStatus: null,
              },
            ],
          },
        ],
        issues: [],
      }),
    ).rejects.toThrow(/Weighting source must be approved/)
  })

  test('negative test: PostgreSQL blocks direct mutation of weighting entries (ERRCODE 55000)', async () => {
    const wsChecksum = randomSha256Hex()
    const ws = await persistence.stageWeightingSource({
      subjectId: mathSubjectId,
      documentYear: 2026,
      examSeries: 'november',
      officialDocumentUrl: 'https://www.cambridgeinternational.org/factors-nov.pdf',
      sourceChecksumSha256: wsChecksum,
      sourceLabel: 'Weighting Factors Nov 2026',
      entries: [
        {
          rawToken: '11',
          tokenKind: 'component_variant',
          rawMaximum: 75,
          weightedMaximum: 75,
          officialWeightingFactor: 1.0,
          sourcePage: 1,
        },
      ],
    })
    const entryId = ws.entries.get('11')!.id

    // Attempt to update the immutable weighting entry
    const { error: updateError } = await client
      .from('grade_threshold_weighting_entries')
      .update({ raw_maximum: 100 })
      .eq('id', entryId)

    expect(updateError).not.toBeNull()
    expect(updateError?.message).toContain('Official weighting entries are immutable')
  })

  test('negative test: PostgreSQL rejects revision 2 without revises_publication_id (ERRCODE 23514)', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    const checksum = randomSha256Hex()
    // Attempting revision 2 with revises_publication_id = null violates check constraint
    await expect(
      persistence.stagePublicationBundle({
        publication: {
          runId,
          subjectId: mathSubjectId,
          year: 2026,
          series: 'june',
          officialIndexUrl: 'https://www.cambridgeinternational.org/test',
          officialPdfUrl: 'https://www.cambridgeinternational.org/test.pdf',
          sourceChecksumSha256: checksum,
          revisionNumber: 2,
          revisesPublicationId: undefined, // Missing!
          parserVersion: 'v1',
        },
        variants: [],
        combinations: [],
        issues: [],
      }),
    ).rejects.toThrow(/grade_threshold_publications_revision_root/)
  })

  test('failure injection: errors during weighting source bundle leave zero partial rows in PostgreSQL', async () => {
    const wsChecksum = randomSha256Hex()

    // Error injection: entry has rawMaximum <= 0 (check constraint violation)
    await expect(
      persistence.stageWeightingSource({
        subjectId: mathSubjectId,
        documentYear: 2026,
        examSeries: 'june',
        officialDocumentUrl: 'https://www.cambridgeinternational.org/test-err.pdf',
        sourceChecksumSha256: wsChecksum,
        sourceLabel: 'Weighting Error Test',
        entries: [
          {
            rawToken: '12',
            tokenKind: 'component_variant',
            rawMaximum: -10, // Invalid mark <= 0
            weightedMaximum: 75,
            officialWeightingFactor: 1.0,
            sourcePage: 1,
          },
        ],
      }),
    ).rejects.toThrow()

    // Verify atomic rollback: zero weighting source rows exist for this checksum
    const formattedBytea = `\\x${wsChecksum}`
    const { data: sources } = await client
      .from('grade_threshold_weighting_sources')
      .select('id')
      .eq('source_checksum_sha256', formattedBytea)
    expect(sources).toHaveLength(0)
  })

  test('regression: stagePublicationBundle rejects auto_publish = true on revision 2 (ERRCODE 23514)', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    const rev1Checksum = randomSha256Hex()
    const rev1Id = await persistence.stagePublicationBundle({
      publication: {
        runId,
        subjectId: mathSubjectId,
        year: 2026,
        series: 'june',
        officialIndexUrl: 'https://www.cambridgeinternational.org/test',
        officialPdfUrl: 'https://www.cambridgeinternational.org/test.pdf',
        sourceChecksumSha256: rev1Checksum,
        revisionNumber: 1,
        parserVersion: 'v1',
      },
      variants: [
        {
          componentCode: '12',
          rawMaximumMark: 75,
          subjectPaperId: null,
          marks: [
            { grade: 'A', thresholdMark: 60 },
            { grade: 'B', thresholdMark: 50 },
            { grade: 'C', thresholdMark: 40 },
            { grade: 'D', thresholdMark: 30 },
            { grade: 'E', thresholdMark: 20 },
          ],
        },
      ],
      combinations: [
        {
          canonicalKey: '12',
          qualificationLevel: 'as',
          routeType: 'as_only',
          maximumMark: 75,
          weightingBasis: 'weighted_total',
          plannerEligibility: 'unreviewed',
          marks: [
            { grade: 'a', thresholdMark: 60 },
            { grade: 'b', thresholdMark: 50 },
            { grade: 'c', thresholdMark: 40 },
            { grade: 'd', thresholdMark: 30 },
            { grade: 'e', thresholdMark: 20 },
          ],
          tokens: [
            {
              tokenPosition: 1,
              rawToken: '12',
              tokenKind: 'component_variant',
              resolvedComponentCode: '12',
              stage: 'as',
              maximumMark: 75,
            },
          ],
        },
      ],
      issues: [],
      autoPublish: true,
    })
    testPubIds.push(rev1Id)

    // Now attempt to stage revision 2 with auto_publish = true
    const rev2Checksum = randomSha256Hex()
    await expect(
      persistence.stagePublicationBundle({
        publication: {
          runId,
          subjectId: mathSubjectId,
          year: 2026,
          series: 'june',
          officialIndexUrl: 'https://www.cambridgeinternational.org/test',
          officialPdfUrl: 'https://www.cambridgeinternational.org/test.pdf',
          sourceChecksumSha256: rev2Checksum,
          revisionNumber: 2,
          revisesPublicationId: rev1Id,
          parserVersion: 'v1',
        },
        variants: [
          {
            componentCode: '12',
            rawMaximumMark: 75,
            subjectPaperId: null,
            marks: [
              { grade: 'A', thresholdMark: 61 },
              { grade: 'B', thresholdMark: 51 },
              { grade: 'C', thresholdMark: 41 },
              { grade: 'D', thresholdMark: 31 },
              { grade: 'E', thresholdMark: 21 },
            ],
          },
        ],
        combinations: [
          {
            canonicalKey: '12',
            qualificationLevel: 'as',
            routeType: 'as_only',
            maximumMark: 75,
            weightingBasis: 'weighted_total',
            plannerEligibility: 'unreviewed',
            marks: [
              { grade: 'a', thresholdMark: 61 },
              { grade: 'b', thresholdMark: 51 },
              { grade: 'c', thresholdMark: 41 },
              { grade: 'd', thresholdMark: 31 },
              { grade: 'e', thresholdMark: 21 },
            ],
            tokens: [
              {
                tokenPosition: 1,
                rawToken: '12',
                tokenKind: 'component_variant',
                resolvedComponentCode: '12',
                stage: 'as',
                maximumMark: 75,
              },
            ],
          },
        ],
        issues: [],
        autoPublish: true, // Must be rejected by database function
      }),
    ).rejects.toThrow(
      /Changed-checksum revisions require separate administrative review and cannot be auto-published/,
    )
  })

  test('approveWeightingSource administratively approves an unreviewed source and allows token linking', async () => {
    const wsChecksum = randomSha256Hex()
    const ws = await persistence.stageWeightingSource({
      subjectId: mathSubjectId,
      documentYear: 2026,
      examSeries: 'june',
      officialDocumentUrl: 'https://www.cambridgeinternational.org/factors-approval.pdf',
      sourceChecksumSha256: wsChecksum,
      sourceLabel: 'Weighting Factors for Approval Test',
      entries: [
        {
          rawToken: '12',
          tokenKind: 'component_variant',
          rawMaximum: 75,
          weightedMaximum: 75,
          officialWeightingFactor: 1.0,
          sourcePage: 1,
        },
      ],
    })

    // Initially unreviewed
    const initialWs = await persistence.getWeightingSource(mathSubjectId, 2026, 'june', wsChecksum)
    expect(initialWs?.reviewStatus).toBe('unreviewed')

    // Administratively approve
    const approvedId = await persistence.approveWeightingSource(
      ws.id,
      'senior-curator@atlas.edu',
      '2026-09-03T10:00:00Z',
    )
    expect(approvedId).toBe(ws.id)

    // Now query and check it is approved in the database
    const approvedWs = await persistence.getWeightingSource(mathSubjectId, 2026, 'june', wsChecksum)
    expect(approvedWs?.reviewStatus).toBe('approved')

    // Verify token can now be staged linking to this weighting entry
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    const pubChecksum = randomSha256Hex()
    const entryId = approvedWs!.entries.get('12')!.id

    const pubId = await persistence.stagePublicationBundle({
      publication: {
        runId,
        subjectId: mathSubjectId,
        year: 2026,
        series: 'june',
        officialIndexUrl: 'https://www.cambridgeinternational.org/test-linked',
        officialPdfUrl: 'https://www.cambridgeinternational.org/test-linked.pdf',
        sourceChecksumSha256: pubChecksum,
        revisionNumber: 1,
        parserVersion: 'v1',
      },
      variants: [
        {
          componentCode: '12',
          rawMaximumMark: 75,
          subjectPaperId: null,
          marks: [
            { grade: 'A', thresholdMark: 60 },
            { grade: 'B', thresholdMark: 50 },
            { grade: 'C', thresholdMark: 40 },
            { grade: 'D', thresholdMark: 30 },
            { grade: 'E', thresholdMark: 20 },
          ],
        },
      ],
      combinations: [
        {
          canonicalKey: '12',
          qualificationLevel: 'as',
          routeType: 'as_only',
          maximumMark: 75,
          weightingBasis: 'weighted_total',
          plannerEligibility: 'unreviewed',
          marks: [
            { grade: 'a', thresholdMark: 60 },
            { grade: 'b', thresholdMark: 50 },
            { grade: 'c', thresholdMark: 40 },
            { grade: 'd', thresholdMark: 30 },
            { grade: 'e', thresholdMark: 20 },
          ],
          tokens: [
            {
              tokenPosition: 1,
              rawToken: '12',
              tokenKind: 'component_variant',
              resolvedComponentCode: '12',
              stage: 'as',
              maximumMark: 75,
              weightingFactor: 1.0,
              weightingEntryId: entryId, // Links to approved entry!
            },
          ],
        },
      ],
      issues: [],
    })
    testPubIds.push(pubId)

    expect(pubId).toBeDefined()
  })

  test('complete revision lifecycle in database: rev 1 published, rev 2 staged, rev 3 arrives, publishing rev 3 supersedes rev 1 and earlier staged rev 2', async () => {
    const runId = await persistence.createImportRun({
      triggerKind: 'manual',
      parserVersion: 'v1',
    })
    testRunIds.push(runId)

    const baseVariants = [
      {
        componentCode: '13',
        rawMaximumMark: 75,
        subjectPaperId: null,
        marks: [
          { grade: 'A' as const, thresholdMark: 60 },
          { grade: 'B' as const, thresholdMark: 50 },
          { grade: 'C' as const, thresholdMark: 40 },
          { grade: 'D' as const, thresholdMark: 30 },
          { grade: 'E' as const, thresholdMark: 20 },
        ],
      },
    ]

    const baseCombinations = [
      {
        canonicalKey: '13',
        qualificationLevel: 'as' as const,
        routeType: 'as_only' as const,
        maximumMark: 75,
        weightingBasis: 'weighted_total' as const,
        plannerEligibility: 'unreviewed' as const,
        marks: [
          { grade: 'a', thresholdMark: 60 },
          { grade: 'b', thresholdMark: 50 },
          { grade: 'c', thresholdMark: 40 },
          { grade: 'd', thresholdMark: 30 },
          { grade: 'e', thresholdMark: 20 },
        ],
        tokens: [
          {
            tokenPosition: 1,
            rawToken: '13',
            tokenKind: 'component_variant' as const,
            resolvedComponentCode: '13',
            stage: 'as' as const,
            maximumMark: 75,
          },
        ],
      },
    ]

    // 1. Revision 1 published with autoPublish: true
    const checksum1 = randomSha256Hex()
    const rev1Id = await persistence.stagePublicationBundle({
      publication: {
        runId,
        subjectId: mathSubjectId,
        year: 2026,
        series: 'june',
        officialIndexUrl: 'https://www.cambridgeinternational.org/lifecycle-index',
        officialPdfUrl: 'https://www.cambridgeinternational.org/lifecycle-v1.pdf',
        sourceChecksumSha256: checksum1,
        revisionNumber: 1,
        parserVersion: 'v1',
      },
      variants: baseVariants,
      combinations: baseCombinations,
      issues: [],
      autoPublish: true,
    })
    testPubIds.push(rev1Id)

    const rev1 = await persistence.getActivePublication(mathSubjectId, 2026, 'june')
    expect(rev1?.id).toBe(rev1Id)
    expect(rev1?.publicationStatus).toBe('published')
    expect(rev1?.isActive).toBe(true)

    // 2. Checksum 2 arrives: staged as revision 2, revises rev 1
    const checksum2 = randomSha256Hex()
    const rev2Id = await persistence.stagePublicationBundle({
      publication: {
        runId,
        subjectId: mathSubjectId,
        year: 2026,
        series: 'june',
        officialIndexUrl: 'https://www.cambridgeinternational.org/lifecycle-index',
        officialPdfUrl: 'https://www.cambridgeinternational.org/lifecycle-v2.pdf',
        sourceChecksumSha256: checksum2,
        revisionNumber: 2,
        revisesPublicationId: rev1Id,
        parserVersion: 'v1',
      },
      variants: baseVariants,
      combinations: baseCombinations,
      issues: [],
      autoPublish: false,
    })
    testPubIds.push(rev2Id)

    // 3. Query getLatestPublication: correctly returns revision 2
    const latestAfterRev2 = await persistence.getLatestPublication(mathSubjectId, 2026, 'june')
    expect(latestAfterRev2?.id).toBe(rev2Id)
    expect(latestAfterRev2?.revisionNumber).toBe(2)

    // 4. Checksum 3 arrives: staged as revision 3, revises rev 2
    const checksum3 = randomSha256Hex()
    const rev3Id = await persistence.stagePublicationBundle({
      publication: {
        runId,
        subjectId: mathSubjectId,
        year: 2026,
        series: 'june',
        officialIndexUrl: 'https://www.cambridgeinternational.org/lifecycle-index',
        officialPdfUrl: 'https://www.cambridgeinternational.org/lifecycle-v3.pdf',
        sourceChecksumSha256: checksum3,
        revisionNumber: 3,
        revisesPublicationId: rev2Id,
        parserVersion: 'v1',
      },
      variants: baseVariants,
      combinations: baseCombinations,
      issues: [],
      autoPublish: false,
    })
    testPubIds.push(rev3Id)

    // 5. Admin publishes revision 3
    const publishedRev3Id = await persistence.publishPublication(rev3Id)
    expect(publishedRev3Id).toBe(rev3Id)

    // Verify active publication is now revision 3
    const currentActive = await persistence.getActivePublication(mathSubjectId, 2026, 'june')
    expect(currentActive?.id).toBe(rev3Id)
    expect(currentActive?.revisionNumber).toBe(3)
    expect(currentActive?.isActive).toBe(true)

    // Verify revision 1 and revision 2 are superseded
    const { data: allRevs } = await client
      .from('grade_threshold_publications')
      .select('id, revision_number, publication_status, is_active')
      .in('id', [rev1Id, rev2Id, rev3Id])
      .order('revision_number', { ascending: true })

    expect(allRevs).toHaveLength(3)
    expect(allRevs![0]).toMatchObject({ id: rev1Id, revision_number: 1, publication_status: 'superseded', is_active: false })
    expect(allRevs![1]).toMatchObject({ id: rev2Id, revision_number: 2, publication_status: 'superseded', is_active: false })
    expect(allRevs![2]).toMatchObject({ id: rev3Id, revision_number: 3, publication_status: 'published', is_active: true })
  })

  test('weighting approval boundary: direct staging RPC with approved review_status fails atomically and leaves zero rows', async () => {
    const wsChecksum = randomSha256Hex()
    const rawPayload = {
      subject_id: mathSubjectId,
      document_year: 2026,
      exam_series: 'june',
      official_document_url: 'https://www.cambridgeinternational.org/factors-boundary.pdf',
      source_checksum_sha256: `\\x${wsChecksum}`,
      source_label: 'Boundary Test',
      review_status: 'approved', // Attempting to stage as approved!
      entries: [
        {
          raw_token: '12',
          token_kind: 'component_variant',
          raw_maximum: 75,
          weighted_maximum: 75,
          official_weighting_factor: 1.0,
          source_page: 1,
        },
      ],
    }

    const { error } = await client.rpc(
      'stage_grade_threshold_weighting_source_bundle',
      { p_bundle: rawPayload },
    )
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/Weighting sources must be staged as unreviewed without reviewer metadata/)

    // Verify zero rows in database
    const { data: sources } = await client
      .from('grade_threshold_weighting_sources')
      .select('id')
      .eq('source_checksum_sha256', `\\x${wsChecksum}`)
    expect(sources).toHaveLength(0)
  })

  test('weighting approval boundary: direct staging RPC with reviewer metadata fails atomically and leaves zero rows', async () => {
    const wsChecksum = randomSha256Hex()
    const rawPayload = {
      subject_id: mathSubjectId,
      document_year: 2026,
      exam_series: 'june',
      official_document_url: 'https://www.cambridgeinternational.org/factors-boundary-meta.pdf',
      source_checksum_sha256: `\\x${wsChecksum}`,
      source_label: 'Boundary Meta Test',
      reviewed_by: 'unauthorized-admin', // Attempting to supply reviewer metadata!
      entries: [
        {
          raw_token: '12',
          token_kind: 'component_variant',
          raw_maximum: 75,
          weighted_maximum: 75,
          official_weighting_factor: 1.0,
          source_page: 1,
        },
      ],
    }

    const { error } = await client.rpc(
      'stage_grade_threshold_weighting_source_bundle',
      { p_bundle: rawPayload },
    )
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/Weighting sources must be staged as unreviewed without reviewer metadata/)

    // Verify zero rows in database
    const { data: sources } = await client
      .from('grade_threshold_weighting_sources')
      .select('id')
      .eq('source_checksum_sha256', `\\x${wsChecksum}`)
    expect(sources).toHaveLength(0)
  })

  test('weighting approval boundary: approveWeightingSource strictly enforces unreviewed -> approved transition', async () => {
    const wsChecksum = randomSha256Hex()
    const ws = await persistence.stageWeightingSource({
      subjectId: mathSubjectId,
      documentYear: 2026,
      examSeries: 'june',
      officialDocumentUrl: 'https://www.cambridgeinternational.org/factors-transition.pdf',
      sourceChecksumSha256: wsChecksum,
      sourceLabel: 'Transition Test',
      entries: [
        {
          rawToken: '12',
          tokenKind: 'component_variant',
          rawMaximum: 75,
          weightedMaximum: 75,
          officialWeightingFactor: 1.0,
          sourcePage: 1,
        },
      ],
    })

    // First approval: succeeds (unreviewed -> approved)
    const approvedId = await persistence.approveWeightingSource(
      ws.id,
      'curator@atlas.edu',
      '2026-09-03T12:00:00Z',
    )
    expect(approvedId).toBe(ws.id)

    // Second approval: must fail (already approved, cannot transition approved -> approved)
    await expect(
      persistence.approveWeightingSource(
        ws.id,
        'second-curator@atlas.edu',
        '2026-09-03T12:01:00Z',
      ),
    ).rejects.toThrow(/Only unreviewed weighting sources can be approved/)
  })
})
