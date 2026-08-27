# Deployment Guide

Atlas uses Vercel for the Next.js application and Supabase for authentication and PostgreSQL. Database migrations are released before application code when the application depends on new tables, columns, or RPC contracts.

## Current Release Boundary

- Migrations 000–023 are applied to hosted Supabase.
- Migration 024 is prepared and verified locally, but is not applied to hosted Supabase.
- The Migration 024 application changes are not deployed.
- No hosted migration or deployment should occur until the pull request is approved and an explicit release decision is made.

## Migration 024 Release Order

### 1. Approve a single release candidate

- Review the full pull-request diff, especially Migration 024, route setup, past-paper logging, generated database types, and preservation tests.
- Require a clean working tree and record the exact commit to be released.
- If merging to `main` automatically deploys production, pause or gate that deployment so the new application cannot start before hosted database verification.
- Confirm local database tests, unit tests, lint, type checking, production build, and whitespace checks pass on that commit.
- Confirm Migrations 001–023 are unchanged relative to `main`.

### 2. Confirm a recoverable hosted backup

Do not release Migration 024 without a recent, verified recovery point. It performs catalogue seeding, chapter remapping, backfills, and RPC replacement, so recovery needs to cover both schema and data.

- On a paid Supabase plan, confirm a recent automatic backup is visible and restorable in the project dashboard.
- On a Free plan, create an off-site logical database dump with the Supabase CLI before the migration.
- Database backups do not contain the actual files stored in Supabase Storage. Back those objects up separately when they matter to a release.
- Record the backup time, project reference, release commit, and person who verified recovery readiness.

See the official [Supabase database backup guide](https://supabase.com/docs/guides/platform/backups).

### 3. Inspect the hosted migration state

Use the linked-project migration list and a dry run to confirm that Migration 024 is the only pending migration. Stop if the target project is unexpected, the remote migration history differs, or any earlier migration is pending or marked differently.

```bash
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

These are inspection steps. They must not modify the hosted database.

### 4. Apply Migration 024 to hosted Supabase

Only after explicit approval, apply the reviewed migration from the recorded release commit:

```bash
npx supabase db push --linked
```

Do not edit an already-applied migration to repair a production failure. Stop, preserve evidence, and prepare a new forward-only migration if remediation is required.

### 5. Verify the hosted database before deploying the app

Confirm at minimum:

- The remote migration history includes Migration 024 exactly once.
- Exactly five global subjects have `is_available = TRUE`: 9709, 9231, 9702, 9701, and 9618.
- Existing unsupported and custom-subject enrolments still exist and remain unchanged.
- Existing Mathematics, Physics, and Chemistry chapter IDs and representative `user_chapters` progress are preserved.
- Subject paper, valid route, route-paper, and chapter-paper catalogues have their expected counts and no cross-subject links.
- A representative route can be configured for each MVP subject, including a valid Further Mathematics option.
- Chapter access follows AS-only, staged AS/A2, and full A-Level rules.
- Past-paper logging enforces component, stage, and chapter boundaries.
- Mission generation produces accessible, component-aware missions; completion and undo preserve the XP ledger invariant.
- Operational helper privileges match the tested role matrix.

If any check fails, do not deploy the application.

### 6. Deploy the matching application commit

- Configure the documented production environment variables in Vercel.
- Deploy the exact commit whose Migration 024 was reviewed and applied.
- Keep the interval between database migration and application deployment short.
- Do not deploy an application preview that expects Migration 024 against a database still on Migration 023.

### 7. Run production smoke checks

- Sign in and complete onboarding with one fixed-route subject and one elective-route subject.
- Confirm only the five MVP subjects are offered to new users.
- Confirm a grandfathered unsupported enrolment remains visible to its existing user.
- Open AS and A2 chapter views for the configured route.
- Log, edit, and delete a representative past paper.
- Generate varied daily missions, then complete and undo one mission while checking XP.
- Check the application and Supabase logs for new errors.

### 8. Reconcile release records

After successful hosted verification and deployment, update the roadmap, database documentation, changelog, and this guide from “pending” to the exact deployed migration and commit. Never mark hosted work complete based only on local test results.

## General Production Configuration

- Configure Supabase authentication providers, Site URL, and allowed redirect URLs for the production domain.
- Keep service-role keys server-only and never expose them through `NEXT_PUBLIC_*` variables.
- Set `NEXT_PUBLIC_APP_URL` to the production origin.
- Enable optional analytics or scheduled jobs only when their implementation and ownership are documented.
