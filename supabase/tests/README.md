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

## Guardrails

- Historical fixtures (`.fixture`) deliberately use a non-`.sql` extension so standard SQL test runners do not execute older expectations against later schemas.
- Do not instruct or attempt running current 033-dependent expectations against 032.
- Check both psql exit status and TAP output: all planned assertions must run with zero unexpected `not ok` lines. A successful psql exit alone does not prove test success.
