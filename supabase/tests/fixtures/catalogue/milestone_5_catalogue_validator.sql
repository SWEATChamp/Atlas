-- =============================================================================
-- VALIDATOR: Milestone 5 Exact Catalogue Validator
--
-- File: supabase/tests/fixtures/catalogue/milestone_5_catalogue_validator.sql
--
-- Purpose:
--   Bidirectional set-difference validator comparing every material column
--   and foreign-key relationship across all 11 tables (131 rows) of the
--   Milestone 5 June 2026 grade-threshold catalogue.
--
-- Return value:
--   TABLE(total_catalogue_delta integer, total_catalogue_rows integer)
--   - Intact catalogue: total_catalogue_delta = 0, total_catalogue_rows = 131
--   - Altered/corrupted catalogue: total_catalogue_delta > 0
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.run_m5_catalogue_validator()
RETURNS TABLE(total_catalogue_delta integer, total_catalogue_rows integer)
LANGUAGE plpgsql
AS $func$
DECLARE
  v_delta integer := 0;
  v_rows  integer := 0;
  v_d     integer;
  v_r     integer;
  v_subj_chem uuid;
  v_subj_phys uuid;
  v_subj_math uuid;
BEGIN
  SELECT id INTO v_subj_chem FROM public.subjects WHERE code = '9701';
  SELECT id INTO v_subj_phys FROM public.subjects WHERE code = '9702';
  SELECT id INTO v_subj_math FROM public.subjects WHERE code = '9709';

  -- ── 1. Table 1: grade_threshold_import_runs (1 row) ──────────────────────────
  WITH expected AS (
    SELECT
      '00000000-0000-4000-8000-000000000010'::uuid AS id,
      'manual'::text AS trigger_kind,
      '1.0.0'::text AS parser_version,
      'succeeded'::text AS status,
      '2026-06-25 10:00:00+00'::timestamptz AS started_at,
      '2026-06-25 10:05:00+00'::timestamptz AS finished_at,
      '{"notes": "June 2026 M5 Planner Preflight Import Run"}'::jsonb AS aggregate_summary
  ),
  actual AS (
    SELECT id, trigger_kind, parser_version, status, started_at, finished_at, aggregate_summary
    FROM public.grade_threshold_import_runs
    WHERE id = '00000000-0000-4000-8000-000000000010'::uuid
  )
  SELECT
    (SELECT count(*)::int FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d),
    (SELECT count(*)::int FROM actual)
  INTO v_d, v_r;
  v_delta := v_delta + v_d;
  v_rows  := v_rows  + v_r;

  -- ── 2. Table 2: grade_threshold_publications (3 rows) ────────────────────────
  WITH expected AS (
    SELECT * FROM (VALUES
      ('00000000-0000-4000-8000-000000000021'::uuid, '00000000-0000-4000-8000-000000000010'::uuid, v_subj_chem, 2026::smallint, 'june'::text, 'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/grade-threshold-tables/june-2026/'::text, 'https://www.cambridgeinternational.org/Images/761525-chemistry-9701-june-2026-grade-threshold-table.pdf'::text, decode('3ecf1e2e1f8adc21efdf0146293d9aecdf741bf80285d4d8cf80ac0882e1104a', 'hex'), '2026-08-10'::date, 1::smallint, 'published'::text, TRUE, '2026-08-11 00:00:00+00'::timestamptz, '{"series": "June 2026", "subject_code": "9701", "document_filename": "761525-chemistry-9701-june-2026-grade-threshold-table.pdf"}'::jsonb),
      ('00000000-0000-4000-8000-000000000022'::uuid, '00000000-0000-4000-8000-000000000010'::uuid, v_subj_phys, 2026::smallint, 'june'::text, 'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/grade-threshold-tables/june-2026/'::text, 'https://www.cambridgeinternational.org/Images/761526-physics-9702-june-2026-grade-threshold-table.pdf'::text, decode('211cfe1b7997bd6ff44e2e221e6d21f0188b3a0ff3615cd902e5692eaf7c8feb', 'hex'), '2026-08-10'::date, 1::smallint, 'published'::text, TRUE, '2026-08-11 00:00:00+00'::timestamptz, '{"series": "June 2026", "subject_code": "9702", "document_filename": "761526-physics-9702-june-2026-grade-threshold-table.pdf"}'::jsonb),
      ('00000000-0000-4000-8000-000000000023'::uuid, '00000000-0000-4000-8000-000000000010'::uuid, v_subj_math, 2026::smallint, 'june'::text, 'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/grade-threshold-tables/june-2026/'::text, 'https://www.cambridgeinternational.org/Images/761530-mathematics-9709-june-2026-grade-threshold-table.pdf'::text, decode('1b277a4090965f8d3a7d1f80973952f87521d17b398754f26f695bcfdf46ddab', 'hex'), '2026-08-10'::date, 1::smallint, 'published'::text, TRUE, '2026-08-11 00:00:00+00'::timestamptz, '{"series": "June 2026", "subject_code": "9709", "document_filename": "761530-mathematics-9709-june-2026-grade-threshold-table.pdf"}'::jsonb)
    ) AS v(id, import_run_id, subject_id, exam_year, exam_series, official_index_url, official_pdf_url, source_checksum_sha256, official_published_on, revision_number, publication_status, is_active, published_at, source_metadata)
  ),
  actual AS (
    SELECT id, import_run_id, subject_id, exam_year, exam_series, official_index_url, official_pdf_url, source_checksum_sha256, official_published_on, revision_number, publication_status, is_active, published_at, source_metadata
    FROM public.grade_threshold_publications
    WHERE import_run_id = '00000000-0000-4000-8000-000000000010'::uuid
  )
  SELECT
    (SELECT count(*)::int FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d),
    (SELECT count(*)::int FROM actual)
  INTO v_d, v_r;
  v_delta := v_delta + v_d;
  v_rows  := v_rows  + v_r;

  -- ── 3. Table 3: grade_threshold_weighting_sources (3 rows) ───────────────────
  -- Scoped by complete business identity: document_year, exam_series, checksum
  WITH expected AS (
    SELECT * FROM (VALUES
      ('00000000-0000-4000-8000-000000000031'::uuid, v_subj_chem, 2026::smallint, 'june'::text, 'Syllabus component weighting factors: November 2025, March 2026 and June 2026'::text, 'https://www.cambridgeinternational.org/Images/206341-syllabus-component-weighting-factors.pdf'::text, decode('d96f96e5d8847470fd7291f75aa01184b3c0cff7075b5010968e16d94218ada9', 'hex'), 'approved'::text, 'm5-preflight-auditor'::text, '2026-08-10 12:00:00+00'::timestamptz, '{"document_title": "Syllabus component weighting factors: November 2025, March 2026 and June 2026", "subject_code": "9701", "locator_page": 85}'::jsonb),
      ('00000000-0000-4000-8000-000000000032'::uuid, v_subj_phys, 2026::smallint, 'june'::text, 'Syllabus component weighting factors: November 2025, March 2026 and June 2026'::text, 'https://www.cambridgeinternational.org/Images/206341-syllabus-component-weighting-factors.pdf'::text, decode('d96f96e5d8847470fd7291f75aa01184b3c0cff7075b5010968e16d94218ada9', 'hex'), 'approved'::text, 'm5-preflight-auditor'::text, '2026-08-10 12:00:00+00'::timestamptz, '{"document_title": "Syllabus component weighting factors: November 2025, March 2026 and June 2026", "subject_code": "9702", "locator_pages": [86, 87]}'::jsonb),
      ('00000000-0000-4000-8000-000000000033'::uuid, v_subj_math, 2026::smallint, 'june'::text, 'Syllabus component weighting factors: November 2025, March 2026 and June 2026'::text, 'https://www.cambridgeinternational.org/Images/206341-syllabus-component-weighting-factors.pdf'::text, decode('d96f96e5d8847470fd7291f75aa01184b3c0cff7075b5010968e16d94218ada9', 'hex'), 'approved'::text, 'm5-preflight-auditor'::text, '2026-08-10 12:00:00+00'::timestamptz, '{"document_title": "Syllabus component weighting factors: November 2025, March 2026 and June 2026", "subject_code": "9709", "locator_pages": [89, 90]}'::jsonb)
    ) AS v(id, subject_id, document_year, exam_series, source_label, official_document_url, source_checksum_sha256, review_status, reviewed_by, reviewed_at, source_metadata)
  ),
  actual AS (
    SELECT id, subject_id, document_year, exam_series, source_label, official_document_url, source_checksum_sha256, review_status, reviewed_by, reviewed_at, source_metadata
    FROM public.grade_threshold_weighting_sources
    WHERE document_year = 2026 AND exam_series = 'june' AND source_checksum_sha256 = decode('d96f96e5d8847470fd7291f75aa01184b3c0cff7075b5010968e16d94218ada9', 'hex')
  )
  SELECT
    (SELECT count(*)::int FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d),
    (SELECT count(*)::int FROM actual)
  INTO v_d, v_r;
  v_delta := v_delta + v_d;
  v_rows  := v_rows  + v_r;

  -- ── 4. Table 4: grade_threshold_weighting_entries (11 rows) ──────────────────
  WITH expected AS (
    SELECT * FROM (VALUES
      ('00000000-0000-4000-8000-000000000041'::uuid, '00000000-0000-4000-8000-000000000031'::uuid, '12'::text, 'component_variant'::text, 40::numeric(9,4), 40::numeric(9,4), 1.00000000::numeric(12,8), 85::smallint, 'Row 32 (Paper 12 Multiple Choice)'::text),
      ('00000000-0000-4000-8000-000000000042'::uuid, '00000000-0000-4000-8000-000000000031'::uuid, '22'::text, 'component_variant'::text, 60::numeric(9,4), 60::numeric(9,4), 1.00000000::numeric(12,8), 85::smallint, 'Row 36 (Paper 22 AS Level Structured Questions)'::text),
      ('00000000-0000-4000-8000-000000000043'::uuid, '00000000-0000-4000-8000-000000000031'::uuid, '33'::text, 'component_variant'::text, 40::numeric(9,4), 30::numeric(9,4), 0.75000000::numeric(12,8), 85::smallint, 'Row 41 (Paper 33 Advanced Practical Skills)'::text),
      ('00000000-0000-4000-8000-000000000044'::uuid, '00000000-0000-4000-8000-000000000032'::uuid, '12'::text, 'component_variant'::text, 40::numeric(9,4), 40::numeric(9,4), 1.00000000::numeric(12,8), 86::smallint, 'Row 32 (Paper 12 Multiple Choice)'::text),
      ('00000000-0000-4000-8000-000000000045'::uuid, '00000000-0000-4000-8000-000000000032'::uuid, '22'::text, 'component_variant'::text, 60::numeric(9,4), 60::numeric(9,4), 1.00000000::numeric(12,8), 86::smallint, 'Row 36 (Paper 22 AS Level Structured Questions)'::text),
      ('00000000-0000-4000-8000-000000000046'::uuid, '00000000-0000-4000-8000-000000000032'::uuid, '33'::text, 'component_variant'::text, 40::numeric(9,4), 30::numeric(9,4), 0.75000000::numeric(12,8), 86::smallint, 'Row 41 (Paper 33 Advanced Practical Skills)'::text),
      ('00000000-0000-4000-8000-000000000047'::uuid, '00000000-0000-4000-8000-000000000032'::uuid, '42'::text, 'component_variant'::text, 100::numeric(9,4), 100::numeric(9,4), 1.00000000::numeric(12,8), 86::smallint, 'Row 47 (Paper 42 A Level Structured Questions)'::text),
      ('00000000-0000-4000-8000-000000000048'::uuid, '00000000-0000-4000-8000-000000000032'::uuid, '52'::text, 'component_variant'::text, 30::numeric(9,4), 30::numeric(9,4), 1.00000000::numeric(12,8), 87::smallint, 'Row 12 (Paper 52 Planning, Analysis and Evaluation)'::text),
      ('00000000-0000-4000-8000-000000000049'::uuid, '00000000-0000-4000-8000-000000000033'::uuid, '35'::text, 'component_variant'::text, 75::numeric(9,4), 75::numeric(9,4), 1.00000000::numeric(12,8), 89::smallint, 'Row 31 (Paper 35 Pure Mathematics 3)'::text),
      ('00000000-0000-4000-8000-00000000004a'::uuid, '00000000-0000-4000-8000-000000000033'::uuid, '55'::text, 'component_variant'::text, 50::numeric(9,4), 50::numeric(9,4), 1.00000000::numeric(12,8), 89::smallint, 'Row 40 (Paper 55 Probability & Statistics 1)'::text),
      ('00000000-0000-4000-8000-00000000004b'::uuid, '00000000-0000-4000-8000-000000000033'::uuid, '82'::text, 'carry_forward'::text, 125::numeric(9,4), 125::numeric(9,4), 1.00000000::numeric(12,8), 90::smallint, 'Row 12 (Component 82 June AS Mark Carried Forward)'::text)
    ) AS v(id, weighting_source_id, raw_token, token_kind, raw_maximum, weighted_maximum, official_weighting_factor, source_page, source_row_label)
  ),
  actual AS (
    SELECT id, weighting_source_id, raw_token, token_kind, raw_maximum, weighted_maximum, official_weighting_factor, source_page, source_row_label
    FROM public.grade_threshold_weighting_entries
    WHERE weighting_source_id IN (
      SELECT id FROM public.grade_threshold_weighting_sources
      WHERE document_year = 2026 AND exam_series = 'june' AND source_checksum_sha256 = decode('d96f96e5d8847470fd7291f75aa01184b3c0cff7075b5010968e16d94218ada9', 'hex')
    )
  )
  SELECT
    (SELECT count(*)::int FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d),
    (SELECT count(*)::int FROM actual)
  INTO v_d, v_r;
  v_delta := v_delta + v_d;
  v_rows  := v_rows  + v_r;

  -- ── 5. Table 5: grade_threshold_component_variants (13 rows) ─────────────────
  WITH expected AS (
    SELECT * FROM (VALUES
      ('00000000-0000-4000-8000-000000000081'::uuid, '00000000-0000-4000-8000-000000000021'::uuid, '12'::text, 40::smallint, '9727a285-3e3c-5b17-8ccb-9cf8ec26c496'::uuid, 'Paper 12 (Multiple Choice)'::text, '{"source_page": 1, "source_document": "761525-chemistry-9701-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 12"}'::jsonb),
      ('00000000-0000-4000-8000-000000000082'::uuid, '00000000-0000-4000-8000-000000000021'::uuid, '22'::text, 60::smallint, '26c24b14-b3b1-53bb-bf0d-5f0ce959214c'::uuid, 'Paper 22 (AS Level Structured Questions)'::text, '{"source_page": 1, "source_document": "761525-chemistry-9701-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 22"}'::jsonb),
      ('00000000-0000-4000-8000-000000000083'::uuid, '00000000-0000-4000-8000-000000000021'::uuid, '33'::text, 40::smallint, '8c802754-98a5-599b-8b7a-5e528804f625'::uuid, 'Paper 33 (Advanced Practical Skills)'::text, '{"source_page": 1, "source_document": "761525-chemistry-9701-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 33"}'::jsonb),
      ('00000000-0000-4000-8000-000000000084'::uuid, '00000000-0000-4000-8000-000000000022'::uuid, '12'::text, 40::smallint, 'efc05eb9-2b55-576b-a429-f94c7868a4d8'::uuid, 'Paper 12 (Multiple Choice)'::text, '{"source_page": 1, "source_document": "761526-physics-9702-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 12"}'::jsonb),
      ('00000000-0000-4000-8000-000000000085'::uuid, '00000000-0000-4000-8000-000000000022'::uuid, '22'::text, 60::smallint, 'ae2211e2-8353-55dc-8536-a1e507ce2fe3'::uuid, 'Paper 22 (AS Level Structured Questions)'::text, '{"source_page": 1, "source_document": "761526-physics-9702-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 22"}'::jsonb),
      ('00000000-0000-4000-8000-000000000086'::uuid, '00000000-0000-4000-8000-000000000022'::uuid, '33'::text, 40::smallint, '5a41708c-abf4-5eff-bdcd-16a8c9ed6efe'::uuid, 'Paper 33 (Advanced Practical Skills)'::text, '{"source_page": 1, "source_document": "761526-physics-9702-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 33"}'::jsonb),
      ('00000000-0000-4000-8000-000000000087'::uuid, '00000000-0000-4000-8000-000000000022'::uuid, '42'::text, 100::smallint, '81765044-62e9-5750-ac05-7c1ca6a60c6b'::uuid, 'Paper 42 (A Level Structured Questions)'::text, '{"source_page": 1, "source_document": "761526-physics-9702-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 42"}'::jsonb),
      ('00000000-0000-4000-8000-000000000088'::uuid, '00000000-0000-4000-8000-000000000022'::uuid, '52'::text, 30::smallint, 'd155d9a6-5cb4-5667-8eb4-ed619625518c'::uuid, 'Paper 52 (Planning, Analysis and Evaluation)'::text, '{"source_page": 1, "source_document": "761526-physics-9702-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 52"}'::jsonb),
      ('00000000-0000-4000-8000-000000000089'::uuid, '00000000-0000-4000-8000-000000000023'::uuid, '35'::text, 75::smallint, '69ec93cb-e83f-5488-9ca1-0ed53ffa2503'::uuid, 'Paper 35 (Pure Mathematics 3)'::text, '{"source_page": 1, "source_document": "761530-mathematics-9709-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 35"}'::jsonb),
      ('00000000-0000-4000-8000-00000000008a'::uuid, '00000000-0000-4000-8000-000000000023'::uuid, '55'::text, 50::smallint, '5fb10590-88f6-5430-8311-b5d0f9d685c7'::uuid, 'Paper 55 (Probability & Statistics 1)'::text, '{"source_page": 1, "source_document": "761530-mathematics-9709-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 55"}'::jsonb),
      ('00000000-0000-4000-8000-00000000008b'::uuid, '00000000-0000-4000-8000-000000000023'::uuid, '11'::text, 75::smallint, '85180183-41d1-528f-8f3d-e2e0837aed83'::uuid, 'Paper 11 (Pure Mathematics 1)'::text, '{"source_page": 1, "source_document": "761530-mathematics-9709-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 11"}'::jsonb),
      ('00000000-0000-4000-8000-00000000008c'::uuid, '00000000-0000-4000-8000-000000000023'::uuid, '12'::text, 75::smallint, '85180183-41d1-528f-8f3d-e2e0837aed83'::uuid, 'Paper 12 (Pure Mathematics 1)'::text, '{"source_page": 1, "source_document": "761530-mathematics-9709-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 12"}'::jsonb),
      ('00000000-0000-4000-8000-00000000008d'::uuid, '00000000-0000-4000-8000-000000000023'::uuid, '13'::text, 75::smallint, '85180183-41d1-528f-8f3d-e2e0837aed83'::uuid, 'Paper 13 (Pure Mathematics 1)'::text, '{"source_page": 1, "source_document": "761530-mathematics-9709-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 13"}'::jsonb)
    ) AS v(id, publication_id, component_code, raw_maximum_mark, subject_paper_id, source_label, source_row_metadata)
  ),
  actual AS (
    SELECT id, publication_id, component_code, raw_maximum_mark, subject_paper_id, source_label, source_row_metadata
    FROM public.grade_threshold_component_variants
    WHERE publication_id IN (
      SELECT id FROM public.grade_threshold_publications
      WHERE import_run_id = '00000000-0000-4000-8000-000000000010'::uuid
    )
  )
  SELECT
    (SELECT count(*)::int FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d),
    (SELECT count(*)::int FROM actual)
  INTO v_d, v_r;
  v_delta := v_delta + v_d;
  v_rows  := v_rows  + v_r;

  -- ── 6. Table 6: grade_threshold_component_marks (65 rows) ─────────────────────
  -- Documented non-authoritative generated UUIDs: natural key is (component_variant_id, grade, threshold_mark)
  WITH expected AS (
    SELECT * FROM (VALUES
      -- Chem 12 (5 marks)
      ('00000000-0000-4000-8000-000000000081'::uuid, 'A'::text, 25::smallint),
      ('00000000-0000-4000-8000-000000000081'::uuid, 'B'::text, 22::smallint),
      ('00000000-0000-4000-8000-000000000081'::uuid, 'C'::text, 18::smallint),
      ('00000000-0000-4000-8000-000000000081'::uuid, 'D'::text, 14::smallint),
      ('00000000-0000-4000-8000-000000000081'::uuid, 'E'::text, 11::smallint),
      -- Chem 22 (5 marks)
      ('00000000-0000-4000-8000-000000000082'::uuid, 'A'::text, 37::smallint),
      ('00000000-0000-4000-8000-000000000082'::uuid, 'B'::text, 27::smallint),
      ('00000000-0000-4000-8000-000000000082'::uuid, 'C'::text, 22::smallint),
      ('00000000-0000-4000-8000-000000000082'::uuid, 'D'::text, 18::smallint),
      ('00000000-0000-4000-8000-000000000082'::uuid, 'E'::text, 12::smallint),
      -- Chem 33 (5 marks)
      ('00000000-0000-4000-8000-000000000083'::uuid, 'A'::text, 22::smallint),
      ('00000000-0000-4000-8000-000000000083'::uuid, 'B'::text, 17::smallint),
      ('00000000-0000-4000-8000-000000000083'::uuid, 'C'::text, 14::smallint),
      ('00000000-0000-4000-8000-000000000083'::uuid, 'D'::text, 12::smallint),
      ('00000000-0000-4000-8000-000000000083'::uuid, 'E'::text, 10::smallint),
      -- Phys 12 (5 marks)
      ('00000000-0000-4000-8000-000000000084'::uuid, 'A'::text, 30::smallint),
      ('00000000-0000-4000-8000-000000000084'::uuid, 'B'::text, 25::smallint),
      ('00000000-0000-4000-8000-000000000084'::uuid, 'C'::text, 21::smallint),
      ('00000000-0000-4000-8000-000000000084'::uuid, 'D'::text, 18::smallint),
      ('00000000-0000-4000-8000-000000000084'::uuid, 'E'::text, 15::smallint),
      -- Phys 22 (5 marks)
      ('00000000-0000-4000-8000-000000000085'::uuid, 'A'::text, 40::smallint),
      ('00000000-0000-4000-8000-000000000085'::uuid, 'B'::text, 35::smallint),
      ('00000000-0000-4000-8000-000000000085'::uuid, 'C'::text, 30::smallint),
      ('00000000-0000-4000-8000-000000000085'::uuid, 'D'::text, 24::smallint),
      ('00000000-0000-4000-8000-000000000085'::uuid, 'E'::text, 17::smallint),
      -- Phys 33 (5 marks)
      ('00000000-0000-4000-8000-000000000086'::uuid, 'A'::text, 33::smallint),
      ('00000000-0000-4000-8000-000000000086'::uuid, 'B'::text, 30::smallint),
      ('00000000-0000-4000-8000-000000000086'::uuid, 'C'::text, 26::smallint),
      ('00000000-0000-4000-8000-000000000086'::uuid, 'D'::text, 23::smallint),
      ('00000000-0000-4000-8000-000000000086'::uuid, 'E'::text, 20::smallint),
      -- Phys 42 (5 marks)
      ('00000000-0000-4000-8000-000000000087'::uuid, 'A'::text, 62::smallint),
      ('00000000-0000-4000-8000-000000000087'::uuid, 'B'::text, 51::smallint),
      ('00000000-0000-4000-8000-000000000087'::uuid, 'C'::text, 41::smallint),
      ('00000000-0000-4000-8000-000000000087'::uuid, 'D'::text, 31::smallint),
      ('00000000-0000-4000-8000-000000000087'::uuid, 'E'::text, 21::smallint),
      -- Phys 52 (5 marks)
      ('00000000-0000-4000-8000-000000000088'::uuid, 'A'::text, 20::smallint),
      ('00000000-0000-4000-8000-000000000088'::uuid, 'B'::text, 17::smallint),
      ('00000000-0000-4000-8000-000000000088'::uuid, 'C'::text, 14::smallint),
      ('00000000-0000-4000-8000-000000000088'::uuid, 'D'::text, 11::smallint),
      ('00000000-0000-4000-8000-000000000088'::uuid, 'E'::text, 8::smallint),
      -- Math 35 (5 marks)
      ('00000000-0000-4000-8000-000000000089'::uuid, 'A'::text, 55::smallint),
      ('00000000-0000-4000-8000-000000000089'::uuid, 'B'::text, 48::smallint),
      ('00000000-0000-4000-8000-000000000089'::uuid, 'C'::text, 38::smallint),
      ('00000000-0000-4000-8000-000000000089'::uuid, 'D'::text, 27::smallint),
      ('00000000-0000-4000-8000-000000000089'::uuid, 'E'::text, 16::smallint),
      -- Math 55 (5 marks)
      ('00000000-0000-4000-8000-00000000008a'::uuid, 'A'::text, 45::smallint),
      ('00000000-0000-4000-8000-00000000008a'::uuid, 'B'::text, 41::smallint),
      ('00000000-0000-4000-8000-00000000008a'::uuid, 'C'::text, 32::smallint),
      ('00000000-0000-4000-8000-00000000008a'::uuid, 'D'::text, 22::smallint),
      ('00000000-0000-4000-8000-00000000008a'::uuid, 'E'::text, 13::smallint),
      -- Math 11 (5 marks)
      ('00000000-0000-4000-8000-00000000008b'::uuid, 'A'::text, 59::smallint),
      ('00000000-0000-4000-8000-00000000008b'::uuid, 'B'::text, 48::smallint),
      ('00000000-0000-4000-8000-00000000008b'::uuid, 'C'::text, 37::smallint),
      ('00000000-0000-4000-8000-00000000008b'::uuid, 'D'::text, 26::smallint),
      ('00000000-0000-4000-8000-00000000008b'::uuid, 'E'::text, 15::smallint),
      -- Math 12 (5 marks)
      ('00000000-0000-4000-8000-00000000008c'::uuid, 'A'::text, 61::smallint),
      ('00000000-0000-4000-8000-00000000008c'::uuid, 'B'::text, 51::smallint),
      ('00000000-0000-4000-8000-00000000008c'::uuid, 'C'::text, 37::smallint),
      ('00000000-0000-4000-8000-00000000008c'::uuid, 'D'::text, 23::smallint),
      ('00000000-0000-4000-8000-00000000008c'::uuid, 'E'::text, 10::smallint),
      -- Math 13 (5 marks)
      ('00000000-0000-4000-8000-00000000008d'::uuid, 'A'::text, 61::smallint),
      ('00000000-0000-4000-8000-00000000008d'::uuid, 'B'::text, 52::smallint),
      ('00000000-0000-4000-8000-00000000008d'::uuid, 'C'::text, 39::smallint),
      ('00000000-0000-4000-8000-00000000008d'::uuid, 'D'::text, 26::smallint),
      ('00000000-0000-4000-8000-00000000008d'::uuid, 'E'::text, 13::smallint)
    ) AS v(component_variant_id, grade, threshold_mark)
  ),
  actual AS (
    SELECT component_variant_id, grade, threshold_mark
    FROM public.grade_threshold_component_marks
    WHERE component_variant_id IN (
      SELECT id FROM public.grade_threshold_component_variants
      WHERE publication_id IN (
        SELECT id FROM public.grade_threshold_publications
        WHERE import_run_id = '00000000-0000-4000-8000-000000000010'::uuid
      )
    )
  )
  SELECT
    (SELECT count(*)::int FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d),
    (SELECT count(*)::int FROM actual)
  INTO v_d, v_r;
  v_delta := v_delta + v_d;
  v_rows  := v_rows  + v_r;

  -- ── 7. Table 7: grade_threshold_variant_benchmark_groups (1 row) ────────────
  WITH expected AS (
    SELECT
      '00000000-0000-4000-8000-000000000061'::uuid AS id,
      '00000000-0000-4000-8000-000000000023'::uuid AS publication_id,
      '85180183-41d1-528f-8f3d-e2e0837aed83'::uuid AS subject_paper_id,
      'A'::text AS component_grade,
      75::smallint AS raw_maximum_mark,
      'approved'::text AS approval_status,
      'm5-preflight-auditor'::text AS approved_by,
      '2026-08-10 12:00:00+00'::timestamptz AS approved_at,
      'Preflight benchmark group for Math Pure 1 Grade A'::text AS approval_notes
  ),
  actual AS (
    SELECT id, publication_id, subject_paper_id, component_grade, raw_maximum_mark, approval_status, approved_by, approved_at, approval_notes
    FROM public.grade_threshold_variant_benchmark_groups
    WHERE publication_id IN (
      SELECT id FROM public.grade_threshold_publications
      WHERE import_run_id = '00000000-0000-4000-8000-000000000010'::uuid
    )
  )
  SELECT
    (SELECT count(*)::int FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d),
    (SELECT count(*)::int FROM actual)
  INTO v_d, v_r;
  v_delta := v_delta + v_d;
  v_rows  := v_rows  + v_r;

  -- ── 8. Table 8: grade_threshold_variant_benchmark_members (3 rows) ───────────
  WITH expected AS (
    SELECT * FROM (VALUES
      ('00000000-0000-4000-8000-000000000061'::uuid, '00000000-0000-4000-8000-00000000008b'::uuid),
      ('00000000-0000-4000-8000-000000000061'::uuid, '00000000-0000-4000-8000-00000000008c'::uuid),
      ('00000000-0000-4000-8000-000000000061'::uuid, '00000000-0000-4000-8000-00000000008d'::uuid)
    ) AS v(group_id, component_variant_id)
  ),
  actual AS (
    SELECT group_id, component_variant_id
    FROM public.grade_threshold_variant_benchmark_members
    WHERE group_id IN (
      SELECT id FROM public.grade_threshold_variant_benchmark_groups
      WHERE publication_id IN (
        SELECT id FROM public.grade_threshold_publications
        WHERE import_run_id = '00000000-0000-4000-8000-000000000010'::uuid
      )
    )
  )
  SELECT
    (SELECT count(*)::int FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d),
    (SELECT count(*)::int FROM actual)
  INTO v_d, v_r;
  v_delta := v_delta + v_d;
  v_rows  := v_rows  + v_r;

  -- ── 9. Table 9: grade_threshold_combinations (3 rows) ─────────────────────────
  WITH expected AS (
    SELECT * FROM (VALUES
      ('00000000-0000-4000-8000-0000000000c1'::uuid, '00000000-0000-4000-8000-000000000021'::uuid, '12,22,33'::text, 'Option S3'::text, 'Option S3 (12, 22, 33)'::text, 'as'::text, 'as_only'::text, 130::smallint, 'raw_total'::text, 'eligible'::text, '381f1cd1-0472-55bb-9dc8-98bf03d00f23'::uuid, '{"option_code": "S3"}'::jsonb),
      ('00000000-0000-4000-8000-0000000000c2'::uuid, '00000000-0000-4000-8000-000000000022'::uuid, '12,22,33,42,52'::text, 'Option AY'::text, 'Option AY (12, 22, 33, 42, 52)'::text, 'a_level'::text, 'full_level'::text, 260::smallint, 'raw_total'::text, 'eligible'::text, '66eb6ce0-5911-574a-acdc-ae6f292f176e'::uuid, '{"option_code": "AY"}'::jsonb),
      ('00000000-0000-4000-8000-0000000000c3'::uuid, '00000000-0000-4000-8000-000000000023'::uuid, '35,55,82'::text, 'Option DC'::text, 'Option DC (35, 55, 82)'::text, 'a_level'::text, 'staged'::text, 250::smallint, 'raw_total'::text, 'eligible'::text, '99578e02-66ae-53b0-9d67-ed86804a17a9'::uuid, '{"option_code": "DC"}'::jsonb)
    ) AS v(id, publication_id, canonical_key, official_option_label, official_source_label, qualification_level, route_type, maximum_mark, weighting_basis, planner_eligibility, atlas_route_id, review_metadata)
  ),
  actual AS (
    SELECT id, publication_id, canonical_key, official_option_label, official_source_label, qualification_level, route_type, maximum_mark, weighting_basis, planner_eligibility, atlas_route_id, review_metadata
    FROM public.grade_threshold_combinations
    WHERE publication_id IN (
      SELECT id FROM public.grade_threshold_publications
      WHERE import_run_id = '00000000-0000-4000-8000-000000000010'::uuid
    )
  )
  SELECT
    (SELECT count(*)::int FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d),
    (SELECT count(*)::int FROM actual)
  INTO v_d, v_r;
  v_delta := v_delta + v_d;
  v_rows  := v_rows  + v_r;

  -- ── 10. Table 10: grade_threshold_combination_tokens (11 rows) ────────────────
  -- Includes source_token_metadata = '{}'::jsonb
  WITH expected AS (
    SELECT * FROM (VALUES
      -- Chem S3 (3 tokens)
      ('00000000-0000-4000-8000-0000000000d1'::uuid, '00000000-0000-4000-8000-0000000000c1'::uuid, 1::smallint, '12'::text, 'component_variant'::text, 'as'::text, '00000000-0000-4000-8000-000000000081'::uuid, 40::numeric(9,4), 1.00000000::numeric(12,8), '00000000-0000-4000-8000-000000000041'::uuid, NULL::text, NULL::text, NULL::timestamptz, '{}'::jsonb),
      ('00000000-0000-4000-8000-0000000000d2'::uuid, '00000000-0000-4000-8000-0000000000c1'::uuid, 2::smallint, '22'::text, 'component_variant'::text, 'as'::text, '00000000-0000-4000-8000-000000000082'::uuid, 60::numeric(9,4), 1.00000000::numeric(12,8), '00000000-0000-4000-8000-000000000042'::uuid, NULL::text, NULL::text, NULL::timestamptz, '{}'::jsonb),
      ('00000000-0000-4000-8000-0000000000d3'::uuid, '00000000-0000-4000-8000-0000000000c1'::uuid, 3::smallint, '33'::text, 'component_variant'::text, 'as'::text, '00000000-0000-4000-8000-000000000083'::uuid, 40::numeric(9,4), 0.75000000::numeric(12,8), '00000000-0000-4000-8000-000000000043'::uuid, NULL::text, NULL::text, NULL::timestamptz, '{}'::jsonb),
      -- Phys AY (5 tokens)
      ('00000000-0000-4000-8000-0000000000d4'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, 1::smallint, '12'::text, 'component_variant'::text, 'as'::text, '00000000-0000-4000-8000-000000000084'::uuid, 40::numeric(9,4), 1.00000000::numeric(12,8), '00000000-0000-4000-8000-000000000044'::uuid, NULL::text, NULL::text, NULL::timestamptz, '{}'::jsonb),
      ('00000000-0000-4000-8000-0000000000d5'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, 2::smallint, '22'::text, 'component_variant'::text, 'as'::text, '00000000-0000-4000-8000-000000000085'::uuid, 60::numeric(9,4), 1.00000000::numeric(12,8), '00000000-0000-4000-8000-000000000045'::uuid, NULL::text, NULL::text, NULL::timestamptz, '{}'::jsonb),
      ('00000000-0000-4000-8000-0000000000d6'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, 3::smallint, '33'::text, 'component_variant'::text, 'as'::text, '00000000-0000-4000-8000-000000000086'::uuid, 40::numeric(9,4), 0.75000000::numeric(12,8), '00000000-0000-4000-8000-000000000046'::uuid, NULL::text, NULL::text, NULL::timestamptz, '{}'::jsonb),
      ('00000000-0000-4000-8000-0000000000d7'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, 4::smallint, '42'::text, 'component_variant'::text, 'a2'::text, '00000000-0000-4000-8000-000000000087'::uuid, 100::numeric(9,4), 1.00000000::numeric(12,8), '00000000-0000-4000-8000-000000000047'::uuid, NULL::text, NULL::text, NULL::timestamptz, '{}'::jsonb),
      ('00000000-0000-4000-8000-0000000000d8'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, 5::smallint, '52'::text, 'component_variant'::text, 'a2'::text, '00000000-0000-4000-8000-000000000088'::uuid, 30::numeric(9,4), 1.00000000::numeric(12,8), '00000000-0000-4000-8000-000000000048'::uuid, NULL::text, NULL::text, NULL::timestamptz, '{}'::jsonb),
      -- Math DC (3 tokens)
      ('00000000-0000-4000-8000-0000000000d9'::uuid, '00000000-0000-4000-8000-0000000000c3'::uuid, 1::smallint, '35'::text, 'component_variant'::text, 'a2'::text, '00000000-0000-4000-8000-000000000089'::uuid, 75::numeric(9,4), 1.00000000::numeric(12,8), '00000000-0000-4000-8000-000000000049'::uuid, NULL::text, NULL::text, NULL::timestamptz, '{}'::jsonb),
      ('00000000-0000-4000-8000-0000000000da'::uuid, '00000000-0000-4000-8000-0000000000c3'::uuid, 2::smallint, '55'::text, 'component_variant'::text, 'a2'::text, '00000000-0000-4000-8000-00000000008a'::uuid, 50::numeric(9,4), 1.00000000::numeric(12,8), '00000000-0000-4000-8000-00000000004a'::uuid, NULL::text, NULL::text, NULL::timestamptz, '{}'::jsonb),
      ('00000000-0000-4000-8000-0000000000db'::uuid, '00000000-0000-4000-8000-0000000000c3'::uuid, 3::smallint, '82'::text, 'carry_forward'::text, 'as'::text, NULL::uuid, 125::numeric(9,4), 1.00000000::numeric(12,8), '00000000-0000-4000-8000-00000000004b'::uuid, 'approved'::text, 'm5-preflight-auditor'::text, '2026-08-10 12:00:00+00'::timestamptz, '{}'::jsonb)
    ) AS v(id, combination_id, token_position, raw_token, token_kind, stage, resolved_component_variant_id, maximum_mark, weighting_factor, weighting_entry_id, carry_forward_mapping_status, mapping_reviewed_by, mapping_reviewed_at, source_token_metadata)
  ),
  actual AS (
    SELECT id, combination_id, token_position, raw_token, token_kind, stage, resolved_component_variant_id, maximum_mark, weighting_factor, weighting_entry_id, carry_forward_mapping_status, mapping_reviewed_by, mapping_reviewed_at, source_token_metadata
    FROM public.grade_threshold_combination_tokens
    WHERE combination_id IN (
      SELECT id FROM public.grade_threshold_combinations
      WHERE publication_id IN (
        SELECT id FROM public.grade_threshold_publications
        WHERE import_run_id = '00000000-0000-4000-8000-000000000010'::uuid
      )
    )
  )
  SELECT
    (SELECT count(*)::int FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d),
    (SELECT count(*)::int FROM actual)
  INTO v_d, v_r;
  v_delta := v_delta + v_d;
  v_rows  := v_rows  + v_r;

  -- ── 11. Table 11: grade_threshold_combination_marks (17 rows) ─────────────────
  WITH expected AS (
    SELECT * FROM (VALUES
      -- Chem S3 (5 marks: a, b, c, d, e)
      ('00000000-0000-4000-8000-0000000000e1'::uuid, '00000000-0000-4000-8000-0000000000c1'::uuid, 'a'::text, 79::smallint),
      ('00000000-0000-4000-8000-0000000000e2'::uuid, '00000000-0000-4000-8000-0000000000c1'::uuid, 'b'::text, 62::smallint),
      ('00000000-0000-4000-8000-0000000000e3'::uuid, '00000000-0000-4000-8000-0000000000c1'::uuid, 'c'::text, 51::smallint),
      ('00000000-0000-4000-8000-0000000000e4'::uuid, '00000000-0000-4000-8000-0000000000c1'::uuid, 'd'::text, 41::smallint),
      ('00000000-0000-4000-8000-0000000000e5'::uuid, '00000000-0000-4000-8000-0000000000c1'::uuid, 'e'::text, 31::smallint),
      -- Phys AY (6 marks: A*, A, B, C, D, E)
      ('00000000-0000-4000-8000-0000000000e6'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, 'A*'::text, 203::smallint),
      ('00000000-0000-4000-8000-0000000000e7'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, 'A'::text, 177::smallint),
      ('00000000-0000-4000-8000-0000000000e8'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, 'B'::text, 151::smallint),
      ('00000000-0000-4000-8000-0000000000e9'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, 'C'::text, 126::smallint),
      ('00000000-0000-4000-8000-0000000000ea'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, 'D'::text, 101::smallint),
      ('00000000-0000-4000-8000-0000000000eb'::uuid, '00000000-0000-4000-8000-0000000000c2'::uuid, 'E'::text, 76::smallint),
      -- Math DC (6 marks: A*, A, B, C, D, E)
      ('00000000-0000-4000-8000-0000000000ec'::uuid, '00000000-0000-4000-8000-0000000000c3'::uuid, 'A*'::text, 227::smallint),
      ('00000000-0000-4000-8000-0000000000ed'::uuid, '00000000-0000-4000-8000-0000000000c3'::uuid, 'A'::text, 205::smallint),
      ('00000000-0000-4000-8000-0000000000ee'::uuid, '00000000-0000-4000-8000-0000000000c3'::uuid, 'B'::text, 178::smallint),
      ('00000000-0000-4000-8000-0000000000ef'::uuid, '00000000-0000-4000-8000-0000000000c3'::uuid, 'C'::text, 137::smallint),
      ('00000000-0000-4000-8000-0000000000f0'::uuid, '00000000-0000-4000-8000-0000000000c3'::uuid, 'D'::text, 96::smallint),
      ('00000000-0000-4000-8000-0000000000f1'::uuid, '00000000-0000-4000-8000-0000000000c3'::uuid, 'E'::text, 56::smallint)
    ) AS v(id, combination_id, grade, threshold_mark)
  ),
  actual AS (
    SELECT id, combination_id, grade, threshold_mark
    FROM public.grade_threshold_combination_marks
    WHERE combination_id IN (
      SELECT id FROM public.grade_threshold_combinations
      WHERE publication_id IN (
        SELECT id FROM public.grade_threshold_publications
        WHERE import_run_id = '00000000-0000-4000-8000-000000000010'::uuid
      )
    )
  )
  SELECT
    (SELECT count(*)::int FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d),
    (SELECT count(*)::int FROM actual)
  INTO v_d, v_r;
  v_delta := v_delta + v_d;
  v_rows  := v_rows  + v_r;

  RETURN QUERY SELECT v_delta, v_rows;
END;
$func$;
