-- ============================================================
-- DATABASE TESTS: Route Remap Integrity & Stage Preservation (Migration 028)
--
-- Run via: supabase test db
-- All changes roll back — no data is persisted.
--
-- Tests (23):
--   1.  Physics 9702 AS-only -> A2 transition automatically assigns canonical 5-paper staged set
--   2.  Chemistry 9701 AS-only -> A2 transition automatically assigns canonical 5-paper staged set
--   3.  Computer Science 9618 AS-only -> A2 transition automatically assigns canonical 4-paper staged set
--   4.  Mathematics 9709 p1_m1 AS-only -> A2 transition automatically maps to mech_stats
--   5.  Mathematics 9709 p1_s1 AS-only -> A2 transition automatically maps to stats_mech
--   6.  Mathematics 9709 p1_p2 AS-only -> A2 transition without selections raises P0003 error
--   7.  Mathematics 9709 p1_p2 AS-only -> A2 transition WITH explicit valid staged selections succeeds
--   8.  Further Mathematics 9231 fp1_fm AS-only -> A2 transition automatically maps to fm_fps
--   9.  Further Mathematics 9231 fp1_fps AS-only -> A2 transition automatically maps to fps_fm
--  10.  configure_subject_route preserves current_stage='a2', a2_unlocked_at, and a2_unlock_method on staged re-save
--  11.  configure_subject_route preserves A2 stage when switching paper combinations within staged route
--  12.  configure_subject_route clears A2 stage and unlock metadata when changing route to as_only
--  13.  transition_to_a2 atomic rollback: constraint or paper error leaves enrollment untouched
--  14.  transition_to_a2 rejects non-owner with 42501 Unauthorized
--  15.  configure_subject_route rejects non-owner with 42501 Unauthorized
--  16.  anon role cannot execute transition_to_a2 or configure_subject_route
--  17.  Mathematics 9709 p1_s1 AS-only -> A2 transition WITH explicit stats_double combination succeeds
--  18.  transition_to_a2 rejects incompatible target that replaces existing AS paper and rolls back
--  19.  transition_to_a2 rejects paper-selection replacement from already-staged enrollment
--  20.  transition_to_a2 on already-staged enrollment omitting selections succeeds and preserves papers
--  21.  Known/catalogued subject marked unavailable still receives canonical staged mapping
--  22.  Custom/no-route subject transitions with omitted selections while preserving existing papers
--  23.  Custom/no-route subject supplying replacement selections is rejected atomically with no route, stage, or paper changes
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(23);

-- ─── CONTEXT TABLE ─────────────────────────────────────────────────────────
CREATE TEMP TABLE r028_ctx (
  owner_id UUID NOT NULL,
  other_id UUID NOT NULL,
  t1_physics_staged_papers       BOOLEAN DEFAULT FALSE,
  t2_chem_staged_papers          BOOLEAN DEFAULT FALSE,
  t3_cs_staged_papers            BOOLEAN DEFAULT FALSE,
  t4_maths_p1m1_to_mech_stats    BOOLEAN DEFAULT FALSE,
  t5_maths_p1s1_to_stats_mech    BOOLEAN DEFAULT FALSE,
  t6_maths_p1p2_blocked          BOOLEAN DEFAULT FALSE,
  t7_maths_p1p2_with_combo       BOOLEAN DEFAULT FALSE,
  t8_fm_fp1fm_to_fmfps           BOOLEAN DEFAULT FALSE,
  t9_fm_fp1fps_to_fpsfm          BOOLEAN DEFAULT FALSE,
  t10_staged_a2_preserved        BOOLEAN DEFAULT FALSE,
  t11_staged_combo_preserved     BOOLEAN DEFAULT FALSE,
  t12_staged_to_as_cleared       BOOLEAN DEFAULT FALSE,
  t13_rollback_verified          BOOLEAN DEFAULT FALSE,
  t14_unauthorized_transition    BOOLEAN DEFAULT FALSE,
  t15_unauthorized_config        BOOLEAN DEFAULT FALSE,
  t16_anon_revoked               BOOLEAN DEFAULT FALSE,
  t17_maths_p1s1_to_stats_double BOOLEAN DEFAULT FALSE,
  t18_reject_as_replacement      BOOLEAN DEFAULT FALSE,
  t19_reject_selections_on_staged BOOLEAN DEFAULT FALSE,
  t20_omit_selections_on_staged  BOOLEAN DEFAULT FALSE,
  t21_catalogued_unavailable_staged BOOLEAN DEFAULT FALSE,
  t22_custom_no_route_preserved  BOOLEAN DEFAULT FALSE,
  t23_custom_replacement_rejected BOOLEAN DEFAULT FALSE
) ON COMMIT DROP;

INSERT INTO r028_ctx (owner_id, other_id) VALUES (
  '02800001-0000-0000-0000-000000000001',
  '02800001-0000-0000-0000-000000000002'
);

-- ─── SETUP: Synthetic Users ────────────────────────────────────────────────
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_other UUID := '02800001-0000-0000-0000-000000000002';
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (v_owner, 'authenticated', 'authenticated', 'r028-owner@example.com'),
    (v_other, 'authenticated', 'authenticated', 'r028-other@example.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, username, full_name, email) VALUES
    (v_owner, 'r028owner', 'R028 Owner', 'r028-owner@example.com'),
    (v_other, 'r028other', 'R028 Other', 'r028-other@example.com')
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ─── TEST 1: Physics 9702 AS-only -> A2 transition ─────────────────────────
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_paper_count INT;
  v_route TEXT;
  v_stage TEXT;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9702';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  -- Initial AS papers
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'as_only';

  -- Transition to A2 via service role / authenticated
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT study_route::TEXT, current_stage::TEXT INTO v_route, v_stage
  FROM public.user_subjects WHERE id = v_us_id;

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  UPDATE r028_ctx SET t1_physics_staged_papers = (
    v_route = 'staged' AND v_stage = 'a2' AND v_paper_count = 5
  );
END;
$$;

SELECT ok((SELECT t1_physics_staged_papers FROM r028_ctx),
  'Physics 9702: AS-only to A2 automatically assigns canonical 5-paper staged set');

-- ─── TEST 2: Chemistry 9701 AS-only -> A2 transition ───────────────────────
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_paper_count INT;
  v_route TEXT;
  v_stage TEXT;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9701';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'as_only';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT study_route::TEXT, current_stage::TEXT INTO v_route, v_stage
  FROM public.user_subjects WHERE id = v_us_id;

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  UPDATE r028_ctx SET t2_chem_staged_papers = (
    v_route = 'staged' AND v_stage = 'a2' AND v_paper_count = 5
  );
END;
$$;

SELECT ok((SELECT t2_chem_staged_papers FROM r028_ctx),
  'Chemistry 9701: AS-only to A2 automatically assigns canonical 5-paper staged set');

-- ─── TEST 3: Computer Science 9618 AS-only -> A2 transition ─────────────────
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_paper_count INT;
  v_route TEXT;
  v_stage TEXT;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9618';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'as_only';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT study_route::TEXT, current_stage::TEXT INTO v_route, v_stage
  FROM public.user_subjects WHERE id = v_us_id;

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  UPDATE r028_ctx SET t3_cs_staged_papers = (
    v_route = 'staged' AND v_stage = 'a2' AND v_paper_count = 4
  );
END;
$$;

SELECT ok((SELECT t3_cs_staged_papers FROM r028_ctx),
  'Computer Science 9618: AS-only to A2 automatically assigns canonical 4-paper staged set');

-- ─── TEST 4: Maths 9709 p1_m1 AS-only -> A2 transition maps to mech_stats ──
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_paper_count INT;
  v_has_p1 BOOLEAN;
  v_has_m1 BOOLEAN;
  v_has_p3 BOOLEAN;
  v_has_s1 BOOLEAN;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9709';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  -- p1_m1 papers: Pure 1 (1) & Mechanics (4)
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'as_only' AND svr.combination_key = 'p1_m1';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  SELECT
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND paper_number = 1 AND stage = 'as'),
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND paper_number = 4 AND stage = 'as'),
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND paper_number = 3 AND stage = 'a2'),
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND paper_number = 5 AND stage = 'a2')
  INTO v_has_p1, v_has_m1, v_has_p3, v_has_s1;

  UPDATE r028_ctx SET t4_maths_p1m1_to_mech_stats = (
    v_paper_count = 4 AND v_has_p1 AND v_has_m1 AND v_has_p3 AND v_has_s1
  );
END;
$$;

SELECT ok((SELECT t4_maths_p1m1_to_mech_stats FROM r028_ctx),
  'Mathematics 9709: p1_m1 AS-only auto-resolves to staged mech_stats (Papers 1, 4, 3, 5)');

-- ─── TEST 5: Maths 9709 p1_s1 AS-only -> A2 transition maps to stats_mech ──
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_paper_count INT;
  v_has_p1 BOOLEAN;
  v_has_s1_as BOOLEAN;
  v_has_p3 BOOLEAN;
  v_has_m1_a2 BOOLEAN;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9709';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  -- p1_s1 papers: Pure 1 (1) & Statistics 1 (5)
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'as_only' AND svr.combination_key = 'p1_s1';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  SELECT
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND paper_number = 1 AND stage = 'as'),
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND paper_number = 5 AND stage = 'as'),
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND paper_number = 3 AND stage = 'a2'),
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND paper_number = 4 AND stage = 'a2')
  INTO v_has_p1, v_has_s1_as, v_has_p3, v_has_m1_a2;

  UPDATE r028_ctx SET t5_maths_p1s1_to_stats_mech = (
    v_paper_count = 4 AND v_has_p1 AND v_has_s1_as AND v_has_p3 AND v_has_m1_a2
  );
END;
$$;

SELECT ok((SELECT t5_maths_p1s1_to_stats_mech FROM r028_ctx),
  'Mathematics 9709: p1_s1 AS-only auto-resolves to staged stats_mech (Papers 1, 5, 3, 4)');

-- ─── TEST 6: Maths 9709 p1_p2 AS-only blocked without selections ───────────
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_err_msg TEXT;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9709';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  -- p1_p2 papers: Pure 1 (1) & Pure 2 (2)
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'as_only' AND svr.combination_key = 'p1_p2';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  BEGIN
    PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');
  EXCEPTION
    WHEN OTHERS THEN
      v_err_msg := SQLERRM;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE r028_ctx SET t6_maths_p1p2_blocked = (
    v_err_msg LIKE '%Mathematics p1_p2 must select a valid staged paper combination%'
  );
END;
$$;

SELECT ok((SELECT t6_maths_p1p2_blocked FROM r028_ctx),
  'Mathematics 9709: p1_p2 AS-only transition is blocked without valid staged paper selections');

-- ─── TEST 7: Maths 9709 p1_p2 with explicit valid selection succeeds ────────
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_paper_count INT;
  v_has_s2 BOOLEAN;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9709';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'as_only' AND svr.combination_key = 'p1_p2';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Provide explicit valid staged selection: stats_double (Papers 1, 5 [as], 3, 6 [a2])
  PERFORM public.transition_to_a2(
    v_owner,
    v_us_id,
    'manual',
    NULL, NULL, NULL, NULL, NULL, FALSE,
    jsonb_build_array(
      jsonb_build_object('component_name', 'Pure 1', 'paper_number', 1, 'stage', 'as'),
      jsonb_build_object('component_name', 'Statistics 1', 'paper_number', 5, 'stage', 'as'),
      jsonb_build_object('component_name', 'Pure 3', 'paper_number', 3, 'stage', 'a2'),
      jsonb_build_object('component_name', 'Statistics 2', 'paper_number', 6, 'stage', 'a2')
    )
  );

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  SELECT EXISTS (
    SELECT 1 FROM public.subject_paper_selections
    WHERE user_subject_id = v_us_id AND paper_number = 6 AND stage = 'a2'
  ) INTO v_has_s2;

  UPDATE r028_ctx SET t7_maths_p1p2_with_combo = (
    v_paper_count = 4 AND v_has_s2
  );
END;
$$;

SELECT ok((SELECT t7_maths_p1p2_with_combo FROM r028_ctx),
  'Mathematics 9709: p1_p2 AS-only transition succeeds when explicit valid staged combination is supplied');

-- ─── TEST 8: Further Maths 9231 fp1_fm -> fm_fps ───────────────────────────
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_paper_count INT;
  v_has_fp2 BOOLEAN;
  v_has_fps BOOLEAN;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9231';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'as_only' AND svr.combination_key = 'fp1_fm';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  SELECT
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND paper_number = 2 AND stage = 'a2'),
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND paper_number = 4 AND stage = 'a2')
  INTO v_has_fp2, v_has_fps;

  UPDATE r028_ctx SET t8_fm_fp1fm_to_fmfps = (
    v_paper_count = 4 AND v_has_fp2 AND v_has_fps
  );
END;
$$;

SELECT ok((SELECT t8_fm_fp1fm_to_fmfps FROM r028_ctx),
  'Further Maths 9231: fp1_fm AS-only auto-resolves to fm_fps (Papers 1, 3 in AS, 2, 4 in A2)');

-- ─── TEST 9: Further Maths 9231 fp1_fps -> fps_fm ───────────────────────────
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_paper_count INT;
  v_has_fp2 BOOLEAN;
  v_has_fm BOOLEAN;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9231';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'as_only' AND svr.combination_key = 'fp1_fps';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  SELECT
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND paper_number = 2 AND stage = 'a2'),
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND paper_number = 3 AND stage = 'a2')
  INTO v_has_fp2, v_has_fm;

  UPDATE r028_ctx SET t9_fm_fp1fps_to_fpsfm = (
    v_paper_count = 4 AND v_has_fp2 AND v_has_fm
  );
END;
$$;

SELECT ok((SELECT t9_fm_fp1fps_to_fpsfm FROM r028_ctx),
  'Further Maths 9231: fp1_fps AS-only auto-resolves to fps_fm (Papers 1, 4 in AS, 2, 3 in A2)');

-- ─── TEST 10: configure_subject_route preserves staged-A2 progression ────────
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_unlock_ts TIMESTAMPTZ := NOW() - INTERVAL '10 days';
  v_after_stage TEXT;
  v_after_ts TIMESTAMPTZ;
  v_after_method TEXT;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9709';

  -- User is already in staged route and has unlocked A2
  INSERT INTO public.user_subjects (
    user_id, subject_id, study_route, current_stage, a2_unlocked_at, a2_unlock_method
  )
  VALUES (
    v_owner, v_subj_id, 'staged', 'a2', v_unlock_ts, 'manual'
  )
  RETURNING id INTO v_us_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Re-configure staged route with mech_stats selections
  PERFORM public.configure_subject_route(
    v_owner,
    v_us_id,
    'staged',
    jsonb_build_array(
      jsonb_build_object('component_name', 'Pure 1', 'paper_number', 1, 'stage', 'as'),
      jsonb_build_object('component_name', 'Mechanics', 'paper_number', 4, 'stage', 'as'),
      jsonb_build_object('component_name', 'Pure 3', 'paper_number', 3, 'stage', 'a2'),
      jsonb_build_object('component_name', 'Statistics 1', 'paper_number', 5, 'stage', 'a2')
    )
  );

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT current_stage::TEXT, a2_unlocked_at, a2_unlock_method::TEXT
  INTO v_after_stage, v_after_ts, v_after_method
  FROM public.user_subjects WHERE id = v_us_id;

  UPDATE r028_ctx SET t10_staged_a2_preserved = (
    v_after_stage = 'a2'
    AND v_after_ts = v_unlock_ts
    AND v_after_method = 'manual'
  );
END;
$$;

SELECT ok((SELECT t10_staged_a2_preserved FROM r028_ctx),
  'configure_subject_route: preserves current_stage=a2 and unlock metadata on staged re-save');

-- ─── TEST 11: configure_subject_route preserves A2 when switching combinations
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_unlock_ts TIMESTAMPTZ := NOW() - INTERVAL '5 days';
  v_after_stage TEXT;
  v_after_ts TIMESTAMPTZ;
  v_has_s2 BOOLEAN;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9709';

  INSERT INTO public.user_subjects (
    user_id, subject_id, study_route, current_stage, a2_unlocked_at, a2_unlock_method
  )
  VALUES (
    v_owner, v_subj_id, 'staged', 'a2', v_unlock_ts, 'normal_transition'
  )
  RETURNING id INTO v_us_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Switch from mech_stats to stats_double
  PERFORM public.configure_subject_route(
    v_owner,
    v_us_id,
    'staged',
    jsonb_build_array(
      jsonb_build_object('component_name', 'Pure 1', 'paper_number', 1, 'stage', 'as'),
      jsonb_build_object('component_name', 'Statistics 1', 'paper_number', 5, 'stage', 'as'),
      jsonb_build_object('component_name', 'Pure 3', 'paper_number', 3, 'stage', 'a2'),
      jsonb_build_object('component_name', 'Statistics 2', 'paper_number', 6, 'stage', 'a2')
    )
  );

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT current_stage::TEXT, a2_unlocked_at INTO v_after_stage, v_after_ts
  FROM public.user_subjects WHERE id = v_us_id;

  SELECT EXISTS (
    SELECT 1 FROM public.subject_paper_selections
    WHERE user_subject_id = v_us_id AND paper_number = 6 AND stage = 'a2'
  ) INTO v_has_s2;

  UPDATE r028_ctx SET t11_staged_combo_preserved = (
    v_after_stage = 'a2'
    AND v_after_ts = v_unlock_ts
    AND v_has_s2
  );
END;
$$;

SELECT ok((SELECT t11_staged_combo_preserved FROM r028_ctx),
  'configure_subject_route: preserves current_stage=a2 when switching paper combination within staged route');

-- ─── TEST 12: configure_subject_route clears A2 metadata when changing to as_only
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_after_stage TEXT;
  v_after_ts TIMESTAMPTZ;
  v_after_method TEXT;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9709';

  INSERT INTO public.user_subjects (
    user_id, subject_id, study_route, current_stage, a2_unlocked_at, a2_unlock_method
  )
  VALUES (
    v_owner, v_subj_id, 'staged', 'a2', NOW(), 'manual'
  )
  RETURNING id INTO v_us_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Explicitly demote to as_only route
  PERFORM public.configure_subject_route(
    v_owner,
    v_us_id,
    'as_only',
    jsonb_build_array(
      jsonb_build_object('component_name', 'Pure 1', 'paper_number', 1, 'stage', 'as'),
      jsonb_build_object('component_name', 'Mechanics', 'paper_number', 4, 'stage', 'as')
    )
  );

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT current_stage::TEXT, a2_unlocked_at, a2_unlock_method::TEXT
  INTO v_after_stage, v_after_ts, v_after_method
  FROM public.user_subjects WHERE id = v_us_id;

  UPDATE r028_ctx SET t12_staged_to_as_cleared = (
    v_after_stage = 'as'
    AND v_after_ts IS NULL
    AND v_after_method IS NULL
  );
END;
$$;

SELECT ok((SELECT t12_staged_to_as_cleared FROM r028_ctx),
  'configure_subject_route: clears A2 stage and unlock timestamps when reconfiguring to as_only');

-- ─── TEST 13: Atomic rollback on failure in transition_to_a2 ────────────────
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_route TEXT;
  v_stage TEXT;
  v_unlock_ts TIMESTAMPTZ;
  v_paper_count INT;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9702';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'as_only';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Attempt transition with invalid score (150 > 100)
  BEGIN
    PERFORM public.transition_to_a2(
      v_owner,
      v_us_id,
      'manual',
      'actual',
      150::SMALLINT,
      100::SMALLINT,
      'may_jun',
      2025::SMALLINT,
      FALSE
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- expected error
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT study_route::TEXT, current_stage::TEXT, a2_unlocked_at
  INTO v_route, v_stage, v_unlock_ts
  FROM public.user_subjects WHERE id = v_us_id;

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  UPDATE r028_ctx SET t13_rollback_verified = (
    v_route = 'as_only'
    AND v_stage = 'as'
    AND v_unlock_ts IS NULL
    AND v_paper_count = 3
  );
END;
$$;

SELECT ok((SELECT t13_rollback_verified FROM r028_ctx),
  'transition_to_a2: atomic rollback preserves route, stage, and paper selections upon error');

-- ─── TEST 14: transition_to_a2 rejects non-owner with 42501 ─────────────────
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_other UUID := '02800001-0000-0000-0000-000000000002';
  v_subj_id UUID;
  v_us_id UUID;
  v_err_code TEXT;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9702';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'staged', 'as')
  RETURNING id INTO v_us_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other::text)::text, true);

  BEGIN
    PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE r028_ctx SET t14_unauthorized_transition = (v_err_code = '42501');
END;
$$;

SELECT ok((SELECT t14_unauthorized_transition FROM r028_ctx),
  'transition_to_a2: rejects non-owner with 42501 Unauthorized');

-- ─── TEST 15: configure_subject_route rejects non-owner with 42501 ───────────
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_other UUID := '02800001-0000-0000-0000-000000000002';
  v_subj_id UUID;
  v_us_id UUID;
  v_err_code TEXT;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9702';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'staged', 'as')
  RETURNING id INTO v_us_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other::text)::text, true);

  BEGIN
    PERFORM public.configure_subject_route(v_owner, v_us_id, 'staged', '[]'::jsonb);
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE r028_ctx SET t15_unauthorized_config = (v_err_code = '42501');
END;
$$;

SELECT ok((SELECT t15_unauthorized_config FROM r028_ctx),
  'configure_subject_route: rejects non-owner with 42501 Unauthorized');

-- ─── TEST 16: anon role cannot execute transition_to_a2 or configure_subject_route
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_t2a2_err TEXT;
  v_csr_err TEXT;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9702';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'staged', 'as')
  RETURNING id INTO v_us_id;

  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);

  BEGIN
    PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_t2a2_err = RETURNED_SQLSTATE;
  END;

  BEGIN
    PERFORM public.configure_subject_route(v_owner, v_us_id, 'staged', '[]'::jsonb);
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_csr_err = RETURNED_SQLSTATE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE r028_ctx SET t16_anon_revoked = (v_t2a2_err = '42501' AND v_csr_err = '42501');
END;
$$;

SELECT ok((SELECT t16_anon_revoked FROM r028_ctx),
  'anon role execution is revoked on transition_to_a2 and configure_subject_route');

-- ─── TEST 17: Maths 9709 p1_s1 AS-only -> A2 transition WITH explicit stats_double succeeds ──
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_paper_count INT;
  v_has_s2 BOOLEAN;
  v_new_stage TEXT;
  v_new_route TEXT;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9709';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  -- p1_s1 papers: Pure 1 (1) & Statistics 1 (5)
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'as_only' AND svr.combination_key = 'p1_s1';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Explicitly select stats_double: AS (1, 5) -> A2 (3, 6)
  PERFORM public.transition_to_a2(
    v_owner,
    v_us_id,
    'manual',
    NULL, NULL, NULL, NULL, NULL, FALSE,
    jsonb_build_array(
      jsonb_build_object('component_name', 'Pure 1', 'paper_number', 1, 'stage', 'as'),
      jsonb_build_object('component_name', 'Statistics 1', 'paper_number', 5, 'stage', 'as'),
      jsonb_build_object('component_name', 'Pure 3', 'paper_number', 3, 'stage', 'a2'),
      jsonb_build_object('component_name', 'Statistics 2', 'paper_number', 6, 'stage', 'a2')
    )
  );

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT study_route, current_stage INTO v_new_route, v_new_stage
  FROM public.user_subjects WHERE id = v_us_id;

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  SELECT EXISTS (
    SELECT 1 FROM public.subject_paper_selections
    WHERE user_subject_id = v_us_id AND paper_number = 6 AND stage = 'a2'
  ) INTO v_has_s2;

  UPDATE r028_ctx SET t17_maths_p1s1_to_stats_double = (
    v_new_route = 'staged' AND v_new_stage = 'a2' AND v_paper_count = 4 AND v_has_s2
  );
END;
$$;

SELECT ok((SELECT t17_maths_p1s1_to_stats_double FROM r028_ctx),
  'Mathematics 9709: p1_s1 AS-only transition WITH explicit stats_double combination succeeds');

-- ─── TEST 18: transition_to_a2 rejects incompatible target that replaces existing AS paper and rolls back ──
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_err_msg TEXT := '';
  v_post_route TEXT;
  v_post_stage TEXT;
  v_paper_count INT;
  v_has_m1 BOOLEAN;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9709';

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  -- p1_m1 papers: Pure 1 (1) & Mechanics (4)
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'as_only' AND svr.combination_key = 'p1_m1';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Attempt to pass stats_mech (AS: Pure 1, Stats 1; A2: Pure 3, Mechanics), replacing AS paper Mechanics with Stats 1
  BEGIN
    PERFORM public.transition_to_a2(
      v_owner,
      v_us_id,
      'manual',
      NULL, NULL, NULL, NULL, NULL, FALSE,
      jsonb_build_array(
        jsonb_build_object('component_name', 'Pure 1', 'paper_number', 1, 'stage', 'as'),
        jsonb_build_object('component_name', 'Statistics 1', 'paper_number', 5, 'stage', 'as'),
        jsonb_build_object('component_name', 'Pure 3', 'paper_number', 3, 'stage', 'a2'),
        jsonb_build_object('component_name', 'Mechanics', 'paper_number', 4, 'stage', 'a2')
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_err_msg := SQLERRM;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT study_route, current_stage INTO v_post_route, v_post_stage
  FROM public.user_subjects WHERE id = v_us_id;

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  SELECT EXISTS (
    SELECT 1 FROM public.subject_paper_selections
    WHERE user_subject_id = v_us_id AND paper_number = 4 AND stage = 'as'
  ) INTO v_has_m1;

  UPDATE r028_ctx SET t18_reject_as_replacement = (
    v_err_msg LIKE '%Target staged combination AS papers do not match existing AS paper enrollment%'
    AND v_post_route = 'as_only'
    AND v_post_stage = 'as'
    AND v_paper_count = 2
    AND v_has_m1
  );
END;
$$;

SELECT ok((SELECT t18_reject_as_replacement FROM r028_ctx),
  'transition_to_a2: rejects incompatible target that replaces existing AS paper and rolls back atomically');

-- ─── TEST 19: transition_to_a2 rejects paper-selection replacement from already-staged enrollment ──
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_err_msg TEXT := '';
  v_post_route TEXT;
  v_post_stage TEXT;
  v_post_unlocked_at TIMESTAMPTZ;
  v_post_unlock_method TEXT;
  v_paper_count INT;
  v_papers_intact BOOLEAN;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9709';

  -- Already staged enrollment
  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'staged', 'as')
  RETURNING id INTO v_us_id;

  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'staged' AND svr.combination_key = 'mech_stats';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Attempt to pass paper selections during transition_to_a2 for an already-staged enrollment
  BEGIN
    PERFORM public.transition_to_a2(
      v_owner,
      v_us_id,
      'manual',
      NULL, NULL, NULL, NULL, NULL, FALSE,
      jsonb_build_array(
        jsonb_build_object('component_name', 'Pure 1', 'paper_number', 1, 'stage', 'as'),
        jsonb_build_object('component_name', 'Mechanics', 'paper_number', 4, 'stage', 'as'),
        jsonb_build_object('component_name', 'Pure 3', 'paper_number', 3, 'stage', 'a2'),
        jsonb_build_object('component_name', 'Statistics 1', 'paper_number', 5, 'stage', 'a2')
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_err_msg := SQLERRM;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT study_route, current_stage, a2_unlocked_at, a2_unlock_method
  INTO   v_post_route, v_post_stage, v_post_unlocked_at, v_post_unlock_method
  FROM   public.user_subjects WHERE id = v_us_id;

  SELECT count(*) INTO v_paper_count
  FROM   public.subject_paper_selections WHERE user_subject_id = v_us_id;

  SELECT (
    NOT EXISTS (
      SELECT 1 FROM public.subject_route_papers srp
      JOIN public.subject_valid_routes svr ON svr.id = srp.route_id
      WHERE svr.subject_id = v_subj_id AND svr.route = 'staged' AND svr.combination_key = 'mech_stats'
        AND NOT EXISTS (
          SELECT 1 FROM public.subject_paper_selections sps
          WHERE sps.user_subject_id = v_us_id
            AND sps.subject_paper_id = srp.subject_paper_id
            AND sps.stage = srp.stage
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.subject_paper_selections sps
      WHERE sps.user_subject_id = v_us_id
        AND NOT EXISTS (
          SELECT 1 FROM public.subject_route_papers srp
          JOIN public.subject_valid_routes svr ON svr.id = srp.route_id
          WHERE svr.subject_id = v_subj_id AND svr.route = 'staged' AND svr.combination_key = 'mech_stats'
            AND srp.subject_paper_id = sps.subject_paper_id
            AND srp.stage = sps.stage
        )
    )
  ) INTO v_papers_intact;

  UPDATE r028_ctx SET t19_reject_selections_on_staged = (
    v_err_msg LIKE '%Cannot specify paper selections during A2 transition for route staged%'
    AND v_post_route = 'staged'
    AND v_post_stage = 'as'
    AND v_post_unlocked_at IS NULL
    AND v_post_unlock_method IS NULL
    AND v_paper_count = 4
    AND v_papers_intact = TRUE
  );
END;
$$;

SELECT ok((SELECT t19_reject_selections_on_staged FROM r028_ctx),
  'transition_to_a2: rejects paper-selection replacement from already-staged enrollment and atomically preserves route, stage, metadata, and mech_stats papers');

-- ─── TEST 20: transition_to_a2 on already-staged enrollment omitting selections succeeds and preserves papers ──
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_post_stage TEXT;
  v_paper_count INT;
  v_has_m1_as BOOLEAN;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id INTO v_subj_id FROM public.subjects WHERE code = '9709';

  -- Already staged enrollment
  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'staged', 'as')
  RETURNING id INTO v_us_id;

  -- mech_stats: AS(1, 4), A2(3, 5)
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'staged' AND svr.combination_key = 'mech_stats';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Call transition_to_a2 with 3 arguments (omitting optional parameters including p_paper_selections)
  PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT current_stage INTO v_post_stage
  FROM public.user_subjects WHERE id = v_us_id;

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  SELECT EXISTS (
    SELECT 1 FROM public.subject_paper_selections
    WHERE user_subject_id = v_us_id AND paper_number = 4 AND stage = 'as'
  ) INTO v_has_m1_as;

  UPDATE r028_ctx SET t20_omit_selections_on_staged = (
    v_post_stage = 'a2'
    AND v_paper_count = 4
    AND v_has_m1_as
  );
END;
$$;

SELECT ok((SELECT t20_omit_selections_on_staged FROM r028_ctx),
  'transition_to_a2: calls omitting optional paper-selection parameter remain compatible and preserve existing selections');

-- ─── TEST 21: Known/catalogued subject marked unavailable still receives canonical staged mapping ──
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_subj_id UUID;
  v_us_id UUID;
  v_route TEXT;
  v_stage TEXT;
  v_paper_count INT;
  v_original_avail BOOLEAN;
  v_papers_match BOOLEAN;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);
  SELECT id, is_available INTO v_subj_id, v_original_avail FROM public.subjects WHERE code = '9702';

  -- Temporarily mark catalogued subject as unavailable
  UPDATE public.subjects SET is_available = FALSE WHERE id = v_subj_id;

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  -- Initial AS papers
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_id, sp.name, sp.paper_number, srp.stage, sp.id
  FROM   public.subject_valid_routes svr
  JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE  svr.subject_id = v_subj_id AND svr.route = 'as_only';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Transition to A2 with omitted selections
  PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT study_route::TEXT, current_stage::TEXT INTO v_route, v_stage
  FROM public.user_subjects WHERE id = v_us_id;

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  -- Compare resulting selections with exact canonical staged-route paper multiset
  SELECT (
    NOT EXISTS (
      SELECT 1 FROM public.subject_route_papers srp
      JOIN public.subject_valid_routes svr ON svr.id = srp.route_id
      WHERE svr.subject_id = v_subj_id AND svr.route = 'staged'
        AND NOT EXISTS (
          SELECT 1 FROM public.subject_paper_selections sps
          WHERE sps.user_subject_id = v_us_id
            AND sps.subject_paper_id = srp.subject_paper_id
            AND sps.stage = srp.stage
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.subject_paper_selections sps
      WHERE sps.user_subject_id = v_us_id
        AND NOT EXISTS (
          SELECT 1 FROM public.subject_route_papers srp
          JOIN public.subject_valid_routes svr ON svr.id = srp.route_id
          WHERE svr.subject_id = v_subj_id AND svr.route = 'staged'
            AND srp.subject_paper_id = sps.subject_paper_id
            AND srp.stage = sps.stage
        )
    )
    AND (
      (SELECT count(*) FROM public.subject_paper_selections WHERE user_subject_id = v_us_id) =
      (SELECT count(*) FROM public.subject_route_papers srp JOIN public.subject_valid_routes svr ON svr.id = srp.route_id WHERE svr.subject_id = v_subj_id AND svr.route = 'staged')
    )
  ) INTO v_papers_match;

  -- Restore subject availability
  UPDATE public.subjects SET is_available = v_original_avail WHERE id = v_subj_id;

  UPDATE r028_ctx SET t21_catalogued_unavailable_staged = (
    v_route = 'staged' AND v_stage = 'a2' AND v_paper_count = 5 AND v_papers_match = TRUE
  );
END;
$$;

SELECT ok((SELECT t21_catalogued_unavailable_staged FROM r028_ctx),
  'transition_to_a2: known/catalogued subject marked unavailable (is_available=false) still receives canonical staged mapping');

-- ─── TEST 22: Custom/no-route subject transitions with omitted selections while preserving existing papers ──
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_custom_subj_id UUID;
  v_p1_id UUID;
  v_p2_id UUID;
  v_us_id UUID;
  v_route TEXT;
  v_stage TEXT;
  v_unlocked_at TIMESTAMPTZ;
  v_unlock_method TEXT;
  v_paper_count INT;
  v_has_p1 BOOLEAN;
  v_has_p2 BOOLEAN;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);

  -- Insert custom subject without any entries in subject_valid_routes
  INSERT INTO public.subjects (code, name, is_available)
  VALUES ('TEST99', 'Custom No-Route Subject', FALSE)
  RETURNING id INTO v_custom_subj_id;

  INSERT INTO public.subject_papers (subject_id, paper_number, name, code_suffix, stage_behavior)
  VALUES (v_custom_subj_id, 1, 'Custom Paper 1', '1', 'route_dependent')
  RETURNING id INTO v_p1_id;

  INSERT INTO public.subject_papers (subject_id, paper_number, name, code_suffix, stage_behavior)
  VALUES (v_custom_subj_id, 2, 'Custom Paper 2', '2', 'route_dependent')
  RETURNING id INTO v_p2_id;

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_custom_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  VALUES
    (v_us_id, 'Custom Paper 1', 1, 'as', v_p1_id),
    (v_us_id, 'Custom Paper 2', 2, 'as', v_p2_id);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Transition with omitted selections
  PERFORM public.transition_to_a2(v_owner, v_us_id, 'manual');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT study_route::TEXT, current_stage::TEXT, a2_unlocked_at, a2_unlock_method::TEXT
  INTO v_route, v_stage, v_unlocked_at, v_unlock_method
  FROM public.user_subjects WHERE id = v_us_id;

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  SELECT
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND subject_paper_id = v_p1_id),
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND subject_paper_id = v_p2_id)
  INTO v_has_p1, v_has_p2;

  UPDATE r028_ctx SET t22_custom_no_route_preserved = (
    v_route = 'staged'
    AND v_stage = 'a2'
    AND v_unlocked_at IS NOT NULL
    AND v_unlock_method = 'manual'
    AND v_paper_count = 2
    AND v_has_p1
    AND v_has_p2
  );
END;
$$;

SELECT ok((SELECT t22_custom_no_route_preserved FROM r028_ctx),
  'transition_to_a2: custom/no-route subject transitions with omitted selections while preserving existing papers');

-- ─── TEST 23: Custom/no-route subject supplying replacement selections is rejected atomically ──
DO $$
DECLARE
  v_owner UUID := '02800001-0000-0000-0000-000000000001';
  v_custom_subj_id UUID;
  v_p1_id UUID;
  v_p2_id UUID;
  v_us_id UUID;
  v_err_code TEXT := '';
  v_err_msg TEXT := '';
  v_route TEXT;
  v_stage TEXT;
  v_unlocked_at TIMESTAMPTZ;
  v_unlock_method TEXT;
  v_paper_count INT;
  v_has_p1 BOOLEAN;
  v_has_p2 BOOLEAN;
BEGIN
  DELETE FROM public.user_subjects WHERE user_id IN ('02800001-0000-0000-0000-000000000001'::uuid, '02800001-0000-0000-0000-000000000002'::uuid);

  -- Find or insert custom subject without canonical routes
  SELECT id INTO v_custom_subj_id FROM public.subjects WHERE code = 'TEST99';
  IF v_custom_subj_id IS NULL THEN
    INSERT INTO public.subjects (code, name, is_available)
    VALUES ('TEST99', 'Custom No-Route Subject', FALSE)
    RETURNING id INTO v_custom_subj_id;

    INSERT INTO public.subject_papers (subject_id, paper_number, name, code_suffix, stage_behavior)
    VALUES (v_custom_subj_id, 1, 'Custom Paper 1', '1', 'route_dependent')
    RETURNING id INTO v_p1_id;

    INSERT INTO public.subject_papers (subject_id, paper_number, name, code_suffix, stage_behavior)
    VALUES (v_custom_subj_id, 2, 'Custom Paper 2', '2', 'route_dependent')
    RETURNING id INTO v_p2_id;
  ELSE
    SELECT id INTO v_p1_id FROM public.subject_papers WHERE subject_id = v_custom_subj_id AND paper_number = 1;
    SELECT id INTO v_p2_id FROM public.subject_papers WHERE subject_id = v_custom_subj_id AND paper_number = 2;
  END IF;

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_owner, v_custom_subj_id, 'as_only', 'as')
  RETURNING id INTO v_us_id;

  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  VALUES
    (v_us_id, 'Custom Paper 1', 1, 'as', v_p1_id),
    (v_us_id, 'Custom Paper 2', 2, 'as', v_p2_id);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);

  -- Attempt transition with non-empty replacement selections on subject without canonical routes
  BEGIN
    PERFORM public.transition_to_a2(
      v_owner,
      v_us_id,
      'manual',
      NULL, NULL, NULL, NULL, NULL, FALSE,
      jsonb_build_array(
        jsonb_build_object('component_name', 'Custom Paper 1', 'paper_number', 1, 'stage', 'as'),
        jsonb_build_object('component_name', 'Custom Paper 2', 'paper_number', 2, 'stage', 'a2')
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_err_code = RETURNED_SQLSTATE,
        v_err_msg  = MESSAGE_TEXT;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT study_route::TEXT, current_stage::TEXT, a2_unlocked_at, a2_unlock_method::TEXT
  INTO v_route, v_stage, v_unlocked_at, v_unlock_method
  FROM public.user_subjects WHERE id = v_us_id;

  SELECT count(*) INTO v_paper_count
  FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;

  SELECT
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND subject_paper_id = v_p1_id),
    EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND subject_paper_id = v_p2_id)
  INTO v_has_p1, v_has_p2;

  UPDATE r028_ctx SET t23_custom_replacement_rejected = (
    v_err_code = 'P0003'
    AND v_err_msg LIKE '%Cannot specify paper selections during A2 transition for subject%without canonical staged routes%'
    AND v_route = 'as_only'
    AND v_stage = 'as'
    AND v_unlocked_at IS NULL
    AND v_unlock_method IS NULL
    AND v_paper_count = 2
    AND v_has_p1
    AND v_has_p2
  );
END;
$$;

SELECT ok((SELECT t23_custom_replacement_rejected FROM r028_ctx),
  'transition_to_a2: custom/no-route subject supplying replacement selections is rejected atomically with no route, stage, or paper changes');

SELECT * FROM finish();
ROLLBACK;
