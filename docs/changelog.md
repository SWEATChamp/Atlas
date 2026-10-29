# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.2] - 2026-10-28

### Fixed
- **Route- and Stage-Aware Subject Progress Totals**:
  - Scoped subject progress summaries, headline totals, completed chapter counts, in-progress chapter counts, and average confidence levels to chapters accessible under the learner’s configured route, current stage, and normalized paper selections.
  - Component header badges (`completed/total`) in `ChapterGroups` now evaluate only accessible chapters (`isAccessible !== false`), preventing locked or unselected historical chapters from inflating totals.
- **Robust Subject Data Loading & Error Presentation**:
  - Clear separation between query failures and legitimate empty enrollment/progress states across `getSubjectsWithProgress` and `getSubjectDetail`.
  - Added dedicated `/subjects` error boundary (`app/(app)/subjects/error.tsx`) with retry support (`unstable_retry`) and accessible failure presentation, avoiding misleading empty progress or missing enrollment displays during database or RPC outages.
- **Reliable Optimistic Notes-Status & Confidence Updates**:
  - Serialized single-flight mutation queues in `ChapterRow` with strict request ordering, rollback to the last confirmed server value upon failure, and accessible error banners.
  - Reconciles refreshed server props only when idle, preventing late or stale prop refreshes from overwriting in-flight optimistic state or rollback baselines.
  - Maintained independent mutation queues and error states for notes-status and confidence levels.
  - Ensured stable `ChapterRow` component identity across prop revalidations.
- **Readiness Test Fixture Repair**:
  - Repaired synthetic `subject_papers` fixture rows in `supabase/tests/database/as_a2_readiness.test.sql` to include canonical attributes (`name`, `code_suffix`, `stage_behavior`, `default_stage`) and normalized paper selections, resolving legacy fixture failures in tests 3, 4, and 5.
- **Expanded Regression Coverage**:
  - Added `tests/chapter-row-mutation.test.tsx` exercising rapid status/confidence cycling, queue serialization, late stale prop arrival, rollback baseline preservation, and failure alerts through the real `ChapterGroups` parent.
  - Added `tests/chapter-summary-accuracy.test.ts` asserting route-aware summary counts and error boundary propagation.

### Verification Evidence
- Complete integrated application test suite: 594 tests passed with six intentional live-network skips (`npm test`).
- Database verification: All nine TAP suites passed (600 planned assertions, 600 passed, 0 failed) in a uniquely isolated disposable local container (`public.ecr.aws/supabase/postgres:17.6.1.140`).
- AS/A2 readiness verification: 27/27 assertions passed against both Migration 032 and Migration 033 schemas.
- Authenticated read-only browser smoke testing passed on the final integrated v1.3.2 PR Preview at application commit `65f4500daa856dd97ba0182da8e887ff632e98aa`: the v1.3.2 release notice and footer rendered correctly; Dashboard, Subjects, Mathematics route-aware chapter totals, Stats, and Logs loaded without error boundaries or browser console warnings/errors. No data-changing controls were exercised.

### Production Deployment & Scoped Smoke Verification
- **Production Deployment (2026-10-28)**:
  - Merged PR #35 into `main` at merge commit `020b374335850e0544d8549b1d65043c98c3a5c8` (PR head `cc17e5b0a61c36e40f01a3526f697cd94efae2eb`) on 2026-10-28 at 10:43:44 AM Singapore time.
  - Automatic Vercel Production deployment reached `Ready` in Singapore (`sin1`) on 2026-10-28 at deployment URL `https://atlas-a47e6z3in-atlas-726e.vercel.app` (GitHub Deployment record: `7375775851`; canonical: `https://atlas-alpha-vert.vercel.app`; inspector: `https://vercel.com/atlas-726e/atlas/6QRpoU3rd6VY1PSiMo81fE4SMd2z`).
- **Authenticated Read-Only Production Smoke Verification (2026-10-29)**:
  - Completed on 2026-10-29 (Singapore time) by the primary orchestrator:
    - Version/footer and release notification banner display `1.3.2`, title `Progress Reliability & Recovery`, and all three user-facing bullets.
    - Dashboard and Subject Readiness loaded cleanly.
    - Subjects list loaded without error boundaries.
    - Mathematics route-aware totals verified: 13 accessible chapters, Pure 1 `0/8`, Statistics 1 `0/5`, locked Pure 3 and Mechanics `0/0`.
    - Stats workspace loaded cleanly.
    - Full Papers and Question Practice Logs workspaces loaded cleanly.
    - Existing paper detail loaded cleanly.
    - Canonical hostname retention verified.
    - Zero captured browser console warnings or errors.
    - No data-changing controls were exercised.

### Limitations & Verification Boundaries
- **Unverified Scopes in Production**:
  - No mission, enrollment, route, target-grade, exam-date, notes-status, confidence, paper, or practice-record mutation was tested in Production.
  - Cross-user data isolation was not tested in Production.
  - Full automated authentication-flow E2E and optional live Cambridge verification remain outstanding.
  - This release introduced no database migrations.
  - The release notice was restored by resetting only the browser-local dismissal key; no server state changed.

## [1.3.1] - 2026-10-25

### Fixed
- **Stats Workspace Loading Stability**:
  - Improved Stats loading-layout stability. Aligned loading skeleton and loaded summary geometry contracts using container-driven inline-size sizing across compact, mobile, and wide viewports.
  - Corrected trend legend item line-height from fixed pixels to font-relative (`1.6em`), eliminating subpixel discrepancy with rendered badge typography.
  - Measured Preview results on commit `5fcd07d`: 0px movement for both target headings (Score trend and Chapter & Topic Accuracy) and no horizontal document overflow at 313, 460, and 1154px.
- **Narrow-Screen Layout & UI Consistency**:
  - Improved narrow-screen statistics-card layout, preventing text and metric overflow on constrained screens while preserving complete numerical evidence.
  - Full-paper logging defaults to the selected subject.
  - Corrected single-attempt evidence-disclosure wording.

### Production Deployment & Scoped Smoke Verification
- **Production Deployment (2026-10-25)**:
  - Merged PR #34 into `main` at merge commit `5526fbf4f0590a183fcf1bfa63a70fa6391fadd8`.
  - Automatic Vercel Production deployment `dpl_3NVYwUMWRomp6ESfA8RrK43JVBuo` reached `Ready` in Singapore (`sin1`) on 2026-10-25 (Singapore time) at canonical URL `https://atlas-alpha-vert.vercel.app`.
- **Authenticated Read-Only Production Smoke Verification (2026-10-26)**:
  - Verified by the primary orchestrator:
    - Version/footer and release notification banner display `1.3.1`.
    - Release notification dismissal persists across subsequent page visits and navigations.
    - Navigation between `/stats` and `/logs` passed without console errors.
    - The legacy `/past-papers` listing redirect cleanly preserved the selected subject.
    - Subject switching operates cleanly across repeated visits.
    - Both logging dialogs open cleanly without form submission.
    - Full-paper logging dialog defaults to the selected subject (Mathematics).
    - Zero captured browser console warnings or errors.
    - At 313 CSS pixels, cold Mathematics subject switch measured 0px movement for both target headings (Score trend and Chapter & Topic Accuracy) and 0px horizontal document overflow.

### Limitations & Verification Boundaries
- **Unverified Scopes in Production**:
  - No record creation, editing, deletion, or tagging workflows were exercised in Production.
  - No populated question-history or pagination testing was performed in Production.
  - Cross-user data isolation was not tested in Production.
  - Wider Production viewport widths (e.g. 320px, 375px, 394px, 460px, 640px, 641px, 1154px) were not explicitly measured on Production.
  - Exact intermediate viewport widths (320px, 375px, 394px, 640px, 641px) were not measured on Preview; earlier multi-viewport Preview measurements (313px, 460px, 1154px) retain their specific commit attribution to Preview commit `5fcd07d`.
  - Long-content sets exceeding container capacity expand naturally without clipping; layout shifts are not universally guaranteed to be zero for arbitrary text lengths.
  - Multi-subject legend series badges in All view expand dynamically with recorded subject data.
  - Transitioning to subjects with zero attempts collapses from the skeleton to the compact empty message card.
  - This release required zero database migrations.

## [1.3.0] - 2026-10-21

### Added
- **Question Practice & Paper Logging (Milestone 4)**:
  - Separate full-paper and standalone question-practice logging with distinct history tracking and attempt trends.
  - Required multi-chapter mapping (1–200 valid chapters) for question practice with support for single or grouped topical, past-year, or mixed items.
  - Optional question provenance (year, series, paper, variant, question number, duration, notes).
  - Dedicated Stats workspace (`/stats`) with subject-level analytics, score trends, and chapter accuracy breakdowns.
  - Dedicated Logs workspace (`/logs`) with separate full-paper and question practice attempt streams, modal workflows, and URL-driven pagination (`page` query parameter) for question-practice history.
  - Navigation redesign: Updated topbar and sidebar navigation to feature Subjects, Stats, and Logs; the `/past-papers` listing now cleanly redirects (`RedirectType.replace`, HTTP 307) to `/logs`, while existing paper-detail pages remain accessible.
  - Dual performance indicators on `/stats`: Predicted Exam Mark (mark-weighted average strictly per subject/stage with factual evidence volumes, explicitly non-official estimate) and Canonical Readiness Score (35% notes, 40% papers/practice, 25% confidence, with locked A2 readiness isolated as null).
  - Authenticated Stats API endpoint (`GET /api/stats`): Serves chapter accuracy breakdowns and subject indicators with `Cache-Control: private, no-store, max-age=0`.
  - Bounded in-memory client session caching with user-isolation safeguards, request sequence counters, and mutation-driven cache invalidation to improve subject-switching responsiveness across repeated tab visits.
  - Database Migrations 031 (`20261014000031_practice_sessions_foundation.sql`), 032 (`20261016000032_practice_mapping_validation.sql`), and 033 (`20261017000033_a2_practice_logging_and_indicators.sql`) creating separate practice sessions schema, strict `SELECT` only table grants for authenticated clients, RPC contracts, chapter validation, and A2 logging support (applied in Preview project `eiyrzzcmljhrucazgxpm` and applied to Production Singapore Supabase `uvprmojmscndtwgkvjbi` on 2026-10-21 under Gate 3; PR #32 merged at `d277d40` and deployed to Production on 2026-10-21).

### Fixed
- Improved subject switching responsiveness on Stats and Logs via optimistic active-tab selection, parallelized server-side reads, and client session caching.
- Resolved race conditions on rapid tab switching using monotonic request counters and active subject validation.
- Fixed loading skeleton persistence bug where overview prop reconciliation superseded pending requests without restarting lower sections.
- Repaired session cache ownership initialization so cache is properly scoped to the authenticated user on fresh component mounts.
- Corrected route remapping and stage preservation edge cases during practice logging.

### Deferred
- Minor cosmetic tweaks on Stats and Logs (non-blocking visual refinements) are deferred to patch release v1.3.1.

## [Operational] - 2026-10-01

### Added
- **Milestone 3 Production Cron Activation (PR #30)**:
  - Activated daily Cambridge grade-threshold discovery schedule on Vercel (`0 7 * * *` UTC) targeting `/api/cron/grade-threshold-discovery`.
  - Added `tests/vercel-cron-config.test.ts` to enforce the single discovery cron configuration and assert that mutating route `/api/cron/grade-thresholds` remains unscheduled and dormant.
  - Executed and verified first authorized Production invocation via Vercel native cron Run control (`dpl_5x3V5hGMkf8vbRwYgtyMjqsiVhg4` on `sin1`, CLI trigger initiated at 06:23:19.351Z, serverless runtime log event recorded at 06:23:19.625Z UTC / `1790835799625`), emitting exactly one sanitized `grade_threshold_discovery_executed` structured runtime log with healthy outcome `no_change` across all 5 MVP subjects (HTTP 200, 4612ms). The discovery route is designed and structurally tested to avoid Supabase and mutating modules, and no elevated Supabase server credential is configured for the discovery job (the function log was not a database audit).

## [1.2.1] - 2026-09-30

### Fixed
- **Bug Fix: Subject Route Display**:
  - Selected Mathematics papers now map to the correct Subject Route chapter groups.
  - Statistics 1 remains available during staged AS study, while Pure 3 and Mechanics stay locked until A2.
  - Selected papers now appear before unselected components, with AS papers listed ahead of A2 papers.
- **Least-Privilege Database Grants (Migration 029, PR #25)**:
  - Removed effective `TRUNCATE`, `TRIGGER`, `REFERENCES`, and PostgreSQL 17+ `MAINTAIN` privileges from `PUBLIC`, `anon`, and `authenticated` across public relations.
  - Removed all anonymous and `PUBLIC` writes, reduced authenticated table-level writes to the six approved operation pairs, and retained only the approved `user_subjects` column updates.
  - Locked sensitive internal, import-audit, ledger, RPC-managed, and catalogue relations to their reviewed client boundaries while preserving required `service_role` administration.
  - Hardened default privileges for future `postgres`-owned public relations and reloaded the PostgREST schema cache after the hosted migration.
  - Verified the hosted Singapore rollout with 23/23 rollback-only pgTAP assertions, unchanged critical row counts, synchronized migration history through 029, and a successful Production deployment from merge commit `d89e9a2441d5792959d8f786701ff46788da5a6e`.
- **Route Remapping Integrity & Stage Preservation (Migration 028, PR #22)**:
  - Fixed `configure_subject_route` to preserve `current_stage = 'a2'` and A2 unlock metadata when an already-staged student re-saves or switches paper combinations within the staged route.
  - Hardened `transition_to_a2` with canonical continuation mapping, explicit paper selection support (`p_paper_selections`), Continuation Preservation Rule enforcement, and atomic rollback on invalid route transitions.
  - Added explicit handling for Mathematics Pure 2 (`p1_p2`), blocking automatic transition without valid staged paper selections and requiring explicit valid selection.
  - Preserved existing paper selections for custom/unsupported subjects transitioning without replacement selections.
  - Verified with 23/23 hosted pgTAP database tests and 78 client/server unit and integration tests.

---

## [1.2.0] - 2026-09-02

UI foundation and accessibility release merged via PR #12 at merge commit `abed20ba325e99113813a8860be7f4a22c1fc39c` (with release-closeout merge commit `a4ea17993e0f9250eb1c50a41d930a8c4f5a4d2c`, annotated tag object `1c4524fcd1f747a7e00674d7c0aa8551f2180d94`, and published [GitHub Release](https://github.com/SWEATChamp/Atlas/releases/tag/v1.2.0)), deployed to Vercel production (`9RCwZ6xAY7ohAqxNn2msJzcCXcUi` and documentation deployment `8shqSC2QMjNVMsVn6ABoc36xWvm4` on `https://atlas-alpha-vert.vercel.app` via Singapore `sin1`), and verified through authenticated production smoke testing. This release involved zero database migrations.

### Added
- Accessible dependency-free `Dialog` primitive (`components/ui/dialog.tsx`) supporting accessible name/description associations (`titleId`, `descriptionId`), initial focus management, circular focus trapping (Tab/Shift+Tab), Escape key dismissal, universal focus restoration on every closure path/unmount (`previousActiveElementRef`), body scroll locking, and 44×44px touch targets.
- Two-step Subject controls guide dialog (`components/subjects/subject-controls-guide.tsx`, `components/subjects/subject-guide-launcher.tsx`) lazy-loaded on Subject detail views. Features versioned dismissal persistence (`atlas_subject_controls_guide_v1`), safe storage accessor (`lib/storage.ts`), coordination with What's New modal to prevent competing auto-opens, exact copy for confidence ratings and notes status tracking, visual 5-star example representations, "Step 1 of 2" / "Step 2 of 2" indicators, and a permanently visible "Guide" button beside Chapters.
- Canonical shared mappings for chapter controls (`lib/subject-controls.ts`, `lib/subject-guide-state.ts`) ensuring status cycle (`none → in_progress → complete`), labels ("Not started", "In progress", "Complete"), and 1–5 confidence levels remain synchronized across UI and guide.
- Semantic one-way complete action `<button type="button" aria-label="Complete mission: ...">` with minimum 44×44px touch targets for `MissionCard` completion, and separate `Undo` button.
- Keyboard-operable `PaperCard` with accessible semantic link (`<Link href="...">`) and independent edit and delete buttons.
- Native radio semantics and connected form labels on `RouteSetupSheet` (`<input type="radio">` with `<label>`) and `A2TransitionModal`.
- Request caching via `React.cache()` on `getPaperDetail()` and `getSubjectDetail()` to deduplicate server reads during metadata generation and page rendering.
- Accessible progress attributes (`role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext`) across `XpLevelBar`, `SubjectReadinessList`, and readiness progress bars.
- Universal Framer Motion reduced-motion support via `<MotionProvider>` wrapping the app in `<MotionConfig reducedMotion="user">` and `useReducedMotion()` hooks.
- Live region toast announcements (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`) on `DashboardView`.
- Comprehensive unit test suites in `tests/subject-controls-guide.test.ts`, `tests/accessibility-semantics.test.ts`, `tests/release-notification.test.ts`, and `tests/version-sync.test.ts` verifying auto-opening, dismissal, versioning, safe/throwing storage fallback, modal auto-open coordination, rendered HTML structure, canonical status order, confidence levels, touch targets, and accessible radio/action semantics (134 tests across 17 files passing).
- Established `goal.md` as the tracked, authoritative master product plan for product direction, milestone objectives, calculation rules, and verification standards.

### Changed
- Refactored `WhatsNewModal`, `LogPaperModal`, `SubjectManager`, `A2TransitionModal`, and `RouteSetupSheet` to use the accessible `Dialog` primitive.
- Global design system cleanup (`app/globals.css`): unified `--border-accent`, `.btn-icon` min 44×44px touch target, deduplicated skeleton styles, and comprehensive `@media (prefers-reduced-motion: reduce)` rules for animations, transitions, and loading shimmers.
- Flattened Dashboard and Subject sections: removed redundant nested cards, replaced decorative emoji interface elements with Lucide icons (e.g. Star, CheckCircle2), and aligned colors to restrained neutral-dark with muted slate-blue accents.
- Responsive app header and 320px viewport resilience: prevented user display name truncation overflow on narrow viewports while maintaining 44px mobile touch targets.
- Verified through Preview deployments (`ApihahfPteHbQwYg5je6dVa8AymT`, `7qSYmzFZLnK8nKioamjB7kDgEhtF`, `ESWA1crtAKir5rpNbeAUYdSvGK1n`) and authenticated Production smoke testing on Vercel (`9RCwZ6xAY7ohAqxNn2msJzcCXcUi`):
  - Verified returning-user release update dialog displayed version `1.2.0`, title `Accessible UI Foundation & Subject Controls Guide`, and all four approved highlights.
  - Verified upgrade notification appears for returning users upgrading from `1.1.1`.
  - Verified release notification dismissal persists across page reload.
  - Verified visible `Atlas v1.2.0` in the authenticated application footer.
  - Verified Sign In followed by authenticated Dashboard, Subjects, Subject details, Past Papers, and paper details loading correctly.
  - Verified Subject controls guide first-visit auto-open, Next/Back navigation, Escape key dismissal, return focus to the Guide launcher, manual reopen via "Guide" button beside Chapters, and dismissal persistence across reload.
  - Verified zero horizontal overflow across 320px, 375px, 390px, 768px, and 1280px viewports on Dashboard, Subjects, and Past Papers.
  - Verified Past Paper detail view loaded correctly and separately passed the 320px overflow and touch-target check.
  - Verified minimum 44×44px touch targets across touch-oriented layouts from 320px through 768px.
  - Verified zero browser console warnings or errors and zero study-record modifications.

---

## [1.1.1] - 2026-09-01

Operational patch release deployed to Vercel production at merge commit `7b2203f` and verified through production smoke testing. Migrated Atlas database, authentication, and backend services from Sydney (`ap-southeast-2`) to Singapore (`ap-southeast-1`). This release involved no new database migration: all 27 canonical migration records (000–026) were restored, verified, and audited during the project migration.

### Changed
- Migrated production database, Auth, and Storage infrastructure to Singapore (`ap-southeast-1`), placing services closer to the primary user base.
- Updated application release metadata in `lib/version.ts`, `package.json`, and `package-lock.json` to version `1.1.1` (`Singapore Infrastructure Migration`).
- Updated release metadata displayed by the existing release notification dialog to present Singapore Infrastructure Migration highlights to returning users.
- Updated semantic version synchronization and release-state lifecycle unit tests for version `1.1.1` and date `2026-09-01`.

---

## [1.1.0] - 2026-08-28

Application-only release deployed to Vercel production at merge commit `7071fa0` and verified through production smoke testing. The release-closeout and tagged production commit is `5a8d69e6ee96cdcfb3c4e71e5c499222421164f8`. The `v1.1.0` Git tag is present, while the GitHub Release object is currently absent. No Supabase migration was required.

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
