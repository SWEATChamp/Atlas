# API Routes & Functions

## Supabase RPC (Remote Procedure Calls)
Atlas leverages PostgreSQL functions via Supabase RPC to securely handle complex operations without bloated client-side code:
- `complete_mission(mission_id, user_id)`: Marks a mission complete, awards XP, handles streaks, and returns unlock data.
- `undo_mission_completion(mission_id, user_id)`: Reverses mission XP and attempt-linked achievements within 10 minutes on the same local date.
- `generate_daily_missions(user_id)`: Generates up to 3 realistic, varied daily missions balancing categories and capping per-subject load at 2.
- `replace_mission(mission_id, user_id, reason)`: Atomically skips a pending mission and generates an accessible alternative candidate while enforcing variety rules.
- `compute_readiness_score(user_id, subject_id, stage)`: Returns the stage-aware aggregated readiness percentage.
- `get_user_dashboard_stats(user_id)`: Aggregates profile, streak, readiness, and missions (including `estimated_minutes`) in a single request to prevent N+1 queries.
- `get_leaderboard(scope, limit)`: Returns top users ranked by XP.
- `get_user_local_date(user_id)`: Internal helper used by database functions to apply the user's saved timezone.

Daily RPCs use `profiles.timezone`; invalid or missing values fall back to UTC.

## Next.js Route Handlers
Custom endpoints for authentication and integrations:
- **`GET /api/auth/google/callback`**: Handles OAuth2 flow and establishes the session.
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
