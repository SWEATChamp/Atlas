# Architecture Overview

## System Overview
Atlas is an early private-pilot application designed as a revision operating system for Cambridge International AS & A Level students. It combines syllabus progress, paper performance, route-aware readiness, and daily study missions in one dashboard.

## Tech Stack
- **Framework**: Next.js 16 App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS import, project CSS tokens, and Framer Motion
- **UI Components**: Lucide icons and Recharts
- **State Management**: React component state, Server Components, and Server Actions
- **Validation**: Zod at application boundaries and PostgreSQL constraints at the database boundary
- **Backend as a Service (BaaS)**: Supabase
- **Database**: PostgreSQL (managed by Supabase)
- **Deployment**: Vercel

## Interface Direction

Atlas uses a restrained, academic visual system: neutral dark surfaces (`#121417`, `#181b20`, `#1f2329`), one muted slate-blue action accent (`#7f9fbe` / `#9bb5ce`), solid fills, and Lucide icons. Subject colours are reserved for subject identity dots and data visualisation. Cards are used for independently actionable or grouped content, not as a nested wrapper for every text block. Decorative gradients, glow effects, emoji icons, multicoloured navigation, and unlabeled status dots are excluded from the current interface.

## Accessible Overlay & Dialog Primitive Architecture (v1.2.0)

Atlas provides a lightweight, dependency-free `Dialog` component (`components/ui/dialog.tsx`) to unify modal and overlay behaviors across the application:
- **Accessible Name & Description**: Enforces `role="dialog"` and `aria-modal="true"`, wired to `titleId` (`aria-labelledby`) and optional `descriptionId` (`aria-describedby`).
- **Focus Management & Trap**: Automatically focuses `initialFocusRef` (or the dialog container) upon opening, and traps keyboard focus within the modal via circular Tab / Shift+Tab cycling across all tabbable elements.
- **Escape & Backdrop Handling**: Closes immediately on `Escape` keypress or clicking the backdrop surface.
- **Focus Restoration**: Caches `document.activeElement` when opened and automatically restores focus to the trigger button when closed.
- **Scroll Locking**: Disables background document scroll via `document.body.style.overflow = 'hidden'` while the dialog is open and restores original overflow styles on unmount.
- **Touch Target & Viewport Compliance**: Minimum 44×44px touch targets on close and action buttons, with responsive `max-height: min(90vh, calc(100dvh - 32px))` and internal scroll containment to prevent viewport overflow on 320px screens.

## Subject Controls & Guide Architecture (v1.2.0)

Atlas implements a two-step Subject controls guide (`components/subjects/subject-controls-guide.tsx`) and canonical shared mappings:
- **Canonical Mappings (`lib/subject-controls.ts`)**: Defines single source of truth for notes status cycle (`none → in_progress → complete`), status labels ("Not started", "In progress", "Complete"), and 1–5 confidence rating descriptions.
- **Versioned State Persistence (`lib/subject-guide-state.ts`)**: Manages dismissal tracking under key `atlas_subject_controls_guide_v1`. Wraps `localStorage` access safely in `try/catch` and maintains an in-memory session cache so private browsing restrictions or quota errors do not cause runtime errors or repeated interruptions.
- **Launcher Island (`components/subjects/subject-guide-launcher.tsx`)**: Minimal client launcher embedded beside the Chapters section header. Automatically opens on first unseen visit, and provides a permanently visible text-labeled "Guide" button for manual reopening at any time.
- **Lazy Dialog Bundle**: Dynamically imports the guide modal (`LazySubjectControlsGuide`) to ensure zero impact on the initial subject page bundle.

## Data Flow
The current data flow is:
Server or Client Component → Next.js Server Action or authenticated Supabase client → PostgreSQL with Row Level Security and guarded RPCs. Mutations revalidate affected routes; the current application does not depend on React Query caching.

## Timezone Handling

The app detects the browser's IANA timezone during onboarding and when a signed-in user opens the app. PostgreSQL uses that saved timezone to decide the user's current calendar date. Daily missions, streaks, daily achievements, exam countdowns, and automatic exam archiving therefore change at the user's midnight rather than the database server's midnight. Invalid or missing values fall back to UTC.

## Authentication Flow & Proxy Route Guarding (Phase 2.10 — Deployed)

Atlas uses Supabase Auth with Google OAuth. Email/password UI and Google Docs synchronisation are not part of the current MVP flow.

- **Proxy (`proxy.ts`)**:
  - Validates request identity using `supabase.auth.getClaims()` and explicit JWT claims validation (`claims.sub`).
  - Removes the per-request PostgREST lookup of `profiles.onboarding_completed` from proxy routing. Depending on token, key-cache, and refresh conditions, `getClaims()` may still use Supabase Auth infrastructure.
  - Automatically preserves and pipes modified Supabase cookies across all internal rewrites and redirects.
  - Excludes static assets and `/api/auth/callback` from route gating.
- **Server-side Onboarding Guard (`app/(auth)/onboarding/layout.tsx`)**:
  - Enforces onboarding status on the server: redirects unauthenticated users to `/login?next=/onboarding` and already-onboarded users directly to `/dashboard`.
  - Preserves `app/(auth)/onboarding/page.tsx` as a pure Client Component.

## Dashboard Architecture & State Reconciliation (Phase 2.10 — Deployed)

Atlas employs a single-source-of-truth client-side state model on the dashboard (`components/dashboard/dashboard-view.tsx`):

- **Immediate Feedback & State Reconciliation**:
  - `MissionCard` manages immediate optimistic interaction feedback while calling Server Actions.
  - Upon RPC completion (`complete_mission`, `undo_mission_completion`, `replace_mission`), `DashboardView` atomically updates missions, user XP, level, level title, and current streak simultaneously.
  - On mission undo, if other completed missions remain today, `active_today` remains `true` and `last_date` remains today; if no other completed missions remain, `active_today` reverts to `false` and `last_date` reverts to yesterday (for `streak > 0`) or `null` (for `streak = 0`).
  - Longest streak history is strictly preserved against decrease during undo operations.
  - Temporary limitation: Non-mission activity on the same calendar day (e.g. a past paper attempt logged prior to mission undo) is reconciled asynchronously via the subsequent background `router.refresh()` without requiring an unreviewed database migration.
  - In the event of an RPC error, `MissionCard` and `DashboardView` display inline and toast errors and immediately roll back local visual state, preventing UI/database desynchronization.
  - `router.refresh()` executes non-blockingly in the background for eventual consistency.
- **XP Progression & Levelling (`lib/xp.ts`)**:
  - TypeScript `computeLevel()` mirrors PostgreSQL `compute_level(p_total_xp)` piecewise across all 15 level thresholds (100 to 25,000 XP).
  - Level 15 title `Mythic` matches PostgreSQL `compute_level_title`.
  - `completeMission` derives level-up status purely in TypeScript using atomic `total_xp_awarded` and `new_total_xp`, removing the redundant post-completion profile query.

## Performance & Real-User Monitoring
- Next.js Turbopack compiler.
- Core Web Vitals telemetry captured via `@vercel/speed-insights` in `app/layout.tsx`.
- Heavy visual elements (e.g. Recharts in Past Papers) loaded lazily with loading skeletons.
- Navigation links in Past Papers filters use Next.js `Link` elements with automatic prefetching and `aria-current="page"`.

## Past Papers Optimistic State & Responsive Island (Phase 2.11 — Deployed)
Atlas uses a focused client state island on Past Papers (`components/papers/paper-stage-provider.tsx`) with pure state reduction (`lib/papers-state.ts`):
- **Immediate Visual Feedback & In-Flight Guard**: Clicking "Tag AS" or "Tag A2" is protected by a synchronous `inFlightRef` guard that prevents double-clicks, conflicting stage clicks, and concurrent actions. The row enters a pending "Saving AS…" state and updates the matching `PaperCard` badge synchronously in the Attempts list.
- **Hardened Server Action Validation**: `assignPaperStage` runtime-validates input with Zod (`UUID` and `'as' | 'a2'`), executes Supabase update with row-count verification (`.select('id')`), and rejects missing/unauthorized papers.
- **Card Interactive Locking**: While a paper stage is saving, navigation, editing, and deletion on that paper card are locked. The edit modal receives `effectiveStage ?? 'as'`.
- **Server Confirmation & Error Rollback**: Server Actions execute asynchronously with strict `getUser()` and user ownership validation. On failure, state automatically rolls back and displays an accessible error notice. On success, the untagged row smoothly clears and the Server Action revalidates server caches in a single round trip.
- **Minimal Client Boundary**: Keeps page shell, statistics, and charts server-rendered; only attempts list and tagger prompt subscribe to client state.
- **Global Untagged Query Integrity**: On filtered subject views, retains global untagged query to ensure untagged papers across all subjects remain visible.

## Responsive Layout System (Phase 2.11, v1.1.0 & v1.2.0)
- **Responsive Navigation Header**: Uses explicit CSS Grid areas:
  - Desktop: `logo nav user` (logo → navigation → user controls)
  - Mobile (<640px): `logo user` on row 1, full-width `nav nav` on row 2
- **Container-Responsive Daily Missions**:
  - Each mission card is an inline-size query container, so its layout follows the card's actual dashboard-column width rather than the browser viewport alone.
  - Card width `≤640px`: flexible 2-tier layout (Row 1: complete button/status indicator, icon, wrapped title & description; Row 2: estimated time, action button, XP badge).
  - Card width `>640px`: compact single-row layout (`completion control + icon + text + actions + badge`). This keeps cards fluid while resizing desktop and split-screen windows as well as on tablets and phones.
- **Mobile Touch Targets**: All interactive elements (navigation links, sign out, filter tabs, tagging buttons, paper action icons, inputs, status toggles, mission actions, route selection buttons) enforce ≥44×44px touch targets on mobile and tablet (≤768px).
- **Zero Horizontal Overflow**: Responsive layout system (`.dashboard-main-grid`, `.subjects-grid`, `.past-papers-2col`, `.paper-card-responsive`, `.chapter-row-responsive`, `.mission-card-inner`) verified at 320px, 375px, 390px, 768px, and desktop widths.

## Release Versioning & Update Notification Architecture
- **Authoritative Semantic Versioning (`lib/version.ts`)**:
  - `CURRENT_RELEASE` maintains product version, title, release date, and change highlights.
  - Synchronized with `package.json` at version `1.1.0` (deployed and production-verified at feature merge `7071fa0` and release-closeout/tagged commit `5a8d69e6ee96cdcfb3c4e71e5c499222421164f8`; tag recorded, GitHub Release object absent).
  - v1.2.0 is in development and locally prepared on branch `codex/v1.2.0-ui-foundation` (unreleased / not deployed until approved, merged, deployed, and smoke-tested).
- **Latest-Only "What's New" Dialog (`components/whats-new-modal.tsx`)**:
  - Refactored onto the shared `Dialog` component primitive.
  - Tracks the last seen release version using `localStorage` key `atlas_last_seen_release_version`.
  - Automatically displays when an upgraded release version is detected, coordinated with the Subject controls guide to prevent simultaneous auto-opening.

## Mission Engine
A core component of Atlas is the Mission Engine. It generates up to 3 daily missions per user by calculating a weighted score across multiple dimensions:
- Notes Gap (25%)
- Confidence Gap (30%)
- Accuracy Gap (30%)
- Recency Penalty (15%)

## Readiness Score
The Readiness Score evaluates a student's preparedness based strictly on database calculations:
`Readiness Score = (Notes Completion % * 35%) + (Paper Accuracy % * 40%) + (Confidence Level % * 25%)`

### Exact Formula Rules:
1. **Notes Completion %**:
   - `complete`: 100% (1.0).
   - `in_progress`: 0% (0.0).
   - `none` or untouched: 0% (0.0).
   - Denominator = total accessible syllabus chapters for that stage/route.
2. **Confidence Level %**:
   - `SUM(COALESCE(confidence_level, 0) / 5.0) / total_accessible_chapters * 100`.
   - Untouched chapters contribute 0 to the numerator and are included in the denominator.
3. **Paper Accuracy %**:
   - Average percentage scored across attempted past papers classified into the evaluated stage (`stage = p_stage`).
   - Untagged papers (`stage IS NULL`) are excluded from stage readiness.
   - If no papers have been attempted for the stage, Paper Accuracy evaluates to 0.

### Study Routes & Stage Display
Study route is configured per enrolled subject:
- **AS only**: AS chapters and past papers only. A2 content is hidden. Dashboard shows AS readiness.
- **Staged A Level**:
  - AS Stage (`current_stage = 'as'`): AS chapters and papers only. Dashboard shows AS readiness.
  - A2 Stage (`current_stage = 'a2'`): A2 chapters and papers unlocked. Dashboard displays AS and A2 readiness separately (never averaged).
- **Full A Level (Linear)**:
  - Both AS and A2 chapters and papers are unlocked immediately. Dashboard displays AS and A2 readiness separately. Legacy readiness field is NULL.
- **Unconfirmed**:
  - Route setup banner prompts user; stage-sensitive features remain inactive.

### Mission Engine & Undo Flow
- **Daily Missions**:
  - Generated daily based on accessible chapters only.
  - Excludes unconfirmed subjects and locked A2 content.
  - Skipped missions do not consume active daily budget, permitting replenishment.
- **Mission Completion**:
  - Atomic RPC (`complete_mission`) validates the user's local calendar day, increments `completion_attempt`, awards mission XP, updates streak, checks achievements, and awards all-missions-completed bonus.
  - Associates all generated XP events and achievement unlocks with the mission ID and attempt index.
  - Returns a detailed breakdown: `mission_xp`, `daily_bonus_xp`, `achievement_xp`, `total_xp_awarded`, and `new_total_xp`.
- **Mission Undo**:
  - Atomic RPC (`undo_mission_completion`) allows undoing completion within 10 minutes on the same local calendar day.
  - Reverses mission XP with a `mission_undo` negative ledger event.
  - Reverses all-missions-complete bonus linked to that attempt.
  - Reverses attempt-linked achievements unlocked during that completion and deletes their `user_achievements` row so the badges can be re-earned.
  - Supports multiple `complete → undo → complete → undo` cycles cleanly.
  - Preserves the ledger invariant: `profiles.total_xp = SUM(xp_events.xp_amount)`.
  - Recalculates the current streak from remaining activity after undo; review timestamps remain unchanged in the MVP.

## Five-Subject MVP Syllabus Architecture (Migration 024)
> **Status**: Migrations 024–026 and their matching application changes were released on 2026-08-27. Hosted migration history is synchronized through 026, and the catalogue, data-preservation, dashboard-countdown, and subject-management boundaries were verified.

1. **Gated Subject Availability**:
   - Exactly 5 subjects are available for new onboarding and selection:
     - Mathematics (9709)
     - Further Mathematics (9231)
     - Physics (9702)
     - Chemistry (9701)
     - Computer Science (9618)
   - Pre-existing enrollments in unsupported subjects remain preserved in the database (grandfathered).
2. **Normalized Paper Components & Assessment Links**:
   - `subject_papers` catalogues official components.
   - `subject_valid_routes` defines valid combinations for each subject (e.g. Pure 1 + Mechanics for AS Mathematics; Staged sequences; Linear routes).
   - `chapter_papers` maps chapters directly to their assessing paper components.
   - For science practical papers (Papers 3 & 5), zero direct chapter links are registered (reflecting cross-cutting experimental skills).
3. **Active Syllabus Filtering**:
   - Deprecated non-syllabus chapters (e.g., Vectors in Pure 1, Electromagnetic Induction in Physics) are marked `is_active = FALSE` and filtered out of progress tracking and mission generation.

## Dashboard Statistics Boundary (Migration 025)

- `get_user_dashboard_stats` remains the single server-side dashboard aggregate.
- Subject countdowns are calculated from `exam_date` and the user's local date inside PostgreSQL.
- The dashboard's effective current streak is zero when the last recorded activity predates yesterday; the longest streak remains historical and unchanged.
- The client treats missing or non-numeric countdowns as absent rather than rendering invalid text.

## Subject Enrollment Management Boundary (Migration 026)

- New enrollment adds are restricted to global subjects with `is_available = TRUE` and a maximum of five active subjects.
- Removal archives `user_subjects` instead of deleting it. Chapter progress, route selections, past papers, completed missions, XP events, and profile XP remain intact.
- Archiving skips pending missions tied to the removed subject and immediately removes its chapter access.
- The final active subject cannot be archived. Re-adding a supported archived subject restores the same enrollment ID and any existing configuration.
- The Subjects page requires a second explicit confirmation step before removal and explains the preservation behavior.

## Request and Client-Loading Performance

- Server Components share request-scoped authenticated user and profile reads, avoiding repeated token validation and profile queries within the same render.
- The Subjects page reads readiness from the existing dashboard aggregate rather than issuing separate readiness calls for every enrolled subject.
- Dynamic Past Papers charts, paper-entry forms, and subject controls guide dialogs are split from the initial client bundle and loaded when rendered or opened.
- The shared app route provides an immediate loading skeleton during server-rendered navigation.
- Typography uses a system-font stack so page rendering and production builds do not depend on third-party font requests.

## Data Refresh

The current application uses Server Action revalidation and router refreshes after mutations. Supabase Realtime subscriptions are not currently implemented.
