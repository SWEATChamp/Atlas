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
| Phase 2.5 Database Foundation | Applied to hosted database (Migrations 020–023) |
| Phase 2.6 Five-Subject MVP Syllabus Content | Migration 024 applied and hosted-verified; application deployment pending |
| Release-candidate checks | 173 database tests and 63 unit tests pass; type check and production build pass |
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

## Phase 2.5: Study Routes & Readiness Correction (Migrations 020–023)
- [x] Applied to hosted database (Migrations 020–023)
- [x] AS/A2 foundation, readiness calculations, and mission quality hardening complete

## Phase 2.6: Five-Subject MVP Syllabus Content & Availability (Migration 024)
- **Status**: Migration 024 was backed up, applied, recorded, and verified on hosted Supabase on 2026-08-27. Application deployment and production UI smoke checks remain pending.
- [x] Five MVP subjects gated via `is_available = TRUE`: Mathematics 9709, Further Mathematics 9231, Physics 9702, Chemistry 9701, Computer Science 9618.
- [x] Normalized paper catalogue (`subject_papers`), valid routes (`subject_valid_routes`), and route components (`subject_route_papers`).
- [x] Chapter to paper assessment mapping (`chapter_papers`).
- [x] Scoped collision-safe renumbering (+1000 staging) for legacy chapters with `is_active = FALSE` deprecation for non-syllabus rows.
- [x] Complete 37-topic Chemistry 9701, 25-topic Physics 9702, 38-chapter Maths 9709, 24-chapter Further Maths 9231, and 20-chapter CS 9618 models.
- [x] Database triggers protecting past-paper and route-selection integrity at the schema boundary.
- [x] `daily_missions.subject_paper_id` component persistence across generation and replacement.
- [x] Further Mathematics route setup and fixed-route paper summaries handled consistently in onboarding and subject settings.
- [x] Create and verify a pre-migration logical database backup.
- [x] Apply Migration 024 to hosted Supabase and synchronize remote migration history.
- [x] Run hosted schema, catalogue, and data-preservation checks (18/18 passed).
- [ ] Run application route, paper, mission, and XP smoke checks against the hosted schema.
- [ ] Deploy the matching application commit and run production smoke checks.



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
    - [x] Applied to hosted database (Migration 023)

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
