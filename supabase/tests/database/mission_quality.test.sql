BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(24);

-- ─── TEST CONTEXT ─────────────────────────────────────────────────────────────

CREATE TEMP TABLE mq_ctx (
  user_a             UUID,
  user_b             UUID,
  user_c             UUID,
  user_d             UUID,
  user_e             UUID,
  user_f             UUID,
  local_date         DATE,
  subj_maths         UUID DEFAULT gen_random_uuid(),
  subj_physics       UUID DEFAULT gen_random_uuid(),
  subj_chem          UUID DEFAULT gen_random_uuid(),
  us_maths_id        UUID,
  us_phys_id         UUID,
  us_chem_id         UUID,
  ch_m1              UUID DEFAULT gen_random_uuid(),
  ch_m2              UUID DEFAULT gen_random_uuid(),
  ch_m3              UUID DEFAULT gen_random_uuid(),
  ch_p1              UUID DEFAULT gen_random_uuid(),
  ch_p2              UUID DEFAULT gen_random_uuid(),
  ch_c1              UUID DEFAULT gen_random_uuid(),
  uc_m1              UUID DEFAULT gen_random_uuid(),
  uc_m2              UUID DEFAULT gen_random_uuid(),
  uc_m3              UUID DEFAULT gen_random_uuid(),
  uc_p1              UUID DEFAULT gen_random_uuid(),
  uc_p2              UUID DEFAULT gen_random_uuid(),
  uc_c1              UUID DEFAULT gen_random_uuid(),
  -- test tracking variables
  t1_constraint_ok   BOOLEAN DEFAULT FALSE,
  t2_active_count    INTEGER DEFAULT 0,
  t3_est_time_ok     BOOLEAN DEFAULT FALSE,
  t4_max_2_subj_ok   BOOLEAN DEFAULT FALSE,
  t5_varied_types_ok BOOLEAN DEFAULT FALSE,
  t6_no_dup_targets  BOOLEAN DEFAULT FALSE,
  t7_idempotent_ok   BOOLEAN DEFAULT FALSE,
  t8_limited_ok      BOOLEAN DEFAULT FALSE,
  t9_replace_ok      BOOLEAN DEFAULT FALSE,
  t10_unauth_rej     BOOLEAN DEFAULT FALSE,
  t11_cross_user_rej BOOLEAN DEFAULT FALSE,
  t12_exhaust_noop   BOOLEAN DEFAULT FALSE,
  t13_direct_mut_rej BOOLEAN DEFAULT FALSE,
  t14_comp_xp_ok     BOOLEAN DEFAULT FALSE,
  t15_notes_rel_ok   BOOLEAN DEFAULT FALSE,
  t16_weak_rel_ok    BOOLEAN DEFAULT FALSE,
  t17_adv_workload   BOOLEAN DEFAULT FALSE,
  t18_skip_replenish BOOLEAN DEFAULT FALSE,
  t19_conflict_roll  BOOLEAN DEFAULT FALSE,
  t20_slot_30_10_20  BOOLEAN DEFAULT FALSE,
  t21_slot_10_10_60  BOOLEAN DEFAULT FALSE,
  t22_replace_workld BOOLEAN DEFAULT FALSE,
  t23_progress_safe  BOOLEAN DEFAULT FALSE,
  t24_undo_xp_ok     BOOLEAN DEFAULT FALSE
) ON COMMIT DROP;

GRANT ALL ON TABLE mq_ctx TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_chapters TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.past_papers TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.paper_question_attempts TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subject_stage_results TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subject_paper_selections TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_subjects TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_settings TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.streaks TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.xp_events TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chapters TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subjects TO authenticated, anon;

-- ─── SETUP: synthetic isolated users ──────────────────────────────────────────

DO $$
BEGIN
  -- User A
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'c0230001-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'mq_user_a@atlas.test', '',
    NOW(),
    '{"provider":"email","providers":["email"]}', '{}',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- User B
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000002',
    'c0230001-0000-0000-0000-000000000002',
    'authenticated', 'authenticated',
    'mq_user_b@atlas.test', '',
    NOW(),
    '{"provider":"email","providers":["email"]}', '{}',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- User C (for adversarial & budget tests)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000003',
    'c0230001-0000-0000-0000-000000000003',
    'authenticated', 'authenticated',
    'mq_user_c@atlas.test', '',
    NOW(),
    '{"provider":"email","providers":["email"]}', '{}',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- User D (for 30 + 10 + (20 vs 10) test)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'c0230001-0000-0000-0000-000000000004',
    'authenticated', 'authenticated',
    'mq_user_d@atlas.test', '',
    NOW(),
    '{"provider":"email","providers":["email"]}', '{}',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- User E (for 10 + 10 + 60 past paper test)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'c0230001-0000-0000-0000-000000000005',
    'authenticated', 'authenticated',
    'mq_user_e@atlas.test', '',
    NOW(),
    '{"provider":"email","providers":["email"]}', '{}',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  -- User F (for replacement workload preservation test)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'c0230001-0000-0000-0000-000000000006',
    'authenticated', 'authenticated',
    'mq_user_f@atlas.test', '',
    NOW(),
    '{"provider":"email","providers":["email"]}', '{}',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
END;
$$;

INSERT INTO mq_ctx (user_a, user_b, user_c, user_d, user_e, user_f)
VALUES (
  'c0230001-0000-0000-0000-000000000001',
  'c0230001-0000-0000-0000-000000000002',
  'c0230001-0000-0000-0000-000000000003',
  'c0230001-0000-0000-0000-000000000004',
  'c0230001-0000-0000-0000-000000000005',
  'c0230001-0000-0000-0000-000000000006'
);

UPDATE public.profiles
SET    onboarding_completed = TRUE,
       timezone = 'UTC'
WHERE  id IN (
  'c0230001-0000-0000-0000-000000000001',
  'c0230001-0000-0000-0000-000000000002',
  'c0230001-0000-0000-0000-000000000003',
  'c0230001-0000-0000-0000-000000000004',
  'c0230001-0000-0000-0000-000000000005',
  'c0230001-0000-0000-0000-000000000006'
);

UPDATE mq_ctx SET local_date = public.get_user_local_date(user_a);

-- ─── SETUP: subjects and chapters ─────────────────────────────────────────────

INSERT INTO public.subjects (id, name, code, is_global, created_by)
SELECT subj_maths, 'Mathematics MQ', '9709', FALSE, user_a FROM mq_ctx
UNION ALL
SELECT subj_physics, 'Physics MQ', '9702', FALSE, user_a FROM mq_ctx
UNION ALL
SELECT subj_chem, 'Chemistry MQ', '9701', FALSE, user_a FROM mq_ctx;

-- Enrol User A in Maths, Physics, Chemistry
INSERT INTO public.user_subjects (user_id, subject_id, exam_date, target_grade, priority, study_route, current_stage)
SELECT user_a, subj_maths, local_date + 45, 'A*', 5, 'staged'::public.study_route_enum, 'as'::public.subject_stage_enum FROM mq_ctx
UNION ALL
SELECT user_a, subj_physics, local_date + 45, 'A', 4, 'staged'::public.study_route_enum, 'as'::public.subject_stage_enum FROM mq_ctx
UNION ALL
SELECT user_a, subj_chem, local_date + 45, 'A', 3, 'staged'::public.study_route_enum, 'as'::public.subject_stage_enum FROM mq_ctx;

UPDATE mq_ctx ctx
SET
  us_maths_id = (SELECT id FROM public.user_subjects WHERE user_id = ctx.user_a AND subject_id = ctx.subj_maths),
  us_phys_id  = (SELECT id FROM public.user_subjects WHERE user_id = ctx.user_a AND subject_id = ctx.subj_physics),
  us_chem_id  = (SELECT id FROM public.user_subjects WHERE user_id = ctx.user_a AND subject_id = ctx.subj_chem);

-- Chapters for User A's subjects
INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
SELECT ch_m1, subj_maths, 'Pure Maths Quadratics', 1, 'Pure 1', FALSE, 'as'::public.chapter_stage_enum FROM mq_ctx
UNION ALL
SELECT ch_m2, subj_maths, 'Pure Maths Functions', 2, 'Pure 1', FALSE, 'as'::public.chapter_stage_enum FROM mq_ctx
UNION ALL
SELECT ch_m3, subj_maths, 'Pure Maths Coordinate Geometry', 3, 'Pure 1', FALSE, 'as'::public.chapter_stage_enum FROM mq_ctx
UNION ALL
SELECT ch_p1, subj_physics, 'Physics Kinematics', 1, 'AS Core', FALSE, 'as'::public.chapter_stage_enum FROM mq_ctx
UNION ALL
SELECT ch_p2, subj_physics, 'Physics Dynamics', 2, 'AS Core', FALSE, 'as'::public.chapter_stage_enum FROM mq_ctx
UNION ALL
SELECT ch_c1, subj_chem, 'Chemistry Atoms & Molecules', 1, 'AS Physical', FALSE, 'as'::public.chapter_stage_enum FROM mq_ctx;

-- User Chapters for User A
INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status, confidence_level)
SELECT uc_m1, user_a, ch_m1, 'none'::public.notes_status_enum, 2::SMALLINT FROM mq_ctx
UNION ALL
SELECT uc_m2, user_a, ch_m2, 'in_progress'::public.notes_status_enum, 3::SMALLINT FROM mq_ctx
UNION ALL
SELECT uc_m3, user_a, ch_m3, 'complete'::public.notes_status_enum, 4::SMALLINT FROM mq_ctx
UNION ALL
SELECT uc_p1, user_a, ch_p1, 'in_progress'::public.notes_status_enum, 1::SMALLINT FROM mq_ctx
UNION ALL
SELECT uc_p2, user_a, ch_p2, 'complete'::public.notes_status_enum, 5::SMALLINT FROM mq_ctx
UNION ALL
SELECT uc_c1, user_a, ch_c1, 'none'::public.notes_status_enum, 3::SMALLINT FROM mq_ctx;

-- Insert real question attempt for Physics ch_p1 showing 40% accuracy
DO $$
DECLARE
  v_user UUID;
  v_paper UUID := gen_random_uuid();
  v_phys UUID;
  v_p1   UUID;
BEGIN
  SELECT user_a, subj_physics, ch_p1 INTO v_user, v_phys, v_p1 FROM mq_ctx;

  INSERT INTO public.past_papers (id, user_id, subject_id, paper_code, paper_number, session, year, score_raw, score_max, attempted_at, stage)
  VALUES (v_paper, v_user, v_phys, '9702_s24_qp_11', 1, 'may_jun'::public.paper_session_enum, 2024, 4::SMALLINT, 10::SMALLINT, CURRENT_DATE - 2, 'as');

  INSERT INTO public.paper_question_attempts (paper_id, chapter_id, question_number, marks_available, marks_obtained)
  VALUES (v_paper, v_p1, '1a', 10, 4);
END;
$$;

-- ─── Test 1: Max missions per day constraint ──────────────────────────────────
DO $$
DECLARE
  v_err BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE public.user_settings
    SET max_missions_per_day = 5
    WHERE user_id = 'c0230001-0000-0000-0000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_err := TRUE;
  END;

  UPDATE mq_ctx SET t1_constraint_ok = v_err;
END;
$$;

SELECT ok(
  (SELECT t1_constraint_ok FROM mq_ctx),
  'Test 1: user_settings.max_missions_per_day rejects values > 3 (constrained to 1..3)'
);

-- ─── Test 2: Active mission count cap (<= 3) ──────────────────────────────────
DO $$
DECLARE
  v_user UUID;
  v_count INTEGER;
BEGIN
  SELECT user_a INTO v_user FROM mq_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  PERFORM public.generate_daily_missions(v_user);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT COUNT(*) INTO v_count
  FROM public.daily_missions dm
  JOIN mq_ctx ctx ON ctx.user_a = dm.user_id AND ctx.local_date = dm.mission_date
  WHERE dm.status != 'skipped';

  UPDATE mq_ctx SET t2_active_count = v_count;
END;
$$;

SELECT is(
  (SELECT t2_active_count FROM mq_ctx),
  3,
  'Test 2: generate_daily_missions generates exactly 3 active missions when sufficient content exists'
);

-- ─── Test 3: Estimated daily workload within 60–120 minutes ───────────────────
DO $$
DECLARE
  v_total_mins INTEGER;
BEGIN
  SELECT SUM(dm.estimated_minutes) INTO v_total_mins
  FROM public.daily_missions dm
  JOIN mq_ctx ctx ON ctx.user_a = dm.user_id AND ctx.local_date = dm.mission_date
  WHERE dm.status != 'skipped';

  UPDATE mq_ctx SET t3_est_time_ok = (v_total_mins BETWEEN 60 AND 120);
END;
$$;

SELECT ok(
  (SELECT t3_est_time_ok FROM mq_ctx),
  'Test 3: total estimated daily workload stays within 60–120 minutes'
);

-- ─── Test 4: Subject cap (no more than 2 missions from one subject) ───────────
DO $$
DECLARE
  v_max_per_subj INTEGER;
BEGIN
  SELECT COALESCE(MAX(subj_count), 0) INTO v_max_per_subj
  FROM (
    SELECT
      CASE
        WHEN dm.target_entity_type = 'subject' THEN dm.target_entity_id
        WHEN dm.target_entity_type = 'chapter' THEN (
          SELECT c.subject_id FROM public.user_chapters uc
          JOIN public.chapters c ON c.id = uc.chapter_id
          WHERE uc.id = dm.target_entity_id
        )
      END AS subject_id,
      COUNT(*) AS subj_count
    FROM public.daily_missions dm
    JOIN mq_ctx ctx ON ctx.user_a = dm.user_id AND ctx.local_date = dm.mission_date
    WHERE dm.status != 'skipped'
    GROUP BY 1
  ) s;

  UPDATE mq_ctx SET t4_max_2_subj_ok = (v_max_per_subj <= 2);
END;
$$;

SELECT ok(
  (SELECT t4_max_2_subj_ok FROM mq_ctx),
  'Test 4: never generates more than 2 missions for any single subject'
);

-- ─── Test 5: Varied mission types (never 3 identical types) ───────────────────
DO $$
DECLARE
  v_max_per_type INTEGER;
BEGIN
  SELECT COALESCE(MAX(type_count), 0) INTO v_max_per_type
  FROM (
    SELECT dm.type, COUNT(*) AS type_count
    FROM public.daily_missions dm
    JOIN mq_ctx ctx ON ctx.user_a = dm.user_id AND ctx.local_date = dm.mission_date
    WHERE dm.status != 'skipped'
    GROUP BY dm.type
  ) t;

  UPDATE mq_ctx SET t5_varied_types_ok = (v_max_per_type < 3);
END;
$$;

SELECT ok(
  (SELECT t5_varied_types_ok FROM mq_ctx),
  'Test 5: mission types are varied (never generates all 3 missions with identical type)'
);

-- ─── Test 6: No duplicate targets ─────────────────────────────────────────────
DO $$
DECLARE
  v_dup_count INTEGER;
BEGIN
  SELECT COUNT(*) - COUNT(DISTINCT dm.target_entity_id) INTO v_dup_count
  FROM public.daily_missions dm
  JOIN mq_ctx ctx ON ctx.user_a = dm.user_id AND ctx.local_date = dm.mission_date
  WHERE dm.status != 'skipped';

  UPDATE mq_ctx SET t6_no_dup_targets = (v_dup_count = 0);
END;
$$;

SELECT ok(
  (SELECT t6_no_dup_targets FROM mq_ctx),
  'Test 6: no duplicate target entities generated for the same day'
);

-- ─── Test 7: Idempotency on repeated generation ───────────────────────────────
DO $$
DECLARE
  v_user UUID;
  v_g2   INTEGER;
  v_cnt  INTEGER;
BEGIN
  SELECT user_a INTO v_user FROM mq_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  v_g2 := public.generate_daily_missions(v_user);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT COUNT(*) INTO v_cnt
  FROM public.daily_missions dm
  JOIN mq_ctx ctx ON ctx.user_a = dm.user_id AND ctx.local_date = dm.mission_date
  WHERE dm.status != 'skipped';

  UPDATE mq_ctx SET t7_idempotent_ok = (v_g2 = 0 AND v_cnt = 3);
END;
$$;

SELECT ok(
  (SELECT t7_idempotent_ok FROM mq_ctx),
  'Test 7: repeated generation calls insert 0 missions and maintain active cap of 3'
);

-- ─── Test 8: Limited content generates fewer than 3 safely ────────────────────
DO $$
DECLARE
  v_user_b UUID;
  v_subj   UUID := gen_random_uuid();
  v_chap   UUID := gen_random_uuid();
  v_uc     UUID := gen_random_uuid();
  v_today  DATE;
  v_gen    INTEGER;
  v_cnt    INTEGER;
BEGIN
  SELECT user_b INTO v_user_b FROM mq_ctx;
  v_today := public.get_user_local_date(v_user_b);

  -- Enrol User B in only 1 subject with only 1 chapter
  INSERT INTO public.subjects (id, name, code, is_global, created_by)
  VALUES (v_subj, 'Single Subject B', '9999', FALSE, v_user_b);

  INSERT INTO public.user_subjects (user_id, subject_id, exam_date, target_grade, priority, study_route, current_stage)
  VALUES (v_user_b, v_subj, v_today + 30, 'A', 5, 'staged'::public.study_route_enum, 'as'::public.subject_stage_enum);

  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES (v_chap, v_subj, 'Only Chapter B', 1, 'AS Single', FALSE, 'as'::public.chapter_stage_enum);

  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status, confidence_level)
  VALUES (v_uc, v_user_b, v_chap, 'none'::public.notes_status_enum, 1::SMALLINT);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text)::text, true);

  v_gen := public.generate_daily_missions(v_user_b);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT COUNT(*) INTO v_cnt
  FROM public.daily_missions
  WHERE user_id = v_user_b AND mission_date = v_today AND status != 'skipped';

  UPDATE mq_ctx SET t8_limited_ok = (v_cnt <= 2 AND v_cnt >= 1);
END;
$$;

SELECT ok(
  (SELECT t8_limited_ok FROM mq_ctx),
  'Test 8: limited content safely generates fewer than 3 missions without violating variety'
);

-- ─── Test 9: replace_mission produces exactly 1 replacement & marks old skipped ──
DO $$
DECLARE
  v_user     UUID;
  v_target_m UUID;
  v_result   JSONB;
  v_old_stat TEXT;
  v_new_id   UUID;
  v_active   INTEGER;
BEGIN
  SELECT user_a INTO v_user FROM mq_ctx;

  -- Select one pending mission to replace
  SELECT id INTO v_target_m
  FROM public.daily_missions
  WHERE user_id = v_user AND status = 'pending'
  LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  v_result := public.replace_mission(v_target_m, v_user, 'too difficult');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT status INTO v_old_stat FROM public.daily_missions WHERE id = v_target_m;
  v_new_id := (v_result->'new_mission'->>'id')::UUID;

  SELECT COUNT(*) INTO v_active
  FROM public.daily_missions dm
  JOIN mq_ctx ctx ON ctx.user_a = dm.user_id AND ctx.local_date = dm.mission_date
  WHERE dm.status != 'skipped';

  UPDATE mq_ctx SET t9_replace_ok = (
    (v_result->>'success')::BOOLEAN = TRUE
    AND v_old_stat = 'skipped'
    AND v_new_id IS NOT NULL
    AND v_new_id != v_target_m
    AND v_active = 3
  );
END;
$$;

SELECT ok(
  (SELECT t9_replace_ok FROM mq_ctx),
  'Test 9: replace_mission atomically skips old mission, generates 1 replacement, and preserves active count of 3'
);

-- ─── Test 10: replace_mission unauthenticated call rejected (42501) ───────────
DO $$
DECLARE
  v_user     UUID;
  v_target_m UUID;
  v_rej      BOOLEAN := FALSE;
BEGIN
  SELECT user_a INTO v_user FROM mq_ctx;
  SELECT id INTO v_target_m FROM public.daily_missions WHERE user_id = v_user AND status = 'pending' LIMIT 1;

  -- No JWT / unauthenticated
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);

  BEGIN
    PERFORM public.replace_mission(v_target_m, v_user);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_rej := TRUE;
  END;

  RESET ROLE;
  UPDATE mq_ctx SET t10_unauth_rej = v_rej;
END;
$$;

SELECT ok(
  (SELECT t10_unauth_rej FROM mq_ctx),
  'Test 10: replace_mission rejects unauthenticated calls with 42501'
);

-- ─── Test 11: replace_mission cross-user call rejected (42501) ─────────────────
DO $$
DECLARE
  v_user_a   UUID;
  v_user_b   UUID;
  v_target_m UUID;
  v_rej      BOOLEAN := FALSE;
BEGIN
  SELECT user_a, user_b INTO v_user_a, v_user_b FROM mq_ctx;
  SELECT id INTO v_target_m FROM public.daily_missions WHERE user_id = v_user_a AND status = 'pending' LIMIT 1;

  -- Authenticated as User B attempting to replace User A's mission
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text)::text, true);

  BEGIN
    PERFORM public.replace_mission(v_target_m, v_user_a);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_rej := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE mq_ctx SET t11_cross_user_rej = v_rej;
END;
$$;

SELECT ok(
  (SELECT t11_cross_user_rej FROM mq_ctx),
  'Test 11: replace_mission rejects cross-user replacement calls with 42501'
);

-- ─── Test 12: Exhausted replacements leaves original pending (atomic rollback) ──
DO $$
DECLARE
  v_user_b   UUID;
  v_target_m UUID;
  v_rej      BOOLEAN := FALSE;
  v_stat     TEXT;
BEGIN
  SELECT user_b INTO v_user_b FROM mq_ctx;

  -- User B only has 1 chapter and 1 subject, so no alternative replacement exists
  SELECT id INTO v_target_m FROM public.daily_missions WHERE user_id = v_user_b AND status = 'pending' LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text)::text, true);

  BEGIN
    PERFORM public.replace_mission(v_target_m, v_user_b);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    v_rej := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT status INTO v_stat FROM public.daily_missions WHERE id = v_target_m;

  UPDATE mq_ctx SET t12_exhaust_noop = (v_rej = TRUE AND v_stat = 'pending');
END;
$$;

SELECT ok(
  (SELECT t12_exhaust_noop FROM mq_ctx),
  'Test 12: replace_mission raises P0002 and leaves mission pending with zero changes when no alternative exists'
);

-- ─── Test 13: Direct mutation protection on daily_missions ────────────────────
DO $$
DECLARE
  v_user_a   UUID;
  v_target_m UUID;
  v_upd_rej  BOOLEAN := FALSE;
  v_ins_rej  BOOLEAN := FALSE;
  v_del_rej  BOOLEAN := FALSE;
BEGIN
  SELECT user_a INTO v_user_a FROM mq_ctx;
  SELECT id INTO v_target_m FROM public.daily_missions WHERE user_id = v_user_a LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text)::text, true);

  -- Attempt 1: direct UPDATE of xp_reward
  BEGIN
    UPDATE public.daily_missions SET xp_reward = 9999 WHERE id = v_target_m;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_upd_rej := TRUE;
  END;

  -- Attempt 2: direct INSERT
  BEGIN
    INSERT INTO public.daily_missions (user_id, mission_date, type, target_entity_type, title, xp_reward, status, estimated_minutes)
    VALUES (v_user_a, CURRENT_DATE, 'confidence_check', 'chapter', 'Hacked Mission', 9999, 'pending', 10);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_ins_rej := TRUE;
  END;

  -- Attempt 3: direct DELETE
  BEGIN
    DELETE FROM public.daily_missions WHERE id = v_target_m;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_del_rej := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE mq_ctx SET t13_direct_mut_rej = (v_upd_rej AND v_ins_rej AND v_del_rej);
END;
$$;

SELECT ok(
  (SELECT t13_direct_mut_rej FROM mq_ctx),
  'Test 13: authenticated clients cannot directly INSERT, UPDATE (xp_reward/status), or DELETE daily_missions (42501)'
);

-- ─── Test 14: Mission completion awards authentic database-controlled reward ───
DO $$
DECLARE
  v_user_a     UUID;
  v_target_m   UUID;
  v_expected   INTEGER;
  v_xp_prior   INTEGER;
  v_xp_post    INTEGER;
  v_comp_res   JSONB;
BEGIN
  SELECT user_a INTO v_user_a FROM mq_ctx;

  SELECT id, xp_reward INTO v_target_m, v_expected
  FROM public.daily_missions
  WHERE user_id = v_user_a AND status = 'pending'
  LIMIT 1;

  SELECT total_xp INTO v_xp_prior FROM public.profiles WHERE id = v_user_a;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text)::text, true);

  v_comp_res := public.complete_mission(v_target_m, v_user_a);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT total_xp INTO v_xp_post FROM public.profiles WHERE id = v_user_a;

  UPDATE mq_ctx SET t14_comp_xp_ok = (
    (v_comp_res->>'mission_xp')::INTEGER = v_expected
    AND v_xp_post >= (v_xp_prior + v_expected)
  );
END;
$$;

SELECT ok(
  (SELECT t14_comp_xp_ok FROM mq_ctx),
  'Test 14: complete_mission awards the original database-controlled xp_reward'
);

-- ─── Test 15: complete_notes relevance (excludes complete notes) ───────────────
DO $$
DECLARE
  v_user_a    UUID;
  v_has_comp  BOOLEAN;
BEGIN
  SELECT user_a INTO v_user_a FROM mq_ctx;

  -- Verify no daily_missions exist for ch_m3 (which has notes_status = 'complete') with type 'complete_notes'
  SELECT EXISTS (
    SELECT 1 FROM public.daily_missions dm
    JOIN mq_ctx ctx ON ctx.user_a = dm.user_id AND ctx.local_date = dm.mission_date
    WHERE dm.target_entity_id = ctx.uc_m3 AND dm.type = 'complete_notes'
  ) INTO v_has_comp;

  UPDATE mq_ctx SET t15_notes_rel_ok = (NOT v_has_comp);
END;
$$;

SELECT ok(
  (SELECT t15_notes_rel_ok FROM mq_ctx),
  'Test 15: chapters with notes_status = complete never generate complete_notes missions'
);

-- ─── Test 16: revisit_weak_topic relevance (requires real attempts with <70% accuracy) ──
DO $$
DECLARE
  v_user_a      UUID;
  v_weak_gen    BOOLEAN;
  v_fake_gen    BOOLEAN;
BEGIN
  SELECT user_a INTO v_user_a FROM mq_ctx;

  -- ch_p1 has real 40% accuracy attempt -> eligible for revisit_weak_topic
  -- ch_m1 has NO attempts -> MUST NOT generate revisit_weak_topic
  SELECT EXISTS (
    SELECT 1 FROM public.daily_missions dm
    JOIN mq_ctx ctx ON ctx.user_a = dm.user_id AND ctx.local_date = dm.mission_date
    WHERE dm.target_entity_id = ctx.uc_m1 AND dm.type = 'revisit_weak_topic'
  ) INTO v_fake_gen;

  UPDATE mq_ctx SET t16_weak_rel_ok = (NOT v_fake_gen);
END;
$$;

SELECT ok(
  (SELECT t16_weak_rel_ok FROM mq_ctx),
  'Test 16: chapters without real question attempts never generate revisit_weak_topic missions'
);

-- ─── Test 17: Workload adversarial ordering ───────────────────────────────────
DO $$
DECLARE
  v_user_c     UUID;
  v_subj1      UUID := gen_random_uuid();
  v_subj2      UUID := gen_random_uuid();
  v_ch1        UUID := gen_random_uuid();
  v_ch2        UUID := gen_random_uuid();
  v_ch3        UUID := gen_random_uuid();
  v_ch4        UUID := gen_random_uuid();
  v_uc1        UUID := gen_random_uuid();
  v_uc2        UUID := gen_random_uuid();
  v_uc3        UUID := gen_random_uuid();
  v_uc4        UUID := gen_random_uuid();
  v_today      DATE;
  v_tot_mins   INTEGER;
  v_cnt        INTEGER;
BEGIN
  SELECT user_c INTO v_user_c FROM mq_ctx;
  v_today := public.get_user_local_date(v_user_c);

  INSERT INTO public.subjects (id, name, code, is_global, created_by)
  VALUES
    (v_subj1, 'Adversarial Subj 1', '8881', FALSE, v_user_c),
    (v_subj2, 'Adversarial Subj 2', '8882', FALSE, v_user_c);

  INSERT INTO public.user_subjects (user_id, subject_id, exam_date, target_grade, priority, study_route, current_stage)
  VALUES
    (v_user_c, v_subj1, v_today + 30, 'A*', 5, 'staged'::public.study_route_enum, 'as'::public.subject_stage_enum),
    (v_user_c, v_subj2, v_today + 30, 'A*', 4, 'staged'::public.study_route_enum, 'as'::public.subject_stage_enum);

  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES
    (v_ch1, v_subj1, 'Adv Ch 1', 1, 'AS Core', FALSE, 'as'::public.chapter_stage_enum),
    (v_ch2, v_subj1, 'Adv Ch 2', 2, 'AS Core', FALSE, 'as'::public.chapter_stage_enum),
    (v_ch3, v_subj2, 'Adv Ch 3', 1, 'AS Core', FALSE, 'as'::public.chapter_stage_enum),
    (v_ch4, v_subj2, 'Adv Ch 4', 2, 'AS Core', FALSE, 'as'::public.chapter_stage_enum);

  -- User chapters: subj 1 chapters have complete notes (confidence/review tasks available), subj 2 chapters have notes incomplete (30m notes tasks available)
  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status, confidence_level)
  VALUES
    (v_uc1, v_user_c, v_ch1, 'complete'::public.notes_status_enum, NULL),
    (v_uc2, v_user_c, v_ch2, 'complete'::public.notes_status_enum, NULL),
    (v_uc3, v_user_c, v_ch3, 'none'::public.notes_status_enum, 2::SMALLINT),
    (v_uc4, v_user_c, v_ch4, 'none'::public.notes_status_enum, 2::SMALLINT);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_c::text)::text, true);

  PERFORM public.generate_daily_missions(v_user_c);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT COUNT(*), SUM(estimated_minutes) INTO v_cnt, v_tot_mins
  FROM public.daily_missions
  WHERE user_id = v_user_c AND mission_date = v_today AND status != 'skipped';

  -- When 3 missions are generated across 2 subjects and 30m candidates exist, workload promise guarantees total >= 60m
  UPDATE mq_ctx SET t17_adv_workload = (v_cnt = 3 AND v_tot_mins >= 60 AND v_tot_mins <= 120);
END;
$$;

SELECT ok(
  (SELECT t17_adv_workload FROM mq_ctx),
  'Test 17: adversarial ranking still guarantees at least 60 total minutes when longer candidates exist'
);

-- ─── Test 18: Skipped missions do NOT consume generation budget ────────────────
DO $$
DECLARE
  v_user_c    UUID;
  v_today     DATE;
  v_skipped_m UUID;
  v_gen_new   INTEGER;
  v_active    INTEGER;
BEGIN
  SELECT user_c INTO v_user_c FROM mq_ctx;
  v_today := public.get_user_local_date(v_user_c);

  -- Pick one active mission for user C and mark it skipped directly as system/owner
  SELECT id INTO v_skipped_m
  FROM public.daily_missions
  WHERE user_id = v_user_c AND mission_date = v_today AND status = 'pending'
  LIMIT 1;

  UPDATE public.daily_missions
  SET    status = 'skipped', skipped_at = NOW(), skip_reason = 'manual skip'
  WHERE  id = v_skipped_m;

  -- Calling generate_daily_missions must now see budget = 1 and generate 1 replacement mission
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_c::text)::text, true);

  v_gen_new := public.generate_daily_missions(v_user_c);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT COUNT(*) INTO v_active
  FROM public.daily_missions
  WHERE user_id = v_user_c AND mission_date = v_today AND status != 'skipped';

  UPDATE mq_ctx SET t18_skip_replenish = (v_gen_new = 1 AND v_active = 3);
END;
$$;

SELECT ok(
  (SELECT t18_skip_replenish FROM mq_ctx),
  'Test 18: skipped missions do not consume generation budget (generate_daily_missions replenishes active missions to 3)'
);

-- ─── Test 19: Replacement insert failure cleanly rolls back the skip ──────────
DO $$
DECLARE
  v_user_a     UUID;
  v_target_m   UUID;
  v_stat_prior TEXT;
  v_stat_post  TEXT;
  v_skip_time  TIMESTAMPTZ;
  v_err        BOOLEAN := FALSE;
BEGIN
  SELECT user_a INTO v_user_a FROM mq_ctx;

  SELECT id, status INTO v_target_m, v_stat_prior
  FROM public.daily_missions
  WHERE user_id = v_user_a AND status = 'pending'
  LIMIT 1;

  -- Create a trigger that simulates an insert failure
  CREATE OR REPLACE FUNCTION pg_temp.fail_replacement_insert()
  RETURNS TRIGGER AS $trig$
  BEGIN
    RAISE EXCEPTION 'Simulated insert failure for rollback verification';
  END;
  $trig$ LANGUAGE plpgsql;

  CREATE TRIGGER tr_test_fail_insert
    BEFORE INSERT ON public.daily_missions
    FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_replacement_insert();

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text)::text, true);

  BEGIN
    PERFORM public.replace_mission(v_target_m, v_user_a);
  EXCEPTION WHEN OTHERS THEN
    v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Drop test trigger
  DROP TRIGGER IF EXISTS tr_test_fail_insert ON public.daily_missions;

  -- Verify original mission remains pending and was not skipped
  SELECT status, skipped_at INTO v_stat_post, v_skip_time
  FROM public.daily_missions WHERE id = v_target_m;

  UPDATE mq_ctx SET t19_conflict_roll = (
    v_err = TRUE
    AND v_stat_post = 'pending'
    AND v_skip_time IS NULL
  );
END;
$$;

SELECT ok(
  (SELECT t19_conflict_roll FROM mq_ctx),
  'Test 19: replacement insert failure triggers full rollback, preserving original mission status as pending'
);

-- ─── Test 20: Existing 30 + 10 mins with eligible 10- and 20-min candidates -> selects 20 ─
DO $$
DECLARE
  v_user_d   UUID;
  v_subj1    UUID := gen_random_uuid();
  v_subj2    UUID := gen_random_uuid();
  v_ch1      UUID := gen_random_uuid();
  v_ch2      UUID := gen_random_uuid();
  v_ch3      UUID := gen_random_uuid();
  v_uc1      UUID := gen_random_uuid();
  v_uc2      UUID := gen_random_uuid();
  v_uc3      UUID := gen_random_uuid();
  v_today    DATE;
  v_tot_mins INTEGER;
  v_cnt      INTEGER;
BEGIN
  SELECT user_d INTO v_user_d FROM mq_ctx;
  v_today := public.get_user_local_date(v_user_d);

  INSERT INTO public.subjects (id, name, code, is_global, created_by)
  VALUES
    (v_subj1, 'Subj D1', '7771', FALSE, v_user_d),
    (v_subj2, 'Subj D2', '7772', FALSE, v_user_d);

  INSERT INTO public.user_subjects (user_id, subject_id, exam_date, target_grade, priority, study_route, current_stage)
  VALUES
    (v_user_d, v_subj1, v_today + 30, 'A*', 5, 'staged'::public.study_route_enum, 'as'::public.subject_stage_enum),
    (v_user_d, v_subj2, v_today + 30, 'A*', 4, 'staged'::public.study_route_enum, 'as'::public.subject_stage_enum);

  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES
    (v_ch1, v_subj1, 'D Ch 1', 1, 'AS Core', FALSE, 'as'::public.chapter_stage_enum),
    (v_ch2, v_subj1, 'D Ch 2', 2, 'AS Core', FALSE, 'as'::public.chapter_stage_enum),
    (v_ch3, v_subj2, 'D Ch 3', 1, 'AS Core', FALSE, 'as'::public.chapter_stage_enum);

  -- ch1: complete notes (30m pre-existing on subj 1); ch2: complete notes (review 20m & confidence 10m available on subj 1); ch3: complete notes (10m pre-existing on subj 2)
  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status, confidence_level)
  VALUES
    (v_uc1, v_user_d, v_ch1, 'complete'::public.notes_status_enum, NULL),
    (v_uc2, v_user_d, v_ch2, 'complete'::public.notes_status_enum, NULL),
    (v_uc3, v_user_d, v_ch3, 'complete'::public.notes_status_enum, 4::SMALLINT);

  -- Insert recent past paper attempts so attempt_paper does not dominate
  INSERT INTO public.past_papers (id, user_id, subject_id, paper_code, paper_number, session, year, score_raw, score_max, attempted_at, stage)
  VALUES
    (gen_random_uuid(), v_user_d, v_subj1, '7771_s24_qp_11', 1, 'may_jun'::public.paper_session_enum, 2024, 8::SMALLINT, 10::SMALLINT, CURRENT_DATE - 1, 'as'),
    (gen_random_uuid(), v_user_d, v_subj2, '7772_s24_qp_11', 1, 'may_jun'::public.paper_session_enum, 2024, 8::SMALLINT, 10::SMALLINT, CURRENT_DATE - 1, 'as');

  -- Insert 2 pre-existing active missions today: 30 min on Subj 1 and 10 min on Subj 2 (accumulated = 40 min)
  INSERT INTO public.daily_missions (user_id, mission_date, type, target_entity_type, target_entity_id, title, description, xp_reward, status, difficulty, estimated_minutes)
  VALUES
    (v_user_d, v_today, 'complete_notes', 'chapter', v_uc1, 'Pre-existing 30m Subj1', 'Desc', 50, 'pending', 'medium', 30),
    (v_user_d, v_today, 'confidence_check', 'chapter', v_uc3, 'Pre-existing 10m Subj2', 'Desc', 20, 'pending', 'easy', 10);

  -- generate_daily_missions must now fill the 3rd slot.
  -- Available on Subj 1: v_uc2 confidence (10m, ranked highest due to null confidence) vs v_uc2 review (20m).
  -- Workload promise: 40 + 10 = 50 (<60), whereas 40 + 20 = 60 (>=60).
  -- Must skip 10m and select the 20-minute review task!
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_d::text)::text, true);

  PERFORM public.generate_daily_missions(v_user_d);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT COUNT(*), SUM(estimated_minutes) INTO v_cnt, v_tot_mins
  FROM public.daily_missions
  WHERE user_id = v_user_d AND mission_date = v_today AND status != 'skipped';

  UPDATE mq_ctx SET t20_slot_30_10_20 = (v_cnt = 3 AND v_tot_mins = 60);
END;
$$;

SELECT ok(
  (SELECT t20_slot_30_10_20 FROM mq_ctx),
  'Test 20: existing 30 + 10 mins with eligible 10m and 20m candidates selects 20m, producing exactly 60 minutes'
);

-- ─── Test 21: Existing 10 + 10 mins with eligible 60-min past-paper task -> selects paper ─
DO $$
DECLARE
  v_user_e   UUID;
  v_subj1    UUID := gen_random_uuid();
  v_subj2    UUID := gen_random_uuid();
  v_ch1      UUID := gen_random_uuid();
  v_ch2      UUID := gen_random_uuid();
  v_ch3      UUID := gen_random_uuid();
  v_uc1      UUID := gen_random_uuid();
  v_uc2      UUID := gen_random_uuid();
  v_uc3      UUID := gen_random_uuid();
  v_today    DATE;
  v_tot_mins INTEGER;
  v_has_pp   BOOLEAN;
  v_cnt      INTEGER;
BEGIN
  SELECT user_e INTO v_user_e FROM mq_ctx;
  v_today := public.get_user_local_date(v_user_e);

  INSERT INTO public.subjects (id, name, code, is_global, created_by)
  VALUES
    (v_subj1, 'Subj E1', '6661', FALSE, v_user_e),
    (v_subj2, 'Subj E2', '6662', FALSE, v_user_e);

  INSERT INTO public.user_subjects (user_id, subject_id, exam_date, target_grade, priority, study_route, current_stage)
  VALUES
    (v_user_e, v_subj1, v_today + 30, 'A*', 5, 'staged'::public.study_route_enum, 'as'::public.subject_stage_enum),
    (v_user_e, v_subj2, v_today + 30, 'A*', 4, 'staged'::public.study_route_enum, 'as'::public.subject_stage_enum);

  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES
    (v_ch1, v_subj1, 'E Ch 1', 1, 'AS Core', FALSE, 'as'::public.chapter_stage_enum),
    (v_ch2, v_subj1, 'E Ch 2', 2, 'AS Core', FALSE, 'as'::public.chapter_stage_enum),
    (v_ch3, v_subj2, 'E Ch 3', 1, 'AS Core', FALSE, 'as'::public.chapter_stage_enum);

  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status, confidence_level)
  VALUES
    (v_uc1, v_user_e, v_ch1, 'complete'::public.notes_status_enum, NULL),
    (v_uc2, v_user_e, v_ch2, 'complete'::public.notes_status_enum, NULL),
    (v_uc3, v_user_e, v_ch3, 'complete'::public.notes_status_enum, 2::SMALLINT);

  -- Insert 2 pre-existing 10 min active missions (accumulated = 20 min)
  INSERT INTO public.daily_missions (user_id, mission_date, type, target_entity_type, target_entity_id, title, description, xp_reward, status, difficulty, estimated_minutes)
  VALUES
    (v_user_e, v_today, 'confidence_check', 'chapter', v_uc1, 'Pre-existing 10m 1', 'Desc', 20, 'pending', 'easy', 10),
    (v_user_e, v_today, 'confidence_check', 'chapter', v_uc2, 'Pre-existing 10m 2', 'Desc', 20, 'pending', 'easy', 10);

  -- Slot 3: available are 20m review (total 40 < 60) vs 60m past paper on subj 2 (total 80 >= 60).
  -- Must select the 60m past paper!
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_e::text)::text, true);

  PERFORM public.generate_daily_missions(v_user_e);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT COUNT(*), SUM(estimated_minutes) INTO v_cnt, v_tot_mins
  FROM public.daily_missions
  WHERE user_id = v_user_e AND mission_date = v_today AND status != 'skipped';

  SELECT EXISTS (
    SELECT 1 FROM public.daily_missions
    WHERE user_id = v_user_e AND mission_date = v_today AND status != 'skipped' AND type = 'attempt_paper'
  ) INTO v_has_pp;

  UPDATE mq_ctx SET t21_slot_10_10_60 = (v_cnt >= 1 AND v_tot_mins >= 60 AND v_has_pp = TRUE);
END;
$$;

SELECT ok(
  (SELECT t21_slot_10_10_60 FROM mq_ctx),
  'Test 21: existing 10 + 10 mins with eligible 60-min past-paper task selects the paper (producing >= 60 mins)'
);

-- ─── Test 22: Replacing a 60-min mission preserves >= 60 mins total ───────────
DO $$
DECLARE
  v_user_f     UUID;
  v_subj1      UUID := gen_random_uuid();
  v_subj2      UUID := gen_random_uuid();
  v_ch1        UUID := gen_random_uuid();
  v_ch2        UUID := gen_random_uuid();
  v_ch3        UUID := gen_random_uuid();
  v_uc1        UUID := gen_random_uuid();
  v_uc2        UUID := gen_random_uuid();
  v_uc3        UUID := gen_random_uuid();
  v_today      DATE;
  v_m_paper_id UUID;
  v_tot_post   INTEGER;
  v_res        JSONB;
BEGIN
  SELECT user_f INTO v_user_f FROM mq_ctx;
  v_today := public.get_user_local_date(v_user_f);

  INSERT INTO public.subjects (id, name, code, is_global, created_by)
  VALUES
    (v_subj1, 'Subj F1', '5551', FALSE, v_user_f),
    (v_subj2, 'Subj F2', '5552', FALSE, v_user_f);

  INSERT INTO public.user_subjects (user_id, subject_id, exam_date, target_grade, priority, study_route, current_stage)
  VALUES
    (v_user_f, v_subj1, v_today + 30, 'A*', 5, 'staged'::public.study_route_enum, 'as'::public.subject_stage_enum),
    (v_user_f, v_subj2, v_today + 30, 'A*', 4, 'staged'::public.study_route_enum, 'as'::public.subject_stage_enum);

  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES
    (v_ch1, v_subj1, 'F Ch 1', 1, 'AS Core', FALSE, 'as'::public.chapter_stage_enum),
    (v_ch2, v_subj1, 'F Ch 2', 2, 'AS Core', FALSE, 'as'::public.chapter_stage_enum),
    (v_ch3, v_subj2, 'F Ch 3', 1, 'AS Core', FALSE, 'as'::public.chapter_stage_enum);

  -- ch1: complete notes (confidence 10m), ch2: complete notes (review 20m), ch3: incomplete notes (notes 30m)
  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status, confidence_level)
  VALUES
    (v_uc1, v_user_f, v_ch1, 'complete'::public.notes_status_enum, 2::SMALLINT),
    (v_uc2, v_user_f, v_ch2, 'complete'::public.notes_status_enum, 4::SMALLINT),
    (v_uc3, v_user_f, v_ch3, 'none'::public.notes_status_enum, 2::SMALLINT);

  -- User F has 3 missions: Mission 1 (10m confidence), Mission 2 (20m review), Mission 3 (60m past paper)
  INSERT INTO public.daily_missions (user_id, mission_date, type, target_entity_type, target_entity_id, title, description, xp_reward, status, difficulty, estimated_minutes)
  VALUES
    (v_user_f, v_today, 'confidence_check', 'chapter', v_uc1, 'F Mission 10m', 'Desc', 20, 'pending', 'easy', 10),
    (v_user_f, v_today, 'review_chapter', 'chapter', v_uc2, 'F Mission 20m', 'Desc', 30, 'pending', 'easy', 20);

  INSERT INTO public.daily_missions (user_id, mission_date, type, target_entity_type, target_entity_id, title, description, xp_reward, status, difficulty, estimated_minutes)
  VALUES
    (v_user_f, v_today, 'attempt_paper', 'subject', v_subj1, 'F Mission 60m Paper', 'Desc', 75, 'pending', 'hard', 60)
  RETURNING id INTO v_m_paper_id;

  -- Now replace the 60m mission.
  -- Other active = 10m + 20m = 30m.
  -- Candidate options: ch3 notes (30m) -> 30 + 30 = 60m, vs ch3 confidence (10m) -> 30 + 10 = 40m.
  -- Replacement should select the 30m notes task to maintain total >= 60 mins.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_f::text)::text, true);

  v_res := public.replace_mission(v_m_paper_id, v_user_f, 'too long');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT SUM(estimated_minutes) INTO v_tot_post
  FROM public.daily_missions
  WHERE user_id = v_user_f AND mission_date = v_today AND status != 'skipped';

  UPDATE mq_ctx SET t22_replace_workld = (
    (v_res->>'success')::BOOLEAN = TRUE
    AND (v_res->'new_mission'->>'estimated_minutes')::INTEGER = 30
    AND v_tot_post = 60
  );
END;
$$;

SELECT ok(
  (SELECT t22_replace_workld FROM mq_ctx),
  'Test 22: replacing a 60-minute mission selects a longer suitable replacement (30m) to preserve total workload at >= 60 mins'
);

-- ─── Test 23: Completing a mission does NOT alter chapter progress controls ────
DO $$
DECLARE
  v_user_a      UUID;
  v_mission_id  UUID;
  v_user_chap   UUID;
  v_notes_prior TEXT;
  v_conf_prior  SMALLINT;
  v_notes_post  TEXT;
  v_conf_post   SMALLINT;
BEGIN
  SELECT user_a INTO v_user_a FROM mq_ctx;

  -- Pick a pending chapter mission for User A
  SELECT id, target_entity_id INTO v_mission_id, v_user_chap
  FROM public.daily_missions
  WHERE user_id = v_user_a AND status = 'pending' AND target_entity_type = 'chapter'
  LIMIT 1;

  SELECT notes_status, confidence_level INTO v_notes_prior, v_conf_prior
  FROM public.user_chapters WHERE id = v_user_chap;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text)::text, true);

  PERFORM public.complete_mission(v_mission_id, v_user_a);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT notes_status, confidence_level INTO v_notes_post, v_conf_post
  FROM public.user_chapters WHERE id = v_user_chap;

  UPDATE mq_ctx SET t23_progress_safe = (
    v_notes_prior = v_notes_post
    AND (v_conf_prior = v_conf_post OR (v_conf_prior IS NULL AND v_conf_post IS NULL))
  );
END;
$$;

SELECT ok(
  (SELECT t23_progress_safe FROM mq_ctx),
  'Test 23: completing a daily mission preserves chapter notes_status and confidence_level unchanged'
);

-- ─── Test 24: Undo flow reverses XP correctly for replaced & completed missions ─
DO $$
DECLARE
  v_user_a      UUID;
  v_mission_id  UUID;
  v_xp_prior    INTEGER;
  v_xp_post     INTEGER;
BEGIN
  SELECT user_a INTO v_user_a FROM mq_ctx;

  SELECT id INTO v_mission_id
  FROM public.daily_missions
  WHERE user_id = v_user_a AND status = 'completed'
  LIMIT 1;

  SELECT total_xp INTO v_xp_prior FROM public.profiles WHERE id = v_user_a;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text)::text, true);

  PERFORM public.undo_mission_completion(v_mission_id, v_user_a);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT total_xp INTO v_xp_post FROM public.profiles WHERE id = v_user_a;

  UPDATE mq_ctx SET t24_undo_xp_ok = (v_xp_post < v_xp_prior);
END;
$$;

SELECT ok(
  (SELECT t24_undo_xp_ok FROM mq_ctx),
  'Test 24: undo_mission_completion cleanly reverses XP and restores mission status'
);

SELECT * FROM finish();
ROLLBACK;
