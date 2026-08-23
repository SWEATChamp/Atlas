# A-Level Atlas

A-Level Atlas is a mission-driven revision dashboard for Cambridge International AS & A Level students. It brings syllabus progress, confidence, past-paper results, daily study missions, readiness, XP, and study streaks into one place.

## Project status

This project is an early MVP intended for a small private pilot.

Available now:

- Google sign-in and guided onboarding
- Subject enrolment, target grades, and editable exam dates
- Chapter notes and confidence tracking
- Past-paper and question-level result logging
- Readiness, XP, levels, and streaks
- Daily mission interface

Known limitations:

- Mission generation currently has a date-calculation error.
- Readiness is not yet separated into AS and A2 stages.
- The subject page and dashboard currently calculate readiness differently.
- Biology and Computer Science chapter data is not yet seeded.

See [the roadmap](docs/roadmap.md) for the current plan.

## Planned study structure

Each enrolled subject will support one of three routes:

- AS only
- Staged A Level: AS followed by A2
- Full A Level in one examination session

Atlas will show separate AS and A2 readiness values. Students following the staged route will be able to record an expected, forecast, or actual AS score for an overall A-Level projection. This work is designed but not yet implemented.

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

Add your local credentials to `.env.local`, then apply the database migrations:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

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
- [Contributing](docs/contributing.md)

## Repository safety

Database migrations belong in `supabase/migrations` and should be committed. Local environment files, build output, Supabase temporary files, editor settings, logs, and credentials are excluded by `.gitignore`.
