# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Manual exam-date editing from each subject page.
- Approved AS-only, staged A-Level, and full A-Level study-route design.
- Planned separate AS readiness, A2 readiness, and overall A-Level projection.

### Fixed
- Dashboard now receives the correct exam-date and chapter-activity checks.
- Production build error caused by missing mission-list properties.

### Known Issues
- Daily mission generation fails during exam urgency calculation.
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
