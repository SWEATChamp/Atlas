-- =============================================================================
-- POST-TEARDOWN VERIFICATION: Milestone 5 Hosted-Smoke Integrity Check
--
-- File: supabase/tests/fixtures/milestone_5_hosted_smoke/verify_post_teardown.sql
--
-- Purpose:
--   Independent read-only verification query confirming complete absence of
--   transient smoke residue, restoration of canonical evidence lifecycle,
--   restoration of user application state, and retention of the authentic
--   131-row durable catalogue under Option A.
-- =============================================================================

SELECT
  -- 1. Snapshot schema absence (must be 0)
  (SELECT count(*)::INT FROM pg_namespace WHERE nspname = '_m5_smoke_snapshot') AS snapshot_schema_exists,

  -- 2. Carry-forward bridge links (must be 0)
  (SELECT count(*)::INT FROM public.grade_threshold_combination_carry_forward_links) AS carry_forward_links,

  -- 3. Published carry-forward mappings view (must be 0)
  (SELECT count(*)::INT FROM public.published_grade_threshold_carry_forward_mappings) AS published_carry_forward_mappings,

  -- 4. Evidence document status (must be unreviewed & inactive)
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_evidence_documents
   WHERE id = '00000036-0000-4000-8000-000000000001'
     AND review_status = 'unreviewed'
     AND is_active = FALSE
     AND reviewed_by IS NULL) AS canonical_evidence_doc_unreviewed,

  -- 5. Source mappings status (all 10 must be unreviewed)
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings
   WHERE evidence_document_id = '00000036-0000-4000-8000-000000000001'
     AND evidence_status = 'unreviewed'
     AND authorized_by IS NULL) AS canonical_source_mappings_unreviewed,

  -- 6. Smoke past paper attempts absence (must be 0)
  (SELECT count(*)::INT FROM public.past_papers
   WHERE id IN (
     'f1870000-0000-4000-8000-000000000003',
     'f1870000-0000-4000-8000-000000000004',
     'f1870000-0000-4000-8000-000000000005'
   )) AS smoke_attempts_remaining,

  -- 7. Durable catalogue total rows under Option A (must be exactly 131)
  (
    (SELECT count(*)::INT FROM public.grade_threshold_import_runs) +
    (SELECT count(*)::INT FROM public.grade_threshold_publications) +
    (SELECT count(*)::INT FROM public.grade_threshold_weighting_sources) +
    (SELECT count(*)::INT FROM public.grade_threshold_weighting_entries) +
    (SELECT count(*)::INT FROM public.grade_threshold_component_variants) +
    (SELECT count(*)::INT FROM public.grade_threshold_component_marks) +
    (SELECT count(*)::INT FROM public.grade_threshold_variant_benchmark_groups) +
    (SELECT count(*)::INT FROM public.grade_threshold_variant_benchmark_members) +
    (SELECT count(*)::INT FROM public.grade_threshold_combinations) +
    (SELECT count(*)::INT FROM public.grade_threshold_combination_tokens) +
    (SELECT count(*)::INT FROM public.grade_threshold_combination_marks)
  ) AS durable_catalogue_rows;
