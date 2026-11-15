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

## Guardrails

- Historical fixtures (`.fixture`) deliberately use a non-`.sql` extension so standard SQL test runners do not execute older expectations against later schemas.
- Do not instruct or attempt running current 033-dependent expectations against 032, or 034-dependent expectations against an unupgraded baseline.
- Check both psql exit status and TAP output: all planned assertions must run with zero unexpected `not ok` lines. A successful psql exit alone does not prove test success.
- Never execute migration upgrade fixtures against hosted Preview or Production databases; all upgrade verification must occur exclusively within disposable local databases.
