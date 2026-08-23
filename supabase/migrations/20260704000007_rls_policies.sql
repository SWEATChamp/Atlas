-- ============================================================
-- MIGRATION 007: Row Level Security Policies
-- Philosophy: Zero-trust. Every table locked to its owner.
-- Global catalog tables (subjects, chapters, achievement_definitions,
-- shop_items) are readable by all authenticated users.
--
-- Pattern used per user-owned table:
--   SELECT  → auth.uid() = user_id
--   INSERT  → auth.uid() = user_id (enforce ownership on write)
--   UPDATE  → auth.uid() = user_id
--   DELETE  → auth.uid() = user_id
--
-- google_docs_tokens: RLS ON + ZERO policies = completely dark to clients.
-- ============================================================

-- Enable RLS on every table
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subjects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_chapters           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.past_papers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_question_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_missions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_docs_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_pets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvp_challenges          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_progress      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_coach_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_coach_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_currencies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory          ENABLE ROW LEVEL SECURITY;


-- ─── PROFILES ─────────────────────────────────────────────────────────────
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
-- INSERT handled by handle_new_user() trigger (SECURITY DEFINER)


-- ─── SUBJECTS — global catalog, readable by all authenticated users ────────
CREATE POLICY "subjects_select_all"
  ON public.subjects FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "subjects_insert_custom"
  ON public.subjects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by AND is_global = FALSE);

CREATE POLICY "subjects_update_own_custom"
  ON public.subjects FOR UPDATE
  USING (auth.uid() = created_by AND is_global = FALSE);

CREATE POLICY "subjects_delete_own_custom"
  ON public.subjects FOR DELETE
  USING (auth.uid() = created_by AND is_global = FALSE);


-- ─── USER_SUBJECTS ─────────────────────────────────────────────────────────
CREATE POLICY "user_subjects_select_own"
  ON public.user_subjects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_subjects_insert_own"
  ON public.user_subjects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_subjects_update_own"
  ON public.user_subjects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_subjects_delete_own"
  ON public.user_subjects FOR DELETE
  USING (auth.uid() = user_id);


-- ─── CHAPTERS — global catalog, readable by all authenticated users ────────
CREATE POLICY "chapters_select_all"
  ON public.chapters FOR SELECT
  TO authenticated
  USING (TRUE);


-- ─── USER_CHAPTERS ─────────────────────────────────────────────────────────
CREATE POLICY "user_chapters_select_own"
  ON public.user_chapters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_chapters_insert_own"
  ON public.user_chapters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_chapters_update_own"
  ON public.user_chapters FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_chapters_delete_own"
  ON public.user_chapters FOR DELETE
  USING (auth.uid() = user_id);


-- ─── PAST_PAPERS ─────────────────────────────────────────────────────────
CREATE POLICY "past_papers_select_own"
  ON public.past_papers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "past_papers_insert_own"
  ON public.past_papers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "past_papers_update_own"
  ON public.past_papers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "past_papers_delete_own"
  ON public.past_papers FOR DELETE
  USING (auth.uid() = user_id);


-- ─── PAPER_QUESTION_ATTEMPTS — scoped via paper_id join ───────────────────
CREATE POLICY "pqa_select_own"
  ON public.paper_question_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.past_papers pp
      WHERE pp.id = paper_question_attempts.paper_id
        AND pp.user_id = auth.uid()
    )
  );

CREATE POLICY "pqa_insert_own"
  ON public.paper_question_attempts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.past_papers pp
      WHERE pp.id = paper_question_attempts.paper_id
        AND pp.user_id = auth.uid()
    )
  );

CREATE POLICY "pqa_update_own"
  ON public.paper_question_attempts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.past_papers pp
      WHERE pp.id = paper_question_attempts.paper_id
        AND pp.user_id = auth.uid()
    )
  );

CREATE POLICY "pqa_delete_own"
  ON public.paper_question_attempts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.past_papers pp
      WHERE pp.id = paper_question_attempts.paper_id
        AND pp.user_id = auth.uid()
    )
  );


-- ─── ACHIEVEMENT_DEFINITIONS — global catalog ─────────────────────────────
CREATE POLICY "achievement_definitions_select_active"
  ON public.achievement_definitions FOR SELECT
  TO authenticated
  USING (is_active = TRUE);


-- ─── DAILY_MISSIONS ─────────────────────────────────────────────────────────
CREATE POLICY "daily_missions_select_own"
  ON public.daily_missions FOR SELECT
  USING (auth.uid() = user_id);

-- Clients can update status (complete/skip) but cannot alter xp_reward
CREATE POLICY "daily_missions_update_status"
  ON public.daily_missions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- INSERT by generate_daily_missions() (SECURITY DEFINER only)


-- ─── XP_EVENTS — read-only for clients ──────────────────────────────────────
-- All writes via award_xp() SECURITY DEFINER function
CREATE POLICY "xp_events_select_own"
  ON public.xp_events FOR SELECT
  USING (auth.uid() = user_id);


-- ─── STREAKS — read-only for clients ────────────────────────────────────────
-- All writes via update_streak() SECURITY DEFINER function
CREATE POLICY "streaks_select_own"
  ON public.streaks FOR SELECT
  USING (auth.uid() = user_id);


-- ─── USER_ACHIEVEMENTS ──────────────────────────────────────────────────────
CREATE POLICY "user_achievements_select_own"
  ON public.user_achievements FOR SELECT
  USING (auth.uid() = user_id);

-- Allow client to mark achievement notification as seen
CREATE POLICY "user_achievements_update_notified"
  ON public.user_achievements FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- INSERT by check_and_unlock_achievements() (SECURITY DEFINER only)


-- ─── GOOGLE_DOCS_TOKENS — ZERO CLIENT ACCESS ──────────────────────────────
-- RLS is enabled above with NO policies defined.
-- Result: every client query returns 0 rows / is rejected.
-- Only the service_role key (server-side) or SECURITY DEFINER functions
-- can access this table.


-- ─── NOTIFICATIONS ──────────────────────────────────────────────────────────
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_read"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─── USER_SETTINGS ──────────────────────────────────────────────────────────
CREATE POLICY "user_settings_select_own"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_settings_insert_own"
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_settings_update_own"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─── FRIENDSHIPS ────────────────────────────────────────────────────────────
CREATE POLICY "friendships_select_participant"
  ON public.friendships FOR SELECT
  USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);


-- ─── FRIEND_REQUESTS ────────────────────────────────────────────────────────
CREATE POLICY "friend_requests_select_participant"
  ON public.friend_requests FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "friend_requests_insert_own"
  ON public.friend_requests FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "friend_requests_delete_participant"
  ON public.friend_requests FOR DELETE
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);


-- ─── STUDY_PETS ─────────────────────────────────────────────────────────────
CREATE POLICY "study_pets_select_own"
  ON public.study_pets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "study_pets_update_own"
  ON public.study_pets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Friends can view each other's pets
CREATE POLICY "study_pets_select_friends"
  ON public.study_pets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE
        (f.user_id_1 = auth.uid() AND f.user_id_2 = study_pets.user_id) OR
        (f.user_id_2 = auth.uid() AND f.user_id_1 = study_pets.user_id)
    )
  );


-- ─── PVP_CHALLENGES ─────────────────────────────────────────────────────────
CREATE POLICY "pvp_challenges_select_participant"
  ON public.pvp_challenges FOR SELECT
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

CREATE POLICY "pvp_challenges_insert_own"
  ON public.pvp_challenges FOR INSERT
  WITH CHECK (auth.uid() = challenger_id);


-- ─── CHALLENGE_PROGRESS ─────────────────────────────────────────────────────
CREATE POLICY "challenge_progress_select_participant"
  ON public.challenge_progress FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pvp_challenges c
      WHERE c.id = challenge_progress.challenge_id
        AND (c.challenger_id = auth.uid() OR c.opponent_id = auth.uid())
    )
  );


-- ─── AI_COACH ────────────────────────────────────────────────────────────────
CREATE POLICY "ai_conversations_all_own"
  ON public.ai_coach_conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ai_messages_all_own"
  ON public.ai_coach_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_coach_conversations c
      WHERE c.id = ai_coach_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );


-- ─── USER_CURRENCIES — read-only for clients ─────────────────────────────────
CREATE POLICY "user_currencies_select_own"
  ON public.user_currencies FOR SELECT
  USING (auth.uid() = user_id);


-- ─── SHOP_ITEMS — available items visible to all authenticated users ──────────
CREATE POLICY "shop_items_select_available"
  ON public.shop_items FOR SELECT
  TO authenticated
  USING (is_available = TRUE);


-- ─── USER_INVENTORY ─────────────────────────────────────────────────────────
CREATE POLICY "user_inventory_select_own"
  ON public.user_inventory FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_inventory_update_equipped"
  ON public.user_inventory FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
