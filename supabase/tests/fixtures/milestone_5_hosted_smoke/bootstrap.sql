-- =============================================================================
-- BOOTSTRAP: Milestone 5 Reversible Hosted-Smoke Fixture
--
-- File: supabase/tests/fixtures/milestone_5_hosted_smoke/bootstrap.sql
--
-- Purpose:
--   Safely bootstraps the authentic June 2026 Milestone 5 target-grade planner
--   smoke scenario against two dynamically provided, pre-existing authenticated
--   users.
--
-- Dynamic Configuration Input:
--   Users may be provided directly via arguments to
--   pg_temp.apply_m5_smoke_bootstrap(u1, u2), via session settings
--   m5.user_1_id / m5.user_2_id, or via pg_temp.m5_smoke_config(key, id_val).
--
-- Snapshot Guarantees:
--   Snapshots all pre-existing state that could be mutated by route procedures:
--   - user_subjects
--   - subject_paper_selections
--   - user_chapters
--   - daily_missions
--   - past_papers
--   - evidence document and source mapping
--
-- Deferred Execution:
--   Runs immediately upon inclusion unless m5.defer_smoke_bootstrap = 'true'.
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.apply_m5_smoke_bootstrap(
  p_u1 UUID DEFAULT NULL,
  p_u2 UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_u1 UUID := p_u1;
  v_u2 UUID := p_u2;
  v_u1_text TEXT;
  v_u2_text TEXT;
  v_subj_chem UUID;
  v_subj_phys UUID;
  v_subj_math UUID;
  v_us_chem UUID;
  v_us_phys UUID;
  v_us_math UUID;
  v_math_selections JSONB := '[
    {"paper_number": 1, "component_name": "Pure Mathematics 1", "stage": "as"},
    {"paper_number": 4, "component_name": "Mechanics", "stage": "as"},
    {"paper_number": 3, "component_name": "Pure Mathematics 3", "stage": "a2"},
    {"paper_number": 5, "component_name": "Probability & Statistics 1", "stage": "a2"}
  ]'::jsonb;
BEGIN
  -- ── 1. Guardrail 1: Interrupted-run check (fails closed with 55000) ───────────
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = '_m5_smoke_snapshot') THEN
    RAISE EXCEPTION 'Interrupted run detected: private snapshot schema _m5_smoke_snapshot already exists'
      USING ERRCODE = '55000';
  END IF;

  -- ── 2. Dynamic User Parameter Resolution ─────────────────────────────────────
  IF v_u1 IS NULL OR v_u2 IS NULL THEN
    -- Check temp config table
    IF to_regclass('pg_temp.m5_smoke_config') IS NOT NULL THEN
      BEGIN
        IF v_u1 IS NULL THEN
          SELECT id_val INTO v_u1 FROM pg_temp.m5_smoke_config WHERE key = 'user_1_id';
        END IF;
        IF v_u2 IS NULL THEN
          SELECT id_val INTO v_u2 FROM pg_temp.m5_smoke_config WHERE key = 'user_2_id';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;

  -- Fallback to session configuration settings
  IF v_u1 IS NULL THEN
    v_u1_text := NULLIF(current_setting('m5.user_1_id', true), '');
    IF v_u1_text IS NOT NULL THEN
      BEGIN
        v_u1 := v_u1_text::UUID;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Provided m5.user_1_id % is not a valid UUID', v_u1_text
          USING ERRCODE = '22P02';
      END;
    END IF;
  END IF;

  IF v_u2 IS NULL THEN
    v_u2_text := NULLIF(current_setting('m5.user_2_id', true), '');
    IF v_u2_text IS NOT NULL THEN
      BEGIN
        v_u2 := v_u2_text::UUID;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Provided m5.user_2_id % is not a valid UUID', v_u2_text
          USING ERRCODE = '22P02';
      END;
    END IF;
  END IF;

  -- Validation: missing IDs
  IF v_u1 IS NULL OR v_u2 IS NULL THEN
    RAISE EXCEPTION 'Bootstrap requires two dynamic user UUIDs via arguments, m5.user_1_id / m5.user_2_id, or pg_temp.m5_smoke_config'
      USING ERRCODE = 'P0002';
  END IF;

  -- Validation: identical IDs
  IF v_u1 = v_u2 THEN
    RAISE EXCEPTION 'User 1 ID (%) and User 2 ID (%) must be distinct', v_u1, v_u2
      USING ERRCODE = 'P0001';
  END IF;

  -- Validation: non-existent users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_u1) THEN
    RAISE EXCEPTION 'User 1 (%) does not exist in auth.users', v_u1
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_u2) THEN
    RAISE EXCEPTION 'User 2 (%) does not exist in auth.users', v_u2
      USING ERRCODE = 'P0002';
  END IF;

  -- ── 3. Guardrail 2: Deterministic fixture collision checks (23505) ────────────
  IF EXISTS (SELECT 1 FROM public.grade_threshold_combination_carry_forward_links WHERE id = 'f1870000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'Collision detected: bridge link f1870000-0000-4000-8000-000000000002 already exists'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (SELECT 1 FROM public.past_papers WHERE id IN (
    'f1870000-0000-4000-8000-000000000003',
    'f1870000-0000-4000-8000-000000000004',
    'f1870000-0000-4000-8000-000000000005'
  )) THEN
    RAISE EXCEPTION 'Collision detected: smoke past paper attempt already exists'
      USING ERRCODE = '23505';
  END IF;

  -- ── 4. Create Private Snapshot Schema and Lockdown ───────────────────────────
  CREATE SCHEMA _m5_smoke_snapshot;
  REVOKE ALL ON SCHEMA _m5_smoke_snapshot FROM PUBLIC, anon, authenticated;

  -- Store ownership ledger
  CREATE TABLE _m5_smoke_snapshot.smoke_ledger (
    user_1_id UUID NOT NULL,
    user_2_id UUID NOT NULL,
    bridge_link_id UUID NOT NULL,
    attempt_ids UUID[] NOT NULL,
    bootstrapped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  INSERT INTO _m5_smoke_snapshot.smoke_ledger (user_1_id, user_2_id, bridge_link_id, attempt_ids)
  VALUES (
    v_u1,
    v_u2,
    'f1870000-0000-4000-8000-000000000002'::UUID,
    ARRAY[
      'f1870000-0000-4000-8000-000000000003'::UUID,
      'f1870000-0000-4000-8000-000000000004'::UUID,
      'f1870000-0000-4000-8000-000000000005'::UUID
    ]
  );

  -- Snapshot canonical evidence state
  CREATE TABLE _m5_smoke_snapshot.snap_evidence_documents AS
    SELECT * FROM public.grade_threshold_carry_forward_evidence_documents
    WHERE id = '00000036-0000-4000-8000-000000000001';

  CREATE TABLE _m5_smoke_snapshot.snap_source_mappings AS
    SELECT * FROM public.grade_threshold_carry_forward_source_mappings
    WHERE id = '00000036-9709-4000-8000-000000000001';

  -- Snapshot existing user application state that route procedures could mutate
  CREATE TABLE _m5_smoke_snapshot.snap_user_subjects AS
    SELECT * FROM public.user_subjects WHERE user_id IN (v_u1, v_u2);

  CREATE TABLE _m5_smoke_snapshot.snap_subject_paper_selections AS
    SELECT * FROM public.subject_paper_selections
    WHERE user_subject_id IN (SELECT id FROM public.user_subjects WHERE user_id IN (v_u1, v_u2));

  CREATE TABLE _m5_smoke_snapshot.snap_user_chapters AS
    SELECT * FROM public.user_chapters WHERE user_id IN (v_u1, v_u2);

  CREATE TABLE _m5_smoke_snapshot.snap_daily_missions AS
    SELECT * FROM public.daily_missions WHERE user_id IN (v_u1, v_u2);

  CREATE TABLE _m5_smoke_snapshot.snap_past_papers AS
    SELECT * FROM public.past_papers WHERE user_id IN (v_u1, v_u2);

  -- ── 5. Resolve Syllabus Subject IDs ──────────────────────────────────────────
  SELECT id INTO v_subj_chem FROM public.subjects WHERE code = '9701';
  SELECT id INTO v_subj_phys FROM public.subjects WHERE code = '9702';
  SELECT id INTO v_subj_math FROM public.subjects WHERE code = '9709';

  -- ── 6. Configure User 1 Routes via Authoritative Procedures ───────────────────
  -- Authenticated claims context for User 1
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_u1, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_u1::text, true);

  -- 1. Chemistry 9701: AS-only route
  v_us_chem := public.add_subject_enrollment(v_u1, v_subj_chem);
  PERFORM public.configure_subject_route(v_u1, v_us_chem, 'as_only', '[]'::jsonb);
  UPDATE public.user_subjects SET target_grade = 'A' WHERE id = v_us_chem;

  -- 2. Physics 9702: Full A-Level route
  v_us_phys := public.add_subject_enrollment(v_u1, v_subj_phys);
  PERFORM public.configure_subject_route(v_u1, v_us_phys, 'full_level', '[]'::jsonb);
  UPDATE public.user_subjects SET target_grade = 'A*' WHERE id = v_us_phys;

  -- 3. Mathematics 9709: Staged route (Pure 1, Mechanics, Pure 3, Stats 1)
  v_us_math := public.add_subject_enrollment(v_u1, v_subj_math);
  PERFORM public.configure_subject_route(v_u1, v_us_math, 'staged', v_math_selections);
  UPDATE public.user_subjects SET target_grade = 'A*' WHERE id = v_us_math;

  -- Reset auth claims context
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- ── 7. Temporary Evidence Promotion & Bridge Link Establishment ──────────────
  UPDATE public.grade_threshold_carry_forward_evidence_documents
  SET review_status = 'approved',
      reviewed_by = 'm5-smoke-auditor',
      reviewed_at = NOW(),
      is_active = TRUE
  WHERE id = '00000036-0000-4000-8000-000000000001';

  UPDATE public.grade_threshold_carry_forward_source_mappings
  SET evidence_status = 'confirmed',
      authorized_by = 'm5-smoke-auditor',
      authorized_at = NOW()
  WHERE id = '00000036-9709-4000-8000-000000000001';

  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    id,
    source_mapping_id,
    combination_id,
    token_id,
    created_by
  ) VALUES (
    'f1870000-0000-4000-8000-000000000002',
    '00000036-9709-4000-8000-000000000001',
    '00000000-0000-4000-8000-0000000000c3',
    '00000000-0000-4000-8000-0000000000db',
    'm5-smoke-auditor'
  );

  -- ── 8. User 1 Past Paper Attempts (3 rows) ───────────────────────────────────
  INSERT INTO public.past_papers (
    id, user_id, subject_id, subject_paper_id, paper_number, paper_code,
    year, session, score_raw, score_max, stage, attempted_at
  ) VALUES
  (
    'f1870000-0000-4000-8000-000000000003',
    v_u1,
    v_subj_chem,
    '9727a285-3e3c-5b17-8ccb-9cf8ec26c496',
    1,
    '9701_s26_qp_12',
    2026,
    'may_jun',
    27,
    40,
    'as',
    '2026-06-25'
  ),
  (
    'f1870000-0000-4000-8000-000000000004',
    v_u1,
    v_subj_chem,
    '26c24b14-b3b1-53bb-bf0d-5f0ce959214c',
    2,
    '9701_s26_qp_22',
    2026,
    'may_jun',
    39,
    60,
    'as',
    '2026-06-25'
  ),
  (
    'f1870000-0000-4000-8000-000000000005',
    v_u1,
    v_subj_chem,
    '8c802754-98a5-599b-8b7a-5e528804f625',
    3,
    '9701_s26_qp_33',
    2026,
    'may_jun',
    22,
    40,
    'as',
    '2026-06-25'
  );

END;
$$;

-- Conditional immediate execution
DO $$
BEGIN
  IF current_setting('m5.defer_smoke_bootstrap', true) IS DISTINCT FROM 'true' THEN
    PERFORM pg_temp.apply_m5_smoke_bootstrap();
  END IF;
END;
$$;
