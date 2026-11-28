# Local database verification

Use only a newly created, uniquely isolated disposable local database with Supabase-managed roles (`postgres`, `anon`, `authenticated`, `service_role`, `supabase_admin`), `auth` schema, extensions (`pgtap`), and mock auth helper functions (`auth.uid()`, `auth.jwt()`, `auth.role()`, `auth.email()`). Never run these fixture sequences on hosted Preview, Production, or an existing valuable database.

Status: Locally verified on 2026-10-22 against a uniquely isolated disposable local database using `public.ecr.aws/supabase/postgres:17.6.1.140`. The complete documented migration and fixture sequence was executed, and all nine TAP suites passed: 600 planned assertions, 600 passed, 0 failed. In particular, `database/as_a2_readiness.test.sql` passed 27/27 on both Migration 032 and Migration 033. The local application test suite passed 581 tests with six intentional live-network skips (`npm test`). The database test commands and fixtures were run only against the disposable local database; no migrations or test fixtures were applied to hosted Preview or Production Supabase, and the local container is retained pending separate cleanup approval. An authenticated read-only browser smoke test passed on PR #35’s Vercel Preview. Full automated authentication-flow E2E, Production verification, and optional live Cambridge verification remain outstanding. Committed PR branch state.

## Schema-specific verification sequence

Testing must proceed strictly in forward migration order using schema-specific fixtures:

1. **Migration 031 Baseline**:
   - Apply committed migrations `000`–`029` and `031` in filename order.
   - Run `fixtures/practice_sessions_031.fixture` using psql with `ON_ERROR_STOP=1`. This is the byte-identical original 201-assertion suite validating 031 behavior.

2. **Historical 031→032 Upgrade & Rollback**:
   - Run `fixtures/practice_mapping_upgrade.fixture` in a separate psql process. Its 9 assertions create genuine unmapped records through the 031 RPC, apply 032 via `\ir`, verify historical graph/readiness preservation and the assessment predicate change, and roll back cleanly.

3. **Migration 032 Application**:
   - Apply `migrations/20261016000032_practice_mapping_validation.sql` normally to the disposable database.

4. **Migration 032 Baseline Checks**:
   - Run `fixtures/practice_mapping_032_baseline.fixture` (6 assertions). This proves that under 032, valid AS practice contributes to AS readiness while early A2 practice logging and off-route practice logging remain strictly rejected (`P0005`).
   - Run `database/as_a2_readiness.test.sql` to establish the 032 baseline: 27 assertions prepared with repaired fixtures for tests 3, 4, and 5 (repaired to validate canonical stage accessibility and normalized paper selection requirements; verified 27/27 passed on 2026-10-22).

5. **Genuine 032→033 Upgrade & Rollback**:
   - Run `fixtures/practice_032_to_033_upgrade.fixture` (14 assertions). This creates genuine 032 practice records before upgrading, snapshots them, verifies 032 early-A2 rejection (`P0005`), applies Migration 033 in-flight via `\ir`, verifies function signature invariance, confirms that pre-upgrade session rows, marks, provenance, and AS readiness scores are preserved, and validates 033 early-A2 logging capabilities and subsequent unlock activation before rolling back.

6. **Migration 033 Application**:
   - Apply `migrations/20261017000033_a2_practice_logging_and_indicators.sql` normally to the disposable database.

7. **Current-Schema Tests (033)**:
   - Run `database/practice_sessions.test.sql` (201 assertions).
   - Run `database/practice_mapping_validation.test.sql` (91 assertions).
   - Run `database/a2_practice_logging.test.sql` (24 assertions). Verifies on-route early A2 logging, stage tagging, readiness exclusion while in AS, off-route logging as history, science P5/P3 rules, early-A2 session updates, cross-user ownership rejection (`P0005`), rollback safety, exact readiness isolation (off-route Stats 2 contributes 0.00 to readiness), and security configuration/permissions.
   - Run `database/as_a2_readiness.test.sql` (27 assertions prepared with canonical readiness fixtures; verified 27/27 passed on 2026-10-22).

8. **Genuine 033→034 Upgrade & Rollback**:
   - Run `fixtures/staged_component_stage_correction_upgrade.fixture` using psql with `ON_ERROR_STOP=1` (20 planned assertions).
   - Operates strictly on a uniquely isolated disposable local database at schema 033. Never run on hosted Preview, Production, or any valuable database.
   - Proves clean-database compatibility: applies Migration 034 on an initial empty target catalogue before synthetic data is populated, verifying a safe no-op.
   - Sets up deterministic synthetic pre-034 catalogue data with the exact 40 malformed staged component variant tokens (`stage = 'as'`: 16 for Mathematics 9709 and 24 for Further Mathematics 9231) alongside representative protected carry-forward tokens, AS-only combinations, full-level linear combinations, science staged combinations (Physics, Chemistry, Computer Science), and synthetic student records. All representative combinations use valid schema-033 constraints (`planner_eligibility = 'unreviewed'`, `atlas_route_id = NULL`), import runs use valid terminal status (`'succeeded'`) and timestamps, and practice sessions use schema-033 column `duration_mins`.
   - Snapshots protected tables and rows before upgrading using deterministic MD5 hashes.
   - Applies `migrations/20261114000034_staged_component_stage_correction.sql` in-flight transactionally via `\ir`.
   - Proves that exactly 40 staged component tokens transition from `stage = 'as'` to `stage = 'a2'` with the exact 16/24 subject split.
   - Proves a second in-flight application is a true safe idempotent no-op.
   - Proves the complete fail-closed guard test matrix using savepoints and `throws_ok`:
     1. Empty target catalogue: safely handled as a clean no-op.
     2. Partial publication state: exactly 1 of 2 target publications present is rejected (`P0001`).
     3. Invalid token stage: an allowlisted target token with `stage = NULL` is rejected (`P0001`).
     4. Partial pre-application state: mixed `as`/`a2` state (1 `as` / 39 `a2`) is rejected (`P0001`).
     5. Missing allowlisted token resolution: fewer than 40 distinct matched tokens is rejected (`P0001`).
     6. Duplicate allowlisted token resolution: duplicate matching combinations/tokens is rejected (`P0001`).
     7. Unexpected unallowlisted defective token: extra `stage = 'as'` component variant in target publications is rejected (`P0001`).
   - Proves hash-for-hash invariance of all protected catalogue and student data (carry-forwards, AS-only combinations, linear combinations, science staged data, planner eligibility, route assignments, publications, target token non-stage columns, and student records).
   - Ends with a complete transactional rollback.

9. **Migration 034 Application**:
   - Apply `migrations/20261114000034_staged_component_stage_correction.sql` normally to the disposable database.
   - On a clean/fresh database with an empty target catalogue (no active published June 2026 publications for 9709 or 9231), the migration detects the empty catalogue and exits cleanly as a safe no-op. Future threshold imports will use the corrected Slice 1 importer.

10. **Migration 035 Application & Verification (Gate 1 Carry-Forward Evidence Contracts)**:
   - Apply `migrations/20261115000035_carry_forward_evidence_contracts.sql` normally to the disposable database.
   - Run `database/carry_forward_schema_035.test.sql` using psql with `ON_ERROR_STOP=1` (137 planned assertions).
   - Proves check-constraint lifecycle, scope guards (global, administrative zone, territory, and China Zone 5 restriction), and array element validation (rejecting NULL or whitespace-only elements across all evidence arrays).
   - Proves strict lifecycle mutual exclusivity across all statuses and rejection of blank reviewer, authorizer, declaration, locator, and reason strings.
   - Proves cross-syllabus option coexistence and bridge link trigger validation (subject matching through `public.subjects`, session alignment, component variant sitting tokens and order preservation, and scope containment).
   - Proves structural immutability triggers on linked source mappings and evidence documents while permitting fail-closed lifecycle transitions.
   - Proves non-recursive published read view security, base-table lockdown under least privilege (direct read and write denied to both anon and authenticated), and dynamic fail-closed behavior of `public.published_grade_threshold_combinations` for staged carry-forward tokens.
   - Ends with complete transactional rollback; leaves zero fixture rows in the catalogue.

11. **Migration 036 Application & Verification (Gate 2 Inactive China Zone 5 Evidence Seeding)**:
   - Apply `migrations/20261116000036_seed_china_zone5_carry_forward_evidence.sql` normally to the disposable database.
   - Run `database/carry_forward_evidence_036.test.sql` using psql with `ON_ERROR_STOP=1` (85 planned assertions).
   - Proves deterministic seeding of exactly 1 evidence document (`00000036-0000-4000-8000-000000000001`) and exactly 10 source mappings (6 for 9709, 4 for 9231).
   - Proves document checksum matches 32-byte binary SHA-256 (`80f88e04138b06e984c14a5292a0c298e654ca35806d3344043d9ad7de729fda`).
   - Proves evidence remains strictly unreviewed (`review_status = 'unreviewed'`, `evidence_status = 'unreviewed'`), inactive (`is_active = FALSE`), and without reviewer or authorizer metadata.
   - Proves all 10 mappings preserve exact component ordering, mapping-specific paper variant unions, distinct June/November 2025 sessions, and China Zone 5 scope.
   - Proves cross-syllabus `DC`/`EC` coexistence, multi-option fanout for tokens `83` and `93`, and complete absence of component `25`.
   - Proves zero bridge links exist, published views remain completely empty/unaltered, and least-privilege table locks deny direct access to `anon` and `authenticated`.
   - Proves exact bidirectional canonical expected-set comparison covering all ten mappings across all 23 non-timestamp columns and the document across all 17 non-timestamp columns.
   - Enforces hardened fail-closed reapplication pre-checks: permits an idempotent no-op only when existing document and all ten mappings match every expected non-timestamp field; rejects any altered metadata, altered lifecycle state, substituted rows, missing rows, extra rows, or orphaned mappings with atomic rollback.
   - Leaves seeded evidence records persisted in the database for downstream review and linking while catalogue data remains count/hash invariant.

12. **Milestone 5 Target Grade Planner Preflight Verification**:
   - Run `database/milestone_5_planner_preflight.test.sql` using psql with `ON_ERROR_STOP=1` (65 planned assertions).
   - Operates strictly on a uniquely isolated disposable local database migrated through Migration 036. Never run on hosted Preview, Production, or any valuable database.
   - Proves migration ledger ends at Migration 036 (`20261116000036`).
   - Asserts pre-seeding baseline state: Migration 036 evidence remains unreviewed and inactive, 0 bridge links exist, published carry-forward view has 0 rows, and Math Option DC planner eligibility fails closed.
   - Validates authentic publication provenance: all 3 publications reference the common June 2026 grade-threshold index (`https://www.cambridgeinternational.org/.../grade-threshold-tables/june-2026/`) and exact Cambridge PDF endpoints with verified SHA-256 checksums (Chem 9701: `761525...pdf` / `3ecf1e...`; Phys 9702: `761526...pdf` / `211cfe...`; Math 9709: `761530...pdf` / `1b277a...`).
   - Validates authentic weighting provenance: all 3 weighting-source rows reference the single official document *Syllabus component weighting factors: November 2025, March 2026 and June 2026* (`206341-syllabus-component-weighting-factors.pdf`, SHA-256 `d96f96e5d8847470fd7291f75aa01184b3c0cff7075b5010968e16d94218ada9`), with exact locators populated on `grade_threshold_weighting_entries` (9701: p. 85, rows 32, 36, 41; 9702: p. 86, rows 32, 36, 41, 47; p. 87, row 12; 9709: p. 89, rows 31, 40; p. 90, row 12).
   - Validates authentic June 2026 component marks across all 65 component mark rows with traceable `source_row_metadata` (9701/12: `25..11`, 9701/22: `37..12`, 9701/33: `22..10`; 9702/12: `30..15`, 9702/22: `40..17`, 9702/33: `33..20`, 9702/42: `62..21`, 9702/52: `20..8`; 9709/35: `55..16`, 9709/55: `45..13`, 9709/11: `59..15`, 9709/12: `61..10`, 9709/13: `61..13`).
   - Validates Math Pure 1 Grade A benchmark group ceiling average: `CEIL((59 + 61 + 61) / 3.0) = 61`.
   - Validates fail-closed safety guardrails against the actual fixture routine `pg_temp.apply_m5_planner_preflight_fixture()`:
     - Interrupted-run detection: schema `_fixture_m5_preview` raises `55000`.
     - Catalogue collision detection: pre-existing import run ID raises `23505`.
     - Synthetic identity collision detection: pre-existing synthetic `auth.users` ID raises `23505`.
   - Executes `fixtures/milestone_5_planner_preflight.fixture` to assemble the authentic June 2026 planner scenario: exactly 135 rows across 13 tables (1 import run, 3 publications, 3 weighting sources, 11 weighting entries, 13 component variants, 65 component marks, 1 benchmark group, 3 benchmark members, 3 combinations, 11 combination tokens, 17 combination marks, 1 carry-forward bridge link, and 3 Chem past paper attempts for User 1).
   - Validates temporary evidence promotion (`review_status = 'approved'`, `evidence_status = 'confirmed'`) and bridge link establishment to Math Option DC token 82.
   - Proves published view eligibility: `published_grade_threshold_carry_forward_mappings` exposes exactly 1 row, and `published_grade_threshold_combinations` exposes Chem S3, Phys AY, and Math DC with `per_paper_allocation_eligible = TRUE`.
   - Validates positive owner route configuration and updates as User 2, and enforces strict cross-user RLS isolation (cross-user mutations update 0 rows, `configure_subject_route` on another user raises `42501 Unauthorized`, and direct reads return 0 rows).
   - Proves owner scoping of historical past paper attempts (scores 27, 39, 22).
   - Ends with a complete transactional rollback, followed by post-run zero-delta audit proving 0 residual rows across all 13 tables, 0 residual users, evidence records unreviewed and inactive, and published views empty. Repeatable across multiple runs.

13. **Milestone 5 Durable Catalogue & Reversible Hosted-Smoke Verification (Gate 3)**:
   - Run `database/milestone_5_catalogue_and_smoke.test.sql` using psql with `ON_ERROR_STOP=1` (83 planned assertions, ending with standard `finish()`).
   - Operates strictly on a uniquely isolated disposable local database migrated through Migration 036. Never run on hosted Preview, Production, or any valuable database without explicit gate authorization.
   - Proves Option A durable catalogue architecture: seeds the complete 2,674-row June 2026 Cambridge catalogue across 11 tables (`seeds/catalogue/june_2026_m5_catalogue.sql`) covering all five MVP subjects (`9709`, `9231`, `9702`, `9701`, `9618`), and confirms retention through smoke teardown (including idempotent upgrade from the earlier 131-row subset while preserving all 131 deterministic row IDs).
   - Validates exact catalogue integrity via `fixtures/catalogue/milestone_5_catalogue_validator.sql` implementing bidirectional typed `EXCEPT` comparisons and per-subject checks across all five syllabuses returning `(total_catalogue_delta INT, total_catalogue_rows INT)`. Confirms `delta = 0` and `rows = 2674` (`1` run, `5` publications, `5` weighting sources, `190` weighting entries, `114` component variants, `570` component marks, `1` benchmark group, `3` benchmark members, `184` combinations [`66` AS/linear `eligible` + `1` preserved gated Option `DC` = `67` `planner_eligibility='eligible'`, `95` `unreviewed` staged, `22` `unsupported`], `542` combination tokens, and `1,059` combination marks).
   - Proves detection of 7 negative catalogue mutations (missing row, extra row, component mark drift, weighting factor drift, invalid FK reference, token metadata corruption, unexpected scope) with complete rollback safety.
   - Validates fail-closed safety guardrails for `fixtures/milestone_5_hosted_smoke/bootstrap.sql`:
     - Interrupted-run detection: schema `_m5_smoke_snapshot` raises `55000` fail-closed.
     - Dynamic user resolution: missing user IDs raise `P0002`, identical user IDs raise `P0001`, non-existent IDs raise `P0002`.
   - Proves pre-existing user state preservation & restoration across 7 snapshotted tables (`_m5_smoke_snapshot`):
     - Pre-existing Chemistry 9701 staged/A2 enrollment with non-null `a2_unlocked_at` and `a2_unlock_method`.
     - Pre-existing paper selections with original IDs, stages, component names, and timestamps.
     - Pre-existing A2 chapter and pending daily mission.
     - Pre-existing archived Physics 9702 enrollment (re-activated during bootstrap, fully re-archived during teardown).
     - Pre-existing untouched Biology 9700 enrollment (zero `updated_at` timestamp drift across both cycles).
     - Unrelated user data preservation (User 3 remains 100% untouched).
   - Proves bootstrap route conversion: mutates User 1 Chemistry to `as_only`, clears A2 unlock metadata, replaces paper selections, and skips inaccessible A2 chapter missions via `cancel_inaccessible_missions`.
   - Executes `fixtures/milestone_5_hosted_smoke/assertions.sql` confirming scenario readiness and strict cross-user RLS isolation under `authenticated` role.
   - Proves teardown fail-closed guard: an induced restoration mismatch (e.g. mutated `document_title`) raises `P0004` and preserves `_m5_smoke_snapshot` for post-incident inspection.
   - Proves complete teardown restoration via `fixtures/milestone_5_hosted_smoke/teardown.sql`:
     - Removes smoke-created past paper attempts, bridge links, and application rows child-before-parent.
     - Restores original `subject_paper_selections` rows with exact IDs, component names, paper numbers, stages, and timestamps.
     - Restores all mutable `user_subjects` fields (`target_grade`, `study_route`, `current_stage`, `a2_unlocked_at`, `a2_unlock_method`, `is_archived`).
     - Restricts `user_subjects` updates using null-safe `IS DISTINCT FROM` comparisons, preventing unnecessary updates and eliminating `updated_at` trigger drift on untouched enrollments.
     - Restores `daily_missions` changed by `cancel_inaccessible_missions` back to pending with NULL skip metadata.
     - Enforces scoped bidirectional before/after equality across all snapshotted tables before dropping `_m5_smoke_snapshot`.
     - Compares all 12 non-`updated_at` columns of `user_subjects` bidirectionally (`id, user_id, subject_id, exam_date, target_grade, priority, is_archived, created_at, study_route, current_stage, a2_unlocked_at, a2_unlock_method`). The single excluded column is `updated_at`, which fires the BEFORE UPDATE trigger `set_user_subjects_updated_at()` only on legitimately mutated rows.
     - Retains the complete 2,674-row durable catalogue under Option A.
   - Proves full lifecycle repeatability across two complete consecutive bootstrap-assertions-teardown cycles.
   - Verified post-teardown using read-only query `fixtures/milestone_5_hosted_smoke/verify_post_teardown.sql`.

## Guardrails

- Historical fixtures (`.fixture`) deliberately use a non-`.sql` extension so standard SQL test runners do not execute older expectations against later schemas.
- Do not instruct or attempt running current 033-dependent expectations against 032, or 034-dependent expectations against an unupgraded baseline.
- Check both psql exit status and TAP output: all planned assertions must run with zero unexpected `not ok` lines. A successful psql exit alone does not prove test success.
- Never execute migration upgrade fixtures against hosted Preview or Production databases; all upgrade verification must occur exclusively within disposable local databases.
