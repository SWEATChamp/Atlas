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
| Phase 2.13 / v1.2.0 Accessible UI Foundation & Subject Controls Guide | Deployed and production-verified on 2026-09-02 (merge commit `abed20b`, closeout `a4ea179`); annotated tag `v1.2.0` and GitHub Release published |
| Milestone 3: Official Grade-Threshold Foundation | In progress; Migration 027 and June 2026 publications present in Singapore; publication discovery merged (PR #16, `07120d1`) and deployed (`dpl_GmxutRfLHEHPnqArivPBowNtJL4i`); Stage 1 discovery route and credential split merged (PR #18, `ce2eaec`) and deployed to production (`dpl_2t1Kbt6hJMMxiPgPz38cAWF459pz`); endpoints are dormant; `vercel.json` absent; notification mechanism and schedule activation pending |
| Milestone 4: Paper & Question-Practice Logging and Analytics | Planned; product rules documented, implementation not started |
| Milestone 5: Target-Grade Marks Planner | Planned; product rules documented, depends on Milestone 3 official thresholds and Milestone 4 practice logging |
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
- **Status**: Complete and formally released (merged via PR #12 at merge commit `abed20ba325e99113813a8860be7f4a22c1fc39c`, deployed to Vercel production `9RCwZ6xAY7ohAqxNn2msJzcCXcUi`, production-verified, closed out via PR #13 at merge commit `a4ea17993e0f9250eb1c50a41d930a8c4f5a4d2c`, annotated tag `v1.2.0` published, and stable GitHub Release published).
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
- [x] Verified Stage 2 Vercel Preview deployment (`7qSYmzFZLnK8nKioamjB7kDgEhtF`) from commit `3db79b0dfb942da000c28d4ea2fe8eab48704053` for v1.2.0 release candidate.
- [x] Verified Stage 3 Vercel Preview deployment (`ESWA1crtAKir5rpNbeAUYdSvGK1n`) from commit `bff4c5b0cc24d435187e7a1974a19a7c9fd30687` for master product plan documentation.
- [x] Merged PR #12 to `main` at commit `abed20ba325e99113813a8860be7f4a22c1fc39c` and verified automatic Vercel Production deployment `9RCwZ6xAY7ohAqxNn2msJzcCXcUi`.
- [x] Authenticated production smoke testing: verified v1.2.0 returning-user notification title, four highlights, upgrade detection from v1.1.1, dismissal persistence, `Atlas v1.2.0` footer, and zero study-record modifications.
- [x] Verified Subject controls guide lifecycle in production: first-visit auto-open, Step 1/2 Next/Back navigation, Escape dismissal, return focus to the Guide launcher, manual reopen via "Guide" button beside Chapters, and dismissal persistence.
- [x] Verified zero horizontal overflow across 320px, 375px, 390px, 768px, and 1280px viewports on Dashboard, Subjects, and Past Papers with zero browser console errors.
- [x] Verified Past Paper detail view loaded correctly and separately passed the 320px overflow and touch-target check.
- [x] Verified minimum 44×44px touch targets across touch-oriented layouts from 320px through 768px.
- [x] Create annotated release tag `v1.2.0` pointing to release-closeout commit `a4ea17993e0f9250eb1c50a41d930a8c4f5a4d2c`.
- [x] Publish stable GitHub Release for `v1.2.0`.

## Phase 3: Past Papers & Analytics
- Past paper logging UI
- Granular question breakdown within logged full papers
- Standalone individual and grouped past-year/topical question-practice logging
- Readiness Score implementation
- Progress vs. Target data visualization

### Milestone 3: Official Grade-Threshold Data Foundation (In progress)

> **Implementation Status:**
> - Migration 027 and the reviewed June 2026 publications are present in Singapore.
> - Automatic Cambridge publication discovery is implemented, merged (PR #16, merge commit `07120d189a4416604945ef76382a2cae3dd412da`), and production-deployed (Vercel deployment `dpl_GmxutRfLHEHPnqArivPBowNtJL4i`).
> - Operational audit findings:
>   - No active schedule was found in the current Vercel configuration, and no invocation was observed in the available retained logs. This evidence does not prove the endpoint was never invoked historically.
>   - `CRON_SECRET` and elevated Supabase credentials (`SUPABASE_SERVICE_ROLE_KEY`) are confirmed absent from Vercel environment variables; the authorized route cannot execute successfully without an elevated credential.
>   - Decision pending: dedicated modern Supabase secret key vs. temporary retention of `SUPABASE_SERVICE_ROLE_KEY`.
>   - Runtime reality: current deployed endpoint downloads all 5 manifest PDFs plus weighting PDF (not an HTML-only or zero-PDF check), making the 60s function limit and runtime/bandwidth validation strict activation gates.
>   - Preferred architecture: a lightweight **discovery-only** scheduled job (checking Cambridge index pages; emitting structured reports/logs only without downloading PDFs, persisting candidates, or requiring database credentials) is recommended over a full-import cron; mutating importer remains dormant until separately reviewed.
>   - Preview boundary: Preview cannot target Singapore production for mutations and must not receive elevated credentials; authorized behavior is verified via automated tests.
> - Milestone 3 remains in progress: discovery code and Stage 1 discovery-only route (`/api/cron/grade-threshold-discovery`) and runner are merged (PR #18, merge commit `ce2eaec8de41371113aee090fcc84525f7bdaca2`) and deployed to production (`dpl_2t1Kbt6hJMMxiPgPz38cAWF459pz`); endpoints remain dormant; on this branch, structured runtime logging is implemented to emit sanitized, single-line JSON logs on every authorized discovery execution for operator observability; proposed operating model recommends Production schedule `0 7 * * *` (UTC) with weekly off-season and results-window operator polling during the one-hour Hobby retention window; `vercel.json` remains absent; `CRON_SECRET` remains unprovisioned; no cron schedule or production cron activation was performed; first authorized Production invocation, immediate disabling, and schedule removal remain separately approved operational actions; import and publication remain separately gated.

- [x] Create a persistent, versioned Supabase catalogue for official Cambridge component and combination thresholds.
- [x] Import the June 2026 publications as the initial latest dataset for all five supported subjects.
- [x] Implement automatic discovery of March, June, and November publications per subject independent of student requests, allowing a series—particularly March—to omit subjects without fabricating an expected publication (merged in PR #16).
- [x] Implement Stage 1 discovery-only route and runner with credential separation and transitive isolation.
- [x] Merge and deploy Stage 1 discovery-only route to production (PR #18, ce2eaec).
- [ ] Establish approved durable notification mechanism or documented operator polling procedure.
- [ ] Activate and verify controlled production cron scheduling and operational monitoring.
- [x] Treat an existing document checksum as a no-op and store a changed document as an append-only revision requiring validation.
- [x] Retain exact variants, every valid official combination token, maxima, source-backed official weightings, source URLs, publication dates, checksums, parser versions, and review status, including official combinations not currently mapped to an Atlas route.
- [x] Maintain separate, explicitly reviewed planner-eligibility mappings so only supported Atlas routes and paper combinations are exposed to students.
- [x] Stage, validate, report, and atomically publish imports only after manual samples from every subject match the official documents.
- [x] Return “Threshold unavailable” for missing, ambiguous, unsupported, or unverified data rather than guessing.
- [x] Add database constraints, indexes, RLS, import-audit records, idempotency tests, and revision-history tests.

### Milestone 4: Paper & Question-Practice Logging and Analytics (Planned)

- [ ] Preserve the existing full-paper logger with required paper, variant, series, year, stage, date, and total marks.
- [ ] Add a separate **Log questions** workflow for one question or grouped past-year, topical, or mixed/custom question practice.
- [ ] Require subject, AS/A2 stage, date, marks obtained, and marks available for question practice while keeping paper, variant, series, year, source label, question number, duration, notes, and chapter mappings optional when genuinely unknown.
- [ ] Implement a separate post-Migration-027 practice schema for sessions, scored question items, and normalized chapter mappings; do not weaken the identity requirements of `past_papers`.
- [ ] Save each practice session and all of its items and chapter mappings through an ownership-checked, stage-aware atomic operation.
- [ ] Include full papers and question practice in readiness using mark-weighted combined assessment accuracy, without double-counting full-paper question breakdowns.
- [ ] Include mapped standalone questions in chapter accuracy and weak-topic evidence.
- [ ] Extend accuracy trends with All practice, Full papers, and Question practice views, visually distinct points, mark-weighted averages, and evidence volume.
- [ ] Keep paper counts, full-paper averages, best-paper scores, and paper-related achievements isolated from standalone question practice.
- [ ] Leave question-practice XP and streak effects unchanged until separately designed and approved.
- [ ] Add database, calculation, RLS, atomicity, optional-provenance, aggregation, no-double-count, and evidence-isolation tests.

### Milestone 5: Target-Grade Marks Planner (Planned)

- [ ] Select the latest applicable official threshold using subject, route, stage, paper combination, year, and March/June/November series mapping.
- [ ] Use an exact official component threshold when the student's variant is known.
- [ ] When a variant is unknown, calculate a clearly labelled Atlas paper estimate from the ceiling of the approved compatible variant average, such as Mathematics 9709 Paper 1 variants 11, 12, and 13.
- [ ] Include every compatible full-paper attempt in each grade-prediction paper baseline, normalize safely against its recorded maximum where necessary, and apply gradual recency weighting while keeping lifetime average, weighted baseline, attempt count, variability, and trend distinct.
- [ ] Exclude standalone question practice from predicted grades and official threshold comparisons at the data-query boundary.
- [ ] Present A* only as an official combined threshold; individual-paper A* allocations remain explicitly labelled Atlas estimates.
- [ ] Use the averaged component A benchmark as the starting point for an A* paper allocation, then distribute the additional marks required by the official combined A* threshold.
- [ ] For staged A*, use `ceil(official combined target / 2)` as the estimated AS contribution until a compatible official weighted AS mark replaces it.
- [ ] Calculate remaining A2 marks as `official combined target - official weighted AS contribution`, then detect targets exceeding the available A2 maximum.
- [ ] Keep raw marks, weighted marks, grades, percentages, and PUMs distinct throughout storage, calculation, and presentation.
- [ ] Retain and apply component weighting only where an official Cambridge source supports it; never infer a missing weighting.
- [ ] Permit a validated official overall combination benchmark without component weighting, but make its per-paper allocation unavailable until trustworthy weighting exists.
- [ ] When allocation is eligible, round only at final display and recheck the rounded allocation against the combined target.
- [ ] Display required marks, student latest and average paper comparisons, safety-margin targets, subject-level predictions, source provenance, included variants, latest-publication fallback, and official-versus-estimated disclosures.
- [ ] Add calculation, staged-route, variant-grouping, recency-weighting, threshold-boundary, prediction-isolation, and missing-data failure tests.

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
