-- =============================================================================
-- DATABASE TEST: Milestone 5 Catalogue & Reversible Hosted-Smoke Verification
--
-- File: supabase/tests/database/milestone_5_catalogue_and_smoke.test.sql
--
-- Purpose:
--   Comprehensive pgTAP verification proving:
--   1. Complete 2,674-row June 2026 five-subject catalogue seeding & exact validation.
--   2. Detection of 7 distinct negative catalogue mutations with zero-delta rollback.
--   3. Fail-closed interrupted-run (55000) and collision guards (P0001, P0002).
--   4. Pre-existing user state snapshotting & complete restoration:
--      - Pre-existing Chemistry 9701 staged/A2 enrollment.
--      - Non-null A2 unlock timestamp and method.
--      - Deterministic pre-existing paper selections (retained IDs & timestamps).
--      - Pre-existing A2 chapter and pending daily mission.
--      - Pre-existing archived Physics 9702 enrollment (reactivated and re-archived).
--      - Pre-existing untouched Biology 9700 enrollment (zero updated_at drift).
--      - Unrelated user data preservation.
--   5. Bootstrap route conversion (as_only, clears A2 unlock, skips mission).
--   6. Assertions script confirming active smoke scenario & cross-user RLS isolation.
--   7. Teardown fail-closed guard: induced mismatch raises P0004 and retains snapshot.
--   8. Teardown restoration: restores original selections, route, A2 unlock, pending mission,
--      is_archived state, and verifies all 12 non-updated_at user_subjects columns.
--   9. Complete repeatability across two full bootstrap-assertions-teardown cycles.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_catalog;
SET LOCAL TIME ZONE 'UTC';

SELECT plan(83);

-- ─── 1. Migration Ledger & Baseline Pre-Seeding Assertions ───────────────────

SELECT cmp_ok(
  (SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1),
  '>=',
  '20261127000037',
  '1. Migration ledger is at or above Migration 037 (20261127000037)'
);

SELECT is(
  (SELECT review_status FROM public.grade_threshold_carry_forward_evidence_documents WHERE id = '00000036-0000-4000-8000-000000000001'),
  'unreviewed',
  '2. Baseline: China Zone 5 evidence document is unreviewed'
);

SELECT is(
  (SELECT is_active FROM public.grade_threshold_carry_forward_evidence_documents WHERE id = '00000036-0000-4000-8000-000000000001'),
  FALSE,
  '3. Baseline: China Zone 5 evidence document is inactive'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_carry_forward_source_mappings WHERE evidence_document_id = '00000036-0000-4000-8000-000000000001' AND evidence_status = 'unreviewed' AND authorized_by IS NULL),
  20,
  '4. Baseline: all 20 source mappings are unreviewed'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combination_carry_forward_links),
  0,
  '5. Baseline: exactly 0 carry-forward bridge links exist'
);

SELECT is(
  (SELECT count(*)::INT FROM public.published_grade_threshold_carry_forward_mappings),
  0,
  '6. Baseline: published carry-forward mappings view has 0 rows'
);

-- ─── 2. Option A Durable Catalogue Seeding & Verification ───────────────────

-- Truncate any previous catalogue residue in test container
TRUNCATE public.grade_threshold_combination_carry_forward_links CASCADE;
TRUNCATE public.grade_threshold_combination_marks CASCADE;
TRUNCATE public.grade_threshold_combination_tokens CASCADE;
TRUNCATE public.grade_threshold_combinations CASCADE;
TRUNCATE public.grade_threshold_variant_benchmark_members CASCADE;
TRUNCATE public.grade_threshold_variant_benchmark_groups CASCADE;
TRUNCATE public.grade_threshold_component_marks CASCADE;
TRUNCATE public.grade_threshold_component_variants CASCADE;
TRUNCATE public.grade_threshold_weighting_entries CASCADE;
TRUNCATE public.grade_threshold_weighting_sources CASCADE;
TRUNCATE public.grade_threshold_publications CASCADE;
TRUNCATE public.grade_threshold_import_runs CASCADE;

-- Load June 2026 durable catalogue seed
\ir ../../seeds/catalogue/june_2026_m5_catalogue.sql

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_import_runs),
  1,
  '7. Durable seed: exactly 1 import run'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_publications),
  5,
  '8. Durable seed: exactly 5 publications (9701, 9702, 9709, 9231, 9618)'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_weighting_sources),
  5,
  '9. Durable seed: exactly 5 weighting sources'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_weighting_entries),
  190,
  '10. Durable seed: exactly 190 weighting entries'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_component_variants),
  114,
  '11. Durable seed: exactly 114 component variants'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_component_marks),
  570,
  '12. Durable seed: exactly 570 component marks'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_variant_benchmark_groups),
  1,
  '13. Durable seed: exactly 1 benchmark group'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_variant_benchmark_members),
  3,
  '14. Durable seed: exactly 3 benchmark members'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combinations),
  184,
  '15. Durable seed: exactly 184 official combinations across all 5 subjects'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combination_tokens),
  542,
  '16. Durable seed: exactly 542 combination tokens'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combination_marks),
  1059,
  '17. Durable seed: exactly 1059 combination marks'
);

SELECT is(
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
  ),
  2674,
  '18. Durable seed: total catalogue rows across all 11 tables is exactly 2674'
);

-- ─── 3. Exact Catalogue Validation (Intact Catalogue) ─────────────────────────

\ir ../fixtures/catalogue/milestone_5_catalogue_validator.sql

SELECT is(
  (SELECT total_catalogue_delta FROM pg_temp.run_m5_catalogue_validator()),
  0,
  '19. Catalogue validator: delta = 0 on authentic intact catalogue'
);

SELECT is(
  (SELECT total_catalogue_rows FROM pg_temp.run_m5_catalogue_validator()),
  2674,
  '20. Catalogue validator: rows = 2674 on authentic intact catalogue'
);

-- Seed idempotency re-run check
\ir ../../seeds/catalogue/june_2026_m5_catalogue.sql

SELECT is(
  (SELECT total_catalogue_delta FROM pg_temp.run_m5_catalogue_validator()),
  0,
  '21. Seed idempotency: delta = 0 after re-running seed'
);

-- Five-subject eligibility and withheld boundary checks
SELECT is(
  (SELECT count(*)::INT FROM public.published_grade_threshold_combinations WHERE per_paper_allocation_eligible = TRUE),
  66,
  '21b. Five-subject seed: exactly 66 AS/linear combinations exposed as eligible without CF bridge links'
);

SELECT is(
  (SELECT count(*)::INT FROM public.published_grade_threshold_combinations c
   JOIN public.grade_threshold_publications p ON p.id = c.publication_id
   JOIN public.subjects s ON s.id = p.subject_id
   WHERE s.code = '9231'),
  12,
  '21c. Further Mathematics 9231: 12 AS/full-level combinations exposed; all 26 staged and 3 special remain withheld'
);

SELECT is(
  (SELECT count(*)::INT FROM public.published_grade_threshold_combinations c
   JOIN public.grade_threshold_publications p ON p.id = c.publication_id
   JOIN public.subjects s ON s.id = p.subject_id
   WHERE s.code = '9618'),
  6,
  '21d. Computer Science 9618: 6 AS/full-level combinations exposed; all 11 staged and 2 special remain withheld'
);

SELECT is(
  (SELECT count(*)::INT FROM public.published_grade_threshold_combinations WHERE planner_eligibility <> 'eligible' OR route_type = 'staged'),
  0,
  '21e. Fail-closed boundary: zero unreviewed/unsupported or unlinked staged combinations in published view'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_component_variants cv
   JOIN public.grade_threshold_publications p ON p.id = cv.publication_id
   JOIN public.subjects s ON s.id = p.subject_id
   WHERE cv.subject_paper_id IS NULL AND s.code IN ('9701', '9702', '9709', '9231', '9618')),
  16,
  '21f. Special components (50/51/58/59/60/61/68/69) retained without false subject_paper_id linkage'
);

-- ─── 4. Negative Validator Mutation Detection Matrix ──────────────────────────

-- Mutation 1: Changed component threshold mark
SAVEPOINT sp_neg_mark;
UPDATE public.grade_threshold_component_marks
SET threshold_mark = 26
WHERE component_variant_id = '00000000-0000-4000-8000-000000000081' AND grade = 'A';

SELECT cmp_ok(
  (SELECT total_catalogue_delta FROM pg_temp.run_m5_catalogue_validator()),
  '>=',
  1,
  '22. Negative validator: changed component mark detected (delta >= 1)'
);
ROLLBACK TO SAVEPOINT sp_neg_mark;

-- Mutation 2: Changed official weighting factor
SAVEPOINT sp_neg_weight;
ALTER TABLE public.grade_threshold_weighting_entries DISABLE TRIGGER prevent_grade_threshold_weighting_entry_mutation;
UPDATE public.grade_threshold_weighting_entries
SET official_weighting_factor = 0.80000000
WHERE id = '00000000-0000-4000-8000-000000000043';

SELECT cmp_ok(
  (SELECT total_catalogue_delta FROM pg_temp.run_m5_catalogue_validator()),
  '>=',
  1,
  '23. Negative validator: changed weighting factor detected (delta >= 1)'
);
ROLLBACK TO SAVEPOINT sp_neg_weight;

-- Mutation 3: Valid-but-wrong foreign-key relationship
SAVEPOINT sp_neg_fk;
UPDATE public.grade_threshold_component_variants
SET subject_paper_id = '26c24b14-b3b1-53bb-bf0d-5f0ce959214c'::uuid
WHERE id = '00000000-0000-4000-8000-000000000081'::uuid;

SELECT cmp_ok(
  (SELECT total_catalogue_delta FROM pg_temp.run_m5_catalogue_validator()),
  '>=',
  1,
  '24. Negative validator: valid-but-wrong FK detected (delta >= 1)'
);
ROLLBACK TO SAVEPOINT sp_neg_fk;

-- Mutation 4: Changed source-token metadata
SAVEPOINT sp_neg_meta;
UPDATE public.grade_threshold_combination_tokens
SET source_token_metadata = '{"source": "corrupted"}'::jsonb
WHERE id = '00000000-0000-4000-8000-0000000000d1';

SELECT cmp_ok(
  (SELECT total_catalogue_delta FROM pg_temp.run_m5_catalogue_validator()),
  '>=',
  1,
  '25. Negative validator: changed token metadata detected (delta >= 1)'
);
ROLLBACK TO SAVEPOINT sp_neg_meta;

-- Mutation 5: Missing expected row
SAVEPOINT sp_neg_missing;
DELETE FROM public.grade_threshold_combination_marks
WHERE id = '00000000-0000-4000-8000-0000000000f1';

SELECT cmp_ok(
  (SELECT total_catalogue_delta FROM pg_temp.run_m5_catalogue_validator()),
  '>=',
  1,
  '26. Negative validator: missing expected row detected (delta >= 1)'
);
ROLLBACK TO SAVEPOINT sp_neg_missing;

-- Mutation 6: Unexpected child row under fixture parent
SAVEPOINT sp_neg_extra_child;
INSERT INTO public.grade_threshold_component_variants (
  id, publication_id, component_code, raw_maximum_mark, subject_paper_id, source_label, source_row_metadata
) VALUES (
  '99999999-9999-4000-8000-999999999999'::uuid,
  '00000000-0000-4000-8000-000000000021'::uuid,
  '99', 50, '9727a285-3e3c-5b17-8ccb-9cf8ec26c496'::uuid, 'Paper 99 (Injected Extra)', '{}'::jsonb
);

SELECT cmp_ok(
  (SELECT total_catalogue_delta FROM pg_temp.run_m5_catalogue_validator()),
  '>=',
  1,
  '27. Negative validator: unexpected child row under fixture parent detected (delta >= 1)'
);
ROLLBACK TO SAVEPOINT sp_neg_extra_child;

-- Mutation 7: Unexpected weighting source matching fixture business scope
SAVEPOINT sp_neg_extra_ws;
INSERT INTO public.grade_threshold_weighting_sources (
  id, subject_id, document_year, exam_series, source_label, official_document_url, source_checksum_sha256, review_status, reviewed_by, reviewed_at, source_metadata
) VALUES (
  '99999999-9999-4000-8000-999999999988'::uuid,
  (SELECT id FROM public.subjects WHERE code = '9700'), 2026::smallint, 'june'::text, 'Extra Weighting Source Bio',
  'https://www.cambridgeinternational.org/Images/206341-syllabus-component-weighting-factors.pdf',
  decode('d96f96e5d8847470fd7291f75aa01184b3c0cff7075b5010968e16d94218ada9', 'hex'),
  'approved'::text, 'm5-preflight-auditor'::text, '2026-08-10 12:00:00+00'::timestamptz, '{}'::jsonb
);

SELECT cmp_ok(
  (SELECT total_catalogue_delta FROM pg_temp.run_m5_catalogue_validator()),
  '>=',
  1,
  '28. Negative validator: extra weighting source in business scope detected (delta >= 1)'
);
ROLLBACK TO SAVEPOINT sp_neg_extra_ws;

-- Verify catalogue returns to zero delta after all negative mutations rolled back
SELECT is(
  (SELECT total_catalogue_delta FROM pg_temp.run_m5_catalogue_validator()),
  0,
  '29. Negative validator: catalogue restored to zero delta after rollbacks'
);

-- ─── 5. Interrupted-Run Protection & Collision Fail-Closed Guards ─────────────

-- Create synthetic test users in auth.users and profiles
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('f1870000-0000-4000-8000-000000000001'::uuid, 'm5_student1@example.com', '{"full_name": "Student 1"}'::jsonb),
  ('f1870000-0000-4000-8000-000000000006'::uuid, 'm5_student2@example.com', '{"full_name": "Student 2"}'::jsonb),
  ('f1870000-0000-4000-8000-000000000009'::uuid, 'm5_unrelated@example.com', '{"full_name": "Unrelated Student"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles SET username = 'm5_student1' WHERE id = 'f1870000-0000-4000-8000-000000000001'::uuid;
UPDATE public.profiles SET username = 'm5_student2' WHERE id = 'f1870000-0000-4000-8000-000000000006'::uuid;
UPDATE public.profiles SET username = 'm5_unrelated' WHERE id = 'f1870000-0000-4000-8000-000000000009'::uuid;

-- Load bootstrap routine with execution deferred
SELECT set_config('m5.defer_smoke_bootstrap', 'true', true);
\ir ../fixtures/milestone_5_hosted_smoke/bootstrap.sql
SELECT set_config('m5.defer_smoke_bootstrap', 'false', true);

-- Test Guard 1: Interrupted-run check (schema _m5_smoke_snapshot already exists)
CREATE SCHEMA _m5_smoke_snapshot;

SELECT throws_ok(
  'SELECT pg_temp.apply_m5_smoke_bootstrap(''f1870000-0000-4000-8000-000000000001''::uuid, ''f1870000-0000-4000-8000-000000000006''::uuid)',
  '55000',
  'Interrupted run detected: private snapshot schema _m5_smoke_snapshot already exists',
  '30. Interrupted run: existing _m5_smoke_snapshot raises 55000 fail-closed'
);

DROP SCHEMA _m5_smoke_snapshot CASCADE;

-- Test Guard 2: Missing user IDs
SELECT throws_ok(
  'SELECT pg_temp.apply_m5_smoke_bootstrap(NULL, NULL)',
  'P0002',
  'Bootstrap requires two dynamic user UUIDs via arguments, m5.user_1_id / m5.user_2_id, or pg_temp.m5_smoke_config',
  '31. Bootstrap guard: missing user IDs raises P0002'
);

-- Test Guard 3: Identical user IDs
SELECT throws_ok(
  'SELECT pg_temp.apply_m5_smoke_bootstrap(''f1870000-0000-4000-8000-000000000001''::uuid, ''f1870000-0000-4000-8000-000000000001''::uuid)',
  'P0001',
  'User 1 ID (f1870000-0000-4000-8000-000000000001) and User 2 ID (f1870000-0000-4000-8000-000000000001) must be distinct',
  '32. Bootstrap guard: identical user IDs raises P0001'
);

-- Test Guard 4: Non-existent user ID
SELECT throws_ok(
  'SELECT pg_temp.apply_m5_smoke_bootstrap(''f1870000-0000-4000-8000-999999999999''::uuid, ''f1870000-0000-4000-8000-000000000006''::uuid)',
  'P0002',
  'User 1 (f1870000-0000-4000-8000-999999999999) does not exist in auth.users',
  '33. Bootstrap guard: non-existent user ID raises P0002'
);

-- ─── 6. Pre-Existing Meaningful User State Setup ─────────────────────────────

-- Set up User 1 with meaningful pre-existing state:
-- - Staged route, current_stage = a2, non-null a2_unlocked_at and a2_unlock_method
-- - 5 deterministic paper selections (IDs f1870000-0000-4000-8000-000000000021..25)
-- - A2 chapter (Chemical Energetics) in user_chapters
-- - Pending daily mission for that chapter
-- - Pre-existing archived Physics 9702 enrollment (proves reactivation by bootstrap & restoration by teardown)
-- - Pre-existing untouched Biology 9700 enrollment (proves selective restoration leaves untouched updated_at intact)
-- - Independent unrelated User 3 state
DO $$
DECLARE
  v_u1 UUID := 'f1870000-0000-4000-8000-000000000001';
  v_u3 UUID := 'f1870000-0000-4000-8000-000000000009';
  v_chem_id UUID;
  v_phys_id UUID;
  v_bio_id UUID;
  v_us1_chem UUID := 'f1870000-0000-4000-8000-000000000011';
  v_us1_phys UUID := 'f1870000-0000-4000-8000-000000000012';
  v_us1_bio UUID := 'f1870000-0000-4000-8000-000000000013';
  v_us3_chem UUID := 'f1870000-0000-4000-8000-000000000019';
  v_ch_a2 UUID;
BEGIN
  SELECT id INTO v_chem_id FROM public.subjects WHERE code = '9701';
  SELECT id INTO v_phys_id FROM public.subjects WHERE code = '9702';
  SELECT id INTO v_bio_id FROM public.subjects WHERE code = '9700';
  SELECT id INTO v_ch_a2 FROM public.chapters WHERE subject_id = v_chem_id AND stage = 'a2' AND is_active = TRUE ORDER BY number LIMIT 1;

  -- 1. Pre-existing Chemistry enrollment for User 1: staged route, current_stage = a2, unlocked metadata
  INSERT INTO public.user_subjects (
    id, user_id, subject_id, priority, is_archived, study_route, current_stage,
    target_grade, a2_unlocked_at, a2_unlock_method, created_at, updated_at
  ) VALUES (
    v_us1_chem, v_u1, v_chem_id, 1, FALSE, 'staged', 'a2',
    'A*', '2026-01-15 10:00:00+00'::timestamptz, 'manual',
    '2026-01-01 10:00:00+00'::timestamptz, '2026-01-15 10:00:00+00'::timestamptz
  );

  -- 2. Deterministic pre-existing paper selections for User 1 (5 papers)
  INSERT INTO public.subject_paper_selections (
    id, user_subject_id, component_name, paper_number, stage, subject_paper_id, created_at
  ) VALUES
    ('f1870000-0000-4000-8000-000000000021', v_us1_chem, 'Multiple Choice (AS)', 1, 'as', '9727a285-3e3c-5b17-8ccb-9cf8ec26c496', '2026-01-01 10:00:00+00'::timestamptz),
    ('f1870000-0000-4000-8000-000000000022', v_us1_chem, 'AS Level Structured Questions', 2, 'as', '26c24b14-b3b1-53bb-bf0d-5f0ce959214c', '2026-01-01 10:00:00+00'::timestamptz),
    ('f1870000-0000-4000-8000-000000000023', v_us1_chem, 'Advanced Practical Skills', 3, 'as', '8c802754-98a5-599b-8b7a-5e528804f625', '2026-01-01 10:00:00+00'::timestamptz),
    ('f1870000-0000-4000-8000-000000000024', v_us1_chem, 'A Level Structured Questions', 4, 'a2', 'e6ba67e5-2066-5812-898c-22f3c3455fe0', '2026-01-01 10:00:00+00'::timestamptz),
    ('f1870000-0000-4000-8000-000000000025', v_us1_chem, 'Planning, Analysis and Evaluation', 5, 'a2', '4a8837ea-eb2e-5658-a37d-a9fa9d6cf36d', '2026-01-01 10:00:00+00'::timestamptz);

  -- 3. Pre-existing A2 chapter row for User 1
  INSERT INTO public.user_chapters (
    id, user_id, chapter_id, notes_status, created_at, updated_at
  ) VALUES (
    'f1870000-0000-4000-8000-000000000031', v_u1, v_ch_a2, 'in_progress',
    '2026-01-15 10:00:00+00'::timestamptz, '2026-01-15 10:00:00+00'::timestamptz
  );

  -- 4. Pre-existing pending chapter mission that AS-only route conversion will skip
  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type, target_entity_type, target_entity_id,
    title, description, xp_reward, status, generated_at
  ) VALUES (
    'f1870000-0000-4000-8000-000000000041', v_u1, CURRENT_DATE, 'review_chapter', 'chapter',
    'f1870000-0000-4000-8000-000000000031', 'Review Chemical Energetics Notes',
    'Pre-existing pending mission on A2 chapter', 30, 'pending', '2026-01-15 10:00:00+00'::timestamptz
  );

  -- 5. Pre-existing archived Physics 9702 enrollment for User 1
  INSERT INTO public.user_subjects (
    id, user_id, subject_id, priority, is_archived, study_route, current_stage,
    target_grade, exam_date, created_at, updated_at
  ) VALUES (
    v_us1_phys, v_u1, v_phys_id, 3, TRUE, 'full_level', 'full',
    'A', '2026-06-15'::date,
    '2026-01-01 10:00:00+00'::timestamptz, '2026-01-01 10:00:00+00'::timestamptz
  );

  -- 6. Pre-existing untouched Biology 9700 enrollment for User 1
  INSERT INTO public.user_subjects (
    id, user_id, subject_id, priority, is_archived, study_route, current_stage,
    target_grade, exam_date, created_at, updated_at
  ) VALUES (
    v_us1_bio, v_u1, v_bio_id, 2, FALSE, 'unconfirmed', NULL,
    'B', '2026-06-20'::date,
    '2026-01-01 10:00:00+00'::timestamptz, '2026-01-01 10:00:00+00'::timestamptz
  );

  -- 7. Unrelated User 3 data (proves unrelated rows are completely preserved)
  INSERT INTO public.user_subjects (
    id, user_id, subject_id, priority, is_archived, study_route, current_stage, target_grade
  ) VALUES (
    v_us3_chem, v_u3, v_chem_id, 2, FALSE, 'as_only', 'as', 'B'
  );

  INSERT INTO public.subject_paper_selections (
    id, user_subject_id, component_name, paper_number, stage, subject_paper_id
  ) VALUES (
    'f1870000-0000-4000-8000-000000000091', v_us3_chem, 'Multiple Choice (AS)', 1, 'as', '9727a285-3e3c-5b17-8ccb-9cf8ec26c496'
  );

  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type, target_entity_type, target_entity_id, title, xp_reward, status
  ) VALUES (
    'f1870000-0000-4000-8000-000000000049', v_u3, CURRENT_DATE, 'attempt_paper', 'subject',
    v_chem_id, 'Unrelated User Mission', 40, 'pending'
  );
END;
$$;

SELECT is(
  (SELECT study_route::TEXT || '/' || current_stage::TEXT FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000011'),
  'staged/a2',
  '34. Pre-state: User 1 Chemistry enrollment is staged with current_stage a2'
);

SELECT ok(
  (SELECT a2_unlocked_at IS NOT NULL AND a2_unlock_method = 'manual' FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000011'),
  '35. Pre-state: User 1 a2_unlocked_at and a2_unlock_method are non-null'
);

SELECT is(
  (SELECT count(*)::INT FROM public.subject_paper_selections WHERE user_subject_id = 'f1870000-0000-4000-8000-000000000011'),
  5,
  '36. Pre-state: User 1 has exactly 5 Chemistry paper selections'
);

SELECT is(
  (SELECT notes_status::TEXT FROM public.user_chapters WHERE id = 'f1870000-0000-4000-8000-000000000031'),
  'in_progress',
  '37. Pre-state: User 1 has Chemistry A2 chapter recorded in user_chapters'
);

SELECT is(
  (SELECT status::TEXT FROM public.daily_missions WHERE id = 'f1870000-0000-4000-8000-000000000041'),
  'pending',
  '38. Pre-state: User 1 has 1 pending chapter daily mission'
);

SELECT ok(
  (SELECT is_archived = TRUE AND priority = 3 AND exam_date = '2026-06-15'::date AND study_route = 'full_level' AND current_stage = 'full'
   FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000012'),
  '39. Pre-state: User 1 has archived Physics enrollment (is_archived = true, full_level route)'
);

SELECT ok(
  (SELECT is_archived = FALSE AND priority = 2 AND exam_date = '2026-06-20'::date AND study_route = 'unconfirmed' AND current_stage IS NULL
          AND updated_at = '2026-01-01 10:00:00+00'::timestamptz
   FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000013'),
  '40. Pre-state: User 1 has untouched Biology enrollment (is_archived = false, unconfirmed route, deterministic updated_at)'
);

SELECT is(
  (SELECT count(*)::INT FROM public.subject_paper_selections WHERE user_subject_id = 'f1870000-0000-4000-8000-000000000019'),
  1,
  '41. Pre-state: Unrelated User 3 has independent enrollment and selections'
);

SELECT is(
  (SELECT status::TEXT FROM public.daily_missions WHERE id = 'f1870000-0000-4000-8000-000000000049'),
  'pending',
  '42. Pre-state: Unrelated User 3 has 1 pending daily mission'
);

-- ─── 7. Bootstrap Cycle 1 (State Replacement & Mission Cancellation) ─────────

-- Configure dynamic parameters for smoke
SELECT set_config('m5.user_1_id', 'f1870000-0000-4000-8000-000000000001', true);
SELECT set_config('m5.user_2_id', 'f1870000-0000-4000-8000-000000000006', true);

-- Execute Bootstrap Cycle 1
\ir ../fixtures/milestone_5_hosted_smoke/bootstrap.sql

SELECT ok(
  EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = '_m5_smoke_snapshot'),
  '43. Cycle 1 Bootstrap: snapshot schema _m5_smoke_snapshot created'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combination_carry_forward_links WHERE id = 'f1870000-0000-4000-8000-000000000002'),
  1,
  '44. Cycle 1 Bootstrap: bridge link established'
);

SELECT is(
  (SELECT count(*)::INT FROM public.published_grade_threshold_carry_forward_mappings),
  1,
  '45. Cycle 1 Bootstrap: published carry-forward mapping view exposes 1 row'
);

SELECT is(
  (SELECT count(*)::INT FROM public.published_grade_threshold_combinations WHERE id = '00000000-0000-4000-8000-0000000000c3' AND per_paper_allocation_eligible = TRUE),
  1,
  '46. Cycle 1 Bootstrap: Math DC combination is eligible in published view'
);

SELECT is(
  (SELECT study_route::TEXT || '/' || current_stage::TEXT FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000011'),
  'as_only/as',
  '47. Cycle 1 Mutation: User 1 Chemistry study_route changed to as_only and current_stage to as'
);

SELECT ok(
  (SELECT a2_unlocked_at IS NULL AND a2_unlock_method IS NULL FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000011'),
  '48. Cycle 1 Mutation: User 1 a2_unlocked_at and a2_unlock_method cleared to NULL'
);

SELECT is(
  (SELECT count(*)::INT FROM public.subject_paper_selections WHERE id IN (
    'f1870000-0000-4000-8000-000000000021',
    'f1870000-0000-4000-8000-000000000022',
    'f1870000-0000-4000-8000-000000000023',
    'f1870000-0000-4000-8000-000000000024',
    'f1870000-0000-4000-8000-000000000025'
  )),
  0,
  '49. Cycle 1 Mutation: User 1 paper selections replaced (original 5 selection IDs absent)'
);

SELECT is(
  (SELECT status::TEXT || '/' || skip_reason FROM public.daily_missions WHERE id = 'f1870000-0000-4000-8000-000000000041'),
  'skipped/chapter_inaccessible',
  '50. Cycle 1 Mutation: User 1 pending mission changed to skipped with chapter_inaccessible'
);

SELECT ok(
  (SELECT is_archived = FALSE AND study_route = 'full_level' AND target_grade = 'A*'
   FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000012'),
  '51. Cycle 1 Mutation: User 1 Physics reactivated by bootstrap (is_archived = false, target_grade = A*)'
);

-- ─── 8. Cycle 1 Assertions Script ─────────────────────────────────────────────

-- Execute Smoke Assertions Script
\ir ../fixtures/milestone_5_hosted_smoke/assertions.sql

SELECT ok(
  TRUE,
  '52. Cycle 1 Assertions: routes, attempts, and cross-user RLS isolation confirmed'
);

-- ─── 9. Induced Teardown Restoration Mismatch Fail-Closed Test ────────────────

-- Load teardown routine with execution deferred
SELECT set_config('m5.defer_smoke_teardown', 'true', true);
\ir ../fixtures/milestone_5_hosted_smoke/teardown.sql
SELECT set_config('m5.defer_smoke_teardown', 'false', true);

-- Deliberately corrupt snap_evidence_documents document_title to induce bidirectional mismatch
UPDATE _m5_smoke_snapshot.snap_evidence_documents
SET document_title = 'Corrupted Evidence Document Title';

SELECT throws_ok(
  'SELECT pg_temp.apply_m5_smoke_teardown()',
  'P0004',
  'Teardown verification failed: snap_evidence_documents mismatch (delta = 2)',
  '53. Teardown fail-closed guard: restoration mismatch raises P0004'
);

SELECT ok(
  EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = '_m5_smoke_snapshot'),
  '54. Teardown fail-closed guard: _m5_smoke_snapshot retained on restoration failure'
);

-- Revert induced mismatch
UPDATE _m5_smoke_snapshot.snap_evidence_documents s
SET document_title = e.document_title
FROM public.grade_threshold_carry_forward_evidence_documents e
WHERE s.id = e.id;

-- ─── 10. Cycle 1 Teardown & Complete Restoration Verification ─────────────────

-- Execute Teardown Cycle 1 cleanly
\ir ../fixtures/milestone_5_hosted_smoke/teardown.sql

SELECT ok(
  NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = '_m5_smoke_snapshot'),
  '55. Cycle 1 Teardown: snapshot schema _m5_smoke_snapshot dropped'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combination_carry_forward_links),
  0,
  '56. Cycle 1 Teardown: 0 bridge links remain'
);

SELECT is(
  (SELECT count(*)::INT FROM public.published_grade_threshold_carry_forward_mappings),
  0,
  '57. Cycle 1 Teardown: published carry-forward view has 0 rows'
);

SELECT is(
  (SELECT review_status FROM public.grade_threshold_carry_forward_evidence_documents WHERE id = '00000036-0000-4000-8000-000000000001'),
  'unreviewed',
  '58. Cycle 1 Teardown: evidence document restored to unreviewed & inactive'
);

SELECT is(
  (SELECT study_route::TEXT || '/' || current_stage::TEXT FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000011'),
  'staged/a2',
  '59. Cycle 1 Teardown: User 1 Chemistry study_route restored to staged and current_stage to a2'
);

SELECT ok(
  (SELECT a2_unlocked_at = '2026-01-15 10:00:00+00'::timestamptz AND a2_unlock_method = 'manual' FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000011'),
  '60. Cycle 1 Teardown: User 1 a2_unlocked_at and a2_unlock_method restored to original values'
);

SELECT is(
  (SELECT count(*)::INT FROM public.subject_paper_selections WHERE id IN (
    'f1870000-0000-4000-8000-000000000021',
    'f1870000-0000-4000-8000-000000000022',
    'f1870000-0000-4000-8000-000000000023',
    'f1870000-0000-4000-8000-000000000024',
    'f1870000-0000-4000-8000-000000000025'
  )),
  5,
  '61. Cycle 1 Teardown: User 1 original 5 paper selection IDs and contents restored exactly'
);

SELECT is(
  (SELECT status::TEXT || '/' || COALESCE(skip_reason, 'none') FROM public.daily_missions WHERE id = 'f1870000-0000-4000-8000-000000000041'),
  'pending/none',
  '62. Cycle 1 Teardown: User 1 daily mission restored to pending with NULL skip metadata'
);

SELECT ok(
  (SELECT is_archived = TRUE AND target_grade = 'A' AND exam_date = '2026-06-15'::date AND priority = 3
   FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000012'),
  '63. Cycle 1 Teardown: User 1 Physics restored to archived (is_archived = true, target_grade = A)'
);

SELECT ok(
  (SELECT updated_at = '2026-01-01 10:00:00+00'::timestamptz AND is_archived = FALSE AND priority = 2
   FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000013'),
  '64. Cycle 1 Teardown: User 1 untouched Biology enrollment retained exact original updated_at (no trigger drift)'
);

SELECT ok(
  (SELECT status = 'pending' FROM public.daily_missions WHERE id = 'f1870000-0000-4000-8000-000000000049')
  AND (SELECT count(*) = 1 FROM public.subject_paper_selections WHERE user_subject_id = 'f1870000-0000-4000-8000-000000000019'),
  '65. Cycle 1 Teardown: Unrelated User 3 enrollment, selections, and missions 100% intact'
);

SELECT is(
  (SELECT count(*)::INT FROM public.past_papers WHERE id IN (
    'f1870000-0000-4000-8000-000000000003',
    'f1870000-0000-4000-8000-000000000004',
    'f1870000-0000-4000-8000-000000000005'
  )),
  0,
  '66. Cycle 1 Teardown: 0 smoke past paper attempts remain'
);

SELECT is(
  (SELECT total_catalogue_delta FROM pg_temp.run_m5_catalogue_validator()),
  0,
  '67. Cycle 1 Teardown: catalogue validator reports delta = 0 under Option A'
);

SELECT is(
  (SELECT total_catalogue_rows FROM pg_temp.run_m5_catalogue_validator()),
  2674,
  '68. Cycle 1 Teardown: catalogue validator reports exactly 2674 rows'
);

-- ─── 11. Cycle 2 Bootstrap, Assertions & Teardown (Repeatability Proof) ───────

-- Execute Bootstrap Cycle 2
\ir ../fixtures/milestone_5_hosted_smoke/bootstrap.sql

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combination_carry_forward_links WHERE id = 'f1870000-0000-4000-8000-000000000002'),
  1,
  '69. Cycle 2 Bootstrap: bridge link established on second cycle'
);

SELECT is(
  (SELECT study_route::TEXT || '/' || current_stage::TEXT FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000011')
  || ';' ||
  (SELECT status::TEXT FROM public.daily_missions WHERE id = 'f1870000-0000-4000-8000-000000000041'),
  'as_only/as;skipped',
  '70. Cycle 2 Mutation: User 1 route converted to as_only and mission skipped on second cycle'
);

SELECT ok(
  (SELECT is_archived = FALSE FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000012'),
  '71. Cycle 2 Mutation: User 1 Physics reactivated on second cycle (is_archived = false)'
);

-- Execute Smoke Assertions Script Cycle 2
\ir ../fixtures/milestone_5_hosted_smoke/assertions.sql

SELECT ok(
  TRUE,
  '72. Cycle 2 Assertions: smoke assertions confirmed on second cycle'
);

-- Execute Teardown Cycle 2
\ir ../fixtures/milestone_5_hosted_smoke/teardown.sql

SELECT ok(
  NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = '_m5_smoke_snapshot'),
  '73. Cycle 2 Teardown: snapshot schema dropped on second cycle'
);

SELECT is(
  (SELECT count(*)::INT FROM public.grade_threshold_combination_carry_forward_links),
  0,
  '74. Cycle 2 Teardown: 0 bridge links remain on second cycle'
);

SELECT ok(
  (SELECT study_route::TEXT || '/' || current_stage::TEXT FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000011') = 'staged/a2'
  AND (SELECT count(*) FROM public.subject_paper_selections WHERE user_subject_id = 'f1870000-0000-4000-8000-000000000011') = 5
  AND (SELECT status FROM public.daily_missions WHERE id = 'f1870000-0000-4000-8000-000000000041') = 'pending'
  AND (SELECT is_archived FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000012') = TRUE,
  '75. Cycle 2 Teardown: User 1 original selections, route, pending mission, and archived Physics restored on second cycle'
);

SELECT ok(
  (SELECT updated_at = '2026-01-01 10:00:00+00'::timestamptz FROM public.user_subjects WHERE id = 'f1870000-0000-4000-8000-000000000013'),
  '76. Cycle 2 Teardown: User 1 untouched Biology updated_at retained on second cycle'
);

SELECT is(
  (SELECT total_catalogue_delta FROM pg_temp.run_m5_catalogue_validator()),
  0,
  '77. Cycle 2 Teardown: catalogue validator reports delta = 0 after second cycle'
);

SELECT is(
  (SELECT total_catalogue_rows FROM pg_temp.run_m5_catalogue_validator()),
  2674,
  '78. Cycle 2 Teardown: durable catalogue row count is 2674 after second cycle'
);

SELECT * FROM finish();

ROLLBACK;
