# Development Roadmap

## Current Status

| Phase | Status |
|---|---|
| Foundation | Complete |
| Authentication and onboarding | Built; verification passed |
| Subjects and chapters | Built; basic verification passed |
| Past papers | Built; logging verification passed |
| Mission engine | Built; generation and completion verified |
| Gamification | Built; XP, streak, and achievement award flow verified |
| Timezone handling | Complete; application and database verification passed |
| Core safety tests | Complete; all three tests passed |
| Phase 2.5 Database Foundation | Applied and verified; all 23 database tests passed |
| Google Docs integration | Not started |

## Phase 0: Foundation (Complete)
- Scaffolding Next.js App Router project
- Complete Supabase Database schema design and migrations
- Setup System Design documentation

## Phase 1: Authentication & Onboarding
- Supabase Auth integration (Email & Google)
- Multi-step onboarding flow (profile setup, subject selection)
- UI Shell (Sidebar, Topbar, Navigation)

## Phase 2: Subjects & Chapters
- Global subjects display and custom subject creation
- Chapter progress tracking (Notes status, Confidence)
- Subject and Chapter detail views

## Phase 2.5: Study Routes & Readiness Correction

### Database Foundation (Applied and verified — Migration 020)
- [x] Add `study_route` column to `user_subjects` (`unconfirmed`, `as_only`, `staged`, `full_level`)
- [x] Add `current_stage` column to `user_subjects` with route↔stage consistency constraint
- [x] Add `a2_unlocked_at` and `a2_unlock_method` with pair-consistency and staged-A2 constraints
- [x] Add `stage` column to `chapters` (`as`, `a2`, `shared`, `route_dependent`); backfill confirmed & route-dependent mappings for Maths/Physics/Chemistry
- [x] Add `stage` column to `past_papers` (CHECK excludes `'full'`)
- [x] Create `subject_paper_selections` table (structured, one row per component; no `user_id`)
- [x] Create `subject_stage_results` table with required series/year, score constraint, carry-forward AS-only constraint, and dedup UNIQUE
- [x] RLS on both new tables via `user_subjects` join (no `user_id` column in either table)
- [x] All 23 rollback-only database tests passed (covering positive/negative RLS, stage restrictions, duplicates, score validation, carry-forward rules, and unlock consistency)
- [x] TypeScript types updated in `database.ts` and `index.ts`

### Application Layer & Migration 021 (Prepared — Not Yet Applied)
- [x] UI: Route selection banner and RouteSetupSheet for unconfirmed and existing enrolments
- [x] UI: Paper combination selector (`PaperSelectionPanel`) for Mathematics 9709
- [x] UI: Stage-aware result entry & A2 transition modal (`A2TransitionModal`) supporting normal transition and manual unlock
- [x] UI: Separate AS and A2 readiness bars (`StageReadinessPanel`, `SubjectCard`, `SubjectReadinessList`)
- [x] UI: Onboarding Step 4 for choosing study routes and paper combinations
- [x] UI: Past paper logging with required stage selection (`LogPaperModal`) and legacy paper tagger (`PaperStageTagger`)
- [x] UI: 10-minute mission undo action with countdown timer and XP reversal notifications
- [x] Database: Migration 021 SQL authored with 3-arg `compute_readiness_score`, atomic `configure_subject_route`, `transition_to_a2`, `undo_mission_completion`, mission filtering, and RLS guards
- [x] Database Tests: 25 tests in `as_a2_readiness.test.sql` and 9 tests in `undo_mission.test.sql` authored
- [x] TypeScript unit tests: `tests/as-a2-flow.test.ts` (13 tests) passed


## Phase 3: Past Papers & Analytics
- Past paper logging UI
- Granular question attempt tracking
- Readiness Score implementation
- Progress vs. Target data visualization

## Phase 4: Mission Engine & Dashboard
- [x] Implement `generate_daily_missions` algorithm
- [x] Mission Control dashboard view
- [x] Daily task execution flow
- [x] Fix the exam-date calculation error found during mission-generation verification
- [x] Use each user's local day for missions, streaks, achievements, countdowns, and exam archiving
- **Mission Quality, Workload & Variety Hardening (Migration 023)**:
  - **Implemented and tested locally**:
    - [x] Daily mission cap strictly enforced (max 3 active missions/day, 60–120 min target workload promise)
    - [x] `estimated_minutes` tracking (5–120 constraint) with quiet secondary clock display
    - [x] Direct table mutation protection (revoked INSERT/UPDATE/DELETE from client roles on `daily_missions`)
    - [x] Balanced category rotation & subject diversity (max 2 per subject, varied types, no duplicate targets)
    - [x] Strict mission relevance (`complete_notes` requires `notes_status != 'complete'`, `revisit_weak_topic` requires real attempts with <70% accuracy)
    - [x] Atomic, pre-validated `replace_mission` RPC with row locking and zero side-effects on exhaustion
    - [x] 24 pgTAP database tests in `mission_quality.test.sql` and 4 Vitest tests in `mission-quality.test.ts` passed
  - **Pending**:
    - [ ] Hosted Supabase Migration 023 application pending
    - [ ] Manual end-to-end user verification on production environment pending

## Phase 5: Gamification
- XP awards, Levelling system
- Streak tracking and milestones
- Achievements system (Badge grid, notifications)

## Phase 6: External Integrations
- Google Docs OAuth flow
- Automatic notes linking and status sync

## Phase 7: Social (Future)
- Friend requests and mutual friendships
- Leaderboards

## Phase 8: PvP & Pets (Future)
- Head-to-head study challenges
- Study Pets evolution system

## Phase 9: AI Coach (Future)
- Gemini API integration for personalized study advice

## Phase 10: Economy (Future)
- Coin ledger and Shop for unlocking themes and items
