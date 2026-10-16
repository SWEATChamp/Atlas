# API Routes & Functions

## Supabase RPC (Remote Procedure Calls)
Atlas leverages PostgreSQL functions via Supabase RPC to securely handle complex operations without bloated client-side code.
> **Status**: The Production baseline includes Migration 029. Milestone 4 baseline `848d139` uses Migration 031 in isolated Preview project `eiyrzzcmljhrucazgxpm`; current feedback corrections are locally committed, not pushed or deployed. This does not constitute a Production release.

- `set_onboarding_subjects(p_user_id UUID, p_subject_ids UUID[])`: Atomically enrolls 1–5 available MVP subjects for onboarding users (`onboarding_completed = FALSE`).
- `configure_subject_route(p_user_id UUID, p_user_subject_id UUID, p_route study_route_enum, p_paper_selections JSONB DEFAULT '[]'::JSONB)`: Configures a subject's study route, validates and persists paper components with `subject_paper_id`, preserves `current_stage = 'a2'` and unlock metadata for already-staged A2 students, and synchronizes accessible `user_chapters`.
- `transition_to_a2(p_user_id UUID, p_user_subject_id UUID, p_unlock_method a2_unlock_method_enum, p_result_type result_type_enum DEFAULT NULL, p_score_obtained SMALLINT DEFAULT NULL, p_score_maximum SMALLINT DEFAULT NULL, p_exam_series paper_session_enum DEFAULT NULL, p_exam_year SMALLINT DEFAULT NULL, p_carry_forward BOOLEAN DEFAULT FALSE, p_paper_selections JSONB DEFAULT NULL)`: Unlocks A2 stage for staged/as-only routes and records validated AS stage results. Route capability is determined strictly from the route catalogue in `subject_valid_routes` (requiring `as_only` and `staged` entries), independent of `subjects.is_available`. When transitioning a catalogued `as_only` enrollment to `staged`, canonically converts paper selections (or applies explicitly validated `p_paper_selections`, enforcing the Continuation Preservation Rule against existing AS paper history, with an explicit replacement exception for Mathematics Pure 2). For subjects without canonical routes in `subject_valid_routes`, omitted/empty selections preserve existing papers while advancing to staged/A2, whereas non-empty replacement selections are rejected atomically (`P0003`). For already-staged enrollments, rejects paper selection modifications and preserves existing staged selections.
- `complete_mission(mission_id, user_id)`: Marks a mission complete, awards XP, handles streaks, and returns unlock data.
- `undo_mission_completion(mission_id, user_id)`: Reverses mission XP and attempt-linked achievements within 10 minutes on the same local date.
- `generate_daily_missions(user_id)`: Generates up to 3 realistic, varied daily missions balancing categories, capping per-subject load at 2, and populating `subject_paper_id` for past-paper attempts.
- `replace_mission(mission_id, user_id, reason)`: Atomically skips a pending mission and generates an accessible alternative candidate while enforcing variety rules.
- `compute_readiness_score(p_user_id UUID, p_subject_id UUID, p_stage TEXT)`: Returns the stage-aware aggregated readiness percentage, strictly filtering `is_active = TRUE` chapters. In Migration 031, the weights remain 35% Notes, 40% combined mark-weighted full-paper and eligible question-item accuracy, and 25% Confidence.
- `compute_readiness_score(p_user_id UUID, p_subject_id UUID DEFAULT NULL)`: Backward-compatibility overload.
- `get_user_dashboard_stats(user_id)`: Aggregates profile, effective current streak, user-local subject exam countdowns, readiness, and missions (including `estimated_minutes` and `subject_paper_id`) in a single request to prevent N+1 queries. Migration 025 restores `subject_readiness[].days_until` and expires a displayed streak when its last activity predates yesterday.
- `add_subject_enrollment(p_user_id UUID, p_subject_id UUID)`: Adds an available global MVP subject or restores the same archived enrollment. Enforces the five-active-subject limit and preserves existing route, progress, papers, and history.
- `archive_subject_enrollment(p_user_id UUID, p_user_subject_id UUID)`: Reversibly removes an owned subject from the active study plan, prevents removal of the final active subject, and skips only pending missions for the archived subject.
- `get_leaderboard(scope, limit)`: Returns top users ranked by XP.
- `get_user_local_date(user_id)`: Internal helper used by database functions to apply the user's saved timezone.

Daily RPCs use `profiles.timezone`; invalid or missing values fall back to UTC.

### Milestone 4 practice API (Preview baseline; local feedback corrections)

- `log_practice_session_atomic(p_user_id UUID, p_subject_id UUID, p_stage TEXT, p_title TEXT, p_session_date DATE, p_duration_mins SMALLINT, p_session_provenance JSONB DEFAULT '{}', p_items JSONB DEFAULT '[]', p_notes TEXT DEFAULT NULL)` returns the new session. Its full parent/item/chapter write is atomic.
- `update_practice_session_atomic(p_user_id UUID, p_session_id UUID, p_title TEXT, p_session_date DATE, p_duration_mins SMALLINT, p_session_provenance JSONB DEFAULT '{}', p_items JSONB DEFAULT '[]', p_notes TEXT DEFAULT NULL)` returns the updated session after full item replacement. Subject and actual stage are immutable.
- `delete_practice_session(p_user_id UUID, p_session_id UUID)` returns whether an owned session was deleted.
- The server-only `lib/actions/practice-sessions.ts` authenticates and validates create/update/delete, owner-scopes reads, exposes subject/all history, detail, form catalogue, trends, and combined chapter evidence, and revalidates dashboard, past-papers, and affected subject paths after successful mutations. Client UI does not write practice tables directly.
- Local application create and replacement-update validation requires each item's `chapterIds` to contain 1–200 distinct chapter UUIDs; multiple chapter selections are retained, and the RPC validates their subject/stage/source eligibility. Existing unmapped history remains readable and retains its earlier readiness rules, but a replacement edit must provide chapter selections. This new minimum is not yet enforced by direct RPC calls: unchanged Migration 031 accepts empty mappings, pending a separately approved forward migration.
- The local chapter selector allows explicit off-route paper sources with active same-subject, catalogue-stage-compatible chapters; recorded-stage unlocks and selected-paper stage assignments remain enforced. These questions are history-only and excluded from current-route readiness/chapter evidence. Source-free topical selection remains current-route scoped. Migration 031 still rejects some route-dependent off-route mappings; the shared write validator needs a separately approved forward migration before that path can save end to end. Readiness filtering is unchanged.
- Paper history/counts, mark-weighted full-paper average, best/latest, comparable component analytics, prediction inputs, and official-threshold comparison inputs use only `past_papers`. Question practice remains a separate input to readiness, chapter analytics, and the explicitly combined trend.

## Next.js Route Handlers
Custom endpoints for authentication and integrations:
- **`GET /api/auth/callback`**: Handles the Supabase OAuth callback and establishes the session.
- **`GET /api/docs/connect`**: Initiates Google Docs OAuth permission grant.
- **`GET /api/docs/callback`**: Captures and stores encrypted Google Docs tokens.
- **`POST /api/docs/sync`**: Refreshes tokens and syncs note document status.

## Error Handling
Standardized JSON error responses ensure predictable client-side behavior:
```json
{
  "error": "UNAUTHORIZED",
  "message": "Missing or invalid session token",
  "status": 401
}
```
