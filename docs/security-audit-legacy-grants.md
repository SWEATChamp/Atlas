# Security Audit: Legacy Database Grants & Least-Privilege Remediation Plan

**Document Version:** 1.2.0
**Audit Date:** 2026-09-26 / 2026-09-28
**Scope:** PostgreSQL `public` schema (43 base tables, 3 views; 46 relations total) on Supabase infrastructure
**Audit Posture:** Strict catalog inspection and empirical local verification
**Target Roles:** `PUBLIC`, `anon`, `authenticated`, `service_role`
**Reference Assets:**
- Migration history: `supabase/migrations/20260704000000_extensions.sql` through `20260923000028_route_remap_integrity_and_stage_preservation.sql`
- Authoritative Migration: `supabase/migrations/20260926000029_least_privilege_grant_remediation.sql`
- Automated test suite: `supabase/tests/database/legacy_grants_security_audit.test.sql`

---

## 1. Executive Summary

In Supabase PostgreSQL environments, relations created in schema `public` inherit default privileges configured for roles `anon` and `authenticated`. Historically across Migrations 000–020, relation creation under role `postgres` assigned `ALL` privileges (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`) to both `anon` and `authenticated`.

While application development systematically enabled Row Level Security (RLS) across all user-facing tables, subsequent hardening migrations (e.g., Migrations 023, 024, 026, 027) selectively executed `REVOKE INSERT, UPDATE, DELETE ... FROM anon, authenticated`, leaving inherited **`TRUNCATE`**, **`TRIGGER`**, and **`REFERENCES`** grants unrevoked across public relations.

This audit establishes:
1. **The RLS Bypass Risk of `TRUNCATE`**: PostgreSQL explicitly excludes `TRUNCATE` from Row Level Security enforcement. Any role possessing `TRUNCATE` table privileges can wipe entire tables regardless of restrictive row-level ownership policies (`auth.uid() = user_id`).
2. **Defensive Boundaries**: PostgREST (the HTTP API engine powering Supabase client SDKs) does not expose an HTTP verb mapping to the SQL `TRUNCATE` statement. Therefore, external HTTP REST clients cannot trigger table truncation through standard endpoints. However, in multi-tenant or defense-in-depth architectures, leaving `TRUNCATE` granted to untrusted roles presents critical operational and structural risk if direct connection poolers (port 5432/6543) or dynamic SQL RPCs are introduced.
3. **Internal Data Exposure**: The internal table `google_docs_tokens` stores encrypted OAuth2 tokens. Previously, its protection relied on `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` with zero policies defined. While this blocks client `SELECT`, `INSERT`, `UPDATE`, and `DELETE`, it did not block `TRUNCATE` or `REFERENCES`.
4. **Authoritative Remediation**: A dedicated, non-destructive migration (`supabase/migrations/20260926000029_least_privilege_grant_remediation.sql`) revokes all excessive privileges, locks down sensitive internal and ledger relations, preserves necessary client read paths and column-level update grants, establishes secure default privileges for all future relations via `ALTER DEFAULT PRIVILEGES ... ON TABLES`, and instructs PostgREST to reload its schema cache via `NOTIFY pgrst, 'reload schema';`. Migration 028 assets remain completely unmodified.
5. **Role Semantics (`anon` vs `PUBLIC`)**:
   - `anon` is the unauthenticated Supabase API role assigned to unauthenticated API requests.
   - `PUBLIC` is PostgreSQL's implicit grant target applying automatically to every database role (including `anon`, `authenticated`, `postgres`, and `service_role`).
   - Revoking privileges from `PUBLIC` prevents roles from inheriting those privileges implicitly through PostgreSQL's default permission inheritance mechanisms.
   - Explicit grants to `authenticated` and `service_role` remain separately and intentionally controlled.
6. **Preservation of Existing Application Permissions**:
   - Lines 78–90 of Migration 029 specifically concern master catalogue tables (`subjects`, `chapters`, `achievement_definitions`, `shop_items`), revoking writes and ensuring `SELECT` is granted to `authenticated`.
   - Client writes on `subject_stage_results` and scoped column-level updates on `user_subjects` (`exam_date`, `target_grade`, `priority`) are preserved because Migration 029 does not revoke those existing grants.
   - Automated tests explicitly verify the continuous functionality of these preserved pathways.

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

---

## 3. Comprehensive Object Catalog & Relation Terminology

To prevent confusion between base tables, views, and view-inclusive relation counts:
- **Base Tables**: Exactly **43** base tables exist in schema `public`.
- **Views**: Exactly **3** views exist in schema `public`.
- **Total Relations**: Exactly **46** relations (`r`, `v`, `m`, `p`) exist in schema `public`.

In PostgreSQL `information_schema.table_privileges`, views are reported alongside base tables in the `table_name` column. When a role holds a grant across all catalogued relations including views, queries aggregating `COUNT(DISTINCT table_name)` will report relation counts (up to 46), not strictly base-table counts.

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
 anon          | REFERENCES     |             43 (40 base tables + 3 views)
 anon          | SELECT         |             16 (13 base tables + 3 views)
 anon          | TRIGGER        |             43 (40 base tables + 3 views)
 anon          | TRUNCATE       |             43 (40 base tables + 3 views)
 authenticated | DELETE         |              1 (1 base table: subject_stage_results)
 authenticated | INSERT         |              1 (1 base table: subject_stage_results)
 authenticated | REFERENCES     |             44 (41 base tables + 3 views)
 authenticated | SELECT         |             22 (19 base tables + 3 views)
 authenticated | TRIGGER        |             44 (41 base tables + 3 views)
 authenticated | TRUNCATE       |             44 (41 base tables + 3 views)
 authenticated | UPDATE         |              1 (1 base table: subject_stage_results)
 PUBLIC        | (none)         |              0
```

*Note on Pre-029 Absences*:
- For `authenticated`, 2 base tables (`grade_threshold_import_runs` and `grade_threshold_import_issues`) lacked `TRUNCATE, TRIGGER, REFERENCES` due to `REVOKE ALL` in Migration 027. Hence 41 base tables + 3 views = 44 relations held them.
- For `anon`, 3 base tables (`grade_threshold_import_runs`, `grade_threshold_import_issues`, and `subject_paper_selections`) lacked `TRUNCATE, TRIGGER, REFERENCES` due to earlier revokes. Hence 40 base tables + 3 views = 43 relations held them.

### Remediated Privilege Summary (Post-Migration 029):
Post-029 Empirical Counts:
```
    grantee    | privilege_type | relation_count
---------------+----------------+----------------
 anon          | SELECT         |             16 (13 base tables + 3 views)
 authenticated | DELETE         |              1 (1 base table: subject_stage_results)
 authenticated | INSERT         |              1 (1 base table: subject_stage_results)
 authenticated | SELECT         |             27 (24 base tables + 3 views)
 authenticated | UPDATE         |              1 (1 base table: subject_stage_results)
 PUBLIC        | (none)         |              0
```

Key Invariants Enforced:
- **`TRUNCATE`**: Completely eliminated across all 46 relations (0 for `PUBLIC`, 0 for `anon`, 0 for `authenticated`).
- **`TRIGGER`**: Completely eliminated across all 46 relations (0 for `PUBLIC`, 0 for `anon`, 0 for `authenticated`).
- **`REFERENCES`**: Completely eliminated across all 46 relations (0 for `PUBLIC`, 0 for `anon`, 0 for `authenticated`).
- **`PUBLIC` & `anon` Writes**: Completely eliminated (0 `INSERT`, 0 `UPDATE`, 0 `DELETE`).
- **`authenticated` Writes**: Exactly 1 base table retains table-level writes (`subject_stage_results`), while `user_subjects` retains strictly scoped column-level `UPDATE` on `(exam_date, target_grade, priority)`.
- **`authenticated` Reads**: Exactly 27 relations (24 base tables + 3 views) granted `SELECT`, fully governed by active Row Level Security policies.
- **`service_role` Access**: Retains full effective administrative privileges (`SELECT, INSERT, UPDATE, DELETE`) across sensitive internal tables, ledgers, RPC tables, and master catalogues.

---

## 6. Automated pgTAP Audit Test Suite (19 Assertions)

The test suite at `supabase/tests/database/legacy_grants_security_audit.test.sql` evaluates 19 comprehensive security assertions within a rollback-safe transaction. The tests employ both PostgreSQL effective privilege functions (`has_table_privilege()`, `has_column_privilege()`) across role contexts and catalog / `information_schema` inspection where applicable to verify real runtime authorization boundaries:

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
12. **Assertion 12**: `authenticated` retains `SELECT, INSERT, UPDATE, DELETE` on `subject_stage_results` (preserved because Migration 029 does not revoke existing grants).
13. **Assertion 13**: `user_subjects` retains column `UPDATE` privileges on `exam_date`, `target_grade`, `priority` (preserved because Migration 029 does not revoke existing grants).
14. **Assertion 14**: `user_subjects` has zero `UPDATE` privileges on any non-target columns.
15. **Assertion 15**: `service_role` retains effective `SELECT, INSERT, UPDATE, DELETE` on sensitive internal tables.
16. **Assertion 16**: `service_role` retains effective `SELECT, INSERT, UPDATE, DELETE` on ledger and RPC tables.
17. **Assertion 17**: `service_role` retains effective `SELECT, INSERT, UPDATE, DELETE` on catalogue tables.
18. **Assertion 18**: Newly created tables inherit zero `TRUNCATE`/`TRIGGER`/`REFERENCES` grants (all client roles) and zero write grants (`anon`/`PUBLIC`), verified against a transaction-scoped test relation (`public.audit_test_future_table`).
19. **Assertion 19**: Newly created tables grant full table privileges (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `TRIGGER`, `REFERENCES`) to `service_role`, verified on the transaction-scoped test relation before it is dropped prior to transaction rollback.

All 19 assertions pass cleanly (`19/19 ok`).

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

## 7. Operational Rollout Readiness

- **Isolation**: Verified in dedicated worktree `/tmp/atlas-security-least-privilege-grants` on branch `codex/security-least-privilege-grants`.
- **Database Assets**: Migration 028 remains completely untouched. Migration 029 applies cleanly on top of 000–028.
- **Rollout Gate**: Awaiting explicit user approval before staging commits, running remote preflight, applying to Singapore (`uvprmojmscndtwgkvjbi`), or promoting.
