-- ============================================================
-- MIGRATION 029: Least-Privilege Role Grant Remediation
-- Migration: 20260926000029_least_privilege_grant_remediation.sql
--
-- PURPOSE:
-- Remediates inherited PostgreSQL table grants across the public schema.
-- Closes defense-in-depth gaps where client roles (anon, authenticated, PUBLIC)
-- hold inherited TRUNCATE, TRIGGER, and REFERENCES privileges.
-- Revokes all write privileges from anon and PUBLIC, locks down internal tables,
-- restricts client mutations on catalog and ledger tables, preserves necessary
-- application read/column grants, and ensures service_role retains full access.
--
-- STATUS:
-- Authoritative migration for least-privilege role grant remediation.
-- DOES NOT alter Migration 028 assets.
--
-- PRE-CONDITIONS:
-- - Applied against PostgreSQL database running Supabase schema 000-028.
-- - Executed as role `postgres` or `supabase_admin`.
-- ============================================================

-- ------------------------------------------------------------
-- 1. REVOKE TRUNCATE, TRIGGER, AND REFERENCES ON ALL TABLES
-- ------------------------------------------------------------
-- Row Level Security (RLS) does NOT protect against TRUNCATE.
-- TRIGGER allows arbitrary trigger attachment; REFERENCES allows
-- creating foreign keys from unauthorized tables causing locking/leakage.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 2. ENFORCE READ-ONLY BOUNDARY FOR ANONYMOUS & PUBLIC USERS
-- ------------------------------------------------------------
-- The anon and PUBLIC roles represent unauthenticated visitors and must never
-- possess write privileges on any table in schema public.
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;

-- ------------------------------------------------------------
-- 3. LOCK DOWN SENSITIVE INTERNAL & ORCHESTRATION TABLES
-- ------------------------------------------------------------
-- google_docs_tokens stores encrypted OAuth2 tokens and must be dark to clients.
-- grade_threshold_import_runs and grade_threshold_import_issues track backend pipeline state.
REVOKE ALL ON TABLE public.google_docs_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.grade_threshold_import_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.grade_threshold_import_issues FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.google_docs_tokens TO service_role;
GRANT ALL ON TABLE public.grade_threshold_import_runs TO service_role;
GRANT ALL ON TABLE public.grade_threshold_import_issues TO service_role;

-- ------------------------------------------------------------
-- 4. HARDEN IMMUTABLE LEDGERS & RPC-CONTROLLED TABLES
-- ------------------------------------------------------------
-- xp_events is an append-only ledger managed exclusively by award_xp / complete_mission.
-- streaks is managed exclusively by streak triggers / complete_mission.
-- daily_missions is managed by generate_daily_missions / complete_mission / replace_mission.
-- subject_paper_selections is managed exclusively by configure_subject_route / transition_to_a2.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.xp_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.streaks FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.daily_missions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.subject_paper_selections FROM authenticated;

-- Preserve SELECT for authenticated users (scoped by RLS policies)
GRANT SELECT ON TABLE public.xp_events TO authenticated;
GRANT SELECT ON TABLE public.streaks TO authenticated;
GRANT SELECT ON TABLE public.daily_missions TO authenticated;
GRANT SELECT ON TABLE public.subject_paper_selections TO authenticated;

-- Preserve full access for service_role
GRANT ALL ON TABLE public.xp_events TO service_role;
GRANT ALL ON TABLE public.streaks TO service_role;
GRANT ALL ON TABLE public.daily_missions TO service_role;
GRANT ALL ON TABLE public.subject_paper_selections TO service_role;

-- ------------------------------------------------------------
-- 5. PROTECT GLOBAL CATALOGUE & MASTER DEFINITION TABLES
-- ------------------------------------------------------------
-- Master catalogue tables are read-only for students and clients.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.subjects,
  public.chapters,
  public.achievement_definitions,
  public.shop_items
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.subjects,
  public.chapters,
  public.achievement_definitions,
  public.shop_items
TO authenticated;

GRANT ALL ON TABLE
  public.subjects,
  public.chapters,
  public.achievement_definitions,
  public.shop_items
TO service_role;

-- ------------------------------------------------------------
-- 6. REMEDIATE DEFAULT PRIVILEGES FOR FUTURE RELATIONS
-- ------------------------------------------------------------
-- Ensure that tables created in future migrations do not automatically
-- grant TRUNCATE, TRIGGER, or REFERENCES to client roles.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES
  FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE ON TABLES
  FROM PUBLIC, anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES
  TO service_role;
