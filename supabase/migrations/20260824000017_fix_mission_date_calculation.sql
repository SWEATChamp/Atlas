-- ============================================================
-- MIGRATION 017: Fix Mission Engine exam-date calculation
--
-- PostgreSQL DATE - DATE returns an integer number of days.
-- The previous function passed that integer to EXTRACT(), causing:
--   function pg_catalog.extract(unknown, integer) does not exist
--
-- This replacement uses the day count directly.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_daily_missions(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today                       DATE := CURRENT_DATE;
  v_existing_count              INTEGER;
  v_inserted                    INTEGER := 0;
  v_budget                      INTEGER;
  v_max_missions                INTEGER;
  v_last_generated              DATE;
  rec                           RECORD;
  v_mission_type                mission_type_enum;
  v_title                       TEXT;
  v_description                 TEXT;
  v_xp_reward                   SMALLINT;
  v_difficulty                  TEXT;
  v_rows                        INTEGER;
BEGIN
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
        (5.0 - COALESCE(uc.confidence_level, 3)) / 4.0                 AS confidence_gap,
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
          1.0 / NULLIF((us.exam_date - CURRENT_DATE)::NUMERIC, 0),
          0.01
        ) AS urgency
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
    SELECT 1 FROM public.past_papers
    WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '7 days'
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
      AND us.exam_date > CURRENT_DATE
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
  'Generates up to the configured daily mission limit using chapter gaps, exam urgency, '
  'subject priority, paper accuracy, confidence, and review recency. DATE subtraction is '
  'used directly for days-to-exam urgency.';
