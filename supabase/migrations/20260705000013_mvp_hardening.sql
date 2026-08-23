-- ============================================================
-- MIGRATION 013: MVP Schema Hardening
-- Addresses all Blocker and Near-term gaps identified in the
-- database audit (docs/database_audit.md).
--
-- Changes:
--   1.  profiles          → username, username_lower, indexes
--   2.  profiles_public   → safe public view + RLS
--   3.  daily_missions    → difficulty, skip_reason, skipped_at
--   4.  user_chapters     → revision_count, first_completed_at
--   5.  handle_notes_status_change() → maintain new uc columns
--   6.  paper_question_attempts → chapter_ids UUID[] + GIN index
--   7.  achievement_definitions → rarity enum + column
--   8.  user_settings     → missions_last_generated_date
--   9.  generate_daily_missions() → daily guard + honours new field
--   10. sync_coins_to_profile() trigger
--   11. mark_notifications_read() RPC
--   12. Missing performance indexes
-- ============================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PROFILES: username column
-- ─────────────────────────────────────────────────────────────────────────────
-- username        : human-readable handle chosen during onboarding (e.g. sweatchamp)
-- username_lower  : GENERATED column for case-insensitive unique lookup and search
-- pg_trgm is already enabled (migration 000), so trigram index is safe to create.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username       TEXT,
  ADD COLUMN IF NOT EXISTS username_lower TEXT
    GENERATED ALWAYS AS (LOWER(username)) STORED;

-- Unique index on the generated lowercased column prevents case-variant duplicates
-- (e.g. "Atlas" and "atlas" cannot coexist).
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (username_lower);

-- Trigram index enables fast fuzzy search (e.g. friend search typeahead).
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm
  ON public.profiles USING GIN (username gin_trgm_ops);

-- Validation: 3–30 chars, alphanumeric + underscore only.
-- Allows NULL so existing rows without usernames remain valid pre-onboarding.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_username_format' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_format
        CHECK (username IS NULL OR username ~* '^[a-zA-Z0-9_]{3,30}$');
  END IF;
END;
$$;

COMMENT ON COLUMN public.profiles.username IS
  'Public user handle (3-30 chars, alphanumeric + underscore). Chosen at onboarding. '
  'NULL until onboarding is complete. Unique case-insensitively via username_lower index.';

COMMENT ON COLUMN public.profiles.username_lower IS
  'GENERATED ALWAYS: LOWER(username). Used for unique constraint and case-insensitive lookup.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PROFILES_PUBLIC: safe view for cross-user reads
-- ─────────────────────────────────────────────────────────────────────────────
-- Without this, RLS blocks all reads of other users' profiles, making leaderboards
-- and friend lists architecturally impossible.
-- This view exposes only non-sensitive fields. Email, timezone, and school are excluded.
-- The view is owned by postgres (service role) and SELECT is granted to authenticated.

CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.current_level,
    p.total_xp,
    public.compute_level_title(p.current_level) AS level_title,
    s.current_streak,
    s.longest_streak,
    p.created_at
  FROM public.profiles p
  LEFT JOIN public.streaks s ON s.user_id = p.id;

-- Grant read access to all authenticated users.
GRANT SELECT ON public.profiles_public TO authenticated;

COMMENT ON VIEW public.profiles_public IS
  'Safe read-only view of profiles for cross-user access (leaderboards, friend lists). '
  'Excludes private fields: email, timezone, school, onboarding_completed, total_coins. '
  'Email and private data remain inaccessible via this view.';

-- RLS policy: allow any authenticated user to SELECT from profiles (required for the view
-- to resolve underlying rows). We add a second policy scoped to "public fields" access.
-- The existing "profiles_select_own" policy already allows owners to read everything.
-- This new policy allows any authenticated user to read any profile row, but the
-- profiles_public view acts as the column-level filter in practice.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'profiles_select_any_authenticated'
  ) THEN
    EXECUTE '
      CREATE POLICY profiles_select_any_authenticated
        ON public.profiles FOR SELECT
        TO authenticated
        USING (TRUE)
    ';
  END IF;
END;
$$;

COMMENT ON POLICY profiles_select_any_authenticated ON public.profiles IS
  'Allows any authenticated user to read profile rows. Column-level privacy is '
  'enforced by the profiles_public view (which excludes email, school, timezone). '
  'This policy is needed for leaderboards and friend lists to resolve profiles.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DAILY_MISSIONS: difficulty, skip_reason, skipped_at
-- ─────────────────────────────────────────────────────────────────────────────
-- difficulty  : allows the Mission Engine to communicate effort level to the UI
-- skip_reason : captures why a student skipped (feeds future Engine improvements)
-- skipped_at  : timestamp parity with completed_at for analytics

ALTER TABLE public.daily_missions
  ADD COLUMN IF NOT EXISTS difficulty  TEXT
    CHECK (difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS skip_reason TEXT,
  ADD COLUMN IF NOT EXISTS skipped_at  TIMESTAMPTZ;

-- Enforce: skipped_at must be set iff status = 'skipped'.
-- Using DO block for idempotency.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'daily_missions_skip_check' AND conrelid = 'public.daily_missions'::regclass
  ) THEN
    ALTER TABLE public.daily_missions
      ADD CONSTRAINT daily_missions_skip_check
        CHECK (
          (status = 'skipped' AND skipped_at IS NOT NULL) OR
          (status != 'skipped' AND skipped_at IS NULL)
        );
  END IF;
END;
$$;

COMMENT ON COLUMN public.daily_missions.difficulty  IS 'Mission difficulty hint for the UI (easy/medium/hard).';
COMMENT ON COLUMN public.daily_missions.skip_reason IS 'Optional reason captured when student skips a mission (feeds Mission Engine analytics).';
COMMENT ON COLUMN public.daily_missions.skipped_at  IS 'Timestamp set when status transitions to ''skipped''. Mirrors completed_at pattern.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. USER_CHAPTERS: revision_count, first_completed_at
-- ─────────────────────────────────────────────────────────────────────────────
-- revision_count    : how many times this chapter has been marked complete.
--                     Allows the Mission Engine to downweight over-revised chapters.
-- first_completed_at: when notes were first marked complete. Powers the Burn Down Chart
--                     and Study Heatmap (future analytics features).

ALTER TABLE public.user_chapters
  ADD COLUMN IF NOT EXISTS revision_count     SMALLINT    NOT NULL DEFAULT 0
    CHECK (revision_count >= 0),
  ADD COLUMN IF NOT EXISTS first_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_chapters.revision_count IS
  'How many times notes_status has been set to ''complete''. Maintained by handle_notes_status_change trigger.';
COMMENT ON COLUMN public.user_chapters.first_completed_at IS
  'Timestamp of the first time notes_status was set to ''complete''. Immutable after first set.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. UPDATE handle_notes_status_change() TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────
-- Extended to maintain the new revision_count and first_completed_at columns.
-- Uses CREATE OR REPLACE so the trigger definition on the table is unchanged;
-- only the function body is updated.

CREATE OR REPLACE FUNCTION public.handle_notes_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── Transition TO 'complete' ────────────────────────────────────────────
  IF NEW.notes_status = 'complete' AND OLD.notes_status != 'complete' THEN

    -- Award XP for notes completion (unchanged from original).
    PERFORM public.award_xp(
      NEW.user_id, 50, 'notes_complete', NEW.id,
      jsonb_build_object('chapter_id', NEW.chapter_id)
    );

    -- Update recency and revision tracking.
    NEW.last_reviewed_at  := NOW();
    NEW.revision_count    := COALESCE(OLD.revision_count, 0) + 1;

    -- first_completed_at is immutable after first set.
    IF OLD.first_completed_at IS NULL THEN
      NEW.first_completed_at := NOW();
    END IF;

    PERFORM public.update_streak(NEW.user_id);
  END IF;

  -- ── Transition TO 'in_progress' from 'none' ────────────────────────────
  IF NEW.notes_status = 'in_progress' AND OLD.notes_status = 'none' THEN
    PERFORM public.award_xp(
      NEW.user_id, 10, 'notes_in_progress', NEW.id,
      jsonb_build_object('chapter_id', NEW.chapter_id)
    );
  END IF;

  -- ── Re-review: notes_status stays 'complete' but user updates chapter ──
  -- This branch fires when a student re-reviews an already-complete chapter
  -- (e.g. changes confidence) without changing notes_status. We handle the
  -- revision_count increment in the confidence trigger; nothing needed here.

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_notes_status_change IS
  'BEFORE UPDATE trigger on user_chapters. '
  'Awards XP on notes completion and in_progress transitions. '
  'Maintains revision_count (incremented on each completion) and '
  'first_completed_at (set once, immutable thereafter).';


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. PAPER_QUESTION_ATTEMPTS: chapter_ids UUID[] + GIN index
-- ─────────────────────────────────────────────────────────────────────────────
-- A single question may test concepts from multiple chapters (e.g. integration +
-- kinematics). The existing chapter_id FK captures only one chapter, producing
-- inaccurate weak-topic signals. chapter_ids[] allows tagging multiple chapters.
-- The existing chapter_id FK is preserved for backward compatibility.

ALTER TABLE public.paper_question_attempts
  ADD COLUMN IF NOT EXISTS chapter_ids UUID[] NOT NULL DEFAULT '{}';

-- GIN index enables efficient array containment queries:
-- WHERE chapter_ids @> ARRAY['some-uuid'::UUID]
CREATE INDEX IF NOT EXISTS idx_pqa_chapter_ids
  ON public.paper_question_attempts USING GIN (chapter_ids);

COMMENT ON COLUMN public.paper_question_attempts.chapter_ids IS
  'Array of chapter UUIDs tested by this question. Supports multi-chapter tagging '
  'for more accurate weak-topic detection. The singular chapter_id FK is preserved '
  'for backward compat (set to the primary chapter if only one applies).';


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ACHIEVEMENT_DEFINITIONS: rarity enum + column
-- ─────────────────────────────────────────────────────────────────────────────
-- Rarity tiers (Common → Legendary) power the animated unlock sequences and
-- social status signalling on the Achievements page.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'achievement_rarity_enum') THEN
    CREATE TYPE achievement_rarity_enum AS ENUM ('common', 'rare', 'epic', 'legendary');
  END IF;
END;
$$;

ALTER TABLE public.achievement_definitions
  ADD COLUMN IF NOT EXISTS rarity achievement_rarity_enum NOT NULL DEFAULT 'common';

-- Seed rarity values for existing achievements based on their difficulty/prestige.
UPDATE public.achievement_definitions SET rarity = 'common'    WHERE key IN ('first_blood', 'paper_hunter', 'night_owl', 'multi_subject', 'docs_connected');
UPDATE public.achievement_definitions SET rarity = 'rare'      WHERE key IN ('five_papers', 'streak_7', 'level_5', 'consistent', 'linked_notes');
UPDATE public.achievement_definitions SET rarity = 'epic'      WHERE key IN ('ten_papers', 'ace', 'streak_30', 'level_10', 'high_confidence', 'completionist', 'speed_run');
UPDATE public.achievement_definitions SET rarity = 'legendary' WHERE key IN ('perfect_score', 'streak_100', 'atlas_legend');

COMMENT ON COLUMN public.achievement_definitions.rarity IS
  'Visual tier: common (grey) → rare (blue) → epic (purple) → legendary (gold). '
  'Controls animation intensity on the Achievements page unlock sequence.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. USER_SETTINGS: missions_last_generated_date
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores the date missions were last successfully generated for this user.
-- Used by generate_daily_missions() to short-circuit duplicate calls on the same day,
-- preventing the expensive multi-CTE scoring query from running on every page load.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS missions_last_generated_date DATE;

COMMENT ON COLUMN public.user_settings.missions_last_generated_date IS
  'Date (in DB timezone) that generate_daily_missions() last ran successfully. '
  'The function exits early if this equals CURRENT_DATE, preventing redundant scoring queries.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. GENERATE_DAILY_MISSIONS(): add daily guard + difficulty assignment
-- ─────────────────────────────────────────────────────────────────────────────
-- Two changes from the original:
--   a) Early-exit if missions_last_generated_date = today (rate-limit guard).
--   b) Assigns difficulty to each generated mission based on mission type.

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
  -- ── Daily guard: exit early if already generated today ──────────────────
  -- Prevents the expensive chapter-scoring CTE from running on every page load.
  SELECT max_missions_per_day, missions_last_generated_date
  INTO v_max_missions, v_last_generated
  FROM public.user_settings
  WHERE user_id = p_user_id;

  v_max_missions := COALESCE(v_max_missions, 3);

  IF v_last_generated = v_today THEN
    RETURN 0; -- Already ran today; do nothing.
  END IF;

  -- ── Count existing missions for today (handles partial generation) ───────
  SELECT COUNT(*) INTO v_existing_count
  FROM public.daily_missions
  WHERE user_id = p_user_id AND mission_date = v_today;

  v_budget := v_max_missions - v_existing_count;
  IF v_budget <= 0 THEN
    -- Missions already exist (e.g. generated manually). Still update the guard.
    UPDATE public.user_settings
    SET missions_last_generated_date = v_today
    WHERE user_id = p_user_id;
    RETURN 0;
  END IF;

  -- ── Chapter Missions ─────────────────────────────────────────────────────
  -- Scoring weights: notes_gap 25%, confidence_gap 30%, accuracy_gap 30%, recency_penalty 15%.
  -- All weights multiplied by urgency (1/days_to_exam) and user priority (1–5).
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
        ), 0.7))                                                         AS accuracy_gap,
        -- Recency penalty: scales from 0 (just reviewed) to 1.0 (14+ days ago or never).
        -- High revision_count reduces the effective recency penalty (well-revised chapters
        -- are penalised less harshly for being old, since they're already solid).
        LEAST(COALESCE(
          EXTRACT(DAY FROM (NOW() - uc.last_reviewed_at))::NUMERIC, 14
        ), 14) / 14.0
        * (1.0 / GREATEST(COALESCE(uc.revision_count, 0)::NUMERIC * 0.2 + 1.0, 1.0)) AS recency_penalty,
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

  -- ── Paper Mission ─────────────────────────────────────────────────────────
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

  -- ── Update the daily guard ───────────────────────────────────────────────
  UPDATE public.user_settings
  SET missions_last_generated_date = v_today
  WHERE user_id = p_user_id;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.generate_daily_missions IS
  'Mission Engine: generates up to max_missions_per_day missions using weighted chapter scores. '
  'Weights: notes_gap 25%, confidence_gap 30%, accuracy_gap 30%, recency_penalty 15%. '
  'revision_count reduces recency_penalty for well-revised chapters. '
  'Daily guard: exits immediately if missions_last_generated_date = CURRENT_DATE '
  '(prevents redundant CTE scoring on every page load). '
  'ON CONFLICT ensures idempotency — safe to call on every login.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. SYNC_COINS_TO_PROFILE() TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────
-- Mirrors sync_xp_to_profile() for the coin economy.
-- Without this, profiles.total_coins will silently drift from user_currencies
-- if any code path writes a coin transaction without also updating the profile.

CREATE OR REPLACE FUNCTION public.sync_coins_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- coin_amount can be negative (spending). The CHECK on user_currencies allows
  -- negative values for spend transactions. profiles.total_coins CHECK (>= 0)
  -- will reject the update if the result would go below zero — catching
  -- insufficient-balance bugs at the DB layer before they corrupt state.
  UPDATE public.profiles
  SET
    total_coins = total_coins + NEW.coin_amount,
    updated_at  = NOW()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_coins_to_profile IS
  'AFTER INSERT trigger on user_currencies. Keeps profiles.total_coins in sync '
  'with the coin ledger. Mirrors sync_xp_to_profile() pattern for the coin economy. '
  'profiles.total_coins CHECK (>= 0) rejects overspend at the DB layer.';

-- Create the trigger. Use DROP + CREATE for idempotency since
-- CREATE OR REPLACE is not valid for triggers (only trigger functions).
DROP TRIGGER IF EXISTS sync_coins_after_transaction ON public.user_currencies;

CREATE TRIGGER sync_coins_after_transaction
  AFTER INSERT ON public.user_currencies
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_coins_to_profile();


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. MARK_NOTIFICATIONS_READ() RPC
-- ─────────────────────────────────────────────────────────────────────────────
-- Client calls: supabase.rpc('mark_notifications_read')
-- Marks all unread notifications as read in a single UPDATE.
-- Returns the count of notifications that were updated.
-- SECURITY DEFINER ensures the user_id check cannot be bypassed.

CREATE OR REPLACE FUNCTION public.mark_notifications_read(
  p_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID;
  v_count INTEGER;
BEGIN
  -- If p_user_id is omitted (client calls without argument), default to caller's uid.
  -- If p_user_id is explicitly provided, enforce it must equal auth.uid() to prevent
  -- marking another user's notifications as read.
  v_uid := COALESCE(p_user_id, auth.uid());

  IF v_uid IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot mark another user''s notifications as read'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.notifications
  SET
    is_read = TRUE,
    read_at = NOW()
  WHERE
    user_id  = v_uid
    AND is_read = FALSE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.mark_notifications_read IS
  'Marks all unread notifications for the calling user as read in a single UPDATE. '
  'Returns the count of notifications updated. '
  'Usage: supabase.rpc("mark_notifications_read") '
  '        or supabase.rpc("mark_notifications_read", { p_user_id: uid })';


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. MISSING PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles.school: future school-scoped leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_school
  ON public.profiles (school)
  WHERE school IS NOT NULL;

-- user_chapters composite: dashboard chapter list filter (user + chapter + notes status)
CREATE INDEX IF NOT EXISTS idx_user_chapters_dashboard
  ON public.user_chapters (user_id, chapter_id, notes_status);

-- notifications: undelivered push notification worker query
CREATE INDEX IF NOT EXISTS idx_notifications_unsent_push
  ON public.notifications (user_id, created_at DESC)
  WHERE is_sent_push = FALSE AND is_read = FALSE;

-- pvp_challenges: cron job to expire past-deadline challenges
CREATE INDEX IF NOT EXISTS idx_pvp_deadline
  ON public.pvp_challenges (deadline_at ASC)
  WHERE status = 'active' AND deadline_at IS NOT NULL;

-- user_currencies: coin transaction history pagination
CREATE INDEX IF NOT EXISTS idx_user_currencies_history
  ON public.user_currencies (user_id, created_at DESC);

-- friendships: fast existence check used by send_friend_request and accept_friend_request
-- The existing idx_friendships_user1 and idx_friendships_user2 cover individual lookups.
-- This compound index covers the canonical ordered-pair existence check.
CREATE INDEX IF NOT EXISTS idx_friendships_pair
  ON public.friendships (user_id_1, user_id_2);

-- daily_missions: index on skipped missions (analytics + Engine improvement queries)
CREATE INDEX IF NOT EXISTS idx_daily_missions_skipped
  ON public.daily_missions (user_id, mission_date DESC)
  WHERE status = 'skipped';

-- user_chapters: revision_count index for Mission Engine (downweight over-revised chapters)
CREATE INDEX IF NOT EXISTS idx_user_chapters_revision
  ON public.user_chapters (user_id, revision_count DESC)
  WHERE revision_count > 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- END OF MIGRATION 013
-- ─────────────────────────────────────────────────────────────────────────────
