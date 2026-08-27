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
- **AS/A2 Application Flow & Migration 021 (Applied to Hosted Supabase):**
  - Route selection UI (`RouteSelectionBanner`, `RouteSetupSheet`) and Onboarding Step 4 for choosing AS only, Staged A Level, or Full A Level per subject.
  - Paper combination selection (`PaperSelectionPanel`) for Mathematics (Pure 1/Pure 3/Mechanics/Statistics).
  - Stage-aware readiness calculation via PostgreSQL `compute_readiness_score(user_id, subject_id, stage)` RPC, removing application-side calculation entirely.
  - Separate AS and A2 readiness displays across dashboard and subject pages; removed averaged readiness hero chip.
  - A2 transition modal supporting standard AS result entry with carry-forward validation and early manual unlock.
  - Past paper logging with required stage selection and legacy paper tagger (`PaperStageTagger`).
  - Auth guards (`auth.uid() = p_user_id`) added to all security definer functions and chapter/paper RLS policies.
- **AS/A2 Fixes & Gamification Accounting (Migration 022 — Applied to Hosted Supabase):**
  - Mission completion attempts tracked via `daily_missions.completion_attempt`.
  - Detailed XP breakdown payload returned from `complete_mission` (`mission_xp`, `daily_bonus_xp`, `achievement_xp`, `total_xp_awarded`, `new_total_xp`) and displayed in dashboard toast stack.
  - Mission completion enforces user local calendar date match and rejects foreign-date missions.
  - Mission undo atomically reverses mission XP, daily completion bonus, and attempt-linked achievements (deleting unlock records from `user_achievements` so badges can be re-earned).
  - Clean support for multiple `complete → undo → complete → undo` cycles without cross-attempt reward leakage.
  - Strict profile XP ledger invariant maintained (`profiles.total_xp = SUM(xp_events.xp_amount)`).
  - Atomic onboarding subject selection via `set_onboarding_subjects` RPC (enforcing 1–5 subjects and `onboarding_completed = FALSE`).
  - Mathematics 9709 paper selection strict matching and onboarding Continue button validation.
  - Pure 2 Mathematics reclassified as `route_dependent`.
  - Declarative auth-independent migration backfill of `user_chapters` for existing confirmed enrollments.
  - 10 database tests in `migration_022_fixes.test.sql` and 10 tests in `undo_mission.test.sql`.
- **Mission Quality, Workload & Variety Balancing (Migration 023 — Applied to Hosted Supabase):**
  - Added `estimated_minutes` column to `daily_missions` (CHECK 5–120 mins) and backfilled existing missions with sensible duration estimates (10–60 mins).
  - Constrained `user_settings.max_missions_per_day` to 1..3 (default 3) and backfilled existing settings > 3 to 3.
  - Overhauled `generate_daily_missions` algorithm:
    - Enforces maximum 2 missions per subject across active daily budget.
    - Prohibits duplicate target entities (`target_entity_id`) on the same local date.
    - Ensures variety by prioritizing balanced category rotation (Notes ~30m/50XP, Practice/Weak-topic ~30m/40XP or Paper ~60m/75XP, Review ~20m/30XP or Confidence ~10m/20XP).
    - Never generates all 3 missions of identical type; safely stops and emits fewer than 3 missions when content is limited.
    - Replaces broad instructions with bite-sized, realistic action titles and clear descriptions.
  - Added atomic, pre-validated `replace_mission` RPC:
    - Verifies user ownership (`auth.uid() = p_user_id`), pending status, and user-local calendar date.
    - Serializes user mission operations via `user_settings` row lock (`FOR UPDATE`).
    - Validates alternative candidate availability before committing the skip; aborts with `P0002: No suitable replacement available` without modifying the original mission if exhausted.
    - Replaces mission atomically in place and maintains 3-mission active cap.
  - Quiet UI duration display with `<Clock /> ~X min` and secondary "Replace" button with specific loading state and propagation isolation.
  - 15 pgTAP database tests in `mission_quality.test.sql` and 4 Vitest unit tests in `mission-quality.test.ts`.
- **Five-Subject MVP Syllabus Content & Subject Availability (Migration 024 — Prepared, Pending Hosted Review):**
  - Gated syllabus onboarding and selection to exactly 5 MVP subjects via `subjects.is_available`: Mathematics 9709, Further Mathematics 9231, Physics 9702, Chemistry 9701, and Computer Science 9618.
  - Preserved grandfathered user enrollments in non-MVP subjects while isolating modern onboarding routes.
  - Added normalized catalogue tables: `subject_papers`, `subject_valid_routes`, `subject_route_papers`, and `chapter_papers`.
  - Deprecated non-syllabus chapters with `chapters.is_active = FALSE` (Mathematics Pure 1 Vectors `number = 99`, Physics Electromagnetic Induction `number = 99`).
  - Implemented scoped positive-number collision-safe staging (`+1000`) for legacy Mathematics, Physics, and Chemistry chapters during migration.
  - Seeded complete official 37-topic Chemistry 9701 (topics 1–22 AS, 23–37 A2; Group 2 as topic 27, Transition Elements as topic 28).
  - Seeded Physics 9702 chapter splits (Topic 8 Superposition, Topic 15 Ideal Gases).
  - Seeded 24 Further Mathematics 9231 and 20 Computer Science 9618 official chapters with paper linkages.
  - Added FK `subject_paper_id` on `daily_missions` (indexed), `subject_paper_selections`, and `past_papers`.
  - Added database triggers: `validate_chapter_paper_subject`, `validate_subject_paper_selection`, and `validate_past_paper_entry` (with narrow legacy exception for unchanged legacy rows).
  - Authored comprehensive pgTAP database tests in `mvp_syllabus_content.test.sql` and unit tests in `tests/mvp-syllabus.test.ts` and `tests/as-a2-flow.test.ts`.
  - Note: *Migration 024 is prepared and locally verified; hosted application pending review.*

### Fixed
- Replaced inconsistent application-side readiness calculation with database-level single source of truth.
- Prevented unconfirmed and inaccessible subject chapters from generating daily missions.
- Tightened `carry_forward = TRUE` constraint to require both `stage = 'as'` and `result_type = 'actual'`.

### Known Issues & MVP Limitations
- Mission undo in MVP reverses XP, daily bonus, and attempt-linked achievements, but does not modify streaks or `last_reviewed_at` timestamps.
- Non-MVP subjects (such as Biology 9700) are flagged as unavailable (`is_available = FALSE`) for new onboarding while preserving grandfathered enrolments.


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
