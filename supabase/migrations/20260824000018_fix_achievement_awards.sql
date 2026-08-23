-- ============================================================
-- MIGRATION 018: Fix achievement unlock output-name conflict
--
-- The function returns a column named achievement_key. In PL/pgSQL,
-- that output variable conflicted with the achievement_key column in
-- the ON CONFLICT target. Referencing the named constraint removes the
-- ambiguity. XP is now awarded only when the unlock row was inserted.
-- ============================================================

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
BEGIN
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
          AND mission_date = CURRENT_DATE;

      WHEN 'night_owl' THEN
        SELECT COUNT(*) > 0 INTO v_condition_met
        FROM public.xp_events
        WHERE user_id = p_user_id
          AND EXTRACT(HOUR FROM created_at) < 4;

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
        xp_reward       := v_rec.xp_reward;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_and_unlock_achievements IS
  'Evaluates active achievements, inserts each unlock once, and awards XP only for a newly inserted unlock.';
