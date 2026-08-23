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

## Authentication Flow
Atlas utilizes Supabase Auth combined with Google OAuth. This dual approach allows standard email login and provides the necessary SSO integration for the Google Docs synchronization feature.

## Mission Engine
A core component of Atlas is the Mission Engine. It generates up to 3 daily missions per user by calculating a weighted score across multiple dimensions:
- Notes Gap (25%)
- Confidence Gap (30%)
- Accuracy Gap (30%)
- Recency Penalty (15%)

## Readiness Score
The Readiness Score is an aggregate metric evaluating a student's preparedness:
`Readiness Score = (Notes Completion % * 35%) + (Paper Accuracy % * 40%) + (Confidence Level % * 25%)`

### Approved AS/A2 Structure — Not Yet Implemented

Study route is selected separately for each subject:

- **AS only**: AS topics and papers are shown. A2 content is hidden by default but can be manually unlocked.
- **Staged A Level**: the student completes AS first, then continues to A2.
- **Full A Level**: AS and A2 content are studied together for one examination session.

Every chapter, component, and past paper must be tagged as `AS`, `A2`, or `shared`. A paper combination selected by the student must affect the readiness calculation, not only the visible chapter list.

Readiness is split into three values:

- **AS readiness**: calculated from AS notes, confidence, and AS paper results only.
- **A2 readiness**: calculated from A2 notes, confidence, and A2 paper results only.
- **Overall A-Level projection**: combines an AS result with estimated A2 performance. It is a projection, not a readiness score.

The current formula weights remain provisional. The application and database must use one shared calculation so the dashboard and subject pages cannot disagree.

### AS Result Transition

When a staged student moves to A2, Atlas asks for an AS score rather than only a grade:

- Result type: `expected`, `forecast`, or `actual`.
- Score obtained and maximum score.
- Examination series and year.
- Whether the result is intended for carry forward.

Actual results may contribute to the overall A-Level projection. Expected and forecast scores are shown as estimates and must be labelled as less certain. An AS result never changes the A2 readiness score.

The normal staged transition asks for this result before entering A2. Students can still unlock A2 content manually with a warning, supporting early study and unusual school schedules.

## Real-time Sync
Supabase Realtime channels are utilized to subscribe to database changes, ensuring real-time updates for streak and XP changes across devices.
