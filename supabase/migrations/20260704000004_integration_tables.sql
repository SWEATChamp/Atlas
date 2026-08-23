-- ============================================================
-- MIGRATION 004: Integration & Utility Tables
-- google_docs_tokens, notifications, user_settings
-- ============================================================

-- ─── GOOGLE_DOCS_TOKENS ───────────────────────────────────────────────────
-- Stores Google OAuth2 tokens encrypted with pgcrypto.
-- IMPORTANT: RLS is enabled with ZERO client-facing policies on this table.
-- That means NO client can ever read this data directly.
-- Only SECURITY DEFINER server functions can access tokens.

CREATE TABLE public.google_docs_tokens (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_token_enc   TEXT        NOT NULL,  -- pgp_sym_encrypt(token, key) on write
  refresh_token_enc  TEXT        NOT NULL,  -- pgp_sym_decrypt(token, key) on read
  expires_at         TIMESTAMPTZ NOT NULL,
  scopes             TEXT[]      NOT NULL DEFAULT '{}',
  google_user_id     TEXT,
  google_email       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT google_docs_tokens_user_unique UNIQUE (user_id)
);

COMMENT ON TABLE public.google_docs_tokens IS
  'Google OAuth2 tokens encrypted with pgcrypto. '
  'RLS blocks ALL client access — tokens only readable by SECURITY DEFINER server functions. '
  'Production: consider migrating to Supabase Vault for key management.';


-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────
-- Server-generated notification queue consumed by the client.
-- data JSONB carries action payloads for the client to act on.

CREATE TABLE public.notifications (
  id             UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID                   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type           notification_type_enum NOT NULL,
  title          TEXT                   NOT NULL,
  body           TEXT,
  data           JSONB                  NOT NULL DEFAULT '{}',
  is_read        BOOLEAN                NOT NULL DEFAULT FALSE,
  is_sent_push   BOOLEAN                NOT NULL DEFAULT FALSE,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ            NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notifications IS
  'In-app notification queue. is_sent_push tracks push notification delivery (future). '
  'data JSONB carries action payloads e.g. {achievement_key: "streak_7"}.';


-- ─── USER_SETTINGS ────────────────────────────────────────────────────────
-- Per-user preferences. Separate from profiles to keep profiles lean.
-- One row per user, created automatically by handle_new_user() trigger.

CREATE TABLE public.user_settings (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notif_mission_reminder   BOOLEAN     NOT NULL DEFAULT TRUE,
  notif_streak_warning     BOOLEAN     NOT NULL DEFAULT TRUE,
  notif_achievement        BOOLEAN     NOT NULL DEFAULT TRUE,
  notif_friend_request     BOOLEAN     NOT NULL DEFAULT TRUE,
  notif_challenge          BOOLEAN     NOT NULL DEFAULT TRUE,
  reminder_time            TIME,
  sidebar_collapsed        BOOLEAN     NOT NULL DEFAULT FALSE,
  theme                    TEXT        NOT NULL DEFAULT 'dark',
  max_missions_per_day     SMALLINT    NOT NULL DEFAULT 3 CHECK (max_missions_per_day BETWEEN 1 AND 5),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_settings_user_unique UNIQUE (user_id)
);

COMMENT ON TABLE public.user_settings IS
  'Per-user preferences. theme is a stub for the future themes shop feature. '
  'max_missions_per_day lets power users get up to 5 missions.';
