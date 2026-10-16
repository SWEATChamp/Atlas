# Local database verification

Use only a newly created disposable local database with Supabase-managed roles,
auth schema, extensions and auth functions. Never run these fixture sequences on
hosted Preview, Production, or an existing valuable database.

The current `database/practice_sessions.test.sql` retains all 201 foundation
assertions. Its fixture factory now supplies actual compatible chapters for
successful writes, because Migration 032 requires mappings. Explicit malformed
mapping inputs are left untouched; `practice_mapping_validation.test.sql` tests
the mandatory-mapping and source-free/off-route assessment contracts directly.

For a complete 031→032 regression:

1. Apply committed migrations 000–029 and 031, in filename order.
2. Run `fixtures/practice_sessions_031.fixture` using psql with
   `ON_ERROR_STOP=1`. This is the byte-identical original 201-assertion suite.
3. Run `fixtures/practice_mapping_upgrade.fixture` in a separate psql process.
   Its 9 assertions create real unmapped records through the 031 RPC, apply 032
   using a relative include, verify historical graph/readiness preservation and
   the narrowly changed assessment predicate, then roll the whole upgrade back.
4. Apply `20261016000032_practice_mapping_validation.sql` normally in this
   disposable database.
5. Run current `database/practice_sessions.test.sql` (201 assertions) and
   `database/practice_mapping_validation.test.sql` (90 assertions). Each rolls
   all test data back.

Historical fixtures deliberately have a non-`.sql` extension so ordinary SQL
test discovery cannot execute 031-only expectations against the current schema.
Do not weaken or delete their assertions to make a latest-schema run pass.

Check both psql exit status and TAP output: all planned assertions must run with
zero `not ok` lines or failed-plan diagnostics. A successful psql exit alone
does not prove pgTAP success.
