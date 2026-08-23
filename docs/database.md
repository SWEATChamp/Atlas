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

## Future Expansion
Stubs for future features are included, such as: `friendships`, `pvp_challenges`, `study_pets`, `ai_coach_conversations`, `user_currencies`, and `shop_items`.

## Approved AS/A2 Data Changes — Pending Migration

The following changes are approved for design but are not yet implemented:

- `user_subjects.study_route`: `as_only`, `staged`, or `full_level`.
- `user_subjects.current_stage`: `as`, `a2`, or `full`.
- `user_subjects.a2_unlocked_at`: records manual or normal A2 access.
- `chapters.stage`: `as`, `a2`, or `shared`.
- `past_papers.stage`: `as` or `a2`.
- Persist the selected paper combination per enrolled subject. The current Mathematics selection exists only in the browser and does not affect readiness.

A new `subject_stage_results` table will store:

- User and enrolled subject.
- Result type: expected, forecast, or actual.
- Score obtained and maximum score.
- Examination series and year.
- Carry-forward intent.
- Creation and update timestamps.

Only an actual AS result may be treated as measured performance. Expected and forecast results remain estimates. Exact carry-forward and final-grade projections must account for the syllabus, paper combination, examination series, and available score information.

Before these changes launch, `compute_readiness_score` must accept a stage and selected paper combination. The separate application-side readiness calculation must be removed or made to call the same database function.
