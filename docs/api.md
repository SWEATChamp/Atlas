# API Routes & Functions

## Supabase RPC (Remote Procedure Calls)
Atlas leverages PostgreSQL functions via Supabase RPC to securely handle complex operations without bloated client-side code:
- `complete_mission(mission_id, user_id)`: Marks a mission complete, awards XP, handles streaks, and returns unlock data.
- `generate_daily_missions(user_id)`: Generates today's missions based on notes gap, accuracy, and confidence.
- `compute_readiness_score(user_id, subject_id)`: Returns the aggregated readiness percentage.
- `get_user_dashboard_stats(user_id)`: Aggregates profile, streak, readiness, and missions in a single request to prevent N+1 queries.
- `get_leaderboard(scope, limit)`: Returns top users ranked by XP.

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
