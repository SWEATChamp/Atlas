-- ============================================================
-- MIGRATION 029: Least-Privilege Role Grant Remediation
-- Migration: 20260926000029_least_privilege_grant_remediation.sql
--
-- PURPOSE:
-- Remediates inherited PostgreSQL table grants across the public schema.
-- Closes defense-in-depth gaps where client roles (anon, authenticated, PUBLIC)
-- hold inherited TRUNCATE, TRIGGER, REFERENCES, and PostgreSQL 17+
-- MAINTAIN privileges.
-- Revokes all table-level write privileges from PUBLIC, anon, and authenticated,
-- locks down internal tables, then restores only the exact application writes
-- required by authenticated users. Preserves necessary read/column grants and
-- ensures service_role retains full access.
--
-- STATUS:
-- Authoritative migration for least-privilege role grant remediation.
-- DOES NOT alter Migration 028 assets.
--
-- PRE-CONDITIONS:
-- - Applied against PostgreSQL database running Supabase schema 000-028.
-- - Executed as role `postgres` through the supported Atlas migration workflow.
-- ============================================================

-- ------------------------------------------------------------
-- 1. REVOKE DANGEROUS PRIVILEGES ON ALL TABLES
-- ------------------------------------------------------------
-- Row Level Security (RLS) does NOT protect against TRUNCATE.
-- TRIGGER allows arbitrary trigger attachment; REFERENCES allows
-- creating foreign keys from unauthorized tables causing locking/leakage.
-- PostgreSQL 17+ MAINTAIN permits VACUUM, ANALYZE, CLUSTER, REFRESH
-- MATERIALIZED VIEW, REINDEX, and LOCK TABLE operations.
REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 2. DENY CLIENT TABLE-LEVEL WRITES BY DEFAULT
-- ------------------------------------------------------------
-- `anon` is the unauthenticated Supabase API role; `authenticated` represents
-- signed-in API users; `PUBLIC` is PostgreSQL's implicit grant target applying
-- to every role. Revoke first, then grant only the exact authenticated writes
-- required by current application code.
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

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
-- 4. RESTRICT OWNER-EXECUTED DIRECTORY VIEW
-- ------------------------------------------------------------
-- profiles_public is owner-executed. Keep it unavailable to anonymous clients,
-- while preserving the authenticated directory read used by the application.
REVOKE SELECT ON TABLE public.profiles_public FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.profiles_public TO authenticated;

-- ------------------------------------------------------------
-- 5. RESTORE THE EXACT AUTHENTICATED WRITE SURFACE
-- ------------------------------------------------------------
GRANT UPDATE, DELETE ON TABLE public.past_papers TO authenticated;
GRANT UPDATE ON TABLE public.profiles TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.user_chapters TO authenticated;
GRANT INSERT ON TABLE public.user_settings TO authenticated;

-- user_subjects is RPC-controlled except for these three profile-like fields.
-- The global table-level revoke above deliberately leaves no table-level write.
GRANT UPDATE (exam_date, target_grade, priority)
  ON TABLE public.user_subjects
  TO authenticated;

-- ------------------------------------------------------------
-- 6. PRESERVE READS ON LEDGERS & RPC-CONTROLLED TABLES
-- ------------------------------------------------------------
-- xp_events is an append-only ledger managed exclusively by award_xp / complete_mission.
-- streaks is managed exclusively by streak triggers / complete_mission.
-- daily_missions is managed by generate_daily_missions / complete_mission / replace_mission.
-- subject_paper_selections is managed exclusively by configure_subject_route / transition_to_a2.
-- Preserve SELECT for authenticated users (scoped by RLS policies)
GRANT SELECT ON TABLE public.xp_events TO authenticated;
GRANT SELECT ON TABLE public.streaks TO authenticated;
GRANT SELECT ON TABLE public.daily_missions TO authenticated;
GRANT SELECT ON TABLE public.subject_paper_selections TO authenticated;
GRANT SELECT ON TABLE public.subject_stage_results TO authenticated;

-- Preserve full access for service_role
GRANT ALL ON TABLE public.xp_events TO service_role;
GRANT ALL ON TABLE public.streaks TO service_role;
GRANT ALL ON TABLE public.daily_missions TO service_role;
GRANT ALL ON TABLE public.subject_paper_selections TO service_role;
GRANT ALL ON TABLE public.subject_stage_results TO service_role;

-- ------------------------------------------------------------
-- 7. PROTECT GLOBAL CATALOGUE & MASTER DEFINITION TABLES
-- ------------------------------------------------------------
-- Master catalogue tables are read-only for students and clients.
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
-- 8. REMEDIATE POSTGRES DEFAULT PRIVILEGES FOR FUTURE RELATIONS
-- ------------------------------------------------------------
-- Atlas migrations run as postgres and create postgres-owned application
-- relations. Supabase-managed supabase_admin defaults are platform-owned and
-- intentionally outside this application migration's scope.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLES
  FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE ON TABLES
  FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES
  TO service_role;

-- ------------------------------------------------------------
-- 9. NOTIFY POSTGREST SCHEMA CACHE RELOAD
-- ------------------------------------------------------------
-- In Supabase and PostgREST environments, table permission changes may not be
-- reflected immediately if PostgREST serves requests from its schema cache.
-- Executing `NOTIFY pgrst, 'reload schema';` instructs PostgREST to reload its
-- cached schema definition and enforce updated privileges immediately without
-- requiring a service restart.
-- Authoritative source: PostgREST Schema Cache documentation & Supabase PostgREST guide.
NOTIFY pgrst, 'reload schema';
