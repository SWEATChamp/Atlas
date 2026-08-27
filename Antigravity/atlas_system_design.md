# Atlas — Revision Operating System
### System Design Document · v1.0 · July 2026

> [!NOTE]
> **Historical Document (Archived)**: This document reflects early design notes prior to Migrations 020–024. For current schema, business logic, and API contracts, consult `docs/` and `supabase/migrations/`.

> **Design Ethos**: Linear × Apple Fitness × Duolingo × Arc Browser  
> Dark Mode First · Mission Control Aesthetic · Production-Grade

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Folder Structure](#2-folder-structure)
3. [Database ERD](#3-database-erd)
4. [Database Tables](#4-database-tables)
5. [API Routes](#5-api-routes)
6. [Authentication Flow](#6-authentication-flow)
7. [User Journey](#7-user-journey)
8. [Component Hierarchy](#8-component-hierarchy)
9. [UI Sitemap](#9-ui-sitemap)
10. [Development Roadmap](#10-development-roadmap)

---

## 1. System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Next.js 15 App Router                         │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │   │
│  │  │  Pages   │  │ Layouts  │  │  Server  │  │   Client     │   │   │
│  │  │ (RSC)    │  │ (RSC)    │  │ Actions  │  │ Components   │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │   │
│  │                                                                  │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │   │
│  │  │ Zustand  │  │  React   │  │  Framer  │  │   Recharts   │   │   │
│  │  │ (State)  │  │  Query   │  │  Motion  │  │   (Charts)   │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ HTTPS / WS
┌───────────────────────────────▼────────────────────────────────────────┐
│                           EDGE LAYER (Vercel)                           │
│                                                                          │
│  ┌───────────────────┐    ┌─────────────────┐    ┌──────────────────┐  │
│  │  Edge Middleware   │    │  Edge Functions  │    │  ISR / Caching   │  │
│  │  (Auth Guard)      │    │  (API Routes)    │    │  (Static Pages)  │  │
│  └───────────────────┘    └─────────────────┘    └──────────────────┘  │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────────┐
│                         BACKEND LAYER (Supabase)                        │
│                                                                          │
│  ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────────┐ │
│  │   Auth Service   │   │  Realtime (WS)  │   │   Storage (Files)    │ │
│  │   (GoTrue)       │   │  (Subscriptions)│   │   (Profile Pics)     │ │
│  └─────────────────┘   └─────────────────┘   └──────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   PostgreSQL Database                            │   │
│  │   Row Level Security · Database Functions · Triggers · Indexes  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────────┐
│                      EXTERNAL INTEGRATIONS                               │
│                                                                          │
│  ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────────┐ │
│  │   Google OAuth   │   │   Google Docs   │   │   Google Drive API   │ │
│  │   (Sign In)      │   │   API (Notes)   │   │   (Doc Discovery)    │ │
│  └─────────────────┘   └─────────────────┘   └──────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Architectural Decisions

| Concern | Decision | Rationale |
|---|---|---|
| **Rendering Strategy** | RSC by default, Client Components at leaf nodes | Minimize JS bundle; server-render data-heavy views |
| **State Management** | Zustand for local UI state; React Query for server state | Clear separation; React Query handles caching/staleness |
| **Data Fetching** | React Query + Supabase client; Server Actions for mutations | Optimistic updates; type-safe mutations without REST boilerplate |
| **Auth** | Supabase Auth + Google OAuth | SSO for Google Docs integration; single provider strategy |
| **Real-time** | Supabase Realtime for streak/XP updates | WebSocket subscriptions for live feedback without polling |
| **Database Security** | Row Level Security on all tables | Zero-trust; no user can read/write another's data |
| **Hosting** | Vercel Edge Network | Fastest global cold-start for Next.js 15 |

---

## 2. Folder Structure

```
atlas/
├── app/                                    # Next.js App Router
│   ├── (auth)/                             # Auth route group (no sidebar layout)
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── onboarding/
│   │   │   ├── page.tsx
│   │   │   └── steps/
│   │   │       ├── profile.tsx
│   │   │       ├── subjects.tsx
│   │   │       ├── exam-dates.tsx
│   │   │       └── study-goals.tsx
│   │   └── layout.tsx
│   │
│   ├── (app)/                              # Authenticated app route group
│   │   ├── layout.tsx                      # Shell: Sidebar + Topbar
│   │   ├── dashboard/
│   │   │   └── page.tsx                    # Mission Control (home)
│   │   ├── subjects/
│   │   │   ├── page.tsx                    # Subjects overview grid
│   │   │   └── [subjectId]/
│   │   │       ├── page.tsx                # Subject detail view
│   │   │       └── [chapterId]/
│   │   │           └── page.tsx            # Chapter detail
│   │   ├── past-papers/
│   │   │   ├── page.tsx                    # Paper list & filter
│   │   │   └── [paperId]/
│   │   │       └── page.tsx                # Paper attempt tracker
│   │   ├── notes/
│   │   │   └── page.tsx                    # Notes hub + Google Docs links
│   │   ├── progress/
│   │   │   └── page.tsx                    # Progress vs Target graph + analytics
│   │   ├── achievements/
│   │   │   └── page.tsx                    # Badge collection + XP history
│   │   └── settings/
│   │       ├── page.tsx
│   │       └── sections/
│   │           ├── profile.tsx
│   │           ├── subjects.tsx
│   │           ├── notifications.tsx
│   │           └── integrations.tsx        # Google Docs OAuth management
│   │
│   ├── api/                                # Route Handlers (API)
│   │   ├── auth/
│   │   │   └── callback/
│   │   │       └── route.ts               # Supabase OAuth callback
│   │   ├── missions/
│   │   │   ├── today/
│   │   │   │   └── route.ts
│   │   │   └── complete/
│   │   │       └── route.ts
│   │   ├── xp/
│   │   │   └── award/
│   │   │       └── route.ts
│   │   ├── streak/
│   │   │   └── route.ts
│   │   ├── google-docs/
│   │   │   ├── connect/
│   │   │   │   └── route.ts
│   │   │   └── sync/
│   │   │       └── route.ts
│   │   └── webhooks/
│   │       └── supabase/
│   │           └── route.ts
│   │
│   ├── globals.css
│   ├── layout.tsx                          # Root layout (providers, fonts)
│   └── not-found.tsx
│
├── components/
│   ├── ui/                                 # shadcn/ui base components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── dialog.tsx
│   │   ├── progress.tsx
│   │   ├── tooltip.tsx
│   │   └── ...
│   │
│   ├── layout/                             # Shell components
│   │   ├── sidebar.tsx
│   │   ├── topbar.tsx
│   │   ├── mobile-nav.tsx
│   │   └── command-palette.tsx             # ⌘K global search
│   │
│   ├── dashboard/                          # Mission Control components
│   │   ├── daily-mission-card.tsx
│   │   ├── readiness-score-ring.tsx
│   │   ├── streak-counter.tsx
│   │   ├── xp-progress-bar.tsx
│   │   ├── subject-health-grid.tsx
│   │   └── quick-actions-panel.tsx
│   │
│   ├── subjects/
│   │   ├── subject-card.tsx
│   │   ├── chapter-list.tsx
│   │   ├── chapter-row.tsx
│   │   ├── notes-status-badge.tsx
│   │   └── add-subject-dialog.tsx
│   │
│   ├── past-papers/
│   │   ├── paper-card.tsx
│   │   ├── accuracy-input.tsx
│   │   ├── paper-filter-bar.tsx
│   │   └── question-topic-mapper.tsx
│   │
│   ├── progress/
│   │   ├── progress-vs-target-chart.tsx
│   │   ├── subject-breakdown-chart.tsx
│   │   ├── heatmap-calendar.tsx
│   │   └── readiness-timeline.tsx
│   │
│   ├── achievements/
│   │   ├── badge-grid.tsx
│   │   ├── badge-card.tsx
│   │   ├── xp-history-list.tsx
│   │   └── level-progress-card.tsx
│   │
│   ├── notes/
│   │   ├── docs-link-card.tsx
│   │   ├── connect-google-docs-banner.tsx
│   │   └── notes-chapter-list.tsx
│   │
│   └── shared/
│       ├── animated-number.tsx             # Framer Motion counter
│       ├── empty-state.tsx
│       ├── loading-skeleton.tsx
│       ├── level-badge.tsx
│       ├── confirm-dialog.tsx
│       └── page-header.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                       # Browser client (createBrowserClient)
│   │   ├── server.ts                       # Server client (createServerClient)
│   │   └── middleware.ts                   # Session refresh in middleware
│   │
│   ├── hooks/                              # React Query + custom hooks
│   │   ├── use-user.ts
│   │   ├── use-subjects.ts
│   │   ├── use-chapters.ts
│   │   ├── use-daily-mission.ts
│   │   ├── use-streak.ts
│   │   ├── use-xp.ts
│   │   ├── use-past-papers.ts
│   │   ├── use-readiness-score.ts
│   │   └── use-achievements.ts
│   │
│   ├── actions/                            # Server Actions (mutations)
│   │   ├── subjects.ts
│   │   ├── chapters.ts
│   │   ├── notes.ts
│   │   ├── past-papers.ts
│   │   ├── missions.ts
│   │   └── profile.ts
│   │
│   ├── stores/                             # Zustand stores
│   │   ├── ui-store.ts                     # Sidebar state, modals, command palette
│   │   ├── onboarding-store.ts             # Multi-step onboarding state
│   │   └── mission-store.ts               # Today's mission cache
│   │
│   ├── utils/
│   │   ├── mission-engine.ts               # Daily mission algorithm
│   │   ├── readiness-calculator.ts         # Exam readiness score formula
│   │   ├── xp-calculator.ts               # XP + leveling logic
│   │   ├── streak-utils.ts
│   │   ├── date-utils.ts
│   │   └── cn.ts                           # clsx/tailwind-merge helper
│   │
│   └── validators/                         # Zod schemas
│       ├── subject.schema.ts
│       ├── chapter.schema.ts
│       ├── past-paper.schema.ts
│       └── profile.schema.ts
│
├── types/
│   ├── database.types.ts                   # Auto-generated from Supabase CLI
│   ├── api.types.ts                        # API request/response types
│   └── app.types.ts                        # Domain model types
│
├── config/
│   ├── caie-subjects.ts                    # Master list of A-Level subjects & chapters
│   ├── achievement-definitions.ts          # Badge unlock conditions
│   ├── xp-config.ts                        # XP values per action
│   └── site.ts                             # App metadata
│
├── middleware.ts                           # Route protection + session refresh
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.local
├── supabase/
│   ├── migrations/                         # SQL migration files
│   ├── functions/                          # Edge Functions (if needed)
│   └── seed.sql                            # Dev seed data
│
└── docs/
    ├── architecture.md                     # System architecture, ADRs, layer diagram
    ├── database.md                         # ERD, table schemas, RLS policies, triggers
    ├── api.md                              # All route definitions, request/response shapes
    ├── ui-guidelines.md                    # Design tokens, component patterns, motion spec
    ├── roadmap.md                          # Phase breakdown + feature backlog
    ├── changelog.md                        # Version history + release notes
    ├── setup.md                            # Local dev environment setup (step-by-step)
    ├── deployment.md                       # Vercel + Supabase production deployment guide
    └── contributing.md                     # PR conventions, branch strategy, code style
```

---

## 3. Database ERD

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ATLAS DATABASE ERD                              │
└─────────────────────────────────────────────────────────────────────────┘

 ┌──────────────┐          ┌──────────────────────┐
 │    profiles  │          │       subjects        │
 ├──────────────┤          ├──────────────────────┤
 │ id (PK)      │──────┐   │ id (PK)               │
 │ email        │      │   │ name                  │
 │ full_name    │      │   │ code (e.g. 9709)      │
 │ avatar_url   │      │   │ color_hex             │
 │ exam_session │      │   │ icon                  │
 │ timezone     │      │   │ is_global             │ ◄── CAIE master list
 │ created_at   │      │   │ created_at            │
 └──────────────┘      │   └──────────────────────┘
                        │              │
         ┌──────────────┘              │ 1:N
         │                            ▼
         │    ┌──────────────────────────────────────────┐
         │    │          user_subjects                    │
         │    ├──────────────────────────────────────────┤
         │    │ id (PK)                                   │
         │    │ user_id (FK → profiles.id)               │◄──┐
         │    │ subject_id (FK → subjects.id)            │   │
         │    │ exam_date                                 │   │
         │    │ target_grade                              │   │
         │    │ priority (1-5)                            │   │
         │    │ created_at                                │   │
         │    └──────────────────────────────────────────┘   │
         │                       │                            │
         │                       │ 1:N                        │
         │                       ▼                            │
         │    ┌──────────────────────────────────────────┐   │
         │    │               chapters                    │   │
         │    ├──────────────────────────────────────────┤   │
         │    │ id (PK)                                   │   │
         │    │ subject_id (FK → subjects.id)            │   │
         │    │ title                                     │   │
         │    │ number (chapter order)                    │   │
         │    │ is_global                                 │   │
         │    └──────────────────────────────────────────┘   │
         │                       │                            │
         │                       │ 1:N                        │
         │                       ▼                            │
         │    ┌──────────────────────────────────────────┐   │
         │    │          user_chapters                    │   │
         │    ├──────────────────────────────────────────┤   │
         │    │ id (PK)                                   │   │
         │    │ user_id (FK → profiles.id)               │   │
         │    │ chapter_id (FK → chapters.id)            │   │
         │    │ notes_status (ENUM)                       │   │
         │    │ google_doc_url                            │   │
         │    │ confidence_level (1-5)                    │   │
         │    │ last_reviewed_at                          │   │
         │    │ created_at                                │   │
         │    │ updated_at                                │   │
         │    └──────────────────────────────────────────┘   │
         │                                                     │
         │    ┌──────────────────────────────────────────┐   │
         │    │             past_papers                   │   │
         │    ├──────────────────────────────────────────┤   │
         │    │ id (PK)                                   │   │
         │    │ user_id (FK → profiles.id)               │   │
         │    │ subject_id (FK → subjects.id)            │   │
         │    │ paper_code (e.g. 9709/12)                │   │
         │    │ year                                      │   │
         │    │ session (m/j/o)                           │   │
         │    │ paper_number (1/2/3)                      │   │
         │    │ attempted_at                              │   │
         │    │ score_raw                                 │   │
         │    │ score_max                                 │   │
         │    │ accuracy_pct (computed)                   │   │
         │    │ notes                                     │   │
         │    │ created_at                                │   │
         │    └──────────────────────────────────────────┘   │
         │                       │                            │
         │                       │ 1:N                        │
         │                       ▼                            │
         │    ┌──────────────────────────────────────────┐   │
         │    │        paper_question_attempts            │   │
         │    ├──────────────────────────────────────────┤   │
         │    │ id (PK)                                   │   │
         │    │ paper_id (FK → past_papers.id)           │   │
         │    │ chapter_id (FK → chapters.id)            │   │
         │    │ question_number                           │   │
         │    │ marks_available                           │   │
         │    │ marks_obtained                            │   │
         │    │ created_at                                │   │
         │    └──────────────────────────────────────────┘   │
         │                                                     │
         ├────────────────────────────────────────────────────┘
         │
         │    ┌──────────────────────────────────────────┐
         │    │             daily_missions               │
         │    ├──────────────────────────────────────────┤
         │    │ id (PK)                                   │
         │    │ user_id (FK → profiles.id)               │
         │    │ mission_date (DATE)                       │
         │    │ type (ENUM)                               │
         │    │ target_entity_type (chapter/paper)        │
         │    │ target_entity_id                          │
         │    │ xp_reward                                 │
         │    │ status (ENUM: pending/done/skipped)       │
         │    │ completed_at                              │
         │    │ generated_at                              │
         │    └──────────────────────────────────────────┘
         │
         │    ┌──────────────────────────────────────────┐
         │    │             xp_events                    │
         │    ├──────────────────────────────────────────┤
         │    │ id (PK)                                   │
         │    │ user_id (FK → profiles.id)               │
         │    │ event_type (ENUM)                         │
         │    │ xp_amount                                 │
         │    │ metadata (JSONB)                          │
         │    │ created_at                                │
         │    └──────────────────────────────────────────┘
         │
         │    ┌──────────────────────────────────────────┐
         │    │               streaks                    │
         │    ├──────────────────────────────────────────┤
         │    │ id (PK)                                   │
         │    │ user_id (FK → profiles.id)  UNIQUE       │
         │    │ current_streak                            │
         │    │ longest_streak                            │
         │    │ last_activity_date (DATE)                 │
         │    │ updated_at                                │
         │    └──────────────────────────────────────────┘
         │
         │    ┌──────────────────────────────────────────┐
         │    │            user_achievements             │
         │    ├──────────────────────────────────────────┤
         │    │ id (PK)                                   │
         │    │ user_id (FK → profiles.id)               │
         │    │ achievement_key (e.g. "first_blood")      │
         │    │ unlocked_at                               │
         │    └──────────────────────────────────────────┘
         │
         │    ┌──────────────────────────────────────────┐
         │    │         google_docs_tokens               │
         │    ├──────────────────────────────────────────┤
         │    │ id (PK)                                   │
         │    │ user_id (FK → profiles.id)  UNIQUE       │
         │    │ access_token (encrypted)                  │
         │    │ refresh_token (encrypted)                 │
         │    │ expires_at                                │
         │    │ scopes                                    │
         │    │ created_at                                │
         │    │ updated_at                                │
         │    └──────────────────────────────────────────┘
```

---

## 4. Database Tables

### 4.1 `profiles`
Extends Supabase `auth.users`. One row per registered user.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, FK → auth.users | Matches auth UID |
| `email` | `text` | NOT NULL, UNIQUE | Synced from auth |
| `full_name` | `text` | | |
| `avatar_url` | `text` | | Google avatar or uploaded |
| `exam_session` | `text` | | e.g. `"Jun 2026"` |
| `school` | `text` | | Optional |
| `timezone` | `text` | DEFAULT `'UTC'` | For streak midnight logic |
| `onboarding_completed` | `bool` | DEFAULT false | Gate main app access |
| `total_xp` | `int` | DEFAULT 0 | Denormalized for fast reads |
| `current_level` | `int` | DEFAULT 1 | Computed from total_xp |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | | Trigger-updated |

---

### 4.2 `subjects` (global + user-created)
Master list of CAIE A-Level subjects seeded at deploy time.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `name` | `text` | NOT NULL | e.g. `"Mathematics"` |
| `code` | `text` | | e.g. `"9709"` |
| `color_hex` | `text` | | UI theming per subject |
| `icon` | `text` | | Lucide icon name |
| `is_global` | `bool` | DEFAULT true | false = user-created |
| `created_by` | `uuid` | FK → profiles.id, nullable | For custom subjects |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

### 4.3 `user_subjects`
Junction: which subjects a user is studying.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | FK → profiles.id, NOT NULL | RLS key |
| `subject_id` | `uuid` | FK → subjects.id, NOT NULL | |
| `exam_date` | `date` | | Specific exam date |
| `target_grade` | `text` | | `"A*"`, `"A"`, `"B"` etc. |
| `priority` | `smallint` | DEFAULT 3, 1-5 | Affects mission weighting |
| `created_at` | `timestamptz` | DEFAULT now() | |
| | | UNIQUE(user_id, subject_id) | |

---

### 4.4 `chapters` (global)
Pre-seeded per subject from CAIE syllabus.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `subject_id` | `uuid` | FK → subjects.id | |
| `title` | `text` | NOT NULL | e.g. `"Differentiation"` |
| `number` | `smallint` | | Display order |
| `is_global` | `bool` | DEFAULT true | |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

### 4.5 `user_chapters`
Per-user progress state for each chapter.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | FK → profiles.id | RLS key |
| `chapter_id` | `uuid` | FK → chapters.id | |
| `notes_status` | `text` | ENUM: `none/in_progress/complete` | |
| `google_doc_url` | `text` | | Linked notes document |
| `google_doc_id` | `text` | | For API sync |
| `confidence_level` | `smallint` | 1-5, nullable | Self-assessment |
| `last_reviewed_at` | `timestamptz` | | Spaced repetition signal |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | | Trigger-updated |
| | | UNIQUE(user_id, chapter_id) | |

---

### 4.6 `past_papers`
Individual paper attempts logged by the user.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | FK → profiles.id | RLS key |
| `subject_id` | `uuid` | FK → subjects.id | |
| `paper_code` | `text` | NOT NULL | e.g. `"9709/12"` |
| `year` | `smallint` | NOT NULL | e.g. `2023` |
| `session` | `text` | ENUM: `m/j/o` | May/June/Oct-Nov |
| `paper_number` | `smallint` | | 1, 2, or 3 |
| `attempted_at` | `date` | NOT NULL | When student did it |
| `score_raw` | `smallint` | NOT NULL | Marks obtained |
| `score_max` | `smallint` | NOT NULL | Total marks available |
| `accuracy_pct` | `numeric(5,2)` | GENERATED | (raw/max)*100 |
| `time_taken_mins` | `smallint` | nullable | |
| `notes` | `text` | | Personal notes/reflection |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

### 4.7 `paper_question_attempts`
Granular per-question breakdown for weak area analysis.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `paper_id` | `uuid` | FK → past_papers.id | |
| `chapter_id` | `uuid` | FK → chapters.id, nullable | Topic tagging |
| `question_number` | `text` | NOT NULL | e.g. `"5(b)"` |
| `marks_available` | `smallint` | NOT NULL | |
| `marks_obtained` | `smallint` | NOT NULL | |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

### 4.8 `daily_missions`
One or more missions generated per user per day.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | FK → profiles.id | RLS key |
| `mission_date` | `date` | NOT NULL | Date this applies to |
| `type` | `text` | ENUM: `complete_notes/review_chapter/attempt_paper/revisit_weak_topic` | |
| `target_entity_type` | `text` | `chapter` or `paper` | |
| `target_entity_id` | `uuid` | | Polymorphic FK |
| `title` | `text` | NOT NULL | e.g. `"Complete Chapter 3 Notes"` |
| `description` | `text` | | |
| `xp_reward` | `smallint` | NOT NULL | XP for completion |
| `status` | `text` | ENUM: `pending/completed/skipped` DEFAULT `pending` | |
| `completed_at` | `timestamptz` | nullable | |
| `generated_at` | `timestamptz` | DEFAULT now() | |
| | | UNIQUE(user_id, mission_date, type, target_entity_id) | |

---

### 4.9 `xp_events`
Immutable ledger of all XP awarded. Source of truth for `profiles.total_xp`.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | FK → profiles.id | RLS key |
| `event_type` | `text` | ENUM: `mission_complete/notes_complete/paper_attempt/streak_bonus/achievement_unlock/manual` | |
| `xp_amount` | `smallint` | NOT NULL | Can be negative (future) |
| `reference_id` | `uuid` | nullable | FK to triggering entity |
| `metadata` | `jsonb` | | Extra context |
| `created_at` | `timestamptz` | DEFAULT now() | |

---

### 4.10 `streaks`
One row per user, updated on every study activity.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | FK → profiles.id, UNIQUE | One per user |
| `current_streak` | `int` | DEFAULT 0 | Consecutive study days |
| `longest_streak` | `int` | DEFAULT 0 | All-time record |
| `last_activity_date` | `date` | | Compared vs today (in user TZ) |
| `updated_at` | `timestamptz` | | |

---

### 4.11 `user_achievements`
Unlocked badges. Append-only.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | FK → profiles.id | RLS key |
| `achievement_key` | `text` | NOT NULL | Matches config/achievement-definitions.ts |
| `unlocked_at` | `timestamptz` | DEFAULT now() | |
| | | UNIQUE(user_id, achievement_key) | No duplicates |

---

### 4.12 `google_docs_tokens`
Encrypted OAuth2 tokens for Google Docs API access.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `user_id` | `uuid` | FK → profiles.id, UNIQUE | |
| `access_token` | `text` | NOT NULL | pgcrypto encrypted at rest |
| `refresh_token` | `text` | NOT NULL | pgcrypto encrypted at rest |
| `expires_at` | `timestamptz` | NOT NULL | |
| `scopes` | `text[]` | | Granted OAuth scopes |
| `created_at` | `timestamptz` | DEFAULT now() | |
| `updated_at` | `timestamptz` | | |

---

### Database Functions & Triggers

| Name | Type | Purpose |
|---|---|---|
| `handle_new_user()` | Trigger | Creates `profiles` + `streaks` row on auth.users insert |
| `update_streak_on_activity()` | Function | Compares last_activity_date vs today; increments/resets |
| `update_total_xp()` | Trigger | Recomputes `profiles.total_xp` + `current_level` on xp_events insert |
| `compute_level(xp)` | Function | Piecewise XP → level calculation |
| `generate_daily_missions(user_id)` | Function | Mission Engine algorithm (called by cron or on login) |
| `update_updated_at()` | Trigger | Generic `updated_at` timestamp trigger |

---

## 5. API Routes

All routes under `/app/api/`. Protected by Supabase session validation.

### 5.1 Auth

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/auth/callback` | Supabase OAuth callback handler |
| `POST` | `/api/auth/signout` | Clear session cookies |

---

### 5.2 Missions

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/missions/today` | Fetch or generate today's mission set |
| `POST` | `/api/missions/complete` | Mark mission complete, award XP, update streak |
| `POST` | `/api/missions/skip` | Skip a mission (no XP) |

**`POST /api/missions/complete` Body:**
```json
{
  "missionId": "uuid",
  "completedAt": "ISO8601"
}
```
**Response:** `{ xpAwarded, newTotalXp, streakDays, achievementsUnlocked[] }`

---

### 5.3 Subjects & Chapters

> These are primarily handled by **Server Actions** (`lib/actions/`), but REST routes exist for external/webhook use.

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/subjects` | List user's enrolled subjects |
| `POST` | `/api/subjects` | Enroll in a subject |
| `DELETE` | `/api/subjects/[id]` | Unenroll |
| `GET` | `/api/subjects/[id]/chapters` | List chapters with user progress |
| `PATCH` | `/api/chapters/[id]/notes-status` | Update notes completion |
| `PATCH` | `/api/chapters/[id]/confidence` | Update confidence rating |
| `PATCH` | `/api/chapters/[id]/google-doc` | Link a Google Doc URL |

---

### 5.4 Past Papers

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/past-papers` | List user's paper attempts (with filters) |
| `POST` | `/api/past-papers` | Log a new paper attempt |
| `PATCH` | `/api/past-papers/[id]` | Edit an existing attempt |
| `DELETE` | `/api/past-papers/[id]` | Remove an attempt |
| `GET` | `/api/past-papers/[id]/questions` | Get question-level breakdown |
| `POST` | `/api/past-papers/[id]/questions` | Log question attempts |

---

### 5.5 XP & Gamification

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/xp/history` | Paginated XP event log |
| `GET` | `/api/streak` | Current streak + longest streak |

---

### 5.6 Google Docs Integration

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/google-docs/connect` | Initiate OAuth2 flow (redirect) |
| `GET` | `/api/google-docs/callback` | Handle OAuth2 callback, store tokens |
| `POST` | `/api/google-docs/sync` | Refresh token + validate Doc access |
| `DELETE` | `/api/google-docs/disconnect` | Revoke and delete stored tokens |

---

### 5.7 Analytics / Progress

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/progress/readiness-score` | Compute current Exam Readiness Score |
| `GET` | `/api/progress/history` | Weekly progress data for chart |
| `GET` | `/api/progress/weak-topics` | Chapters with lowest accuracy/confidence |

---

## 6. Authentication Flow

```
 ┌─────────────┐
 │    User      │
 └──────┬──────┘
        │  1. Navigate to /login
        ▼
 ┌─────────────────────────────────────┐
 │         /login page                  │
 │   "Continue with Google" button      │
 └──────────────────┬──────────────────┘
                    │  2. Click → supabase.auth.signInWithOAuth()
                    ▼
 ┌─────────────────────────────────────┐
 │         Google OAuth Consent        │
 │   Scopes: openid, profile, email    │
 │   + Google Docs (if connecting)     │
 └──────────────────┬──────────────────┘
                    │  3. Google redirects to /api/auth/callback?code=...
                    ▼
 ┌─────────────────────────────────────┐
 │      /api/auth/callback              │
 │   exchangeCodeForSession()           │
 │   → Set HTTP-only cookie            │
 └──────────────────┬──────────────────┘
                    │
          ┌─────────┴──────────┐
          │                    │
    [New User]           [Returning User]
          │                    │
          ▼                    ▼
 ┌─────────────────┐  ┌──────────────────────┐
 │  DB Trigger:     │  │  Check               │
 │  Create profile  │  │  onboarding_complete │
 │  Create streak   │  └────────┬─────────────┘
 └────────┬────────┘            │
          │                ┌────┴────┐
          ▼                │         │
 ┌─────────────────┐  [false]   [true]
 │  /onboarding    │       │         │
 │  Step 1: Profile│       ▼         ▼
 │  Step 2: Subjects│  /onboarding  /dashboard
 │  Step 3: Dates  │
 │  Step 4: Goals  │
 └─────────────────┘

 ── Session Refresh (Middleware) ──────────────────────────────────────────

 Every request → middleware.ts
   ├── supabase.auth.getSession()
   ├── If no session + protected route → redirect /login
   ├── If session expired → supabase.auth.refreshSession()
   └── If onboarding incomplete + not on /onboarding → redirect /onboarding

 ── Sign Out ──────────────────────────────────────────────────────────────

 User clicks "Sign Out"
   → supabase.auth.signOut()
   → Clear cookies
   → Redirect /login
   → Zustand stores reset
   → React Query cache cleared
```

### Session Strategy

- **Storage**: HTTP-only `Set-Cookie` (SSR-compatible, XSS-resistant)
- **Refresh**: Middleware automatically refreshes expired JWTs
- **RLS**: All Supabase queries run as the authenticated user; policies enforce `user_id = auth.uid()`

---

## 7. User Journey

### 7.1 First-Time User (Onboarding)

```
1. Land on Marketing/Login page
   └── "Get Started with Google"

2. Google OAuth → Account created

3. Onboarding Flow (multi-step, progress bar)
   ├── Step 1 — Profile
   │     Name, School (optional), Exam Session (e.g. June 2026)
   │
   ├── Step 2 — Add Subjects
   │     Search from CAIE master list
   │     Select 1–5 subjects
   │     Set target grade per subject (A*, A, B, C)
   │
   ├── Step 3 — Exam Dates
   │     Set specific exam dates per subject
   │     Calendar picker
   │
   └── Step 4 — Study Goal
         Daily study target (e.g. 2 chapters/day)
         "How far into the syllabus are you?" slider

4. → Dashboard (first mission generated)
```

---

### 7.2 Returning User (Daily Loop)

```
8:00 AM — Student opens Atlas

Dashboard loads:
  ┌─────────────────────────────────┐
  │  🔥 Day 7 Streak                │
  │  "Welcome back, Alex"           │
  │                                 │
  │  TODAY'S MISSION                │
  │  ┌─────────────────────────┐   │
  │  │ ✅ Complete Chapter 5   │   │
  │  │    Integration (A2 Math)│   │
  │  │    [Mark Complete] [→] │   │
  │  └─────────────────────────┘   │
  │                                 │
  │  Exam Readiness: 67% ▲         │
  │  Days to exam: 42               │
  └─────────────────────────────────┘

Student completes notes for Chapter 5
  → Marks notes as "Complete" in Subjects view
  → +50 XP awarded (animated counter)
  → Mission auto-resolves
  → Streak increments if first activity today
  → Achievement check: "Five in a row!" badge?

Student logs a past paper attempt
  → Enters score: 48/75 (64%)
  → Tags weak questions to Chapter 3 & 7
  → Accuracy saved; weak topics flagged

Tomorrow's mission engine will:
  → Prioritize Chapter 3 & 7 (weak topics)
  → Weigh against exam date proximity
  → Generate 1-3 missions

Evening — student checks Progress page
  → Sees Progress vs Target line chart
  → Readiness score updated to 69%
```

---

### 7.3 Past Paper Workflow

```
1. Navigate to Past Papers
2. Click "Log Attempt"
3. Fill in:
   - Subject (pre-selected from enrolled)
   - Paper Code (9709/12)
   - Year + Session
   - Score: 58 / 80
4. Optional: Add question breakdown
   - Q1: 5/6 → Chapter 1
   - Q5: 2/8 → Chapter 7 (WEAK)
5. Save → accuracy_pct computed
6. Weak topics surfaced in dashboard
7. Chapter 7 weighted higher in tomorrow's mission
```

---

### 7.4 Google Docs Integration Flow

```
1. Navigate to Notes hub
2. Click "Connect Google Docs"
3. Google OAuth (additional scopes: drive.readonly)
4. Atlas stores encrypted tokens
5. In any chapter row: paste/search for Google Doc
6. Doc link saved; opens in Google Docs with one click
7. (Future) Sync Doc word count as "notes progress" signal
```

---

## 8. Component Hierarchy

```
<RootLayout>                                    (app/layout.tsx)
  <Providers>                                   (QueryClient, Zustand init)
    ├── <AuthProvider>                          (Supabase session context)
    │
    ├── (auth) Route Group
    │   └── <AuthLayout>
    │       ├── <LoginPage>
    │       │   ├── <Logo />
    │       │   ├── <GoogleSignInButton />
    │       │   └── <LoginHeroAnimation />       (Framer Motion)
    │       │
    │       └── <OnboardingPage>
    │           ├── <OnboardingProgressBar />
    │           ├── <StepProfile />
    │           ├── <StepSubjects />
    │           │   ├── <SubjectSearchCombobox />
    │           │   └── <SelectedSubjectPill />
    │           ├── <StepExamDates />
    │           │   └── <SubjectDateRow />
    │           └── <StepStudyGoal />
    │
    └── (app) Route Group
        └── <AppLayout>                         (Sidebar + Topbar shell)
            ├── <Sidebar>
            │   ├── <SidebarLogo />
            │   ├── <SidebarNavItem /> × N
            │   ├── <SidebarXPWidget />         (level + XP bar)
            │   └── <SidebarUserMenu />
            │
            ├── <Topbar>
            │   ├── <CommandPaletteTrigger />   (⌘K)
            │   ├── <StreakBadge />
            │   └── <NotificationBell />        (future)
            │
            ├── <CommandPalette />              (global, portal)
            │
            └── <PageContent>
                │
                ├── /dashboard → <DashboardPage>
                │   ├── <DailyMissionCard>
                │   │   ├── <MissionHeader />
                │   │   ├── <MissionDescription />
                │   │   ├── <MissionCompleteButton />
                │   │   └── <MissionXPBadge />
                │   ├── <ReadinessScoreRing>     (Recharts RadialBarChart)
                │   ├── <StreakCounter>          (Framer Motion animated)
                │   ├── <SubjectHealthGrid>
                │   │   └── <SubjectHealthCard /> × N
                │   ├── <QuickActionsPanel>
                │   │   └── <QuickActionButton /> × N
                │   └── <RecentXPFeed />
                │
                ├── /subjects → <SubjectsPage>
                │   ├── <PageHeader />
                │   ├── <AddSubjectDialog />
                │   └── <SubjectCard /> × N
                │       └── <SubjectProgressBar />
                │
                ├── /subjects/[id] → <SubjectDetailPage>
                │   ├── <SubjectHeader />       (grade target, exam date countdown)
                │   ├── <SubjectStatsRow />     (chapters done, papers done, avg accuracy)
                │   └── <ChapterList>
                │       └── <ChapterRow /> × N
                │           ├── <NotesStatusBadge />
                │           ├── <ConfidenceRating />   (star/dot selector)
                │           ├── <GoogleDocLink />
                │           └── <ChapterActions />     (dropdown menu)
                │
                ├── /past-papers → <PastPapersPage>
                │   ├── <PaperFilterBar />      (subject, year, session)
                │   ├── <LogPaperButton />
                │   ├── <PaperStatsRow />       (avg accuracy, total attempts)
                │   └── <PaperCard /> × N
                │       ├── <PaperAccuracyBar />
                │       └── <PaperActions />
                │
                ├── /past-papers/[id] → <PaperDetailPage>
                │   ├── <PaperHeader />
                │   └── <QuestionBreakdownTable>
                │       └── <QuestionRow /> × N
                │           └── <TopicTagSelector />
                │
                ├── /notes → <NotesPage>
                │   ├── <ConnectGoogleDocsBanner />
                │   ├── <NotesSearchBar />
                │   └── <NotesChapterList>
                │       └── <DocsLinkCard /> × N
                │
                ├── /progress → <ProgressPage>
                │   ├── <ProgressVsTargetChart />   (Recharts LineChart)
                │   ├── <SubjectBreakdownChart />   (Recharts BarChart)
                │   ├── <HeatmapCalendar />         (activity heatmap)
                │   └── <WeakTopicsList />
                │
                ├── /achievements → <AchievementsPage>
                │   ├── <LevelProgressCard />
                │   ├── <XPHistoryList />
                │   └── <BadgeGrid>
                │       └── <BadgeCard /> × N  (locked/unlocked states)
                │
                └── /settings → <SettingsPage>
                    ├── <SettingsNav />
                    ├── <ProfileSection />
                    ├── <SubjectsSection />
                    ├── <IntegrationsSection />   (Google Docs connect/disconnect)
                    └── <NotificationsSection />
```

---

## 9. UI Sitemap

```
atlas.app
│
├── /                         → Redirect → /dashboard (if authed) or /login
│
├── /login                    ← PUBLIC
│   └── Google Sign In
│
├── /onboarding               ← NEW USERS ONLY (middleware gate)
│   ├── ?step=profile
│   ├── ?step=subjects
│   ├── ?step=dates
│   └── ?step=goals
│
└── /dashboard                ← PROTECTED (all routes below)
    │   Mission Control home
    │
    ├── /subjects
    │   │   Subject overview grid
    │   │
    │   └── /subjects/[subjectId]
    │       │   Chapter list + progress
    │       │
    │       └── /subjects/[subjectId]/[chapterId]   (optional detail view)
    │               Notes, confidence, docs link
    │
    ├── /past-papers
    │   │   All paper attempts; log new paper
    │   │
    │   └── /past-papers/[paperId]
    │           Question-level breakdown
    │
    ├── /notes
    │       Notes hub; Google Docs links per chapter
    │
    ├── /progress
    │       Progress vs Target chart + analytics
    │
    ├── /achievements
    │       XP, level, badges
    │
    └── /settings
        ├── /settings/profile
        ├── /settings/subjects
        ├── /settings/integrations
        └── /settings/notifications
```

### Key UX Patterns

| Pattern | Usage |
|---|---|
| **Command Palette** (⌘K) | Global search: jump to subject, chapter, or paper |
| **Optimistic Updates** | Mission complete, notes status toggle — instant UI feedback |
| **Toast Notifications** | XP awards, streak milestones, achievement unlocks |
| **Skeleton Loaders** | All data views while React Query fetches |
| **Empty States** | Onboarding nudges when no subjects/papers added yet |
| **Keyboard Navigation** | Full keyboard support across all interactive elements |

---

## 10. Development Roadmap

### Phase 0 — Foundation (Week 1–2)

> Set up the scaffold so nothing blocks Phase 1.

- [ ] `create-next-app` with TypeScript + Tailwind + shadcn/ui
- [ ] Supabase project creation; enable Google OAuth
- [ ] Database migrations: all core tables + RLS policies
- [ ] Supabase CLI type generation pipeline
- [ ] Middleware: auth guard + session refresh
- [ ] `profiles` trigger (auto-create on user signup)
- [ ] Vercel project setup; env var management
- [ ] Seed script: CAIE subjects + chapters master data
- [ ] Design system: Tailwind tokens (color palette, typography, spacing)
- [ ] Global layout shell: Sidebar + Topbar components

---

### Phase 1 — Core MVP (Week 3–6)

> Ship the minimum loop: track progress, get a mission.

**Sprint 1 (Week 3–4): Auth + Onboarding + Subjects**
- [ ] Login page (Google OAuth)
- [ ] Onboarding flow (4 steps with Zustand store)
- [ ] Subjects page + enroll/unenroll
- [ ] Subject detail: chapter list with notes status toggle
- [ ] `user_chapters` upsert via Server Actions

**Sprint 2 (Week 5–6): Past Papers + Notes**
- [ ] Log paper attempt (form + Zod validation)
- [ ] Past papers list with filter bar
- [ ] Question-level breakdown (optional at this stage)
- [ ] Notes hub page + Google Doc URL linking
- [ ] Google OAuth2 flow for Docs integration

---

### Phase 2 — Intelligence Layer (Week 7–9)

> Make Atlas smart.

**Sprint 3 (Week 7–8): Mission Engine**
- [ ] `generate_daily_missions()` DB function
- [ ] Mission Engine algorithm:
  - Weight by: days to exam, chapter confidence, past paper weak topics, notes completion
  - Generate 1–3 missions per day
- [ ] Dashboard Mission Card (with complete/skip actions)
- [ ] Mission completion → XP award → streak update (atomic transaction)

**Sprint 4 (Week 9): Readiness Score + Progress**
- [ ] Exam Readiness Score formula:
  - `(notes_complete_pct × 0.35) + (avg_paper_accuracy × 0.4) + (confidence_avg × 0.25)`
  - Per-subject + overall
- [ ] Readiness Score Ring (RadialBarChart)
- [ ] Progress vs Target chart (user's trajectory vs needed pace)
- [ ] Heatmap calendar (daily activity)

---

### Phase 3 — Gamification (Week 10–11)

> Make it addictive.

- [ ] XP system: define events + amounts in `xp-config.ts`
- [ ] Level system: piecewise XP thresholds
- [ ] Streak counter with flame animation (Framer Motion)
- [ ] XP event ledger + animated counter
- [ ] Achievement definitions (20+ badges)
  - `first_blood`: First notes completed
  - `paper_hunter`: First past paper logged
  - `streak_7`: 7-day streak
  - `streak_30`: 30-day streak
  - `ace`: 90%+ on a past paper
  - `completionist`: All chapters done for a subject
  - `speed_run`: 3 missions in one day
  - `night_owl`: Study session after midnight
- [ ] Achievement unlock toast + badge reveal animation
- [ ] Achievements page: badge grid (locked/unlocked)

---

### Phase 4 — Polish & Performance (Week 12–13)

> Production-ready.

- [ ] Framer Motion page transitions
- [ ] Command palette (⌘K) with fuzzy search
- [ ] Full mobile responsiveness + bottom nav bar
- [ ] Dark mode refinement + Tailwind CSS variables
- [ ] React Query cache tuning (stale times, prefetching)
- [ ] Vercel Analytics + Web Vitals monitoring
- [ ] Error boundaries + fallback UI
- [ ] Sentry error tracking integration
- [ ] E2E tests: Playwright (auth, mission complete, paper log)

---

### Phase 5 — Growth Features (Month 4+)

> Future features after core is validated.

| Feature | Notes |
|---|---|
| **AI Study Coach** | Gemini API; chat interface for study Q&A |
| **Friends** | Follow system; compare readiness scores |
| **Leaderboards** | XP board; accuracy board per subject |
| **PvP Pets** | Virtual pet tied to study consistency |
| **Coins** | Secondary currency for cosmetics |
| **Themes** | Unlockable UI themes (via coins) |
| **Push Notifications** | Daily mission reminder; streak alert |
| **Offline Mode** | Service worker; queue actions for sync |

---

## Mission Engine Algorithm

The core intelligence of Atlas. Runs on login if no mission exists for today.

```
INPUTS:
  - user_subjects (with exam_date, target_grade, priority)
  - user_chapters (notes_status, confidence_level, last_reviewed_at)
  - past_papers (accuracy_pct per chapter via question_attempts)
  - current_date

ALGORITHM:

  1. For each enrolled subject, compute urgency:
       urgency = 1 / days_until_exam (clamped: 0–1)

  2. For each chapter in enrolled subjects, compute chapter_score:
       notes_gap     = (notes_status != 'complete') ? 1 : 0
       confidence_gap = (5 - confidence_level) / 4
       accuracy_gap   = 1 - avg(marks_obtained / marks_available)
                        for questions tagged to this chapter
       recency_penalty = days_since_last_reviewed / 14 (capped at 1)

       chapter_score = (
         notes_gap     × 0.25 +
         confidence_gap × 0.30 +
         accuracy_gap   × 0.30 +
         recency_penalty × 0.15
       ) × urgency × subject_priority

  3. Sort chapters by chapter_score DESC

  4. Generate missions:
       - Top 1 chapter → "Complete Notes" or "Review Chapter" mission
       - If any chapter has accuracy_gap > 0.4 → "Revisit Weak Topic" mission
       - If no paper attempt in last 7 days for any subject → "Attempt Past Paper" mission
       - Max 3 missions per day

  5. Set XP rewards:
       - Complete Notes:   50 XP
       - Review Chapter:   30 XP
       - Weak Topic:       40 XP
       - Attempt Paper:    75 XP

  6. Insert into daily_missions (deduplicated by UNIQUE constraint)
```

---

## Exam Readiness Score

Single number (0–100%) per subject and overall.

$$
\text{ReadinessScore} = \left( P_\text{notes} \times 0.35 \right) + \left( \bar{A}_\text{papers} \times 0.40 \right) + \left( \bar{C}_\text{confidence} \times 0.25 \right)
$$

Where:
- $P_\text{notes}$ = % of chapters with `notes_status = 'complete'`
- $\bar{A}_\text{papers}$ = mean `accuracy_pct` across all paper attempts for the subject
- $\bar{C}_\text{confidence}$ = mean `confidence_level` (normalized to 0–1) across chapters

---

## XP & Leveling System

| Level | XP Required (Cumulative) | Title |
|---|---|---|
| 1 | 0 | Initiate |
| 2 | 100 | Learner |
| 3 | 250 | Scholar |
| 4 | 500 | Analyst |
| 5 | 900 | Tactician |
| 6 | 1,400 | Strategist |
| 7 | 2,000 | Expert |
| 8 | 2,800 | Master |
| 9 | 3,800 | Grandmaster |
| 10 | 5,000 | Atlas |

XP per action:

| Action | XP |
|---|---|
| Complete chapter notes | +50 |
| Review a chapter | +30 |
| Log past paper attempt | +75 |
| Complete daily mission | +25 bonus |
| Unlock achievement | +100 |
| Daily streak (7 days) | +150 |
| Daily streak (30 days) | +500 |

---

*Document generated: July 2026 · Atlas v1.0 · For internal engineering use*
