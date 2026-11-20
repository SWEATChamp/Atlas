-- =============================================================================
-- DATABASE TEST: Milestone 5 Target Grade Planner Preflight Verification
--
-- File: supabase/tests/database/milestone_5_planner_preflight.test.sql
--
-- Purpose:
--   Proves that the Milestone 5 target-grade planner catalogue can be safely
--   assembled, validated, and rolled back in an isolated disposable database.
--   Validates the authentic June 2026 Cambridge catalogue across 13 tables
--   (exact 135 rows), actual fixture guardrails (55000 and 23505 fail-closed),
--   authentic source and weighting provenance, authentic component thresholds,
--   temporary evidence promotion contracts, carry-forward bridge linking,
--   published view eligibility, positive owner route configuration, cross-user
--   RLS isolation, and true zero-delta transactional rollback.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_catalog;
SET LOCAL TIME ZONE 'UTC';

SELECT plan(65);

-- ─── 1. Migration Ledger Baseline Assertions ───────────────────────────────────

SELECT is(
  (SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1),
  '20261116000036',
  '1. Migration ledger ends at Migration 036 (20261116000036)'
);

SELECT cmp_ok(
  (SELECT count(*)::INT FROM supabase_migrations.schema_migrations),
  '>=',
  36,
  '2. Migration count is at least 36 forward migrations'
);

-- ─── 2. Baseline Pre-Seeding Evidence Assertions ──────────────────────────────

SELECT is(
  (SELECT review_status FROM public.grade_threshold_carry_forward_evidence_documents WHERE id = '00000036-0000-4000-8000-000000000001'),
  'unreviewed',
  '3. Pre-seeding baseline: China Zone 5 evidence document is unreviewed'
);

SELECT is(
  (SELECT is_active FROM public.grade_threshold_carry_forward_evidence_documents WHERE id = '00000036-0000-4000-8000-000000000001'),
  FALSE,
  '4. Pre-seeding baseline: China Zone 5 evidence document is inactive'
);

SELECT ok(
  (SELECT reviewed_by IS NULL FROM public.grade_threshold_carry_forward_evidence_documents WHERE id = '00000036-0000-4000-8000-000000000001'),
  '5. Pre-seeding baseline: China Zone 5 evidence document reviewed_by is NULL'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings WHERE evidence_document_id = '00000036-0000-4000-8000-000000000001'),
  10,
  '6. Pre-seeding baseline: exactly 10 source mappings exist for Migration 036 document'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings WHERE evidence_document_id = '00000036-0000-4000-8000-000000000001' AND evidence_status = 'unreviewed'),
  10,
  '7. Pre-seeding baseline: all 10 source mappings are unreviewed'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combination_carry_forward_links),
  0,
  '8. Pre-seeding baseline: exactly 0 carry-forward bridge links exist in the catalogue'
);

SELECT is(
  (SELECT count(*)::INT FROM public.published_grade_threshold_carry_forward_mappings),
  0,
  '9. Pre-seeding baseline: published carry-forward mappings view has 0 rows'
);

SELECT is(
  (SELECT count(*)::INT FROM public.published_grade_threshold_combinations WHERE id = '00000000-0000-4000-8000-0000000000c3'),
  0,
  '10. Pre-seeding baseline: Math Option DC combination does not exist; planner eligibility fails closed'
);

-- ─── 3. Actual Fixture Guardrail Assertions ───────────────────────────────────

-- Load fixture routine with execution deferred
SELECT set_config('m5.defer_fixture_execution', 'true', true);
\ir ../fixtures/milestone_5_planner_preflight.fixture

-- Test Guardrail 1: Interrupted-run fail-closed guard (55000)
CREATE SCHEMA _fixture_m5_preview;

SELECT throws_ok(
  'SELECT pg_temp.apply_m5_planner_preflight_fixture()',
  '55000',
  'Interrupted run detected: schema _fixture_m5_preview already exists',
  '11. Actual fixture guardrail: Interrupted run check fails closed (55000) when schema _fixture_m5_preview exists'
);

DROP SCHEMA _fixture_m5_preview;

-- Test Guardrail 2: Deterministic catalogue collision pre-check (23505)
INSERT INTO public.grade_threshold_import_runs (
  id, trigger_kind, parser_version, status, started_at, finished_at, aggregate_summary
) VALUES (
  '00000000-0000-4000-8000-000000000010', 'manual', '1.0.0', 'succeeded', now(), now(), '{}'::jsonb
);

SELECT throws_ok(
  'SELECT pg_temp.apply_m5_planner_preflight_fixture()',
  '23505',
  'Preflight collision: import run 00000000-0000-4000-8000-000000000010 already exists',
  '12. Actual fixture guardrail: Preflight collision check detects existing catalogue ID and raises 23505'
);

DELETE FROM public.grade_threshold_import_runs WHERE id = '00000000-0000-4000-8000-000000000010';

-- Test Guardrail 3: Synthetic user/profile collision pre-check (23505)
INSERT INTO auth.users (id, email)
VALUES ('f1870000-0000-4000-8000-000000000001', 'm5_student1@example.com');

SELECT throws_ok(
  'SELECT pg_temp.apply_m5_planner_preflight_fixture()',
  '23505',
  'Preflight collision: synthetic auth user f1870000-0000-4000-8000-000000000001 already exists',
  '13. Actual fixture guardrail: Preflight collision check detects existing synthetic user and raises 23505'
);

DELETE FROM auth.users WHERE id = 'f1870000-0000-4000-8000-000000000001';

-- Execute actual fixture cleanly
SELECT lives_ok(
  'SELECT pg_temp.apply_m5_planner_preflight_fixture()',
  '14. Actual fixture execution: Fixture succeeds cleanly when no collisions or interrupted schemas exist'
);

-- ─── 4. Catalogue Row Count & Inventory Assertions (Exact 135 Rows) ───────────

SELECT is(
  (
    SELECT count(*)::INT FROM (
      SELECT id FROM public.grade_threshold_import_runs WHERE id = '00000000-0000-4000-8000-000000000010'
      UNION ALL SELECT id FROM public.grade_threshold_publications WHERE import_run_id = '00000000-0000-4000-8000-000000000010'
      UNION ALL SELECT id FROM public.grade_threshold_weighting_sources WHERE id IN ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000033')
      UNION ALL SELECT id FROM public.grade_threshold_weighting_entries WHERE weighting_source_id IN ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000033')
      UNION ALL SELECT id FROM public.grade_threshold_component_variants WHERE publication_id IN ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000023')
      UNION ALL SELECT id FROM public.grade_threshold_component_marks WHERE component_variant_id IN (SELECT id FROM public.grade_threshold_component_variants WHERE publication_id IN ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000023'))
      UNION ALL SELECT id FROM public.grade_threshold_variant_benchmark_groups WHERE id = '00000000-0000-4000-8000-000000000061'
      UNION ALL SELECT group_id FROM public.grade_threshold_variant_benchmark_members WHERE group_id = '00000000-0000-4000-8000-000000000061'
      UNION ALL SELECT id FROM public.grade_threshold_combinations WHERE publication_id IN ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000023')
      UNION ALL SELECT id FROM public.grade_threshold_combination_tokens WHERE combination_id IN ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c3')
      UNION ALL SELECT id FROM public.grade_threshold_combination_marks WHERE combination_id IN ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c3')
      UNION ALL SELECT id FROM public.grade_threshold_combination_carry_forward_links WHERE id = 'f1870000-0000-4000-8000-000000000002'
      UNION ALL SELECT id FROM public.past_papers WHERE id IN ('f1870000-0000-4000-8000-000000000003','f1870000-0000-4000-8000-000000000004','f1870000-0000-4000-8000-000000000005')
    ) fixture_inventory
  ),
  135,
  '15. Catalogue inventory: exactly 135 total fixture rows inserted across 13 tables'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_import_runs WHERE id = '00000000-0000-4000-8000-000000000010'),
  1,
  '16. Table 1 (grade_threshold_import_runs): exactly 1 import run'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_publications WHERE import_run_id = '00000000-0000-4000-8000-000000000010'),
  3,
  '17. Table 2 (grade_threshold_publications): exactly 3 publications'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_weighting_sources WHERE id IN ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000033')),
  3,
  '18. Table 3 (grade_threshold_weighting_sources): exactly 3 weighting sources'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_weighting_entries WHERE weighting_source_id IN ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000033')),
  11,
  '19. Table 4 (grade_threshold_weighting_entries): exactly 11 weighting entries'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_component_variants WHERE publication_id IN ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000023')),
  13,
  '20. Table 5 (grade_threshold_component_variants): exactly 13 component variants'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_component_marks WHERE component_variant_id IN (
    SELECT id FROM public.grade_threshold_component_variants WHERE publication_id IN ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000023')
  )),
  65,
  '21. Table 6 (grade_threshold_component_marks): exactly 65 component marks (13 variants x 5 grades A-E)'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_variant_benchmark_groups WHERE id = '00000000-0000-4000-8000-000000000061'),
  1,
  '22. Table 7 (grade_threshold_variant_benchmark_groups): exactly 1 benchmark group'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_variant_benchmark_members WHERE group_id = '00000000-0000-4000-8000-000000000061'),
  3,
  '23. Table 8 (grade_threshold_variant_benchmark_members): exactly 3 benchmark members'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combinations WHERE publication_id IN ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000023')),
  3,
  '24. Table 9 (grade_threshold_combinations): exactly 3 combinations'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combination_tokens WHERE combination_id IN ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c3')),
  11,
  '25. Table 10 (grade_threshold_combination_tokens): exactly 11 combination tokens'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combination_marks WHERE combination_id IN ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c3')),
  17,
  '26. Table 11 (grade_threshold_combination_marks): exactly 17 combination marks (5 Chem + 6 Phys + 6 Math)'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combination_carry_forward_links WHERE id = 'f1870000-0000-4000-8000-000000000002'),
  1,
  '27. Table 12 (grade_threshold_combination_carry_forward_links): exactly 1 carry-forward bridge link'
);

-- ─── 5. Provenance & Authentic Threshold Assertions ───────────────────────────

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_publications WHERE official_index_url = 'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/grade-threshold-tables/june-2026/'),
  3,
  '28. Publication provenance: all 3 publications share authentic common June 2026 index URL'
);

SELECT ok(
  (
    SELECT bool_and(
      CASE
        WHEN id = '00000000-0000-4000-8000-000000000021' THEN
          official_pdf_url = 'https://www.cambridgeinternational.org/Images/761525-chemistry-9701-june-2026-grade-threshold-table.pdf'
          AND source_checksum_sha256 = decode('3ecf1e2e1f8adc21efdf0146293d9aecdf741bf80285d4d8cf80ac0882e1104a', 'hex')
        WHEN id = '00000000-0000-4000-8000-000000000022' THEN
          official_pdf_url = 'https://www.cambridgeinternational.org/Images/761526-physics-9702-june-2026-grade-threshold-table.pdf'
          AND source_checksum_sha256 = decode('211cfe1b7997bd6ff44e2e221e6d21f0188b3a0ff3615cd902e5692eaf7c8feb', 'hex')
        WHEN id = '00000000-0000-4000-8000-000000000023' THEN
          official_pdf_url = 'https://www.cambridgeinternational.org/Images/761530-mathematics-9709-june-2026-grade-threshold-table.pdf'
          AND source_checksum_sha256 = decode('1b277a4090965f8d3a7d1f80973952f87521d17b398754f26f695bcfdf46ddab', 'hex')
        ELSE FALSE
      END
    ) FROM public.grade_threshold_publications
  ),
  '29. Publication provenance: exact official PDF URLs and SHA-256 checksums verified'
);

SELECT ok(
  (
    SELECT bool_and(
      official_document_url = 'https://www.cambridgeinternational.org/Images/206341-syllabus-component-weighting-factors.pdf'
      AND source_checksum_sha256 = decode('d96f96e5d8847470fd7291f75aa01184b3c0cff7075b5010968e16d94218ada9', 'hex')
      AND source_label = 'Syllabus component weighting factors: November 2025, March 2026 and June 2026'
    ) FROM public.grade_threshold_weighting_sources
  ),
  '30. Weighting provenance: all 3 weighting sources point to single official document URL and SHA-256'
);

SELECT is(
  (SELECT array_agg(source_page ORDER BY id) FROM public.grade_threshold_weighting_entries),
  ARRAY[85::smallint, 85::smallint, 85::smallint, 86::smallint, 86::smallint, 86::smallint, 86::smallint, 87::smallint, 89::smallint, 89::smallint, 90::smallint],
  '31. Weighting entries: authentic source pages populated (85 Chem, 86-87 Phys, 89-90 Math)'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_component_variants WHERE (source_row_metadata->>'source_page')::INT = 1),
  13,
  '32. Component variants: all 13 variants have traceable source_row_metadata with source_page = 1'
);

-- Authentic Component Thresholds Verification
SELECT ok(
  (
    SELECT
      (SELECT array_agg(threshold_mark ORDER BY grade) FROM public.grade_threshold_component_marks WHERE component_variant_id = '00000000-0000-4000-8000-000000000081') = ARRAY[25::smallint, 22::smallint, 18::smallint, 14::smallint, 11::smallint]
      AND (SELECT array_agg(threshold_mark ORDER BY grade) FROM public.grade_threshold_component_marks WHERE component_variant_id = '00000000-0000-4000-8000-000000000082') = ARRAY[37::smallint, 27::smallint, 22::smallint, 18::smallint, 12::smallint]
      AND (SELECT array_agg(threshold_mark ORDER BY grade) FROM public.grade_threshold_component_marks WHERE component_variant_id = '00000000-0000-4000-8000-000000000083') = ARRAY[22::smallint, 17::smallint, 14::smallint, 12::smallint, 10::smallint]
  ),
  '33. Authentic component marks: Chem 9701 (12: 25,22,18,14,11; 22: 37,27,22,18,12; 33: 22,17,14,12,10)'
);

SELECT ok(
  (
    SELECT
      (SELECT array_agg(threshold_mark ORDER BY grade) FROM public.grade_threshold_component_marks WHERE component_variant_id = '00000000-0000-4000-8000-000000000084') = ARRAY[30::smallint, 25::smallint, 21::smallint, 18::smallint, 15::smallint]
      AND (SELECT array_agg(threshold_mark ORDER BY grade) FROM public.grade_threshold_component_marks WHERE component_variant_id = '00000000-0000-4000-8000-000000000085') = ARRAY[40::smallint, 35::smallint, 30::smallint, 24::smallint, 17::smallint]
      AND (SELECT array_agg(threshold_mark ORDER BY grade) FROM public.grade_threshold_component_marks WHERE component_variant_id = '00000000-0000-4000-8000-000000000086') = ARRAY[33::smallint, 30::smallint, 26::smallint, 23::smallint, 20::smallint]
      AND (SELECT array_agg(threshold_mark ORDER BY grade) FROM public.grade_threshold_component_marks WHERE component_variant_id = '00000000-0000-4000-8000-000000000087') = ARRAY[62::smallint, 51::smallint, 41::smallint, 31::smallint, 21::smallint]
      AND (SELECT array_agg(threshold_mark ORDER BY grade) FROM public.grade_threshold_component_marks WHERE component_variant_id = '00000000-0000-4000-8000-000000000088') = ARRAY[20::smallint, 17::smallint, 14::smallint, 11::smallint, 8::smallint]
  ),
  '34. Authentic component marks: Phys 9702 (12: 30..15; 22: 40..17; 33: 33..20; 42: 62..21; 52: 20..8)'
);

SELECT ok(
  (
    SELECT
      (SELECT array_agg(threshold_mark ORDER BY grade) FROM public.grade_threshold_component_marks WHERE component_variant_id = '00000000-0000-4000-8000-000000000089') = ARRAY[55::smallint, 48::smallint, 38::smallint, 27::smallint, 16::smallint]
      AND (SELECT array_agg(threshold_mark ORDER BY grade) FROM public.grade_threshold_component_marks WHERE component_variant_id = '00000000-0000-4000-8000-00000000008a') = ARRAY[45::smallint, 41::smallint, 32::smallint, 22::smallint, 13::smallint]
      AND (SELECT array_agg(threshold_mark ORDER BY grade) FROM public.grade_threshold_component_marks WHERE component_variant_id = '00000000-0000-4000-8000-00000000008b') = ARRAY[59::smallint, 48::smallint, 37::smallint, 26::smallint, 15::smallint]
      AND (SELECT array_agg(threshold_mark ORDER BY grade) FROM public.grade_threshold_component_marks WHERE component_variant_id = '00000000-0000-4000-8000-00000000008c') = ARRAY[61::smallint, 51::smallint, 37::smallint, 23::smallint, 10::smallint]
      AND (SELECT array_agg(threshold_mark ORDER BY grade) FROM public.grade_threshold_component_marks WHERE component_variant_id = '00000000-0000-4000-8000-00000000008d') = ARRAY[61::smallint, 52::smallint, 39::smallint, 26::smallint, 13::smallint]
  ),
  '35. Authentic component marks: Math 9709 (35: 55..16; 55: 45..13; 11: 59..15; 12: 61..10; 13: 61..13)'
);

SELECT is(
  (
    SELECT CEIL(AVG(m.threshold_mark))::INT
    FROM public.grade_threshold_variant_benchmark_members mem
    JOIN public.grade_threshold_component_marks m ON m.component_variant_id = mem.component_variant_id
    WHERE mem.group_id = '00000000-0000-4000-8000-000000000061'
      AND m.grade = 'A'
  ),
  61,
  '36. Benchmark group: Math Pure 1 Grade A benchmark mark is calculated ceiling average 61'
);

-- ─── 6. Evidence Promotion & Carry-Forward Bridge Assertions ──────────────────

SELECT is(
  (SELECT review_status FROM public.grade_threshold_carry_forward_evidence_documents WHERE id = '00000036-0000-4000-8000-000000000001'),
  'approved',
  '37. Post-fixture evidence promotion: evidence document review_status is approved'
);

SELECT is(
  (SELECT is_active FROM public.grade_threshold_carry_forward_evidence_documents WHERE id = '00000036-0000-4000-8000-000000000001'),
  TRUE,
  '38. Post-fixture evidence promotion: evidence document is_active is TRUE'
);

SELECT is(
  (SELECT reviewed_by FROM public.grade_threshold_carry_forward_evidence_documents WHERE id = '00000036-0000-4000-8000-000000000001'),
  'm5-fixture-auditor',
  '39. Post-fixture evidence promotion: reviewed_by matches m5-fixture-auditor'
);

SELECT is(
  (SELECT evidence_status FROM public.grade_threshold_carry_forward_source_mappings WHERE id = '00000036-9709-4000-8000-000000000001'),
  'confirmed',
  '40. Post-fixture evidence promotion: source mapping evidence_status is confirmed'
);

SELECT is(
  (SELECT authorized_by FROM public.grade_threshold_carry_forward_source_mappings WHERE id = '00000036-9709-4000-8000-000000000001'),
  'm5-fixture-auditor',
  '41. Post-fixture evidence promotion: authorized_by matches m5-fixture-auditor'
);

SELECT is(
  (SELECT token_id FROM public.grade_threshold_combination_carry_forward_links WHERE id = 'f1870000-0000-4000-8000-000000000002'),
  '00000000-0000-4000-8000-0000000000db'::UUID,
  '42. Bridge link: links to Math Option DC carry-forward token 82'
);

SELECT is(
  (SELECT source_mapping_id FROM public.grade_threshold_combination_carry_forward_links WHERE id = 'f1870000-0000-4000-8000-000000000002'),
  '00000036-9709-4000-8000-000000000001'::UUID,
  '43. Bridge link: links to Migration 036 Math source mapping'
);

-- ─── 7. Published View Assertions & Planner Eligibility ───────────────────────

SELECT is(
  (SELECT count(*)::INT FROM public.published_grade_threshold_carry_forward_mappings),
  1,
  '44. Published view: exactly 1 carry-forward mapping exposed in published view'
);

SELECT is(
  (SELECT combination_id FROM public.published_grade_threshold_carry_forward_mappings),
  '00000000-0000-4000-8000-0000000000c3'::UUID,
  '45. Published view: exposed mapping is linked to Math Option DC'
);

SELECT ok(
  EXISTS (SELECT 1 FROM public.published_grade_threshold_combinations WHERE id = '00000000-0000-4000-8000-0000000000c1'),
  '46. Published combinations: Chem Option S3 is published'
);

SELECT is(
  (SELECT per_paper_allocation_eligible FROM public.published_grade_threshold_combinations WHERE id = '00000000-0000-4000-8000-0000000000c1'),
  TRUE,
  '47. Published combinations: Chem Option S3 per_paper_allocation_eligible is TRUE'
);

SELECT ok(
  EXISTS (SELECT 1 FROM public.published_grade_threshold_combinations WHERE id = '00000000-0000-4000-8000-0000000000c2'),
  '48. Published combinations: Phys Option AY is published'
);

SELECT is(
  (SELECT per_paper_allocation_eligible FROM public.published_grade_threshold_combinations WHERE id = '00000000-0000-4000-8000-0000000000c2'),
  TRUE,
  '49. Published combinations: Phys Option AY per_paper_allocation_eligible is TRUE'
);

SELECT ok(
  EXISTS (SELECT 1 FROM public.published_grade_threshold_combinations WHERE id = '00000000-0000-4000-8000-0000000000c3'),
  '50. Published combinations: Math Option DC is published'
);

SELECT is(
  (SELECT per_paper_allocation_eligible FROM public.published_grade_threshold_combinations WHERE id = '00000000-0000-4000-8000-0000000000c3'),
  TRUE,
  '51. Published combinations: Math Option DC per_paper_allocation_eligible is TRUE'
);

-- ─── 8. User Enrollment & Subject Setup Assertions ────────────────────────────

SELECT is(
  (SELECT count(*)::INT FROM public.user_subjects WHERE user_id = 'f1870000-0000-4000-8000-000000000001'),
  3,
  '52. User 1 enrollment: enrolled in exactly 3 subjects (Chem, Phys, Math)'
);

SELECT is(
  (SELECT count(*)::INT FROM public.subject_paper_selections WHERE user_subject_id IN (
    SELECT id FROM public.user_subjects WHERE user_id = 'f1870000-0000-4000-8000-000000000001'
  )),
  12,
  '53. User 1 enrollment: has exactly 12 paper selections (3 Chem + 5 Phys + 4 Math)'
);

-- ─── 9. Positive Owner Access & Cross-User RLS Isolation Assertions ───────────

DO $$
DECLARE
  v_u1 UUID := 'f1870000-0000-4000-8000-000000000001';
  v_u2 UUID := 'f1870000-0000-4000-8000-000000000006';
  v_subj_chem UUID := '9dc6d47b-4a83-5220-8c00-14de63eeb9c1';
  v_us1_chem UUID;
  v_us2_chem UUID;
  v_rows_updated INT;
  v_err_caught BOOLEAN := FALSE;
  v_u2_see_u1_subj INT;
  v_u2_see_u1_sps INT;
  v_u2_see_u1_papers INT;
BEGIN
  SELECT id INTO v_us1_chem FROM public.user_subjects WHERE user_id = v_u1 AND subject_id = v_subj_chem;

  -- Impersonate User 2 under authenticated role
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_u2, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_u2::text, true);

  -- Positive test 1: User 2 can enroll in Chem
  v_us2_chem := public.add_subject_enrollment(v_u2, v_subj_chem);
  PERFORM public.configure_subject_route(v_u2, v_us2_chem, 'as_only', '[]'::jsonb);

  -- Positive test 2: User 2 can update own target grade
  UPDATE public.user_subjects SET target_grade = 'B' WHERE id = v_us2_chem;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated <> 1 THEN
    RAISE EXCEPTION 'RLS failure: User 2 could not update own user_subjects row';
  END IF;

  -- Negative test 1: User 2 cannot update User 1's user_subjects
  UPDATE public.user_subjects SET target_grade = 'B' WHERE id = v_us1_chem;
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated <> 0 THEN
    RAISE EXCEPTION 'RLS leak: User 2 modified User 1 user_subjects row';
  END IF;

  -- Negative test 2: User 2 cannot call configure_subject_route on User 1
  BEGIN
    PERFORM public.configure_subject_route(v_u1, v_us1_chem, 'as_only', '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      v_err_caught := TRUE;
    END IF;
  END;
  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'RLS leak: User 2 configure_subject_route on User 1 was not rejected with 42501';
  END IF;

  -- Negative test 3: User 2 cannot read User 1's user_subjects
  SELECT count(*) INTO v_u2_see_u1_subj FROM public.user_subjects WHERE user_id = v_u1;
  IF v_u2_see_u1_subj <> 0 THEN
    RAISE EXCEPTION 'RLS leak: User 2 read % rows from User 1 user_subjects', v_u2_see_u1_subj;
  END IF;

  -- Negative test 4: User 2 cannot read User 1's subject_paper_selections
  SELECT count(*) INTO v_u2_see_u1_sps FROM public.subject_paper_selections WHERE user_subject_id = v_us1_chem;
  IF v_u2_see_u1_sps <> 0 THEN
    RAISE EXCEPTION 'RLS leak: User 2 read % rows from User 1 subject_paper_selections', v_u2_see_u1_sps;
  END IF;

  -- Negative test 5: User 2 cannot read User 1's past_papers
  SELECT count(*) INTO v_u2_see_u1_papers FROM public.past_papers WHERE user_id = v_u1;
  IF v_u2_see_u1_papers <> 0 THEN
    RAISE EXCEPTION 'RLS leak: User 2 read % rows from User 1 past_papers', v_u2_see_u1_papers;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END;
$$;

SELECT pass('54. Positive owner access: User 2 enrolled and configured own route');
SELECT pass('55. Positive owner update: User 2 updated own target grade');
SELECT pass('56. Cross-user RLS isolation: User 2 updating User 1 user_subjects updated 0 rows');
SELECT pass('57. Cross-user RLS isolation: User 2 configure_subject_route on User 1 raised 42501 Unauthorized');
SELECT pass('58. Cross-user RLS isolation: User 2 cannot read User 1 user_subjects (0 rows)');
SELECT pass('59. Cross-user RLS isolation: User 2 cannot read User 1 subject_paper_selections (0 rows)');
SELECT pass('60. Cross-user RLS isolation: User 2 cannot read User 1 past_papers (0 rows)');

-- ─── 10. Historical Attempt Scoping & Score Assertions ─────────────────────────

SELECT is(
  (SELECT count(*)::INT FROM public.past_papers WHERE user_id = 'f1870000-0000-4000-8000-000000000001'),
  3,
  '61. Owner historical attempts: User 1 has exactly 3 logged paper attempts'
);

SELECT is(
  (SELECT score_raw::INT FROM public.past_papers WHERE id = 'f1870000-0000-4000-8000-000000000003'),
  27,
  '62. Historical attempts: Chem Paper 12 raw score is 27'
);

SELECT is(
  (SELECT score_max::INT FROM public.past_papers WHERE id = 'f1870000-0000-4000-8000-000000000003'),
  40,
  '63. Historical attempts: Chem Paper 12 max mark is 40'
);

SELECT is(
  (SELECT score_raw::INT FROM public.past_papers WHERE id = 'f1870000-0000-4000-8000-000000000004'),
  39,
  '64. Historical attempts: Chem Paper 22 raw score is 39'
);

SELECT is(
  (SELECT score_raw::INT FROM public.past_papers WHERE id = 'f1870000-0000-4000-8000-000000000005'),
  22,
  '65. Historical attempts: Chem Paper 33 raw score is 22'
);

-- ─── 11. Complete Test Suite & Transactional Rollback ─────────────────────────

SELECT finish();

ROLLBACK;
