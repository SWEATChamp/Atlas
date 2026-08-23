-- ============================================================
-- MIGRATION 010: Database Triggers
-- Must run AFTER 008 and 009 (functions must exist first).
--
-- Triggers:
--   on_auth_user_created       → calls handle_new_user()
--   sync_xp_after_event        → syncs xp_events → profiles
--   set_*_updated_at           → auto-sets updated_at on UPDATE
--   on_notes_status_change     → awards XP when notes completed
--   on_paper_logged            → awards XP when paper recorded
--   on_confidence_update       → awards XP for self-assessment
--   on_achievement_unlock      → creates notification row
-- ============================================================

-- ─── AUTH: NEW USER ──────────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ─── XP SYNC ────────────────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER sync_xp_after_event
  AFTER INSERT ON public.xp_events
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_xp_to_profile();


-- ─── UPDATED_AT (applied to all tables with that column) ──────────────────
CREATE OR REPLACE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_user_subjects_updated_at
  BEFORE UPDATE ON public.user_subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_user_chapters_updated_at
  BEFORE UPDATE ON public.user_chapters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_google_docs_tokens_updated_at
  BEFORE UPDATE ON public.google_docs_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_streaks_updated_at
  BEFORE UPDATE ON public.streaks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_study_pets_updated_at
  BEFORE UPDATE ON public.study_pets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_challenge_progress_updated_at
  BEFORE UPDATE ON public.challenge_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_coach_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── NOTES STATUS CHANGE ─────────────────────────────────────────────────
-- Awards XP when notes_status transitions to 'in_progress' or 'complete'.
-- Also updates last_reviewed_at.

CREATE OR REPLACE FUNCTION public.handle_notes_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.notes_status = 'complete' AND OLD.notes_status != 'complete' THEN
    PERFORM public.award_xp(
      NEW.user_id, 50, 'notes_complete', NEW.id,
      jsonb_build_object('chapter_id', NEW.chapter_id)
    );
    NEW.last_reviewed_at := NOW();
    PERFORM public.update_streak(NEW.user_id);
  END IF;

  IF NEW.notes_status = 'in_progress' AND OLD.notes_status = 'none' THEN
    PERFORM public.award_xp(
      NEW.user_id, 10, 'notes_in_progress', NEW.id,
      jsonb_build_object('chapter_id', NEW.chapter_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_notes_status_change
  BEFORE UPDATE OF notes_status ON public.user_chapters
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_notes_status_change();


-- ─── PAPER LOGGED ────────────────────────────────────────────────────────
-- Awards XP and updates streak when a past paper is logged.

CREATE OR REPLACE FUNCTION public.handle_paper_logged()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_xp(
    NEW.user_id, 75, 'paper_attempt', NEW.id,
    jsonb_build_object(
      'subject_id',   NEW.subject_id,
      'paper_code',   NEW.paper_code,
      'accuracy_pct', NEW.accuracy_pct
    )
  );
  PERFORM public.update_streak(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_paper_logged
  AFTER INSERT ON public.past_papers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_paper_logged();


-- ─── CONFIDENCE UPDATE ────────────────────────────────────────────────────
-- Awards small XP for self-assessment. Encourages regular confidence updates.

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
      NEW.user_id, 5, 'confidence_update', NEW.id,
      jsonb_build_object('level', NEW.confidence_level)
    );
    NEW.last_reviewed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_confidence_update
  BEFORE UPDATE OF confidence_level ON public.user_chapters
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_confidence_update();


-- ─── ACHIEVEMENT UNLOCK NOTIFICATION ─────────────────────────────────────
-- Creates a notification row when a badge is unlocked.
-- Client reads this via real-time subscription to show toast.

CREATE OR REPLACE FUNCTION public.handle_achievement_unlock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_def public.achievement_definitions%ROWTYPE;
BEGIN
  SELECT * INTO v_def
  FROM public.achievement_definitions
  WHERE key = NEW.achievement_key;

  IF FOUND THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.user_id,
      'achievement_unlock',
      '🏆 Achievement Unlocked!',
      v_def.name || ' — ' || v_def.description,
      jsonb_build_object(
        'achievement_key', NEW.achievement_key,
        'xp_reward',       v_def.xp_reward,
        'icon',            v_def.icon,
        'color_hex',       v_def.color_hex
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_achievement_unlock
  AFTER INSERT ON public.user_achievements
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_achievement_unlock();
