# Deployment Guide

Atlas uses Vercel for the Next.js application and Supabase for authentication and PostgreSQL. Database migrations are released before application code when the application depends on new tables, columns, or RPC contracts.

## Current Release Boundary

- Migrations 000–026 are applied to hosted Supabase and recorded in remote migration history.
- A pre-migration logical backup was completed before Migration 024, and all 18 hosted catalogue and data-preservation checks passed afterward.
- The Migration 024 application changes were deployed to Vercel on 2026-08-27.
- Initial production smoke checks passed for authentication retry, preserved enrolments, route-aware chapters, paper component filtering, and mission completion/undo XP accounting.
- A fresh logical backup was completed before Migrations 025–026. Both migrations were applied in order on 2026-08-27, remote history was confirmed through 026, and all eight hosted boundary checks returned `true`.
- The matching Migrations 025–026 application hotfix is deployed. Production smoke testing confirmed valid readiness countdowns, all five active MVP subjects, and the removal confirmation/cancel path.
- Phase 2.11 (Production Performance & Mobile Responsiveness) is merged and deployed as baseline `v1.0.0` (commit `39427dd`).
- Phase 2.12 / v1.1.0 (Dashboard Mobile Compatibility & Update Notifications) was deployed to Vercel production at merge commit `7071fa0` and production-verified. Annotated tag `v1.1.0` was published at `5a8d69e`.
- v1.1.1 (Singapore Infrastructure Migration) was deployed to Vercel production and verified on 2026-09-01 (merge commit `7b2203f`, closeout `8448e18`, annotated tag `v1.1.1`, and published GitHub Release).
- Phase 2.13 / v1.2.0 (Accessible UI Foundation & Subject Controls Guide) was deployed to Vercel production and verified on 2026-09-02 at merge commit `abed20ba325e99113813a8860be7f4a22c1fc39c` (with release-closeout merge commit `a4ea17993e0f9250eb1c50a41d930a8c4f5a4d2c`, annotated tag object `1c4524fcd1f747a7e00674d7c0aa8551f2180d94`, and published [GitHub Release](https://github.com/SWEATChamp/Atlas/releases/tag/v1.2.0)). It establishes an accessible `Dialog` primitive, dark design tokens, two-step Subject controls guide, responsive layouts (320px–1280px), touch targets (≥44×44px through 768px), and returning-user v1.2.0 notifications.
- Milestone 3 Publication Discovery was merged to `main` via PR #16 at merge commit `07120d189a4416604945ef76382a2cae3dd412da` and deployed to Vercel production (`dpl_GmxutRfLHEHPnqArivPBowNtJL4i`) on 2026-09-12. Stage 1 Discovery-Only Cron Route and credential separation were merged via PR #18 at merge commit `ce2eaec8de41371113aee090fcc84525f7bdaca2` and deployed to Vercel production (`dpl_2t1Kbt6hJMMxiPgPz38cAWF459pz`) on 2026-09-18. Both `/api/cron/grade-threshold-discovery` (expects `CRON_SECRET`) and `/api/cron/grade-thresholds` (expects `GRADE_THRESHOLD_IMPORT_SECRET`) are deployed but dormant; neither was invoked during PR #18 deployment verification; `vercel.json` remains absent; zero repository-defined cron schedules exist; and notification mechanism / schedule activation remain pending.
- Do not rerun Migrations 024–026. Any further production correction must use a reviewed forward-only migration.

## Migration 024 Release Order

> **Release status (2026-08-27):** The Migration 024–026 database and matching application deployment steps are complete. Hosted history is synchronized through 026 and the initial production smoke matrix passed, except that no live subject removal/re-add preservation exercise was performed.

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

Completed on 2026-08-27 from the reviewed migration file. Because the local network could not reach the session pooler, the exact committed SQL was applied once through Supabase SQL Editor, then recorded with `supabase migration repair`. The remote migration list and dry run now report the database is up to date.

For a future unapplied migration, the normal reviewed CLI path is:

```bash
npx supabase db push --linked
```

Do not run this command for Migration 024 now that its remote history record is synchronized.

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

## Migrations 025–026 Hotfix Release Order

Migration 025 replaces `get_user_dashboard_stats(UUID)` without changing its signature. Migration 026 adds the guarded subject enrollment RPCs used by the matching application UI. Release both database migrations in order before deploying the application:

> **Release status (2026-08-27):** Steps 1–8 are complete. The remote migration list matches local history through 026, the final dry run reports the database is up to date, all eight hosted boundary verification values returned `true`, and the application hotfix is deployed. Step 9 was checked through confirmation/cancel only; a live remove-and-re-add exercise remains optional.

1. Review both migration files, their 28 focused pgTAP tests, and the dashboard/subject-management unit tests.
2. Confirm all 201 database tests, 68 unit tests, type checking, lint, production build, and whitespace checks pass.
3. Create a fresh hosted logical backup and confirm remote migration history ends at 024.
4. Apply Migration 025 and then Migration 026 exactly once; confirm remote history ends at 026.
5. Verify the dashboard RPC returns numeric `days_until` values and an expired current streak as zero.
6. Verify subject add/remove authorization, five-subject maximum, final-subject protection, and archive preservation checks.
7. Merge and deploy the matching application hotfix.
8. Confirm countdown chips no longer show `undefinedd`, the expired streak displays zero, and authentication still succeeds.
9. On Subjects, open “Add or remove,” verify only available MVP subjects can be added, cancel one removal, then confirm one removal and re-add it. Check that progress, papers, XP, and completed missions remain unchanged.

## Application-Only Performance Polish

The performance and dashboard-polish release after Migration 026 does not change the database schema and must not create or apply another migration.

1. Review the application diff for request-scoped auth reuse, dashboard and Subjects data loading, mission Undo timing, loading skeletons, deferred Past Papers UI, and font removal.
2. Confirm 72 unit tests, type checking, lint, production build, and whitespace checks pass.
3. Merge and deploy the reviewed application commit. A new hosted database backup is not required because this release has no database mutation.
4. Confirm dashboard, Subjects, subject detail, Past Papers, paper logging, mission completion, and mission Undo still work in production.
5. Compare production navigation timings after the deployment. Create a forward-only Migration 027 only if the Subjects aggregate remains a measured bottleneck after the application changes and Sydney function-region configuration.

## Phase 2.10 Application Performance Round 2

> **Release status (2026-08-27):** Deployed to production and verified. Speed Insights telemetry is active.

1. Proxy authentication via `getClaims()`, server-side onboarding layout guard, authoritative reactive dashboard state management, XP progression, and Speed Insights telemetry are deployed.
2. Production smoke testing confirmed authentication, dashboard readiness, mission completion/undo, subject management, and Speed Insights script loading.

## Phase 2.11 Production Performance & Mobile Responsiveness (v1.0.0 Baseline)

> **Release status (2026-08-27):** Merged and deployed to Vercel production at commit `39427dd`. Baseline `v1.0.0` established.
> This was an application-only release: no Supabase backup, database migration, or migration-history repair was required.

1. Optimistic AS/A2 paper-stage tagging with synchronous in-flight guard (`PaperStageProvider`, `lib/papers-state.ts`), input validation, card locking, responsive header with explicit CSS Grid areas, and mobile touch targets (≥44×44px) are live in production.
2. Verified 98 unit tests, TypeScript type checking, ESLint, Next.js production build, and whitespace checks.

## Phase 2.12 / v1.1.0: Dashboard Mobile Compatibility & Update Notifications

> **Release status (2026-08-28):** Merged at `7071fa0`, deployed to Vercel production, and production-verified. This was an application-only release: no Supabase backup, database migration, or migration-history repair was required. Annotated release tag `v1.1.0` was published pointing to release-closeout commit `5a8d69e`.

1. Delivered v1.1.0 scope:
   - Container-responsive Daily Mission cards in `components/dashboard/mission-card.tsx` and `app/globals.css`: a flexible 2-tier layout when the card itself is ≤640px wide and a clean single row above 640px, including fluid desktop and split-screen resizing.
   - `minmax(0, 1fr)` and `min-width: 0` constraints on `.dashboard-main-grid`.
   - Header logo touch target (≥44px height) and "Configure {subject}" button (≥44×44px).
   - Authoritative release metadata module (`lib/version.ts`) synchronised with `package.json` at version `1.1.0`.
   - Visible semantic version display in application footer (`Atlas v1.1.0`).
   - Accessible latest-only "What's New" release update modal overlay (`components/whats-new-modal.tsx`) with client-safe `localStorage` dismissal persistence, focus trap, Escape key handling, and background scroll locking.
   - Agent workflow discipline rules added to `AGENTS.md`.
2. Verification record:
   - All 112 unit tests, TypeScript type checking, ESLint, the Next.js production build, and whitespace checks passed before merge.
   - No files under `supabase/migrations/` or `supabase/tests/` changed.
   - Vercel production deployment completed successfully for merge commit `7071fa0`.
   - Production smoke testing confirmed authentication, responsive mission reflow without horizontal overflow, mission completion/undo, visible `Atlas v1.1.0`, and latest-only update-dialog behavior.
3. **Release Tagging (Completed)**:
   Annotated release tag `v1.1.0` (tag object `7f60c090027475733f72937f02665b25511b7646`) was published to `origin` pointing to release-closeout commit `5a8d69e6ee96cdcfb3c4e71e5c499222421164f8` with annotation `v1.1.0: MVP stabilization, mobile compatibility, and update notifications` (with application deployment at `7071fa0`).

## v1.1.1 Operational Patch: Singapore Infrastructure Migration

> **Release status (2026-09-01):** Merged at `7b2203f`, deployed to Vercel production, and production-verified. Release closeout merged at `8448e18c531dfc77c211f31d67c6fa5c1be8a333`, with annotated tag object `3e734da62b94247a098318f505204c4f0a8d6ea6` and [GitHub Release](https://github.com/SWEATChamp/Atlas/releases/tag/v1.1.1). This was an operational patch release moving database, authentication, and backend services to Singapore (`ap-southeast-1`). No new migration file, schema change, or migration-history repair was introduced by the v1.1.1 application release; the operational Sydney-to-Singapore cutover itself used a verified export and restore where all 27 canonical migration records (000–026) were restored and audited.

1. Delivered v1.1.1 scope:
   - Migrated production database, Auth, and Storage infrastructure to Singapore project `uvprmojmscndtwgkvjbi` (`ap-southeast-1`).
   - Updated release metadata in `lib/version.ts`, `package.json`, and `package-lock.json` to version `1.1.1` with title `Singapore Infrastructure Migration`.
   - Updated the release metadata displayed by the existing notification dialog to inform returning users about the Singapore migration.
   - Updated version synchronization and release-state lifecycle unit tests for version `1.1.1` and date `2026-09-01`.
2. Verification record:
   - All 113 unit tests, TypeScript type checking, ESLint, Next.js production build, and whitespace checks passed before merge.
   - Release-state lifecycle tests verified upgrade detection, single-dismissal recording, and storage safety.
   - Zero changes to files under `supabase/migrations/` or `supabase/tests/`.
   - Gate 3 postflight comparative audit verified byte-for-byte parity across all 10 structural and catalog dimensions between Sydney and Singapore.
   - Preflight verified zero Storage objects in both projects.
   - Production deployment verified on Vercel:
     - Source merge commit: `7b2203fde2c49ab660347044522e09655dd14fca`
     - Vercel status: Ready
     - Deployment dashboard identifier: `FtFjyn6FxxVhtidpqrKynnCXUZ77`
     - Immutable deployment URL: `https://atlas-8znzp8rci-atlas-726e.vercel.app`
     - Production domain: `https://atlas-alpha-vert.vercel.app`
   - Production smoke testing on the production domain confirmed:
     - Authentication through Singapore Supabase succeeded on the production domain.
     - Footer displayed `Atlas v1.1.1`.
     - The Singapore migration notification displayed all four intended highlights.
     - Dismissal persisted after reload.
     - Dashboard missions, XP, readiness and streak data loaded.
     - All five subjects loaded.
     - Past-paper attempts and analytics loaded.
     - No application records were modified during smoke testing.
3. **Release Tagging (Completed)**:
   Annotated release tag `v1.1.1` (tag object `3e734da62b94247a098318f505204c4f0a8d6ea6`) was published pointing to release-closeout commit `8448e18c531dfc77c211f31d67c6fa5c1be8a333` with annotation `v1.1.1: Singapore infrastructure migration` and published [GitHub Release](https://github.com/SWEATChamp/Atlas/releases/tag/v1.1.1).

## Phase 2.13 / v1.2.0: Accessible UI Foundation & Subject Controls Guide

> **Release status (Complete & Formally Released):** Merged to `main` via PR #12 at merge commit `abed20ba325e99113813a8860be7f4a22c1fc39c` (feature branch head `bff4c5b0cc24d435187e7a1974a19a7c9fd30687`), deployed to Vercel production (`9RCwZ6xAY7ohAqxNn2msJzcCXcUi`), verified through authenticated production smoke testing on 2026-09-02, closed out via PR #13 at merge commit `a4ea17993e0f9250eb1c50a41d930a8c4f5a4d2c` (documentation deployment `8shqSC2QMjNVMsVn6ABoc36xWvm4`), tagged with annotated tag `v1.2.0` (object `1c4524fcd1f747a7e00674d7c0aa8551f2180d94`), and published as a stable [GitHub Release](https://github.com/SWEATChamp/Atlas/releases/tag/v1.2.0). This is an application-only release requiring zero database migrations.

1. Delivered v1.2.0 scope:
   - Extracted accessible, dependency-free `Dialog` component primitive (`components/ui/dialog.tsx`) with `titleId`/`descriptionId`, focus trapping, Escape dismissal, universal focus restoration on every close path/unmount, body scroll locking, and 44×44px touch targets.
   - Refactored `WhatsNewModal`, `LogPaperModal`, `SubjectManager`, `A2TransitionModal`, and `RouteSetupSheet` onto `<Dialog>`.
   - Two-step Subject controls guide dialog (`components/subjects/subject-controls-guide.tsx`, `components/subjects/subject-guide-launcher.tsx`) with versioned persistence (`atlas_subject_controls_guide_v1`), safe storage accessor (`lib/storage.ts`), coordination to prevent competing What's New auto-opening, 5-star visual example representation, and permanently visible "Guide" button beside Chapters.
   - Canonical shared mappings (`lib/subject-controls.ts`, `STATUS_CYCLE`, `STATUS_CONFIG`, `CONFIDENCE_LEVELS`).
   - Semantic one-way complete action `<button type="button" aria-label="Complete mission: ...">` with separate `Undo` button, keyboard-operable `PaperCard` with native link semantics, and native radio semantics on study route configuration.
   - Request caching via `React.cache()` for `getPaperDetail` and `getSubjectDetail` to deduplicate metadata reads.
   - Established `goal.md` as the tracked, authoritative master product plan.
2. Verification record:
   - All 134 unit and accessibility tests across 17 test files, TypeScript type checking, ESLint, Next.js Turbopack production build, and whitespace checks passed.
   - Release-notification lifecycle tests verified upgrade detection from 1.1.1 to 1.2.0, single-dismissal recording, and storage safety.
   - Zero changes to files under `supabase/migrations/` or `supabase/tests/`.
   - Preview verification record:
     - **Stage 1 (UI Foundation Baseline Verification)**:
       - Source branch: `codex/v1.2.0-ui-foundation`
       - Source commit: `c4e6a9647df1a9dd69ba13b4a3db27963c3dabae`
       - Vercel status: Ready / Success
       - Deployment dashboard identifier: `ApihahfPteHbQwYg5je6dVa8AymT`
       - Stable Preview URL: `https://atlas-git-codex-v120-ui-foundation-atlas-726e.vercel.app`
       - Smoke test results: Sign In followed by the authenticated Dashboard, Subjects, Subject details, Past Papers, and paper details rendered with consistent styling; Subject controls guide passed first-visit auto-open, Step 1 → Step 2 Next/Back navigation, Escape key dismissal, focus trapping, focus restoration on close, manual reopen via "Guide" button beside Chapters, and dismissal persistence across refreshes; zero horizontal overflow across 320px, 375px, 390px, 768px, and 1280px viewports and compliant touch targets (≥44×44px) across touch-oriented layouts (320px–768px); zero browser console errors.
     - **Stage 2 (Final v1.2.0 Release-Candidate Verification)**:
       - Source branch: `codex/v1.2.0-ui-foundation`
       - Source commit: `3db79b0dfb942da000c28d4ea2fe8eab48704053`
       - Vercel status: Ready / Success
       - Deployment dashboard identifier: `7qSYmzFZLnK8nKioamjB7kDgEhtF`
       - Stable Preview URL: `https://atlas-git-codex-v120-ui-foundation-atlas-726e.vercel.app`
       - Smoke test results: Returning-user notification dialog displayed version `1.2.0`, title `Accessible UI Foundation & Subject Controls Guide`, and all four approved highlights; users previously dismissed at `1.1.1` were correctly prompted with the `1.2.0` update dialog; modal dismissal persisted after page reload; authenticated app footer displayed `Atlas v1.2.0`; Dashboard, Subjects, Subject details, Past Papers, and paper data loaded cleanly; zero browser console errors or unhandled warnings; zero application study records modified (only Preview-local dismissal state updated).
     - **Stage 3 (Master Product Plan Documentation Verification)**:
       - Source branch: `codex/v1.2.0-ui-foundation`
       - Source commit: `bff4c5b0cc24d435187e7a1974a19a7c9fd30687`
       - Vercel status: Ready / Success
       - Deployment dashboard identifier: `ESWA1crtAKir5rpNbeAUYdSvGK1n`
       - Stable Preview URL: `https://atlas-git-codex-v120-ui-foundation-atlas-726e.vercel.app`
   - Production deployment verification:
     - PR: [SWEATChamp/Atlas#12](https://github.com/SWEATChamp/Atlas/pull/12) merged at `abed20ba325e99113813a8860be7f4a22c1fc39c` (2026-09-02T09:46:30Z).
     - Environment: Production
     - Source commit: `abed20ba325e99113813a8860be7f4a22c1fc39c`
     - Vercel status: Ready / Success
     - Deployment dashboard identifier: `9RCwZ6xAY7ohAqxNn2msJzcCXcUi`
     - Production URL: `https://atlas-alpha-vert.vercel.app`
     - Edge region: Singapore (`sin1`)
   - Authenticated production smoke testing confirmed:
     - Correct `v1.2.0` returning-user notification title (*Accessible UI Foundation & Subject Controls Guide*) and all four highlights rendered upon login.
     - Upgrade notification appeared for users previously dismissed at `v1.1.1`.
     - Release notification dismissal persisted after page reload.
     - Visible `Atlas v1.2.0` footer across authenticated pages.
     - Dashboard, Subjects, Subject details, Past Papers, and Past Paper detail views loaded correctly.
     - Subject Controls Guide first-visit auto-open, Step 1 → Step 2 Next/Back navigation, Escape dismissal, return focus to the Guide launcher, manual Guide reopening beside Chapters, and dismissal persistence across page reload verified.
     - Zero horizontal overflow passed across 320px, 375px, 390px, 768px, and 1280px viewports on Dashboard, Subjects, and Past Papers.
     - Past Paper detail view passed its production read/loading check and the 320px overflow/touch-target check.
     - Minimum 44×44px touch targets verified across touch-oriented layouts (320px–768px). (Compact desktop navigation and mission actions intentionally use smaller desktop dimensions at 1280px).
     - Zero browser console warnings or errors.
     - Zero study records modified during smoke testing.
3. **Release Tagging & Publication (Completed)**:
   - Annotated release tag `v1.2.0` (tag object `1c4524fcd1f747a7e00674d7c0aa8551f2180d94`) was published pointing to release-closeout commit `a4ea17993e0f9250eb1c50a41d930a8c4f5a4d2c` with annotation `v1.2.0: Accessible UI Foundation & Subject Controls Guide`.
   - Stable GitHub Release published on 2026-09-02 at 14:30:09Z: [A-Level Atlas v1.2.0 — Accessible UI Foundation & Subject Controls Guide](https://github.com/SWEATChamp/Atlas/releases/tag/v1.2.0).

## Milestone 3 Publication Discovery Deployment Record

> **Deployment status (Publication discovery deployed; Milestone 3 still in progress):** Merged to `main` via PR [#16](https://github.com/SWEATChamp/Atlas/pull/16) at merge commit `07120d189a4416604945ef76382a2cae3dd412da` on 2026-09-12, and deployed to Vercel production (`dpl_GmxutRfLHEHPnqArivPBowNtJL4i`). Automatic Cambridge publication discovery is implemented, tested, and live in the production build. No production cron schedule is active.

1. **Delivered scope:**
   - Server-only rolling discovery (`lib/grade-thresholds/publication-discovery.ts`) for new Cambridge examination series and grade-threshold tables.
   - Strict HTTPS and approved Cambridge host verification (`cambridgeinternational.org` and `www.cambridgeinternational.org`).
   - Canonical examination session path enforcement (`/programmes-and-qualifications/.../grade-threshold-tables/${series}-${year}/`).
   - Independent extraction and cross-validation of syllabus code, subject title, year, and series from both URL structure and anchor text.
   - Robust distinction between Mathematics (9709) and Further Mathematics (9231).
   - Three-tier link classification (`unrelated`, `valid_target`, `contradictory_target`) with fail-closed behavior on contradictory links, redirects, zero candidate links, or network anomalies.
   - Unconditional scheduler fail-closed boundary in `runScheduledGradeThresholdImport()` preventing all downstream pipeline execution upon discovery failures.
   - Mandatory manifest admission boundary: discovered URLs are logged in discovery reports but never imported without explicit reviewed entry in `source-manifest.ts`.
   - Automatic publication disabled (`autoPublish: false`).
   - Server-only export isolation (`lib/grade-thresholds/server.ts`) keeping discovery logic out of client bundles.
   - `AGENTS.md` Rule 7 Follow-Up Prompt Continuity rule scoped to the primary orchestrator.

2. **Verification record:**
   - 52/52 publication-discovery unit tests passed (`tests/grade-threshold-discovery.test.ts`).
   - Full repository test suite passed (238 passed, 6 skipped).
   - TypeScript (`tsc --noEmit`), ESLint, Next.js Turbopack production build, and `git diff --check` passed cleanly.
   - Zero changes under `supabase/` (Migration 027 remains current in Singapore).
   - Zero repository PDF artifacts.
   - Vercel Preview deployment `dpl_48JJjHpbxrh8mtyPt8pCTtHqGMDj` verified Ready on Singapore edge (`sin1`).
   - Automatic Production deployment `dpl_GmxutRfLHEHPnqArivPBowNtJL4i` verified Ready on Singapore edge (`sin1`) with HTTP/2 307 on `/` and HTTP/2 200 on `/login`.

3. **Operational Audit & Credential Status:**
   - **Cron schedule**: Inactive. No `vercel.json` exists in the repository and no cron jobs are configured on Vercel (`vercel crons ls` reports 0 jobs).
   - **Endpoint invocation**: No active schedule was found in the current Vercel configuration, and no invocation was observed in the available retained logs. This evidence does not prove the endpoint was never invoked historically. (Unauthenticated requests fail closed with 503 `cron_not_configured`).
   - **Credential state**: `CRON_SECRET` is confirmed absent from Vercel project environment variables for both Production and Preview. `SUPABASE_SERVICE_ROLE_KEY` is also confirmed absent. The currently deployed authorized route cannot execute successfully without an elevated Supabase server credential (`SupabaseGradeThresholdPersistence` requires an elevated key to write to RLS-protected threshold tables).
   - **Database credential decision**: Introducing a credential requires a separate reviewed decision between:
     1. Adding support for a dedicated modern Supabase secret key for this backend component; or
     2. Temporarily retaining the legacy `SUPABASE_SERVICE_ROLE_KEY`.
     Under project safety boundaries, no key may be retrieved, revealed, added, rotated, or modified without explicit approval.
   - **Current runtime behavior & PDF downloads**: An authorized execution of the deployed endpoint does not perform an HTML-only or zero-PDF check; it downloads all five manifest PDFs plus the weighting PDF before verifying checksum equality and returning `no_change`. Given the 60-second function limit (`maxDuration = 60`), runtime and bandwidth validation under real network conditions are mandatory activation gates.

4. **Safe Architecture Recommendation & Operational Gates:**
   - **Preferred Architecture (Discovery-Only)**:
     - Recommend a lightweight **discovery-only** scheduled path as the least-privilege default:
       - Fetches and validates Cambridge index pages.
       - Discovers new candidate publication URLs.
       - May emit structured runtime reports or execution logs for operational observability.
       - Must not persist candidates to Supabase, download threshold PDFs, or invoke the import pipeline.
       - Requires no elevated Supabase credentials.
       - Leaves manifest admission, importing, approval, and publication as separately approved operations.
     - The existing mutating importer should remain dormant until separately reviewed. A full-import cron is a higher-risk alternative, not the default.
   - **Cadence & Cambridge Planning Anchors**:
     - Cadence remains an unresolved decision:
       - A daily cadence is acceptable only for a lightweight discovery-only job.
       - A PDF-checking / import-capable job requires a less frequent or release-window schedule plus measured runtime and bandwidth evidence.
     - Schedule timezone is strictly UTC (avoiding fixed UK local-time claims due to British Summer Time daylight-saving shifts).
     - Cambridge states that current-series grade thresholds become available on the day results are issued:
       - **March 2026 results**: 19 May 2026.
       - **June 2026 Cambridge International AS & A Level results**: 11 August 2026.
       - **November 2026 Cambridge International AS & A Level results**: 7 January 2027.
     - These are 2026-series planning anchors, not permanent annual dates. Future schedules must verify Cambridge’s official dates for each examination series before activation.
     - Official sources:
       - [March results release schedule](https://www.cambridgeinternational.org/exam-administration/march-series/march-results)
       - [June 2026 results release schedule](https://www.cambridgeinternational.org/programmes-and-qualifications/recognition-and-acceptance/guidance-for-universities/J26-exams-middle-east-for-universities-and-recognising-organisations/)
       - [November 2026 results release schedule](https://help.cambridgeinternational.org/hc/en-gb/articles/29567611785234-When-will-November-2026-results-be-released)
       - [School Support Hub past paper and threshold release policy](https://help.cambridgeinternational.org/hc/en-gb/articles/32168220870162-When-will-the-latest-question-papers-and-mark-schemes-be-available-on-the-School-Support-Hub)
   - **Cron Reliability & Concurrency Gates**:
     - Vercel cron delivery is best-effort and can trigger duplicate invocations or concurrent executions.
     - Explicit gates required before cron activation: duplicate delivery handling, concurrent invocation prevention, and idempotency / locking mechanisms.
     - Vercel does not retry failed invocations.
     - Instant Rollback does not remove or update active cron jobs.
     - Emergency rollback procedure: immediate disable via Vercel Dashboard (**Project Settings → Cron Jobs → Disable Cron Jobs**) and forward-fix removal of `vercel.json`.
   - **Preview Environment Boundary**:
     - Never add `SUPABASE_SERVICE_ROLE_KEY` or another elevated Supabase key to Preview environments.
     - Never invoke the deployed mutating endpoint with a valid token from Preview against Production Singapore.
     - Preview may test missing/invalid authorization only (verifying 401/503 responses without database credentials).
     - Authorized import behavior must be verified via automated test suites until an isolated non-production Supabase environment exists.

5. **Stage 1 Discovery-Only Cron Route Production Deployment & Observability Record:**
   - **Merge and Deployment**: Merged to `main` via PR [#18](https://github.com/SWEATChamp/Atlas/pull/18) at merge commit `ce2eaec8de41371113aee090fcc84525f7bdaca2` on 2026-09-18 at 04:30:21Z, and automatically deployed to Vercel production (`dpl_2t1Kbt6hJMMxiPgPz38cAWF459pz`).
   - **Production Verification**: Deployment status verified Ready on Singapore edge (`sin1`). Canonical domain `https://atlas-alpha-vert.vercel.app` and immutable deployment URL `https://atlas-9i7mm0ger-atlas-726e.vercel.app` verified with non-mutating HTTP checks:
     - Root redirect `/` returned HTTP/2 307 redirecting to `/dashboard`.
     - Sign-in page `/login` returned HTTP/2 200.
   - **Operational Reality & Credential Separation**:
     - Dedicated read-only discovery route `/api/cron/grade-threshold-discovery` is deployed to Production but dormant (expects `CRON_SECRET`).
     - Legacy/mutating endpoint `/api/cron/grade-thresholds` remains deployed and dormant, now requiring `GRADE_THRESHOLD_IMPORT_SECRET` to ensure elevated import permissions are strictly separated from discovery tokens.
     - Neither endpoint was invoked during deployment verification.
     - PR #18 did not provision or modify hosted environment variables; hosted values were not inspected.
     - `vercel.json` remains absent from the repository; zero repository-defined Production cron schedules are active.
     - No hosted Supabase access, schema migration, or database mutation occurred.
   - **Structured Runtime Logging & Observability Baseline**:
     - The discovery-only route emits exactly one sanitized, single-line structured JSON log per authorized execution (`lib/grade-thresholds/discovery-logger.ts`).
     - Stable schema includes event name (`grade_threshold_discovery_executed`), schema version, `ok`, `outcome`, HTTP status, `durationMs`, session count, manifest-required count, subject status counts, affected syllabus codes, and sanitized issue codes.
     - Informational logs (`console.info`) are emitted for healthy/informational outcomes (`no_change`, `unavailable`, `manifest_required`). Error-level logs (`console.error`) are emitted for failures (`check_failed`, `timeout`, or unexpected exceptions).
     - Strict data hygiene: zero URLs (PDF, index, baseline, or candidate), zero secrets or authorization headers, zero stack traces, and zero raw exception messages are ever logged.
   - **Proposed Operator-Polling Operating Model (Not Activated)**:
     - **Recommended Schedule**: `0 7 * * *` (UTC).
     - **Vercel Hobby Plan Execution Reality**: On Hobby, invocations occur at an arbitrary point within the scheduled hour (between 07:00 and 07:59 UTC). Cambridge’s published results anchors are 05:00 UTC for the March series and 06:00 UTC for the June and November series. The proposed 07:00 UTC schedule follows all three anchors.
     - **Log-Retention Boundary**: Vercel Hobby retains runtime function logs for exactly one hour. Operator polling relies on the sanitized structured log emitted to runtime logs (the HTTP response body is not automatically surfaced in Vercel logs).
     - **Off-Season Runbook**:
       1. Choose one fixed weekly inspection day.
       2. Check Vercel Function logs at approximately 07:30 UTC.
       3. If that day’s run has not yet triggered due to Hobby hourly jitter, inspect again shortly after 08:00 UTC.
       4. Review the structured outcome before the one-hour retention window expires.
     - **Results-Window Runbook (May, August, January)**:
       1. On official Cambridge results days and consecutive days until manifest admission, execute the two-stage check (07:30 UTC and post-08:00 UTC).
       2. If `outcome === "manifest_required"`, identify affected syllabus codes and review candidate publications for manual admission to `source-manifest.ts`. Note that `manifest_required` remains repeatable on subsequent daily runs until the reviewed manifest is updated and deployed.
     - **Outcome Classification**:
       - *Healthy*: `no_change` (all checked subjects match baseline or are historical).
       - *Informational*: `unavailable` (series not yet published on Cambridge tables).
       - *Operator Action Required*: `manifest_required` (newer session or changed table link detected; prepare reviewed manifest update).
       - *Failure Requiring Investigation*: `check_failed` (contradictory link, parse error, or network failure), `timeout` (upstream latency exceeded threshold), or `unexpected_error` (unhandled runner exception).
     - **Dashboard Nuance**: Vercel does not provide a documented dashboard "manual run" button for cron jobs. First authorized production invocation, schedule activation, emergency disable (**Project Settings → Cron Jobs → Disable Cron Jobs**), and permanent schedule removal remain separately approved operational actions.
   - **Transitive Isolation**: Verified via comprehensive structural tests that `/api/cron/grade-threshold-discovery`, `lib/grade-thresholds/discovery-runner.ts`, and `lib/grade-thresholds/discovery-logger.ts` have zero transitive imports or dependencies on `scheduled-import.ts`, `import-pipeline.ts`, `pdf-extraction.ts`, `supabase-persistence.ts`, `server.ts`, `pdfjs-dist`, `@supabase/supabase-js`, or `@supabase/ssr`.
   - **Pending Milestone 3 Gates**:
     - Cron activation remains blocked until an approved durable notification mechanism or documented operator polling procedure is established.
     - Controlled Production cron scheduling and operational monitoring remain pending.
     - Threshold manifest admission, PDF downloading, parsing, staging, review, approval, and publication remain manual and separately gated operations.

## General Production Configuration

- Configure Supabase authentication providers, Site URL, and allowed redirect URLs for the production domain.
- Keep service-role keys server-only and never expose them through `NEXT_PUBLIC_*` variables.
- Scope `NEXT_PUBLIC_APP_URL` by Vercel environment: use the production origin for Production and the corresponding branch origin for each Preview deployment. A branch-specific value must target Preview only.
- Keep the Supabase Site URL on the production origin and allow each reviewed Preview callback under Authentication → URL Configuration. Redeploy the matching Preview deployment after changing Vercel environment variables; do not promote a Preview merely to refresh its configuration.
- Enable optional analytics or scheduled jobs only when their implementation and ownership are documented.
