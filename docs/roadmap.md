# Development Roadmap

> **Master Plan Reference:** This roadmap tracks implementation and release progress against the authoritative master product plan in [`goal.md`](../goal.md). Refer to `goal.md` for long-term product direction, milestone objectives, calculation rules, and verification standards.

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
| Phase 2.6 Five-Subject MVP Syllabus Content | Migration 024 and matching application deployed; initial production smoke checks completed |
| Phase 2.7 Dashboard Statistics Hotfix | Migration 025 and matching application deployed; smoke check passed |
| Phase 2.8 Subject Enrollment Management | Migration 026 and confirmed archive UI deployed; non-destructive smoke check passed |
| Phase 2.9 Application Performance & Dashboard Polish | Application-only changes deployed |
| Phase 2.10 Application Performance Round 2 & State Reconciliation | Application-only changes deployed to production with active Speed Insights |
| Phase 2.11 Production Performance & Mobile Responsiveness | Merged and deployed to production (v1.0.0 baseline, commit `39427dd`) |
| Phase 2.12 / v1.1.0 Dashboard Mobile Compatibility & Update Notifications | Deployed and production-verified on 2026-08-28 (merge commit `7071fa0`); annotated tag `v1.1.0` published at `5a8d69e` |
| v1.1.1 Operational Patch: Singapore Infrastructure Migration | Deployed and production-verified on 2026-09-01 (merge commit `7b2203f`, closeout `8448e18`); annotated tag `v1.1.1` published |
| Phase 2.13 / v1.2.0 Accessible UI Foundation & Subject Controls Guide | Locally prepared on branch `codex/v1.2.0-ui-foundation` and Preview-verified (unreleased / undeployed) |
| Release-candidate checks | 201 database tests and 134 unit tests pass; type check, lint, production build, and whitespace checks pass |
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
- **Status**: Migration 024 was backed up, applied, recorded, and verified on hosted Supabase on 2026-08-27. The matching application was deployed to Vercel and initial production smoke checks completed.
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
- [x] Run application route, paper-form, mission, and XP smoke checks against the hosted schema.
- [x] Deploy the matching application commit and run initial production smoke checks.

## Phase 2.7: Dashboard Statistics Hotfix (Migration 025)
- **Status**: Applied to hosted Supabase, recorded in remote migration history, and deployed with its matching application on 2026-08-27. The countdown regression smoke check passed.
- [x] Restore user-local `days_until` in the dashboard RPC.
- [x] Prevent expired stored streaks from displaying as active.
- [x] Add a defensive UI fallback for missing countdown values.
- [x] Add database and unit regression tests.
- [x] Back up hosted Supabase and release together with Migration 026 using the combined database-first sequence in `docs/deployment.md`.
- [x] Deploy the matching application hotfix and repeat production smoke checks.

## Phase 2.8: Subject Enrollment Management (Migration 026)
- **Status**: Applied to hosted Supabase after Migration 025, recorded in remote migration history, and deployed with its matching application on 2026-08-27. All eight combined hosted boundary checks returned `true`; the production confirmation/cancel path passed a non-destructive smoke check.
- [x] Add only currently available MVP subjects from the Subjects page.
- [x] Require an explicit confirmation before removing a subject.
- [x] Archive enrollment rows and preserve progress, paper history, completed missions, routes, and XP.
- [x] Skip pending missions for removed subjects.
- [x] Enforce a five-active-subject maximum and retain at least one active subject.
- [x] Restore supported archived subjects with the same enrollment ID.
- [x] Add database and unit regression tests.
- [x] Review and commit the hotfix branch.
- [x] Back up hosted Supabase and apply Migrations 025–026 in order.
- [x] Merge the application hotfix and repeat production smoke checks.

## Phase 2.9: Application Performance & Dashboard Polish (Complete)
- [x] Tolerate small browser/database clock differences when showing mission Undo.
- [x] Correct partial exam-date warning language.
- [x] Reuse authenticated user and profile reads within a server render.
- [x] Replace Subjects-page per-subject readiness calls with one existing aggregate RPC.
- [x] Remove the redundant dashboard chapter-data query.
- [x] Add route loading skeletons and defer heavy Past Papers UI.
- [x] Remove third-party font requests.
- [x] Pass unit tests, type checking, lint, production build, and whitespace checks.

## Phase 2.10: Application Performance Round 2 & State Reconciliation
- **Status**: Completed and deployed to production on 2026-08-27.
- [x] Single-source-of-truth client-side dashboard state management (`DashboardView`) with immediate atomic mission feedback and state reconciliation across missions, XP, levels, and streaks.
- [x] Immediate error feedback with local rollback on RPC failure, preventing UI/database desynchronization.
- [x] Replaced `getUser()` in the proxy with `getClaims()` and explicit JWT claims validation, preserving Supabase cookies across redirects and removing the per-request profile lookup.
- [x] Server-side onboarding layout guard (`app/(auth)/onboarding/layout.tsx`), preserving Client Component architecture in `app/(auth)/onboarding/page.tsx`.
- [x] Eliminated redundant post-completion profile query in `completeMission` action, deriving level-ups via pure TypeScript piecewise `computeLevel()`.
- [x] Added Level 15 title `Mythic` in `lib/xp.ts` matching PostgreSQL `compute_level_title`.
- [x] Switched Past Papers subject filter tabs to Next.js `Link` elements with automatic prefetching and `aria-current`.
- [x] Integrated `@vercel/speed-insights` in `app/layout.tsx`.
- [x] Passed 85 unit tests, type checking, lint, production build, and whitespace checks.

## Phase 2.11: Production Performance & Mobile Responsiveness
- **Status**: Merged and deployed to production as baseline `v1.0.0` (commit `39427dd`).
- [x] Optimistic AS/A2 paper-stage tagging with synchronous in-flight duplicate prevention (`inFlightRef`), hardened Zod input validation, row update count verification, and automatic error rollback.
- [x] Paper card action locking during save (disables navigation, edit, delete; passes `effectiveStage ?? 'as'` to modal).
- [x] Minimal client state island (`PaperStageProvider` & `lib/papers-state.ts`) synchronising tagging prompt and attempts list while keeping charts and page shell server-rendered.
- [x] Single current-page reconciliation path leveraging Server Action revalidation without redundant client refreshes.
- [x] Streamlined Past Papers data loading on the "All" view (deriving untagged papers from full paper list to save a database query), while preserving global untagged queries on filtered views.
- [x] Responsive navigation header with explicit CSS Grid areas (desktop: logo → nav → user; mobile: logo + user row 1, nav row 2).
- [x] Mobile touch targets audited and compliant (≥44×44px across navigation, sign-out, filter tabs, tagging buttons, paper actions, inputs, chapter toggles).
- [x] Passed all 98 unit tests, type checking, lint, Turbopack production build, and whitespace checks.

## Phase 2.12 / v1.1.0: Dashboard Mobile Compatibility & Update Notifications
- **Status**: Application-only changes were merged at `7071fa0`, deployed to Vercel production, and production-verified on 2026-08-28. No database migration was required. Annotated release tag `v1.1.0` was published pointing to release-closeout commit `5a8d69e`.
- [x] Container-responsive Daily Mission cards that use their own available width: a flexible 2-tier layout at ≤640px and a compact single row above 640px, eliminating overflow on mobile and keeping cards fluid while resizing desktop or split-screen windows.
- [x] Enforced `minmax(0, 1fr)` and `min-width: 0` constraints across `.dashboard-main-grid` and mission card containers.
- [x] Header logo touch target enforced at ≥44px height; "Configure {subject}" route button enforced at ≥44×44px.
- [x] Authoritative release metadata source (`lib/version.ts`) synchronised with `package.json` (`v1.1.0`).
- [x] Visible semantic version display in authenticated app footer (`Atlas v1.1.0`).
- [x] Accessible latest-only "What's New" release update modal overlay (`components/whats-new-modal.tsx`) with client-safe `localStorage` dismissal tracking, focus management, focus trap, Escape key handling, and background scroll locking.
- [x] Agent workflow discipline rules added to `AGENTS.md`.
- [x] Meaningful component structure tests for MissionCard in `tests/mission-layout.test.ts`.
- [x] Passed all 112 unit tests (including version sync, release notification logic, and mission layout markup tests), type checking, lint, Turbopack production build, and whitespace checks.
- [x] Review, commit, push, merge, and deploy the application release.
- [x] Verify production authentication, responsive mission layout, mission actions, version display, and latest-only update dialog.
- [x] Create annotated release tag `v1.1.0` pointing to release-closeout commit `5a8d69e`.

## Phase 2.13 / v1.2.0: Accessible UI Foundation & Subject Controls Guide
- **Status**: Locally prepared on branch `codex/v1.2.0-ui-foundation` and Preview-verified across two stages (UI foundation baseline on deployment `ApihahfPteHbQwYg5je6dVa8AymT` from commit `c4e6a96`, and final release candidate on deployment `7qSYmzFZLnK8nKioamjB7kDgEhtF` from commit `3db79b0` at `https://atlas-git-codex-v120-ui-foundation-atlas-726e.vercel.app`); unreleased and undeployed to production.
- [x] Extracted accessible, dependency-free `Dialog` component primitive (`components/ui/dialog.tsx`) with `titleId`/`descriptionId`, focus trapping, Escape dismissal, universal focus restoration on every close path/unmount, body scroll locking, and 44×44px touch targets.
- [x] Refactored `WhatsNewModal`, `LogPaperModal`, `SubjectManager`, `A2TransitionModal`, and `RouteSetupSheet` to use the accessible `Dialog` primitive.
- [x] Rationalized global design tokens in `app/globals.css`: added `--border-accent`, `.btn-icon` min 44×44px touch targets, unified skeleton styling, and comprehensive reduced-motion media query rules.
- [x] Implemented two-step Subject controls guide dialog (`components/subjects/subject-controls-guide.tsx`, `components/subjects/subject-guide-launcher.tsx`) with lazy-loading, versioned persistence (`atlas_subject_controls_guide_v1`), in-memory session fallback, coordination with What's New modal to prevent competing auto-opens, exact canonical copy with 5-star visual examples, and a permanently visible "Guide" button beside Chapters.
- [x] Defined canonical shared mappings in `lib/subject-controls.ts` ensuring chapter controls and guide descriptions remain synchronized (`STATUS_CYCLE`, `STATUS_CONFIG`, `CONFIDENCE_LEVELS`).
- [x] Semantic one-way complete action `<button type="button" aria-label="Complete mission: ...">` with separate `Undo` button, keyboard-operable `PaperCard` with native link semantics, and native radio semantics on study route configuration.
- [x] Deduplicated `getPaperDetail` and `getSubjectDetail` metadata reads via `React.cache()`.
- [x] 19 unit tests across `tests/subject-controls-guide.test.ts` and `tests/accessibility-semantics.test.ts` (134 unit tests total passing).
- [x] Verified Stage 1 Vercel Preview deployment (`ApihahfPteHbQwYg5je6dVa8AymT`) from commit `c4e6a9647df1a9dd69ba13b4a3db27963c3dabae` for UI foundation baseline.
- [x] Stage 1 Preview smoke testing across Sign In followed by the authenticated Dashboard, Subjects, Subject details, Past Papers, and paper details.
- [x] Verified Subject controls guide lifecycle: first-visit auto-open, Step 1/2 Next/Back navigation, Escape dismissal, focus trapping, focus restoration on close, manual reopen via "Guide" button, and dismissal persistence.
- [x] Verified zero horizontal overflow and compliant touch targets (≥44×44px) across 320px, 375px, 390px, 768px, and 1280px viewports with zero browser console errors.
- [x] Verified Stage 2 Vercel Preview deployment (`7qSYmzFZLnK8nKioamjB7kDgEhtF`) from commit `3db79b0dfb942da000c28d4ea2fe8eab48704053` for v1.2.0 release candidate.
- [x] Authenticated Stage 2 Preview smoke testing: verified v1.2.0 returning-user notification title, four highlights, upgrade detection from v1.1.1, dismissal persistence, `Atlas v1.2.0` footer, and zero study-record modifications.

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
