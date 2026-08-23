-- ============================================================
-- MIGRATION 006: Performance Indexes
-- Strategy:
--   1. All FK columns get explicit B-tree indexes (Postgres does
--      NOT auto-index foreign keys — only PKs get auto-indexes).
--   2. Columns used in WHERE / ORDER BY get targeted indexes.
--   3. Partial indexes for the most common filtered queries
--      (e.g. pending missions, unread notifications).
--   4. GIN indexes for JSONB and full-text search columns.
--   5. GiST / trigram indexes for fuzzy subject/chapter search.
-- ============================================================

-- ── PROFILES ──────────────────────────────────────────────────────────────
CREATE INDEX idx_profiles_email         ON public.profiles (email);
CREATE INDEX idx_profiles_total_xp      ON public.profiles (total_xp DESC);       -- leaderboard
CREATE INDEX idx_profiles_current_level ON public.profiles (current_level DESC);

-- ── USER_SUBJECTS ──────────────────────────────────────────────────────────
CREATE INDEX idx_user_subjects_user_id    ON public.user_subjects (user_id);
CREATE INDEX idx_user_subjects_subject_id ON public.user_subjects (subject_id);
CREATE INDEX idx_user_subjects_exam_date  ON public.user_subjects (exam_date ASC)
  WHERE exam_date IS NOT NULL;                                                     -- mission engine urgency sort

-- ── CHAPTERS ──────────────────────────────────────────────────────────────
CREATE INDEX idx_chapters_subject_id         ON public.chapters (subject_id);
CREATE INDEX idx_chapters_subject_component  ON public.chapters (subject_id, component, number);
CREATE INDEX idx_chapters_search             ON public.chapters
  USING GIN (to_tsvector('english', title));                                       -- full-text search

-- ── USER_CHAPTERS ──────────────────────────────────────────────────────────
CREATE INDEX idx_user_chapters_user_id       ON public.user_chapters (user_id);
CREATE INDEX idx_user_chapters_chapter_id    ON public.user_chapters (chapter_id);
CREATE INDEX idx_user_chapters_last_reviewed ON public.user_chapters (user_id, last_reviewed_at ASC NULLS FIRST);
CREATE INDEX idx_user_chapters_google_doc_id ON public.user_chapters (google_doc_id)
  WHERE google_doc_id IS NOT NULL;

-- Partial: chapters with incomplete notes (primary mission engine query)
CREATE INDEX idx_user_chapters_incomplete ON public.user_chapters (user_id, notes_status)
  WHERE notes_status != 'complete';

-- ── PAST_PAPERS ───────────────────────────────────────────────────────────
CREATE INDEX idx_past_papers_user_id      ON public.past_papers (user_id);
CREATE INDEX idx_past_papers_subject_id   ON public.past_papers (subject_id);
CREATE INDEX idx_past_papers_user_subject ON public.past_papers (user_id, subject_id);  -- readiness query
CREATE INDEX idx_past_papers_accuracy     ON public.past_papers (user_id, accuracy_pct ASC);
CREATE INDEX idx_past_papers_created_at   ON public.past_papers (user_id, created_at DESC);

-- ── PAPER_QUESTION_ATTEMPTS ────────────────────────────────────────────────
CREATE INDEX idx_pqa_paper_id        ON public.paper_question_attempts (paper_id);
CREATE INDEX idx_pqa_chapter_id      ON public.paper_question_attempts (chapter_id)
  WHERE chapter_id IS NOT NULL;
CREATE INDEX idx_pqa_chapter_accuracy ON public.paper_question_attempts
  (chapter_id, marks_obtained, marks_available);

-- ── DAILY_MISSIONS ─────────────────────────────────────────────────────────
CREATE INDEX idx_daily_missions_user_id   ON public.daily_missions (user_id);
CREATE INDEX idx_daily_missions_user_date ON public.daily_missions (user_id, mission_date DESC);
CREATE INDEX idx_daily_missions_entity    ON public.daily_missions (user_id, target_entity_id, mission_date);

-- Partial: pending missions only (dashboard CTA — most frequent query)
CREATE INDEX idx_daily_missions_pending ON public.daily_missions (user_id, mission_date)
  WHERE status = 'pending';

-- ── XP_EVENTS ─────────────────────────────────────────────────────────────
CREATE INDEX idx_xp_events_user_id    ON public.xp_events (user_id);
CREATE INDEX idx_xp_events_created_at ON public.xp_events (user_id, created_at DESC);  -- history pagination
CREATE INDEX idx_xp_events_type       ON public.xp_events (user_id, event_type);
CREATE INDEX idx_xp_events_reference  ON public.xp_events (reference_id)
  WHERE reference_id IS NOT NULL;

-- Composite index for weekly XP leaderboard queries (filters by created_at at query time)
-- NOTE: Partial indexes cannot use volatile functions like NOW() in their WHERE clause.
CREATE INDEX idx_xp_events_weekly ON public.xp_events (user_id, created_at DESC, xp_amount);


-- ── STREAKS ───────────────────────────────────────────────────────────────
CREATE INDEX idx_streaks_current ON public.streaks (current_streak DESC);          -- leaderboard

-- ── USER_ACHIEVEMENTS ──────────────────────────────────────────────────────
CREATE INDEX idx_user_achievements_user_id ON public.user_achievements (user_id);

-- Partial: unnotified achievements (notification badge query)
CREATE INDEX idx_user_achievements_notified ON public.user_achievements (user_id, notified)
  WHERE notified = FALSE;

-- ── NOTIFICATIONS ──────────────────────────────────────────────────────────
CREATE INDEX idx_notifications_user_id ON public.notifications (user_id);

-- Partial: unread only (topbar unread count — most frequent query)
CREATE INDEX idx_notifications_unread ON public.notifications (user_id, created_at DESC)
  WHERE is_read = FALSE;

-- ── SUBJECTS (fuzzy search) ────────────────────────────────────────────────
CREATE INDEX idx_subjects_name_trgm ON public.subjects
  USING GIN (name gin_trgm_ops);                                                   -- trigram fuzzy search
CREATE INDEX idx_subjects_code      ON public.subjects (code)
  WHERE code IS NOT NULL;

-- ── FRIENDSHIPS ────────────────────────────────────────────────────────────
CREATE INDEX idx_friendships_user1 ON public.friendships (user_id_1);
CREATE INDEX idx_friendships_user2 ON public.friendships (user_id_2);

-- ── FRIEND_REQUESTS ────────────────────────────────────────────────────────
CREATE INDEX idx_friend_requests_to   ON public.friend_requests (to_user_id);
CREATE INDEX idx_friend_requests_from ON public.friend_requests (from_user_id);

-- ── PVP_CHALLENGES ─────────────────────────────────────────────────────────
CREATE INDEX idx_pvp_challenger ON public.pvp_challenges (challenger_id, status);
CREATE INDEX idx_pvp_opponent   ON public.pvp_challenges (opponent_id, status);
CREATE INDEX idx_pvp_active     ON public.pvp_challenges (status)
  WHERE status = 'active';

-- ── AI_COACH ────────────────────────────────────────────────────────────────
CREATE INDEX idx_ai_conversations_user ON public.ai_coach_conversations (user_id, created_at DESC);
CREATE INDEX idx_ai_messages_conv      ON public.ai_coach_messages (conversation_id, created_at ASC);

-- ── SHOP / INVENTORY ────────────────────────────────────────────────────────
CREATE INDEX idx_shop_items_available   ON public.shop_items (category, is_available);
CREATE INDEX idx_user_inventory_user    ON public.user_inventory (user_id);
CREATE INDEX idx_user_inventory_equipped ON public.user_inventory (user_id, is_equipped)
  WHERE is_equipped = TRUE;
