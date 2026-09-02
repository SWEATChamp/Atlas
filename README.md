# A-Level Atlas

A-Level Atlas is a mission-driven revision dashboard for Cambridge International AS & A Level students. It brings syllabus progress, confidence, past-paper results, daily study missions, readiness, XP, and study streaks into one place.

## Project status

This project is an early MVP intended for a small private pilot.

Available now:

- Google sign-in and guided onboarding
- Subject enrolment, target grades, editable exam dates, and AS/A2 study routes
- Chapter notes, confidence tracking, and route-aware chapter access
- Component-aware past-paper and question-level result logging
- Separate AS/A2 readiness, XP, levels, streaks, mission completion, and undo
- Realistic daily mission generation with workload and variety limits

Release status and known limitations:

- Migrations 020–026 are applied to hosted Supabase and recorded in remote migration history.
- Migration 024 was backed up, applied, and verified on 2026-08-27; all 18 hosted catalogue and data-preservation checks passed. The matching application release was deployed to Vercel on 2026-08-27. Production smoke testing confirmed authentication, preserved enrolments, route-aware chapter access, paper-form component filtering, and mission completion/undo XP accounting.
- Migrations 025–026 were backed up, applied, recorded, and verified on hosted Supabase on 2026-08-27; all eight hosted boundary checks returned `true`. The matching dashboard and subject-management application changes are deployed. Production smoke testing confirmed valid readiness countdowns, the five active MVP subjects, and the required removal confirmation flow.
- Phase 2.10 (Application Performance Round 2 & Speed Insights) is deployed to production with active Speed Insights telemetry.
- v1.1.0 (Dashboard Mobile Compatibility & Update Notifications) was deployed and production-verified on 2026-08-28 at merge commit `7071fa0`, with annotated tag `v1.1.0` published from release-closeout commit `5a8d69e`. Daily Mission cards respond to their own available width across desktop, split-screen, tablet, and phone layouts; the release also includes mobile overflow fixes, 44×44px touch targets, visible semantic versioning (`Atlas v1.1.0`), and an accessible latest-only "What's New" dialog. All 112 unit tests passed.
- v1.1.1 (Singapore Infrastructure Migration) was deployed to Vercel production and verified on 2026-09-01 at merge commit `7b2203f` (with release-closeout merge commit `8448e18c531dfc77c211f31d67c6fa5c1be8a333`, annotated tag object `3e734da62b94247a098318f505204c4f0a8d6ea6`, and [GitHub Release](https://github.com/SWEATChamp/Atlas/releases/tag/v1.1.1)). Database, authentication, and backend services were migrated from Sydney to Singapore (`ap-southeast-1`). All 27 existing migration records were restored, verified, and audited during project migration; accounts, subjects, progress, missions, past papers, and XP were preserved intact.
- v1.2.0 (UI Foundation & Accessible Controls Guide) is locally prepared on branch `codex/v1.2.0-ui-foundation` (unreleased and undeployed to production). The underlying UI-foundation implementation was Preview-verified on Vercel (deployment `ApihahfPteHbQwYg5je6dVa8AymT` at `https://atlas-git-codex-v120-ui-foundation-atlas-726e.vercel.app` from source commit `c4e6a9647df1a9dd69ba13b4a3db27963c3dabae`) across Sign In, Dashboard, Subjects, Subject details, Past Papers, and paper details before the release-metadata update. Smoke testing confirmed UI consistency, the Subject guide lifecycle, 320–1280px touch-target and overflow compliance, and zero browser console errors. v1.2.0 remains unreleased and undeployed to production until release-metadata verification, merge, production deployment, and production smoke testing are completed.
- Mission undo reverses attempt-linked XP and recalculates the streak from remaining activity; chapter review timestamps remain unchanged in the MVP.
- Google Docs integration has not started.

See [the roadmap](docs/roadmap.md) for the current plan.

## Current study structure

Each supported subject uses one of three routes:

- AS only
- Staged A Level: AS followed by A2
- Full A Level in one examination session

Atlas shows separate AS and A2 readiness values. The current five-subject MVP catalogue is Mathematics 9709, Further Mathematics 9231, Physics 9702, Chemistry 9701, and Computer Science 9618. In this platform, “Additional Mathematics” means Further Mathematics 9231, never IGCSE 0606 or O Level 4037.

## Technology

- Next.js 16 and React 19
- TypeScript and Tailwind CSS
- Supabase Authentication and PostgreSQL
- Framer Motion and Recharts
- Vercel deployment target

## Local setup

### Requirements

- Node.js 20.9 or newer
- npm
- A Supabase project
- Supabase CLI for database migrations
- Google OAuth credentials for Google sign-in

### Installation

```bash
git clone <repository-url>
cd "A-Level Atlas"
npm install
cp .env.local.example .env.local
```

Add your local credentials to `.env.local`, then start and initialise the local database:

```bash
npx supabase start
npx supabase db reset
```

`db reset` deletes and recreates the local database. Production releases follow the reviewed database-first process in [the deployment guide](docs/deployment.md); do not point local setup commands at hosted Supabase.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase browser key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase administration key |
| `NEXT_PUBLIC_APP_URL` | Application URL, such as `http://localhost:3000` |
| `NEXT_PUBLIC_APP_NAME` | Display name for the application |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Google OAuth callback URL |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Key used to encrypt stored Google tokens |

Never commit `.env.local` or any real credentials.

## Commands

```bash
npm run dev    # Start local development
npm run build  # Create and check a production build
npm run lint   # Run code checks
npm test       # Run unit tests
npm run test:db # Run local database tests
npm run start  # Run the production build locally
```

## Documentation

- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [API](docs/api.md)
- [Setup](docs/setup.md)
- [Deployment](docs/deployment.md)
- [Roadmap](docs/roadmap.md)
- [Changelog](docs/changelog.md)
- [UI Guidelines](docs/ui-guidelines.md)
- [Contributing](docs/contributing.md)

## Repository safety

Database migrations belong in `supabase/migrations` and should be committed. Local environment files, build output, Supabase temporary files, editor settings, logs, and credentials are excluded by `.gitignore`.
