-- ============================================================
-- DATABASE TESTS: Undo Mission Completion & XP Accounting
--
-- Run via: supabase test db
-- All changes roll back — no data is persisted.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(18);

-- ─── TEMP TABLE ────────────────────────────────────────────────────────────

CREATE TEMP TABLE undo_ctx (
  user_id           UUID NOT NULL,
  subj_id           UUID NOT NULL DEFAULT gen_random_uuid(),
  us_id             UUID,
  chapter_id        UUID NOT NULL DEFAULT gen_random_uuid(),
  uc_id             UUID NOT NULL DEFAULT gen_random_uuid(),
  mission_id        UUID NOT NULL DEFAULT gen_random_uuid(),
  -- test flags
  t1_xp_reversed    BOOLEAN DEFAULT FALSE,
  t2_bonus_reversed BOOLEAN DEFAULT FALSE,
  t3_ach_reversed   BOOLEAN DEFAULT FALSE,
  t4_multi_cycle    BOOLEAN DEFAULT FALSE,
  t5_ledger_match   BOOLEAN DEFAULT FALSE,
  t6_wrong_date_rej BOOLEAN DEFAULT FALSE,
  t7_dup_undo       BOOLEAN DEFAULT FALSE,
  t8_expired_undo   BOOLEAN DEFAULT FALSE,
  t9_diff_day_undo  BOOLEAN DEFAULT FALSE,
  t10_unauth_undo   BOOLEAN DEFAULT FALSE,
  t11_streak_zero   BOOLEAN DEFAULT FALSE,
  t12_streak_keep   BOOLEAN DEFAULT FALSE,
  t13_recalc_auth   BOOLEAN DEFAULT FALSE,
  t14_singapore_pp  BOOLEAN DEFAULT FALSE,
  t15_milestone_rev BOOLEAN DEFAULT FALSE,
  t16_no_upd_streak BOOLEAN DEFAULT FALSE,
  t17_no_award_enum BOOLEAN DEFAULT FALSE,
  t18_no_award_text BOOLEAN DEFAULT FALSE
) ON COMMIT DROP;

GRANT ALL ON TABLE undo_ctx TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_chapters TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_missions TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subject_stage_results TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_subjects TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chapters TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_achievements TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.achievement_definitions TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.xp_events TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.streaks TO authenticated, anon;

INSERT INTO undo_ctx (user_id) VALUES ('b0210001-0000-0000-0000-000000000001');

-- ─── SETUP: synthetic user ────────────────────────────────────────────────

DO $$
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'b0210001-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'undo_test@atlas.test', '',
    NOW(),
    '{"provider":"email","providers":["email"]}', '{}',
    NOW(), NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
  SET    total_xp = 0, current_level = 1, timezone = 'UTC'
  WHERE  id = 'b0210001-0000-0000-0000-000000000001';
END;
$$;

-- ─── SETUP: subject, enrollment, chapter, user_chapter, missions ──────────

DO $$
DECLARE
  v_user  UUID;
  v_subj  UUID;
  v_us_id UUID;
  v_ch_id UUID;
  v_uc_id UUID;
  v_miss  UUID;
  v_today DATE;
BEGIN
  SELECT user_id, subj_id, chapter_id, uc_id, mission_id
  INTO   v_user, v_subj, v_ch_id, v_uc_id, v_miss
  FROM   undo_ctx;

  v_today := public.get_user_local_date(v_user);

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj, 'Undo Test Subject', FALSE, v_user);

  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES (v_ch_id, v_subj, 'Undo Test Chapter', 1, 'Core', FALSE, 'as');

  INSERT INTO public.user_subjects (user_id, subject_id, priority, exam_date, study_route, current_stage)
  VALUES (v_user, v_subj, 3, CURRENT_DATE + 90, 'staged', 'as')
  RETURNING id INTO v_us_id;

  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status)
  VALUES (v_uc_id, v_user, v_ch_id, 'none');

  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type,
    target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty
  ) VALUES (
    v_miss, v_user, v_today, 'complete_notes',
    'chapter', v_uc_id,
    'Undo Test Mission', 'Complete notes', 50, 'pending', 'medium'
  );

  UPDATE undo_ctx SET us_id = v_us_id;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════
-- TEST 1: Normal Mission: +50 awarded, undo reverses -50
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user      UUID;
  v_miss      UUID;
  v_uc_id     UUID;
  v_miss2     UUID := gen_random_uuid();
  v_today     DATE;
  v_xp_before INTEGER;
  v_xp_after  INTEGER;
  v_xp_undone INTEGER;
  v_ret       JSONB;
BEGIN
  SELECT user_id, mission_id, uc_id INTO v_user, v_miss, v_uc_id FROM undo_ctx;
  v_today := public.get_user_local_date(v_user);

  -- Insert a 2nd pending mission so completing mission 1 does NOT trigger all-missions bonus
  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type, target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty
  ) VALUES (
    v_miss2, v_user, v_today, 'review_chapter', 'chapter', v_uc_id,
    'Second Mission', 'Desc', 30, 'pending', 'easy'
  );

  SELECT total_xp INTO v_xp_before FROM public.profiles WHERE id = v_user;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- Complete normal mission (+50)
  v_ret := public.complete_mission(v_miss, v_user);
  SELECT total_xp INTO v_xp_after FROM public.profiles WHERE id = v_user;

  -- Undo normal mission (-50)
  PERFORM public.undo_mission_completion(v_miss, v_user);
  SELECT total_xp INTO v_xp_undone FROM public.profiles WHERE id = v_user;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Clean up second mission
  DELETE FROM public.daily_missions WHERE id = v_miss2;

  UPDATE undo_ctx SET t1_xp_reversed = (
    (v_xp_after - v_xp_before = (v_ret->>'total_xp_awarded')::INTEGER) AND
    (v_xp_undone = v_xp_before) AND
    ((v_ret->>'mission_xp')::INTEGER = 50) AND
    ((v_ret->>'daily_bonus_xp')::INTEGER = 0)
  );
END;
$$;

SELECT ok((SELECT t1_xp_reversed FROM undo_ctx),
  'Normal mission: +50 awarded, undo reverses exactly -50');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 2: Final Mission: +50 mission + 25 bonus (+75 total), undo reverses -75
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user      UUID;
  v_miss      UUID;
  v_xp_before INTEGER;
  v_xp_after  INTEGER;
  v_xp_undone INTEGER;
  v_ret       JSONB;
BEGIN
  SELECT user_id, mission_id INTO v_user, v_miss FROM undo_ctx;

  SELECT total_xp INTO v_xp_before FROM public.profiles WHERE id = v_user;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- Only 1 pending mission remains, so completing it awards 50 + 25 bonus = +75
  v_ret := public.complete_mission(v_miss, v_user);
  SELECT total_xp INTO v_xp_after FROM public.profiles WHERE id = v_user;

  -- Undo reverses 75
  PERFORM public.undo_mission_completion(v_miss, v_user);
  SELECT total_xp INTO v_xp_undone FROM public.profiles WHERE id = v_user;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t2_bonus_reversed = (
    ((v_ret->>'mission_xp')::INTEGER = 50) AND
    ((v_ret->>'daily_bonus_xp')::INTEGER = 25) AND
    (v_xp_after - v_xp_before = (v_ret->>'total_xp_awarded')::INTEGER) AND
    (v_xp_undone = v_xp_before)
  );
END;
$$;

SELECT ok((SELECT t2_bonus_reversed FROM undo_ctx),
  'Final mission: +50 mission + 25 bonus awarded (+75 total), undo reverses -75');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 3: Achievement unlocked during completion is reversed and removed during undo
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user      UUID;
  v_miss      UUID;
  v_uc_id     UUID;
  v_xp_before INTEGER;
  v_xp_after  INTEGER;
  v_xp_undone INTEGER;
  v_ach_count INTEGER;
  v_ret       JSONB;
BEGIN
  SELECT user_id, mission_id, uc_id INTO v_user, v_miss, v_uc_id FROM undo_ctx;

  -- Ensure first_blood achievement is NOT unlocked yet
  DELETE FROM public.user_achievements WHERE user_id = v_user AND achievement_key = 'first_blood';
  -- Set user_chapter to notes_status = 'complete' so first_blood qualifies on check
  UPDATE public.user_chapters SET notes_status = 'complete' WHERE id = v_uc_id;

  SELECT total_xp INTO v_xp_before FROM public.profiles WHERE id = v_user;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- Complete mission -> unlocks first_blood (+100 XP)
  v_ret := public.complete_mission(v_miss, v_user);
  SELECT total_xp INTO v_xp_after FROM public.profiles WHERE id = v_user;

  -- Undo mission -> reverses mission, bonus, and first_blood achievement
  PERFORM public.undo_mission_completion(v_miss, v_user);
  SELECT total_xp INTO v_xp_undone FROM public.profiles WHERE id = v_user;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Check that user_achievements record for first_blood was removed
  SELECT COUNT(*) INTO v_ach_count
  FROM   public.user_achievements
  WHERE  user_id = v_user AND achievement_key = 'first_blood';

  UPDATE undo_ctx SET t3_ach_reversed = (
    ((v_ret->>'achievement_xp')::INTEGER >= 100) AND
    (v_ach_count = 0) AND
    (v_xp_undone = v_xp_before)
  );
END;
$$;

SELECT ok((SELECT t3_ach_reversed FROM undo_ctx),
  'Achievement unlocked during completion is reversed and removed during undo');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 4: Two complete/undo cycles with identical results (attempt tracking)
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user    UUID;
  v_miss    UUID;
  v_ret1    JSONB;
  v_ret2    JSONB;
  v_xp_mid  INTEGER;
  v_xp_end  INTEGER;
BEGIN
  SELECT user_id, mission_id INTO v_user, v_miss FROM undo_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- Cycle 1: Complete then Undo
  v_ret1 := public.complete_mission(v_miss, v_user);
  PERFORM public.undo_mission_completion(v_miss, v_user);
  SELECT total_xp INTO v_xp_mid FROM public.profiles WHERE id = v_user;

  -- Cycle 2: Complete again then Undo again
  v_ret2 := public.complete_mission(v_miss, v_user);
  PERFORM public.undo_mission_completion(v_miss, v_user);
  SELECT total_xp INTO v_xp_end FROM public.profiles WHERE id = v_user;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t4_multi_cycle = (
    v_xp_mid = v_xp_end AND
    (v_ret1->>'mission_xp' = v_ret2->>'mission_xp') AND
    (v_ret1->>'daily_bonus_xp' = v_ret2->>'daily_bonus_xp')
  );
END;
$$;

SELECT ok((SELECT t4_multi_cycle FROM undo_ctx),
  'Two complete/undo cycles succeed with identical results without old reward collisions');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 5: Profile total_xp equals SUM(xp_amount) of xp_events after every step
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user        UUID;
  v_miss        UUID;
  v_profile_xp  INTEGER;
  v_ledger_xp   INTEGER;
  v_step1_match BOOLEAN;
  v_step2_match BOOLEAN;
BEGIN
  SELECT user_id, mission_id INTO v_user, v_miss FROM undo_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- Step 1: Complete
  PERFORM public.complete_mission(v_miss, v_user);
  SELECT total_xp INTO v_profile_xp FROM public.profiles WHERE id = v_user;
  SELECT COALESCE(SUM(xp_amount), 0) INTO v_ledger_xp FROM public.xp_events WHERE user_id = v_user;
  v_step1_match := (v_profile_xp = v_ledger_xp);

  -- Step 2: Undo
  PERFORM public.undo_mission_completion(v_miss, v_user);
  SELECT total_xp INTO v_profile_xp FROM public.profiles WHERE id = v_user;
  SELECT COALESCE(SUM(xp_amount), 0) INTO v_ledger_xp FROM public.xp_events WHERE user_id = v_user;
  v_step2_match := (v_profile_xp = v_ledger_xp);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t5_ledger_match = (v_step1_match AND v_step2_match);
END;
$$;

SELECT ok((SELECT t5_ledger_match FROM undo_ctx),
  'Profile total_xp equals exact sum of xp_events after completion and undo (ledger invariant)');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 6: complete_mission rejects mission from different local calendar day
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user      UUID;
  v_uc        UUID;
  v_old_miss  UUID := gen_random_uuid();
  v_xp_before INTEGER;
  v_xp_after  INTEGER;
  v_err       BOOLEAN := FALSE;
BEGIN
  SELECT user_id, uc_id INTO v_user, v_uc FROM undo_ctx;

  -- Create a mission dated yesterday
  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type, target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty
  ) VALUES (
    v_old_miss, v_user, CURRENT_DATE - 1, 'review_chapter', 'chapter', v_uc,
    'Yesterday Mission', 'desc', 30, 'pending', 'easy'
  );

  SELECT total_xp INTO v_xp_before FROM public.profiles WHERE id = v_user;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  BEGIN
    PERFORM public.complete_mission(v_old_miss, v_user);
  EXCEPTION
    WHEN SQLSTATE 'P0006' THEN v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT total_xp INTO v_xp_after FROM public.profiles WHERE id = v_user;

  UPDATE undo_ctx SET t6_wrong_date_rej = (v_err AND v_xp_before = v_xp_after);
END;
$$;

SELECT ok((SELECT t6_wrong_date_rej FROM undo_ctx),
  'complete_mission rejects mission from different local date and awards no XP');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 7: Duplicate undo attempt raises P0007
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user UUID;
  v_miss UUID;
  v_err  BOOLEAN := FALSE;
BEGIN
  SELECT user_id, mission_id INTO v_user, v_miss FROM undo_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  BEGIN
    PERFORM public.undo_mission_completion(v_miss, v_user);
  EXCEPTION
    WHEN SQLSTATE 'P0007' THEN v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t7_dup_undo = v_err;
END;
$$;

SELECT ok((SELECT t7_dup_undo FROM undo_ctx),
  'Duplicate undo attempt raises P0007');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 8: Undo after 10 minutes raises P0006
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user  UUID;
  v_miss  UUID := gen_random_uuid();
  v_uc    UUID;
  v_today DATE;
  v_err   BOOLEAN := FALSE;
BEGIN
  SELECT user_id, uc_id INTO v_user, v_uc FROM undo_ctx;
  v_today := public.get_user_local_date(v_user);

  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type, target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty, completed_at, completion_attempt
  ) VALUES (
    v_miss, v_user, v_today, 'review_chapter', 'chapter', v_uc,
    'Expired Mission', 'desc', 30, 'completed', 'easy', NOW() - INTERVAL '11 minutes', 1
  );

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  BEGIN
    PERFORM public.undo_mission_completion(v_miss, v_user);
  EXCEPTION
    WHEN SQLSTATE 'P0006' THEN v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t8_expired_undo = v_err;
END;
$$;

SELECT ok((SELECT t8_expired_undo FROM undo_ctx),
  'Undo after 10-minute window raises P0006');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 9: Undo on a different calendar day raises P0006
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user UUID;
  v_uc   UUID;
  v_miss UUID := gen_random_uuid();
  v_err  BOOLEAN := FALSE;
BEGIN
  SELECT user_id, uc_id INTO v_user, v_uc FROM undo_ctx;

  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type, target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty, completed_at, completion_attempt
  ) VALUES (
    v_miss, v_user, CURRENT_DATE - 1, 'complete_notes', 'chapter', v_uc,
    'Yesterday Mission', 'desc', 50, 'completed', 'medium', NOW() - INTERVAL '5 minutes', 1
  );

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  BEGIN
    PERFORM public.undo_mission_completion(v_miss, v_user);
  EXCEPTION
    WHEN SQLSTATE 'P0006' THEN v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t9_diff_day_undo = v_err;
END;
$$;

SELECT ok((SELECT t9_diff_day_undo FROM undo_ctx),
  'Undo on a different calendar day raises P0006');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 10: Unauthenticated call raises 42501 Unauthorized
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user UUID;
  v_miss UUID;
  v_err  BOOLEAN := FALSE;
BEGIN
  SELECT user_id, mission_id INTO v_user, v_miss FROM undo_ctx;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  BEGIN
    PERFORM public.undo_mission_completion(v_miss, v_user);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN v_err := TRUE;
  END;

  UPDATE undo_ctx SET t10_unauth_undo = v_err;
END;
$$;

SELECT ok((SELECT t10_unauth_undo FROM undo_ctx),
  'Unauthenticated call to undo_mission_completion raises 42501 Unauthorized');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 11: Undo the ONLY completed mission today recalculates streak to 0
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user       UUID := gen_random_uuid();
  v_subj       UUID := gen_random_uuid();
  v_ch         UUID := gen_random_uuid();
  v_uc         UUID := gen_random_uuid();
  v_miss       UUID := gen_random_uuid();
  v_today      DATE;
  v_curr_after INTEGER;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    'streak_test1@atlas.test', '', NOW(), '{"provider":"email"}', '{}', NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles SET timezone = 'UTC', total_xp = 0, current_level = 1 WHERE id = v_user;
  v_today := public.get_user_local_date(v_user);

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj, 'Streak Subj 1', FALSE, v_user);

  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES (v_ch, v_subj, 'Streak Ch 1', 1, 'Core', FALSE, 'as');

  INSERT INTO public.user_subjects (user_id, subject_id, priority, exam_date, study_route, current_stage)
  VALUES (v_user, v_subj, 1, CURRENT_DATE + 60, 'staged', 'as');

  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status)
  VALUES (v_uc, v_user, v_ch, 'none');

  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type, target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty
  ) VALUES (
    v_miss, v_user, v_today, 'review_chapter', 'chapter', v_uc,
    'Solo Mission', 'desc', 30, 'pending', 'easy'
  );

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- 1. Complete the mission -> streak is updated to 1
  PERFORM public.complete_mission(v_miss, v_user);

  -- 2. Undo the mission -> streak recalculates to 0
  PERFORM public.undo_mission_completion(v_miss, v_user);

  SELECT current_streak INTO v_curr_after FROM public.streaks WHERE user_id = v_user;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t11_streak_zero = (v_curr_after = 0);
END;
$$;

SELECT ok((SELECT t11_streak_zero FROM undo_ctx),
  'Undoing the only completed mission today recalculates streak to 0');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 12: Undoing one mission while another remains completed preserves streak
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user       UUID := gen_random_uuid();
  v_subj       UUID := gen_random_uuid();
  v_ch         UUID := gen_random_uuid();
  v_uc         UUID := gen_random_uuid();
  v_miss1      UUID := gen_random_uuid();
  v_miss2      UUID := gen_random_uuid();
  v_today      DATE;
  v_curr_after INTEGER;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    'streak_test2@atlas.test', '', NOW(), '{"provider":"email"}', '{}', NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles SET timezone = 'UTC', total_xp = 0, current_level = 1 WHERE id = v_user;
  v_today := public.get_user_local_date(v_user);

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj, 'Streak Subj 2', FALSE, v_user);

  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES (v_ch, v_subj, 'Streak Ch 2', 1, 'Core', FALSE, 'as');

  INSERT INTO public.user_subjects (user_id, subject_id, priority, exam_date, study_route, current_stage)
  VALUES (v_user, v_subj, 1, CURRENT_DATE + 60, 'staged', 'as');

  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status)
  VALUES (v_uc, v_user, v_ch, 'none');

  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type, target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty
  ) VALUES
    (v_miss1, v_user, v_today, 'review_chapter', 'chapter', v_uc, 'M1', 'desc', 30, 'pending', 'easy'),
    (v_miss2, v_user, v_today, 'complete_notes', 'chapter', v_uc, 'M2', 'desc', 50, 'pending', 'medium');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- 1. Complete both missions
  PERFORM public.complete_mission(v_miss1, v_user);
  PERFORM public.complete_mission(v_miss2, v_user);

  -- 2. Undo mission 1 (mission 2 remains completed today)
  PERFORM public.undo_mission_completion(v_miss1, v_user);

  SELECT current_streak INTO v_curr_after FROM public.streaks WHERE user_id = v_user;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t12_streak_keep = (v_curr_after = 1);
END;
$$;

SELECT ok((SELECT t12_streak_keep FROM undo_ctx),
  'Undoing one mission when another remains completed today preserves active streak');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 13: recalculate_streak rejects unauthenticated & non-owner calls
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user     UUID;
  v_unauth   BOOLEAN := FALSE;
  v_nonowner BOOLEAN := FALSE;
BEGIN
  SELECT user_id INTO v_user FROM undo_ctx;

  -- 1. Unauthenticated call (auth.uid() IS NULL)
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  BEGIN
    PERFORM public.recalculate_streak(v_user);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN v_unauth := TRUE;
  END;

  -- 2. Non-owner call (auth.uid() != p_user_id)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text)::text, true);

  BEGIN
    PERFORM public.recalculate_streak(v_user);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN v_nonowner := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t13_recalc_auth = (v_unauth AND v_nonowner);
END;
$$;

SELECT ok((SELECT t13_recalc_auth FROM undo_ctx),
  'recalculate_streak rejects unauthenticated and non-owner calls with 42501');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 14: past_papers.attempted_at (DATE) counts towards streak in Asia/Singapore
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user       UUID := gen_random_uuid();
  v_subj       UUID := gen_random_uuid();
  v_today      DATE;
  v_curr_after INTEGER;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    'sg_test@atlas.test', '', NOW(), '{"provider":"email"}', '{}', NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles SET timezone = 'Asia/Singapore', total_xp = 0, current_level = 1 WHERE id = v_user;
  v_today := public.get_user_local_date(v_user);

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj, 'SG Subj', FALSE, v_user);

  INSERT INTO public.user_subjects (user_id, subject_id, priority, exam_date, study_route, current_stage)
  VALUES (v_user, v_subj, 1, CURRENT_DATE + 60, 'staged', 'as');

  -- Insert past paper attempted today (direct calendar DATE)
  INSERT INTO public.past_papers (
    user_id, subject_id, paper_code, year, session, score_raw, score_max, stage, attempted_at
  ) VALUES (
    v_user, v_subj, '9702_s24_qp_11', 2024, 'may_jun', 45, 50, 'as', v_today
  );

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  PERFORM public.recalculate_streak(v_user);

  SELECT current_streak INTO v_curr_after FROM public.streaks WHERE user_id = v_user;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t14_singapore_pp = (v_curr_after = 1);
END;
$$;

SELECT ok((SELECT t14_singapore_pp FROM undo_ctx),
  'past_papers.attempted_at directly as DATE correctly recalculates streak in Asia/Singapore');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 15: 7-Day streak milestone XP and longest_streak are fully reversible
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user       UUID := gen_random_uuid();
  v_subj       UUID := gen_random_uuid();
  v_ch         UUID := gen_random_uuid();
  v_uc         UUID := gen_random_uuid();
  v_miss       UUID := gen_random_uuid();
  v_today      DATE;
  v_xp_base    INTEGER;
  v_ret1       JSONB;
  v_ret2       JSONB;
  v_undo1      JSONB;
  v_undo2      JSONB;
  v_streak_mid public.streaks%ROWTYPE;
  v_streak_und public.streaks%ROWTYPE;
  v_streak_m2  public.streaks%ROWTYPE;
  v_streak_u2  public.streaks%ROWTYPE;
  v_xp_mid1    INTEGER;
  v_xp_und1    INTEGER;
  v_xp_mid2    INTEGER;
  v_xp_und2    INTEGER;
  i            INTEGER;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    'streak7_test@atlas.test', '', NOW(), '{"provider":"email"}', '{}', NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles SET timezone = 'UTC', total_xp = 0, current_level = 1 WHERE id = v_user;
  v_today := public.get_user_local_date(v_user);

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_subj, 'Milestone Subj', FALSE, v_user);

  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES (v_ch, v_subj, 'Milestone Ch', 1, 'Core', FALSE, 'as');

  INSERT INTO public.user_subjects (user_id, subject_id, priority, exam_date, study_route, current_stage)
  VALUES (v_user, v_subj, 1, CURRENT_DATE + 60, 'staged', 'as');

  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status)
  VALUES (v_uc, v_user, v_ch, 'none');

  -- 1. Setup 6 consecutive active days before today (v_today - 6 to v_today - 1)
  FOR i IN 1..6 LOOP
    INSERT INTO public.daily_missions (
      id, user_id, mission_date, type, target_entity_type, target_entity_id,
      title, description, xp_reward, status, difficulty, completed_at
    ) VALUES (
      gen_random_uuid(), v_user, v_today - i, 'review_chapter', 'chapter', v_uc,
      'Past Day ' || i, 'desc', 30, 'completed', 'easy', NOW() - (i || ' days')::INTERVAL
    );
  END LOOP;

  -- Initial streak setup: 6 days
  INSERT INTO public.streaks (user_id, current_streak, longest_streak, last_activity_date)
  VALUES (v_user, 6, 6, v_today - 1)
  ON CONFLICT (user_id) DO UPDATE SET
    current_streak = 6,
    longest_streak = 6,
    last_activity_date = v_today - 1;

  -- Today's 7th day mission
  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type, target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty
  ) VALUES (
    v_miss, v_user, v_today, 'complete_notes', 'chapter', v_uc,
    'Day 7 Mission', 'Complete notes', 50, 'pending', 'medium'
  );

  SELECT total_xp INTO v_xp_base FROM public.profiles WHERE id = v_user;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- ── CYCLE 1: Complete day 7 -> reaches streak 7 (+150 XP bonus) ───────────
  v_ret1 := public.complete_mission(v_miss, v_user);
  SELECT * INTO v_streak_mid FROM public.streaks WHERE user_id = v_user;
  SELECT total_xp INTO v_xp_mid1 FROM public.profiles WHERE id = v_user;

  -- Undo day 7 -> returns streak to 6, longest to 6, reverses 150 XP bonus
  v_undo1 := public.undo_mission_completion(v_miss, v_user);
  SELECT * INTO v_streak_und FROM public.streaks WHERE user_id = v_user;
  SELECT total_xp INTO v_xp_und1 FROM public.profiles WHERE id = v_user;

  -- ── CYCLE 2: Complete day 7 again -> reaches streak 7 again ──────────────
  v_ret2 := public.complete_mission(v_miss, v_user);
  SELECT * INTO v_streak_m2 FROM public.streaks WHERE user_id = v_user;
  SELECT total_xp INTO v_xp_mid2 FROM public.profiles WHERE id = v_user;

  -- Undo day 7 again -> returns streak to 6, longest to 6, total XP back to base
  v_undo2 := public.undo_mission_completion(v_miss, v_user);
  SELECT * INTO v_streak_u2 FROM public.streaks WHERE user_id = v_user;
  SELECT total_xp INTO v_xp_und2 FROM public.profiles WHERE id = v_user;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t15_milestone_rev = (
    -- Cycle 1 verification
    (v_streak_mid.current_streak = 7) AND
    (v_streak_mid.longest_streak = 7) AND
    ((v_ret1->>'streak_bonus_xp')::INTEGER = 150) AND
    (v_streak_und.current_streak = 6) AND
    (v_streak_und.longest_streak = 6) AND
    ((v_undo1->>'streak_bonus_xp_reversed')::INTEGER = 150) AND
    (v_xp_und1 = v_xp_base) AND

    -- Cycle 2 verification
    (v_streak_m2.current_streak = 7) AND
    (v_streak_m2.longest_streak = 7) AND
    ((v_ret2->>'streak_bonus_xp')::INTEGER = 150) AND
    (v_streak_u2.current_streak = 6) AND
    (v_streak_u2.longest_streak = 6) AND
    ((v_undo2->>'streak_bonus_xp_reversed')::INTEGER = 150) AND
    (v_xp_und2 = v_xp_base)
  );
END;
$$;

SELECT ok((SELECT t15_milestone_rev FROM undo_ctx),
  '7-day streak milestone bonus XP and longest_streak are cleanly reversible and idempotent');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 16: Authenticated role CANNOT execute update_streak directly
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user UUID;
  v_err  BOOLEAN := FALSE;
BEGIN
  SELECT user_id INTO v_user FROM undo_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  BEGIN
    PERFORM public.update_streak(v_user, NULL, NULL);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t16_no_upd_streak = v_err;
END;
$$;

SELECT ok((SELECT t16_no_upd_streak FROM undo_ctx),
  'Authenticated role cannot directly execute internal update_streak function (42501)');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 17: Authenticated role CANNOT execute award_xp (canonical enum) directly
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user UUID;
  v_err  BOOLEAN := FALSE;
BEGIN
  SELECT user_id INTO v_user FROM undo_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  BEGIN
    PERFORM public.award_xp(v_user, 50::SMALLINT, 'mission_complete'::public.xp_event_type_enum, NULL, '{}'::JSONB);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t17_no_award_enum = v_err;
END;
$$;

SELECT ok((SELECT t17_no_award_enum FROM undo_ctx),
  'Authenticated role cannot directly execute internal award_xp enum overload (42501)');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 18: Authenticated role CANNOT execute award_xp (text overload) directly
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user UUID;
  v_err  BOOLEAN := FALSE;
BEGIN
  SELECT user_id INTO v_user FROM undo_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  BEGIN
    PERFORM public.award_xp(v_user, 50, 'mission_complete', NULL, '{}'::JSONB);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE undo_ctx SET t18_no_award_text = v_err;
END;
$$;

SELECT ok((SELECT t18_no_award_text FROM undo_ctx),
  'Authenticated role cannot directly execute internal award_xp text overload (42501)');


SELECT * FROM finish();
ROLLBACK;
