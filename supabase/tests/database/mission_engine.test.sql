BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(2);

CREATE TEMP TABLE atlas_test_context (
  user_id            UUID,
  local_date         DATE,
  subject_id         UUID DEFAULT gen_random_uuid(),
  chapter_id         UUID DEFAULT gen_random_uuid(),
  user_chapter_id    UUID DEFAULT gen_random_uuid(),
  mission_id         UUID,
  mission_reward     SMALLINT,
  first_generated    INTEGER,
  second_generated   INTEGER,
  xp_before          INTEGER,
  xp_after_first     INTEGER,
  second_rejected    BOOLEAN DEFAULT FALSE
) ON COMMIT DROP;

GRANT ALL ON TABLE atlas_test_context TO authenticated, anon;

-- ─── SETUP: synthetic isolated user ──────────────────────────────────────────

DO $$
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'c0210001-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'mission_engine_test@atlas.test', '',
    NOW(),
    '{"provider":"email","providers":["email"]}', '{}',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
END;
$$;

INSERT INTO atlas_test_context (user_id) VALUES ('c0210001-0000-0000-0000-000000000001');

UPDATE public.profiles
SET    onboarding_completed = TRUE,
       timezone = 'UTC'
WHERE  id = 'c0210001-0000-0000-0000-000000000001';

UPDATE atlas_test_context
SET    local_date = public.get_user_local_date(user_id);

INSERT INTO public.subjects (id, name, code, is_global, created_by)
SELECT
  subject_id,
  'Atlas Mission Test ' || LEFT(subject_id::TEXT, 8),
  'TEST',
  FALSE,
  user_id
FROM atlas_test_context;

INSERT INTO public.user_subjects (
  user_id,
  subject_id,
  exam_date,
  target_grade,
  priority,
  study_route,
  current_stage
)
SELECT user_id, subject_id, local_date + 30, 'A', 5, 'staged', 'as'
FROM atlas_test_context;

INSERT INTO public.chapters (
  id,
  subject_id,
  title,
  number,
  component,
  is_global,
  stage
)
SELECT chapter_id, subject_id, 'Mission Test Chapter', 1, 'Test', FALSE, 'as'
FROM atlas_test_context;

INSERT INTO public.user_chapters (
  id,
  user_id,
  chapter_id,
  notes_status,
  confidence_level
)
SELECT user_chapter_id, user_id, chapter_id, 'none', 1
FROM atlas_test_context;

DELETE FROM public.daily_missions dm
USING atlas_test_context ctx
WHERE dm.user_id = ctx.user_id
  AND dm.mission_date = ctx.local_date;

UPDATE public.user_settings settings
SET
  max_missions_per_day = 1,
  missions_last_generated_date = NULL
FROM atlas_test_context ctx
WHERE settings.user_id = ctx.user_id;

-- ─── Test 1: Mission generation ──────────────────────────────────────────────

DO $$
DECLARE
  v_user UUID;
  v_g1   INTEGER;
  v_g2   INTEGER;
BEGIN
  SELECT user_id INTO v_user FROM atlas_test_context;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  v_g1 := public.generate_daily_missions(v_user);
  v_g2 := public.generate_daily_missions(v_user);

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE atlas_test_context SET first_generated = v_g1, second_generated = v_g2;
END;
$$;

SELECT ok(
  (
    SELECT
      ctx.first_generated = 1
      AND ctx.second_generated = 0
      AND COUNT(dm.id) = 1
      AND BOOL_AND(dm.mission_date = ctx.local_date)
    FROM atlas_test_context ctx
    LEFT JOIN public.daily_missions dm
      ON dm.user_id = ctx.user_id
      AND dm.mission_date = ctx.local_date
    GROUP BY ctx.first_generated, ctx.second_generated, ctx.local_date
  ),
  'mission generation creates one local-day set and ignores a repeat call'
);

-- ─── Test 2: Mission completion ──────────────────────────────────────────────

UPDATE atlas_test_context ctx
SET
  mission_id = mission.id,
  mission_reward = mission.xp_reward,
  xp_before = profile.total_xp
FROM public.daily_missions mission
JOIN public.profiles profile ON profile.id = mission.user_id
WHERE mission.user_id = ctx.user_id
  AND mission.mission_date = ctx.local_date;

UPDATE public.streaks streak
SET
  current_streak = 0,
  longest_streak = 0,
  last_activity_date = NULL
FROM atlas_test_context ctx
WHERE streak.user_id = ctx.user_id;

DO $$
DECLARE
  v_user UUID;
  v_miss UUID;
  v_second_rejected BOOLEAN := FALSE;
BEGIN
  SELECT user_id, mission_id INTO v_user, v_miss FROM atlas_test_context;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  PERFORM public.complete_mission(v_miss, v_user);

  BEGIN
    PERFORM public.complete_mission(v_miss, v_user);
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      v_second_rejected := TRUE;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE atlas_test_context SET second_rejected = v_second_rejected;
END;
$$;

UPDATE atlas_test_context ctx
SET xp_after_first = profile.total_xp
FROM public.profiles profile
WHERE profile.id = ctx.user_id;

SELECT ok(
  (
    SELECT
      mission.status = 'completed'
      AND mission.completed_at IS NOT NULL
      AND ctx.xp_after_first >= ctx.xp_before + ctx.mission_reward
      AND profile.total_xp = ctx.xp_after_first
      AND COUNT(xp.id) FILTER (WHERE xp.reference_id = ctx.mission_id) >= 1
      AND streak.current_streak = 1
      AND streak.last_activity_date = ctx.local_date
      AND ctx.second_rejected = TRUE
    FROM atlas_test_context ctx
    JOIN public.daily_missions mission ON mission.id = ctx.mission_id
    JOIN public.profiles profile ON profile.id = ctx.user_id
    JOIN public.streaks streak ON streak.user_id = ctx.user_id
    LEFT JOIN public.xp_events xp ON xp.user_id = ctx.user_id
    GROUP BY
      mission.status,
      mission.completed_at,
      ctx.xp_after_first,
      ctx.xp_before,
      ctx.mission_reward,
      profile.total_xp,
      streak.current_streak,
      streak.last_activity_date,
      ctx.local_date,
      ctx.second_rejected
  ),
  'mission completion changes status, XP, and streak exactly once'
);

SELECT * FROM finish();
ROLLBACK;
