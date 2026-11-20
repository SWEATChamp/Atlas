-- =============================================================================
-- ASSERTIONS: Milestone 5 Hosted-Smoke Verification
--
-- File: supabase/tests/fixtures/milestone_5_hosted_smoke/assertions.sql
--
-- Purpose:
--   Verifies that the Milestone 5 target-grade planner smoke scenario is
--   active, properly linked, and functionally correct for User 1, while
--   confirming strict cross-user RLS denial for User 2.
-- =============================================================================

DO $$
DECLARE
  v_u1 UUID;
  v_u2 UUID;
  v_link_count INT;
  v_pub_mapping_count INT;
  v_pub_comb_count INT;
  v_u1_enrollments INT;
  v_u1_attempts INT;
  v_u2_visible_attempts INT;
BEGIN
  -- Resolve users from active smoke ledger
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = '_m5_smoke_snapshot') THEN
    RAISE EXCEPTION 'Assertions failed: snapshot schema _m5_smoke_snapshot does not exist'
      USING ERRCODE = '55000';
  END IF;

  SELECT user_1_id, user_2_id INTO v_u1, v_u2
  FROM _m5_smoke_snapshot.smoke_ledger
  ORDER BY bootstrapped_at DESC LIMIT 1;

  IF v_u1 IS NULL OR v_u2 IS NULL THEN
    RAISE EXCEPTION 'Assertions failed: smoke ledger is empty'
      USING ERRCODE = 'P0002';
  END IF;

  -- 1. Bridge link assertion
  SELECT count(*) INTO v_link_count
  FROM public.grade_threshold_combination_carry_forward_links
  WHERE id = 'f1870000-0000-4000-8000-000000000002';

  IF v_link_count <> 1 THEN
    RAISE EXCEPTION 'Assertion failed: expected exactly 1 bridge link, found %', v_link_count
      USING ERRCODE = 'P0003';
  END IF;

  -- 2. Published carry-forward mapping view exposure
  SELECT count(*) INTO v_pub_mapping_count
  FROM public.published_grade_threshold_carry_forward_mappings;

  IF v_pub_mapping_count <> 1 THEN
    RAISE EXCEPTION 'Assertion failed: expected 1 published carry-forward mapping, found %', v_pub_mapping_count
      USING ERRCODE = 'P0003';
  END IF;

  -- 3. Published combination view eligibility (Chem S3, Phys AY, Math DC)
  SELECT count(*) INTO v_pub_comb_count
  FROM public.published_grade_threshold_combinations
  WHERE id IN (
    '00000000-0000-4000-8000-0000000000c1',
    '00000000-0000-4000-8000-0000000000c2',
    '00000000-0000-4000-8000-0000000000c3'
  ) AND per_paper_allocation_eligible = TRUE;

  IF v_pub_comb_count <> 3 THEN
    RAISE EXCEPTION 'Assertion failed: expected 3 eligible combinations in published view, found %', v_pub_comb_count
      USING ERRCODE = 'P0003';
  END IF;

  -- 4. User 1 enrollments and route configurations
  SELECT count(*) INTO v_u1_enrollments
  FROM public.user_subjects
  WHERE user_id = v_u1 AND target_grade IS NOT NULL;

  IF v_u1_enrollments < 3 THEN
    RAISE EXCEPTION 'Assertion failed: expected at least 3 configured enrollments for User 1, found %', v_u1_enrollments
      USING ERRCODE = 'P0003';
  END IF;

  -- 5. User 1 past-paper attempts
  SELECT count(*) INTO v_u1_attempts
  FROM public.past_papers
  WHERE user_id = v_u1 AND id IN (
    'f1870000-0000-4000-8000-000000000003',
    'f1870000-0000-4000-8000-000000000004',
    'f1870000-0000-4000-8000-000000000005'
  );

  IF v_u1_attempts <> 3 THEN
    RAISE EXCEPTION 'Assertion failed: expected 3 past paper attempts for User 1, found %', v_u1_attempts
      USING ERRCODE = 'P0003';
  END IF;

  -- 6. Cross-User RLS Isolation Check (User 2 acting as authenticated role)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_u2, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_u2::text, true);

  SELECT count(*) INTO v_u2_visible_attempts
  FROM public.past_papers
  WHERE user_id = v_u1;

  -- Reset auth claims context
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF v_u2_visible_attempts <> 0 THEN
    RAISE EXCEPTION 'Assertion failed: RLS isolation violation, User 2 can read % attempts of User 1', v_u2_visible_attempts
      USING ERRCODE = '42501';
  END IF;

  RAISE NOTICE 'Milestone 5 hosted-smoke assertions passed successfully.';
END;
$$;
