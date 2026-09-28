-- ============================================================
-- DATABASE TESTS: Legacy Database-Grant Security Audit (Workstream B / Migration 029)
--
-- Non-mutating, rollback-only audit of inherited table, view, and column grants
-- in the public schema for client roles (anon, authenticated, PUBLIC) and service_role.
-- Uses both effective privilege functions (has_table_privilege, has_column_privilege)
-- and catalog/information-schema inspection where applicable.
--
-- Run via: pgTAP test harness (e.g. `supabase test db`)
-- All operations are executed within a transaction and roll back.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(19);

-- 1. No TRUNCATE to anon across all public relations
SELECT is_empty(
    $$
    SELECT table_name FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND grantee = 'anon'
      AND privilege_type = 'TRUNCATE'
    $$,
    'No relation in public schema has TRUNCATE granted to anon'
);

-- 2. No TRUNCATE to authenticated across all public relations
SELECT is_empty(
    $$
    SELECT table_name FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND grantee = 'authenticated'
      AND privilege_type = 'TRUNCATE'
    $$,
    'No relation in public schema has TRUNCATE granted to authenticated'
);

-- 3. No TRUNCATE to PUBLIC across all public relations (explicit and effective)
SELECT is_empty(
    $$
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm', 'p')
      AND (
        has_table_privilege('public', c.oid, 'TRUNCATE')
        OR EXISTS (
          SELECT 1 FROM information_schema.table_privileges tp
          WHERE tp.table_schema = 'public'
            AND tp.table_name = c.relname
            AND tp.grantee = 'PUBLIC'
            AND tp.privilege_type = 'TRUNCATE'
        )
      )
    $$,
    'No relation in public schema has TRUNCATE granted to PUBLIC (explicit or effective)'
);

-- 4. No TRIGGER to anon, authenticated, or PUBLIC across all public relations
SELECT is_empty(
    $$
    SELECT c.relname, role_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated'), ('public')) AS r(role_name)
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm', 'p')
      AND (
        has_table_privilege(role_name, c.oid, 'TRIGGER')
        OR EXISTS (
          SELECT 1 FROM information_schema.table_privileges tp
          WHERE tp.table_schema = 'public'
            AND tp.table_name = c.relname
            AND tp.grantee = UPPER(role_name)
            AND tp.privilege_type = 'TRIGGER'
        )
      )
    $$,
    'No relation in public schema has TRIGGER granted to anon, authenticated, or PUBLIC'
);

-- 5. No REFERENCES to anon, authenticated, or PUBLIC across all public relations
SELECT is_empty(
    $$
    SELECT c.relname, role_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated'), ('public')) AS r(role_name)
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm', 'p')
      AND (
        has_table_privilege(role_name, c.oid, 'REFERENCES')
        OR EXISTS (
          SELECT 1 FROM information_schema.table_privileges tp
          WHERE tp.table_schema = 'public'
            AND tp.table_name = c.relname
            AND tp.grantee = UPPER(role_name)
            AND tp.privilege_type = 'REFERENCES'
        )
      )
    $$,
    'No relation in public schema has REFERENCES granted to anon, authenticated, or PUBLIC'
);

-- 6. No write privileges (INSERT, UPDATE, DELETE) to anon or PUBLIC
SELECT is_empty(
    $$
    SELECT c.relname, p.priv, role_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
    CROSS JOIN (VALUES ('anon'), ('public')) AS r(role_name)
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm', 'p')
      AND (
        has_table_privilege(role_name, c.oid, p.priv)
        OR EXISTS (
          SELECT 1 FROM information_schema.table_privileges tp
          WHERE tp.table_schema = 'public'
            AND tp.table_name = c.relname
            AND tp.grantee = UPPER(role_name)
            AND tp.privilege_type = p.priv
        )
      )
    $$,
    'No relation in public schema has INSERT, UPDATE, or DELETE granted to anon or PUBLIC'
);

-- 7. google_docs_tokens has zero client grants (anon, authenticated, PUBLIC)
SELECT is_empty(
    $$
    SELECT privilege_type, grantee FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = 'google_docs_tokens'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    $$,
    'google_docs_tokens has zero client grants (anon, authenticated, PUBLIC)'
);

-- 8. Internal import tables have zero client grants (anon, authenticated, PUBLIC)
SELECT is_empty(
    $$
    SELECT table_name, privilege_type, grantee FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN ('grade_threshold_import_runs', 'grade_threshold_import_issues')
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    $$,
    'Internal import tables have zero client grants (anon, authenticated, PUBLIC)'
);

-- 9. Ledger and RPC-managed tables have zero write grants to authenticated or PUBLIC
SELECT is_empty(
    $$
    SELECT table_name, privilege_type, grantee FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN ('xp_events', 'streaks', 'daily_missions', 'subject_paper_selections')
      AND grantee IN ('authenticated', 'PUBLIC')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    $$,
    'Ledger and RPC tables have zero write grants to authenticated or PUBLIC'
);

-- 10. Catalogue tables have zero write grants to authenticated or PUBLIC
SELECT is_empty(
    $$
    SELECT table_name, privilege_type, grantee FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN ('subjects', 'chapters', 'achievement_definitions', 'shop_items')
      AND grantee IN ('authenticated', 'PUBLIC')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    $$,
    'Catalogue tables have zero write grants to authenticated or PUBLIC'
);

-- 11. Positive preservation: authenticated retains SELECT on catalog and ledger relations
SELECT set_eq(
    $$
    SELECT t.table_name
    FROM (
      VALUES
        ('subjects'),
        ('chapters'),
        ('achievement_definitions'),
        ('shop_items'),
        ('xp_events'),
        ('streaks'),
        ('daily_missions'),
        ('subject_paper_selections')
    ) AS t(table_name)
    WHERE has_table_privilege('authenticated', 'public.' || t.table_name, 'SELECT')
    $$,
    ARRAY['subjects', 'chapters', 'achievement_definitions', 'shop_items', 'xp_events', 'streaks', 'daily_missions', 'subject_paper_selections'],
    'authenticated retains SELECT on all 8 catalogue and ledger tables'
);

-- 12. Positive preservation: authenticated retains full operations on subject_stage_results
SELECT set_eq(
    $$
    SELECT p.priv
    FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
    WHERE has_table_privilege('authenticated', 'public.subject_stage_results', p.priv)
    $$,
    ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    'authenticated retains SELECT, INSERT, UPDATE, DELETE on subject_stage_results'
);

-- 13. Positive preservation: user_subjects retains column UPDATE on exactly (exam_date, target_grade, priority)
SELECT set_eq(
    $$
    SELECT column_name FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'user_subjects'
      AND grantee = 'authenticated'
      AND privilege_type = 'UPDATE'
    $$,
    ARRAY['exam_date', 'target_grade', 'priority'],
    'user_subjects retains column UPDATE privileges on exam_date, target_grade, priority'
);

-- 14. user_subjects has zero UPDATE privilege on non-target columns
SELECT is_empty(
    $$
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_subjects'
      AND column_name NOT IN ('exam_date', 'target_grade', 'priority')
      AND has_column_privilege('authenticated', 'public.user_subjects', column_name, 'UPDATE')
    $$,
    'user_subjects grants zero UPDATE privileges on any non-target columns'
);

-- 15. Positive preservation: service_role retains effective access on sensitive OAuth and import tables
SELECT is_empty(
    $$
    SELECT t.table_name, p.priv
    FROM (
      VALUES
        ('google_docs_tokens'),
        ('grade_threshold_import_runs'),
        ('grade_threshold_import_issues')
    ) AS t(table_name)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
    WHERE NOT has_table_privilege('service_role', 'public.' || t.table_name, p.priv)
    $$,
    'service_role retains effective SELECT, INSERT, UPDATE, DELETE on sensitive internal tables'
);

-- 16. Positive preservation: service_role retains effective access on ledger and RPC tables
SELECT is_empty(
    $$
    SELECT t.table_name, p.priv
    FROM (
      VALUES
        ('xp_events'),
        ('streaks'),
        ('daily_missions'),
        ('subject_paper_selections'),
        ('subject_stage_results')
    ) AS t(table_name)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
    WHERE NOT has_table_privilege('service_role', 'public.' || t.table_name, p.priv)
    $$,
    'service_role retains effective SELECT, INSERT, UPDATE, DELETE on ledger and RPC tables'
);

-- 17. Positive preservation: service_role retains effective access on catalogue tables
SELECT is_empty(
    $$
    SELECT t.table_name, p.priv
    FROM (
      VALUES
        ('subjects'),
        ('chapters'),
        ('achievement_definitions'),
        ('shop_items')
    ) AS t(table_name)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
    WHERE NOT has_table_privilege('service_role', 'public.' || t.table_name, p.priv)
    $$,
    'service_role retains effective SELECT, INSERT, UPDATE, DELETE on catalogue tables'
);

-- 18. Default privileges test on newly created transaction-scoped relation: client roles
CREATE TABLE public.audit_test_future_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  val text
);

SELECT is_empty(
    $$
    SELECT p.priv, role_name
    FROM (VALUES ('TRUNCATE'), ('TRIGGER'), ('REFERENCES'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
    CROSS JOIN (VALUES ('anon'), ('authenticated'), ('public')) AS r(role_name)
    WHERE (
      (p.priv IN ('TRUNCATE', 'TRIGGER', 'REFERENCES') AND has_table_privilege(role_name, 'public.audit_test_future_table', p.priv))
      OR (p.priv IN ('INSERT', 'UPDATE', 'DELETE') AND role_name IN ('anon', 'public') AND has_table_privilege(role_name, 'public.audit_test_future_table', p.priv))
    )
    $$,
    'Newly created tables inherit zero TRUNCATE/TRIGGER/REFERENCES (all client roles) and zero write grants (anon/PUBLIC)'
);

-- 19. Default privileges test on newly created transaction-scoped relation: service_role full privileges
SELECT set_eq(
    $$
    SELECT p.priv
    FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) AS p(priv)
    WHERE has_table_privilege('service_role', 'public.audit_test_future_table', p.priv)
    $$,
    ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'],
    'Newly created tables grant full privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES) to service_role'
);

DROP TABLE public.audit_test_future_table;

SELECT * FROM finish();

ROLLBACK;
