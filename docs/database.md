# Database Schema

## Overview
Atlas uses PostgreSQL managed via Supabase. Business logic heavily relies on Row Level Security (RLS) policies and Security Definer functions to maintain a robust zero-trust architecture.

## Tables
- **profiles**: Extends `auth.users`. Stores core user data and denormalized XP/level info.
- **subjects**: Master catalog of CAIE A-Level subjects (e.g., Mathematics, Physics).
- **user_subjects**: Junction table mapping users to their enrolled subjects.
- **chapters**: Pre-seeded chapters mapping to subject syllabuses.
- **user_chapters**: Tracks per-chapter progress, notes completion, and confidence.
- **past_papers**: Logs user attempts at past exam papers.
- **paper_question_attempts**: Granular per-question mark breakdowns for topic analysis.
- **daily_missions**: Generated study tasks for the user (driven by the Mission Engine).
- **xp_events**: Immutable ledger tracking all XP gains.
- **streaks**: Tracks current and longest study streaks for gamification.
- **user_achievements**: Logs unlocked badges and achievements.
- **google_docs_tokens**: Encrypted OAuth2 tokens, secured behind strict RLS preventing client access.

## RLS Philosophy
All tables use Row Level Security (RLS). The fundamental rule is: users can only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` rows where `auth.uid() = user_id`. Master tables like `subjects` and `chapters` allow `SELECT` for all authenticated users but restrict writes.

## Functions & Triggers
Business logic is implemented as PostgreSQL functions (`complete_mission`, `award_xp`, `generate_daily_missions`, `compute_readiness_score`) operating with `SECURITY DEFINER` context. Triggers automate denormalization (`sync_xp_after_event`), updated timestamps (`set_updated_at`), and new user profile generation (`handle_new_user`).

## Timezone Rules

- `profiles.timezone` stores a browser-detected IANA timezone such as `Asia/Singapore`.
- Missing or invalid timezones fall back to `UTC`.
- `get_user_local_date(user_id)` is the shared date source for missions, streaks, daily achievements, dashboard data, and automatic exam archiving.
- Calendar-only values such as exam dates and paper attempt dates remain PostgreSQL `DATE` values and are not shifted between timezones.

## Future Expansion
Stubs for future features are included, such as: `friendships`, `pvp_challenges`, `study_pets`, `ai_coach_conversations`, `user_currencies`, and `shop_items`.

## AS/A2 Data Foundation — Applied and Verified (Migration 020)

The following changes were applied and verified in `20260824000020_as_a2_foundation.sql`. All 23 rollback-only database tests passed. All changes are additive.

### New Enum Types

| Enum | Values |
|---|---|
| `study_route_enum` | `unconfirmed`, `as_only`, `staged`, `full_level` |
| `subject_stage_enum` | `as`, `a2`, `full` |
| `chapter_stage_enum` | `as`, `a2`, `shared`, `route_dependent` |
| `result_type_enum` | `expected`, `forecast`, `actual` |
| `a2_unlock_method_enum` | `normal_transition`, `manual` |

`past_papers.stage`, `subject_paper_selections.stage`, and `subject_stage_results.stage` use `TEXT CHECK (stage IN ('as', 'a2'))` rather than a new enum. This intentionally excludes `'full'` — a paper or result belongs to exactly one stage.

### `user_subjects` — four new columns

| Column | Type | Default | Notes |
|---|---|---|---|
| `study_route` | `study_route_enum NOT NULL` | `'unconfirmed'` | Existing rows are `unconfirmed`; UI must prompt before stage-sensitive features activate |
| `current_stage` | `subject_stage_enum NULL` | `NULL` | NULL when `study_route = 'unconfirmed'` |
| `a2_unlocked_at` | `TIMESTAMPTZ NULL` | `NULL` | Always set with `a2_unlock_method` |
| `a2_unlock_method` | `a2_unlock_method_enum NULL` | `NULL` | Always set with `a2_unlocked_at` |

**Constraints added:**
- `user_subjects_route_stage_check`: enforces the route↔stage relationship (`unconfirmed`→`NULL`, `as_only`→`as`, `staged`→`as` or `a2`, `full_level`→`full`).
- `user_subjects_a2_unlock_consistency`: both unlock fields must be set or both must be NULL.
- `user_subjects_staged_a2_requires_unlock`: a staged subject already in A2 must have both unlock fields filled.

**Application note:** Manually unlocking A2 for an `as_only` enrolment must also update `study_route` to `staged` — leaving contradictory data is prevented by the route_stage constraint.

### `chapters` — one new column

| Column | Type | Default | Notes |
|---|---|---|---|
| `stage` | `chapter_stage_enum NULL` | `NULL` | `as`, `a2`, `shared`, or `route_dependent` (NULL = not yet classified) |

**Backfill applied:**

| Subject | Component | Assigned Stage | Notes |
|---|---|---|---|
| Mathematics 9709 | Pure 1, Pure 2 | `as` | Fixed AS content |
| Mathematics 9709 | Pure 3, Statistics 2 | `a2` | Fixed A2 content |
| Mathematics 9709 | Mechanics, Statistics 1 | `route_dependent` | Effective AS/A2 stage resolved at query time from `subject_paper_selections` |
| Physics 9702 | AS Core | `as` | Fixed AS content |
| Physics 9702 | A2 Core, A2 Applied | `a2` | Fixed A2 content |
| Chemistry 9701 | AS Physical, AS Inorganic, AS Organic | `as` | Fixed AS content |
| Chemistry 9701 | A2 Physical, A2 Inorganic, A2 Organic | `a2` | Fixed A2 content |

Unseeded subjects (Biology, CS, etc.) and custom user-created chapters remain `stage IS NULL` until seeded or tagged.

**Index added:** `idx_chapters_stage ON chapters (subject_id, stage) WHERE stage IS NOT NULL`

### `past_papers` — one new column

| Column | Type | Notes |
|---|---|---|
| `stage` | `TEXT CHECK (stage IN ('as', 'a2')) NULL` | `NULL` = not yet tagged; `'full'` is rejected |

Existing rows stay NULL. Stage cannot be reliably inferred from paper codes without syllabus data.

### New table: `subject_paper_selections`

Stores the student's chosen paper combination, one row per component. No `user_id` column — ownership is always derived via `user_subjects`.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | |
| `user_subject_id` | `UUID NOT NULL FK→user_subjects` | |
| `component_name` | `TEXT NOT NULL` | Matches `chapters.component` |
| `paper_number` | `SMALLINT NULL` | CAIE paper number (1–9); NULL if no fixed number |
| `stage` | `TEXT NOT NULL CHECK (stage IN ('as','a2'))` | |
| `created_at` | `TIMESTAMPTZ` | |

**Constraints:** `sps_unique_component UNIQUE (user_subject_id, component_name)`

**Index:** `idx_sps_stage ON subject_paper_selections (user_subject_id, stage)` — covers stage-filtered readiness queries not served by the UNIQUE index.

**RLS:** All four operations use `EXISTS (SELECT 1 FROM user_subjects us WHERE us.id = ... AND us.user_id = auth.uid())`.

### New table: `subject_stage_results`

Stores expected, forecast, or actual AS/A2 results. No `user_id` column — ownership always derived via `user_subjects`.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | |
| `user_subject_id` | `UUID NOT NULL FK→user_subjects` | |
| `stage` | `TEXT NOT NULL CHECK (stage IN ('as','a2'))` | `'full'` is rejected |
| `result_type` | `result_type_enum NOT NULL` | `expected`, `forecast`, or `actual` |
| `score_obtained` | `SMALLINT NOT NULL CHECK (>= 0)` | |
| `score_maximum` | `SMALLINT NOT NULL CHECK (> 0)` | |
| `exam_series` | `paper_session_enum NOT NULL` | Required — no result without a known session |
| `exam_year` | `SMALLINT NOT NULL CHECK (1990–2100)` | Required |
| `carry_forward` | `BOOLEAN NOT NULL DEFAULT FALSE` | Whether AS result feeds the final A-Level grade (enforced AS-only) |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | Auto-maintained by `set_updated_at` trigger |

**Constraints:**
- `ssr_score_valid CHECK (score_obtained <= score_maximum)`
- `ssr_carry_forward_as_only CHECK (carry_forward = FALSE OR stage = 'as')`
- `ssr_unique UNIQUE (user_subject_id, stage, result_type, exam_series, exam_year)` — also serves as the primary lookup index (leading column = `user_subject_id`).

**Index:** `idx_ssr_carry_forward ON subject_stage_results (user_subject_id) WHERE carry_forward = TRUE` — partial index not covered by the UNIQUE key.

**RLS:** Same `EXISTS` pattern via `user_subjects` as `subject_paper_selections`.

### Deferred (Phase 2.5 continuation)

`compute_readiness_score` is not modified in this migration. Stage-aware readiness calculations, mission filtering by stage, access control based on `study_route`, and the result-entry UI all remain pending per the roadmap.
