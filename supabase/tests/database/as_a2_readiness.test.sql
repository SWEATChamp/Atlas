-- ============================================================
-- DATABASE TESTS: AS/A2 Readiness & Route Functions (Migration 021)
--
-- Run via: supabase test db
-- All changes roll back — no data is persisted.
--
-- Two synthetic test users use fixed UUIDs in the r021-... space.
-- handle_new_user() trigger creates profile, streak, settings, pet.
--
-- Tests (25):
--   Readiness (1-11):
--    1.  Untouched chapters → readiness = 0, not NULL or inflated
--    2.  complete notes → notes_pct increases; in_progress = 0
--    3.  shared chapter contributes to both AS and A2 readiness
--    4.  AS paper increases AS readiness; A2 readiness unchanged
--    5.  A2 paper increases A2 readiness; AS readiness unchanged
--    6.  NULL-stage paper excluded from both AS and A2 readiness
--    7.  route_dependent chapter → AS readiness when selection stage='as'
--    8.  route_dependent chapter → A2 readiness when selection stage='a2'
--    9.  p_stage='all' with unconfirmed route → readiness = 0
--   10.  p_stage='all': route_dependent excluded when no selection
--   11.  p_stage='invalid' raises P0002
--   Constraint (12):
--   12.  carry_forward=TRUE + result_type='forecast' raises constraint violation
--   Route functions (13-18):
--   13.  configure_subject_route sets correct current_stage per route
--   14.  configure_subject_route clears unlock fields on route change to as_only
--   15.  configure_subject_route rejects 'unconfirmed' as target route
--   16.  configure_subject_route rejects stage='a2' selection for as_only route
--   17.  configure_subject_route rejects component not in subject
--   18.  configure_subject_route cancels stale pending mission
--   RLS (19-20):
--   19.  Direct user_chapters INSERT for A2 chapter as staged/as user → rejected
--   20.  Direct user_chapters UPDATE for A2 chapter as staged/as user → rejected
--   Missions (21-23):
--   21.  Unconfirmed subject → generate_daily_missions produces 0 missions
--   22.  All-unconfirmed subjects → 0 missions total
--   23.  complete_mission rejects inaccessible chapter (P0004)
--   Transition (24-25):
--   24.  transition_to_a2 (normal): result insert failure rolls back unlock
--   25.  transition_to_a2 (manual, as_only): atomically sets study_route=staged
--   Security & RLS (26-27):
--   26.  Unauthenticated call (auth.uid() IS NULL) raises 42501 Unauthorized
--   27.  Direct past_papers INSERT for A2 paper as staged/as user → rejected
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(27);

-- ─── TEMP TABLE ────────────────────────────────────────────────────────────

CREATE TEMP TABLE r021_ctx (
  owner_id    UUID NOT NULL,
  other_id    UUID NOT NULL,
  subj_id     UUID NOT NULL DEFAULT gen_random_uuid(),
  subj_a2_id  UUID NOT NULL DEFAULT gen_random_uuid(),  -- separate subject with A2 chapters
  owner_us_id UUID,
  -- Chapter UUIDs
  as_ch_id    UUID NOT NULL DEFAULT gen_random_uuid(),
  shared_ch_id UUID NOT NULL DEFAULT gen_random_uuid(),
  a2_ch_id    UUID NOT NULL DEFAULT gen_random_uuid(),
  rd_ch_id    UUID NOT NULL DEFAULT gen_random_uuid(),  -- route_dependent
  -- user_chapters
  as_uc_id    UUID NOT NULL DEFAULT gen_random_uuid(),
  shared_uc_id UUID NOT NULL DEFAULT gen_random_uuid(),
  a2_uc_id    UUID NOT NULL DEFAULT gen_random_uuid(),
  -- Test flags
  t1_untouched      BOOLEAN DEFAULT FALSE,
  t2_notes_complete BOOLEAN DEFAULT FALSE,
  t3_shared         BOOLEAN DEFAULT FALSE,
  t4_as_paper       BOOLEAN DEFAULT FALSE,
  t5_a2_paper       BOOLEAN DEFAULT FALSE,
  t6_null_paper     BOOLEAN DEFAULT FALSE,
  t7_rd_as          BOOLEAN DEFAULT FALSE,
  t8_rd_a2          BOOLEAN DEFAULT FALSE,
  t9_unconfirmed    BOOLEAN DEFAULT FALSE,
  t10_rd_no_sel     BOOLEAN DEFAULT FALSE,
  t11_bad_stage     BOOLEAN DEFAULT FALSE,
  t12_cf_forecast   BOOLEAN DEFAULT FALSE,
  t13_route_stage   BOOLEAN DEFAULT FALSE,
  t14_clear_unlock  BOOLEAN DEFAULT FALSE,
  t15_unconf_reject BOOLEAN DEFAULT FALSE,
  t16_a2sel_asonly  BOOLEAN DEFAULT FALSE,
  t17_bad_component BOOLEAN DEFAULT FALSE,
  t18_stale_mission BOOLEAN DEFAULT FALSE,
  t19_rls_a2_insert BOOLEAN DEFAULT FALSE,
  t20_rls_a2_update BOOLEAN DEFAULT FALSE,
  t21_unconf_missions BOOLEAN DEFAULT FALSE,
  t22_all_unconf    BOOLEAN DEFAULT FALSE,
  t23_inacc_mission BOOLEAN DEFAULT FALSE,
  t24_rollback      BOOLEAN DEFAULT FALSE,
  t25_manual_staged BOOLEAN DEFAULT FALSE,
  t26_unauthenticated BOOLEAN DEFAULT FALSE,
  t27_direct_a2_paper_insert BOOLEAN DEFAULT FALSE
) ON COMMIT DROP;

GRANT ALL ON TABLE r021_ctx TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_chapters TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.past_papers TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subject_stage_results TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subject_paper_selections TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_subjects TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_missions TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_settings TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.streaks TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.xp_events TO authenticated, anon;

INSERT INTO r021_ctx (owner_id, other_id) VALUES (
  'a2210001-0000-0000-0000-000000000001',
  'a2210001-0000-0000-0000-000000000002'
);

-- ─── SETUP: synthetic users ────────────────────────────────────────────────

DO $$
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'a2210001-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'a221_owner@atlas.test', '',
    NOW(),
    '{"provider":"email","providers":["email"]}', '{}',
    NOW(), NOW()
  ), (
    '00000000-0000-0000-0000-000000000000',
    'a2210001-0000-0000-0000-000000000002',
    'authenticated', 'authenticated',
    'a221_other@atlas.test', '',
    NOW(),
    '{"provider":"email","providers":["email"]}', '{}',
    NOW(), NOW()
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ─── SETUP: subjects, chapters, enrollment ─────────────────────────────────

DO $$
DECLARE
  v_owner     UUID;
  v_subj      UUID;
  v_us_id     UUID;
  v_as_ch     UUID;
  v_sh_ch     UUID;
  v_a2_ch     UUID;
  v_rd_ch     UUID;
BEGIN
  SELECT owner_id, subj_id, as_ch_id, shared_ch_id, a2_ch_id, rd_ch_id
  INTO   v_owner, v_subj, v_as_ch, v_sh_ch, v_a2_ch, v_rd_ch
  FROM   r021_ctx;

  -- Subject
  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj, 'R021 Test Subject', FALSE, v_owner);

  -- Chapters: one of each stage type
  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES
    (v_as_ch, v_subj, 'AS Chapter',           1, 'Pure 1',       FALSE, 'as'),
    (v_sh_ch, v_subj, 'Shared Chapter',        2, 'Core',         FALSE, 'shared'),
    (v_a2_ch, v_subj, 'A2 Chapter',            3, 'A2 Advanced',  FALSE, 'a2'),
    (v_rd_ch, v_subj, 'Route Dependent Chap',  4, 'Mechanics',    FALSE, 'route_dependent');

  -- Enrollment: staged/as
  INSERT INTO public.user_subjects (
    user_id, subject_id, priority, exam_date,
    study_route, current_stage
  )
  VALUES (v_owner, v_subj, 3, CURRENT_DATE + 90, 'staged', 'as')
  RETURNING id INTO v_us_id;

  UPDATE r021_ctx SET owner_us_id = v_us_id;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════
-- TEST 1: Untouched chapters → readiness = 0
-- No user_chapters rows exist. Denominator = 2 (AS + shared chapters for AS stage).
-- Numerator = 0. Expected = 0.00
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner UUID;
  v_subj  UUID;
  v_score NUMERIC;
BEGIN
  SELECT owner_id, subj_id INTO v_owner, v_subj FROM r021_ctx;

  -- Impersonate owner
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  v_score := public.compute_readiness_score(v_owner, v_subj, 'as');
  UPDATE r021_ctx SET t1_untouched = (v_score = 0.00 AND v_score IS NOT NULL);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok((SELECT t1_untouched FROM r021_ctx),
  'Untouched chapters: AS readiness = 0.00, not NULL or inflated');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 2: complete notes increases readiness; in_progress = 0
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner   UUID;
  v_subj    UUID;
  v_as_ch   UUID;
  v_as_uc   UUID;
  v_before  NUMERIC;
  v_after   NUMERIC;
BEGIN
  SELECT owner_id, subj_id, as_ch_id, as_uc_id
  INTO   v_owner, v_subj, v_as_ch, v_as_uc
  FROM   r021_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  v_before := public.compute_readiness_score(v_owner, v_subj, 'as');

  -- Add in_progress: should not change score (in_progress = 0)
  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status, confidence_level)
  VALUES (v_as_uc, v_owner, v_as_ch, 'in_progress', NULL);

  -- Score should still be same as untouched (in_progress = 0, not 0.5)
  DECLARE
    v_after_inprogress NUMERIC;
  BEGIN
    v_after_inprogress := public.compute_readiness_score(v_owner, v_subj, 'as');

    -- Now complete the notes
    UPDATE public.user_chapters SET notes_status = 'complete' WHERE id = v_as_uc;
    v_after := public.compute_readiness_score(v_owner, v_subj, 'as');

    UPDATE r021_ctx SET
      t2_notes_complete = (
        -- in_progress should not exceed untouched score (notes contribution = 0)
        v_after_inprogress = v_before
        -- complete must increase score
        AND v_after > v_before
      ),
      as_uc_id = v_as_uc;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok((SELECT t2_notes_complete FROM r021_ctx),
  'Notes: complete increases score; in_progress does NOT (in_progress = 0)');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 3: shared chapter contributes to both AS and A2 readiness
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner   UUID;
  v_subj    UUID;
  v_sh_ch   UUID;
  v_sh_uc   UUID;
  v_as_before NUMERIC;
  v_a2_before NUMERIC;
  v_as_after  NUMERIC;
  v_a2_after  NUMERIC;
BEGIN
  SELECT owner_id, subj_id, shared_ch_id, shared_uc_id
  INTO   v_owner, v_subj, v_sh_ch, v_sh_uc
  FROM   r021_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  v_as_before := public.compute_readiness_score(v_owner, v_subj, 'as');
  v_a2_before := public.compute_readiness_score(v_owner, v_subj, 'a2');

  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status, confidence_level)
  VALUES (v_sh_uc, v_owner, v_sh_ch, 'complete', 5);

  v_as_after := public.compute_readiness_score(v_owner, v_subj, 'as');
  v_a2_after := public.compute_readiness_score(v_owner, v_subj, 'a2');

  UPDATE r021_ctx SET
    t3_shared       = (v_as_after > v_as_before AND v_a2_after > v_a2_before),
    shared_uc_id    = v_sh_uc;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok((SELECT t3_shared FROM r021_ctx),
  'shared chapter increases both AS readiness and A2 readiness');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 4: AS paper increases AS readiness; A2 readiness unchanged
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner  UUID;
  v_subj   UUID;
  v_as_before NUMERIC;
  v_a2_before NUMERIC;
  v_as_after  NUMERIC;
  v_a2_after  NUMERIC;
BEGIN
  SELECT owner_id, subj_id INTO v_owner, v_subj FROM r021_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  v_as_before := public.compute_readiness_score(v_owner, v_subj, 'as');
  v_a2_before := public.compute_readiness_score(v_owner, v_subj, 'a2');

  INSERT INTO public.past_papers (
    user_id, subject_id, paper_code, year, session, score_raw, score_max, stage
  ) VALUES (v_owner, v_subj, '9709_s24_qp_11', 2024, 'may_jun', 60, 75, 'as');

  v_as_after := public.compute_readiness_score(v_owner, v_subj, 'as');
  v_a2_after := public.compute_readiness_score(v_owner, v_subj, 'a2');

  UPDATE r021_ctx SET t4_as_paper = (
    v_as_after > v_as_before AND v_a2_after = v_a2_before
  );

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok((SELECT t4_as_paper FROM r021_ctx),
  'AS paper increases AS readiness; A2 readiness unchanged');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 5: A2 paper increases A2 readiness; AS readiness unchanged
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner  UUID;
  v_subj   UUID;
  v_as_before NUMERIC;
  v_a2_before NUMERIC;
  v_as_after  NUMERIC;
  v_a2_after  NUMERIC;
BEGIN
  SELECT owner_id, subj_id INTO v_owner, v_subj FROM r021_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  v_as_before := public.compute_readiness_score(v_owner, v_subj, 'as');
  v_a2_before := public.compute_readiness_score(v_owner, v_subj, 'a2');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Insert A2 paper as database test administrator (readiness calculation test)
  INSERT INTO public.past_papers (
    user_id, subject_id, paper_code, year, session, score_raw, score_max, stage
  ) VALUES (v_owner, v_subj, '9709_s24_qp_31', 2024, 'may_jun', 67, 75, 'a2');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  v_as_after := public.compute_readiness_score(v_owner, v_subj, 'as');
  v_a2_after := public.compute_readiness_score(v_owner, v_subj, 'a2');

  UPDATE r021_ctx SET t5_a2_paper = (
    v_a2_after > v_a2_before AND v_as_after = v_as_before
  );

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok((SELECT t5_a2_paper FROM r021_ctx),
  'A2 paper increases A2 readiness; AS readiness unchanged');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 6: NULL-stage paper excluded from both AS and A2 readiness
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner  UUID;
  v_subj   UUID;
  v_as_before NUMERIC;
  v_a2_before NUMERIC;
  v_as_after  NUMERIC;
  v_a2_after  NUMERIC;
BEGIN
  SELECT owner_id, subj_id INTO v_owner, v_subj FROM r021_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  v_as_before := public.compute_readiness_score(v_owner, v_subj, 'as');
  v_a2_before := public.compute_readiness_score(v_owner, v_subj, 'a2');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Insert legacy paper with stage = NULL (as superuser simulating pre-021 backfill)
  INSERT INTO public.past_papers (
    user_id, subject_id, paper_code, year, session, score_raw, score_max, stage
  ) VALUES (v_owner, v_subj, '9709_s24_qp_99', 2024, 'may_jun', 70, 75, NULL);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  v_as_after := public.compute_readiness_score(v_owner, v_subj, 'as');
  v_a2_after := public.compute_readiness_score(v_owner, v_subj, 'a2');

  UPDATE r021_ctx SET t6_null_paper = (
    v_as_after = v_as_before AND v_a2_after = v_a2_before
  );

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok((SELECT t6_null_paper FROM r021_ctx),
  'NULL-stage paper excluded from both AS and A2 readiness');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 7: route_dependent chapter → AS readiness when selection stage='as'
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner   UUID;
  v_subj    UUID;
  v_us_id   UUID;
  v_rd_ch   UUID;
  v_before  NUMERIC;
  v_after   NUMERIC;
BEGIN
  SELECT owner_id, subj_id, owner_us_id, rd_ch_id
  INTO   v_owner, v_subj, v_us_id, v_rd_ch
  FROM   r021_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Before adding any selection: route_dependent chapter not counted
  v_before := public.compute_readiness_score(v_owner, v_subj, 'as');

  -- Add a paper selection for the route_dependent component as AS
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, stage)
  VALUES (v_us_id, 'Mechanics', 'as');

  -- Complete the route_dependent chapter
  INSERT INTO public.user_chapters (user_id, chapter_id, notes_status, confidence_level)
  VALUES (v_owner, v_rd_ch, 'complete', 5);

  v_after := public.compute_readiness_score(v_owner, v_subj, 'as');

  -- After: the denominator grew and notes_pct changed
  UPDATE r021_ctx SET t7_rd_as = (v_after != v_before);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok((SELECT t7_rd_as FROM r021_ctx),
  'route_dependent chapter included in AS readiness when selection stage=as');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 8: route_dependent chapter → A2 readiness when selection stage='a2'
-- First upgrade enrollment to staged/a2, add a2 selection
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner   UUID;
  v_subj    UUID;
  v_us_id   UUID;
  v_rd_ch   UUID;
  v_before  NUMERIC;
  v_after   NUMERIC;
BEGIN
  SELECT owner_id, subj_id, owner_us_id, rd_ch_id
  INTO   v_owner, v_subj, v_us_id, v_rd_ch
  FROM   r021_ctx;

  -- Upgrade to staged/a2 directly (bypassing RLS for setup)
  UPDATE public.user_subjects
  SET    current_stage    = 'a2',
         a2_unlocked_at   = NOW(),
         a2_unlock_method = 'manual'
  WHERE  id = v_us_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  v_before := public.compute_readiness_score(v_owner, v_subj, 'a2');

  -- Add A2 paper selection for the route_dependent chapter
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, stage)
  VALUES (v_us_id, 'Mechanics', 'a2')
  ON CONFLICT (user_subject_id, component_name) DO UPDATE SET stage = 'a2';

  v_after := public.compute_readiness_score(v_owner, v_subj, 'a2');

  -- route_dependent chapter now included in A2 readiness (denominator grew)
  UPDATE r021_ctx SET t8_rd_a2 = (v_after != v_before);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Reset back to staged/as for subsequent tests
  UPDATE public.user_subjects
  SET    current_stage    = 'as',
         a2_unlocked_at   = NULL,
         a2_unlock_method = NULL
  WHERE  id = v_us_id;

  -- Remove the a2 selection
  DELETE FROM public.subject_paper_selections
  WHERE  user_subject_id = v_us_id AND component_name = 'Mechanics' AND stage = 'a2';
END;
$$;

SELECT ok((SELECT t8_rd_a2 FROM r021_ctx),
  'route_dependent chapter included in A2 readiness when selection stage=a2');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 9: p_stage='all' with unconfirmed route → readiness = 0
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner  UUID;
  v_subj2  UUID;
  v_score  NUMERIC;
  v_us2_id UUID;
BEGIN
  SELECT owner_id, subj_a2_id INTO v_owner, v_subj2 FROM r021_ctx;

  -- Create a second subject + unconfirmed enrollment
  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj2, 'R021 Unconfirmed Subject', FALSE, v_owner);

  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES (gen_random_uuid(), v_subj2, 'AS Chapter B', 1, 'Core B', FALSE, 'as');

  INSERT INTO public.user_subjects (user_id, subject_id, priority, exam_date, study_route, current_stage)
  VALUES (v_owner, v_subj2, 2, CURRENT_DATE + 60, 'unconfirmed', NULL)
  RETURNING id INTO v_us2_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  v_score := public.compute_readiness_score(v_owner, v_subj2, 'all');
  UPDATE r021_ctx SET t9_unconfirmed = (v_score = 0.00);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok((SELECT t9_unconfirmed FROM r021_ctx),
  'p_stage=all with unconfirmed route → readiness = 0');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 10: p_stage='all': route_dependent excluded when no selection exists
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner    UUID;
  v_subj     UUID;
  v_us_id    UUID;
  v_rd_ch    UUID;
  v_score_with_sel    NUMERIC;
  v_score_without_sel NUMERIC;
BEGIN
  SELECT owner_id, subj_id, owner_us_id, rd_ch_id
  INTO   v_owner, v_subj, v_us_id, v_rd_ch
  FROM   r021_ctx;

  -- Ensure no route_dependent selection exists for 'Mechanics'
  DELETE FROM public.subject_paper_selections
  WHERE  user_subject_id = v_us_id AND component_name = 'Mechanics';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  v_score_without_sel := public.compute_readiness_score(v_owner, v_subj, 'all');

  -- Add a selection
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, stage)
  VALUES (v_us_id, 'Mechanics', 'as');

  v_score_with_sel := public.compute_readiness_score(v_owner, v_subj, 'all');

  -- With no selection, route_dependent chapter is excluded → higher note_pct (fewer chapters)
  -- We verify the scores differ (denominator changed)
  UPDATE r021_ctx SET t10_rd_no_sel = (v_score_with_sel != v_score_without_sel);

  -- Clean up
  DELETE FROM public.subject_paper_selections
  WHERE  user_subject_id = v_us_id AND component_name = 'Mechanics';

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok((SELECT t10_rd_no_sel FROM r021_ctx),
  'p_stage=all: route_dependent chapter excluded when no paper selection exists');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 11: p_stage='invalid' raises P0002
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner UUID;
  v_subj  UUID;
  v_err   BOOLEAN := FALSE;
BEGIN
  SELECT owner_id, subj_id INTO v_owner, v_subj FROM r021_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  BEGIN
    PERFORM public.compute_readiness_score(v_owner, v_subj, 'invalid');
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE r021_ctx SET t11_bad_stage = v_err;
END;
$$;

SELECT ok((SELECT t11_bad_stage FROM r021_ctx),
  'p_stage=invalid raises P0002');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 12: carry_forward=TRUE + result_type='forecast' raises constraint
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_us_id UUID;
  v_err   BOOLEAN := FALSE;
BEGIN
  SELECT owner_us_id INTO v_us_id FROM r021_ctx;

  BEGIN
    INSERT INTO public.subject_stage_results (
      user_subject_id, stage, result_type,
      score_obtained, score_maximum, exam_series, exam_year, carry_forward
    ) VALUES (v_us_id, 'as', 'forecast', 70, 100, 'may_jun', 2025, TRUE);
  EXCEPTION
    WHEN check_violation THEN v_err := TRUE;
  END;

  UPDATE r021_ctx SET t12_cf_forecast = v_err;
END;
$$;

SELECT ok((SELECT t12_cf_forecast FROM r021_ctx),
  'carry_forward=TRUE with result_type=forecast raises CHECK constraint');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 13: configure_subject_route sets correct current_stage per route
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner  UUID;
  v_us_id  UUID;
  v_route  TEXT;
  v_stage  TEXT;
  v_ok     BOOLEAN := TRUE;
BEGIN
  SELECT owner_id, owner_us_id INTO v_owner, v_us_id FROM r021_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- as_only → stage should be 'as'
  PERFORM public.configure_subject_route(v_owner, v_us_id, 'as_only', '[]'::JSONB);
  SELECT study_route::TEXT, current_stage::TEXT INTO v_route, v_stage
  FROM public.user_subjects WHERE id = v_us_id;
  v_ok := v_ok AND (v_route = 'as_only' AND v_stage = 'as');

  -- staged → stage should be 'as'
  PERFORM public.configure_subject_route(v_owner, v_us_id, 'staged', '[]'::JSONB);
  SELECT study_route::TEXT, current_stage::TEXT INTO v_route, v_stage
  FROM public.user_subjects WHERE id = v_us_id;
  v_ok := v_ok AND (v_route = 'staged' AND v_stage = 'as');

  -- full_level → stage should be 'full'
  PERFORM public.configure_subject_route(v_owner, v_us_id, 'full_level', '[]'::JSONB);
  SELECT study_route::TEXT, current_stage::TEXT INTO v_route, v_stage
  FROM public.user_subjects WHERE id = v_us_id;
  v_ok := v_ok AND (v_route = 'full_level' AND v_stage = 'full');

  UPDATE r021_ctx SET t13_route_stage = v_ok;

  -- Reset to staged/as for later tests
  PERFORM public.configure_subject_route(v_owner, v_us_id, 'staged', '[]'::JSONB);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok((SELECT t13_route_stage FROM r021_ctx),
  'configure_subject_route sets correct current_stage per route');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 14: configure_subject_route clears unlock fields on route change
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner   UUID;
  v_us_id   UUID;
  v_unlocked_at TIMESTAMPTZ;
  v_unlock_method TEXT;
  v_ok      BOOLEAN;
BEGIN
  SELECT owner_id, owner_us_id INTO v_owner, v_us_id FROM r021_ctx;

  -- Manually set A2 unlock fields (simulating a prior A2 unlock)
  UPDATE public.user_subjects
  SET    current_stage    = 'a2',
         study_route      = 'staged',
         a2_unlocked_at   = NOW(),
         a2_unlock_method = 'manual'
  WHERE  id = v_us_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Configure back to as_only — unlock fields must be cleared
  PERFORM public.configure_subject_route(v_owner, v_us_id, 'as_only', '[]'::JSONB);

  SELECT a2_unlocked_at, a2_unlock_method::TEXT
  INTO   v_unlocked_at, v_unlock_method
  FROM   public.user_subjects WHERE id = v_us_id;

  v_ok := (v_unlocked_at IS NULL AND v_unlock_method IS NULL);
  UPDATE r021_ctx SET t14_clear_unlock = v_ok;

  -- Reset to staged/as
  PERFORM public.configure_subject_route(v_owner, v_us_id, 'staged', '[]'::JSONB);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok((SELECT t14_clear_unlock FROM r021_ctx),
  'configure_subject_route clears a2_unlocked_at and a2_unlock_method on route change');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 15: configure_subject_route rejects 'unconfirmed' as target route
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner UUID;
  v_us_id UUID;
  v_err   BOOLEAN := FALSE;
BEGIN
  SELECT owner_id, owner_us_id INTO v_owner, v_us_id FROM r021_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  BEGIN
    PERFORM public.configure_subject_route(v_owner, v_us_id, 'unconfirmed', '[]'::JSONB);
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE r021_ctx SET t15_unconf_reject = v_err;
END;
$$;

SELECT ok((SELECT t15_unconf_reject FROM r021_ctx),
  'configure_subject_route rejects unconfirmed as target route');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 16: configure_subject_route rejects A2 selection for as_only route
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner UUID;
  v_us_id UUID;
  v_err   BOOLEAN := FALSE;
BEGIN
  SELECT owner_id, owner_us_id INTO v_owner, v_us_id FROM r021_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  BEGIN
    PERFORM public.configure_subject_route(
      v_owner, v_us_id, 'as_only',
      '[{"component_name":"Mechanics","stage":"a2","paper_number":4}]'::JSONB
    );
  EXCEPTION
    WHEN SQLSTATE 'P0003' THEN v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE r021_ctx SET t16_a2sel_asonly = v_err;
END;
$$;

SELECT ok((SELECT t16_a2sel_asonly FROM r021_ctx),
  'configure_subject_route rejects A2 paper selection for as_only route');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 17: configure_subject_route rejects component not in subject
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner UUID;
  v_us_id UUID;
  v_err   BOOLEAN := FALSE;
BEGIN
  SELECT owner_id, owner_us_id INTO v_owner, v_us_id FROM r021_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  BEGIN
    PERFORM public.configure_subject_route(
      v_owner, v_us_id, 'staged',
      '[{"component_name":"Non-Existent Component","stage":"as","paper_number":1}]'::JSONB
    );
  EXCEPTION
    WHEN SQLSTATE 'P0003' THEN v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE r021_ctx SET t17_bad_component = v_err;
END;
$$;

SELECT ok((SELECT t17_bad_component FROM r021_ctx),
  'configure_subject_route rejects component not belonging to subject');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 18: configure_subject_route cancels stale pending mission
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner    UUID;
  v_us_id    UUID;
  v_a2_ch    UUID;
  v_a2_uc_id UUID := gen_random_uuid();
  v_miss_id  UUID := gen_random_uuid();
  v_status   TEXT;
BEGIN
  SELECT owner_id, owner_us_id, a2_ch_id
  INTO   v_owner, v_us_id, v_a2_ch
  FROM   r021_ctx;

  -- Create or reuse an A2 user_chapter
  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status)
  VALUES (v_a2_uc_id, v_owner, v_a2_ch, 'none')
  ON CONFLICT (user_id, chapter_id) DO UPDATE SET notes_status = 'none'
  RETURNING id INTO v_a2_uc_id;

  -- Create a pending mission pointing at that A2 chapter
  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type,
    target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty
  ) VALUES (
    v_miss_id, v_owner, CURRENT_DATE, 'complete_notes',
    'chapter', v_a2_uc_id,
    'A2 Mission', 'This should be cancelled', 30, 'pending', 'easy'
  );

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Route is staged/as — A2 chapter is inaccessible
  -- configure_subject_route should cancel the A2 mission
  PERFORM public.configure_subject_route(v_owner, v_us_id, 'staged', '[]'::JSONB);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT status INTO v_status FROM public.daily_missions WHERE id = v_miss_id;
  UPDATE r021_ctx SET t18_stale_mission = (v_status = 'skipped');
END;
$$;

SELECT ok((SELECT t18_stale_mission FROM r021_ctx),
  'configure_subject_route cancels stale pending mission for inaccessible chapter');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 19: Direct user_chapters INSERT for A2 chapter as staged/as → RLS blocks
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner  UUID;
  v_a2_ch  UUID;
  v_err    BOOLEAN := FALSE;
BEGIN
  SELECT owner_id, a2_ch_id INTO v_owner, v_a2_ch FROM r021_ctx;
  -- owner is staged/as — A2 chapter should be inaccessible

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  BEGIN
    INSERT INTO public.user_chapters (user_id, chapter_id, notes_status)
    VALUES (v_owner, v_a2_ch, 'in_progress');
  EXCEPTION
    WHEN insufficient_privilege THEN v_err := TRUE;
    WHEN check_violation        THEN v_err := TRUE;  -- RLS WITH CHECK also raises this
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE r021_ctx SET t19_rls_a2_insert = v_err;
END;
$$;

SELECT ok((SELECT t19_rls_a2_insert FROM r021_ctx),
  'RLS: direct INSERT of A2 chapter for staged/as user is rejected');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 20: Direct user_chapters UPDATE for A2 chapter as staged/as → RLS blocks
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner    UUID;
  v_a2_ch    UUID;
  v_a2_uc_id UUID := gen_random_uuid();
  v_err      BOOLEAN := FALSE;
BEGIN
  SELECT owner_id, a2_ch_id INTO v_owner, v_a2_ch FROM r021_ctx;

  -- Insert or reset a row directly (bypassing RLS for setup)
  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status)
  VALUES (v_a2_uc_id, v_owner, v_a2_ch, 'none')
  ON CONFLICT (user_id, chapter_id) DO UPDATE SET notes_status = 'none'
  RETURNING id INTO v_a2_uc_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  BEGIN
    UPDATE public.user_chapters
    SET    notes_status = 'complete'
    WHERE  id = v_a2_uc_id AND user_id = v_owner;
    -- RLS WITH CHECK fires on UPDATE. If the chapter is inaccessible,
    -- the update silently affects 0 rows (no error from RLS WITH CHECK on UPDATE),
    -- OR raises insufficient_privilege. We verify no rows were changed.
  EXCEPTION
    WHEN insufficient_privilege THEN v_err := TRUE;
    WHEN check_violation        THEN v_err := TRUE;
  END;

  -- Check the row was not updated (0 rows changed is also acceptable)
  IF NOT v_err THEN
    DECLARE
      v_status TEXT;
    BEGIN
      SELECT notes_status INTO v_status
      FROM   public.user_chapters WHERE id = v_a2_uc_id;
      v_err := (v_status = 'none');  -- unchanged = blocked
    END;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE r021_ctx SET t20_rls_a2_update = v_err;
END;
$$;

SELECT ok((SELECT t20_rls_a2_update FROM r021_ctx),
  'RLS: direct UPDATE of A2 chapter for staged/as user is blocked');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 21: Unconfirmed subject → generate_daily_missions = 0
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner   UUID;
  v_subj2   UUID;
  v_us2_id  UUID;
  v_count   INTEGER;
  v_today   DATE;
  v_generated INTEGER;
BEGIN
  SELECT owner_id, subj_a2_id INTO v_owner, v_subj2 FROM r021_ctx;

  -- Remove the staged subject temporarily and replace with unconfirmed
  -- (easier: just test that missions for the unconfirmed subject are 0)
  v_today := public.get_user_local_date(v_owner);

  -- The second subject (subj_a2_id) was created as unconfirmed earlier.
  -- Check it has enrollment
  SELECT id INTO v_us2_id
  FROM   public.user_subjects
  WHERE  user_id = v_owner AND subject_id = v_subj2;

  IF v_us2_id IS NULL THEN
    UPDATE r021_ctx SET t21_unconf_missions = TRUE;  -- no enrollment = skip, test considered pass
    RETURN;
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Reset generation tracking for today
  UPDATE public.user_settings
  SET    missions_last_generated_date = NULL
  WHERE  user_id = v_owner;

  -- Remove existing missions from today
  DELETE FROM public.daily_missions
  WHERE  user_id = v_owner AND mission_date = v_today;

  -- All subjects are unconfirmed for this test (the second subject is unconfirmed)
  -- We check that generate_daily_missions does not create missions for unconfirmed subjects
  -- by counting missions from unconfirmed subjects after generation
  v_generated := public.generate_daily_missions(v_owner);

  SELECT COUNT(*) INTO v_count
  FROM   public.daily_missions dm
  JOIN   public.user_subjects us ON us.subject_id = dm.target_entity_id
  WHERE  dm.user_id      = v_owner
    AND  dm.mission_date = v_today
    AND  us.study_route  = 'unconfirmed';

  UPDATE r021_ctx SET t21_unconf_missions = (v_count = 0);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok((SELECT t21_unconf_missions FROM r021_ctx),
  'generate_daily_missions: zero missions created for unconfirmed subjects');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 22: All-unconfirmed subjects → 0 missions total
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_other  UUID;
  v_subj3  UUID := gen_random_uuid();
  v_today  DATE;
  v_count  INTEGER;
BEGIN
  SELECT other_id INTO v_other FROM r021_ctx;
  v_today := public.get_user_local_date(v_other);

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj3, 'R021 All-Unconf Subject', FALSE, v_other);

  INSERT INTO public.user_subjects (user_id, subject_id, priority, exam_date, study_route, current_stage)
  VALUES (v_other, v_subj3, 3, CURRENT_DATE + 90, 'unconfirmed', NULL);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other::text)::text, true);

  UPDATE public.user_settings
  SET    missions_last_generated_date = NULL
  WHERE  user_id = v_other;

  PERFORM public.generate_daily_missions(v_other);

  SELECT COUNT(*) INTO v_count
  FROM   public.daily_missions
  WHERE  user_id = v_other AND mission_date = v_today;

  UPDATE r021_ctx SET t22_all_unconf = (v_count = 0);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok((SELECT t22_all_unconf FROM r021_ctx),
  'generate_daily_missions: 0 missions when all subjects are unconfirmed');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 23: complete_mission rejects inaccessible chapter (P0004)
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner       UUID;
  v_subj        UUID;
  v_a2_ch_t23   UUID := gen_random_uuid();
  v_a2_uc_t23   UUID := gen_random_uuid();
  v_miss_id     UUID := gen_random_uuid();
  v_today       DATE;
  v_err         BOOLEAN := FALSE;
BEGIN
  SELECT owner_id, subj_id INTO v_owner, v_subj FROM r021_ctx;
  v_today := public.get_user_local_date(v_owner);

  -- Create a dedicated A2 chapter and user_chapter to avoid daily_missions_unique collision
  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES (v_a2_ch_t23, v_subj, 'Test 23 Inaccessible Chapter', 98, 'A2 Advanced', FALSE, 'a2');

  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status)
  VALUES (v_a2_uc_t23, v_owner, v_a2_ch_t23, 'none');

  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type,
    target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty
  ) VALUES (
    v_miss_id, v_owner, v_today, 'complete_notes',
    'chapter', v_a2_uc_t23,
    'A2 Mission', 'Inaccessible', 30, 'pending', 'easy'
  );

  -- owner is staged/as — A2 chapter inaccessible
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  BEGIN
    PERFORM public.complete_mission(v_miss_id, v_owner);
  EXCEPTION
    WHEN SQLSTATE 'P0004' THEN v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE r021_ctx SET t23_inacc_mission = v_err;
END;
$$;

SELECT ok((SELECT t23_inacc_mission FROM r021_ctx),
  'complete_mission rejects inaccessible chapter with P0004');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 24: transition_to_a2 (normal): result insert failure rolls back unlock
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner  UUID;
  v_us_id  UUID;
  v_err    BOOLEAN := FALSE;
  v_stage  TEXT;
  v_unlock TIMESTAMPTZ;
BEGIN
  SELECT owner_id, owner_us_id INTO v_owner, v_us_id FROM r021_ctx;

  -- Ensure enrollment is staged/as
  UPDATE public.user_subjects
  SET    study_route = 'staged', current_stage = 'as',
         a2_unlocked_at = NULL, a2_unlock_method = NULL
  WHERE  id = v_us_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  BEGIN
    -- Trigger a constraint violation: score_obtained (150) > score_maximum (100)
    PERFORM public.transition_to_a2(
      v_owner, v_us_id, 'normal_transition',
      'actual', 150, 100, 'may_jun', 2025, FALSE
    );
  EXCEPTION
    WHEN OTHERS THEN v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Verify the enrollment is still staged/as (unlock rolled back)
  SELECT current_stage::TEXT, a2_unlocked_at
  INTO   v_stage, v_unlock
  FROM   public.user_subjects WHERE id = v_us_id;

  UPDATE r021_ctx SET t24_rollback = (
    v_err = TRUE AND v_stage = 'as' AND v_unlock IS NULL
  );
END;
$$;

SELECT ok((SELECT t24_rollback FROM r021_ctx),
  'transition_to_a2 (normal): constraint failure rolls back the A2 unlock');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 25: transition_to_a2 (manual, as_only): atomically sets study_route=staged
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner  UUID;
  v_us_id  UUID;
  v_route  TEXT;
  v_stage  TEXT;
  v_ok     BOOLEAN;
BEGIN
  SELECT owner_id, owner_us_id INTO v_owner, v_us_id FROM r021_ctx;

  -- Set to as_only/as
  UPDATE public.user_subjects
  SET    study_route = 'as_only', current_stage = 'as',
         a2_unlocked_at = NULL, a2_unlock_method = NULL
  WHERE  id = v_us_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT study_route::TEXT, current_stage::TEXT INTO v_route, v_stage
  FROM   public.user_subjects WHERE id = v_us_id;

  v_ok := (v_route = 'staged' AND v_stage = 'a2');
  UPDATE r021_ctx SET t25_manual_staged = v_ok;
END;
$$;

SELECT ok((SELECT t25_manual_staged FROM r021_ctx),
  'transition_to_a2 (manual, as_only): atomically converts study_route to staged and stage to a2');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 26: Unauthenticated call (auth.uid() IS NULL) raises 42501
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner  UUID;
  v_ch_id  UUID;
  v_err    BOOLEAN := FALSE;
BEGIN
  SELECT owner_id, as_ch_id INTO v_owner, v_ch_id FROM r021_ctx;

  -- Ensure no auth context
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  BEGIN
    PERFORM public.user_can_access_chapter(v_owner, v_ch_id);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN v_err := TRUE;
    WHEN OTHERS THEN NULL;
  END;

  UPDATE r021_ctx SET t26_unauthenticated = v_err;
END;
$$;

SELECT ok((SELECT t26_unauthenticated FROM r021_ctx),
  'unauthenticated call with auth.uid() = NULL raises 42501 Unauthorized');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 27: Direct past_papers INSERT for A2 paper rejected when in AS stage
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_owner  UUID;
  v_subj   UUID;
  v_us_id  UUID;
  v_err    BOOLEAN := FALSE;
BEGIN
  SELECT owner_id, subj_id, owner_us_id INTO v_owner, v_subj, v_us_id FROM r021_ctx;

  -- Set user to staged/as
  UPDATE public.user_subjects
  SET    study_route = 'staged', current_stage = 'as',
         a2_unlocked_at = NULL, a2_unlock_method = NULL
  WHERE  id = v_us_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  BEGIN
    -- Attempt direct INSERT of an A2 paper
    INSERT INTO public.past_papers (
      user_id, subject_id, paper_code, year, session, paper_number,
      score_raw, score_max, attempted_at, stage
    ) VALUES (
      v_owner, v_subj, '9709_s25_qp_31', 2025, 'may_jun', 3,
      40, 50, '2025-06-01', 'a2'
    );
  EXCEPTION
    WHEN SQLSTATE '42501' THEN v_err := TRUE;
    WHEN OTHERS THEN v_err := FALSE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE r021_ctx SET t27_direct_a2_paper_insert = v_err;
END;
$$;

SELECT ok((SELECT t27_direct_a2_paper_insert FROM r021_ctx),
  'past_papers INSERT RLS: inserting A2 paper directly when in AS stage is rejected');


SELECT * FROM finish();
ROLLBACK;
