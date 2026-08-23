-- ============================================================
-- MIGRATION 015: Fix update_streak constraint + award_xp overloads
--
-- Fixes:
--   1. streaks_longest_gte_current constraint violation:
--      The "streak broken" reset path set current_streak = 1
--      but left longest_streak = 0 for brand-new users.
--      Fix: always set longest_streak = GREATEST(longest_streak, new_current).
--
--   2. award_xp PL/pgSQL type mismatch:
--      Uncast string literals passed to award_xp resolve as type
--      'unknown' which doesn't match xp_event_type_enum, causing
--      the entire user_chapters UPDATE to be rolled back.
--      Fix: add a TEXT/INTEGER overload that casts to the correct types,
--      and update both trigger functions to use explicit casts.
-- ============================================================


-- ── 1. Fix update_streak ────────────────────────────────────────────────────

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

  -- Already logged activity today — nothing to do
  IF v_streak.last_activity_date = v_today THEN
    RETURN;
  END IF;

  IF v_streak.last_activity_date = v_today - INTERVAL '1 day' THEN
    -- Consecutive day: increment streak
    UPDATE public.streaks
    SET
      current_streak     = current_streak + 1,
      -- GREATEST ensures longest_streak always >= current_streak
      longest_streak     = GREATEST(longest_streak, current_streak + 1),
      last_activity_date = v_today,
      updated_at         = NOW()
    WHERE user_id = p_user_id;

    -- Milestone XP
    IF (v_streak.current_streak + 1) = 7 THEN
      PERFORM public.award_xp(p_user_id, 150::SMALLINT, 'streak_bonus_7'::public.xp_event_type_enum,
        NULL, '{"streak_days": 7}'::JSONB);
    ELSIF (v_streak.current_streak + 1) = 30 THEN
      PERFORM public.award_xp(p_user_id, 500::SMALLINT, 'streak_bonus_30'::public.xp_event_type_enum,
        NULL, '{"streak_days": 30}'::JSONB);
    ELSIF (v_streak.current_streak + 1) = 100 THEN
      PERFORM public.award_xp(p_user_id, 2000::SMALLINT, 'streak_bonus_100'::public.xp_event_type_enum,
        NULL, '{"streak_days": 100}'::JSONB);
    END IF;

  ELSE
    -- Streak broken: reset to 1
    -- GREATEST(longest_streak, 1) prevents violating longest_gte_current
    -- when the user has never had a streak before (longest_streak = 0).
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


-- ── 2. award_xp TEXT/INTEGER overload ──────────────────────────────────────
-- Catches uncast string literals from PL/pgSQL (typed as 'unknown').
-- Delegates to the canonical SMALLINT/enum overload.

CREATE OR REPLACE FUNCTION public.award_xp(
  p_user_id      UUID,
  p_amount       INTEGER,
  p_event_type   TEXT,
  p_reference_id UUID    DEFAULT NULL,
  p_metadata     JSONB   DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.award_xp(
    p_user_id,
    p_amount::SMALLINT,
    p_event_type::public.xp_event_type_enum,
    p_reference_id,
    p_metadata
  );
END;
$$;


-- ── 3. Fix handle_notes_status_change with explicit casts ───────────────────

CREATE OR REPLACE FUNCTION public.handle_notes_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.notes_status = 'complete' AND (OLD.notes_status IS NULL OR OLD.notes_status != 'complete') THEN
    PERFORM public.award_xp(
      NEW.user_id,
      50::SMALLINT,
      'notes_complete'::public.xp_event_type_enum,
      NEW.id,
      jsonb_build_object('chapter_id', NEW.chapter_id)
    );
    NEW.last_reviewed_at  := NOW();
    NEW.revision_count    := COALESCE(OLD.revision_count, 0) + 1;
    IF OLD.first_completed_at IS NULL THEN
      NEW.first_completed_at := NOW();
    END IF;
    PERFORM public.update_streak(NEW.user_id);
  END IF;

  IF NEW.notes_status = 'in_progress' AND (OLD.notes_status IS NULL OR OLD.notes_status = 'none') THEN
    PERFORM public.award_xp(
      NEW.user_id,
      10::SMALLINT,
      'notes_in_progress'::public.xp_event_type_enum,
      NEW.id,
      jsonb_build_object('chapter_id', NEW.chapter_id)
    );
  END IF;

  RETURN NEW;
END;
$$;


-- ── 4. Fix handle_confidence_update with explicit casts ─────────────────────

CREATE OR REPLACE FUNCTION public.handle_confidence_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.confidence_level IS DISTINCT FROM OLD.confidence_level
     AND NEW.confidence_level IS NOT NULL
  THEN
    PERFORM public.award_xp(
      NEW.user_id,
      5::SMALLINT,
      'confidence_update'::public.xp_event_type_enum,
      NEW.id,
      jsonb_build_object('level', NEW.confidence_level)
    );
    NEW.last_reviewed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;
