-- ============================================================
-- MIGRATION 019: Use each user's local date consistently
--
-- Browser timezones are stored as IANA names on profiles.timezone.
-- Invalid or missing values safely fall back to UTC.
-- ============================================================


-- ── Shared timezone helpers ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_timezone(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_timezone TEXT;
BEGIN
  SELECT p.timezone
  INTO v_timezone
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF v_timezone IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names tz
    WHERE tz.name = v_timezone
  ) THEN
    RETURN 'UTC';
  END IF;

  RETURN v_timezone;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_local_date(p_user_id UUID)
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE public.get_user_timezone(p_user_id))::DATE;
$$;

COMMENT ON FUNCTION public.get_user_timezone IS
  'Returns a validated IANA timezone for a user, falling back to UTC.';

COMMENT ON FUNCTION public.get_user_local_date IS
  'Returns the current calendar date in the user''s saved timezone.';

REVOKE ALL ON FUNCTION public.get_user_timezone(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_local_date(UUID) FROM PUBLIC;


-- ── Streaks ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_streak(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_streak public.streaks%ROWTYPE;
  v_today  DATE;
BEGIN
  v_today := public.get_user_local_date(p_user_id);

  SELECT * INTO v_streak
  FROM public.streaks
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.streaks (user_id, current_streak, longest_streak, last_activity_date)
    VALUES (p_user_id, 1, 1, v_today);
    RETURN;
  END IF;

  IF v_streak.last_activity_date = v_today THEN
    RETURN;
  END IF;

  IF v_streak.last_activity_date = v_today - 1 THEN
    UPDATE public.streaks
    SET
      current_streak     = current_streak + 1,
      longest_streak     = GREATEST(longest_streak, current_streak + 1),
      last_activity_date = v_today,
      updated_at         = NOW()
    WHERE user_id = p_user_id;

    IF (v_streak.current_streak + 1) = 7 THEN
      PERFORM public.award_xp(
        p_user_id, 150::SMALLINT, 'streak_bonus_7'::public.xp_event_type_enum,
        NULL, '{"streak_days": 7}'::JSONB
      );
    ELSIF (v_streak.current_streak + 1) = 30 THEN
      PERFORM public.award_xp(
        p_user_id, 500::SMALLINT, 'streak_bonus_30'::public.xp_event_type_enum,
        NULL, '{"streak_days": 30}'::JSONB
      );
    ELSIF (v_streak.current_streak + 1) = 100 THEN
      PERFORM public.award_xp(
        p_user_id, 2000::SMALLINT, 'streak_bonus_100'::public.xp_event_type_enum,
        NULL, '{"streak_days": 100}'::JSONB
      );
    END IF;
  ELSE
    UPDATE public.streaks
    SET
      current_streak     = 1,
      longest_streak     = GREATEST(longest_streak, 1),
      last_activity_date = v_today,
      updated_at         = NOW()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;


-- ── Daily mission generation ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_daily_missions(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today          DATE;
  v_existing_count INTEGER;
  v_inserted       INTEGER := 0;
  v_budget         INTEGER;
  v_max_missions   INTEGER;
  v_last_generated DATE;
  rec              RECORD;
  v_mission_type   mission_type_enum;
  v_title          TEXT;
  v_description    TEXT;
  v_xp_reward      SMALLINT;
  v_difficulty     TEXT;
  v_rows           INTEGER;
BEGIN
  v_today := public.get_user_local_date(p_user_id);

  SELECT max_missions_per_day, missions_last_generated_date
  INTO v_max_missions, v_last_generated
  FROM public.user_settings
  WHERE user_id = p_user_id;

  v_max_missions := COALESCE(v_max_missions, 3);

  IF v_last_generated = v_today THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM public.daily_missions
  WHERE user_id = p_user_id AND mission_date = v_today;

  v_budget := v_max_missions - v_existing_count;
  IF v_budget <= 0 THEN
    UPDATE public.user_settings
    SET missions_last_generated_date = v_today
    WHERE user_id = p_user_id;
    RETURN 0;
  END IF;

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
        uc.revision_count,
        CASE WHEN uc.notes_status != 'complete' THEN 1.0 ELSE 0.0 END AS notes_gap,
        (5.0 - COALESCE(uc.confidence_level, 3)) / 4.0 AS confidence_gap,
        (1.0 - COALESCE((
          SELECT AVG(pqa.marks_obtained::NUMERIC / NULLIF(pqa.marks_available, 0))
          FROM public.paper_question_attempts pqa
          JOIN public.past_papers pp ON pp.id = pqa.paper_id
          WHERE pqa.chapter_id = uc.chapter_id AND pp.user_id = p_user_id
        ), 0.7)) AS accuracy_gap,
        LEAST(COALESCE(
          EXTRACT(DAY FROM (NOW() - uc.last_reviewed_at))::NUMERIC, 14
        ), 14) / 14.0
        * (1.0 / GREATEST(COALESCE(uc.revision_count, 0)::NUMERIC * 0.2 + 1.0, 1.0)) AS recency_penalty,
        GREATEST(
          1.0 / NULLIF((us.exam_date - v_today)::NUMERIC, 0),
          0.01
        ) AS urgency
      FROM public.user_chapters uc
      JOIN public.chapters c ON c.id = uc.chapter_id
      JOIN public.subjects s ON s.id = c.subject_id
      JOIN public.user_subjects us
        ON us.user_id = p_user_id AND us.subject_id = s.id
      WHERE uc.user_id = p_user_id
        AND us.exam_date IS NOT NULL
        AND us.exam_date > v_today
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
      v_difficulty   := 'medium';
    ELSIF rec.accuracy_gap > 0.4 THEN
      v_mission_type := 'revisit_weak_topic';
      v_title        := 'Revisit Weak Topic';
      v_description  := rec.chapter_title || ' — low accuracy detected';
      v_xp_reward    := 40;
      v_difficulty   := 'hard';
    ELSIF rec.notes_status = 'in_progress' THEN
      v_mission_type := 'complete_notes';
      v_title        := 'Finish Chapter Notes';
      v_description  := rec.chapter_title || ' · ' || rec.subject_name;
      v_xp_reward    := 50;
      v_difficulty   := 'medium';
    ELSE
      v_mission_type := 'review_chapter';
      v_title        := 'Review Chapter';
      v_description  := rec.chapter_title || ' · ' || rec.subject_name;
      v_xp_reward    := 30;
      v_difficulty   := 'easy';
    END IF;

    INSERT INTO public.daily_missions (
      user_id, mission_date, type, target_entity_type,
      target_entity_id, title, description, xp_reward, status, difficulty
    )
    VALUES (
      p_user_id, v_today, v_mission_type, 'chapter',
      rec.user_chapter_id, v_title, v_description, v_xp_reward, 'pending', v_difficulty
    )
    ON CONFLICT (user_id, mission_date, type, target_entity_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_inserted + v_rows;
    v_budget   := v_budget - 1;
    EXIT WHEN v_budget <= 0;
  END LOOP;

  IF v_budget > 0 AND NOT EXISTS (
    SELECT 1
    FROM public.past_papers
    WHERE user_id = p_user_id
      AND attempted_at BETWEEN (v_today - 6) AND v_today
  ) THEN
    INSERT INTO public.daily_missions (
      user_id, mission_date, type, target_entity_type,
      target_entity_id, title, description, xp_reward, status, difficulty
    )
    SELECT
      p_user_id, v_today, 'attempt_paper', 'subject',
      us.subject_id,
      'Attempt a Past Paper',
      'Practice with a ' || s.name || ' past paper',
      75, 'pending', 'hard'
    FROM public.user_subjects us
    JOIN public.subjects s ON s.id = us.subject_id
    WHERE us.user_id = p_user_id
      AND us.exam_date IS NOT NULL
      AND us.exam_date > v_today
      AND us.is_archived = FALSE
    ORDER BY us.exam_date ASC
    LIMIT 1
    ON CONFLICT (user_id, mission_date, type, target_entity_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_inserted + v_rows;
  END IF;

  UPDATE public.user_settings
  SET missions_last_generated_date = v_today
  WHERE user_id = p_user_id;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.generate_daily_missions IS
  'Generates daily missions using the user''s local calendar date.';


-- ── Mission completion ────────────────────────────────────────────────────

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
  v_today        DATE;
  rec            RECORD;
BEGIN
  v_today := public.get_user_local_date(p_user_id);

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

  IF v_mission.mission_date = v_today AND NOT EXISTS (
    SELECT 1
    FROM public.daily_missions
    WHERE user_id = p_user_id
      AND mission_date = v_today
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
  SELECT * INTO v_streak FROM public.streaks WHERE user_id = p_user_id;

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
  'Completes a mission and applies daily rewards using the user''s local date.';


-- ── Achievement checks ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_and_unlock_achievements(p_user_id UUID)
RETURNS TABLE(achievement_key TEXT, xp_reward SMALLINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec           RECORD;
  v_condition_met BOOLEAN;
  v_inserted      INTEGER;
  v_today         DATE;
  v_timezone      TEXT;
BEGIN
  v_today := public.get_user_local_date(p_user_id);
  v_timezone := public.get_user_timezone(p_user_id);

  FOR v_rec IN
    SELECT ad.*
    FROM public.achievement_definitions ad
    WHERE ad.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_achievements ua
        WHERE ua.user_id = p_user_id
          AND ua.achievement_key = ad.key
      )
  LOOP
    v_condition_met := FALSE;

    CASE v_rec.key
      WHEN 'first_blood' THEN
        SELECT COUNT(*) > 0 INTO v_condition_met
        FROM public.user_chapters
        WHERE user_id = p_user_id AND notes_status = 'complete';

      WHEN 'paper_hunter' THEN
        SELECT COUNT(*) > 0 INTO v_condition_met
        FROM public.past_papers
        WHERE user_id = p_user_id;

      WHEN 'five_papers' THEN
        SELECT COUNT(*) >= 5 INTO v_condition_met
        FROM public.past_papers
        WHERE user_id = p_user_id;

      WHEN 'ten_papers' THEN
        SELECT COUNT(*) >= 10 INTO v_condition_met
        FROM public.past_papers
        WHERE user_id = p_user_id;

      WHEN 'ace' THEN
        SELECT COUNT(*) > 0 INTO v_condition_met
        FROM public.past_papers
        WHERE user_id = p_user_id AND accuracy_pct >= 90;

      WHEN 'perfect_score' THEN
        SELECT COUNT(*) > 0 INTO v_condition_met
        FROM public.past_papers
        WHERE user_id = p_user_id AND accuracy_pct = 100;

      WHEN 'streak_7' THEN
        SELECT current_streak >= 7 INTO v_condition_met
        FROM public.streaks
        WHERE user_id = p_user_id;

      WHEN 'streak_30' THEN
        SELECT current_streak >= 30 INTO v_condition_met
        FROM public.streaks
        WHERE user_id = p_user_id;

      WHEN 'streak_100' THEN
        SELECT current_streak >= 100 INTO v_condition_met
        FROM public.streaks
        WHERE user_id = p_user_id;

      WHEN 'completionist' THEN
        SELECT EXISTS (
          SELECT us.subject_id
          FROM public.user_subjects us
          WHERE us.user_id = p_user_id AND us.is_archived = FALSE
          GROUP BY us.subject_id
          HAVING
            (SELECT COUNT(*)
             FROM public.chapters c
             WHERE c.subject_id = us.subject_id AND c.is_global = TRUE)
            =
            (SELECT COUNT(*)
             FROM public.user_chapters uc
             JOIN public.chapters c ON c.id = uc.chapter_id
             WHERE uc.user_id = p_user_id
               AND c.subject_id = us.subject_id
               AND uc.notes_status = 'complete')
        ) INTO v_condition_met;

      WHEN 'speed_run' THEN
        SELECT COUNT(*) >= 3 INTO v_condition_met
        FROM public.daily_missions
        WHERE user_id = p_user_id
          AND status = 'completed'
          AND mission_date = v_today;

      WHEN 'night_owl' THEN
        SELECT COUNT(*) > 0 INTO v_condition_met
        FROM public.xp_events
        WHERE user_id = p_user_id
          AND EXTRACT(HOUR FROM (created_at AT TIME ZONE v_timezone)) < 4;

      WHEN 'multi_subject' THEN
        SELECT COUNT(*) >= 3 INTO v_condition_met
        FROM public.user_subjects
        WHERE user_id = p_user_id AND is_archived = FALSE;

      WHEN 'level_5' THEN
        SELECT current_level >= 5 INTO v_condition_met
        FROM public.profiles
        WHERE id = p_user_id;

      WHEN 'level_10' THEN
        SELECT current_level >= 10 INTO v_condition_met
        FROM public.profiles
        WHERE id = p_user_id;

      WHEN 'atlas_legend' THEN
        SELECT current_level >= 15 INTO v_condition_met
        FROM public.profiles
        WHERE id = p_user_id;

      WHEN 'consistent' THEN
        SELECT COUNT(DISTINCT mission_date) >= 14 INTO v_condition_met
        FROM public.daily_missions
        WHERE user_id = p_user_id AND status = 'completed';

      WHEN 'high_confidence' THEN
        SELECT AVG(confidence_level) >= 4 INTO v_condition_met
        FROM public.user_chapters
        WHERE user_id = p_user_id AND confidence_level IS NOT NULL;

      WHEN 'docs_connected' THEN
        SELECT COUNT(*) > 0 INTO v_condition_met
        FROM public.google_docs_tokens
        WHERE user_id = p_user_id;

      WHEN 'linked_notes' THEN
        SELECT COUNT(*) >= 5 INTO v_condition_met
        FROM public.user_chapters
        WHERE user_id = p_user_id AND google_doc_id IS NOT NULL;

      ELSE
        v_condition_met := FALSE;
    END CASE;

    IF v_condition_met THEN
      INSERT INTO public.user_achievements (user_id, achievement_key)
      VALUES (p_user_id, v_rec.key)
      ON CONFLICT ON CONSTRAINT user_achievements_unique DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;

      IF v_inserted = 1 THEN
        IF v_rec.xp_reward > 0 THEN
          PERFORM public.award_xp(
            p_user_id,
            v_rec.xp_reward,
            'achievement_unlock',
            NULL,
            jsonb_build_object('achievement_key', v_rec.key)
          );
        END IF;

        achievement_key := v_rec.key;
        xp_reward := v_rec.xp_reward;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_and_unlock_achievements IS
  'Evaluates achievements using the user''s local date and time.';


-- ── Dashboard ──────────────────────────────────────────────────────────────

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
  v_today     DATE;
  v_timezone  TEXT;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  SELECT * INTO v_streak FROM public.streaks WHERE user_id = p_user_id;
  v_timezone := public.get_user_timezone(p_user_id);
  v_today := public.get_user_local_date(p_user_id);
  v_readiness := public.compute_readiness_score(p_user_id, NULL);

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'full_name',     v_profile.full_name,
      'avatar_url',    v_profile.avatar_url,
      'total_xp',      v_profile.total_xp,
      'current_level', v_profile.current_level,
      'level_title',   public.compute_level_title(v_profile.current_level),
      'timezone',      v_timezone
    ),
    'streak', jsonb_build_object(
      'current',      COALESCE(v_streak.current_streak, 0),
      'longest',      COALESCE(v_streak.longest_streak, 0),
      'last_date',    v_streak.last_activity_date,
      'active_today', COALESCE(v_streak.last_activity_date = v_today, FALSE)
    ),
    'overall_readiness', v_readiness,
    'today_missions', (
      SELECT json_agg(row_to_json(dm.*))
      FROM public.daily_missions dm
      WHERE dm.user_id = p_user_id AND dm.mission_date = v_today
    ),
    'subject_readiness', (
      SELECT json_agg(jsonb_build_object(
        'subject_id',   us.subject_id,
        'subject_name', s.name,
        'color_hex',    s.color_hex,
        'exam_date',    us.exam_date,
        'days_until',   (us.exam_date - v_today),
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
        ORDER BY created_at DESC
        LIMIT 10
      ) xe
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_user_dashboard_stats IS
  'Returns dashboard data using the user''s local date for daily values.';


-- ── Exam archiving ─────────────────────────────────────────────────────────

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
  WHERE exam_date < public.get_user_local_date(user_id)
    AND is_archived = FALSE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.archive_past_exams IS
  'Archives an exam only after its date has passed in that user''s timezone.';

COMMENT ON COLUMN public.user_settings.missions_last_generated_date IS
  'The last local calendar date for which missions were generated for this user.';
