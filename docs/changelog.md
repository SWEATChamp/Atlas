# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Manual exam-date editing from each subject page.
- Approved AS-only, staged A-Level, and full A-Level study-route design.
- Planned separate AS readiness, A2 readiness, and overall A-Level projection.
- Automatic browser-timezone detection for existing users and during onboarding.
- Three small safety tests covering mission generation, mission completion, and local-midnight exam countdowns.
- **AS/A2 Database Foundation (Migration 020):** Applied and verified database migration with `study_route`, `current_stage`, `a2_unlocked_at`, and `a2_unlock_method` columns on `user_subjects` with three consistency constraints; `stage` column on `chapters` (including `route_dependent` for Maths Mechanics & Statistics 1); `stage` column on `past_papers`; new `subject_paper_selections` table (structured paper combination, ownership via `user_subjects`); new `subject_stage_results` table (required series/year, score CHECK, carry-forward AS-only CHECK, dedup UNIQUE, `set_updated_at` trigger); RLS on both new tables via `user_subjects` join; five new enum types; indexes on `chapters.stage`, `subject_paper_selections.stage`, and `subject_stage_results` carry-forward; TypeScript types updated in `database.ts` and `index.ts`; all 23 rollback-only database tests passed.
- **AS/A2 Application Flow & Migration 021 (Prepared — Not Yet Applied):**
  - Route selection UI (`RouteSelectionBanner`, `RouteSetupSheet`) and Onboarding Step 4 for choosing AS only, Staged A Level, or Full A Level per subject.
  - Paper combination selection (`PaperSelectionPanel`) for Mathematics (Pure 1/Pure 3/Mechanics/Statistics).
  - Stage-aware readiness calculation via PostgreSQL `compute_readiness_score(user_id, subject_id, stage)` RPC, removing application-side calculation entirely.
  - Separate AS and A2 readiness displays across dashboard and subject pages; removed averaged readiness hero chip.
  - A2 transition modal supporting standard AS result entry with carry-forward validation and early manual unlock.
  - Mission undo action within 10 minutes on same local calendar day, reversing mission and all-missions-completed bonus XP atomically.
  - Past paper logging with required stage selection and legacy paper tagger (`PaperStageTagger`).
  - Auth guards (`auth.uid() = p_user_id`) added to all security definer functions and chapter/paper RLS policies.
  - 34 rollback-only database tests authored covering readiness, access control, route configuration, A2 transition, and mission undo.

### Fixed
- Replaced inconsistent application-side readiness calculation with database-level single source of truth.
- Prevented unconfirmed and inaccessible subject chapters from generating daily missions.
- Tightened `carry_forward = TRUE` constraint to require both `stage = 'as'` and `result_type = 'actual'`.

### Known Issues & MVP Limitations
- Mission undo in MVP reverses XP and restores pending status, but does not modify streaks, achievements already unlocked, or `last_reviewed_at` timestamps.
- Biology and Computer Science do not yet have seeded chapters.


## [0.1.0] - Initial Commit
### Added
- Project folder structure initialization.
- Complete Database Schema via Supabase migrations (000 to 012).
- Tables created: profiles, subjects, user_subjects, chapters, user_chapters, past_papers, paper_question_attempts, daily_missions, xp_events, streaks, user_achievements, google_docs_tokens, notifications, user_settings.
- Future stub tables: friendships, friend_requests, study_pets, pvp_challenges, challenge_progress, ai_coach_conversations, ai_coach_messages, user_currencies, shop_items, user_inventory.
- Full suite of Row Level Security (RLS) policies.
- Initial seed data for CAIE A-Level subjects and 20 achievement definitions.
- PostgreSQL Functions for XP management, daily mission generation, and readiness score calculation.
- System design documentation (`docs/` directory).
