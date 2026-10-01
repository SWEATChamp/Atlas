# Security Audit: Legacy Database Grants & Least-Privilege Remediation Record

**Document Version:** 1.4.0
**Audit Date:** 2026-09-26 / 2026-09-30
**Scope:** PostgreSQL `public` schema (43 base tables, 3 views; 46 relations total) on Supabase infrastructure
**Audit Posture:** Strict catalog inspection and empirical local verification
**Target Roles:** `PUBLIC`, `anon`, `authenticated`, `service_role`
**Reference Assets:**
- Migration history: `supabase/migrations/20260704000000_extensions.sql` through `20260923000028_route_remap_integrity_and_stage_preservation.sql`
- Authoritative Migration: `supabase/migrations/20260926000029_least_privilege_grant_remediation.sql`
- Automated test suite: `supabase/tests/database/legacy_grants_security_audit.test.sql`

---

## 1. Executive Summary

In Supabase PostgreSQL environments, relations created in schema `public` inherit default privileges configured for roles `anon` and `authenticated`. Historically across Migrations 000–020, relation creation under role `postgres` assigned `ALL` privileges (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, and on PostgreSQL 17+, `MAINTAIN`) to both `anon` and `authenticated`.

While application development systematically enabled Row Level Security (RLS) across all user-facing tables, subsequent hardening migrations (e.g., Migrations 023, 024, 026, 027) selectively executed `REVOKE INSERT, UPDATE, DELETE ... FROM anon, authenticated`, leaving inherited **`TRUNCATE`**, **`TRIGGER`**, **`REFERENCES`**, and PostgreSQL 17+ **`MAINTAIN`** grants unrevoked across public relations.

This audit establishes:
1. **The RLS Bypass Risk of `TRUNCATE`**: PostgreSQL explicitly excludes `TRUNCATE` from Row Level Security enforcement. Any role possessing `TRUNCATE` table privileges can wipe entire tables regardless of restrictive row-level ownership policies (`auth.uid() = user_id`).
2. **Defensive Boundaries**: PostgREST (the HTTP API engine powering Supabase client SDKs) does not expose an HTTP verb mapping to the SQL `TRUNCATE` statement. Therefore, external HTTP REST clients cannot trigger table truncation through standard endpoints. However, in multi-tenant or defense-in-depth architectures, leaving `TRUNCATE` granted to untrusted roles presents critical operational and structural risk if direct connection poolers (port 5432/6543) or dynamic SQL RPCs are introduced.
3. **Internal Data Exposure**: The internal table `google_docs_tokens` stores encrypted OAuth2 tokens. Previously, its protection relied on `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` with zero policies defined. While this blocks client `SELECT`, `INSERT`, `UPDATE`, and `DELETE`, it did not block `TRUNCATE` or `REFERENCES`.
4. **Authoritative Remediation**: A dedicated, non-destructive migration (`supabase/migrations/20260926000029_least_privilege_grant_remediation.sql`) revokes all excessive privileges, locks down sensitive internal and ledger relations, restores exactly six required authenticated table-level write pairs, preserves the scoped `user_subjects` column update, establishes secure defaults for future `postgres`-created application relations, and instructs PostgREST to reload its schema cache via `NOTIFY pgrst, 'reload schema';`. Migration 028 assets remain completely unmodified.
5. **Role Semantics (`anon` vs `PUBLIC`)**:
   - `anon` is the unauthenticated Supabase API role assigned to unauthenticated API requests.
   - `PUBLIC` is PostgreSQL's implicit grant target applying automatically to every database role (including `anon`, `authenticated`, `postgres`, and `service_role`).
   - Revoking privileges from `PUBLIC` prevents roles from inheriting those privileges implicitly through PostgreSQL's default permission inheritance mechanisms.
   - Explicit grants to `authenticated` and `service_role` remain separately and intentionally controlled.
6. **Preservation of Existing Application Permissions**:
   - `authenticated` retains only six table-level write pairs: `past_papers.UPDATE`, `past_papers.DELETE`, `profiles.UPDATE`, `user_chapters.INSERT`, `user_chapters.UPDATE`, and `user_settings.INSERT`.
   - `subject_stage_results` becomes read-only to authenticated clients.
   - `user_subjects` retains column-level `UPDATE` only on `exam_date`, `target_grade`, and `priority`; it receives no table-level write privilege.
   - Automated tests assert the exact effective privilege sets rather than only checking selected revocations.
7. **Application-Ownership Boundary**: Migration 029 remediates existing Atlas public relations and future public relations created by the `postgres` role through the supported Atlas migration workflow. Supabase-managed `supabase_admin` defaults are platform-owned and outside this application migration's scope. Hosted rollout must stop if any public application relation is not owned by `postgres`; ownership must never be repaired automatically by this migration.

---

## 2. Why Row Level Security (RLS) Does Not Protect Against TRUNCATE

A common misconception in PostgreSQL application security is that enabling Row Level Security (`ENABLE ROW LEVEL SECURITY`) protects a table against all unauthorized destructive operations.

The official PostgreSQL documentation explicitly warns:
> *"Row security does not apply to the `TRUNCATE` command. To prevent a user from truncating a table, table-level permissions must be revoked."*
> — [PostgreSQL Documentation, Chapter 41: Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

### Mechanics of the Vulnerability:
- **How RLS operates**: RLS policies evaluate SQL expressions (such as `auth.uid() = user_id`) on a per-row basis during query planning and execution for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
- **How `TRUNCATE` operates**: `TRUNCATE` is a Data Definition / Bulk Manipulation command that bypasses table scans and row-by-row triggers altogether. It allocates a new relfilenode on disk, instantly releasing storage blocks for all existing tuples without inspecting individual rows.
- **The Consequence**: Because `TRUNCATE` never evaluates individual rows, RLS policy filters are not evaluated. If an untrusted caller authenticating as `authenticated` executes `TRUNCATE <table_name>;`, the entire table is wiped, irrespective of whether every row belongs to another user.

### Secondary Inherited Privileges: `TRIGGER` and `REFERENCES`
1. **`TRIGGER`**: Allows the grantee to define triggers on the relation (`CREATE TRIGGER ... ON <table>`). Even without superuser rights, unauthorized triggers could invoke security-definer procedures or introduce locking side effects.
2. **`REFERENCES`**: Allows the grantee to create foreign key constraints pointing to columns of the target table. An unauthorized user creating a temporary or auxiliary table with a foreign key constraint can acquire shared locks on the target table, observe constraint validation failures to infer data existence across tenant boundaries, or induce denial-of-service deadlocks.

### PostgreSQL 17+ `MAINTAIN`

PostgreSQL 17 added the table-level `MAINTAIN` privilege. It authorizes maintenance operations including `VACUUM`, `ANALYZE`, `CLUSTER`, `REFRESH MATERIALIZED VIEW`, `REINDEX`, and `LOCK TABLE`. These operations are not part of the Atlas client contract, so Migration 029 treats `MAINTAIN` as a dangerous client privilege and revokes it from `PUBLIC`, `anon`, and `authenticated` on existing and future `postgres`-created public relations. The authorized hosted checkpoint did not record the server version, so preflight-v2 must stop before applying the migration unless `server_version_num >= 170000` confirms the `MAINTAIN` syntax is supported.

*Authoritative reference:* [PostgreSQL 17 GRANT documentation](https://www.postgresql.org/docs/17/sql-grant.html)

---

## 3. Comprehensive Object Catalog & Relation Terminology

To prevent confusion between base tables, views, and view-inclusive relation counts:
- **Base Tables**: Exactly **43** base tables exist in schema `public`.
- **Views**: Exactly **3** views exist in schema `public`.
- **Total Relations**: Exactly **46** relations (`r`, `v`, `m`, `p`) exist in schema `public`.

In PostgreSQL `information_schema.table_privileges`, views are reported alongside base tables in the `table_name` column. When a role holds a grant across all catalogued relations including views, queries aggregating `COUNT(DISTINCT table_name)` will report relation counts (up to 46), not strictly base-table counts.

The hosted Atlas catalogue contains exactly 6 syllabus/catalogue base tables (`subjects`, `chapters`, `subject_papers`, `chapter_papers`, `subject_valid_routes`, and `subject_route_papers`), 10 public grade-threshold base tables, and 2 published grade-threshold views. It does not contain `exam_boards` or `qualifications` relations.

### 43 Base Tables:
1. `achievement_definitions`
2. `ai_coach_conversations`
3. `ai_coach_messages`
4. `challenge_progress`
5. `chapter_papers`
6. `chapters`
7. `daily_missions`
8. `friend_requests`
9. `friendships`
10. `google_docs_tokens`
11. `grade_threshold_combination_marks`
12. `grade_threshold_combination_tokens`
13. `grade_threshold_combinations`
14. `grade_threshold_component_marks`
15. `grade_threshold_component_variants`
16. `grade_threshold_import_issues`
17. `grade_threshold_import_runs`
18. `grade_threshold_publications`
19. `grade_threshold_variant_benchmark_groups`
20. `grade_threshold_variant_benchmark_members`
21. `grade_threshold_weighting_entries`
22. `grade_threshold_weighting_sources`
23. `notifications`
24. `paper_question_attempts`
25. `past_papers`
26. `profiles`
27. `pvp_challenges`
28. `shop_items`
29. `streaks`
30. `study_pets`
31. `subject_paper_selections`
32. `subject_papers`
33. `subject_route_papers`
34. `subject_stage_results`
35. `subject_valid_routes`
36. `subjects`
37. `user_achievements`
38. `user_chapters`
39. `user_currencies`
40. `user_inventory`
41. `user_settings`
42. `user_subjects`
43. `xp_events`

### 3 Views:
1. `profiles_public` (introduced in Migration 013)
2. `published_grade_threshold_combinations` (introduced in Migration 027)
3. `published_grade_threshold_variant_benchmarks` (introduced in Migration 027)

---

## 4. Resolution of the Custom-Subject Inconsistency

Early migrations (Migration 007) introduced Row Level Security policies on `subjects` for non-global custom subjects (`auth.uid() = created_by AND is_global = FALSE`). Schema comments and early roadmap items similarly referenced custom-subject creation.

However, an exhaustive audit of the application codebase reveals:
1. **Application Code**: The current client and server actions (`lib/actions/subjects.ts`, `components/subjects/subject-manager.tsx`) only support enrolling in pre-seeded Cambridge subjects via `add_subject_enrollment` RPC and archiving via `archive_subject_enrollment` RPC. There is zero UI or server action logic that inserts into table `subjects`.
2. **Prior Database State**: Migration 027 (lines 1693–1695) established `GRANT SELECT ON TABLE public.subjects TO authenticated, service_role;` and did not grant table-level `INSERT`, `UPDATE`, or `DELETE`. Thus, direct table-level mutations on `subjects` were already non-functional for `authenticated` users prior to Migration 029.
3. **Conclusion & Policy**: Custom-subject creation via direct SQL write is intentionally dormant and unsupported in the current product. Migration 029 preserves this existing read-only effective privilege state by explicitly revoking `INSERT, UPDATE, DELETE` from `PUBLIC, anon, authenticated` and granting `SELECT` to `authenticated`. No functioning application workflow is removed or altered.

---

## 5. Empirical Baseline Privilege Matrix (Pre-029 vs Post-029)

### Baseline Privilege Summary (Pre-Migration 029):
Query:
```sql
SELECT grantee, privilege_type, COUNT(DISTINCT table_name) AS relation_count
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND grantee IN ('PUBLIC', 'anon', 'authenticated')
GROUP BY grantee, privilege_type ORDER BY grantee, privilege_type;
```

Pre-029 Empirical Counts:
```
    grantee    | privilege_type | relation_count
---------------+----------------+----------------
 anon          | DELETE         |             27
 anon          | INSERT         |             27
 anon          | REFERENCES     |             43
 anon          | SELECT         |             43
 anon          | TRIGGER        |             43
 anon          | TRUNCATE       |             43
 anon          | UPDATE         |             27
 authenticated | DELETE         |             27
 authenticated | INSERT         |             27
 authenticated | REFERENCES     |             44
 authenticated | SELECT         |             44
 authenticated | TRIGGER        |             44
 authenticated | TRUNCATE       |             44
 authenticated | UPDATE         |             27
 PUBLIC        | (none)         |              0
```

These counts are the empirical hosted baseline captured before Migration 029. They reflect effective legacy default grants, not merely the explicit `GRANT` statements visible in migration files.

The checkpoint's `pg_class.relacl` evidence separately records PostgreSQL 17+ `MAINTAIN` (`m`) on **43** relations for `anon` and **44** for `authenticated`; `PUBLIC` has **0**. The checkpoint did not capture the hosted server version, so rollout must verify PostgreSQL 17+ before executing `MAINTAIN` syntax.

### Remediated Privilege Target (Post-Migration 029):
Post-029 Expected Counts:
```
    grantee    | privilege_type | relation_count
---------------+----------------+----------------
 anon          | SELECT         |             41
 authenticated | DELETE         |              1
 authenticated | INSERT         |              2
 authenticated | SELECT         |             43
 authenticated | UPDATE         |              3
 PUBLIC        | (none)         |              0
```

Key Invariants Enforced:
- **`TRUNCATE`**: Completely eliminated across all 46 relations (0 for `PUBLIC`, 0 for `anon`, 0 for `authenticated`).
- **`TRIGGER`**: Completely eliminated across all 46 relations (0 for `PUBLIC`, 0 for `anon`, 0 for `authenticated`).
- **`REFERENCES`**: Completely eliminated across all 46 relations (0 for `PUBLIC`, 0 for `anon`, 0 for `authenticated`).
- **`MAINTAIN` (PostgreSQL 17+)**: Reduced from 43 relations for `anon` and 44 for `authenticated` to 0 for `PUBLIC`, `anon`, and `authenticated`.
- **`PUBLIC` & `anon` Writes**: Completely eliminated (0 `INSERT`, 0 `UPDATE`, 0 `DELETE`).
- **`authenticated` Writes**: Exactly six table-level `(relation, privilege)` pairs remain: `past_papers.DELETE`, `past_papers.UPDATE`, `profiles.UPDATE`, `user_chapters.INSERT`, `user_chapters.UPDATE`, and `user_settings.INSERT`. This is 2 relations with `INSERT`, 3 with `UPDATE`, and 1 with `DELETE`.
- **`user_subjects` Writes**: No table-level write privilege; column-level `UPDATE` remains only on `(exam_date, target_grade, priority)`.
- **Client Dangerous Privileges**: `TRUNCATE`, `TRIGGER`, `REFERENCES`, and PostgreSQL 17+ `MAINTAIN` are zero for `PUBLIC`, `anon`, and `authenticated`.
- **Directory View Boundary**: `anon` cannot `SELECT` from owner-executed `profiles_public`; `authenticated` retains `SELECT`.
- **Reads**: `anon` retains `SELECT` on 41 relations and `authenticated` on 43. Broader anonymous base-table read tightening is deliberately deferred to a separate migration so it can be reviewed against product requirements independently.
- **`service_role` Access**: Retains full effective administrative privileges (`SELECT, INSERT, UPDATE, DELETE`) across sensitive internal tables, ledgers, RPC tables, and master catalogues.

### 5.1 Future-Object Ownership Scope

`ALTER DEFAULT PRIVILEGES FOR ROLE postgres` affects only future relations created by `postgres`. The hosted checkpoint records all 46 current public relations as `postgres`-owned, matching the supported Atlas migration workflow. Supabase-managed `supabase_admin` defaults remain platform-owned and are not altered. Before hosted rollout, a read-only ownership gate must return zero non-`postgres`-owned public application relations; any owner drift is a hard stop requiring review or Supabase Support, never automatic repair.

---

## 6. Automated pgTAP Audit Test Suite (23 Assertions)

The test suite at `supabase/tests/database/legacy_grants_security_audit.test.sql` evaluates 23 comprehensive security assertions within a rollback-safe transaction. The tests employ both PostgreSQL effective privilege functions (`has_table_privilege()`, `has_column_privilege()`) across role contexts and catalog / `information_schema` inspection where applicable to verify real runtime authorization boundaries:

1. **Assertion 1**: No relation in `public` schema has `TRUNCATE` granted to `anon`.
2. **Assertion 2**: No relation in `public` schema has `TRUNCATE` granted to `authenticated`.
3. **Assertion 3**: No relation in `public` schema has `TRUNCATE` granted to `PUBLIC` (explicit or effective).
4. **Assertion 4**: No relation in `public` schema has `TRIGGER` granted to `anon`, `authenticated`, or `PUBLIC`.
5. **Assertion 5**: No relation in `public` schema has `REFERENCES` granted to `anon`, `authenticated`, or `PUBLIC`.
6. **Assertion 6**: No relation in `public` schema has `INSERT`, `UPDATE`, or `DELETE` granted to `anon` or `PUBLIC`.
7. **Assertion 7**: Sensitive OAuth table `google_docs_tokens` has zero client grants (`anon`, `authenticated`, `PUBLIC`).
8. **Assertion 8**: Internal import tables (`grade_threshold_import_runs`, `grade_threshold_import_issues`) have zero client grants.
9. **Assertion 9**: Ledger and RPC-managed tables (`xp_events`, `streaks`, `daily_missions`, `subject_paper_selections`) have zero write grants to `authenticated` or `PUBLIC`.
10. **Assertion 10**: Catalogue tables (`subjects`, `chapters`, `achievement_definitions`, `shop_items`) have zero write grants to `authenticated` or `PUBLIC` (specifically covering master catalogue tables; does not cover unrelated tables).
11. **Assertion 11**: `authenticated` retains `SELECT` on all 8 catalogue and ledger tables.
12. **Assertion 12**: `authenticated` retains `SELECT` only on `subject_stage_results`.
13. **Assertion 13**: `user_subjects` retains column `UPDATE` privileges on exactly `exam_date`, `target_grade`, and `priority`.
14. **Assertion 14**: `user_subjects` has zero `UPDATE` privileges on any non-target columns.
15. **Assertion 15**: `service_role` retains effective `SELECT, INSERT, UPDATE, DELETE` on sensitive internal tables.
16. **Assertion 16**: `service_role` retains effective `SELECT, INSERT, UPDATE, DELETE` on ledger and RPC tables.
17. **Assertion 17**: `service_role` retains effective `SELECT, INSERT, UPDATE, DELETE` on catalogue tables.
18. **Assertion 18**: Newly created `postgres`-owned tables inherit zero `TRUNCATE`/`TRIGGER`/`REFERENCES`/`MAINTAIN` grants (all client roles) and zero write grants (`anon`/`PUBLIC`), verified against a transaction-scoped test relation (`public.audit_test_future_table`).
19. **Assertion 19**: Newly created tables grant full table privileges (including `MAINTAIN`) to `service_role`, verified on the transaction-scoped test relation before it is dropped prior to transaction rollback.
20. **Assertion 20**: `profiles_public` grants `SELECT` to `authenticated` and not to `anon`.
21. **Assertion 21**: `authenticated` has exactly the six approved table-level write pairs and no others.
22. **Assertion 22**: Newly created `postgres`-owned tables grant `authenticated` zero table-level `INSERT`, `UPDATE`, or `DELETE` privileges.
23. **Assertion 23**: No existing public relation grants effective PostgreSQL 17+ `MAINTAIN` to `anon`, `authenticated`, or `PUBLIC`.

The rollout gate requires all 23 assertions to pass cleanly (`23/23 ok`).

### 6.1 PostgREST Schema-Cache Reload (`NOTIFY pgrst, 'reload schema';`)

In Supabase PostgreSQL environments, PostgREST caches relation metadata, foreign keys, and role permissions upon startup to optimize query compilation performance. When database permissions are modified via DCL/DDL migrations, PostgREST may continue serving API requests based on its cached permission map until a reload is signaled.

Migration 029 includes:
```sql
NOTIFY pgrst, 'reload schema';
```
This notification instructs PostgREST to reload its schema cache immediately upon migration completion, ensuring all revoked permissions and default privilege changes take effect across HTTP API clients without requiring a container restart.

*Authoritative references:*
- [PostgREST Documentation: Schema Cache Reload](https://postgrest.org/en/stable/references/schema_cache.html)
- [Supabase Documentation: PostgREST Configuration and Schema Cache](https://supabase.com/docs/guides/api)

---

## 7. Hosted Rollout & Production Verification

- **Hosted Application**: Migration 029 was applied exactly once to Singapore project `uvprmojmscndtwgkvjbi` on 2026-09-30 after a recoverable checkpoint, immutable-input verification, a linked dry run showing exactly Migration 029 pending, explicit operator confirmation, and PostgreSQL 17 capability checks.
- **Post-Apply Database State**: Remote migration history records `20260926000029` exactly once. The post-apply linked dry run reports the remote database is up to date, and the PostgREST schema cache reload completed successfully.
- **Security Contract**: Hosted assertions confirmed the expected 41 anonymous and 43 authenticated readable relations, exactly six authenticated table-level write pairs, exactly three approved `user_subjects` update columns, zero forbidden client grants, complete required `service_role` access, secure future `postgres` defaults, and zero ownership, RLS, or `SECURITY DEFINER` search-path anomalies.
- **Rollback-Only Regression**: All 23/23 hosted pgTAP assertions passed with zero failures and an explicit `ROLLBACK`; critical row counts were unchanged and zero `audit_test_%` relations persisted.
- **Evidence Boundary**: The operator-local postflight bundle `/private/tmp/atlas_postflight_029_20260930_163106Z` passed all recorded checksums during rollout. `/private/tmp` is non-durable local storage and is not a tracked repository artifact or permanent shared evidence location.
- **Merge and Deployment**: PR [#25](https://github.com/SWEATChamp/Atlas/pull/25) merged to `main` at `d89e9a2441d5792959d8f786701ff46788da5a6e` on 2026-09-30T16:44:53Z. Automatic Vercel Production deployment `dpl_6sSfNEtgKQyfVpPGaShxk2YXWMen` was verified `READY` from that exact commit in Singapore (`sin1`). Non-mutating HTTP `HEAD` checks performed immediately after deployment observed HTTP 307 from `/` to `/dashboard` and HTTP 200 from `/login`; authenticated application behaviour was not exercised.
- **Deferred Scope**: Broader anonymous read tightening remains deliberately deferred to a separate reviewed migration.
