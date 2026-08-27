# Atlas Database Architecture Audit
> [!NOTE]
> **Historical Audit Document (Archived)**: This document records a snapshot audit conducted on 2026-07-05. For current database architecture and migrations, see `docs/database.md` and `supabase/migrations/`.

> A full gap analysis comparing the existing schema against the complete product vision in `ideas.md`.
> Generated: 2026-07-05

---

## Summary Verdict

The existing schema is **exceptionally well-designed** for its scope. The core MVP tables, RLS, functions, and triggers are production-ready. However, a systematic review reveals **19 concrete gaps** across tables, columns, indexes, RLS policies, RPCs, and triggers. These fall into four tiers:

| Tier | Label | Description |
|------|-------|-------------|
| 🔴 | **Blocker** | Must be resolved before frontend development begins |
| 🟡 | **Near-term** | Required for Phase 2–5 features (social, leaderboards) |
| 🟢 | **Future** | Needed when backlog features launch |
| ⚪ | **Good as-is** | Already well-covered, no action needed |

---

## Gap Analysis

---

### GAP 1 — `profiles` is missing a `username` column
**Severity:** 🔴 Blocker  
**Why needed:** Friend requests, leaderboards, user search, and social features all require a unique, human-readable handle (e.g. `@sweatchamp`). Email is private and cannot be shown in leaderboards. There is currently no way to look up or display another user.  
**Belongs in:** MVP — needed before any social or leaderboard feature.  
**Action:** Modify `profiles`, not a new table.

```sql
-- Migration 013
ALTER TABLE public.profiles
  ADD COLUMN username TEXT UNIQUE,
  ADD COLUMN username_lower TEXT GENERATED ALWAYS AS (LOWER(username)) STORED;

CREATE UNIQUE INDEX idx_profiles_username_lower ON public.profiles (username_lower);
CREATE INDEX idx_profiles_username_trgm ON public.profiles USING GIN (username gin_trgm_ops);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format
    CHECK (username IS NULL OR username ~* '^[a-zA-Z0-9_]{3,30}$');
```

---

### GAP 2 — `get_leaderboard` exposes ALL user profiles globally  
**Severity:** 🔴 Blocker  
**Why needed:** The existing `get_leaderboard()` RPC returns every single user ranked by XP globally, with no scoping to friends or school. This is a privacy and performance problem. For MVP, the leaderboard should be friend-scoped only; global leaderboard is a future feature.  
**Belongs in:** MVP — must be scoped before launch.  
**Action:** Modify the existing `get_leaderboard` function, not a new table.

```sql
-- Migration 013 (add to functions)
-- Add p_user_id param to scope by friends
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_user_id UUID,
  p_scope   TEXT    DEFAULT 'friends',  -- 'friends' | 'all_time' | 'weekly'
  p_limit   INTEGER DEFAULT 50
) ...
-- 'friends' scope: only return profiles where a friendship exists with p_user_id
```

---

### GAP 3 — No `accept_friend_request` RPC
**Severity:** 🔴 Blocker (for social features)  
**Why needed:** The `friend_requests` table exists and RLS allows INSERT (send) and DELETE (decline). But accepting a friend request requires an **atomic two-step** operation: INSERT into `friendships` (enforcing user_id_1 < user_id_2 ordering) AND DELETE from `friend_requests`. There is no RPC that does this atomically. A client doing two separate calls risks race conditions and partial failure.  
**Belongs in:** Near-term (Phase 7 social launch).  
**Action:** New SECURITY DEFINER function — no new table needed.

```sql
-- Migration 014
CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id UUID)
RETURNS VOID SECURITY DEFINER ...
-- Atomically: validate ownership, insert into friendships (with ordered UUIDs), delete request
-- Also: INSERT notification for the original sender
```

---

### GAP 4 — No `send_friend_request` RPC  
**Severity:** 🟡 Near-term  
**Why needed:** Direct client INSERT to `friend_requests` is possible via RLS, but a server-side function is needed to: (a) validate the target user exists, (b) prevent duplicate requests, (c) check that they are not already friends, (d) automatically create a notification for the recipient.  
**Belongs in:** Near-term.  
**Action:** New SECURITY DEFINER function.

```sql
-- Migration 014
CREATE OR REPLACE FUNCTION public.send_friend_request(p_to_username TEXT)
RETURNS JSONB SECURITY DEFINER ...
-- Resolves username → user_id, validates not already friends/requested, inserts, notifies
```

---

### GAP 5 — `friendships` has no `blocked` functionality  
**Severity:** 🟡 Near-term  
**Why needed:** `friendship_status_enum` includes `'blocked'` but the `friendships` table only stores `'accepted'` rows (status defaults to `'accepted'`). There is no `blocked_users` table and no policy preventing a blocked user from sending new requests. The enum value exists with no implementation behind it.  
**Belongs in:** Near-term, before social features launch.  
**Action:** Add a separate `blocked_users` table. The `friendships.status` field is misleading — a blocked relationship is not a friendship. A dedicated table is cleaner and its RLS policies are simpler.

```sql
-- Migration 015
CREATE TABLE public.blocked_users (
  blocker_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blocked_users_pk      PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocked_users_no_self CHECK (blocker_id != blocked_id)
);
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
-- RLS: blocker can SELECT/INSERT/DELETE their own rows
-- friend_requests INSERT policy must also check no block exists
```

---

### GAP 6 — `profiles` visibility for social features  
**Severity:** 🔴 Blocker  
**Why needed:** The current RLS on `profiles` is `auth.uid() = id` — you can only read your own profile. But leaderboards, friend search, and viewing a friend's stats all require reading **other users' profiles**. Without a policy change, these features are architecturally impossible.  
**Belongs in:** MVP — must be added before any social feature.  
**Action:** Add a second SELECT policy to `profiles` that allows reading limited fields of other authenticated users. Do NOT expose private fields (email, timezone, school) to non-owners.

```sql
-- Migration 013
-- Option A: Add a public read policy (simplest)
CREATE POLICY "profiles_select_public"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (TRUE);
-- WARNING: This exposes all columns. Use a VIEW instead for safety:

-- Option B (recommended): Create a public-safe view
CREATE VIEW public.profiles_public AS
  SELECT id, username, full_name, avatar_url, current_level, total_xp, created_at
  FROM public.profiles;
-- Grant SELECT on this view to authenticated role only.
-- Client uses this view for leaderboards/friend search; own profile uses full table.
```

---

### GAP 7 — `study_sessions` table is missing entirely  
**Severity:** 🟡 Near-term  
**Why needed:** The ideas.md specifies **Time Spent Tracking** and the **Pomodoro Timer**, both of which require logging timed study sessions. There is currently no table to store when a student started/stopped studying, which subject, or how long they studied. This data is also needed for the **Activity Feed** and **Study Heatmap** features. The `last_reviewed_at` on `user_chapters` is a poor substitute — it's a single timestamp, not a duration.  
**Belongs in:** Near-term (Phase 5).  
**Action:** New table.

```sql
-- Migration 016
CREATE TABLE public.study_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chapter_id   UUID        REFERENCES public.chapters(id) ON DELETE SET NULL,
  subject_id   UUID        REFERENCES public.subjects(id) ON DELETE SET NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  duration_mins SMALLINT   GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (ended_at - started_at))::SMALLINT / 60
    ELSE NULL END
  ) STORED,
  session_type TEXT        NOT NULL DEFAULT 'freeform'
                           CHECK (session_type IN ('freeform', 'pomodoro', 'mission')),
  xp_awarded   SMALLINT    NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT study_sessions_end_after_start CHECK (ended_at IS NULL OR ended_at > started_at)
);
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
-- RLS: standard owner policies
-- Indexes: (user_id, started_at DESC), (user_id, subject_id), (user_id, chapter_id)
```

---

### GAP 8 — `daily_missions` has no concept of `difficulty` or `skip_reason`
**Severity:** 🟡 Near-term  
**Why needed:** Students skip missions. Knowing *why* they skipped (too hard, wrong subject, lack of time) is valuable feedback for the Mission Engine to improve future generation. Additionally, there is no difficulty rating on missions, making it hard to balance the mission mix. Currently `'skipped'` status exists but carries no payload.  
**Belongs in:** MVP — schema cost is minimal, future analytics value is high.  
**Action:** Modify existing `daily_missions` table.

```sql
-- Migration 013
ALTER TABLE public.daily_missions
  ADD COLUMN difficulty    TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
  ADD COLUMN skip_reason   TEXT,
  ADD COLUMN skipped_at    TIMESTAMPTZ,
  ADD CONSTRAINT daily_missions_skip_check
    CHECK ((status = 'skipped' AND skipped_at IS NOT NULL) OR status != 'skipped');
```

---

### GAP 9 — `user_chapters` is missing `revision_count` and `first_completed_at`
**Severity:** 🟡 Near-term  
**Why needed:** The Mission Engine calculates a `recency_penalty` based on `last_reviewed_at`, but has no way to know *how many times* a chapter has been reviewed. A chapter reviewed 10 times last week is very different from one reviewed once. `revision_count` enables the Mission Engine to downweight chapters that have already been deeply revised. `first_completed_at` is needed for the **Study Heatmap** and **Burn Down Chart**.  
**Belongs in:** MVP — cheap column additions, high analytics value.  
**Action:** Modify existing `user_chapters` table.

```sql
-- Migration 013
ALTER TABLE public.user_chapters
  ADD COLUMN revision_count      SMALLINT    NOT NULL DEFAULT 0 CHECK (revision_count >= 0),
  ADD COLUMN first_completed_at  TIMESTAMPTZ;
```
Then update `handle_notes_status_change` trigger to increment `revision_count` and set `first_completed_at`.

---

### GAP 10 — No `coin_balance` function; `total_coins` on profiles can drift  
**Severity:** 🟡 Near-term  
**Why needed:** `user_currencies` is an append-only ledger (correct pattern), but `profiles.total_coins` is a manually managed cache. Unlike `total_xp`, which has a trigger (`sync_xp_to_profile`) that keeps it perfectly in sync, there is **no equivalent trigger for coins**. This means `profiles.total_coins` will drift out of sync with `user_currencies` if any code path updates coins without also updating the profile. This is a latent data integrity bug.  
**Belongs in:** MVP — should be fixed before coins feature launches.  
**Action:** New trigger function mirroring `sync_xp_to_profile`, plus a new RPC for spending coins.

```sql
-- Migration 013
CREATE OR REPLACE FUNCTION public.sync_coins_to_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET total_coins = total_coins + NEW.coin_amount, updated_at = NOW()
  WHERE id = NEW.user_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER sync_coins_after_transaction
  AFTER INSERT ON public.user_currencies
  FOR EACH ROW EXECUTE FUNCTION public.sync_coins_to_profile();
```

---

### GAP 11 — `shop_items` has no `real_money_price` column
**Severity:** 🟢 Future  
**Why needed:** The `ideas.md` describes a **Cosmetic Shop** that sells items for both Coins (virtual) and real money. The current schema only has `coin_price` and `xp_price`. There is no column for a Stripe price ID or monetary value, making it impossible to integrate a payment processor later without a schema change.  
**Belongs in:** Future migration (before monetisation launches).  
**Action:** Modify existing `shop_items` table.

```sql
-- Future Migration
ALTER TABLE public.shop_items
  ADD COLUMN stripe_price_id TEXT,           -- Stripe Price object ID for real-money purchases
  ADD COLUMN real_money_price_cents INTEGER  -- Store in cents/pence to avoid float precision
    CHECK (real_money_price_cents IS NULL OR real_money_price_cents >= 0);
```

---

### GAP 12 — `pvp_challenges` is missing a `require_friendship` constraint  
**Severity:** 🟡 Near-term  
**Why needed:** Currently any user can challenge any other user to a PvP battle. There is no check that the two users are friends. This opens up a harassment vector (spamming challenges from unknown users). It also means the challenge inbox would fill with requests from strangers.  
**Belongs in:** Near-term, before PvP launches.  
**Action:** The constraint belongs in the `create_pvp_challenge` RPC function (which does not yet exist), not as a DB constraint (since friendships are in a separate table, a FK constraint isn't possible).

```sql
-- Migration 017 (PvP launch)
CREATE OR REPLACE FUNCTION public.create_pvp_challenge(...)
RETURNS UUID SECURITY DEFINER ...
-- Validates: friendship exists, no active challenge already exists between the two, goal_target > 0
```

---

### GAP 13 — No `mark_notification_read` or bulk-read RPC  
**Severity:** 🔴 Blocker  
**Why needed:** The notification bell on the dashboard will query unread notifications. Users need to be able to mark all as read in one click. The current RLS allows UPDATE on notifications (`notifications_update_read`), but a client UPDATE WHERE user_id = $uid is still multiple round trips and bypasses no business logic. A single RPC is cleaner and more efficient.  
**Belongs in:** MVP.  
**Action:** New SECURITY DEFINER function.

```sql
-- Migration 013
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_user_id UUID)
RETURNS INTEGER SECURITY DEFINER SET search_path = public ...
-- UPDATE notifications SET is_read = TRUE, read_at = NOW()
-- WHERE user_id = p_user_id AND is_read = FALSE
-- Returns count of notifications marked read
```

---

### GAP 14 — `streaks` is missing a `freeze_used_dates` column  
**Severity:** 🟢 Future  
**Why needed:** The `freeze_count` column stubs out "Streak Shields" (a top-priority future feature). But when a freeze is consumed, there is no record of *which dates* were frozen. This matters for: (a) preventing fraud (using a freeze on a day you already studied), (b) analytics (how often users use shields), (c) showing the user their freeze history in the UI.  
**Belongs in:** Future migration, when Streak Shields launch.  
**Action:** Modify existing `streaks` table.

```sql
-- Future Migration
ALTER TABLE public.streaks
  ADD COLUMN freeze_used_dates DATE[] NOT NULL DEFAULT '{}';
-- update_streak() should check: IF today IN freeze_used_dates → reject double-freeze
```

---

### GAP 15 — No `profiles_public` view or safe friend-data RPC
**Severity:** 🔴 Blocker  
**Why needed:** As noted in GAP 6, friend lists and leaderboards need to display other users' data (name, avatar, XP, level, streak). There is no safe way for a client to read another user's profile data without either (a) exposing all columns including email, or (b) being blocked by RLS entirely. A materialized or regular view is essential.  
**Belongs in:** MVP — required before any social UI is built.  
**Action:** New VIEW with explicit column selection.

```sql
-- Migration 013
CREATE VIEW public.profiles_public AS
  SELECT
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.current_level,
    p.total_xp,
    p.school,
    public.compute_level_title(p.current_level) AS level_title,
    s.current_streak,
    s.longest_streak
  FROM public.profiles p
  LEFT JOIN public.streaks s ON s.user_id = p.id;

GRANT SELECT ON public.profiles_public TO authenticated;
-- Note: This view inherits RLS from the underlying tables. 
-- Add "profiles_select_public_fields" policy on profiles to allow all authenticated users to SELECT.
```

---

### GAP 16 — `achievement_definitions` is missing a `rarity` column  
**Severity:** 🟢 Future  
**Why needed:** `ideas.md` specifies **Achievement Rarity Tiers** (Common, Rare, Epic, Legendary). The current schema has no rarity concept. This is a simple enum addition that should be seeded before the Achievements page is built.  
**Belongs in:** Near-term — add to the achievement definitions table now so the seed data can be updated once.  
**Action:** Modify existing table.

```sql
-- Migration 013
CREATE TYPE achievement_rarity_enum AS ENUM ('common', 'rare', 'epic', 'legendary');

ALTER TABLE public.achievement_definitions
  ADD COLUMN rarity achievement_rarity_enum NOT NULL DEFAULT 'common';
-- Then UPDATE each achievement definition to set its correct rarity.
```

---

### GAP 17 — `paper_question_attempts` cannot track topic tags  
**Severity:** 🟡 Near-term  
**Why needed:** The **AI Weak Topic Detection** feature (and the existing Mission Engine) relies on linking question attempts to chapters. Currently `chapter_id` on `paper_question_attempts` is a single FK. But one question may test concepts from multiple chapters (e.g. integration + kinematics). A single `chapter_id` column means only one chapter can be blamed for a weak performance, producing inaccurate weak-topic signals.  
**Belongs in:** Near-term, before AI weak topic detection is built.  
**Action:** Add a `chapter_ids` UUID array column alongside the existing `chapter_id` for multi-topic questions. Keep the existing `chapter_id` for backward compat.

```sql
-- Migration 013
ALTER TABLE public.paper_question_attempts
  ADD COLUMN chapter_ids UUID[] NOT NULL DEFAULT '{}';
-- Also add a GIN index:
CREATE INDEX idx_pqa_chapter_ids ON public.paper_question_attempts USING GIN (chapter_ids);
```

---

### GAP 18 — No `get_friend_leaderboard` RPC  
**Severity:** 🟡 Near-term  
**Why needed:** The existing `get_leaderboard` function returns all users. There is no RPC that returns a user's friends sorted by XP or streak. The query pattern (filter by friendship AND join profiles AND join streaks AND compute weekly XP) is complex enough that it belongs in a server function, not client-side.  
**Belongs in:** Near-term, before social leaderboard UI.  
**Action:** New SECURITY DEFINER function.

```sql
-- Migration 014
CREATE OR REPLACE FUNCTION public.get_friend_leaderboard(
  p_user_id UUID,
  p_scope   TEXT    DEFAULT 'all_time', -- 'all_time' | 'weekly' | 'streak'
  p_limit   INTEGER DEFAULT 20
)
RETURNS TABLE(rank BIGINT, user_id UUID, username TEXT, full_name TEXT, 
              avatar_url TEXT, current_level SMALLINT, xp_value BIGINT, streak_days INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public ...
-- Returns self + friends only. Pulls from profiles_public view.
```

---

### GAP 19 — No database-level rate limiting on `generate_daily_missions`  
**Severity:** 🟡 Near-term  
**Why needed:** `generate_daily_missions()` is designed to be called on every login. If a user has many subjects and chapters, this runs a complex multi-CTE scoring query. If the client calls it repeatedly (e.g. network retry, parallel tabs), it could generate excess load. There is no DB-level guard beyond the `ON CONFLICT DO NOTHING` (which prevents duplicate missions but doesn't prevent the SELECT scoring query from running repeatedly).  
**Belongs in:** MVP.  
**Action:** Add an early-exit check based on a `last_mission_generated_at` timestamp on `profiles` or `user_settings`.

```sql
-- Migration 013
ALTER TABLE public.user_settings
  ADD COLUMN missions_last_generated_date DATE;

-- Then in generate_daily_missions():
-- IF missions_last_generated_date = CURRENT_DATE THEN RETURN 0; END IF;
-- After generation: UPDATE user_settings SET missions_last_generated_date = CURRENT_DATE
```

---

## Missing Indexes Identified

| Table | Missing Index | Reason |
|-------|--------------|--------|
| `profiles` | `(school)` | School-scoped leaderboards (future) |
| `user_chapters` | `(user_id, chapter_id, notes_status)` composite | Dashboard chapter list filter |
| `notifications` | `(user_id, is_sent_push)` partial where `is_sent_push = FALSE` | Push notification worker query |
| `pvp_challenges` | `(deadline_at)` | Cron job to expire past-deadline challenges |
| `user_currencies` | `(user_id, created_at DESC)` | Coin transaction history |
| `friendships` | `(user_id_1, user_id_2)` compound | Friendship existence check in send_friend_request |
| `study_sessions` (new) | `(user_id, started_at::DATE)` | Heatmap calendar query |

---

## Missing RLS Policies Identified

| Table | Gap | Fix |
|-------|-----|-----|
| `friendships` | No INSERT or DELETE policies | Friends can be accepted via RPC but the table has no policies for direct writes — fine if accept is always via RPC, but should be explicit |
| `daily_missions` | No INSERT policy | Correct (generation is SECURITY DEFINER only), but should add a comment/assertion |
| `challenge_progress` | No INSERT or UPDATE policies | When a PvP challenge is active, participants need to write their own progress row |
| `study_pets` | INSERT policy missing | The pet is created by `handle_new_user()` trigger, so client should not be able to INSERT directly — needs an explicit DENY or the trigger handles it |
| `blocked_users` (new) | Full CRUD for blocker | New table in GAP 5 |

---

## Prioritized Migration List

These are the recommended migrations to implement **before frontend development begins**, in order:

---

### Migration 013 — MVP Schema Hardening _(create before any frontend work)_
**File:** `20260705000013_mvp_hardening.sql`

Groups all low-cost, high-priority column additions and fixes that are needed for the MVP:

- ✅ Add `username` + `username_lower` to `profiles` + trgm index
- ✅ Add `profiles_public` VIEW with restricted columns
- ✅ Add `profiles_select_public_fields` RLS policy
- ✅ Add `difficulty`, `skip_reason`, `skipped_at` to `daily_missions`
- ✅ Add `revision_count`, `first_completed_at` to `user_chapters`
- ✅ Add `chapter_ids UUID[]` to `paper_question_attempts` + GIN index
- ✅ Add `rarity` enum + column to `achievement_definitions`
- ✅ Add `missions_last_generated_date` to `user_settings`
- ✅ Add `sync_coins_to_profile` trigger function + trigger
- ✅ Add `mark_notifications_read` RPC
- ✅ Add missing partial index on `notifications (is_sent_push = FALSE)`
- ✅ Add missing index on `pvp_challenges (deadline_at)`
- ✅ Add missing index on `user_currencies (user_id, created_at DESC)`
- ✅ Update `handle_notes_status_change` trigger to also set `first_completed_at` and increment `revision_count`
- ✅ Update `generate_daily_missions` to honour `missions_last_generated_date` guard

---

### Migration 014 — Social RPCs _(before social features are built)_
**File:** `20260705000014_social_rpcs.sql`

- ✅ `accept_friend_request(p_request_id UUID)` — atomic accept + notify
- ✅ `send_friend_request(p_to_username TEXT)` — validates + notifies
- ✅ `get_friend_leaderboard(p_user_id, p_scope, p_limit)` — friend-scoped ranking
- ✅ Update `get_leaderboard()` to require `p_user_id` and support friend-scoped mode
- ✅ Add `challenge_progress` INSERT + UPDATE RLS policies

---

### Migration 015 — Blocked Users _(before social features launch)_
**File:** `20260705000015_blocked_users.sql`

- ✅ Create `blocked_users` table with PK, self-check constraint, RLS
- ✅ Add indexes: `(blocker_id)`, `(blocked_id)`
- ✅ `block_user(p_target_id UUID)` RPC — atomically blocks + removes any existing friendship/requests
- ✅ Amend `send_friend_request` to reject if either direction is blocked

---

### Migration 016 — Study Sessions _(before Pomodoro / Time Tracking UI)_
**File:** `20260705000016_study_sessions.sql`

- ✅ Create `study_sessions` table with generated `duration_mins`
- ✅ RLS: owner-scoped CRUD
- ✅ Indexes: `(user_id, started_at DESC)`, `(user_id, subject_id)`, `(user_id, chapter_id)`
- ✅ `start_study_session(p_chapter_id, p_session_type)` RPC
- ✅ `end_study_session(p_session_id)` RPC — awards XP proportional to duration
- ✅ Update `generate_daily_missions` to use session data in recency_penalty calculation

---

### Migration 017 — PvP & Shop Hardening _(before PvP or shop feature launches)_
**File:** `20260705000017_pvp_shop.sql`

- ✅ `create_pvp_challenge(p_opponent_id, p_goal_type, p_goal_target, p_xp_stake)` RPC — validates friendship, creates challenge + progress rows
- ✅ `resolve_pvp_challenge(p_challenge_id)` RPC — determines winner, transfers XP stake, updates pets, creates notifications
- ✅ Add `stripe_price_id` and `real_money_price_cents` to `shop_items`
- ✅ `purchase_shop_item(p_item_id)` RPC — atomic coin deduction + inventory insert, prevents double-purchase
- ✅ Add `freeze_used_dates DATE[]` to `streaks`
- ✅ Update `update_streak` to handle streak shield consumption

---

### Migration 018 — Username Onboarding Enforcement _(can run concurrently with 013)_
**File:** `20260705000018_username_enforcement.sql`

- ✅ Add a DB trigger that fires BEFORE INSERT on `profiles` to auto-generate a username from `full_name + random suffix` if none is provided — ensures no profile ever has a NULL username after onboarding

---

## Items That Are Already Well-Covered (No Action Needed)

| Feature | Status |
|---------|--------|
| XP ledger integrity | ✅ Trigger + GENERATED column — solid |
| Streak timezone handling | ✅ Uses `profiles.timezone` correctly |
| Mission Engine algorithm | ✅ Well-weighted, idempotent via ON CONFLICT |
| Achievement unlock atomicity | ✅ ON CONFLICT + SECURITY DEFINER |
| Google Docs token security | ✅ Zero RLS policies = completely dark to client |
| RLS on all tables | ✅ Every table has RLS enabled |
| Paper accuracy integrity | ✅ GENERATED ALWAYS column — cannot drift |
| Future table stubs | ✅ friendships, pets, PvP, AI, shop all stubbed |
| Trigram search on subjects/chapters | ✅ GIN indexes present |
| Notification system | ✅ Type enum covers all future cases |
| Coin economy structure | ✅ Ledger pattern is correct |

---

## Migration History Status (As of 2026-08-27)

- **Migrations 000–024**: Applied to hosted Supabase and synchronized in remote migration history.
- **Migration 024 (`20260826000024_mvp_syllabus_content.sql`)**: Hardened and verified locally across 173 database tests (68 in `mvp_syllabus_content.test.sql`), then applied on 2026-08-27 after a logical backup. All 18 hosted catalogue and data-preservation checks passed, and the matching application was deployed to Vercel.
- **Migration 025 (`20260827000025_dashboard_stats_hotfix.sql`)**: Prepared and verified locally across 180 database tests, including 7 focused dashboard-statistics tests. It is not applied to hosted Supabase.
- **Migration 026 (`20260827000026_subject_enrollment_management.sql`)**: Prepared and verified locally across 201 database tests, including 21 focused subject-management tests. It is not applied to hosted Supabase.

---

*Database audit complete through hosted Migration 024. Migrations 025–026 remain a locally verified forward-only release pending review, hosted application, and repeat production smoke testing.*
