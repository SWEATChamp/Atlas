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

### Pending (UI and logic work)
- [ ] UI: route selection prompt for existing (unconfirmed) and new enrolments
- [ ] UI: paper combination selector per enrolled subject (reads `subject_paper_selections`)
- [ ] UI: result entry form for expected, forecast, and actual results
- [ ] Access filtering: chapters and missions filtered by `current_stage` and `study_route`
- [ ] Readiness: update `compute_readiness_score` to accept stage and selected paper combination
- [ ] Readiness: remove application-side readiness calculation; route everything through the DB function
- [ ] Readiness: show separate AS readiness and A2 readiness in the dashboard
- [ ] Readiness: add overall A-Level projection separate from per-stage readiness
- [ ] Staged students: prompt for AS result before the normal A2 transition
- [ ] Manual A2 unlock: implement with warning; must also set `study_route` to `staged`

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
