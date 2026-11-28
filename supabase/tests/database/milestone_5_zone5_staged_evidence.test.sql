-- pgTAP Test Suite: Migration 039 Zone 5 Carry-Forward Activation & 8-Route Verification
-- Runs strictly inside a rolled-back transaction against disposable local PostgreSQL
-- with Migrations 000–039 applied and the five-subject June 2026 catalogue + Migration 039 active.

BEGIN;

SELECT plan(15);

-- 1. Total Zone 5 mappings = 20 (10 from M036 + 10 from M037), all confirmed by SWEATChamp
SELECT is(
  (SELECT count(*)::int FROM public.grade_threshold_carry_forward_source_mappings
   WHERE evidence_document_id = '00000036-0000-4000-8000-000000000001'),
  20,
  'All 20 China Zone 5 mappings (M036 + M037) are present'
);

SELECT is(
  (SELECT count(*)::int FROM public.grade_threshold_carry_forward_source_mappings
   WHERE evidence_document_id = '00000036-0000-4000-8000-000000000001'
     AND evidence_status = 'confirmed'
     AND authorized_by = 'SWEATChamp'
     AND authorized_at IS NOT NULL
     AND scope_basis = 'administrative_zone'
     AND scope_administrative_zones = ARRAY['5']::text[]
     AND scope_territories = ARRAY['CN']::text[]),
  20,
  'All 20 Zone 5 mappings are confirmed by SWEATChamp with Zone 5 CN scope'
);

-- 2. Evidence document is approved and active with reviewed_by = SWEATChamp
SELECT is(
  (SELECT count(*)::int FROM public.grade_threshold_carry_forward_evidence_documents
   WHERE id = '00000036-0000-4000-8000-000000000001'
     AND review_status = 'approved'
     AND is_active = TRUE
     AND reviewed_by = 'SWEATChamp'
     AND reviewed_at IS NOT NULL),
  1,
  'Exactly 1 approved active China Zone 5 evidence document (reviewed_by = SWEATChamp)'
);

-- 3. Exactly 20 bridge links and 20 published carry-forward mappings exist
SELECT is(
  (SELECT count(*)::int FROM public.grade_threshold_combination_carry_forward_links),
  20,
  'Exactly 20 carry-forward bridge links exist after Migration 039 activation'
);

SELECT is(
  (SELECT count(*)::int FROM public.published_grade_threshold_carry_forward_mappings),
  20,
  'Exactly 20 published carry-forward mappings are exposed'
);

-- 4. Conflicting mapping check rejects confirmed mapping without authorized_by (via SAVEPOINT)
SAVEPOINT sp_conflict;
SELECT throws_ok(
  $$
    UPDATE public.grade_threshold_carry_forward_source_mappings
    SET authorized_by = NULL
    WHERE id = '00000037-9701-4000-8000-000000000001'
  $$,
  NULL,
  NULL,
  'Confirmed mapping without authorized_by is rejected by check constraint'
);
ROLLBACK TO SAVEPOINT sp_conflict;

-- 5. Wrong-option / wrong-zone bridge link must still be rejected by trigger
SELECT throws_ok(
  $$
    INSERT INTO public.grade_threshold_combination_carry_forward_links (source_mapping_id, combination_id, token_id)
    SELECT
      '00000037-9701-4000-8000-000000000001'::uuid,
      c.id,
      t.id
    FROM public.grade_threshold_combinations c
    JOIN public.grade_threshold_combination_tokens t ON t.combination_id = c.id
    WHERE c.publication_id = '00000000-0000-4000-8000-000000000021'
      AND c.canonical_key = '41,51,84'
      AND t.token_kind = 'carry_forward'
  $$,
  NULL,
  NULL,
  'Wrong-zone combination (41,51,84) cannot be linked to Zone 5 mapping'
);

-- 6. Verify all 20 Zone 5 combinations and all 8 staged routes are visible to authenticated role
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.published_grade_threshold_combinations
   WHERE route_type = 'staged' AND per_paper_allocation_eligible = TRUE),
  20,
  'All 20 Zone 5 staged combinations are visible and allocation-eligible to authenticated role'
);

SELECT is(
  (SELECT count(DISTINCT atlas_route_id)::int FROM public.published_grade_threshold_combinations
   WHERE route_type = 'staged' AND per_paper_allocation_eligible = TRUE),
  8,
  'All 8 Atlas staged route keys across 5 subjects are covered'
);

-- 7. Verify June 2025 (10 rows) and November 2025 (10 rows) carried sittings
SELECT is(
  (SELECT count(*)::int FROM public.published_grade_threshold_carry_forward_mappings
   WHERE carried_exam_year = 2025 AND carried_exam_series = 'june'),
  10,
  'Exactly 10 June 2025 carried AS mappings are published'
);

SELECT is(
  (SELECT count(*)::int FROM public.published_grade_threshold_carry_forward_mappings
   WHERE carried_exam_year = 2025 AND carried_exam_series = 'november'),
  10,
  'Exactly 10 November 2025 carried AS mappings are published'
);

-- 8. Verify non-Zone-5 and unsupported special combinations remain excluded
SELECT is(
  (SELECT count(*)::int FROM public.published_grade_threshold_combinations
   WHERE route_type = 'staged' AND canonical_key IN ('41,51,84', '60,80', '60,81', '68,80', '69,81', '61,80')),
  0,
  'Non-Zone-5 and unsupported special combinations remain excluded'
);

SELECT is(
  (SELECT count(*)::int FROM public.published_grade_threshold_combinations
   WHERE route_type = 'staged' AND canonical_key NOT IN (
     '35,55,82','35,55,92','35,45,83','35,45,93','35,65,83','35,65,93',
     '24,44,62','24,44,72','24,34,63','24,34,73',
     '44,54,62','44,54,63','44,54,72','44,54,73',
     '33,43,89','33,43,98'
   )),
  0,
  'Only the 20 Zone 5 canonical keys are visible on staged routes'
);

RESET ROLE;

-- 9. Revoking/deactivating the evidence document immediately hides all 20 staged combinations
UPDATE public.grade_threshold_carry_forward_evidence_documents
SET is_active = FALSE
WHERE id = '00000036-0000-4000-8000-000000000001';

SELECT is(
  (SELECT count(*)::int FROM public.published_grade_threshold_combinations WHERE route_type = 'staged'),
  0,
  'Deactivating evidence document immediately hides all staged combinations fail-closed'
);

-- 10. AS-only and full-linear published combinations remain intact (66 rows)
SELECT is(
  (SELECT count(*)::int FROM public.published_grade_threshold_combinations WHERE route_type IN ('as_only', 'full_level')),
  66,
  'All 66 AS-only and full-linear published combinations remain unchanged'
);

SELECT * FROM finish();
ROLLBACK;
