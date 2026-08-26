# Architecture Overview

## System Overview
Atlas is a production-grade web application built to serve as a Revision Operating System for CAIE A-Level students. It replaces spreadsheet-based revision tracking with an intelligent dashboard, generating daily study missions to maximize exam performance.

## Tech Stack
- **Framework**: Next.js 15 App Router
- **Language**: TypeScript
- **Styling**: TailwindCSS, Framer Motion (Animations)
- **UI Components**: shadcn/ui, Recharts
- **State Management**: Zustand (Client State), React Query (Server State)
- **Forms & Validation**: React Hook Form, Zod
- **Backend as a Service (BaaS)**: Supabase
- **Database**: PostgreSQL (managed by Supabase)
- **Deployment**: Vercel

## Data Flow
The data flow follows a robust modern architecture:
Client (React Components) → React Query / Next.js Server Actions → Supabase Client → PostgreSQL (Row Level Security protected).

## Timezone Handling

The app detects the browser's IANA timezone during onboarding and when a signed-in user opens the app. PostgreSQL uses that saved timezone to decide the user's current calendar date. Daily missions, streaks, daily achievements, exam countdowns, and automatic exam archiving therefore change at the user's midnight rather than the database server's midnight. Invalid or missing values fall back to UTC.

## Authentication Flow
Atlas utilizes Supabase Auth combined with Google OAuth. This dual approach allows standard email login and provides the necessary SSO integration for the Google Docs synchronization feature.

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
- **Mission Completion**:
  - Atomic RPC awards XP, updates streak, checks achievements, and awards all-missions-completed bonus with `reference_id = mission_id`.
- **Mission Undo**:
  - Atomic RPC allows undoing completion within 10 minutes on the same local calendar day.
  - Reverses mission XP with a new `mission_undo` negative ledger event.
  - Reverses all-missions-complete bonus if linked by `reference_id`.
  - Floors `total_xp` at 0 (never negative).
  - Preserves streaks, achievements, and review timestamps (MVP design constraint).

## Real-time Sync
Supabase Realtime channels are utilized to subscribe to database changes, ensuring real-time updates for streak and XP changes across devices.

