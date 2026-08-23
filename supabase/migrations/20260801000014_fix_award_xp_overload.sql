-- ============================================================
-- MIGRATION 014: Fix award_xp PL/pgSQL Overloads
-- Fixes type resolution for award_xp when called with string literals.
-- ============================================================

-- Overload 1: Accepts TEXT event_type and INTEGER amount to catch un-casted string literals
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

-- Update handle_notes_status_change with explicit casts
CREATE OR REPLACE FUNCTION public.handle_notes_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── Transition TO 'complete' ────────────────────────────────────────────
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

  -- ── Transition TO 'in_progress' ─────────────────────────────────────────
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

-- Fix handle_confidence_update: same award_xp type mismatch
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
