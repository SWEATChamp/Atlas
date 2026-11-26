import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseReconcileArgs, runReconcileCli } from '../scripts/reconcile-june-2026-catalogue'
import { sha256Hex } from '../lib/grade-thresholds/parser'
import {
  diffCanonicalManifests,
  parseCatalogueValidatorSql,
  parseDurableSeedSql,
  reconcileCatalogueArtifacts,
  uuidv5Oid,
  type ReconciliationProfileConfig,
} from '../lib/grade-thresholds/reconciliation'
import type { CambridgeThresholdSource, PdfExtraction, PdfTextItem } from '../lib/grade-thresholds/types'
import type { CambridgeWeightingSourceManifest } from '../lib/grade-thresholds/weighting-source'

const line = (page: number, y: number, tokens: readonly string[]): PdfTextItem[] =>
  tokens.map((text, index) => ({ page, text, x: 40 + index * 70, y, width: 60, height: 10 }))

function makeSyntheticFixture() {
  const bytesA = new TextEncoder().encode('%PDF-1.5 synth 9701')
  const bytesW = new TextEncoder().encode('%PDF-1.5 synth weighting')
  const shaA = sha256Hex(bytesA)
  const shaW = sha256Hex(bytesW)

  const routeId = uuidv5Oid('svr-synth-9701-as')
  const paper1Id = uuidv5Oid('sp-synth-9701-1')
  const paper2Id = uuidv5Oid('sp-synth-9701-2')
  const runId = '00000000-0000-4000-9000-000000000010'
  const pubId = '00000000-0000-4000-9000-000000000021'
  const wsId = '00000000-0000-4000-9000-000000000031'

  const source: CambridgeThresholdSource = {
    syllabusCode: '9701',
    syllabusName: 'Chemistry',
    qualificationTitle: 'Cambridge International AS & A Level Chemistry (9701)',
    year: 2026,
    series: 'june',
    indexUrl: 'https://www.cambridgeinternational.org/june-2026/',
    pdfUrl: 'https://www.cambridgeinternational.org/Images/9701-synth.pdf',
    expectedChecksumSha256: shaA,
    expectedIdentityLines: [
      'Grade thresholds – June 2026',
      'Cambridge International AS & A Level Chemistry (9701)',
    ],
    carryForwardTokens: [],
    carryForwardTokenBasis: 'reviewed-structural-mapping',
    expectedStructure: {
      pageCount: 1,
      rowCounts: { component: 2, 'a-level-linear': 1, 'a-level-staged': 1, 'as-level': 1 },
    },
    goldenFixtures: [],
  }

  const weightingManifest: CambridgeWeightingSourceManifest = {
    title: 'Syllabus component weighting factors',
    pdfUrl: 'https://www.cambridgeinternational.org/Images/synth-weighting.pdf',
    expectedChecksumSha256: shaW,
    expectedPageCount: 1,
    createdOn: '2026-06-29',
    coveredSeries: ['june-2026'],
    expectedRowsBySession: { 'june-2026': { '9701': 2 } },
    june2026ExpectedRows: { '9701': 2 },
    june2026GoldenFactors: [
      { syllabusCode: '9701', component: '12', maximumRawMark: 40, maximumWeightedMark: 40, factor: 1.0 },
      { syllabusCode: '9701', component: '22', maximumRawMark: 60, maximumWeightedMark: 45, factor: 0.75 },
    ],
  }

  const thresholdExtraction: PdfExtraction = {
    pageCount: 1,
    items: [
      ...line(1, 780, ['Grade thresholds – June 2026']),
      ...line(1, 760, ['Cambridge International AS & A Level Chemistry (9701)']),
      ...line(1, 740, ['Component grade thresholds']),
      ...line(1, 720, ['Component', 'Maximum raw', 'mark A B C D E']),
      ...line(1, 700, ['Component', '12', '40', '28', '24', '20', '16', '12']),
      ...line(1, 680, ['Component', '22', '60', '40', '34', '28', '22', '16']),
      ...line(1, 640, ['Cambridge International A Level (linear assessment)']),
      ...line(1, 620, ['Combination of', 'components', 'Maximum weighted', 'mark', 'A* A B C D E']),
      ...line(1, 600, ['12, 22', '85', '70', '60', '50', '40', '30', '20']),
      ...line(1, 560, ['Cambridge International A Level (staged assessment)']),
      ...line(1, 540, ['Combination of', 'components', 'Maximum weighted', 'mark', 'A* A B C D E']),
      ...line(1, 520, ['22', '60', '50', '40', '34', '28', '22', '16']),
      ...line(1, 480, ['Cambridge International AS Level']),
      ...line(1, 460, ['Combination of', 'components', 'Maximum weighted', 'mark', 'a b c d e']),
      ...line(1, 440, ['12, 22', '85', '60', '50', '40', '30', '20']),
    ],
  }

  const weightingExtraction: PdfExtraction = {
    pageCount: 1,
    items: [
      ...line(1, 820, ['Syllabus component weighting factors']),
      ...line(1, 800, ['June 2026']),
      ...line(1, 760, ['June 2026 9701 12 40 40 1.0']),
      ...line(1, 740, ['June 2026 9701 22 60 45 0.75']),
    ],
  }

  const profile: ReconciliationProfileConfig = {
    importRun: { id: runId, triggerKind: 'manual', parserVersion: '1.0.0', status: 'succeeded' },
    publicationMetaBySubject: { '9701': { id: pubId, weightingSourceId: wsId } },
    existingWeightingEntries: {},
    existingVariants: {},
    existingCombinations: {},
    specialComponentsBySubject: { '9701': new Set<string>() },
    paperMaxBySubject: { '9701': { 1: { id: paper1Id, max: 40 }, 2: { id: paper2Id, max: 60 } } },
    atlasRoutesBySubject: {
      '9701': [{ id: routeId, routeType: 'as_only', stages: { 1: 'as', 2: 'as' } }],
    },
  }

  const we1Id = uuidv5Oid('m5-j26-we-9701-12-component_variant')
  const we2Id = uuidv5Oid('m5-j26-we-9701-22-component_variant')
  const var1Id = uuidv5Oid('m5-j26-cv-9701-12')
  const var2Id = uuidv5Oid('m5-j26-cv-9701-22')
  const cLinId = uuidv5Oid('m5-j26-combo-9701-a-level-linear-12,22')
  const cStgId = uuidv5Oid('m5-j26-combo-9701-a-level-staged-22')
  const cAsId = uuidv5Oid('m5-j26-combo-9701-as-level-12,22')

  const tLin1 = uuidv5Oid('m5-j26-tok-9701-a-level-linear-12,22-1-12')
  const tLin2 = uuidv5Oid('m5-j26-tok-9701-a-level-linear-12,22-2-22')
  const tStg1 = uuidv5Oid('m5-j26-tok-9701-a-level-staged-22-1-22')
  const tAs1 = uuidv5Oid('m5-j26-tok-9701-as-level-12,22-1-12')
  const tAs2 = uuidv5Oid('m5-j26-tok-9701-as-level-12,22-2-22')

  const seedSql = `
    INSERT INTO public.grade_threshold_import_runs (id, trigger_kind, parser_version, status, started_at, finished_at, aggregate_summary)
    VALUES ('${runId}', 'manual', '1.0.0', 'succeeded', '2026-06-25 10:00:00+00', '2026-06-25 10:05:00+00', '{}'::jsonb);

    INSERT INTO public.grade_threshold_publications (id, import_run_id, subject_id, exam_year, exam_series, official_index_url, official_pdf_url, source_checksum_sha256, official_published_on, revision_number, publication_status, is_active, published_at, source_metadata)
    VALUES ('${pubId}', '${runId}', v_subj_9701, 2026, 'june', '${source.indexUrl}', '${source.pdfUrl}', decode('${shaA}', 'hex'), '2026-08-10', 1, 'published', TRUE, '2026-08-11 00:00:00+00', '{}'::jsonb);

    INSERT INTO public.grade_threshold_weighting_sources (id, subject_id, document_year, exam_series, source_label, official_document_url, source_checksum_sha256, review_status, reviewed_by, reviewed_at, source_metadata)
    VALUES ('${wsId}', v_subj_9701, 2026, 'june', 'Weighting', '${weightingManifest.pdfUrl}', decode('${shaW}', 'hex'), 'approved', 'auditor', '2026-08-10 12:00:00+00', '{}'::jsonb);

    INSERT INTO public.grade_threshold_weighting_entries (id, weighting_source_id, raw_token, token_kind, raw_maximum, weighted_maximum, official_weighting_factor, source_page, source_row_label) VALUES
    ('${we1Id}', '${wsId}', '12', 'component_variant', 40, 40, 1.00000000, 1, 'row1'),
    ('${we2Id}', '${wsId}', '22', 'component_variant', 60, 45, 0.75000000, 1, 'row2');

    INSERT INTO public.grade_threshold_component_variants (id, publication_id, component_code, raw_maximum_mark, subject_paper_id, source_label, source_row_metadata) VALUES
    ('${var1Id}', '${pubId}', '12', 40, '${paper1Id}'::uuid, 'c12', '{}'::jsonb),
    ('${var2Id}', '${pubId}', '22', 60, '${paper2Id}'::uuid, 'c22', '{}'::jsonb);

    INSERT INTO public.grade_threshold_component_marks (component_variant_id, grade, threshold_mark) VALUES
    ('${var1Id}', 'A', 28), ('${var1Id}', 'B', 24), ('${var1Id}', 'C', 20), ('${var1Id}', 'D', 16), ('${var1Id}', 'E', 12),
    ('${var2Id}', 'A', 40), ('${var2Id}', 'B', 34), ('${var2Id}', 'C', 28), ('${var2Id}', 'D', 22), ('${var2Id}', 'E', 16);

    INSERT INTO public.grade_threshold_combinations (id, publication_id, canonical_key, official_option_label, official_source_label, qualification_level, route_type, maximum_mark, weighting_basis, planner_eligibility, atlas_route_id, review_metadata) VALUES
    ('${cLinId}', '${pubId}', '12,22', '12, 22', '12, 22', 'a_level', 'full_level', 85, 'weighted_total', 'unsupported', NULL, '{}'::jsonb),
    ('${cStgId}', '${pubId}', '22', '22', '22', 'a_level', 'staged', 60, 'weighted_total', 'unreviewed', NULL, '{}'::jsonb),
    ('${cAsId}', '${pubId}', '12,22', '12, 22', '12, 22', 'as', 'as_only', 85, 'weighted_total', 'eligible', '${routeId}'::uuid, '{}'::jsonb);

    INSERT INTO public.grade_threshold_combination_tokens (id, combination_id, token_position, raw_token, token_kind, stage, resolved_component_variant_id, maximum_mark, weighting_factor, weighting_entry_id, carry_forward_mapping_status, mapping_reviewed_by, mapping_reviewed_at, source_token_metadata) VALUES
    ('${tLin1}', '${cLinId}', 1, '12', 'component_variant', NULL, '${var1Id}'::uuid, 40, 1.00000000, '${we1Id}'::uuid, NULL, NULL, NULL, '{}'::jsonb),
    ('${tLin2}', '${cLinId}', 2, '22', 'component_variant', NULL, '${var2Id}'::uuid, 60, 0.75000000, '${we2Id}'::uuid, NULL, NULL, NULL, '{}'::jsonb),
    ('${tStg1}', '${cStgId}', 1, '22', 'component_variant', 'a2', '${var2Id}'::uuid, 60, 0.75000000, '${we2Id}'::uuid, NULL, NULL, NULL, '{}'::jsonb),
    ('${tAs1}', '${cAsId}', 1, '12', 'component_variant', 'as', '${var1Id}'::uuid, 40, 1.00000000, '${we1Id}'::uuid, NULL, NULL, NULL, '{}'::jsonb),
    ('${tAs2}', '${cAsId}', 2, '22', 'component_variant', 'as', '${var2Id}'::uuid, 60, 0.75000000, '${we2Id}'::uuid, NULL, NULL, NULL, '{}'::jsonb);

    INSERT INTO public.grade_threshold_combination_marks (id, combination_id, grade, threshold_mark) VALUES
    ('${uuidv5Oid('m5-j26-cm-9701-a-level-linear-12,22-A*')}', '${cLinId}', 'A*', 70),
    ('${uuidv5Oid('m5-j26-cm-9701-a-level-linear-12,22-A')}', '${cLinId}', 'A', 60),
    ('${uuidv5Oid('m5-j26-cm-9701-a-level-linear-12,22-B')}', '${cLinId}', 'B', 50),
    ('${uuidv5Oid('m5-j26-cm-9701-a-level-linear-12,22-C')}', '${cLinId}', 'C', 40),
    ('${uuidv5Oid('m5-j26-cm-9701-a-level-linear-12,22-D')}', '${cLinId}', 'D', 30),
    ('${uuidv5Oid('m5-j26-cm-9701-a-level-linear-12,22-E')}', '${cLinId}', 'E', 20),
    ('${uuidv5Oid('m5-j26-cm-9701-a-level-staged-22-A*')}', '${cStgId}', 'A*', 50),
    ('${uuidv5Oid('m5-j26-cm-9701-a-level-staged-22-A')}', '${cStgId}', 'A', 40),
    ('${uuidv5Oid('m5-j26-cm-9701-a-level-staged-22-B')}', '${cStgId}', 'B', 34),
    ('${uuidv5Oid('m5-j26-cm-9701-a-level-staged-22-C')}', '${cStgId}', 'C', 28),
    ('${uuidv5Oid('m5-j26-cm-9701-a-level-staged-22-D')}', '${cStgId}', 'D', 22),
    ('${uuidv5Oid('m5-j26-cm-9701-a-level-staged-22-E')}', '${cStgId}', 'E', 16),
    ('${uuidv5Oid('m5-j26-cm-9701-as-level-12,22-a')}', '${cAsId}', 'a', 60),
    ('${uuidv5Oid('m5-j26-cm-9701-as-level-12,22-b')}', '${cAsId}', 'b', 50),
    ('${uuidv5Oid('m5-j26-cm-9701-as-level-12,22-c')}', '${cAsId}', 'c', 40),
    ('${uuidv5Oid('m5-j26-cm-9701-as-level-12,22-d')}', '${cAsId}', 'd', 30),
    ('${uuidv5Oid('m5-j26-cm-9701-as-level-12,22-e')}', '${cAsId}', 'e', 20);
  `

  const validatorSql = `
    -- ── 1. Table 1: run
    WITH expected AS (SELECT '${runId}'::uuid AS id, 'manual'::text AS trigger_kind, '1.0.0'::text AS parser_version, 'succeeded'::text AS status), actual AS (SELECT 1)
    -- ── 2. Table 2: pub
    SELECT * FROM (VALUES ('${pubId}'::uuid, '${runId}'::uuid, v_subj_9701, 2026::smallint, 'june'::text, '${source.indexUrl}'::text, '${source.pdfUrl}'::text, decode('${shaA}', 'hex'), '2026-08-10'::date, 1::smallint, 'published'::text, TRUE)) AS v(c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12)
    -- ── 3. Table 3: ws
    SELECT * FROM (VALUES ('${wsId}'::uuid, v_subj_9701, 2026::smallint, 'june'::text, 'Weighting'::text, '${weightingManifest.pdfUrl}'::text, decode('${shaW}', 'hex'), 'approved'::text)) AS v(c1,c2,c3,c4,c5,c6,c7,c8)
    -- ── 4. Table 4: we
    SELECT * FROM (VALUES
      ('${we1Id}'::uuid, '${wsId}'::uuid, '12'::text, 'component_variant'::text, 40::smallint, 40::smallint, 1.00000000::numeric(10,8), 1::smallint),
      ('${we2Id}'::uuid, '${wsId}'::uuid, '22'::text, 'component_variant'::text, 60::smallint, 45::smallint, 0.75000000::numeric(10,8), 1::smallint)
    ) AS v(c1,c2,c3,c4,c5,c6,c7,c8)
    -- ── 5. Table 5: cv
    SELECT * FROM (VALUES
      ('${var1Id}'::uuid, '${pubId}'::uuid, '12'::text, 40::smallint, '${paper1Id}'::uuid),
      ('${var2Id}'::uuid, '${pubId}'::uuid, '22'::text, 60::smallint, '${paper2Id}'::uuid)
    ) AS v(c1,c2,c3,c4,c5)
    -- ── 6. Table 6: cm
    SELECT * FROM (VALUES
      ('${var1Id}'::uuid, 'A'::text, 28::smallint), ('${var1Id}'::uuid, 'B'::text, 24::smallint), ('${var1Id}'::uuid, 'C'::text, 20::smallint), ('${var1Id}'::uuid, 'D'::text, 16::smallint), ('${var1Id}'::uuid, 'E'::text, 12::smallint),
      ('${var2Id}'::uuid, 'A'::text, 40::smallint), ('${var2Id}'::uuid, 'B'::text, 34::smallint), ('${var2Id}'::uuid, 'C'::text, 28::smallint), ('${var2Id}'::uuid, 'D'::text, 22::smallint), ('${var2Id}'::uuid, 'E'::text, 16::smallint)
    ) AS v(c1,c2,c3)
    -- ── 9. Table 9: comb
    SELECT * FROM (VALUES
      ('${cLinId}'::uuid, '${pubId}'::uuid, '12,22'::text, '12, 22'::text, '12, 22'::text, 'a_level'::text, 'full_level'::text, 85::smallint, 'weighted_total'::text, 'unsupported'::text, NULL::uuid),
      ('${cStgId}'::uuid, '${pubId}'::uuid, '22'::text, '22'::text, '22'::text, 'a_level'::text, 'staged'::text, 60::smallint, 'weighted_total'::text, 'unreviewed'::text, NULL::uuid),
      ('${cAsId}'::uuid, '${pubId}'::uuid, '12,22'::text, '12, 22'::text, '12, 22'::text, 'as'::text, 'as_only'::text, 85::smallint, 'weighted_total'::text, 'eligible'::text, '${routeId}'::uuid)
    ) AS v(c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11)
    -- ── 10. Table 10: tok
    SELECT * FROM (VALUES
      ('${tLin1}'::uuid, '${cLinId}'::uuid, 1::smallint, '12'::text, 'component_variant'::text, NULL::text, '${var1Id}'::uuid, 40::smallint, 1.00000000::numeric(10,8), '${we1Id}'::uuid, NULL::text),
      ('${tLin2}'::uuid, '${cLinId}'::uuid, 2::smallint, '22'::text, 'component_variant'::text, NULL::text, '${var2Id}'::uuid, 60::smallint, 0.75000000::numeric(10,8), '${we2Id}'::uuid, NULL::text),
      ('${tStg1}'::uuid, '${cStgId}'::uuid, 1::smallint, '22'::text, 'component_variant'::text, 'a2'::text, '${var2Id}'::uuid, 60::smallint, 0.75000000::numeric(10,8), '${we2Id}'::uuid, NULL::text),
      ('${tAs1}'::uuid, '${cAsId}', 1::smallint, '12'::text, 'component_variant'::text, 'as'::text, '${var1Id}'::uuid, 40::smallint, 1.00000000::numeric(10,8), '${we1Id}'::uuid, NULL::text),
      ('${tAs2}'::uuid, '${cAsId}', 2::smallint, '22'::text, 'component_variant'::text, 'as'::text, '${var2Id}'::uuid, 60::smallint, 0.75000000::numeric(10,8), '${we2Id}'::uuid, NULL::text)
    ) AS v(c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11)
    -- ── 11. Table 11: cmarks
    SELECT * FROM (VALUES
      ('${uuidv5Oid('m5-j26-cm-9701-a-level-linear-12,22-A*')}'::uuid, '${cLinId}'::uuid, 'A*'::text, 70::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-a-level-linear-12,22-A')}'::uuid, '${cLinId}'::uuid, 'A'::text, 60::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-a-level-linear-12,22-B')}'::uuid, '${cLinId}'::uuid, 'B'::text, 50::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-a-level-linear-12,22-C')}'::uuid, '${cLinId}'::uuid, 'C'::text, 40::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-a-level-linear-12,22-D')}'::uuid, '${cLinId}'::uuid, 'D'::text, 30::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-a-level-linear-12,22-E')}'::uuid, '${cLinId}'::uuid, 'E'::text, 20::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-a-level-staged-22-A*')}'::uuid, '${cStgId}'::uuid, 'A*'::text, 50::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-a-level-staged-22-A')}'::uuid, '${cStgId}'::uuid, 'A'::text, 40::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-a-level-staged-22-B')}'::uuid, '${cStgId}'::uuid, 'B'::text, 34::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-a-level-staged-22-C')}'::uuid, '${cStgId}'::uuid, 'C'::text, 28::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-a-level-staged-22-D')}'::uuid, '${cStgId}'::uuid, 'D'::text, 22::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-a-level-staged-22-E')}'::uuid, '${cStgId}'::uuid, 'E'::text, 16::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-as-level-12,22-a')}'::uuid, '${cAsId}'::uuid, 'a'::text, 60::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-as-level-12,22-b')}'::uuid, '${cAsId}'::uuid, 'b'::text, 50::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-as-level-12,22-c')}'::uuid, '${cAsId}'::uuid, 'c'::text, 40::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-as-level-12,22-d')}'::uuid, '${cAsId}'::uuid, 'd'::text, 30::smallint),
      ('${uuidv5Oid('m5-j26-cm-9701-as-level-12,22-e')}'::uuid, '${cAsId}'::uuid, 'e'::text, 20::smallint)
    ) AS v(c1,c2,c3,c4)
    WITH expected_subject_counts AS (
      SELECT * FROM (VALUES ('9701'::text, 2::int, 2::int, 10::int, 3::int, 5::int, 17::int)) AS v(syllabus_code, expected_we, expected_cv, expected_cm, expected_comb, expected_tok, expected_comb_mark)
    )
  `

  return {
    source,
    bytesA,
    weightingManifest,
    bytesW,
    thresholdExtraction,
    weightingExtraction,
    profile,
    seedSql,
    validatorSql,
    ids: { var1Id, we2Id, cAsId, tAs1, routeId },
  }
}

describe('durable source-to-seed & validator reconciliation', () => {
  test('passes exact committed seed & validator SQL consistency across all 2,674 rows and 5 subjects', () => {
    const repoRoot = path.resolve(__dirname, '..')
    const seedSql = fs.readFileSync(
      path.join(repoRoot, 'supabase/seeds/catalogue/june_2026_m5_catalogue.sql'),
      'utf8',
    )
    const validatorSql = fs.readFileSync(
      path.join(repoRoot, 'supabase/tests/fixtures/catalogue/milestone_5_catalogue_validator.sql'),
      'utf8',
    )

    const seedManifest = parseDurableSeedSql(seedSql)
    const validatorParsed = parseCatalogueValidatorSql(validatorSql)

    expect(seedManifest.totalRows).toBe(2674)
    expect(validatorParsed.manifest.totalRows).toBe(2674)
    expect(diffCanonicalManifests(seedManifest, validatorParsed.manifest, 'validator')).toEqual([])
    expect(seedManifest.manifestSha256).toBe(validatorParsed.manifest.manifestSha256)
    expect(Object.keys(seedManifest.countsBySubject).sort()).toEqual([
      '9231',
      '9618',
      '9701',
      '9702',
      '9709',
    ])
    for (const [code, counts] of Object.entries(seedManifest.countsBySubject)) {
      const valCounts = validatorParsed.perSubjectExpectedCounts[code]
      expect(valCounts).toBeDefined()
      expect(valCounts?.weightingEntries).toBe(counts.weightingEntries)
      expect(valCounts?.componentVariants).toBe(counts.componentVariants)
      expect(valCounts?.componentMarks).toBe(counts.componentMarks)
      expect(valCounts?.combinations).toBe(counts.combinations)
      expect(valCounts?.combinationTokens).toBe(counts.combinationTokens)
      expect(valCounts?.combinationMarks).toBe(counts.combinationMarks)
    }
  })

  test('reconciles synthetic source PDFs against matching Seed SQL and Validator SQL cleanly', async () => {
    const f = makeSyntheticFixture()
    const result = await reconcileCatalogueArtifacts({
      sources: [f.source],
      thresholdPdfs: { '9701': { bytes: f.bytesA } },
      weightingManifest: f.weightingManifest,
      weightingPdf: { bytes: f.bytesW },
      seedSql: f.seedSql,
      validatorSql: f.validatorSql,
      extractPdfText: async (b) =>
        Buffer.from(b).equals(Buffer.from(f.bytesW)) ? f.weightingExtraction : f.thresholdExtraction,
      profile: f.profile,
    })

    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.sourceManifest?.totalRows).toBe(42)
    expect(result.sourceManifest?.manifestSha256).toBe(result.seedManifest.manifestSha256)
  })

  test('fails on a single changed component mark, weighting factor, eligibility, token order, duplicate, missing/extra row, or validator drift', async () => {
    const f = makeSyntheticFixture()
    const runWith = (overrides: { seedSql?: string; validatorSql?: string; thresholdBytes?: Uint8Array }) =>
      reconcileCatalogueArtifacts({
        sources: [f.source],
        thresholdPdfs: { '9701': { bytes: overrides.thresholdBytes ?? f.bytesA } },
        weightingManifest: f.weightingManifest,
        weightingPdf: { bytes: f.bytesW },
        seedSql: overrides.seedSql ?? f.seedSql,
        validatorSql: overrides.validatorSql ?? f.validatorSql,
        extractPdfText: async (b) =>
          Buffer.from(b).equals(Buffer.from(f.bytesW)) ? f.weightingExtraction : f.thresholdExtraction,
        profile: f.profile,
      })

    // 1. Altered component threshold mark (28 -> 29)
    const badMark = await runWith({
      seedSql: f.seedSql.replace(`('${f.ids.var1Id}', 'A', 28)`, `('${f.ids.var1Id}', 'A', 29)`),
    })
    expect(badMark.ok).toBe(false)
    expect(badMark.issues.some((i) => i.target === 'seed' && i.table === 'componentMarks')).toBe(true)

    // 2. Altered weighting factor (0.75000000 -> 0.80000000)
    const badWeight = await runWith({
      seedSql: f.seedSql.replace(`0.75000000, 1, 'row2'`, `0.80000000, 1, 'row2'`),
    })
    expect(badWeight.ok).toBe(false)
    expect(badWeight.issues.some((i) => i.target === 'seed' && i.table === 'weightingEntries')).toBe(true)

    // 3. Altered combination eligibility / route
    const badRoute = await runWith({
      seedSql: f.seedSql.replace(
        `'weighted_total', 'eligible', '${f.ids.routeId}'::uuid`,
        `'weighted_total', 'unreviewed', NULL`,
      ),
    })
    expect(badRoute.ok).toBe(false)
    expect(badRoute.issues.some((i) => i.target === 'seed' && i.table === 'combinations')).toBe(true)

    // 4. Altered token order
    const badTokOrder = await runWith({
      seedSql: f.seedSql.replace(
        `('${f.ids.tAs1}', '${f.ids.cAsId}', 1, '12'`,
        `('${f.ids.tAs1}', '${f.ids.cAsId}', 9, '12'`,
      ),
    })
    expect(badTokOrder.ok).toBe(false)
    expect(badTokOrder.issues.some((i) => i.target === 'seed' && i.table === 'combinationTokens')).toBe(true)

    // 5. Missing row in seed
    const missingMark = await runWith({
      seedSql: f.seedSql.replace(`, ('${f.ids.var1Id}', 'E', 12)`, ''),
    })
    expect(missingMark.ok).toBe(false)
    expect(missingMark.issues.some((i) => i.target === 'seed' && i.table === 'componentMarks')).toBe(true)

    // 6. Extra/duplicate row in seed
    const extraRow = await runWith({
      seedSql: f.seedSql.replace(
        `('${f.ids.var1Id}', 'E', 12)`,
        `('${f.ids.var1Id}', 'E', 12), ('${f.ids.var1Id}', 'E', 12)`,
      ),
    })
    expect(extraRow.ok).toBe(false)
    expect(extraRow.issues.some((i) => i.target === 'seed' && i.message.includes('Duplicate'))).toBe(true)

    // 7. Validator SQL drift (1 mark changed in validator while seed stays intact)
    const badValidator = await runWith({
      validatorSql: f.validatorSql.replace(`'A'::text, 28::smallint`, `'A'::text, 27::smallint`),
    })
    expect(badValidator.ok).toBe(false)
    expect(badValidator.issues.some((i) => i.target === 'validator' && i.table === 'componentMarks')).toBe(true)

    // 8. Checksum mismatch on input PDF bytes
    const badChecksum = await runWith({
      thresholdBytes: new TextEncoder().encode('%PDF-1.5 tampered bytes'),
    })
    expect(badChecksum.ok).toBe(false)
    expect(badChecksum.issues.some((i) => i.target === 'source' && i.message.includes('checksum-mismatch'))).toBe(true)
  })

  test('CLI parses arguments, supports successful --check mode, and fails non-zero on invalid inputs or subprocess invocations', async () => {
    const parsed = parseReconcileArgs([
      '--check',
      '--json',
      '--pdf-dir=/tmp/pdfs',
      '--seed',
      '/tmp/seed.sql',
      '--validator=/tmp/val.sql',
      '--9709=/tmp/m.pdf',
      '--weighting',
      '/tmp/w.pdf',
    ])
    expect(parsed).toEqual({
      check: true,
      json: true,
      pdfDir: '/tmp/pdfs',
      seed: '/tmp/seed.sql',
      validator: '/tmp/val.sql',
      paths: { '9709': '/tmp/m.pdf', weighting: '/tmp/w.pdf' },
    })

    // Missing --check exits 2 cleanly
    const stderrLines: string[] = []
    expect(
      await runReconcileCli([], {
        stderr: (l) => stderrLines.push(l),
      }),
    ).toBe(2)
    expect(stderrLines.some((l) => l.includes('reconcile:m5'))).toBe(true)

    // Unknown argument exits 2 cleanly
    expect(
      await runReconcileCli(['--check', '--bogus-flag'], {
        stderr: () => {},
      }),
    ).toBe(2)

    // Synthetic end-to-end CLI --check --json success & single-value failure using temp dir
    const f = makeSyntheticFixture()
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-cli-test-'))
    try {
      const pdfA = path.join(tmpDir, 'chem.pdf')
      const pdfW = path.join(tmpDir, 'weight.pdf')
      const seedPath = path.join(tmpDir, 'seed.sql')
      const valPath = path.join(tmpDir, 'validator.sql')
      fs.writeFileSync(pdfA, f.bytesA)
      fs.writeFileSync(pdfW, f.bytesW)
      fs.writeFileSync(seedPath, f.seedSql)
      fs.writeFileSync(valPath, f.validatorSql)

      const stdoutPass: string[] = []
      const stderrPass: string[] = []
      const okCode = await runReconcileCli(
        [
          '--check',
          '--json',
          '--9701',
          pdfA,
          '--weighting',
          pdfW,
          '--seed',
          seedPath,
          '--validator',
          valPath,
        ],
        {
          sources: [f.source],
          weightingManifest: f.weightingManifest,
          stdout: (l) => stdoutPass.push(l),
          stderr: (l) => stderrPass.push(l),
          reconcileFn: (opts) =>
            reconcileCatalogueArtifacts({
              ...opts,
              extractPdfText: async (b) =>
                Buffer.from(b).equals(Buffer.from(f.bytesW)) ? f.weightingExtraction : f.thresholdExtraction,
              profile: f.profile,
            }),
        },
      )
      expect(okCode).toBe(0)
      expect(stderrPass).toEqual([])
      const parsedOut = JSON.parse(stdoutPass.join('\n'))
      expect(parsedOut.ok).toBe(true)
      expect(parsedOut.totalRows).toBe(42)
      expect(parsedOut.issueCount).toBe(0)

      // Real subprocess entrypoint via maintained tsx binary: verifies CLI entrypoint, arg forwarding, and non-zero failure exit
      const repoRoot = path.resolve(__dirname, '..')
      const tsxBin = path.join(repoRoot, 'node_modules/.bin/tsx')
      let failedExit: number | null = null
      let failedStdout = ''
      try {
        execFileSync(
          tsxBin,
          [
            path.join(repoRoot, 'scripts/reconcile-june-2026-catalogue.ts'),
            '--check',
            '--json',
            `--pdf-dir=${tmpDir}`,
          ],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        )
      } catch (err) {
        const e = err as { status?: number; stderr?: string; stdout?: string }
        failedExit = e.status ?? null
        failedStdout = `${e.stderr ?? ''}\n${e.stdout ?? ''}`
      }
      expect(failedExit).toBe(1)
      expect(failedStdout).toContain('Missing local PDF path')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
