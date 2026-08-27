# API Routes & Functions

## Supabase RPC (Remote Procedure Calls)
Atlas leverages PostgreSQL functions via Supabase RPC to securely handle complex operations without bloated client-side code.
> **Status**: Migration 024 and its matching application were released on 2026-08-27. Migrations 025–026 were subsequently backed up, applied, recorded, and verified on hosted Supabase that day; their matching application hotfix remains undeployed pending production smoke testing.

- `set_onboarding_subjects(p_user_id UUID, p_subject_ids UUID[])`: Atomically enrolls 1–5 available MVP subjects for onboarding users (`onboarding_completed = FALSE`).
- `configure_subject_route(p_user_id UUID, p_user_subject_id UUID, p_route study_route_enum, p_paper_selections JSONB DEFAULT '[]'::JSONB)`: Configures a subject's study route, validates and persists paper components with `subject_paper_id`, and synchronizes accessible `user_chapters`.
- `transition_to_a2(p_user_id UUID, p_user_subject_id UUID, p_unlock_method a2_unlock_method_enum, p_result_type result_type_enum DEFAULT NULL, p_score_obtained SMALLINT DEFAULT NULL, p_score_maximum SMALLINT DEFAULT NULL, p_exam_series paper_session_enum DEFAULT NULL, p_exam_year SMALLINT DEFAULT NULL, p_carry_forward BOOLEAN DEFAULT FALSE)`: Unlocks A2 stage for staged/as-only routes and records validated AS stage results.
- `complete_mission(mission_id, user_id)`: Marks a mission complete, awards XP, handles streaks, and returns unlock data.
- `undo_mission_completion(mission_id, user_id)`: Reverses mission XP and attempt-linked achievements within 10 minutes on the same local date.
- `generate_daily_missions(user_id)`: Generates up to 3 realistic, varied daily missions balancing categories, capping per-subject load at 2, and populating `subject_paper_id` for past-paper attempts.
- `replace_mission(mission_id, user_id, reason)`: Atomically skips a pending mission and generates an accessible alternative candidate while enforcing variety rules.
- `compute_readiness_score(p_user_id UUID, p_subject_id UUID, p_stage TEXT)`: Returns the stage-aware aggregated readiness percentage (35% Notes, 40% Papers, 25% Confidence), strictly filtering `is_active = TRUE` chapters.
- `compute_readiness_score(p_user_id UUID, p_subject_id UUID DEFAULT NULL)`: Backward-compatibility overload.
- `get_user_dashboard_stats(user_id)`: Aggregates profile, effective current streak, user-local subject exam countdowns, readiness, and missions (including `estimated_minutes` and `subject_paper_id`) in a single request to prevent N+1 queries. Migration 025 restores `subject_readiness[].days_until` and expires a displayed streak when its last activity predates yesterday.
- `add_subject_enrollment(p_user_id UUID, p_subject_id UUID)`: Adds an available global MVP subject or restores the same archived enrollment. Enforces the five-active-subject limit and preserves existing route, progress, papers, and history.
- `archive_subject_enrollment(p_user_id UUID, p_user_subject_id UUID)`: Reversibly removes an owned subject from the active study plan, prevents removal of the final active subject, and skips only pending missions for the archived subject.
- `get_leaderboard(scope, limit)`: Returns top users ranked by XP.
- `get_user_local_date(user_id)`: Internal helper used by database functions to apply the user's saved timezone.

Daily RPCs use `profiles.timezone`; invalid or missing values fall back to UTC.

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
