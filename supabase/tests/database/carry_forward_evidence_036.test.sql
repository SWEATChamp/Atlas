-- ==============================================================================
-- DATABASE TEST: Migration 036 Verification (Slice 2C Gate 2 China Zone 5 Seeding)
--
-- File: supabase/tests/database/carry_forward_evidence_036.test.sql
-- Purpose:
--   Verifies that Migration 036 correctly and deterministically seeded the
--   unreviewed, inactive China Zone 5 carry-forward evidence document and
--   all 10 normalized source mappings without creating bridge links, altering
--   catalogue data, or promoting planner eligibility.
--
-- Why Migration 036 Creates Persisted Unreviewed Rows:
--   Unlike testing fixtures that construct synthetic scenarios inside a transaction
--   and roll them back, Migration 036 is an official forward schema data migration
--   that seeds immutable baseline evidentiary records into the database. These
--   records persist in an unreviewed, inactive, unlinked state so that subsequent
--   review, authorization, and link-building migrations/actions can reference
--   permanent, verifiable evidence anchors without mutating the database structure.
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(85);

-- ─── 1. Evidence Document Seed Verification ───────────────────────────────────

-- 1. Exactly 1 evidence document exists
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_evidence_documents),
  1,
  '1. Exactly one evidence document exists in the catalogue'
);

-- 2-20. Document field-level verification
SELECT is(
  id,
  '00000036-0000-4000-8000-000000000001'::UUID,
  '2. Document ID matches deterministic UUID'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  document_title,
  'Cambridge Guide to Making Entries: Including syllabus and option codes for June 2026 series',
  '3. Document title matches official published title'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  issuer,
  'Cambridge University Press & Assessment',
  '4. Document issuer matches Cambridge University Press & Assessment'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  source_url,
  'https://www.cambridgeinternational.org/Images/724211-guide-to-making-entries.pdf',
  '5. Source URL matches official Cambridge HTTPS PDF endpoint'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  checksum_sha256,
  decode('80f88e04138b06e984c14a5292a0c298e654ca35806d3344043d9ad7de729fda', 'hex'),
  '6. Checksum matches exact decoded 32-byte SHA-256'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  octet_length(checksum_sha256),
  32,
  '7. Checksum is stored as exact 32-byte binary'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  file_size_bytes,
  2063398::BIGINT,
  '8. File size matches exact byte count (2,063,398 bytes)'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  pdf_version,
  '1.6',
  '9. PDF version matches 1.6'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  page_count,
  69,
  '10. Page count matches 69'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  official_published_on,
  NULL::DATE,
  '11. official_published_on is NULL'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  exam_year,
  2026::SMALLINT,
  '12. Exam year is 2026'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  exam_series,
  'june',
  '13. Exam series is june'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  scope_basis,
  'administrative_zone',
  '14. Scope basis is administrative_zone'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  declared_administrative_zones,
  ARRAY['5']::TEXT[],
  '15. Declared administrative zones equals [5]'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  declared_territories,
  ARRAY['CN']::TEXT[],
  '16. Declared territories equals [CN]'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  scope_declaration,
  'China (administrative zone 5), June 2026 series',
  '17. Scope declaration describes China Zone 5 June 2026'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  review_status,
  'unreviewed',
  '18. Review status remains unreviewed'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  reviewed_by,
  NULL::TEXT,
  '19. reviewed_by is NULL'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  reviewed_at,
  NULL::TIMESTAMPTZ,
  '20. reviewed_at is NULL'
) FROM public.grade_threshold_carry_forward_evidence_documents;

SELECT is(
  is_active,
  FALSE,
  '21. is_active remains FALSE'
) FROM public.grade_threshold_carry_forward_evidence_documents;


-- ─── 2. Source Mappings Count & Subject Distribution ─────────────────────────

-- 22. Exactly 10 source mappings exist
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings),
  10,
  '22. Exactly ten source mappings exist'
);

-- 23. Exactly 6 mappings for syllabus 9709
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings WHERE syllabus_code = '9709'),
  6,
  '23. Exactly 6 source mappings exist for Mathematics 9709'
);

-- 24. Exactly 4 mappings for syllabus 9231
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings WHERE syllabus_code = '9231'),
  4,
  '24. Exactly 4 source mappings exist for Further Mathematics 9231'
);


-- ─── 3. Detailed Verification of Each Mapping Row ────────────────────────────

-- 25. 9709 DC
SELECT is(
  ROW(raw_carry_forward_token, sitting_components, carried_as_components, carried_exam_year, carried_exam_series, page_locator, evidence_status)::TEXT,
  ROW('82', ARRAY['35','55']::TEXT[], ARRAY['15','45']::TEXT[], 2025::SMALLINT, 'june', 'Section 3.7, printed p. 50, PDF p. 50', 'unreviewed')::TEXT,
  '25. 9709 DC mapping fields match exactly'
) FROM public.grade_threshold_carry_forward_source_mappings
WHERE id = '00000036-9709-4000-8000-000000000001';

-- 26. 9709 EC
SELECT is(
  ROW(raw_carry_forward_token, sitting_components, carried_as_components, carried_exam_year, carried_exam_series, page_locator, evidence_status)::TEXT,
  ROW('83', ARRAY['35','45']::TEXT[], ARRAY['15','55']::TEXT[], 2025::SMALLINT, 'june', 'Section 3.7, printed p. 50, PDF p. 50', 'unreviewed')::TEXT,
  '26. 9709 EC mapping fields match exactly'
) FROM public.grade_threshold_carry_forward_source_mappings
WHERE id = '00000036-9709-4000-8000-000000000002';

-- 27. 9709 GC
SELECT is(
  ROW(raw_carry_forward_token, sitting_components, carried_as_components, carried_exam_year, carried_exam_series, page_locator, evidence_status)::TEXT,
  ROW('83', ARRAY['35','65']::TEXT[], ARRAY['15','55']::TEXT[], 2025::SMALLINT, 'june', 'Section 3.7, printed p. 50, PDF p. 50', 'unreviewed')::TEXT,
  '27. 9709 GC mapping fields match exactly'
) FROM public.grade_threshold_carry_forward_source_mappings
WHERE id = '00000036-9709-4000-8000-000000000003';

-- 28. 9709 HC
SELECT is(
  ROW(raw_carry_forward_token, sitting_components, carried_as_components, carried_exam_year, carried_exam_series, page_locator, evidence_status)::TEXT,
  ROW('92', ARRAY['35','55']::TEXT[], ARRAY['15','45']::TEXT[], 2025::SMALLINT, 'november', 'Section 3.7, printed p. 50, PDF p. 50', 'unreviewed')::TEXT,
  '28. 9709 HC mapping fields match exactly'
) FROM public.grade_threshold_carry_forward_source_mappings
WHERE id = '00000036-9709-4000-8000-000000000004';

-- 29. 9709 IC
SELECT is(
  ROW(raw_carry_forward_token, sitting_components, carried_as_components, carried_exam_year, carried_exam_series, page_locator, evidence_status)::TEXT,
  ROW('93', ARRAY['35','45']::TEXT[], ARRAY['15','55']::TEXT[], 2025::SMALLINT, 'november', 'Section 3.7, printed p. 50, PDF p. 50', 'unreviewed')::TEXT,
  '29. 9709 IC mapping fields match exactly'
) FROM public.grade_threshold_carry_forward_source_mappings
WHERE id = '00000036-9709-4000-8000-000000000005';

-- 30. 9709 KC
SELECT is(
  ROW(raw_carry_forward_token, sitting_components, carried_as_components, carried_exam_year, carried_exam_series, page_locator, evidence_status)::TEXT,
  ROW('93', ARRAY['35','65']::TEXT[], ARRAY['15','55']::TEXT[], 2025::SMALLINT, 'november', 'Section 3.7, printed p. 50, PDF p. 50', 'unreviewed')::TEXT,
  '30. 9709 KC mapping fields match exactly'
) FROM public.grade_threshold_carry_forward_source_mappings
WHERE id = '00000036-9709-4000-8000-000000000006';

-- 31. 9231 BC
SELECT is(
  ROW(raw_carry_forward_token, sitting_components, carried_as_components, carried_exam_year, carried_exam_series, page_locator, evidence_status)::TEXT,
  ROW('62', ARRAY['24','44']::TEXT[], ARRAY['14','34']::TEXT[], 2025::SMALLINT, 'june', 'Section 3.7, printed p. 46, PDF p. 46', 'unreviewed')::TEXT,
  '31. 9231 BC mapping fields match exactly'
) FROM public.grade_threshold_carry_forward_source_mappings
WHERE id = '00000036-9231-4000-8000-000000000001';

-- 32. 9231 CC
SELECT is(
  ROW(raw_carry_forward_token, sitting_components, carried_as_components, carried_exam_year, carried_exam_series, page_locator, evidence_status)::TEXT,
  ROW('63', ARRAY['24','34']::TEXT[], ARRAY['14','44']::TEXT[], 2025::SMALLINT, 'june', 'Section 3.7, printed p. 46, PDF p. 46', 'unreviewed')::TEXT,
  '32. 9231 CC mapping fields match exactly'
) FROM public.grade_threshold_carry_forward_source_mappings
WHERE id = '00000036-9231-4000-8000-000000000002';

-- 33. 9231 DC
SELECT is(
  ROW(raw_carry_forward_token, sitting_components, carried_as_components, carried_exam_year, carried_exam_series, page_locator, evidence_status)::TEXT,
  ROW('72', ARRAY['24','44']::TEXT[], ARRAY['14','34']::TEXT[], 2025::SMALLINT, 'november', 'Section 3.7, printed p. 46, PDF p. 46', 'unreviewed')::TEXT,
  '33. 9231 DC mapping fields match exactly'
) FROM public.grade_threshold_carry_forward_source_mappings
WHERE id = '00000036-9231-4000-8000-000000000003';

-- 34. 9231 EC
SELECT is(
  ROW(raw_carry_forward_token, sitting_components, carried_as_components, carried_exam_year, carried_exam_series, page_locator, evidence_status)::TEXT,
  ROW('73', ARRAY['24','34']::TEXT[], ARRAY['14','44']::TEXT[], 2025::SMALLINT, 'november', 'Section 3.7, printed p. 46, PDF p. 46', 'unreviewed')::TEXT,
  '34. 9231 EC mapping fields match exactly'
) FROM public.grade_threshold_carry_forward_source_mappings
WHERE id = '00000036-9231-4000-8000-000000000004';


-- ─── 4. Structural Disambiguation and Edge Cases ─────────────────────────────

-- 35. Token 83 retains two distinct 9709 options (EC and GC)
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings
   WHERE syllabus_code = '9709' AND raw_carry_forward_token = '83'),
  2,
  '35. Token 83 maps to exactly two distinct 9709 options (EC and GC)'
);

-- 36. Token 93 retains two distinct 9709 options (IC and KC)
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings
   WHERE syllabus_code = '9709' AND raw_carry_forward_token = '93'),
  2,
  '36. Token 93 maps to exactly two distinct 9709 options (IC and KC)'
);

-- 37. Cross-syllabus DC options coexist independently (9709 DC vs 9231 DC)
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings
   WHERE entry_option_code = 'DC'),
  2,
  '37. Option DC coexists across syllabuses 9709 and 9231 without collision'
);

-- 38. Cross-syllabus EC options coexist independently (9709 EC vs 9231 EC)
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings
   WHERE entry_option_code = 'EC'),
  2,
  '38. Option EC coexists across syllabuses 9709 and 9231 without collision'
);

-- 39. No mapping contains component '25' (Pure Math 2 is AS-only)
SELECT is_empty(
  $$
  SELECT id FROM public.grade_threshold_carry_forward_source_mappings
  WHERE '25' = ANY(sitting_components)
     OR '25' = ANY(carried_as_components)
     OR '25' = ANY(applicable_paper_variants)
  $$,
  '39. Component 25 (Pure Mathematics 2) does not appear in any staged mapping'
);


-- ─── 5. Applicable Paper Variants Union Invariant ────────────────────────────

-- 40-49. Each row's applicable_paper_variants equals the sorted unique union
SELECT is(
  applicable_paper_variants,
  ARRAY['15', '35', '45', '55']::TEXT[],
  '40. 9709 DC applicable_paper_variants equals sorted union [15, 35, 45, 55]'
) FROM public.grade_threshold_carry_forward_source_mappings WHERE id = '00000036-9709-4000-8000-000000000001';

SELECT is(
  applicable_paper_variants,
  ARRAY['15', '35', '45', '55']::TEXT[],
  '41. 9709 EC applicable_paper_variants equals sorted union [15, 35, 45, 55]'
) FROM public.grade_threshold_carry_forward_source_mappings WHERE id = '00000036-9709-4000-8000-000000000002';

SELECT is(
  applicable_paper_variants,
  ARRAY['15', '35', '55', '65']::TEXT[],
  '42. 9709 GC applicable_paper_variants equals sorted union [15, 35, 55, 65]'
) FROM public.grade_threshold_carry_forward_source_mappings WHERE id = '00000036-9709-4000-8000-000000000003';

SELECT is(
  applicable_paper_variants,
  ARRAY['15', '35', '45', '55']::TEXT[],
  '43. 9709 HC applicable_paper_variants equals sorted union [15, 35, 45, 55]'
) FROM public.grade_threshold_carry_forward_source_mappings WHERE id = '00000036-9709-4000-8000-000000000004';

SELECT is(
  applicable_paper_variants,
  ARRAY['15', '35', '45', '55']::TEXT[],
  '44. 9709 IC applicable_paper_variants equals sorted union [15, 35, 45, 55]'
) FROM public.grade_threshold_carry_forward_source_mappings WHERE id = '00000036-9709-4000-8000-000000000005';

SELECT is(
  applicable_paper_variants,
  ARRAY['15', '35', '55', '65']::TEXT[],
  '45. 9709 KC applicable_paper_variants equals sorted union [15, 35, 55, 65]'
) FROM public.grade_threshold_carry_forward_source_mappings WHERE id = '00000036-9709-4000-8000-000000000006';

SELECT is(
  applicable_paper_variants,
  ARRAY['14', '24', '34', '44']::TEXT[],
  '46. 9231 BC applicable_paper_variants equals sorted union [14, 24, 34, 44]'
) FROM public.grade_threshold_carry_forward_source_mappings WHERE id = '00000036-9231-4000-8000-000000000001';

SELECT is(
  applicable_paper_variants,
  ARRAY['14', '24', '34', '44']::TEXT[],
  '47. 9231 CC applicable_paper_variants equals sorted union [14, 24, 34, 44]'
) FROM public.grade_threshold_carry_forward_source_mappings WHERE id = '00000036-9231-4000-8000-000000000002';

SELECT is(
  applicable_paper_variants,
  ARRAY['14', '24', '34', '44']::TEXT[],
  '48. 9231 DC applicable_paper_variants equals sorted union [14, 24, 34, 44]'
) FROM public.grade_threshold_carry_forward_source_mappings WHERE id = '00000036-9231-4000-8000-000000000003';

SELECT is(
  applicable_paper_variants,
  ARRAY['14', '24', '34', '44']::TEXT[],
  '49. 9231 EC applicable_paper_variants equals sorted union [14, 24, 34, 44]'
) FROM public.grade_threshold_carry_forward_source_mappings WHERE id = '00000036-9231-4000-8000-000000000004';


-- ─── 6. Session Distribution & Invariance ────────────────────────────────────

-- 50. Exactly 5 June 2025 carried session mappings
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings
   WHERE carried_exam_year = 2025 AND carried_exam_series = 'june'),
  5,
  '50. Exactly 5 mappings carry forward from June 2025'
);

-- 51. Exactly 5 November 2025 carried session mappings
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings
   WHERE carried_exam_year = 2025 AND carried_exam_series = 'november'),
  5,
  '51. Exactly 5 mappings carry forward from November 2025'
);


-- ─── 7. Bridge & Planner Non-Exposure Invariants ─────────────────────────────

-- 52. Zero bridge links exist
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combination_carry_forward_links),
  0,
  '52. Zero combination carry-forward bridge links exist'
);

-- 53. Published evidence view returns zero rows (document is inactive, 0 links)
SELECT is_empty(
  $$ SELECT * FROM public.published_grade_threshold_carry_forward_mappings $$,
  '53. Published evidence view is completely empty'
);

-- 54. Published combinations view contains zero staged combinations
SELECT is_empty(
  $$ SELECT * FROM public.published_grade_threshold_combinations WHERE route_type = 'staged' $$,
  '54. Published combinations view contains zero staged combinations'
);

-- 55. Zero combinations are eligible
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combinations WHERE planner_eligibility = 'eligible'),
  0,
  '55. Zero combinations have planner_eligibility = eligible'
);


-- ─── 8. Security & Privilege Lockdown (Least Privilege) ──────────────────────

SET LOCAL ROLE anon;

-- 56-59. anon denied on evidence documents
SELECT throws_ok(
  $$ SELECT * FROM public.grade_threshold_carry_forward_evidence_documents $$,
  '42501', NULL,
  '56. Direct SELECT on evidence_documents denied to anon'
);
SELECT throws_ok(
  $$ INSERT INTO public.grade_threshold_carry_forward_evidence_documents (document_title) VALUES ('X') $$,
  '42501', NULL,
  '57. Direct INSERT on evidence_documents denied to anon'
);
SELECT throws_ok(
  $$ UPDATE public.grade_threshold_carry_forward_evidence_documents SET document_title = 'X' $$,
  '42501', NULL,
  '58. Direct UPDATE on evidence_documents denied to anon'
);
SELECT throws_ok(
  $$ DELETE FROM public.grade_threshold_carry_forward_evidence_documents $$,
  '42501', NULL,
  '59. Direct DELETE on evidence_documents denied to anon'
);

-- 60-63. anon denied on source mappings
SELECT throws_ok(
  $$ SELECT * FROM public.grade_threshold_carry_forward_source_mappings $$,
  '42501', NULL,
  '60. Direct SELECT on source_mappings denied to anon'
);
SELECT throws_ok(
  $$ INSERT INTO public.grade_threshold_carry_forward_source_mappings (syllabus_code) VALUES ('9709') $$,
  '42501', NULL,
  '61. Direct INSERT on source_mappings denied to anon'
);
SELECT throws_ok(
  $$ UPDATE public.grade_threshold_carry_forward_source_mappings SET syllabus_code = '9709' $$,
  '42501', NULL,
  '62. Direct UPDATE on source_mappings denied to anon'
);
SELECT throws_ok(
  $$ DELETE FROM public.grade_threshold_carry_forward_source_mappings $$,
  '42501', NULL,
  '63. Direct DELETE on source_mappings denied to anon'
);

-- 64-67. anon denied on combination links
SELECT throws_ok(
  $$ SELECT * FROM public.grade_threshold_combination_carry_forward_links $$,
  '42501', NULL,
  '64. Direct SELECT on combination_carry_forward_links denied to anon'
);
SELECT throws_ok(
  $$ INSERT INTO public.grade_threshold_combination_carry_forward_links (source_mapping_id) VALUES (gen_random_uuid()) $$,
  '42501', NULL,
  '65. Direct INSERT on combination_carry_forward_links denied to anon'
);
SELECT throws_ok(
  $$ UPDATE public.grade_threshold_combination_carry_forward_links SET source_mapping_id = gen_random_uuid() $$,
  '42501', NULL,
  '66. Direct UPDATE on combination_carry_forward_links denied to anon'
);
SELECT throws_ok(
  $$ DELETE FROM public.grade_threshold_combination_carry_forward_links $$,
  '42501', NULL,
  '67. Direct DELETE on combination_carry_forward_links denied to anon'
);

SET LOCAL ROLE authenticated;

-- 68-71. authenticated denied on evidence documents
SELECT throws_ok(
  $$ SELECT * FROM public.grade_threshold_carry_forward_evidence_documents $$,
  '42501', NULL,
  '68. Direct SELECT on evidence_documents denied to authenticated'
);
SELECT throws_ok(
  $$ INSERT INTO public.grade_threshold_carry_forward_evidence_documents (document_title) VALUES ('X') $$,
  '42501', NULL,
  '69. Direct INSERT on evidence_documents denied to authenticated'
);
SELECT throws_ok(
  $$ UPDATE public.grade_threshold_carry_forward_evidence_documents SET document_title = 'X' $$,
  '42501', NULL,
  '70. Direct UPDATE on evidence_documents denied to authenticated'
);
SELECT throws_ok(
  $$ DELETE FROM public.grade_threshold_carry_forward_evidence_documents $$,
  '42501', NULL,
  '71. Direct DELETE on evidence_documents denied to authenticated'
);

-- 72-75. authenticated denied on source mappings
SELECT throws_ok(
  $$ SELECT * FROM public.grade_threshold_carry_forward_source_mappings $$,
  '42501', NULL,
  '72. Direct SELECT on source_mappings denied to authenticated'
);
SELECT throws_ok(
  $$ INSERT INTO public.grade_threshold_carry_forward_source_mappings (syllabus_code) VALUES ('9709') $$,
  '42501', NULL,
  '73. Direct INSERT on source_mappings denied to authenticated'
);
SELECT throws_ok(
  $$ UPDATE public.grade_threshold_carry_forward_source_mappings SET syllabus_code = '9709' $$,
  '42501', NULL,
  '74. Direct UPDATE on source_mappings denied to authenticated'
);
SELECT throws_ok(
  $$ DELETE FROM public.grade_threshold_carry_forward_source_mappings $$,
  '42501', NULL,
  '75. Direct DELETE on source_mappings denied to authenticated'
);

-- 76-79. authenticated denied on combination links
SELECT throws_ok(
  $$ SELECT * FROM public.grade_threshold_combination_carry_forward_links $$,
  '42501', NULL,
  '76. Direct SELECT on combination_carry_forward_links denied to authenticated'
);
SELECT throws_ok(
  $$ INSERT INTO public.grade_threshold_combination_carry_forward_links (source_mapping_id) VALUES (gen_random_uuid()) $$,
  '42501', NULL,
  '77. Direct INSERT on combination_carry_forward_links denied to authenticated'
);
SELECT throws_ok(
  $$ UPDATE public.grade_threshold_combination_carry_forward_links SET source_mapping_id = gen_random_uuid() $$,
  '42501', NULL,
  '78. Direct UPDATE on combination_carry_forward_links denied to authenticated'
);
SELECT throws_ok(
  $$ DELETE FROM public.grade_threshold_combination_carry_forward_links $$,
  '42501', NULL,
  '79. Direct DELETE on combination_carry_forward_links denied to authenticated'
);

RESET ROLE;


-- ─── 9. Catalogue Hash & Count Invariance ────────────────────────────────────

-- 80. Publications table has 0 rows
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_publications),
  0,
  '80. Grade threshold publications table remains empty (0 rows)'
);

-- 81. Combinations table has 0 rows
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combinations),
  0,
  '81. Grade threshold combinations table remains empty (0 rows)'
);

-- 82. Combination tokens table has 0 rows
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combination_tokens),
  0,
  '82. Grade threshold combination tokens table remains empty (0 rows)'
);

-- 83. Final evidence row count stability check
SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings),
  10,
  '83. Seeded evidence rows remain intact and unaltered throughout testing'
);


-- ─── 10. Canonical Expected-Set Bidirectional Set Equality ───────────────────

-- 84. Exact canonical expected-set comparison covers all ten mappings across all 23 non-timestamp columns
SELECT set_eq(
  $$
  SELECT
    id,
    evidence_document_id,
    syllabus_code,
    entry_option_code,
    raw_carry_forward_token,
    sitting_components,
    carried_as_components,
    applicable_paper_variants,
    sitting_exam_year,
    sitting_exam_series,
    carried_exam_year,
    carried_exam_series,
    scope_basis,
    scope_administrative_zones,
    scope_territories,
    scope_declaration,
    page_locator,
    evidence_status,
    unresolved_reasons,
    ambiguity_reasons,
    rejection_reason,
    authorized_by,
    authorized_at
  FROM public.grade_threshold_carry_forward_source_mappings
  $$,
  $$
  VALUES
    (
      '00000036-9709-4000-8000-000000000001'::UUID,
      '00000036-0000-4000-8000-000000000001'::UUID,
      '9709'::TEXT,
      'DC'::TEXT,
      '82'::TEXT,
      ARRAY['35', '55']::TEXT[],
      ARRAY['15', '45']::TEXT[],
      ARRAY['15', '35', '45', '55']::TEXT[],
      2026::SMALLINT,
      'june'::TEXT,
      2025::SMALLINT,
      'june'::TEXT,
      'administrative_zone'::TEXT,
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series'::TEXT,
      'Section 3.7, printed p. 50, PDF p. 50'::TEXT,
      'unreviewed'::TEXT,
      NULL::TEXT[],
      NULL::TEXT[],
      NULL::TEXT,
      NULL::TEXT,
      NULL::TIMESTAMPTZ
    ),
    (
      '00000036-9709-4000-8000-000000000002'::UUID,
      '00000036-0000-4000-8000-000000000001'::UUID,
      '9709'::TEXT,
      'EC'::TEXT,
      '83'::TEXT,
      ARRAY['35', '45']::TEXT[],
      ARRAY['15', '55']::TEXT[],
      ARRAY['15', '35', '45', '55']::TEXT[],
      2026::SMALLINT,
      'june'::TEXT,
      2025::SMALLINT,
      'june'::TEXT,
      'administrative_zone'::TEXT,
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series'::TEXT,
      'Section 3.7, printed p. 50, PDF p. 50'::TEXT,
      'unreviewed'::TEXT,
      NULL::TEXT[],
      NULL::TEXT[],
      NULL::TEXT,
      NULL::TEXT,
      NULL::TIMESTAMPTZ
    ),
    (
      '00000036-9709-4000-8000-000000000003'::UUID,
      '00000036-0000-4000-8000-000000000001'::UUID,
      '9709'::TEXT,
      'GC'::TEXT,
      '83'::TEXT,
      ARRAY['35', '65']::TEXT[],
      ARRAY['15', '55']::TEXT[],
      ARRAY['15', '35', '55', '65']::TEXT[],
      2026::SMALLINT,
      'june'::TEXT,
      2025::SMALLINT,
      'june'::TEXT,
      'administrative_zone'::TEXT,
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series'::TEXT,
      'Section 3.7, printed p. 50, PDF p. 50'::TEXT,
      'unreviewed'::TEXT,
      NULL::TEXT[],
      NULL::TEXT[],
      NULL::TEXT,
      NULL::TEXT,
      NULL::TIMESTAMPTZ
    ),
    (
      '00000036-9709-4000-8000-000000000004'::UUID,
      '00000036-0000-4000-8000-000000000001'::UUID,
      '9709'::TEXT,
      'HC'::TEXT,
      '92'::TEXT,
      ARRAY['35', '55']::TEXT[],
      ARRAY['15', '45']::TEXT[],
      ARRAY['15', '35', '45', '55']::TEXT[],
      2026::SMALLINT,
      'june'::TEXT,
      2025::SMALLINT,
      'november'::TEXT,
      'administrative_zone'::TEXT,
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series'::TEXT,
      'Section 3.7, printed p. 50, PDF p. 50'::TEXT,
      'unreviewed'::TEXT,
      NULL::TEXT[],
      NULL::TEXT[],
      NULL::TEXT,
      NULL::TEXT,
      NULL::TIMESTAMPTZ
    ),
    (
      '00000036-9709-4000-8000-000000000005'::UUID,
      '00000036-0000-4000-8000-000000000001'::UUID,
      '9709'::TEXT,
      'IC'::TEXT,
      '93'::TEXT,
      ARRAY['35', '45']::TEXT[],
      ARRAY['15', '55']::TEXT[],
      ARRAY['15', '35', '45', '55']::TEXT[],
      2026::SMALLINT,
      'june'::TEXT,
      2025::SMALLINT,
      'november'::TEXT,
      'administrative_zone'::TEXT,
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series'::TEXT,
      'Section 3.7, printed p. 50, PDF p. 50'::TEXT,
      'unreviewed'::TEXT,
      NULL::TEXT[],
      NULL::TEXT[],
      NULL::TEXT,
      NULL::TEXT,
      NULL::TIMESTAMPTZ
    ),
    (
      '00000036-9709-4000-8000-000000000006'::UUID,
      '00000036-0000-4000-8000-000000000001'::UUID,
      '9709'::TEXT,
      'KC'::TEXT,
      '93'::TEXT,
      ARRAY['35', '65']::TEXT[],
      ARRAY['15', '55']::TEXT[],
      ARRAY['15', '35', '55', '65']::TEXT[],
      2026::SMALLINT,
      'june'::TEXT,
      2025::SMALLINT,
      'november'::TEXT,
      'administrative_zone'::TEXT,
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series'::TEXT,
      'Section 3.7, printed p. 50, PDF p. 50'::TEXT,
      'unreviewed'::TEXT,
      NULL::TEXT[],
      NULL::TEXT[],
      NULL::TEXT,
      NULL::TEXT,
      NULL::TIMESTAMPTZ
    ),
    (
      '00000036-9231-4000-8000-000000000001'::UUID,
      '00000036-0000-4000-8000-000000000001'::UUID,
      '9231'::TEXT,
      'BC'::TEXT,
      '62'::TEXT,
      ARRAY['24', '44']::TEXT[],
      ARRAY['14', '34']::TEXT[],
      ARRAY['14', '24', '34', '44']::TEXT[],
      2026::SMALLINT,
      'june'::TEXT,
      2025::SMALLINT,
      'june'::TEXT,
      'administrative_zone'::TEXT,
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series'::TEXT,
      'Section 3.7, printed p. 46, PDF p. 46'::TEXT,
      'unreviewed'::TEXT,
      NULL::TEXT[],
      NULL::TEXT[],
      NULL::TEXT,
      NULL::TEXT,
      NULL::TIMESTAMPTZ
    ),
    (
      '00000036-9231-4000-8000-000000000002'::UUID,
      '00000036-0000-4000-8000-000000000001'::UUID,
      '9231'::TEXT,
      'CC'::TEXT,
      '63'::TEXT,
      ARRAY['24', '34']::TEXT[],
      ARRAY['14', '44']::TEXT[],
      ARRAY['14', '24', '34', '44']::TEXT[],
      2026::SMALLINT,
      'june'::TEXT,
      2025::SMALLINT,
      'june'::TEXT,
      'administrative_zone'::TEXT,
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series'::TEXT,
      'Section 3.7, printed p. 46, PDF p. 46'::TEXT,
      'unreviewed'::TEXT,
      NULL::TEXT[],
      NULL::TEXT[],
      NULL::TEXT,
      NULL::TEXT,
      NULL::TIMESTAMPTZ
    ),
    (
      '00000036-9231-4000-8000-000000000003'::UUID,
      '00000036-0000-4000-8000-000000000001'::UUID,
      '9231'::TEXT,
      'DC'::TEXT,
      '72'::TEXT,
      ARRAY['24', '44']::TEXT[],
      ARRAY['14', '34']::TEXT[],
      ARRAY['14', '24', '34', '44']::TEXT[],
      2026::SMALLINT,
      'june'::TEXT,
      2025::SMALLINT,
      'november'::TEXT,
      'administrative_zone'::TEXT,
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series'::TEXT,
      'Section 3.7, printed p. 46, PDF p. 46'::TEXT,
      'unreviewed'::TEXT,
      NULL::TEXT[],
      NULL::TEXT[],
      NULL::TEXT,
      NULL::TEXT,
      NULL::TIMESTAMPTZ
    ),
    (
      '00000036-9231-4000-8000-000000000004'::UUID,
      '00000036-0000-4000-8000-000000000001'::UUID,
      '9231'::TEXT,
      'EC'::TEXT,
      '73'::TEXT,
      ARRAY['24', '34']::TEXT[],
      ARRAY['14', '44']::TEXT[],
      ARRAY['14', '24', '34', '44']::TEXT[],
      2026::SMALLINT,
      'june'::TEXT,
      2025::SMALLINT,
      'november'::TEXT,
      'administrative_zone'::TEXT,
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series'::TEXT,
      'Section 3.7, printed p. 46, PDF p. 46'::TEXT,
      'unreviewed'::TEXT,
      NULL::TEXT[],
      NULL::TEXT[],
      NULL::TEXT,
      NULL::TEXT,
      NULL::TIMESTAMPTZ
    )
  $$,
  '84. Exact canonical expected-set comparison covers all ten mappings across all 23 non-timestamp columns'
);

-- 85. Exact canonical expected-set comparison covers evidence document across all 17 non-timestamp columns
SELECT set_eq(
  $$
  SELECT
    id,
    document_title,
    issuer,
    source_url,
    checksum_sha256,
    file_size_bytes,
    pdf_version,
    page_count,
    official_published_on,
    exam_year,
    exam_series,
    scope_basis,
    declared_administrative_zones,
    declared_territories,
    scope_declaration,
    review_status,
    reviewed_by,
    reviewed_at,
    is_active
  FROM public.grade_threshold_carry_forward_evidence_documents
  $$,
  $$
  VALUES (
    '00000036-0000-4000-8000-000000000001'::UUID,
    'Cambridge Guide to Making Entries: Including syllabus and option codes for June 2026 series'::TEXT,
    'Cambridge University Press & Assessment'::TEXT,
    'https://www.cambridgeinternational.org/Images/724211-guide-to-making-entries.pdf'::TEXT,
    decode('80f88e04138b06e984c14a5292a0c298e654ca35806d3344043d9ad7de729fda', 'hex')::BYTEA,
    2063398::BIGINT,
    '1.6'::TEXT,
    69::INT,
    NULL::DATE,
    2026::SMALLINT,
    'june'::TEXT,
    'administrative_zone'::TEXT,
    ARRAY['5']::TEXT[],
    ARRAY['CN']::TEXT[],
    'China (administrative zone 5), June 2026 series'::TEXT,
    'unreviewed'::TEXT,
    NULL::TEXT,
    NULL::TIMESTAMPTZ,
    FALSE::BOOLEAN
  )
  $$,
  '85. Exact canonical expected-set comparison covers evidence document across all 17 non-timestamp columns'
);

SELECT finish();

ROLLBACK;
