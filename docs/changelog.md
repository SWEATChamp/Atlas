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

### Fixed
- Dashboard now receives the correct exam-date and chapter-activity checks.
- Production build error caused by missing mission-list properties.
- Daily mission generation and achievement awards now complete successfully.
- Mission completion now refreshes the dashboard immediately.
- Missions, streaks, achievements, greetings, paper dates, exam countdowns, and exam archiving now use the user's local date and time.
- Applied and verified the user-local-date database migration.
- Verified mission generation, one-time mission completion, and local-midnight countdown behaviour with automated safety tests.

### Known Issues
- Subject pages and the dashboard currently calculate readiness differently.
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
