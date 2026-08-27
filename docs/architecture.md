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

Atlas uses a restrained, academic visual system: neutral dark surfaces, one muted-blue action accent, solid fills, and Lucide icons. Subject colours are reserved for subject identity and data visualisation. Cards are used for independently actionable or grouped content, not as a wrapper for every text block. Decorative gradients, glow effects, emoji icons, multicoloured navigation, and unlabeled status dots are excluded from the current interface.

## Data Flow
The current data flow is:
Server or Client Component → Next.js Server Action or authenticated Supabase client → PostgreSQL with Row Level Security and guarded RPCs. Mutations revalidate affected routes; the current application does not depend on React Query caching.

## Timezone Handling

The app detects the browser's IANA timezone during onboarding and when a signed-in user opens the app. PostgreSQL uses that saved timezone to decide the user's current calendar date. Daily missions, streaks, daily achievements, exam countdowns, and automatic exam archiving therefore change at the user's midnight rather than the database server's midnight. Invalid or missing values fall back to UTC.

## Authentication Flow
Atlas currently uses Supabase Auth with Google OAuth. Email/password UI and Google Docs synchronisation are not part of the current MVP flow.

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
- Dynamic Past Papers charts and paper-entry forms are split from the initial client bundle and loaded when rendered or opened.
- The shared app route provides an immediate loading skeleton during server-rendered navigation.
- Typography uses a system-font stack so page rendering and production builds do not depend on third-party font requests.

## Data Refresh

The current application uses Server Action revalidation and router refreshes after mutations. Supabase Realtime subscriptions are not currently implemented.
