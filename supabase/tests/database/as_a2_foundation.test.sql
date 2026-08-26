-- ============================================================
-- DATABASE TESTS: AS/A2 Foundation (Migration 020)
--
-- Run via: supabase test db
-- All changes roll back at the end — no data is persisted.
--
-- Two synthetic test users are created with fixed UUIDs in the
-- a2db0001-... space. They are inserted into auth.users so the
-- handle_new_user() trigger creates corresponding profiles,
-- streaks, settings, and study_pets rows automatically.
-- Everything is rolled back by the final ROLLBACK statement.
--
-- Tests (23):
--   1.  Positive RLS: owner can INSERT into subject_stage_results
--   2.  Negative RLS: other user blocked from INSERT into subject_stage_results (42501)
--   3.  Positive RLS: owner can INSERT into subject_paper_selections
--   4.  Negative RLS: other user blocked from INSERT into subject_paper_selections (42501)
--   5.  CHECK: stage = 'full' rejected on subject_stage_results
--   6.  CHECK: stage = 'full' rejected on subject_paper_selections
--   7.  CHECK: stage = 'full' rejected on past_papers
--   8.  UNIQUE: duplicate result for same subject/stage/type/series/year rejected
--   9.  CHECK: score_obtained > score_maximum rejected
--   10. CHECK: score_obtained = 0 accepted
--   11.  CHECK: carry_forward = TRUE rejected when stage = 'a2'
--   12.  CHECK: carry_forward = TRUE accepted when stage = 'as' AND result_type = 'actual'
--   13.  CHECK: unconfirmed route requires current_stage NULL (non-NULL rejected)
--   14. CHECK: as_only route accepts current_stage = 'as'
--   15. CHECK: as_only route rejects non-'as' stage
--   16. CHECK: staged route accepts current_stage = 'as'
--   17. CHECK: staged route accepts current_stage = 'a2' with unlock fields
--   18. CHECK: staged route rejects current_stage = 'a2' without unlock fields
--   19. CHECK: full_level route accepts current_stage = 'full'
--   20. CHECK: full_level route rejects non-'full' stage
--   21. CHECK: setting only a2_unlocked_at (no method) rejected
--   22. CHECK: setting only a2_unlock_method (no timestamp) rejected
--   23. NOT NULL: exam_series and exam_year required on subject_stage_results
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(23);

-- ─── TEMP TABLE: test context ──────────────────────────────────────────────
-- Stores synthetic UUIDs and test-result flags for later ok() assertions.

CREATE TEMP TABLE ssa2_test_ctx (
  owner_id          UUID NOT NULL,
  other_id          UUID NOT NULL,
  subj_id           UUID NOT NULL DEFAULT gen_random_uuid(),
  owner_us_id       UUID,          -- set after user_subjects INSERT
  -- Test result flags (TRUE = test passed)
  t1_ssr_owner_ok   BOOLEAN DEFAULT FALSE,
  t2_ssr_blocked    BOOLEAN DEFAULT FALSE,
  t3_sps_owner_ok   BOOLEAN DEFAULT FALSE,
  t4_sps_blocked    BOOLEAN DEFAULT FALSE,
  t5_ssr_full       BOOLEAN DEFAULT FALSE,
  t6_sps_full       BOOLEAN DEFAULT FALSE,
  t7_pp_full        BOOLEAN DEFAULT FALSE,
  t8_dup_blocked    BOOLEAN DEFAULT FALSE,
  t9_score_over     BOOLEAN DEFAULT FALSE,
  t10_score_zero    BOOLEAN DEFAULT FALSE,
  t11_cf_a2_blocked BOOLEAN DEFAULT FALSE,
  t12_cf_as_ok      BOOLEAN DEFAULT FALSE,
  t13_unconf_null   BOOLEAN DEFAULT FALSE,
  t14_as_only_ok    BOOLEAN DEFAULT FALSE,
  t15_as_only_bad   BOOLEAN DEFAULT FALSE,
  t16_staged_as_ok  BOOLEAN DEFAULT FALSE,
  t17_staged_a2_ok  BOOLEAN DEFAULT FALSE,
  t18_staged_a2_bad BOOLEAN DEFAULT FALSE,
  t19_full_ok       BOOLEAN DEFAULT FALSE,
  t20_full_bad      BOOLEAN DEFAULT FALSE,
  t21_at_only       BOOLEAN DEFAULT FALSE,
  t22_meth_only     BOOLEAN DEFAULT FALSE,
  t23_req_fields    BOOLEAN DEFAULT FALSE
) ON COMMIT DROP;

GRANT ALL ON TABLE ssa2_test_ctx TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subject_stage_results TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subject_paper_selections TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_subjects TO authenticated, anon;

INSERT INTO ssa2_test_ctx (owner_id, other_id)
VALUES (
  'a2db0001-0000-0000-0000-000000000001',
  'a2db0001-0000-0000-0000-000000000002'
);

-- ─── SETUP: create two isolated synthetic users ────────────────────────────
-- Fixed UUIDs ensure tests are independent of the production user count.
-- handle_new_user() trigger fires on INSERT and creates profiles/streaks/settings.
-- ON CONFLICT DO NOTHING is defensive; within one ROLLBACK transaction these
-- UUIDs will not exist from a previous run.

DO $$
BEGIN
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    'a2db0001-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'ssa2_owner@atlas.test',
    '',
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    NOW(),
    NOW()
  ), (
    '00000000-0000-0000-0000-000000000000',
    'a2db0001-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'ssa2_other@atlas.test',
    '',
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ─── SETUP: test subject and owner's user_subject ─────────────────────────
-- study_route = 'staged', current_stage = 'as' — valid per route_stage_check.

DO $$
DECLARE
  v_owner_id UUID;
  v_subj_id  UUID;
  v_us_id    UUID;
BEGIN
  SELECT owner_id, subj_id INTO v_owner_id, v_subj_id FROM ssa2_test_ctx;

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj_id, 'SSA2 Test Subject', FALSE, v_owner_id);

  INSERT INTO public.user_subjects (
    user_id, subject_id, priority, study_route, current_stage
  )
  VALUES (v_owner_id, v_subj_id, 3, 'staged', 'as')
  RETURNING id INTO v_us_id;

  UPDATE ssa2_test_ctx SET owner_us_id = v_us_id;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════
-- TEST 1: Positive RLS: owner can INSERT into subject_stage_results
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id    UUID;
  v_owner    UUID;
  v_inserted BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id, owner_id INTO v_us_id, v_owner FROM ssa2_test_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner::text)::text,
    true
  );

  BEGIN
    INSERT INTO public.subject_stage_results
      (user_subject_id, stage, result_type, score_obtained, score_maximum, exam_series, exam_year)
    VALUES
      (v_us_id, 'as', 'expected', 85, 100, 'may_jun', 2025);
    v_inserted := TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Test 1 INSERT failed: SQLSTATE %, SQLERRM %', SQLSTATE, SQLERRM;
      v_inserted := FALSE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE ssa2_test_ctx SET t1_ssr_owner_ok = v_inserted;
END;
$$;

SELECT ok(
  (SELECT t1_ssr_owner_ok FROM ssa2_test_ctx),
  'RLS: owner CAN insert into subject_stage_results'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 2: Negative RLS: other user blocked from INSERT into subject_stage_results
-- Expects specifically insufficient_privilege (SQLSTATE 42501)
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id   UUID;
  v_other   UUID;
  v_blocked BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id, other_id INTO v_us_id, v_other FROM ssa2_test_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other::text)::text,
    true
  );

  BEGIN
    INSERT INTO public.subject_stage_results
      (user_subject_id, stage, result_type, score_obtained, score_maximum, exam_series, exam_year)
    VALUES
      (v_us_id, 'as', 'actual', 80, 100, 'may_jun', 2024);
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE ssa2_test_ctx SET t2_ssr_blocked = v_blocked;
END;
$$;

SELECT ok(
  (SELECT t2_ssr_blocked FROM ssa2_test_ctx),
  'RLS: other user is blocked from INSERT into subject_stage_results with insufficient_privilege'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 3: Positive RLS: owner can INSERT into subject_paper_selections
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id    UUID;
  v_owner    UUID;
  v_inserted BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id, owner_id INTO v_us_id, v_owner FROM ssa2_test_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner::text)::text,
    true
  );

  BEGIN
    INSERT INTO public.subject_paper_selections
      (user_subject_id, component_name, stage)
    VALUES
      (v_us_id, 'Pure 1', 'as');
    v_inserted := TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Test 3 INSERT failed: SQLSTATE %, SQLERRM %', SQLSTATE, SQLERRM;
      v_inserted := FALSE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE ssa2_test_ctx SET t3_sps_owner_ok = v_inserted;
END;
$$;

SELECT ok(
  (SELECT t3_sps_owner_ok FROM ssa2_test_ctx),
  'RLS: owner CAN insert into subject_paper_selections'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 4: Negative RLS: other user blocked from INSERT into subject_paper_selections
-- Expects specifically insufficient_privilege (SQLSTATE 42501)
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id   UUID;
  v_other   UUID;
  v_blocked BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id, other_id INTO v_us_id, v_other FROM ssa2_test_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other::text)::text,
    true
  );

  BEGIN
    INSERT INTO public.subject_paper_selections
      (user_subject_id, component_name, stage)
    VALUES
      (v_us_id, 'Pure 2', 'as');
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE ssa2_test_ctx SET t4_sps_blocked = v_blocked;
END;
$$;

SELECT ok(
  (SELECT t4_sps_blocked FROM ssa2_test_ctx),
  'RLS: other user is blocked from INSERT into subject_paper_selections with insufficient_privilege'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 5: stage = 'full' rejected on subject_stage_results
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id  UUID;
  v_caught BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id INTO v_us_id FROM ssa2_test_ctx;

  BEGIN
    INSERT INTO public.subject_stage_results
      (user_subject_id, stage, result_type, score_obtained, score_maximum, exam_series, exam_year)
    VALUES
      (v_us_id, 'full', 'actual', 80, 100, 'may_jun', 2024);
  EXCEPTION
    WHEN check_violation THEN v_caught := TRUE;  -- 23514
  END;

  UPDATE ssa2_test_ctx SET t5_ssr_full = v_caught;
END;
$$;

SELECT ok(
  (SELECT t5_ssr_full FROM ssa2_test_ctx),
  'CHECK: stage = ''full'' is rejected on subject_stage_results'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 6: stage = 'full' rejected on subject_paper_selections
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id  UUID;
  v_caught BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id INTO v_us_id FROM ssa2_test_ctx;

  BEGIN
    INSERT INTO public.subject_paper_selections
      (user_subject_id, component_name, stage)
    VALUES
      (v_us_id, 'Pure 3', 'full');
  EXCEPTION
    WHEN check_violation THEN v_caught := TRUE;  -- 23514
  END;

  UPDATE ssa2_test_ctx SET t6_sps_full = v_caught;
END;
$$;

SELECT ok(
  (SELECT t6_sps_full FROM ssa2_test_ctx),
  'CHECK: stage = ''full'' is rejected on subject_paper_selections'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 7: stage = 'full' rejected on past_papers
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner_id UUID;
  v_subj_id  UUID;
  v_caught   BOOLEAN := FALSE;
BEGIN
  SELECT owner_id, subj_id INTO v_owner_id, v_subj_id FROM ssa2_test_ctx;

  BEGIN
    INSERT INTO public.past_papers
      (user_id, subject_id, paper_code, year, session, score_raw, score_max, attempted_at, stage)
    VALUES
      (v_owner_id, v_subj_id, 'TEST/9999/01', 2024, 'may_jun', 80, 100, NOW(), 'full');
  EXCEPTION
    WHEN check_violation THEN v_caught := TRUE;  -- 23514
  END;

  UPDATE ssa2_test_ctx SET t7_pp_full = v_caught;
END;
$$;

SELECT ok(
  (SELECT t7_pp_full FROM ssa2_test_ctx),
  'CHECK: stage = ''full'' is rejected on past_papers'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 8: duplicate result blocked by UNIQUE constraint
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id  UUID;
  v_caught BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id INTO v_us_id FROM ssa2_test_ctx;

  -- First INSERT — must succeed
  INSERT INTO public.subject_stage_results
    (user_subject_id, stage, result_type, score_obtained, score_maximum, exam_series, exam_year)
  VALUES
    (v_us_id, 'as', 'actual', 80, 100, 'may_jun', 2024);

  -- Second INSERT with identical key — must fail
  BEGIN
    INSERT INTO public.subject_stage_results
      (user_subject_id, stage, result_type, score_obtained, score_maximum, exam_series, exam_year)
    VALUES
      (v_us_id, 'as', 'actual', 75, 100, 'may_jun', 2024);
  EXCEPTION
    WHEN unique_violation THEN v_caught := TRUE;  -- 23505
  END;

  UPDATE ssa2_test_ctx SET t8_dup_blocked = v_caught;
END;
$$;

SELECT ok(
  (SELECT t8_dup_blocked FROM ssa2_test_ctx),
  'UNIQUE: duplicate (user_subject_id, stage, result_type, exam_series, exam_year) is rejected'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 9: score_obtained > score_maximum rejected
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id  UUID;
  v_caught BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id INTO v_us_id FROM ssa2_test_ctx;

  BEGIN
    INSERT INTO public.subject_stage_results
      (user_subject_id, stage, result_type, score_obtained, score_maximum, exam_series, exam_year)
    VALUES
      (v_us_id, 'a2', 'expected', 105, 100, 'oct_nov', 2024);
  EXCEPTION
    WHEN check_violation THEN v_caught := TRUE;  -- 23514 (ssr_score_valid)
  END;

  UPDATE ssa2_test_ctx SET t9_score_over = v_caught;
END;
$$;

SELECT ok(
  (SELECT t9_score_over FROM ssa2_test_ctx),
  'CHECK: score_obtained > score_maximum is rejected'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 10: score_obtained = 0 is accepted
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id  UUID;
  v_ok     BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id INTO v_us_id FROM ssa2_test_ctx;

  BEGIN
    INSERT INTO public.subject_stage_results
      (user_subject_id, stage, result_type, score_obtained, score_maximum, exam_series, exam_year)
    VALUES
      (v_us_id, 'a2', 'actual', 0, 100, 'oct_nov', 2024);
    v_ok := TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      v_ok := FALSE;
  END;

  UPDATE ssa2_test_ctx SET t10_score_zero = v_ok;
END;
$$;

SELECT ok(
  (SELECT t10_score_zero FROM ssa2_test_ctx),
  'CHECK: score_obtained = 0 is accepted'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 11: carry_forward = TRUE rejected when stage = 'a2'
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id  UUID;
  v_caught BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id INTO v_us_id FROM ssa2_test_ctx;

  BEGIN
    INSERT INTO public.subject_stage_results
      (user_subject_id, stage, result_type, score_obtained, score_maximum, exam_series, exam_year, carry_forward)
    VALUES
      (v_us_id, 'a2', 'forecast', 90, 100, 'may_jun', 2025, TRUE);
  EXCEPTION
    WHEN check_violation THEN v_caught := TRUE;  -- 23514 (ssr_carry_forward_as_only)
  END;

  UPDATE ssa2_test_ctx SET t11_cf_a2_blocked = v_caught;
END;
$$;

SELECT ok(
  (SELECT t11_cf_a2_blocked FROM ssa2_test_ctx),
  'CHECK: carry_forward = TRUE is rejected when stage = ''a2'''
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 12: carry_forward = TRUE accepted when stage = 'as' AND result_type = 'actual'
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id  UUID;
  v_ok     BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id INTO v_us_id FROM ssa2_test_ctx;

  BEGIN
    INSERT INTO public.subject_stage_results
      (user_subject_id, stage, result_type, score_obtained, score_maximum, exam_series, exam_year, carry_forward)
    VALUES
      (v_us_id, 'as', 'actual', 85, 100, 'oct_nov', 2024, TRUE);
    v_ok := TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Test 12 INSERT failed: SQLSTATE %, SQLERRM %', SQLSTATE, SQLERRM;
      v_ok := FALSE;
  END;

  UPDATE ssa2_test_ctx SET t12_cf_as_ok = v_ok;
END;
$$;

SELECT ok(
  (SELECT t12_cf_as_ok FROM ssa2_test_ctx),
  'CHECK: carry_forward = TRUE is accepted when stage = ''as'' AND result_type = ''actual'''
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 13: unconfirmed route requires current_stage NULL
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner_id UUID;
  v_subj_id  UUID := gen_random_uuid();
  v_caught   BOOLEAN := FALSE;
BEGIN
  SELECT owner_id INTO v_owner_id FROM ssa2_test_ctx;

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj_id, 'Unconfirmed Test Subj', FALSE, v_owner_id);

  BEGIN
    INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
    VALUES (v_owner_id, v_subj_id, 'unconfirmed', 'as');
  EXCEPTION
    WHEN check_violation THEN v_caught := TRUE;  -- 23514 (user_subjects_route_stage_check)
  END;

  UPDATE ssa2_test_ctx SET t13_unconf_null = v_caught;
END;
$$;

SELECT ok(
  (SELECT t13_unconf_null FROM ssa2_test_ctx),
  'CHECK: study_route = ''unconfirmed'' requires current_stage IS NULL'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 14: as_only route accepts current_stage = 'as'
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner_id UUID;
  v_subj_id  UUID := gen_random_uuid();
  v_ok       BOOLEAN := FALSE;
BEGIN
  SELECT owner_id INTO v_owner_id FROM ssa2_test_ctx;

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj_id, 'AS Only Test Subj', FALSE, v_owner_id);

  BEGIN
    INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
    VALUES (v_owner_id, v_subj_id, 'as_only', 'as');
    v_ok := TRUE;
  EXCEPTION
    WHEN OTHERS THEN v_ok := FALSE;
  END;

  UPDATE ssa2_test_ctx SET t14_as_only_ok = v_ok;
END;
$$;

SELECT ok(
  (SELECT t14_as_only_ok FROM ssa2_test_ctx),
  'CHECK: study_route = ''as_only'' accepts current_stage = ''as'''
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 15: as_only route rejects non-'as' stage
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner_id UUID;
  v_subj_id  UUID := gen_random_uuid();
  v_caught   BOOLEAN := FALSE;
BEGIN
  SELECT owner_id INTO v_owner_id FROM ssa2_test_ctx;

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj_id, 'AS Only Bad Stage Subj', FALSE, v_owner_id);

  BEGIN
    INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
    VALUES (v_owner_id, v_subj_id, 'as_only', 'a2');
  EXCEPTION
    WHEN check_violation THEN v_caught := TRUE;  -- 23514
  END;

  UPDATE ssa2_test_ctx SET t15_as_only_bad = v_caught;
END;
$$;

SELECT ok(
  (SELECT t15_as_only_bad FROM ssa2_test_ctx),
  'CHECK: study_route = ''as_only'' rejects current_stage != ''as'''
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 16: staged route accepts current_stage = 'as'
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner_id UUID;
  v_subj_id  UUID := gen_random_uuid();
  v_ok       BOOLEAN := FALSE;
BEGIN
  SELECT owner_id INTO v_owner_id FROM ssa2_test_ctx;

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj_id, 'Staged AS Subj', FALSE, v_owner_id);

  BEGIN
    INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
    VALUES (v_owner_id, v_subj_id, 'staged', 'as');
    v_ok := TRUE;
  EXCEPTION
    WHEN OTHERS THEN v_ok := FALSE;
  END;

  UPDATE ssa2_test_ctx SET t16_staged_as_ok = v_ok;
END;
$$;

SELECT ok(
  (SELECT t16_staged_as_ok FROM ssa2_test_ctx),
  'CHECK: study_route = ''staged'' accepts current_stage = ''as'''
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 17: staged route accepts current_stage = 'a2' with unlock fields
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner_id UUID;
  v_subj_id  UUID := gen_random_uuid();
  v_ok       BOOLEAN := FALSE;
BEGIN
  SELECT owner_id INTO v_owner_id FROM ssa2_test_ctx;

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj_id, 'Staged A2 Unlock Subj', FALSE, v_owner_id);

  BEGIN
    INSERT INTO public.user_subjects (
      user_id, subject_id, study_route, current_stage, a2_unlocked_at, a2_unlock_method
    )
    VALUES (v_owner_id, v_subj_id, 'staged', 'a2', NOW(), 'normal_transition');
    v_ok := TRUE;
  EXCEPTION
    WHEN OTHERS THEN v_ok := FALSE;
  END;

  UPDATE ssa2_test_ctx SET t17_staged_a2_ok = v_ok;
END;
$$;

SELECT ok(
  (SELECT t17_staged_a2_ok FROM ssa2_test_ctx),
  'CHECK: study_route = ''staged'' accepts current_stage = ''a2'' when unlock fields are provided'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 18: staged route rejects current_stage = 'a2' without unlock fields
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner_id UUID;
  v_subj_id  UUID := gen_random_uuid();
  v_caught   BOOLEAN := FALSE;
BEGIN
  SELECT owner_id INTO v_owner_id FROM ssa2_test_ctx;

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj_id, 'Staged A2 No Unlock Subj', FALSE, v_owner_id);

  BEGIN
    INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
    VALUES (v_owner_id, v_subj_id, 'staged', 'a2');
  EXCEPTION
    WHEN check_violation THEN v_caught := TRUE;  -- 23514 (user_subjects_staged_a2_requires_unlock)
  END;

  UPDATE ssa2_test_ctx SET t18_staged_a2_bad = v_caught;
END;
$$;

SELECT ok(
  (SELECT t18_staged_a2_bad FROM ssa2_test_ctx),
  'CHECK: study_route = ''staged'' with current_stage = ''a2'' requires unlock fields'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 19: full_level route accepts current_stage = 'full'
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner_id UUID;
  v_subj_id  UUID := gen_random_uuid();
  v_ok       BOOLEAN := FALSE;
BEGIN
  SELECT owner_id INTO v_owner_id FROM ssa2_test_ctx;

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj_id, 'Full Level Subj', FALSE, v_owner_id);

  BEGIN
    INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
    VALUES (v_owner_id, v_subj_id, 'full_level', 'full');
    v_ok := TRUE;
  EXCEPTION
    WHEN OTHERS THEN v_ok := FALSE;
  END;

  UPDATE ssa2_test_ctx SET t19_full_ok = v_ok;
END;
$$;

SELECT ok(
  (SELECT t19_full_ok FROM ssa2_test_ctx),
  'CHECK: study_route = ''full_level'' accepts current_stage = ''full'''
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 20: full_level route rejects non-'full' stage
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner_id UUID;
  v_subj_id  UUID := gen_random_uuid();
  v_caught   BOOLEAN := FALSE;
BEGIN
  SELECT owner_id INTO v_owner_id FROM ssa2_test_ctx;

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj_id, 'Full Level Bad Stage Subj', FALSE, v_owner_id);

  BEGIN
    INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
    VALUES (v_owner_id, v_subj_id, 'full_level', 'as');
  EXCEPTION
    WHEN check_violation THEN v_caught := TRUE;  -- 23514
  END;

  UPDATE ssa2_test_ctx SET t20_full_bad = v_caught;
END;
$$;

SELECT ok(
  (SELECT t20_full_bad FROM ssa2_test_ctx),
  'CHECK: study_route = ''full_level'' rejects current_stage != ''full'''
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 21: only a2_unlocked_at set (without method) rejected
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id  UUID;
  v_caught BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id INTO v_us_id FROM ssa2_test_ctx;

  BEGIN
    UPDATE public.user_subjects
    SET a2_unlocked_at = NOW()   -- a2_unlock_method stays NULL → consistency violated
    WHERE id = v_us_id;
  EXCEPTION
    WHEN check_violation THEN v_caught := TRUE;  -- 23514 (a2_unlock_consistency)
  END;

  UPDATE ssa2_test_ctx SET t21_at_only = v_caught;
END;
$$;

SELECT ok(
  (SELECT t21_at_only FROM ssa2_test_ctx),
  'CHECK: setting only a2_unlocked_at (without a2_unlock_method) is rejected'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 22: only a2_unlock_method set (without timestamp) rejected
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id  UUID;
  v_caught BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id INTO v_us_id FROM ssa2_test_ctx;

  BEGIN
    UPDATE public.user_subjects
    SET a2_unlock_method = 'manual'   -- a2_unlocked_at stays NULL → consistency violated
    WHERE id = v_us_id;
  EXCEPTION
    WHEN check_violation THEN v_caught := TRUE;  -- 23514 (a2_unlock_consistency)
  END;

  UPDATE ssa2_test_ctx SET t22_meth_only = v_caught;
END;
$$;

SELECT ok(
  (SELECT t22_meth_only FROM ssa2_test_ctx),
  'CHECK: setting only a2_unlock_method (without a2_unlocked_at) is rejected'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 23: exam_series and exam_year required (NOT NULL)
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id        UUID;
  v_series_null  BOOLEAN := FALSE;
  v_year_null    BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id INTO v_us_id FROM ssa2_test_ctx;

  BEGIN
    INSERT INTO public.subject_stage_results
      (user_subject_id, stage, result_type, score_obtained, score_maximum, exam_series, exam_year)
    VALUES
      (v_us_id, 'as', 'forecast', 70, 100, NULL, 2025);
  EXCEPTION
    WHEN not_null_violation THEN v_series_null := TRUE;  -- 23502
  END;

  BEGIN
    INSERT INTO public.subject_stage_results
      (user_subject_id, stage, result_type, score_obtained, score_maximum, exam_series, exam_year)
    VALUES
      (v_us_id, 'as', 'forecast', 70, 100, 'feb_mar', NULL);
  EXCEPTION
    WHEN not_null_violation THEN v_year_null := TRUE;  -- 23502
  END;

  UPDATE ssa2_test_ctx SET t23_req_fields = (v_series_null AND v_year_null);
END;
$$;

SELECT ok(
  (SELECT t23_req_fields FROM ssa2_test_ctx),
  'NOT NULL: exam_series and exam_year are both required on subject_stage_results'
);


-- ─── FINISH ───────────────────────────────────────────────────────────────
SELECT * FROM finish();

ROLLBACK;
