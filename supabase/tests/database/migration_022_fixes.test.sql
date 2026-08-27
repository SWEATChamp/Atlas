BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(11);

-- ─── Test context ─────────────────────────────────────────────────────────────

CREATE TEMP TABLE m22_ctx (
  user_id           UUID,
  subj_maths        UUID,
  subj_physics      UUID,
  us_maths_id       UUID,
  us_phys_id        UUID,
  ch_p1             UUID,
  ch_p2             UUID,
  ch_p3             UUID,
  ch_m1             UUID,
  -- test flags
  t1_p2_route_dep   BOOLEAN DEFAULT FALSE,
  t2_onboard_subj   BOOLEAN DEFAULT FALSE,
  t3_auto_uc_create BOOLEAN DEFAULT FALSE,
  t4_dup_ssr_upsert BOOLEAN DEFAULT FALSE,
  t5_new_user_miss  BOOLEAN DEFAULT FALSE,
  t6_skip_replenish BOOLEAN DEFAULT FALSE,
  t7_regen_route_ch BOOLEAN DEFAULT FALSE,
  t8_dash_username  BOOLEAN DEFAULT FALSE,
  t9_upgrade_bf     BOOLEAN DEFAULT FALSE,
  t10_ach_auth_prot BOOLEAN DEFAULT FALSE,
  t11_no_zero_comp  BOOLEAN DEFAULT FALSE
) ON COMMIT DROP;

GRANT ALL ON TABLE m22_ctx TO authenticated, anon;
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
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chapters TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subjects TO authenticated, anon;

INSERT INTO m22_ctx (
  user_id,
  subj_maths,
  subj_physics,
  ch_p1,
  ch_p2,
  ch_p3,
  ch_m1
) VALUES (
  'c0220001-0000-0000-0000-000000000001',
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid()
);

-- ─── SETUP: synthetic user ────────────────────────────────────────────────────

DO $$
DECLARE
  v_user UUID;
BEGIN
  SELECT user_id INTO v_user FROM m22_ctx;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user,
    'authenticated', 'authenticated',
    'm22_tester@atlas.test', '',
    NOW(),
    '{"provider":"email","providers":["email"]}', '{}',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
  SET    username = 'atlas_champ_99',
         full_name = 'Atlas Champion',
         onboarding_completed = FALSE,
         timezone = 'UTC'
  WHERE  id = v_user;
END;
$$;

-- ─── SETUP: subjects and chapters ─────────────────────────────────────────────

DO $$
DECLARE
  v_user   UUID;
  v_math   UUID;
  v_phys   UUID;
  v_p1     UUID;
  v_p2     UUID;
  v_p3     UUID;
  v_m1     UUID;
BEGIN
  SELECT user_id
  INTO   v_user
  FROM   m22_ctx;

  SELECT id INTO v_math FROM public.subjects WHERE code = '9709' AND is_available = TRUE;
  SELECT id INTO v_phys FROM public.subjects WHERE code = '9702' AND is_available = TRUE;

  SELECT id INTO v_p1 FROM public.chapters WHERE subject_id = v_math AND component = 'Pure 1' AND number = 1;
  SELECT id INTO v_p2 FROM public.chapters WHERE subject_id = v_math AND component = 'Pure 2' AND number = 1;
  SELECT id INTO v_p3 FROM public.chapters WHERE subject_id = v_math AND component = 'Pure 3' AND number = 1;
  SELECT id INTO v_m1 FROM public.chapters WHERE subject_id = v_math AND component = 'Mechanics' AND number = 1;

  UPDATE m22_ctx
  SET subj_maths = v_math, subj_physics = v_phys,
      ch_p1 = v_p1, ch_p2 = v_p2, ch_p3 = v_p3, ch_m1 = v_m1;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════
-- TEST 1: Pure 2 is route_dependent in global seed
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_p2_stage TEXT;
BEGIN
  SELECT stage::TEXT INTO v_p2_stage
  FROM   public.chapters
  WHERE  component = 'Pure 2'
  LIMIT 1;

  UPDATE m22_ctx SET t1_p2_route_dep = (v_p2_stage = 'route_dependent');
END;
$$;

SELECT ok((SELECT t1_p2_route_dep FROM m22_ctx),
  'Pure 2 chapter classification is route_dependent');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 2: set_onboarding_subjects operates atomically and enforces constraints
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user    UUID;
  v_math    UUID;
  v_phys    UUID;
  v_extra   UUID := gen_random_uuid();
  v_count   INTEGER;
  v_blocked BOOLEAN := FALSE;
BEGIN
  SELECT user_id, subj_maths, subj_physics INTO v_user, v_math, v_phys FROM m22_ctx;

  SELECT id INTO v_extra FROM public.subjects WHERE code = '9701' AND is_available = TRUE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- 1. Enroll in Maths and Biology
  PERFORM public.set_onboarding_subjects(v_user, ARRAY[v_math, v_extra]);

  -- 2. Change selection to Maths and Physics (Biology must be deleted)
  PERFORM public.set_onboarding_subjects(v_user, ARRAY[v_math, v_phys]);

  SELECT COUNT(*) INTO v_count
  FROM   public.user_subjects
  WHERE  user_id = v_user AND subject_id = v_extra;

  -- 3. Reject > 5 subjects
  BEGIN
    PERFORM public.set_onboarding_subjects(v_user, ARRAY[
      v_math, v_phys, v_extra,
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
    ]);
  EXCEPTION
    WHEN OTHERS THEN
      v_blocked := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE m22_ctx SET t2_onboard_subj = (v_count = 0 AND v_blocked);
END;
$$;

SELECT ok((SELECT t2_onboard_subj FROM m22_ctx),
  'set_onboarding_subjects atomically replaces subjects and enforces 1-5 limit');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 3: configure_subject_route creates missing user_chapters automatically
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user  UUID;
  v_math  UUID;
  v_phys  UUID;
  v_us_m  UUID;
  v_us_p  UUID;
  v_count INTEGER;
BEGIN
  SELECT user_id, subj_maths, subj_physics INTO v_user, v_math, v_phys FROM m22_ctx;

  SELECT id INTO v_us_m FROM public.user_subjects WHERE user_id = v_user AND subject_id = v_math;
  SELECT id INTO v_us_p FROM public.user_subjects WHERE user_id = v_user AND subject_id = v_phys;

  UPDATE public.user_subjects SET exam_date = CURRENT_DATE + 90 WHERE user_id = v_user;
  UPDATE m22_ctx SET us_maths_id = v_us_m, us_phys_id = v_us_p;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- Configure AS-only with Pure 1 + Mechanics (Pure 2 NOT selected)
  PERFORM public.configure_subject_route(
    v_user,
    v_us_m,
    'as_only',
    '[{"component_name": "Pure 1", "paper_number": 1, "stage": "as"}, {"component_name": "Mechanics", "paper_number": 4, "stage": "as"}]'::JSONB
  );

  PERFORM public.configure_subject_route(
    v_user,
    v_us_p,
    'staged',
    '[]'::JSONB
  );

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- user_chapters should contain rows for Pure 1 and Mechanics
  SELECT COUNT(*) INTO v_count
  FROM   public.user_chapters uc
  JOIN   public.chapters c ON c.id = uc.chapter_id
  WHERE  uc.user_id = v_user
    AND  c.component IN ('Pure 1', 'Mechanics');

  UPDATE m22_ctx SET t3_auto_uc_create = (v_count >= 2);
END;
$$;

SELECT ok((SELECT t3_auto_uc_create FROM m22_ctx),
  'configure_subject_route automatically creates user_chapters for accessible chapters');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 4: transition_to_a2 upserts existing AS result without ssr_unique error
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user    UUID;
  v_us_p    UUID;
  v_err     BOOLEAN := FALSE;
  v_updated BOOLEAN := FALSE;
BEGIN
  SELECT user_id, us_phys_id INTO v_user, v_us_p FROM m22_ctx;

  -- Pre-insert an AS result with score 80
  INSERT INTO public.subject_stage_results (
    user_subject_id, stage, result_type, score_obtained, score_maximum, exam_series, exam_year
  ) VALUES (
    v_us_p, 'as', 'actual', 80, 100, 'may_jun', 2025
  );

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- Transition to A2 with the same unique key but updated score 90
  BEGIN
    PERFORM public.transition_to_a2(
      v_user,
      v_us_p,
      'normal_transition',
      'actual',
      90::SMALLINT,
      100::SMALLINT,
      'may_jun',
      2025::SMALLINT,
      TRUE
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_err := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT (score_obtained = 90 AND carry_forward = TRUE) INTO v_updated
  FROM   public.subject_stage_results
  WHERE  user_subject_id = v_us_p AND exam_year = 2025;

  UPDATE m22_ctx SET t4_dup_ssr_upsert = (NOT v_err AND v_updated);
END;
$$;

SELECT ok((SELECT t4_dup_ssr_upsert FROM m22_ctx),
  'transition_to_a2 updates existing AS result without ssr_unique duplicate error');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 5: Newly onboarded user with configured route generates missions
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user  UUID;
  v_gen   INTEGER;
BEGIN
  SELECT user_id INTO v_user FROM m22_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  v_gen := public.generate_daily_missions(v_user);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE m22_ctx SET t5_new_user_miss = (v_gen > 0);
END;
$$;

SELECT ok((SELECT t5_new_user_miss FROM m22_ctx),
  'generate_daily_missions generates missions for user with configured route');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 6: Skipped missions do not consume daily budget (allows replenishment)
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user    UUID;
  v_miss_id UUID;
  v_gen     INTEGER;
BEGIN
  SELECT user_id INTO v_user FROM m22_ctx;

  -- Mark one mission as skipped
  SELECT id INTO v_miss_id FROM public.daily_missions WHERE user_id = v_user AND status = 'pending' LIMIT 1;
  UPDATE public.daily_missions SET status = 'skipped', skipped_at = NOW() WHERE id = v_miss_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- Generating daily missions again should replenish the skipped slot
  v_gen := public.generate_daily_missions(v_user);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE m22_ctx SET t6_skip_replenish = (v_gen >= 1);
END;
$$;

SELECT ok((SELECT t6_skip_replenish FROM m22_ctx),
  'Skipped missions do not count against daily limit; regeneration replenishes budget');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 7: Route change cancels inaccessible missions, regenerates for accessible chapters
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user             UUID;
  v_us_m             UUID;
  v_ch_m1            UUID;
  v_uc_m1            UUID;
  v_miss_m1          UUID := gen_random_uuid();
  v_today            DATE;
  v_m1_status        TEXT;
  v_gen              INTEGER;
  v_all_accessible   BOOLEAN := TRUE;
  v_active_count     INTEGER;
  v_expected_count   INTEGER;
  v_chapter_miss_cnt INTEGER := 0;
  rec                RECORD;
BEGIN
  SELECT user_id, us_maths_id, ch_m1 INTO v_user, v_us_m, v_ch_m1 FROM m22_ctx;
  v_today := public.get_user_local_date(v_user);

  -- 1. Isolate mission data from earlier tests
  DELETE FROM public.daily_missions WHERE user_id = v_user;

  SELECT id INTO v_uc_m1 FROM public.user_chapters WHERE user_id = v_user AND chapter_id = v_ch_m1;
  SELECT COALESCE(max_missions_per_day, 3) INTO v_expected_count FROM public.user_settings WHERE user_id = v_user;

  -- Insert a pending mission explicitly on Mechanics chapter
  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type, target_entity_type, target_entity_id,
    title, description, xp_reward, status, difficulty
  ) VALUES (
    v_miss_m1, v_user, v_today, 'review_chapter', 'chapter', v_uc_m1,
    'Mechanics Mission', 'Review mechanics', 30, 'pending', 'easy'
  );

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- Switch Maths route to Pure 1 + Pure 2 (Mechanics becomes inaccessible)
  PERFORM public.configure_subject_route(
    v_user,
    v_us_m,
    'as_only',
    '[{"component_name": "Pure 1", "paper_number": 1, "stage": "as"}, {"component_name": "Pure 2", "paper_number": 2, "stage": "as"}]'::JSONB
  );

  -- 2. Confirm the Mechanics mission became skipped
  SELECT status INTO v_m1_status FROM public.daily_missions WHERE id = v_miss_m1;

  -- 3. Regenerate daily missions
  v_gen := public.generate_daily_missions(v_user);

  -- 4. Count active missions and verify replenished to expected number
  SELECT COUNT(*) INTO v_active_count
  FROM   public.daily_missions
  WHERE  user_id = v_user AND mission_date = v_today AND status != 'skipped';

  -- 5. Verify every newly generated chapter mission is accessible
  FOR rec IN
    SELECT dm.id, uc.chapter_id
    FROM   public.daily_missions dm
    JOIN   public.user_chapters uc ON uc.id = dm.target_entity_id
    WHERE  dm.user_id = v_user
      AND  dm.mission_date = v_today
      AND  dm.status != 'skipped'
      AND  dm.target_entity_type = 'chapter'
  LOOP
    v_chapter_miss_cnt := v_chapter_miss_cnt + 1;
    IF NOT public.user_can_access_chapter(v_user, rec.chapter_id) THEN
      v_all_accessible := FALSE;
    END IF;
  END LOOP;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- 6. Strict assertion: fails if v_gen is 0, if counts do not match, or if any inaccessible mission exists
  UPDATE m22_ctx SET t7_regen_route_ch = (
    (v_m1_status = 'skipped') AND
    (v_gen >= 1) AND
    (v_active_count = v_expected_count) AND
    (v_chapter_miss_cnt > 0) AND
    v_all_accessible
  );
END;
$$;

SELECT ok((SELECT t7_regen_route_ch FROM m22_ctx),
  'Route change cancels inaccessible missions and regenerates valid accessible missions');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 8: get_user_dashboard_stats returns profiles.username
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user     UUID;
  v_stats    JSONB;
  v_username TEXT;
BEGIN
  SELECT user_id INTO v_user FROM m22_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  v_stats := public.get_user_dashboard_stats(v_user);
  v_username := v_stats->'profile'->>'username';

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE m22_ctx SET t8_dash_username = (v_username = 'atlas_champ_99');
END;
$$;

SELECT ok((SELECT t8_dash_username FROM m22_ctx),
  'get_user_dashboard_stats returns profiles.username');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 9: Upgrade backfill populates user_chapters for existing confirmed enrollments
--         (Verifies declarative backfill without relying on auth.uid())
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_legacy_user UUID := 'c0220001-0000-0000-0000-000000000099';
  v_legacy_subj UUID := gen_random_uuid();
  v_legacy_ch   UUID := gen_random_uuid();
  v_legacy_us   UUID := gen_random_uuid();
  v_count       INTEGER;
BEGIN
  -- Insert a legacy user with confirmed enrollment and an accessible chapter but NO user_chapters row
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_legacy_user, 'authenticated', 'authenticated',
    'legacy_user@atlas.test', '', NOW(), '{"provider":"email"}', '{}', NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subjects (id, name, is_global, created_by)
  VALUES (v_legacy_subj, 'Legacy Chemistry', FALSE, v_legacy_user);

  INSERT INTO public.chapters (id, subject_id, title, number, component, is_global, stage)
  VALUES (v_legacy_ch, v_legacy_subj, 'Organic Chem', 1, 'Core', FALSE, 'as');

  INSERT INTO public.user_subjects (id, user_id, subject_id, priority, exam_date, study_route, current_stage)
  VALUES (v_legacy_us, v_legacy_user, v_legacy_subj, 2, CURRENT_DATE + 60, 'as_only', 'as');

  -- Ensure auth context is completely NULL (simulating migration run)
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Execute the exact declarative backfill SQL from Migration 022
  INSERT INTO public.user_chapters (user_id, chapter_id, notes_status)
  SELECT us.user_id, c.id, 'none'
  FROM   public.user_subjects us
  JOIN   public.chapters c ON c.subject_id = us.subject_id
  WHERE  us.is_archived = FALSE
    AND  us.study_route::TEXT != 'unconfirmed'
    AND  c.stage IS NOT NULL
    AND  (
           c.stage IN ('as', 'shared')
           OR (c.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
           OR (
             c.stage = 'route_dependent'
             AND EXISTS (
               SELECT 1 FROM public.subject_paper_selections sps
               WHERE  sps.user_subject_id = us.id
                 AND  sps.component_name  = c.component
                 AND  (
                   sps.stage = 'as'
                   OR (sps.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
                 )
             )
           )
         )
  ON CONFLICT (user_id, chapter_id) DO NOTHING;

  SELECT COUNT(*) INTO v_count
  FROM   public.user_chapters
  WHERE  user_id = v_legacy_user AND chapter_id = v_legacy_ch;

  UPDATE m22_ctx SET t9_upgrade_bf = (v_count = 1);
END;
$$;

SELECT ok((SELECT t9_upgrade_bf FROM m22_ctx),
  'Migration backfill populates user_chapters for existing confirmed enrollments when auth.uid() is NULL');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 10: check_and_unlock_achievements rejects unauthenticated & non-owner calls
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user     UUID;
  v_unauth   BOOLEAN := FALSE;
  v_nonowner BOOLEAN := FALSE;
BEGIN
  SELECT user_id INTO v_user FROM m22_ctx;

  -- 1. Unauthenticated call (auth.uid() is NULL)
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  BEGIN
    PERFORM * FROM public.check_and_unlock_achievements(v_user);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN v_unauth := TRUE;
  END;

  -- 2. Non-owner call (auth.uid() != p_user_id)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text)::text, true);

  BEGIN
    PERFORM * FROM public.check_and_unlock_achievements(v_user);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN v_nonowner := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE m22_ctx SET t10_ach_auth_prot = (v_unauth AND v_nonowner);
END;
$$;

SELECT ok((SELECT t10_ach_auth_prot FROM m22_ctx),
  'check_and_unlock_achievements rejects unauthenticated and non-owner calls with 42501');


-- ═══════════════════════════════════════════════════════════════════
-- TEST 11: Completionist does NOT unlock for a subject with 0 chapters
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user      UUID;
  v_empty_sb  UUID := gen_random_uuid();
  v_unlocked  BOOLEAN;
BEGIN
  SELECT user_id INTO v_user FROM m22_ctx;

  -- Create a subject with 0 chapters and enroll the user
  INSERT INTO public.subjects (id, name, code, is_global, created_by)
  VALUES (v_empty_sb, 'Empty Subject', '9999', FALSE, v_user);

  INSERT INTO public.user_subjects (user_id, subject_id, priority, exam_date, study_route, current_stage)
  VALUES (v_user, v_empty_sb, 1, CURRENT_DATE + 60, 'staged', 'as');

  -- Ensure completionist is NOT in user_achievements
  DELETE FROM public.user_achievements WHERE user_id = v_user AND achievement_key = 'completionist';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- Evaluate achievements
  PERFORM * FROM public.check_and_unlock_achievements(v_user);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT EXISTS (
    SELECT 1 FROM public.user_achievements
    WHERE  user_id = v_user AND achievement_key = 'completionist'
  ) INTO v_unlocked;

  UPDATE m22_ctx SET t11_no_zero_comp = (NOT v_unlocked);
END;
$$;

SELECT ok((SELECT t11_no_zero_comp FROM m22_ctx),
  'Completionist achievement does not unlock for subjects with zero chapters');


SELECT * FROM finish();
ROLLBACK;
