-- ============================================================
-- MIGRATION 005: Future Expansion Stub Tables
-- These tables are created now so foreign keys and indexes can
-- be established from day one, avoiding painful schema migrations
-- later. All are gated by status ENUMs or is_available flags so
-- the application can ignore them until each feature launches.
--
-- Tables:
--   friendships            → Mutual friend connections
--   friend_requests        → Pending friend requests
--   study_pets             → PvP pet per user (stub)
--   pvp_challenges         → Head-to-head study challenges
--   challenge_progress     → Per-participant challenge progress
--   ai_coach_conversations → AI study coach chat sessions
--   ai_coach_messages      → Individual messages in a session
--   user_currencies        → Coin balance ledger
--   shop_items             → Purchasable themes, pets, items
--   user_inventory         → Items owned by a user
-- ============================================================

-- ─── FRIENDSHIPS ──────────────────────────────────────────────────────────
-- Stores accepted mutual friendships.
-- ENFORCED: user_id_1 < user_id_2 (lexicographic) to prevent duplicates.
-- Query pattern: WHERE user_id_1 = $uid OR user_id_2 = $uid

CREATE TABLE public.friendships (
  id          UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_1   UUID                   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id_2   UUID                   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status      friendship_status_enum NOT NULL DEFAULT 'accepted',
  created_at  TIMESTAMPTZ            NOT NULL DEFAULT NOW(),

  CONSTRAINT friendships_no_self_friendship CHECK (user_id_1 != user_id_2),
  CONSTRAINT friendships_ordered            CHECK (user_id_1 < user_id_2),
  CONSTRAINT friendships_unique             UNIQUE (user_id_1, user_id_2)
);

COMMENT ON TABLE public.friendships IS
  'Mutual friend relationships. user_id_1 < user_id_2 prevents duplicate rows. '
  'Query: WHERE user_id_1 = $uid OR user_id_2 = $uid to find all friends.';


-- ─── FRIEND_REQUESTS ──────────────────────────────────────────────────────
-- Pending requests before friendship is established.
-- Accept → INSERT into friendships + DELETE this row.
-- Decline → DELETE this row.

CREATE TABLE public.friend_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT friend_requests_no_self CHECK (from_user_id != to_user_id),
  CONSTRAINT friend_requests_unique  UNIQUE (from_user_id, to_user_id)
);


-- ─── STUDY_PETS ───────────────────────────────────────────────────────────
-- One pet per user. Pet grows based on study consistency.
-- health_points decay daily without study (future cron job).
-- species unlocked via shop (future).

CREATE TABLE public.study_pets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL DEFAULT 'Atlas',
  species         TEXT        NOT NULL DEFAULT 'default',
  level           SMALLINT    NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
  health_points   SMALLINT    NOT NULL DEFAULT 100 CHECK (health_points BETWEEN 0 AND 100),
  happiness       SMALLINT    NOT NULL DEFAULT 100 CHECK (happiness BETWEEN 0 AND 100),
  total_xp        INTEGER     NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  last_fed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT study_pets_user_unique UNIQUE (user_id)
);

COMMENT ON TABLE public.study_pets IS
  'PvP pet feature stub. One pet per user. health_points decay without study (future cron). '
  'Completing missions "feeds" the pet (last_fed_at update).';


-- ─── PVP_CHALLENGES ───────────────────────────────────────────────────────
-- Head-to-head study challenges between two users.
-- winner_user_id set by server when challenge resolves.

CREATE TABLE public.pvp_challenges (
  id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id   UUID                  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opponent_id     UUID                  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          challenge_status_enum NOT NULL DEFAULT 'pending',
  subject_id      UUID                  REFERENCES public.subjects(id) ON DELETE SET NULL,
  goal_type       TEXT                  NOT NULL DEFAULT 'complete_chapters',
  goal_target     SMALLINT              NOT NULL DEFAULT 1 CHECK (goal_target > 0),
  xp_stake        SMALLINT              NOT NULL DEFAULT 100 CHECK (xp_stake >= 0),
  coin_stake      INTEGER               NOT NULL DEFAULT 0 CHECK (coin_stake >= 0),
  deadline_at     TIMESTAMPTZ,
  winner_user_id  UUID                  REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,

  CONSTRAINT pvp_challenges_no_self CHECK (challenger_id != opponent_id)
);

COMMENT ON TABLE public.pvp_challenges IS
  'PvP challenge stub. xp_stake is transferred from loser to winner on resolution. '
  'coin_stake for future coin economy.';


-- ─── CHALLENGE_PROGRESS ───────────────────────────────────────────────────
CREATE TABLE public.challenge_progress (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id    UUID        NOT NULL REFERENCES public.pvp_challenges(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  progress_value  SMALLINT    NOT NULL DEFAULT 0 CHECK (progress_value >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT challenge_progress_unique UNIQUE (challenge_id, user_id)
);


-- ─── AI_COACH_CONVERSATIONS ───────────────────────────────────────────────
-- AI Study Coach (Gemini API) chat sessions.
-- context_data stores readiness/weak-topic snapshots for the system prompt.

CREATE TABLE public.ai_coach_conversations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title          TEXT,
  subject_id     UUID        REFERENCES public.subjects(id) ON DELETE SET NULL,
  chapter_id     UUID        REFERENCES public.chapters(id) ON DELETE SET NULL,
  context_data   JSONB       NOT NULL DEFAULT '{}',
  message_count  INTEGER     NOT NULL DEFAULT 0,
  is_archived    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_coach_conversations IS
  'AI Study Coach (Gemini) chat sessions. context_data stores readiness/weak-topic '
  'snapshots for the system prompt.';


-- ─── AI_COACH_MESSAGES ────────────────────────────────────────────────────
CREATE TABLE public.ai_coach_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        NOT NULL REFERENCES public.ai_coach_conversations(id) ON DELETE CASCADE,
  role             TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content          TEXT        NOT NULL,
  token_count      INTEGER,
  model_version    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── USER_CURRENCIES ──────────────────────────────────────────────────────
-- Coin balance ledger (append-only transactions).
-- profiles.total_coins is the denormalised sum.

CREATE TABLE public.user_currencies (
  id                UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID                       NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transaction_type  coin_transaction_type_enum NOT NULL,
  coin_amount       INTEGER                    NOT NULL,
  reference_id      UUID,
  metadata          JSONB                      NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ                NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_currencies IS 'Coin economy ledger. Append-only. profiles.total_coins is denormalised sum.';


-- ─── SHOP_ITEMS ───────────────────────────────────────────────────────────
-- Purchasable items: themes, pet species, streak shields, etc.
-- is_available = false hides items until the shop feature launches.

CREATE TABLE public.shop_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT        NOT NULL UNIQUE,
  name         TEXT        NOT NULL,
  description  TEXT,
  category     TEXT        NOT NULL DEFAULT 'theme',
  coin_price   INTEGER     NOT NULL DEFAULT 0 CHECK (coin_price >= 0),
  xp_price     INTEGER     NOT NULL DEFAULT 0 CHECK (xp_price >= 0),
  is_available BOOLEAN     NOT NULL DEFAULT FALSE,
  preview_url  TEXT,
  sort_order   SMALLINT    NOT NULL DEFAULT 99,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.shop_items IS 'Shop catalog. is_available = false hides items until feature launches.';


-- ─── USER_INVENTORY ───────────────────────────────────────────────────────
-- Items owned by a user. is_equipped controls active theme/pet.

CREATE TABLE public.user_inventory (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id      UUID        NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  is_equipped  BOOLEAN     NOT NULL DEFAULT FALSE,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_inventory_unique UNIQUE (user_id, item_id)
);
