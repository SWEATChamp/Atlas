# Local database verification

Use only a newly created, uniquely isolated disposable local database with Supabase-managed roles (`postgres`, `anon`, `authenticated`, `service_role`, `supabase_admin`), `auth` schema, extensions (`pgtap`), and mock auth helper functions (`auth.uid()`, `auth.jwt()`, `auth.role()`, `auth.email()`). Never run these fixture sequences on hosted Preview, Production, or an existing valuable database.

Status: Locally prepared and uncommitted only (not Preview- or production-verified). Application test runs are independently reproducible locally via `npm test`; database fixture evidence is documented from isolated disposable container runs.

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
   - Run `database/as_a2_readiness.test.sql` to establish the 032 baseline: 24 tests pass, and 3 known legacy readiness failures occur (tests 3, 4, 5, which expect cross-stage readiness increases for shared chapters and single-component papers).

5. **Genuine 032→033 Upgrade & Rollback**:
   - Run `fixtures/practice_032_to_033_upgrade.fixture` (14 assertions). This creates genuine 032 practice records before upgrading, snapshots them, verifies 032 early-A2 rejection (`P0005`), applies Migration 033 in-flight via `\ir`, verifies function signature invariance, confirms that pre-upgrade session rows, marks, provenance, and AS readiness scores are preserved, and validates 033 early-A2 logging capabilities and subsequent unlock activation before rolling back.

6. **Migration 033 Application**:
   - Apply `migrations/20261017000033_a2_practice_logging_and_indicators.sql` normally to the disposable database.

7. **Current-Schema Tests (033)**:
   - Run `database/practice_sessions.test.sql` (201 assertions).
   - Run `database/practice_mapping_validation.test.sql` (91 assertions).
   - Run `database/a2_practice_logging.test.sql` (24 assertions). Verifies on-route early A2 logging, stage tagging, readiness exclusion while in AS, off-route logging as history, science P5/P3 rules, early-A2 session updates, cross-user ownership rejection (`P0005`), rollback safety, exact readiness isolation (off-route Stats 2 contributes 0.00 to readiness), and security configuration/permissions.
   - Run `database/as_a2_readiness.test.sql` (27 assertions). Verifies that readiness behavior is 100% identical to the 032 baseline: exactly the same 24 tests pass and the same 3 known legacy baseline failures occur (tests 3, 4, 5), confirming that canonical readiness logic is unchanged.

## Guardrails

- Historical fixtures (`.fixture`) deliberately use a non-`.sql` extension so standard SQL test runners do not execute older expectations against later schemas.
- Do not instruct or attempt running current 033-dependent expectations against 032.
- Check both psql exit status and TAP output: all planned assertions must run with zero unexpected `not ok` lines. A successful psql exit alone does not prove test success.
