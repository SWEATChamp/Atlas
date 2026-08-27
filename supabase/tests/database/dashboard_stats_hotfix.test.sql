-- ============================================================
-- DATABASE TESTS: Dashboard statistics hotfix (Migration 025)
--
-- Run via: npm run test:db
-- All changes roll back — no data is persisted.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(7);

CREATE TEMP TABLE dashboard_hotfix_ctx (
  user_id        UUID NOT NULL,
  subject_id     UUID NOT NULL,
  expired_stats  JSONB,
  yesterday_stats JSONB,
  today_stats    JSONB
) ON COMMIT DROP;

GRANT ALL ON TABLE dashboard_hotfix_ctx TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_subjects TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.streaks TO authenticated, anon;

DO $$
DECLARE
  v_user    UUID := 'c0250001-0000-0000-0000-000000000001';
  v_subject UUID;
  v_today   DATE;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user,
    'authenticated', 'authenticated',
    'dashboard_hotfix@atlas.test', '', NOW(),
    '{"provider":"email","providers":["email"]}', '{}',
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
  SET username = 'dashboard_hotfix', timezone = 'UTC'
  WHERE id = v_user;

  SELECT id INTO v_subject
  FROM public.subjects
  WHERE code = '9702' AND is_global = TRUE;

  v_today := public.get_user_local_date(v_user);

  INSERT INTO public.user_subjects (
    user_id, subject_id, priority, exam_date, study_route, current_stage
  ) VALUES (
    v_user, v_subject, 1, v_today + 5, 'staged', 'as'
  );

  UPDATE public.streaks
  SET current_streak = 2,
      longest_streak = 4,
      last_activity_date = v_today - 3
  WHERE user_id = v_user;

  INSERT INTO dashboard_hotfix_ctx (user_id, subject_id)
  VALUES (v_user, v_subject);
END;
$$;

DO $$
DECLARE
  v_user  UUID;
  v_stats JSONB;
BEGIN
  SELECT user_id INTO v_user FROM dashboard_hotfix_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::TEXT)::TEXT, true);
  v_stats := public.get_user_dashboard_stats(v_user);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE dashboard_hotfix_ctx SET expired_stats = v_stats;
END;
$$;

SELECT is(
  (
    SELECT (expired_stats->'subject_readiness'->0->>'days_until')::INTEGER
    FROM dashboard_hotfix_ctx
  ),
  5,
  'dashboard stats returns the user-local days_until value'
);

SELECT is(
  (
    SELECT (expired_stats->'streak'->>'current')::INTEGER
    FROM dashboard_hotfix_ctx
  ),
  0,
  'dashboard stats displays an expired stored streak as zero'
);

SELECT is(
  (
    SELECT (expired_stats->'streak'->>'longest')::INTEGER
    FROM dashboard_hotfix_ctx
  ),
  4,
  'expiring the displayed current streak preserves the longest streak'
);

SELECT is(
  (
    SELECT (expired_stats->'streak'->>'active_today')::BOOLEAN
    FROM dashboard_hotfix_ctx
  ),
  FALSE,
  'an expired streak is not active today'
);

DO $$
DECLARE
  v_user  UUID;
  v_today DATE;
  v_stats JSONB;
BEGIN
  SELECT user_id INTO v_user FROM dashboard_hotfix_ctx;
  v_today := public.get_user_local_date(v_user);

  UPDATE public.streaks
  SET current_streak = 2, last_activity_date = v_today - 1
  WHERE user_id = v_user;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::TEXT)::TEXT, true);
  v_stats := public.get_user_dashboard_stats(v_user);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE dashboard_hotfix_ctx SET yesterday_stats = v_stats;
END;
$$;

SELECT is(
  (
    SELECT (yesterday_stats->'streak'->>'current')::INTEGER
    FROM dashboard_hotfix_ctx
  ),
  2,
  'a streak with activity yesterday remains current'
);

DO $$
DECLARE
  v_user  UUID;
  v_today DATE;
  v_stats JSONB;
BEGIN
  SELECT user_id INTO v_user FROM dashboard_hotfix_ctx;
  v_today := public.get_user_local_date(v_user);

  UPDATE public.streaks
  SET current_streak = 3, last_activity_date = v_today
  WHERE user_id = v_user;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::TEXT)::TEXT, true);
  v_stats := public.get_user_dashboard_stats(v_user);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE dashboard_hotfix_ctx SET today_stats = v_stats;
END;
$$;

SELECT is(
  (
    SELECT (today_stats->'streak'->>'current')::INTEGER
    FROM dashboard_hotfix_ctx
  ),
  3,
  'a streak with activity today remains current'
);

SELECT is(
  (
    SELECT (today_stats->'streak'->>'active_today')::BOOLEAN
    FROM dashboard_hotfix_ctx
  ),
  TRUE,
  'same-day activity is reported as active today'
);

SELECT * FROM finish();
ROLLBACK;
