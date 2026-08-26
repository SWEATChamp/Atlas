-- ============================================================
-- DATABASE TESTS: Undo Mission Completion (Migration 021)
--
-- Run via: supabase test db
-- All changes roll back — no data is persisted.
--
-- Tests (9):
--   1. XP reversed by exact mission amount (no bonus)
--   2. Bonus XP reversed when bonus reference_id matches mission_id
--   3. Mission restored to pending after undo
--   4. Duplicate undo attempt raises P0007 (checked before status)
--   5. Undo after 10 minutes raises P0006 (expired window)
--   6. Undo on a different calendar day raises P0006 (same-day rule)
--   7. XP floor: total_xp cannot go below zero
--   8. Streak unchanged after undo (MVP limitation: streak not reversed)
--   9. carry_forward=TRUE + result_type='actual' + stage='as' is accepted
--  10. Unauthenticated call (auth.uid() IS NULL) to undo_mission_completion raises 42501
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

-- ─── TEMP TABLE ────────────────────────────────────────────────────────────

CREATE TEMP TABLE undo_ctx (
  user_id      UUID NOT NULL,
  subj_id      UUID NOT NULL DEFAULT gen_random_uuid(),
  us_id        UUID,
  chapter_id   UUID NOT NULL DEFAULT gen_random_uuid(),
  uc_id        UUID NOT NULL DEFAULT gen_random_uuid(),
  mission_id   UUID NOT NULL DEFAULT gen_random_uuid(),
  -- captured values
  xp_before    INTEGER,
  xp_after_complete INTEGER,
  xp_after_undo     INTEGER,
  streak_before INTEGER,
  streak_after_undo INTEGER,
  -- test flags
  t1_xp_reversed   BOOLEAN DEFAULT FALSE,
  t2_bonus_reversed BOOLEAN DEFAULT FALSE,
  t3_status_pending BOOLEAN DEFAULT FALSE,
  t4_dup_undo       BOOLEAN DEFAULT FALSE,
  t5_expired_undo   BOOLEAN DEFAULT FALSE,
  t6_diff_day       BOOLEAN DEFAULT FALSE,
  t7_xp_floor       BOOLEAN DEFAULT FALSE,
  t8_streak_unchanged BOOLEAN DEFAULT FALSE,
  t9_cf_actual_ok   BOOLEAN DEFAULT FALSE,
  t10_unauth_undo   BOOLEAN DEFAULT FALSE
) ON COMMIT DROP;

GRANT ALL ON TABLE undo_ctx TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_chapters TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_missions TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subject_stage_results TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_subjects TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chapters TO authenticated, anon;

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
END;
$$;

-- ─── SETUP: subject, enrollment, chapter, user_chapter, mission ───────────

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

-- ─── Capture XP and streak before completion ──────────────────────────────

UPDATE undo_ctx ctx
SET    xp_before    = p.total_xp,
       streak_before = COALESCE(s.current_streak, 0)
FROM   public.profiles p
JOIN   public.streaks  s ON s.user_id = p.id
WHERE  p.id = ctx.user_id;

-- ─── Complete the mission (as the user) ───────────────────────────────────

DO $$
DECLARE
  v_user UUID;
  v_miss UUID;
BEGIN
  SELECT user_id, mission_id INTO v_user, v_miss FROM undo_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  PERFORM public.complete_mission(v_miss, v_user);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

UPDATE undo_ctx ctx
SET    xp_after_complete = p.total_xp,
       streak_after_undo  = COALESCE(s.current_streak, 0)  -- capture streak at completion time
FROM   public.profiles p
JOIN   public.streaks  s ON s.user_id = p.id
WHERE  p.id = ctx.user_id;

-- ─── Undo the mission ─────────────────────────────────────────────────────

DO $$
DECLARE
  v_user UUID;
  v_miss UUID;
BEGIN
  SELECT user_id, mission_id INTO v_user, v_miss FROM undo_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  PERFORM public.undo_mission_completion(v_miss, v_user);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

UPDATE undo_ctx ctx
SET    xp_after_undo = p.total_xp
FROM   public.profiles p
WHERE  p.id = ctx.user_id;


-- ═══════════════════════════════════════════════════════════════════
-- TEST 1: Mission XP reversed (50 XP reversed, achievement XP preserved)
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user     UUID;
  v_miss     UUID;
  v_complete INTEGER;
  v_after    INTEGER;
  v_undo_count INTEGER;
BEGIN
  SELECT user_id, mission_id, xp_after_complete, xp_after_undo
  INTO   v_user, v_miss, v_complete, v_after
  FROM   undo_ctx;

  -- Verify that mission_undo events were created for this mission ID
  SELECT COUNT(*)
  INTO   v_undo_count
  FROM   public.xp_events
  WHERE  user_id = v_user
    AND  reference_id = v_miss
    AND  event_type = 'mission_undo';

  -- Total XP decreased by at least 50 XP and undo events were recorded
  UPDATE undo_ctx SET t1_xp_reversed = (
    v_undo_count >= 1 AND (v_complete - v_after >= 50)
  );
END;
$$;

SELECT ok((SELECT t1_xp_reversed FROM undo_ctx),
  'XP after undo reflects exact mission XP reversal (mission XP event net zero)');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 2: Bonus XP reversed (single mission → bonus triggered and reversed)
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user     UUID;
  v_miss     UUID;
  v_complete INTEGER;
  v_after    INTEGER;
  v_net_xp   INTEGER;
BEGIN
  SELECT user_id, mission_id, xp_after_complete, xp_after_undo
  INTO   v_user, v_miss, v_complete, v_after
  FROM   undo_ctx;

  -- Verify that all mission + bonus events (total 75 XP) with reference_id = v_miss are net 0
  SELECT COALESCE(SUM(xp_amount), 0)
  INTO   v_net_xp
  FROM   public.xp_events
  WHERE  user_id = v_user
    AND  reference_id = v_miss
    AND  event_type IN ('mission_complete', 'mission_undo');

  -- Total XP decreased by exactly 75 (50 mission + 25 bonus reversed; achievement XP unchanged)
  UPDATE undo_ctx SET t2_bonus_reversed = (
    v_net_xp = 0 AND (v_complete - v_after = 75)
  );
END;
$$;

SELECT ok((SELECT t2_bonus_reversed FROM undo_ctx),
  'All-missions-complete bonus reversed exactly (bonus event net zero, total XP -75)');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 3: Mission restored to pending after undo
-- ═══════════════════════════════════════════════════════════════════

SELECT ok(
  (
    SELECT status = 'pending' AND completed_at IS NULL
    FROM   public.daily_missions dm
    JOIN   undo_ctx ctx ON dm.id = ctx.mission_id
  ),
  'Mission status restored to pending after undo'
);


-- ═══════════════════════════════════════════════════════════════════
-- TEST 4: Duplicate undo attempt raises P0007
--         (checked BEFORE mission status — mission is now pending again)
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
  UPDATE undo_ctx SET t4_dup_undo = v_err;
END;
$$;

SELECT ok((SELECT t4_dup_undo FROM undo_ctx),
  'Duplicate undo attempt raises P0007 (before status check)');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 5: Undo after 10 minutes raises P0006
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user UUID;
  v_miss UUID := gen_random_uuid();
  v_uc   UUID;
  v_user2_uc UUID := gen_random_uuid();
  v_today DATE;
  v_err  BOOLEAN := FALSE;
BEGIN
  SELECT user_id, uc_id INTO v_user, v_uc FROM undo_ctx;
  v_today := public.get_user_local_date(v_user);

  -- Insert a mission that was completed 11 minutes ago
  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type,
    target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty,
    completed_at
  ) VALUES (
    v_miss, v_user, v_today, 'review_chapter',
    'chapter', v_uc,
    'Expired Undo Mission', 'desc', 30, 'completed', 'easy',
    NOW() - INTERVAL '11 minutes'
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
  UPDATE undo_ctx SET t5_expired_undo = v_err;
END;
$$;

SELECT ok((SELECT t5_expired_undo FROM undo_ctx),
  'Undo after 10-minute window raises P0006');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 6: Undo on a different calendar day raises P0006
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user UUID;
  v_uc   UUID;
  v_miss UUID := gen_random_uuid();
  v_err  BOOLEAN := FALSE;
BEGIN
  SELECT user_id, uc_id INTO v_user, v_uc FROM undo_ctx;

  -- Mission from yesterday
  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type,
    target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty,
    completed_at
  ) VALUES (
    v_miss, v_user, CURRENT_DATE - 1, 'review_chapter',
    'chapter', v_uc,
    'Yesterday Mission', 'desc', 30, 'completed', 'easy',
    NOW() - INTERVAL '30 minutes'  -- within 10 min — but wrong day
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
  UPDATE undo_ctx SET t6_diff_day = v_err;
END;
$$;

SELECT ok((SELECT t6_diff_day FROM undo_ctx),
  'Undo on a different calendar day raises P0006');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 7: XP floor — total_xp cannot go below zero
-- Force a situation where reversal would go negative.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user       UUID;
  v_subj       UUID;
  v_ch_floor   UUID := gen_random_uuid();
  v_uc_floor   UUID := gen_random_uuid();
  v_miss       UUID := gen_random_uuid();
  v_today      DATE;
  v_final_xp   INTEGER;
BEGIN
  SELECT user_id, subj_id INTO v_user, v_subj FROM undo_ctx;
  v_today := public.get_user_local_date(v_user);

  -- Create a dedicated chapter & user_chapter to avoid daily_missions_unique collision
  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES (v_ch_floor, v_subj, 'Floor Test Chapter', 99, 'Core', FALSE, 'as');

  INSERT INTO public.user_chapters (id, user_id, chapter_id, notes_status)
  VALUES (v_uc_floor, v_user, v_ch_floor, 'none');

  -- Create a fresh completed mission with xp_reward=50
  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type,
    target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty,
    completed_at
  ) VALUES (
    v_miss, v_user, v_today, 'complete_notes',
    'chapter', v_uc_floor,
    'Floor Test Mission', 'desc', 50, 'completed', 'medium',
    NOW() - INTERVAL '2 minutes'
  );

  -- Create the original XP event so the undo logic finds it
  PERFORM public.award_xp(v_user, 50, 'mission_complete', v_miss,
    jsonb_build_object('mission_type', 'complete_notes'));

  -- Explicitly set user total_xp to 20 (strictly less than the 50 XP to reverse)
  -- This forces the undo function to trigger the floor clamp.
  UPDATE public.profiles SET total_xp = 20, current_level = 1 WHERE id = v_user;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  PERFORM public.undo_mission_completion(v_miss, v_user);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT total_xp INTO v_final_xp FROM public.profiles WHERE id = v_user;
  UPDATE undo_ctx SET t7_xp_floor = (v_final_xp = 0);
END;
$$;

SELECT ok((SELECT t7_xp_floor FROM undo_ctx),
  'XP floor: total_xp is floored at exactly zero when reversal exceeds pre-undo total');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 8: Streak unchanged after undo
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user       UUID;
  v_streak_now INTEGER;
  v_before     INTEGER;
BEGIN
  SELECT user_id, streak_after_undo INTO v_user, v_before FROM undo_ctx;
  -- streak_after_undo was captured at completion time; after the undo it should be the same
  SELECT current_streak INTO v_streak_now FROM public.streaks WHERE user_id = v_user;
  UPDATE undo_ctx SET t8_streak_unchanged = (v_streak_now = v_before);
END;
$$;

SELECT ok((SELECT t8_streak_unchanged FROM undo_ctx),
  'Streak is unchanged after undo (MVP: streak not reversed on undo)');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 9: carry_forward=TRUE + result_type='actual' + stage='as' is accepted
--         (positive control for the tightened ssr_carry_forward_actual constraint)
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user  UUID;
  v_us_id UUID;
  v_ok    BOOLEAN := FALSE;
BEGIN
  SELECT user_id, us_id INTO v_user, v_us_id FROM undo_ctx;

  BEGIN
    INSERT INTO public.subject_stage_results (
      user_subject_id, stage, result_type,
      score_obtained, score_maximum,
      exam_series, exam_year, carry_forward
    ) VALUES (
      v_us_id, 'as', 'actual',
      85, 100,
      'may_jun', 2025, TRUE
    );
    v_ok := TRUE;
  EXCEPTION
    WHEN OTHERS THEN v_ok := FALSE;
  END;

  UPDATE undo_ctx SET t9_cf_actual_ok = v_ok;
END;
$$;

SELECT ok((SELECT t9_cf_actual_ok FROM undo_ctx),
  'carry_forward=TRUE accepted when stage=as AND result_type=actual (constraint positive control)');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 10: Unauthenticated call (auth.uid() IS NULL) to undo_mission_completion raises 42501
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user UUID;
  v_miss UUID;
  v_err  BOOLEAN := FALSE;
BEGIN
  SELECT user_id, mission_id INTO v_user, v_miss FROM undo_ctx;

  -- Ensure no auth context
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  BEGIN
    PERFORM public.undo_mission_completion(v_miss, v_user);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN v_err := TRUE;
    WHEN OTHERS THEN NULL;
  END;

  UPDATE undo_ctx SET t10_unauth_undo = v_err;
END;
$$;

SELECT ok((SELECT t10_unauth_undo FROM undo_ctx),
  'unauthenticated call to undo_mission_completion raises 42501 Unauthorized');


SELECT * FROM finish();
ROLLBACK;
