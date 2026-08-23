-- ============================================================
-- MIGRATION 008: Core Functions
-- All business logic implemented as PostgreSQL functions.
-- SECURITY DEFINER functions run as DB owner and bypass RLS,
-- allowing server-side operations while clients stay isolated.
-- SET search_path = public prevents search path injection.
--
-- Functions:
--   set_updated_at()              → generic BEFORE UPDATE trigger fn
--   handle_new_user()             → creates profile rows on signup
--   compute_level(xp)             → XP → level number
--   compute_level_title(level)    → level number → display name
--   sync_xp_to_profile()          → trigger: syncs xp_events → profiles
--   award_xp(...)                 → inserts an xp_event
--   update_streak(user_id)        → increments or resets streak
--   generate_daily_missions(uid)  → Mission Engine algorithm
--   complete_mission(id, uid)     → atomic mission completion RPC
--   compute_readiness_score(...)  → Readiness Score formula
--   get_user_dashboard_stats(uid) → single-query dashboard data
--   get_leaderboard(scope, limit) → XP ranking
-- ============================================================


-- ─── SET_UPDATED_AT ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at IS
  'Generic BEFORE UPDATE trigger to auto-set updated_at = NOW().';


-- ─── HANDLE_NEW_USER ──────────────────────────────────────────────────────
-- Fires on auth.users INSERT. Creates profile, streak, settings, pet.
-- EXCEPTION block ensures auth signup never fails due to this trigger.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.streaks (user_id, current_streak, longest_streak)
  VALUES (NEW.id, 0, 0);

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id);

  INSERT INTO public.study_pets (user_id, name)
  VALUES (NEW.id, 'Atlas');

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS
  'Trigger on auth.users INSERT. Creates profile, streak, settings, and study_pet rows.';


-- ─── COMPUTE_LEVEL ─────────────────────────────────────────────────────────
-- Piecewise XP → level mapping. IMMUTABLE = safe in generated columns.

CREATE OR REPLACE FUNCTION public.compute_level(p_total_xp INTEGER)
RETURNS SMALLINT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN p_total_xp <     100 THEN  1
    WHEN p_total_xp <     250 THEN  2
    WHEN p_total_xp <     500 THEN  3
    WHEN p_total_xp <     900 THEN  4
    WHEN p_total_xp <   1400  THEN  5
    WHEN p_total_xp <   2000  THEN  6
    WHEN p_total_xp <   2800  THEN  7
    WHEN p_total_xp <   3800  THEN  8
    WHEN p_total_xp <   5000  THEN  9
    WHEN p_total_xp <   7000  THEN 10
    WHEN p_total_xp <  10000  THEN 11
    WHEN p_total_xp <  14000  THEN 12
    WHEN p_total_xp <  19000  THEN 13
    WHEN p_total_xp <  25000  THEN 14
    ELSE 15
  END;
END;
$$;


-- ─── COMPUTE_LEVEL_TITLE ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_level_title(p_level SMALLINT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_level
    WHEN  1 THEN 'Initiate'
    WHEN  2 THEN 'Learner'
    WHEN  3 THEN 'Scholar'
    WHEN  4 THEN 'Analyst'
    WHEN  5 THEN 'Tactician'
    WHEN  6 THEN 'Strategist'
    WHEN  7 THEN 'Expert'
    WHEN  8 THEN 'Master'
    WHEN  9 THEN 'Grandmaster'
    WHEN 10 THEN 'Atlas'
    WHEN 11 THEN 'Sage'
    WHEN 12 THEN 'Oracle'
    WHEN 13 THEN 'Luminary'
    WHEN 14 THEN 'Legend'
    ELSE        'Mythic'
  END;
END;
$$;


-- ─── SYNC_XP_TO_PROFILE ────────────────────────────────────────────────────
-- Trigger function: called AFTER INSERT on xp_events.
-- Atomically updates profiles.total_xp and recomputes current_level.
-- Note: PostgreSQL evaluates RHS of SET using pre-update row values,
-- so (total_xp + NEW.xp_amount) correctly reads the old total_xp.

CREATE OR REPLACE FUNCTION public.sync_xp_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    total_xp      = total_xp + NEW.xp_amount,
    current_level = public.compute_level(total_xp + NEW.xp_amount),
    updated_at    = NOW()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;


-- ─── AWARD_XP ──────────────────────────────────────────────────────────────
-- Inserts an xp_event. The sync_xp_to_profile trigger handles profile updates.
-- Returns the new xp_event.id for reference.

CREATE OR REPLACE FUNCTION public.award_xp(
  p_user_id      UUID,
  p_amount       SMALLINT,
  p_event_type   xp_event_type_enum,
  p_reference_id UUID    DEFAULT NULL,
  p_metadata     JSONB   DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.xp_events (user_id, event_type, xp_amount, reference_id, metadata)
  VALUES (p_user_id, p_event_type, p_amount, p_reference_id, p_metadata)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.award_xp IS
  'Insert an XP event. sync_xp_to_profile trigger updates profile automatically.';


-- ─── UPDATE_STREAK ─────────────────────────────────────────────────────────
-- Called on any study activity. Computes "today" in user's local timezone.
-- Uses FOR UPDATE lock to prevent concurrent race conditions.
-- Awards milestone XP at 7, 30, and 100 days.

CREATE OR REPLACE FUNCTION public.update_streak(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_streak  public.streaks%ROWTYPE;
  v_today   DATE;
  v_user_tz TEXT;
BEGIN
  SELECT timezone INTO v_user_tz FROM public.profiles WHERE id = p_user_id;
  v_today := (NOW() AT TIME ZONE COALESCE(v_user_tz, 'UTC'))::DATE;

  SELECT * INTO v_streak
  FROM public.streaks
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.streaks (user_id, current_streak, longest_streak, last_activity_date)
    VALUES (p_user_id, 1, 1, v_today);
    RETURN;
  END IF;

  -- Already logged activity today
  IF v_streak.last_activity_date = v_today THEN
    RETURN;
  END IF;

  IF v_streak.last_activity_date = v_today - INTERVAL '1 day' THEN
    -- Consecutive day: increment
    UPDATE public.streaks
    SET
      current_streak     = current_streak + 1,
      longest_streak     = GREATEST(longest_streak, current_streak + 1),
      last_activity_date = v_today,
      updated_at         = NOW()
    WHERE user_id = p_user_id;

    -- Milestone XP
    IF (v_streak.current_streak + 1) = 7 THEN
      PERFORM public.award_xp(p_user_id, 150, 'streak_bonus_7',
        NULL, '{"streak_days": 7}'::JSONB);
    ELSIF (v_streak.current_streak + 1) = 30 THEN
      PERFORM public.award_xp(p_user_id, 500, 'streak_bonus_30',
        NULL, '{"streak_days": 30}'::JSONB);
    ELSIF (v_streak.current_streak + 1) = 100 THEN
      PERFORM public.award_xp(p_user_id, 2000, 'streak_bonus_100',
        NULL, '{"streak_days": 100}'::JSONB);
    END IF;

  ELSE
    -- Streak broken: reset to 1
    UPDATE public.streaks
    SET
      current_streak     = 1,
      last_activity_date = v_today,
      updated_at         = NOW()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_streak IS
  'Call on any study activity. Handles consecutive-day detection in user local timezone. '
  'Grants streak milestone XP at 7, 30, and 100 days. Uses FOR UPDATE for race safety.';


-- ─── GENERATE_DAILY_MISSIONS ───────────────────────────────────────────────
-- The Mission Engine. Called on login if missions don't exist for today.
-- Idempotent: ON CONFLICT DO NOTHING makes it safe to call multiple times.
-- Algorithm weights: notes_gap 25%, confidence_gap 30%, accuracy_gap 30%,
-- recency_penalty 15% — all multiplied by urgency × priority.

CREATE OR REPLACE FUNCTION public.generate_daily_missions(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today          DATE := CURRENT_DATE;
  v_existing_count INTEGER;
  v_inserted       INTEGER := 0;
  v_budget         INTEGER;
  v_max_missions   INTEGER;
  rec              RECORD;
  v_mission_type   mission_type_enum;
  v_title          TEXT;
  v_description    TEXT;
  v_xp_reward      SMALLINT;
  v_rows           INTEGER;
BEGIN
  SELECT COALESCE(max_missions_per_day, 3) INTO v_max_missions
  FROM public.user_settings WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_existing_count
  FROM public.daily_missions
  WHERE user_id = p_user_id AND mission_date = v_today;

  v_budget := v_max_missions - v_existing_count;
  IF v_budget <= 0 THEN RETURN 0; END IF;

  -- ── Chapter Missions ─────────────────────────────────────────────────────
  FOR rec IN
    WITH chapter_scores AS (
      SELECT
        uc.id                     AS user_chapter_id,
        uc.chapter_id,
        c.title                   AS chapter_title,
        s.id                      AS subject_id,
        s.name                    AS subject_name,
        us.priority,
        uc.notes_status,
        uc.confidence_level,
        uc.last_reviewed_at,
        CASE WHEN uc.notes_status != 'complete' THEN 1.0 ELSE 0.0 END AS notes_gap,
        (5.0 - COALESCE(uc.confidence_level, 3)) / 4.0                 AS confidence_gap,
        (1.0 - COALESCE((
          SELECT AVG(pqa.marks_obtained::NUMERIC / NULLIF(pqa.marks_available, 0))
          FROM public.paper_question_attempts pqa
          JOIN public.past_papers pp ON pp.id = pqa.paper_id
          WHERE pqa.chapter_id = uc.chapter_id AND pp.user_id = p_user_id
        ), 0.7))                                                         AS accuracy_gap,
        LEAST(COALESCE(
          EXTRACT(DAY FROM (NOW() - uc.last_reviewed_at))::NUMERIC, 14
        ), 14) / 14.0                                                    AS recency_penalty,
        GREATEST(
          1.0 / NULLIF(
            EXTRACT(DAY FROM (us.exam_date - CURRENT_DATE))::NUMERIC, 0
          ), 0.01
        )                                                                AS urgency
      FROM public.user_chapters uc
      JOIN public.chapters c      ON c.id = uc.chapter_id
      JOIN public.subjects s      ON s.id = c.subject_id
      JOIN public.user_subjects us
        ON us.user_id = p_user_id AND us.subject_id = s.id
      WHERE uc.user_id = p_user_id
        AND us.exam_date IS NOT NULL
        AND us.exam_date > CURRENT_DATE
        AND us.is_archived = FALSE
    )
    SELECT *,
      (notes_gap * 0.25 + confidence_gap * 0.30 +
       accuracy_gap * 0.30 + recency_penalty * 0.15)
      * urgency * (priority::NUMERIC / 3.0) AS chapter_score
    FROM chapter_scores
    ORDER BY chapter_score DESC
    LIMIT v_budget
  LOOP
    IF rec.notes_status = 'none' THEN
      v_mission_type := 'complete_notes';
      v_title        := 'Complete Chapter Notes';
      v_description  := rec.chapter_title || ' · ' || rec.subject_name;
      v_xp_reward    := 50;
    ELSIF rec.accuracy_gap > 0.4 THEN
      v_mission_type := 'revisit_weak_topic';
      v_title        := 'Revisit Weak Topic';
      v_description  := rec.chapter_title || ' — low accuracy detected';
      v_xp_reward    := 40;
    ELSIF rec.notes_status = 'in_progress' THEN
      v_mission_type := 'complete_notes';
      v_title        := 'Finish Chapter Notes';
      v_description  := rec.chapter_title || ' · ' || rec.subject_name;
      v_xp_reward    := 50;
    ELSE
      v_mission_type := 'review_chapter';
      v_title        := 'Review Chapter';
      v_description  := rec.chapter_title || ' · ' || rec.subject_name;
      v_xp_reward    := 30;
    END IF;

    INSERT INTO public.daily_missions (
      user_id, mission_date, type, target_entity_type,
      target_entity_id, title, description, xp_reward, status
    )
    VALUES (
      p_user_id, v_today, v_mission_type, 'chapter',
      rec.user_chapter_id, v_title, v_description, v_xp_reward, 'pending'
    )
    ON CONFLICT (user_id, mission_date, type, target_entity_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_inserted + v_rows;
    v_budget   := v_budget - 1;
    EXIT WHEN v_budget <= 0;
  END LOOP;

  -- ── Paper Mission ─────────────────────────────────────────────────────────
  IF v_budget > 0 AND NOT EXISTS (
    SELECT 1 FROM public.past_papers
    WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '7 days'
  ) THEN
    INSERT INTO public.daily_missions (
      user_id, mission_date, type, target_entity_type,
      target_entity_id, title, description, xp_reward, status
    )
    SELECT
      p_user_id, v_today, 'attempt_paper', 'subject',
      us.subject_id,
      'Attempt a Past Paper',
      'Practice with a ' || s.name || ' past paper',
      75, 'pending'
    FROM public.user_subjects us
    JOIN public.subjects s ON s.id = us.subject_id
    WHERE us.user_id = p_user_id
      AND us.exam_date IS NOT NULL
      AND us.exam_date > CURRENT_DATE
      AND us.is_archived = FALSE
    ORDER BY us.exam_date ASC
    LIMIT 1
    ON CONFLICT (user_id, mission_date, type, target_entity_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_inserted + v_rows;
  END IF;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.generate_daily_missions IS
  'Mission Engine: generates up to max_missions_per_day missions using weighted chapter scores. '
  'Weights: notes_gap 25%, confidence_gap 30%, accuracy_gap 30%, recency_penalty 15%. '
  'ON CONFLICT ensures idempotency — safe to call on every page load.';


-- ─── COMPLETE_MISSION ──────────────────────────────────────────────────────
-- Atomic RPC called by client: supabase.rpc("complete_mission", {...})
-- Marks mission done, awards XP, updates streak, checks achievements.
-- Returns enriched JSONB for client toast notifications.

CREATE OR REPLACE FUNCTION public.complete_mission(
  p_mission_id UUID,
  p_user_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission      public.daily_missions%ROWTYPE;
  v_profile      public.profiles%ROWTYPE;
  v_streak       public.streaks%ROWTYPE;
  v_achievements JSONB    := '[]'::JSONB;
  v_ach_xp       SMALLINT := 0;
  v_rows         INTEGER;
  rec            RECORD;
BEGIN
  SELECT * INTO v_mission
  FROM public.daily_missions
  WHERE id = p_mission_id AND user_id = p_user_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission not found, already completed, or unauthorised: %', p_mission_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.daily_missions
  SET status = 'completed', completed_at = NOW()
  WHERE id = p_mission_id;

  PERFORM public.award_xp(
    p_user_id, v_mission.xp_reward, 'mission_complete',
    p_mission_id,
    jsonb_build_object('mission_type', v_mission.type)
  );

  -- All missions complete today → bonus XP
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_missions
    WHERE user_id = p_user_id
      AND mission_date = CURRENT_DATE
      AND status = 'pending'
      AND id != p_mission_id
  ) THEN
    PERFORM public.award_xp(
      p_user_id, 25, 'mission_complete',
      NULL, '{"bonus": "all_missions_complete"}'::JSONB
    );
  END IF;

  PERFORM public.update_streak(p_user_id);

  IF v_mission.target_entity_type = 'chapter'
     AND v_mission.target_entity_id IS NOT NULL
  THEN
    UPDATE public.user_chapters
    SET last_reviewed_at = NOW(), updated_at = NOW()
    WHERE id = v_mission.target_entity_id AND user_id = p_user_id;
  END IF;

  FOR rec IN SELECT * FROM public.check_and_unlock_achievements(p_user_id)
  LOOP
    v_achievements := v_achievements || jsonb_build_object(
      'key', rec.achievement_key, 'xp', rec.xp_reward
    );
    v_ach_xp := v_ach_xp + rec.xp_reward;
  END LOOP;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  SELECT * INTO v_streak  FROM public.streaks  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'xp_awarded',            v_mission.xp_reward,
    'achievement_xp',        v_ach_xp,
    'new_total_xp',          v_profile.total_xp,
    'new_level',             v_profile.current_level,
    'level_title',           public.compute_level_title(v_profile.current_level),
    'streak_days',           v_streak.current_streak,
    'achievements_unlocked', v_achievements
  );
END;
$$;

COMMENT ON FUNCTION public.complete_mission IS
  'Atomic mission completion: marks done, awards XP, updates streak, checks achievements. '
  'Returns enriched JSONB for client toast notifications. '
  'Usage: supabase.rpc("complete_mission", { p_mission_id, p_user_id })';


-- ─── COMPUTE_READINESS_SCORE ───────────────────────────────────────────────
-- score = (notes_pct × 0.35) + (paper_accuracy × 0.40) + (confidence × 0.25)
-- Pass NULL subject_id for overall score across all subjects.
-- Returns 0.00–100.00.

CREATE OR REPLACE FUNCTION public.compute_readiness_score(
  p_user_id    UUID,
  p_subject_id UUID DEFAULT NULL
)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notes_pct          NUMERIC;
  v_avg_paper_accuracy NUMERIC;
  v_avg_confidence     NUMERIC;
BEGIN
  SELECT
    CASE WHEN COUNT(*) = 0 THEN 0
    ELSE COUNT(*) FILTER (WHERE uc.notes_status = 'complete')::NUMERIC / COUNT(*)
    END
  INTO v_notes_pct
  FROM public.user_chapters uc
  JOIN public.chapters c ON c.id = uc.chapter_id
  WHERE uc.user_id = p_user_id
    AND (p_subject_id IS NULL OR c.subject_id = p_subject_id);

  SELECT COALESCE(AVG(pp.accuracy_pct) / 100.0, 0)
  INTO v_avg_paper_accuracy
  FROM public.past_papers pp
  WHERE pp.user_id = p_user_id
    AND (p_subject_id IS NULL OR pp.subject_id = p_subject_id);

  SELECT COALESCE(AVG(uc.confidence_level) / 5.0, 0)
  INTO v_avg_confidence
  FROM public.user_chapters uc
  JOIN public.chapters c ON c.id = uc.chapter_id
  WHERE uc.user_id = p_user_id
    AND uc.confidence_level IS NOT NULL
    AND (p_subject_id IS NULL OR c.subject_id = p_subject_id);

  RETURN ROUND(
    (v_notes_pct * 0.35 + v_avg_paper_accuracy * 0.40 + v_avg_confidence * 0.25) * 100,
    2
  );
END;
$$;


-- ─── GET_USER_DASHBOARD_STATS ──────────────────────────────────────────────
-- Single RPC to fetch all dashboard data in one round-trip.
-- Prevents N+1 queries from the client fetching each widget separately.

CREATE OR REPLACE FUNCTION public.get_user_dashboard_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile   public.profiles%ROWTYPE;
  v_streak    public.streaks%ROWTYPE;
  v_readiness NUMERIC(5,2);
  v_result    JSONB;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  SELECT * INTO v_streak  FROM public.streaks  WHERE user_id = p_user_id;
  v_readiness := public.compute_readiness_score(p_user_id, NULL);

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'full_name',     v_profile.full_name,
      'avatar_url',    v_profile.avatar_url,
      'total_xp',      v_profile.total_xp,
      'current_level', v_profile.current_level,
      'level_title',   public.compute_level_title(v_profile.current_level)
    ),
    'streak', jsonb_build_object(
      'current',   v_streak.current_streak,
      'longest',   v_streak.longest_streak,
      'last_date', v_streak.last_activity_date
    ),
    'overall_readiness', v_readiness,
    'today_missions', (
      SELECT json_agg(row_to_json(dm.*))
      FROM public.daily_missions dm
      WHERE dm.user_id = p_user_id AND dm.mission_date = CURRENT_DATE
    ),
    'subject_readiness', (
      SELECT json_agg(jsonb_build_object(
        'subject_id',   us.subject_id,
        'subject_name', s.name,
        'color_hex',    s.color_hex,
        'exam_date',    us.exam_date,
        'days_until',   (us.exam_date - CURRENT_DATE),
        'readiness',    public.compute_readiness_score(p_user_id, us.subject_id)
      ))
      FROM public.user_subjects us
      JOIN public.subjects s ON s.id = us.subject_id
      WHERE us.user_id = p_user_id AND us.is_archived = FALSE
    ),
    'recent_xp_events', (
      SELECT json_agg(row_to_json(xe.*))
      FROM (
        SELECT * FROM public.xp_events
        WHERE user_id = p_user_id
        ORDER BY created_at DESC LIMIT 10
      ) xe
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- ─── GET_LEADERBOARD ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_scope TEXT    DEFAULT 'all_time',
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  rank          BIGINT,
  user_id       UUID,
  full_name     TEXT,
  avatar_url    TEXT,
  current_level SMALLINT,
  level_title   TEXT,
  xp_value      BIGINT,
  streak_days   INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_scope = 'weekly' THEN
    RETURN QUERY
      SELECT
        ROW_NUMBER() OVER (ORDER BY SUM(xe.xp_amount) DESC) AS rank,
        p.id, p.full_name, p.avatar_url, p.current_level,
        public.compute_level_title(p.current_level),
        SUM(xe.xp_amount)::BIGINT,
        s.current_streak
      FROM public.profiles p
      LEFT JOIN public.xp_events xe ON xe.user_id = p.id
        AND xe.created_at >= DATE_TRUNC('week', NOW())
      LEFT JOIN public.streaks s ON s.user_id = p.id
      GROUP BY p.id, p.full_name, p.avatar_url, p.current_level, s.current_streak
      ORDER BY SUM(xe.xp_amount) DESC NULLS LAST
      LIMIT p_limit;
  ELSE
    RETURN QUERY
      SELECT
        ROW_NUMBER() OVER (ORDER BY p.total_xp DESC) AS rank,
        p.id, p.full_name, p.avatar_url, p.current_level,
        public.compute_level_title(p.current_level),
        p.total_xp::BIGINT,
        s.current_streak
      FROM public.profiles p
      LEFT JOIN public.streaks s ON s.user_id = p.id
      ORDER BY p.total_xp DESC
      LIMIT p_limit;
  END IF;
END;
$$;


-- ─── ARCHIVE_PAST_EXAMS ────────────────────────────────────────────────────
-- Schedule as a nightly cron via Supabase Dashboard → Database → Cron Jobs:
-- SELECT cron.schedule('archive_exams', '0 3 * * *', 'SELECT public.archive_past_exams()');

CREATE OR REPLACE FUNCTION public.archive_past_exams()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.user_subjects
  SET is_archived = TRUE, updated_at = NOW()
  WHERE exam_date < CURRENT_DATE AND is_archived = FALSE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
