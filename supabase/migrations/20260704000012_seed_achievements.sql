-- ============================================================
-- MIGRATION 012: Seed Data — Achievement Definitions
-- 20 achievements spanning: progression, streaks, performance,
-- gamification, levelling, and secret legendary tiers.
-- Stored in DB (not just code) so achievements can be
-- added or modified without a code deploy.
-- ============================================================

INSERT INTO public.achievement_definitions
  (key, name, description, icon, color_hex, xp_reward, is_active, is_secret, sort_order)
VALUES

  -- ── PROGRESSION ────────────────────────────────────────────────────────
  ('first_blood',
   'First Blood',
   'Complete your first chapter notes',
   'Flame', '#FF4D6A', 100, TRUE, FALSE, 10),

  ('paper_hunter',
   'Paper Hunter',
   'Log your first past paper attempt',
   'FileSearch', '#38D9F5', 100, TRUE, FALSE, 20),

  ('five_papers',
   'Veteran',
   'Log 5 past paper attempts',
   'FileStack', '#38D9F5', 150, TRUE, FALSE, 30),

  ('ten_papers',
   'Paper Master',
   'Log 10 past paper attempts',
   'Trophy', '#FFD166', 250, TRUE, FALSE, 40),

  ('docs_connected',
   'Digitised',
   'Connect your Google Docs account',
   'Link', '#5B7FFF', 75, TRUE, FALSE, 50),

  ('linked_notes',
   'Organised',
   'Link a Google Doc to 5 or more chapters',
   'FolderOpen', '#5B7FFF', 150, TRUE, FALSE, 60),

  ('multi_subject',
   'Polymath',
   'Enrol in 3 or more subjects',
   'BookOpenCheck', '#9D6EF8', 100, TRUE, FALSE, 70),

  ('completionist',
   'Completionist',
   'Complete notes for every chapter in a subject',
   'CheckCircle2', '#12E88A', 500, TRUE, FALSE, 80),

  ('high_confidence',
   'Confident',
   'Reach an average confidence rating of 4/5 across all chapters',
   'Star', '#FFD166', 300, TRUE, FALSE, 90),

  -- ── PERFORMANCE ───────────────────────────────────────────────────────
  ('ace',
   'Ace',
   'Score 90% or above on a past paper',
   'Award', '#FFD166', 200, TRUE, FALSE, 100),

  ('perfect_score',
   'Perfect',
   'Score 100% on a past paper',
   'Sparkles', '#FFFFFF', 500, TRUE, FALSE, 110),

  -- ── STREAKS ────────────────────────────────────────────────────────────
  ('streak_7',
   'On a Roll',
   'Study for 7 consecutive days',
   'Zap', '#FF7B35', 150, TRUE, FALSE, 120),

  ('streak_30',
   'Unstoppable',
   'Maintain a 30-day study streak',
   'Flame', '#FF4D6A', 500, TRUE, FALSE, 130),

  ('streak_100',
   'Century',
   'Reach a 100-day study streak',
   'Medal', '#FFD166', 2000, TRUE, TRUE, 140),

  -- ── GAMIFICATION ──────────────────────────────────────────────────────
  ('speed_run',
   'Speed Run',
   'Complete 3 missions in a single day',
   'Timer', '#5B7FFF', 200, TRUE, FALSE, 150),

  ('consistent',
   'Consistent',
   'Complete missions on 14 different days',
   'CalendarCheck', '#12E88A', 300, TRUE, FALSE, 160),

  ('night_owl',
   'Night Owl',
   'Study between midnight and 4 AM',
   'Moon', '#9D6EF8', 100, TRUE, TRUE, 170),

  -- ── LEVELLING ─────────────────────────────────────────────────────────
  ('level_5',
   'Tactician',
   'Reach Level 5',
   'ChevronUp', '#9D6EF8', 200, TRUE, FALSE, 180),

  ('level_10',
   'Atlas',
   'Reach Level 10',
   'Globe', '#FFD166', 1000, TRUE, FALSE, 190),

  ('atlas_legend',
   'Atlas Legend',
   'Reach the maximum level — you are a legend',
   'Crown', '#FFFFFF', 5000, TRUE, TRUE, 200)

ON CONFLICT (key) DO NOTHING;
