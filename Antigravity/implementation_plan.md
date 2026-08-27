# Phase 4: Mission Engine + Dashboard (Completed Archive)

> [!NOTE]
> **Historical Document (Archived)**: This document reflects early design notes prior to Migrations 020–024. For current schema, business logic, and API contracts, consult `docs/` and `supabase/migrations/`.

> [!IMPORTANT]
> This plan has been implemented and is not the current release checklist. Migrations 024–026 and their matching application changes are deployed. Phase 2.10 and Phase 2.11 established the v1.0.0 production baseline. Phase 2.12 / v1.1.0 (Dashboard Mobile Compatibility & Update Notifications) was merged at `7071fa0`, deployed, and production-verified on 2026-08-28; only the annotated Git tag remains pending explicit approval. Use `docs/roadmap.md` and `docs/deployment.md` for the current release sequence.

## Overview

The DB backend is **fully complete** — `generate_daily_missions`, `complete_mission`, `get_user_dashboard_stats`, `award_xp`, `update_streak`, `compute_level` RPCs all exist. This phase is purely frontend wiring.

XP thresholds (from `compute_level`):
- L1: 0–99 · L2: 100–249 · L3: 250–499 · L4: 500–899 · L5: 900–1399
- L6: 1400–1999 · L7: 2000–2799 · L8: 2800–3799 · L9: 3800–4999 · L10: 5000+

Level titles: Initiate → Learner → Scholar → Analyst → Tactician → Strategist → Expert → Master → Grandmaster → Atlas → Sage → Oracle → Luminary → Legend → Mythic

## Proposed Changes

---

### Data Layer

#### [NEW] `lib/actions/dashboard.ts`
- `getDashboardData()` — calls `get_user_dashboard_stats` RPC (single round-trip returning profile, streak, missions, subject readiness, recent XP)
- `ensureDailyMissions(userId)` — calls `generate_daily_missions` RPC if `today_missions` is null/empty
- `completeMission(missionId)` — calls `complete_mission` RPC, returns `{ xpAwarded, newLevel, levelTitle, achievementsUnlocked }`

---

### Components

#### [NEW] `components/dashboard/mission-card.tsx` (client)
Props: `mission: DailyMission`, `onComplete: (id) => void`, `subjectColor?: string`

- Checkbox circle → click → optimistic strikethrough → server action
- XP badge on the right
- Mission type icon (BookOpen/RefreshCw/FileSearch/AlertTriangle/Star)
- Framer Motion: scale + opacity animation on completion
- Colour-coded left border by mission type

#### [NEW] `components/dashboard/mission-list.tsx` (client)
- Wraps 3 mission cards with completion state management
- Tracks how many are done today → "All done!" celebration state
- "Generate Missions" button if no missions exist yet

#### [NEW] `components/dashboard/xp-level-bar.tsx` (client)
- Level number bubble (accent gradient)
- Level title (e.g. "Scholar")
- Animated progress bar using Framer Motion `animate={{ width: "X%" }}`
- "N XP to Level M" subtitle

#### [NEW] `components/dashboard/streak-widget.tsx` (client)
- 🔥 pulsing fire animation
- Current streak days (large, bold)
- Longest streak in muted text
- Green dot if studied today, grey if not

#### [NEW] `components/dashboard/subject-readiness-row.tsx` (client)
- Subject colour dot + name
- Animated readiness bar
- Readiness % badge (colour-coded)
- Exam countdown chip ("45 days" / "⚠️ 7 days" in danger colour)
- Link to subject page

---

### Pages

#### [MODIFY] `app/(app)/dashboard/page.tsx`
Full rewrite. Server component:
1. Call `getDashboardData()` — single RPC
2. If `today_missions` is empty, call `ensureDailyMissions()` then fetch again
3. Render layout:

```
┌─────────────────────────────────────────────────────────────┐
│  Good morning, Alex! 👋         🔥 14  ·  Lv.3 Scholar     │
│  ─────────────────────────────────────────────────────────  │
│  ┌─────────────────────────────┐  ┌─────────────────────┐   │
│  │  ⚡ Today's Missions    2/3 │  │  XP & Level         │   │
│  │  ☐ Complete Ch.5 Notes  +30│  │  ████████░░ 73%     │   │
│  │  ☑ Attempt Maths paper  +50│  │  350 / 500 XP       │   │
│  │  ☐ Revisit Integration  +40│  │  Level 3 · Scholar   │   │
│  └─────────────────────────────┘  ├─────────────────────┤   │
│                                    │  🔥 Streak          │   │
│  ┌─────────────────────────────────┤  14 days            │   │
│  │  Subject Readiness             │  Longest: 21 days   │   │
│  │  Mathematics ████████░░ 78%  45d│  └─────────────────────┘ │
│  │  Physics     ████░░░░░░ 43%  47d│                          │
│  └─────────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Verification Plan

### Automated
- `npm run build` — zero TypeScript errors

### Manual
1. Dashboard loads in one RPC call (check Network tab)
2. Missions auto-generate on first visit
3. Click complete → checkbox animates → XP toast (or console log for now)
4. XP bar reflects actual `total_xp` from profiles
5. Streak shows correct days
6. Subject readiness links to `/subjects/:id`
