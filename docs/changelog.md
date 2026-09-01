# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Operational patch release `1.1.1` is prepared on branch `codex/v1.1.1-singapore-cutover` pending merge and deployment.

---

## [1.1.1] - 2026-09-01

Operational patch release prepared on branch `codex/v1.1.1-singapore-cutover` (not yet merged or deployed) moving Atlas database, authentication, and backend services from Sydney (`ap-southeast-2`) to Singapore (`ap-southeast-1`). While the underlying infrastructure cutover is completed and production-verified, the application metadata and returning-user notification changes are prepared on the release branch. This release involved no new database migration: all 27 canonical migration records (000–026) were restored, verified, and audited during the project migration.

### Changed
- Migrated production database, Auth, and Storage infrastructure to Singapore (`ap-southeast-1`), placing services closer to the primary user base.
- Updated application release metadata in `lib/version.ts`, `package.json`, and `package-lock.json` to version `1.1.1` (`Singapore Infrastructure Migration`).
- Updated release metadata displayed by the existing release notification dialog to present Singapore Infrastructure Migration highlights to returning users.
- Updated semantic version synchronization and release-state lifecycle unit tests for version `1.1.1` and date `2026-09-01`.

---

## [1.1.0] - 2026-08-28

Application-only release deployed to Vercel production at merge commit `7071fa0` and verified through production smoke testing. No Supabase migration was required.

### Added
- Authoritative user-facing release metadata module (`lib/version.ts`) synchronised with `package.json` at version `1.1.0`.
- Visible, accessible semantic version display in the authenticated application shell footer (`Atlas v1.1.0`).
- Accessible, latest-only "What's New" release update notification dialog (`components/whats-new-modal.tsx`) with client-safe `localStorage` dismissal persistence, focus trap, Escape key handling, and background scroll locking.
- Pure release state helpers (`lib/release-state.ts`) for safe storage access and version comparison.
- Agent workflow and version-control discipline rules added to `AGENTS.md`.
- Meaningful component structural tests in `tests/mission-layout.test.ts` verifying responsive 2-tier layout markup, long title/description rendering, Replace, and Undo controls.
- 14 new unit tests covering version synchronization, release notification state and safe storage access, and mission layout component structure (112 unit tests total).

### Fixed
- Fixed Dashboard mission cards failing to reflow while a desktop or split-screen window was resized. Cards now query their own available inline size, switch to a flexible 2-tier layout at ≤640px, and retain the existing mobile overflow protections.
- Allowed long mission titles and descriptions to wrap cleanly (`overflow-wrap: break-word`) without overflowing the document.
- Wrapped the Daily Missions header and "Generate / Refresh" controls cleanly on narrow viewports.
- Enforced ≥44px touch height on the header Atlas logo link.
- Enforced ≥44×44px touch target on the "Configure {subject}" route selection button in `RouteSelectionBanner`.

---

## [1.0.0] - 2026-08-27

### Added
- **Production Performance & Mobile Responsiveness (Phase 2.11 — commit `39427dd`):**
  - Implemented optimistic AS/A2 paper-stage tagging with synchronous in-flight duplicate prevention (`inFlightRef`), per-paper pending saving state, double-click and conflicting stage click prevention, and automatic error rollback.
  - Hardened `assignPaperStage` Server Action with runtime Zod schema validation (UUID and `'as' | 'a2'`), row-count update verification (`.select('id')`), untagged row restriction (`.is('stage', null)`), and safe user-facing error messages.
  - Locked paper card actions (navigation, edit, delete) while a stage update is saving, and populated edit modals with `effectiveStage ?? 'as'`.
  - Created lightweight client state island (`PaperStageProvider` & `lib/papers-state.ts`) synchronising tagging prompt and attempts list while keeping charts and page shell server-rendered.
  - Established a single current-page reconciliation path using Server Action cache revalidation without redundant client-side `router.refresh()` calls.
  - Streamlined Past Papers data fetching on the "All" view by deriving untagged papers directly from the full paper query, saving a database round trip during page loads while preserving global untagged queries on filtered views.
  - Redesigned navigation header with explicit CSS Grid areas to ensure exact desktop order (`logo` → `nav` → `user`) and mobile 2-tier layout (`logo` + `user` on row 1, `nav` on row 2).
  - Enforced mobile touch target compliance (≥44×44px) across navigation links, sign-out, filter tabs, tagging buttons, paper action icons, form inputs, and chapter status/confidence toggles.
  - Resolved mobile horizontal page overflow (`scrollWidth <= clientWidth`) across 320px, 375px, 390px, 768px, and desktop widths on Dashboard, Subjects, Subject Details, and Past Papers.
- **Application Performance Round 2 & State Reconciliation (Phase 2.10):**
  - Single-source-of-truth client-side dashboard state management (`DashboardView`) with immediate atomic mission feedback and state reconciliation across missions, XP, levels, and streaks.
  - Replaced `getUser()` in the proxy with `getClaims()` and explicit JWT claims validation, preserving Supabase cookies across redirects.
  - Server-side onboarding layout guard (`app/(auth)/onboarding/layout.tsx`), preserving Client Component architecture for `app/(auth)/onboarding/page.tsx`.
  - Added pure piecewise `computeLevel()` and Level 15 title `Mythic` in `lib/xp.ts` matching PostgreSQL definitions.
  - Converted Past Papers subject filter tabs to Next.js `Link` components with automatic prefetching and `aria-current`.
  - Added `@vercel/speed-insights` for real-user Core Web Vitals performance telemetry.
- **Subject Enrollment Management (Migration 026 — Applied to Hosted Supabase):**
  - Added an “Add or remove” subject manager that offers only the five supported MVP subjects for new enrollment.
  - Added a required removal confirmation describing the exact preservation behavior.
  - Archived removals rather than deleting enrollments, preserving chapter progress, paper history, completed missions, route configuration, and XP.
  - Enforced a maximum of five active subjects and prevented removal of the final active subject at both application and database boundaries.
  - Skipped pending missions for archived subjects and restored the same enrollment ID when a supported subject is re-added.
  - Restricted direct enrollment membership mutations so add/archive changes must pass through the guarded RPCs while exam-date, target-grade, and priority edits remain available.
  - Added 21 pgTAP regression tests and 3 unit tests.
- **Dashboard Statistics Hotfix (Migration 025 — Applied to Hosted Supabase):**
  - Restored user-local `days_until` values in `get_user_dashboard_stats` after Migration 024 omitted the field.
  - Returned an effective current streak of zero when the stored last-activity date is older than yesterday, without changing the historical longest streak.
  - Added defensive countdown formatting so missing or invalid values never render as `undefinedd`.
  - Added 7 pgTAP regression tests and 2 unit tests.
- **Application Performance & Dashboard Polish (Phase 2.9):**
  - Reused authenticated user and profile reads within each server render instead of repeating the same Supabase validation across layouts and page loaders.
  - Used the dashboard aggregate for Subjects-page readiness, removing per-subject readiness network round trips.
  - Removed the redundant dashboard chapter-count query now that Migration 025 returns `has_chapter_data`.
  - Added immediate route-level loading skeletons and deferred Past Papers charts and paper-entry forms from the initial client bundle.
  - Removed render-blocking third-party font requests in favour of a deterministic system-font stack.
  - Added clock-skew tolerance to the mission Undo control while leaving PostgreSQL as the authority for the 10-minute rule.
  - Distinguished “some subjects are missing exam dates” from the true no-dates state.
- **Five-Subject MVP Syllabus Content & Subject Availability (Migration 024 — Applied and Hosted-Verified):**
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
- **Mission Quality, Workload & Variety Balancing (Migration 023 — Applied to Hosted Supabase):**
  - Added `estimated_minutes` column to `daily_missions` (CHECK 5–120 mins) and backfilled existing missions with sensible duration estimates (10–60 mins).
  - Constrained `user_settings.max_missions_per_day` to 1..3 (default 3) and backfilled existing settings > 3 to 3.
  - Overhauled `generate_daily_missions` algorithm: max 2 missions per subject across active budget, no duplicate target entities on the same date, balanced category rotation, and bite-sized action titles.
  - Added atomic, pre-validated `replace_mission` RPC with row locking (`FOR UPDATE`) and candidate availability validation.
  - Added quiet UI duration display with `<Clock /> ~X min` and secondary "Replace" button with specific loading state and propagation isolation.
- **AS/A2 Database Foundation & Flow (Migrations 020–022 — Applied to Hosted Supabase):**
  - Applied and verified Migration 020 with `study_route`, `current_stage`, `a2_unlocked_at`, and `a2_unlock_method` columns on `user_subjects`; `stage` on `chapters` and `past_papers`; `subject_paper_selections` and `subject_stage_results` tables with RLS; enum types and indexes.
  - Added route selection UI (`RouteSelectionBanner`, `RouteSetupSheet`) and Onboarding Step 4 for choosing AS only, Staged A Level, or Full A Level per subject.
  - Added paper combination selection (`PaperSelectionPanel`) for Mathematics (Pure 1/Pure 3/Mechanics/Statistics).
  - Implemented stage-aware readiness calculation via PostgreSQL `compute_readiness_score(user_id, subject_id, stage)` RPC.
  - Added separate AS and A2 readiness displays across dashboard and subject pages; removed averaged readiness hero chip.
  - Added A2 transition modal supporting standard AS result entry with carry-forward validation and early manual unlock.
  - Tracked mission completion attempts via `daily_missions.completion_attempt` and returned detailed XP breakdowns (`mission_xp`, `daily_bonus_xp`, `achievement_xp`, `total_xp_awarded`, `new_total_xp`).
  - Added atomic mission undo reversing mission XP, daily completion bonus, and attempt-linked achievements.
  - Added atomic onboarding subject selection via `set_onboarding_subjects` RPC.

### Fixed
- Replaced inconsistent application-side readiness calculation with database-level single source of truth.
- Prevented unconfirmed and inaccessible subject chapters from generating daily missions.
- Tightened `carry_forward = TRUE` constraint to require both `stage = 'as'` and `result_type = 'actual'`.
- Corrected onboarding and subject settings so Further Mathematics requires a valid paper route and fixed-route subjects receive their canonical paper selections.
- Replaced decorative gradients, glows, emoji icons, colour dots, and unnecessary card groups with a restrained neutral interface and one shared action accent.
- Reconciled Migration 024 acceptance counts to 68 migration-specific and 173 total database tests.
- Corrected expired streaks being displayed as active until the next mission action recalculated them.
- Corrected dashboard subject-readiness cards rendering `undefinedd` when `days_until` was absent.
- Corrected the mission Undo control being hidden until refresh when the hosted database clock was slightly ahead of the browser clock.
- Corrected the dashboard claiming that no exam dates were set when only one enrolled subject lacked a date.

### Known Issues & MVP Limitations
- One transient failure was observed on the first production Google sign-in attempt; subsequent sign-ins succeeded and no browser console errors were recorded. Continue monitoring authentication logs.
- Non-MVP subjects (such as Biology 9700) are flagged as unavailable (`is_available = FALSE`) for new onboarding while preserving grandfathered enrolments.
- Migrations 025–026 and their matching application changes are deployed. The production subject manager has been checked through the non-destructive confirmation/cancel path; a live remove-and-re-add preservation exercise has not been performed.

---

## [0.1.0] - 2026-08-26

### Added
- Project folder structure initialization.
- Complete Database Schema via Supabase migrations (000 to 012).
- Tables created: profiles, subjects, user_subjects, chapters, user_chapters, past_papers, paper_question_attempts, daily_missions, xp_events, streaks, user_achievements, google_docs_tokens, notifications, user_settings.
- Future stub tables: friendships, friend_requests, study_pets, pvp_challenges, challenge_progress, ai_coach_conversations, ai_coach_messages, user_currencies, shop_items, user_inventory.
- Full suite of Row Level Security (RLS) policies.
- Initial seed data for CAIE A-Level subjects and 20 achievement definitions.
- PostgreSQL Functions for XP management, daily mission generation, and readiness score calculation.
- System design documentation (`docs/` directory).
