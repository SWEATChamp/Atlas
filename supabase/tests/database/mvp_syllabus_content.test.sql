-- ============================================================================
-- DATABASE TESTS: Five-Subject MVP Syllabus Content & Availability (Migration 024)
--
-- Run via: npm run test:db (or supabase test db)
-- All changes roll back — no data is persisted.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(68);

CREATE TEMP TABLE mvp_test_results (
  test_num INT PRIMARY KEY,
  pass     BOOLEAN,
  descr    TEXT
) ON COMMIT DROP;

-- ─── 1. Subject Availability & Catalogue Counts ──────────────────────────────

SELECT results_eq(
  $$
    SELECT code FROM public.subjects
    WHERE is_available = TRUE AND is_global = TRUE
    ORDER BY code
  $$,
  $$
    VALUES ('9231'), ('9618'), ('9701'), ('9702'), ('9709')
  $$,
  '1. Exactly five MVP subjects are marked is_available = TRUE'
);

SELECT is_empty(
  $$
    SELECT 1 FROM public.subjects
    WHERE is_available = TRUE AND code NOT IN ('9709', '9231', '9702', '9701', '9618')
  $$,
  '2. No non-MVP subjects are marked is_available = TRUE'
);

SELECT results_eq(
  $$
    SELECT COUNT(*)::INT FROM public.subject_valid_routes
  $$,
  $$ VALUES (22) $$,
  '3. Total canonical route rows across all 5 subjects is exactly 22'
);

SELECT results_eq(
  $$
    SELECT s.code, COUNT(sp.id)::INT
    FROM public.subjects s
    JOIN public.subject_papers sp ON sp.subject_id = s.id
    WHERE s.is_available = TRUE
    GROUP BY s.code
    ORDER BY s.code
  $$,
  $$
    VALUES
      ('9231', 4),
      ('9618', 4),
      ('9701', 5),
      ('9702', 5),
      ('9709', 6)
  $$,
  '4. Official paper counts match syllabus specifications (FM=4, CS=4, Chem=5, Phys=5, Math=6)'
);


-- ─── 2. Canonical 22 Routes Paper & Stage Membership Matrix ──────────────────

-- Mathematics 9709: 8 canonical routes with exact (paper_number, stage) membership
SELECT results_eq(
  $$
    SELECT svr.combination_key, svr.route::TEXT,
           ARRAY_AGG(sp.paper_number || ':' || srp.stage ORDER BY (CASE srp.stage WHEN 'as' THEN 1 WHEN 'a2' THEN 2 ELSE 3 END), sp.paper_number) AS papers
    FROM public.subject_valid_routes svr
    JOIN public.subjects s ON s.id = svr.subject_id
    JOIN public.subject_route_papers srp ON srp.route_id = svr.id
    JOIN public.subject_papers sp ON sp.id = srp.subject_paper_id
    WHERE s.code = '9709'
    GROUP BY svr.combination_key, svr.route
    ORDER BY svr.route::TEXT, svr.combination_key
  $$,
  $$
    VALUES
      ('p1_m1', 'as_only', ARRAY['1:as', '4:as']::TEXT[]),
      ('p1_p2', 'as_only', ARRAY['1:as', '2:as']::TEXT[]),
      ('p1_s1', 'as_only', ARRAY['1:as', '5:as']::TEXT[]),
      ('full_mech_stats', 'full_level', ARRAY['1:as', '4:as', '3:a2', '5:a2']::TEXT[]),
      ('full_stats_double', 'full_level', ARRAY['1:as', '5:as', '3:a2', '6:a2']::TEXT[]),
      ('mech_stats', 'staged', ARRAY['1:as', '4:as', '3:a2', '5:a2']::TEXT[]),
      ('stats_double', 'staged', ARRAY['1:as', '5:as', '3:a2', '6:a2']::TEXT[]),
      ('stats_mech', 'staged', ARRAY['1:as', '5:as', '3:a2', '4:a2']::TEXT[])
  $$,
  '5. Mathematics 9709 has exactly 8 canonical routes with exact (paper_number, stage) membership'
);

-- Further Mathematics 9231: 5 canonical routes with exact (paper_number, stage) membership
SELECT results_eq(
  $$
    SELECT svr.combination_key, svr.route::TEXT,
           ARRAY_AGG(sp.paper_number || ':' || srp.stage ORDER BY (CASE srp.stage WHEN 'as' THEN 1 WHEN 'a2' THEN 2 ELSE 3 END), sp.paper_number) AS papers
    FROM public.subject_valid_routes svr
    JOIN public.subjects s ON s.id = svr.subject_id
    JOIN public.subject_route_papers srp ON srp.route_id = svr.id
    JOIN public.subject_papers sp ON sp.id = srp.subject_paper_id
    WHERE s.code = '9231'
    GROUP BY svr.combination_key, svr.route
    ORDER BY svr.route::TEXT, svr.combination_key
  $$,
  $$
    VALUES
      ('fp1_fm', 'as_only', ARRAY['1:as', '3:as']::TEXT[]),
      ('fp1_fps', 'as_only', ARRAY['1:as', '4:as']::TEXT[]),
      ('full_all', 'full_level', ARRAY['1:as', '3:as', '2:a2', '4:a2']::TEXT[]),
      ('fm_fps', 'staged', ARRAY['1:as', '3:as', '2:a2', '4:a2']::TEXT[]),
      ('fps_fm', 'staged', ARRAY['1:as', '4:as', '2:a2', '3:a2']::TEXT[])
  $$,
  '6. Further Mathematics 9231 has exactly 5 canonical routes with exact (paper_number, stage) membership'
);

-- Physics 9702: 3 canonical routes with exact (paper_number, stage) membership
SELECT results_eq(
  $$
    SELECT svr.route::TEXT,
           ARRAY_AGG(sp.paper_number || ':' || srp.stage ORDER BY (CASE srp.stage WHEN 'as' THEN 1 WHEN 'a2' THEN 2 ELSE 3 END), sp.paper_number) AS papers
    FROM public.subject_valid_routes svr
    JOIN public.subjects s ON s.id = svr.subject_id
    JOIN public.subject_route_papers srp ON srp.route_id = svr.id
    JOIN public.subject_papers sp ON sp.id = srp.subject_paper_id
    WHERE s.code = '9702'
    GROUP BY svr.route
    ORDER BY svr.route::TEXT
  $$,
  $$
    VALUES
      ('as_only', ARRAY['1:as', '2:as', '3:as']::TEXT[]),
      ('full_level', ARRAY['1:as', '2:as', '3:as', '4:a2', '5:a2']::TEXT[]),
      ('staged', ARRAY['1:as', '2:as', '3:as', '4:a2', '5:a2']::TEXT[])
  $$,
  '7. Physics 9702 has exactly 3 fixed routes with Papers 1..3 at AS and 4..5 at A2'
);

-- Chemistry 9701: 3 canonical routes with exact (paper_number, stage) membership
SELECT results_eq(
  $$
    SELECT svr.route::TEXT,
           ARRAY_AGG(sp.paper_number || ':' || srp.stage ORDER BY (CASE srp.stage WHEN 'as' THEN 1 WHEN 'a2' THEN 2 ELSE 3 END), sp.paper_number) AS papers
    FROM public.subject_valid_routes svr
    JOIN public.subjects s ON s.id = svr.subject_id
    JOIN public.subject_route_papers srp ON srp.route_id = svr.id
    JOIN public.subject_papers sp ON sp.id = srp.subject_paper_id
    WHERE s.code = '9701'
    GROUP BY svr.route
    ORDER BY svr.route::TEXT
  $$,
  $$
    VALUES
      ('as_only', ARRAY['1:as', '2:as', '3:as']::TEXT[]),
      ('full_level', ARRAY['1:as', '2:as', '3:as', '4:a2', '5:a2']::TEXT[]),
      ('staged', ARRAY['1:as', '2:as', '3:as', '4:a2', '5:a2']::TEXT[])
  $$,
  '8. Chemistry 9701 has exactly 3 fixed routes with Papers 1..3 at AS and 4..5 at A2'
);

-- Computer Science 9618: 3 canonical routes with exact (paper_number, stage) membership
SELECT results_eq(
  $$
    SELECT svr.route::TEXT,
           ARRAY_AGG(sp.paper_number || ':' || srp.stage ORDER BY (CASE srp.stage WHEN 'as' THEN 1 WHEN 'a2' THEN 2 ELSE 3 END), sp.paper_number) AS papers
    FROM public.subject_valid_routes svr
    JOIN public.subjects s ON s.id = svr.subject_id
    JOIN public.subject_route_papers srp ON srp.route_id = svr.id
    JOIN public.subject_papers sp ON sp.id = srp.subject_paper_id
    WHERE s.code = '9618'
    GROUP BY svr.route
    ORDER BY svr.route::TEXT
  $$,
  $$
    VALUES
      ('as_only', ARRAY['1:as', '2:as']::TEXT[]),
      ('full_level', ARRAY['1:as', '2:as', '3:a2', '4:a2']::TEXT[]),
      ('staged', ARRAY['1:as', '2:as', '3:a2', '4:a2']::TEXT[])
  $$,
  '9. Computer Science 9618 has exactly 3 fixed routes with Papers 1..2 at AS and 3..4 at A2'
);


-- ─── 3. Non-Vacuous Permissions & Security Boundary Tests ────────────────────

-- Verify table-level permissions on subject_paper_selections
SELECT ok(
  has_table_privilege('authenticated', 'public.subject_paper_selections', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.subject_paper_selections', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.subject_paper_selections', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.subject_paper_selections', 'DELETE'),
  '10. authenticated has SELECT-only on subject_paper_selections; direct mutations are denied'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.subject_paper_selections', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.subject_paper_selections', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.subject_paper_selections', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.subject_paper_selections', 'DELETE'),
  '11. anon has no table privileges on subject_paper_selections'
);

-- Verify function execution privileges for all 14 operational RPCs and overloads
SELECT ok(
  has_function_privilege('authenticated', 'public.set_onboarding_subjects(uuid, uuid[])', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.set_onboarding_subjects(uuid, uuid[])', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.user_can_access_chapter(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.user_can_access_chapter(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.compute_readiness_score(uuid, uuid, text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.compute_readiness_score(uuid, uuid, text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.compute_readiness_score(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.compute_readiness_score(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.cancel_inaccessible_missions(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.cancel_inaccessible_missions(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.configure_subject_route(uuid, uuid, public.study_route_enum, jsonb)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.configure_subject_route(uuid, uuid, public.study_route_enum, jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.transition_to_a2(uuid, uuid, public.a2_unlock_method_enum, public.result_type_enum, smallint, smallint, public.paper_session_enum, smallint, boolean)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.transition_to_a2(uuid, uuid, public.a2_unlock_method_enum, public.result_type_enum, smallint, smallint, public.paper_session_enum, smallint, boolean)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.generate_daily_missions(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.generate_daily_missions(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.replace_mission(uuid, uuid, text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.replace_mission(uuid, uuid, text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.get_user_dashboard_stats(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.get_user_dashboard_stats(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.log_past_paper_atomic(uuid, jsonb, jsonb)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.log_past_paper_atomic(uuid, jsonb, jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.update_past_paper_atomic(uuid, uuid, jsonb, jsonb)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.update_past_paper_atomic(uuid, uuid, jsonb, jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.complete_mission(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.complete_mission(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.undo_mission_completion(uuid, uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.undo_mission_completion(uuid, uuid)', 'EXECUTE'),
  '12. authenticated and service_role have EXECUTE on all 14 operational RPC signatures'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.set_onboarding_subjects(uuid, uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.user_can_access_chapter(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.compute_readiness_score(uuid, uuid, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.compute_readiness_score(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.cancel_inaccessible_missions(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.configure_subject_route(uuid, uuid, public.study_route_enum, jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.transition_to_a2(uuid, uuid, public.a2_unlock_method_enum, public.result_type_enum, smallint, smallint, public.paper_session_enum, smallint, boolean)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.generate_daily_missions(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.replace_mission(uuid, uuid, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_user_dashboard_stats(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.log_past_paper_atomic(uuid, jsonb, jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.update_past_paper_atomic(uuid, uuid, jsonb, jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.complete_mission(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.undo_mission_completion(uuid, uuid)', 'EXECUTE'),
  '13. anon has zero EXECUTE permissions on all operational RPCs'
);

-- Verify PUBLIC pseudo-role has zero EXECUTE permissions on all 14 operational RPCs and the repair helper
SELECT ok(
  NOT has_function_privilege('public', 'public.set_onboarding_subjects(uuid, uuid[])', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.user_can_access_chapter(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.compute_readiness_score(uuid, uuid, text)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.compute_readiness_score(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.cancel_inaccessible_missions(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.configure_subject_route(uuid, uuid, public.study_route_enum, jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.transition_to_a2(uuid, uuid, public.a2_unlock_method_enum, public.result_type_enum, smallint, smallint, public.paper_session_enum, smallint, boolean)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.generate_daily_missions(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.replace_mission(uuid, uuid, text)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.get_user_dashboard_stats(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.log_past_paper_atomic(uuid, jsonb, jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.update_past_paper_atomic(uuid, uuid, jsonb, jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.complete_mission(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.undo_mission_completion(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.repair_and_backfill_subject_routes()', 'EXECUTE'),
  '14. PUBLIC pseudo-role has zero EXECUTE permissions on all 14 operational RPCs and the repair helper'
);

-- Verify repair_and_backfill_subject_routes is strictly migration-owner-only (no EXECUTE for authenticated, service_role, anon, or public)
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.repair_and_backfill_subject_routes()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.repair_and_backfill_subject_routes()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.repair_and_backfill_subject_routes()', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.repair_and_backfill_subject_routes()', 'EXECUTE'),
  '15. repair_and_backfill_subject_routes is revoked from authenticated, service_role, anon, and public (migration-owner-only)'
);

-- Set up test user fixture (privileged context)
DO $$
DECLARE
  v_uid UUID := '11111111-1111-4111-a111-111111111111';
  v_sid UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709');
  v_us_id UUID;
  v_sp_id UUID;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_uid, 'testuser@atlas.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, username, email) VALUES (v_uid, 'testuser', 'testuser@atlas.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_settings (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_uid, v_sid, 'unconfirmed', NULL)
  ON CONFLICT (user_id, subject_id) DO NOTHING;
END;
$$;

-- Test direct mutation failure under authenticated role on a real owned user_subjects row
DO $$
DECLARE
  v_uid UUID := '11111111-1111-4111-a111-111111111111';
  v_sid UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709');
  v_us_id UUID;
  v_sp_id UUID;
  v_err TEXT := '';
BEGIN
  SELECT id INTO v_us_id FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_sid;
  SELECT id INTO v_sp_id FROM public.subject_papers WHERE subject_id = v_sid AND paper_number = 1;

  -- Switch to authenticated role
  SET LOCAL ROLE authenticated;
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_uid);
  SET LOCAL request.jwt.claim.role = 'authenticated';

  BEGIN
    INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
    VALUES (v_us_id, 'Pure 1', 1, 'as', v_sp_id);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLSTATE;
  END;

  RESET ROLE;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (16, v_err = '42501', 'Direct INSERT on subject_paper_selections by authenticated user fails with 42501');
END;
$$;

SELECT ok(pass, test_num || '. ' || descr) FROM mvp_test_results WHERE test_num = 16;

-- Test RPC caller guard: anonymous rejection
DO $$
DECLARE
  v_uid_a UUID := '11111111-1111-4111-a111-111111111111';
  v_err   TEXT := '';
BEGIN
  -- Test call under anon role
  SET LOCAL ROLE anon;
  SET LOCAL request.jwt.claim.sub = '';
  SET LOCAL request.jwt.claim.role = 'anon';

  BEGIN
    PERFORM public.generate_daily_missions(v_uid_a);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLSTATE;
  END;

  RESET ROLE;
  SET LOCAL request.jwt.claim.sub = '';
  SET LOCAL request.jwt.claim.role = 'service_role';

  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (17, v_err = '42501', 'Security Definer RPC rejects unauthenticated / anon callers with 42501');
END;
$$;

SELECT ok(pass, test_num || '. ' || descr) FROM mvp_test_results WHERE test_num = 17;


-- ─── 4. Nine Fixed-Route Automatic Population Tests ──────────────────────────

DO $$
DECLARE
  v_uid UUID := '11111111-1111-4111-a111-111111111111';
  v_phys_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702');
  v_chem_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701');
  v_cs_id   UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9618');
  v_us_id   UUID;
  v_count   INT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  -- 18. Physics AS-only auto-population
  SELECT id INTO v_us_id FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_phys_id;
  IF v_us_id IS NULL THEN
    INSERT INTO public.user_subjects (user_id, subject_id, study_route) VALUES (v_uid, v_phys_id, 'unconfirmed') RETURNING id INTO v_us_id;
  END IF;
  PERFORM public.configure_subject_route(v_uid, v_us_id, 'as_only', '[]'::JSONB);
  SELECT COUNT(*) INTO v_count FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND stage = 'as';
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (18, v_count = 3, 'Physics 9702 AS-only automatically populates 3 AS papers (P1, P2, P3)');

  -- 19. Physics Staged auto-population
  PERFORM public.configure_subject_route(v_uid, v_us_id, 'staged', '[]'::JSONB);
  SELECT COUNT(*) INTO v_count FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (19, v_count = 5, 'Physics 9702 Staged automatically populates 5 papers (3 AS + 2 A2)');

  -- 20. Physics Full auto-population
  PERFORM public.configure_subject_route(v_uid, v_us_id, 'full_level', '[]'::JSONB);
  SELECT COUNT(*) INTO v_count FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (20, v_count = 5, 'Physics 9702 Full automatically populates 5 papers (3 AS + 2 A2)');

  -- 21. Chemistry AS-only auto-population
  SELECT id INTO v_us_id FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_chem_id;
  IF v_us_id IS NULL THEN
    INSERT INTO public.user_subjects (user_id, subject_id, study_route) VALUES (v_uid, v_chem_id, 'unconfirmed') RETURNING id INTO v_us_id;
  END IF;
  PERFORM public.configure_subject_route(v_uid, v_us_id, 'as_only', '[]'::JSONB);
  SELECT COUNT(*) INTO v_count FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND stage = 'as';
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (21, v_count = 3, 'Chemistry 9701 AS-only automatically populates 3 AS papers (P1, P2, P3)');

  -- 22. Chemistry Staged auto-population
  PERFORM public.configure_subject_route(v_uid, v_us_id, 'staged', '[]'::JSONB);
  SELECT COUNT(*) INTO v_count FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (22, v_count = 5, 'Chemistry 9701 Staged automatically populates 5 papers (3 AS + 2 A2)');

  -- 23. Chemistry Full auto-population
  PERFORM public.configure_subject_route(v_uid, v_us_id, 'full_level', '[]'::JSONB);
  SELECT COUNT(*) INTO v_count FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (23, v_count = 5, 'Chemistry 9701 Full automatically populates 5 papers (3 AS + 2 A2)');

  -- 24. Computer Science AS-only auto-population
  SELECT id INTO v_us_id FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_cs_id;
  IF v_us_id IS NULL THEN
    INSERT INTO public.user_subjects (user_id, subject_id, study_route) VALUES (v_uid, v_cs_id, 'unconfirmed') RETURNING id INTO v_us_id;
  END IF;
  PERFORM public.configure_subject_route(v_uid, v_us_id, 'as_only', '[]'::JSONB);
  SELECT COUNT(*) INTO v_count FROM public.subject_paper_selections WHERE user_subject_id = v_us_id AND stage = 'as';
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (24, v_count = 2, 'Computer Science 9618 AS-only automatically populates 2 AS papers (P1, P2)');

  -- 25. Computer Science Staged auto-population
  PERFORM public.configure_subject_route(v_uid, v_us_id, 'staged', '[]'::JSONB);
  SELECT COUNT(*) INTO v_count FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (25, v_count = 4, 'Computer Science 9618 Staged automatically populates 4 papers (2 AS + 2 A2)');

  -- 26. Computer Science Full auto-population
  PERFORM public.configure_subject_route(v_uid, v_us_id, 'full_level', '[]'::JSONB);
  SELECT COUNT(*) INTO v_count FROM public.subject_paper_selections WHERE user_subject_id = v_us_id;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (26, v_count = 4, 'Computer Science 9618 Full automatically populates 4 papers (2 AS + 2 A2)');

  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok(pass, test_num || '. ' || descr) FROM mvp_test_results WHERE test_num BETWEEN 18 AND 26 ORDER BY test_num;


-- ─── 5. Route Validation Rejections ──────────────────────────────────────────

DO $$
DECLARE
  v_uid UUID := '11111111-1111-4111-a111-111111111111';
  v_math_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709');
  v_phys_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702');
  v_us_math UUID;
  v_us_phys UUID;
  v_err TEXT := '';
BEGIN
  SELECT id INTO v_us_math FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_math_id;
  SELECT id INTO v_us_phys FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_phys_id;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  -- 27. Partial selection (Maths AS-only with 1 paper)
  BEGIN
    PERFORM public.configure_subject_route(
      v_uid, v_us_math, 'as_only',
      '[{"paper_number": 1, "component_name": "Pure 1", "stage": "as"}]'::JSONB
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (27, v_err = 'P0003', 'Partial selection for Mathematics AS-only rejected with P0003');

  -- 28. Excess selection (Maths AS-only with 3 papers)
  v_err := '';
  BEGIN
    PERFORM public.configure_subject_route(
      v_uid, v_us_math, 'as_only',
      '[{"paper_number": 1, "component_name": "Pure 1", "stage": "as"},
        {"paper_number": 4, "component_name": "Mechanics", "stage": "as"},
        {"paper_number": 5, "component_name": "Statistics 1", "stage": "as"}]'::JSONB
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (28, v_err = 'P0003', 'Excess selection for Mathematics AS-only rejected with P0003');

  -- 29. Duplicate papers in selection
  v_err := '';
  BEGIN
    PERFORM public.configure_subject_route(
      v_uid, v_us_math, 'as_only',
      '[{"paper_number": 1, "component_name": "Pure 1", "stage": "as"},
        {"paper_number": 1, "component_name": "Pure 1", "stage": "as"}]'::JSONB
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (29, v_err = 'P0003', 'Duplicate papers in route selection rejected with P0003');

  -- 30. Wrong-stage paper (Pure 3 tagged as AS)
  v_err := '';
  BEGIN
    PERFORM public.configure_subject_route(
      v_uid, v_us_math, 'as_only',
      '[{"paper_number": 1, "component_name": "Pure 1", "stage": "as"},
        {"paper_number": 3, "component_name": "Pure 3", "stage": "as"}]'::JSONB
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (30, v_err = 'P0003', 'Invalid stage assignment (Pure 3 as AS) rejected with P0003');

  -- 31. Invalid paper number for subject (Paper 6 for Physics)
  v_err := '';
  BEGIN
    PERFORM public.configure_subject_route(
      v_uid, v_us_phys, 'as_only',
      '[{"paper_number": 6, "component_name": "Invalid Paper", "stage": "as"}]'::JSONB
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (31, v_err = 'P0003', 'Non-existent paper for subject rejected with P0003');

  -- 32. Cross-subject paper selection
  v_err := '';
  BEGIN
    PERFORM public.configure_subject_route(
      v_uid, v_us_math, 'as_only',
      '[{"paper_number": 1, "component_name": "Physics P1", "stage": "as", "subject_paper_id": "00000000-0000-0000-0000-000000000000"}]'::JSONB
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (32, v_err = 'P0003', 'Cross-subject paper selection rejected with P0003');

  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok(pass, test_num || '. ' || descr) FROM mvp_test_results WHERE test_num BETWEEN 27 AND 32 ORDER BY test_num;


-- ─── 6. Upgrade Backfill with Explicit Preservation Assertions ────────────────

DO $$
DECLARE
  v_u_unambig UUID := '33333333-3333-4333-a333-333333333333';
  v_u_ambig   UUID := '44444444-4444-4444-a444-444444444444';
  v_u_custom  UUID := '55555555-5555-4555-a555-555555555555';
  v_u_unsupp  UUID := '77777777-7777-4777-a777-777777777777';
  v_math_id   UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709');
  v_phys_id   UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702');
  v_chem_id   UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701');
  v_cust_sid  UUID := '66666666-6666-4666-a666-666666666666';
  v_unsupp_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9700'); -- Biology
  v_us_unambig UUID;
  v_us_ambig   UUID;
  v_us_custom  UUID;
  v_us_unsupp  UUID;
  v_ch_p1      UUID;
  v_ch_p3      UUID;
  v_cust_ch_id UUID;
  v_pre_ch_m1  UUID;
  v_pre_ch_p2  UUID;
  v_pre_ch_c28 UUID;
  v_uc_id      UUID;
  v_dm_comp    UUID;
  v_dm_pend_ch UUID;
  v_dm_pend_pp UUID;
  v_sp_p4      UUID;
  v_pp_u1      UUID;
  v_pp_u2      UUID;
  v_pp_unsupp  UUID;
  v_route_after TEXT;
  v_stage_after TEXT;
  v_sel_count   INT;
  v_ch_stat     TEXT;
  v_ch_reason   TEXT;
  v_pp_stat     TEXT;
  v_pp_reason   TEXT;
  v_comp_stat   TEXT;
  v_xp_u1_before INT;
  v_xp_u2_before INT;
  v_xp_u3_before INT;
  v_xp_u4_before INT;
  v_pp_cnt_u1   INT;
  v_pqa_cnt_u1  INT;
  v_xpe_cnt_u1  INT;
  v_xpe_before_u1 INT;
BEGIN
  -- Record pre-repair chapter UUIDs for stability verification
  SELECT id INTO v_pre_ch_m1 FROM public.chapters WHERE subject_id = v_math_id AND component = 'Pure 1' AND number = 1;
  SELECT id INTO v_pre_ch_p2 FROM public.chapters WHERE subject_id = v_phys_id AND number = 2;
  SELECT id INTO v_pre_ch_c28 FROM public.chapters WHERE subject_id = v_chem_id AND number = 28;

  -- Setup users
  INSERT INTO auth.users (id, email) VALUES
    (v_u_unambig, 'unambig@test.com'),
    (v_u_ambig, 'ambig@test.com'),
    (v_u_custom, 'custom@test.com'),
    (v_u_unsupp, 'unsupp@test.com')
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles SET total_xp = 50 WHERE id = v_u_custom;
  UPDATE public.profiles SET total_xp = 100 WHERE id = v_u_unsupp;
  INSERT INTO public.user_settings (user_id) VALUES (v_u_unambig), (v_u_ambig), (v_u_custom), (v_u_unsupp) ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO v_ch_p1 FROM public.chapters WHERE subject_id = v_math_id AND component = 'Pure 1' AND number = 1;
  SELECT id INTO v_ch_p3 FROM public.chapters WHERE subject_id = v_math_id AND component = 'Pure 3' AND number = 9;
  SELECT id INTO v_sp_p4 FROM public.subject_papers WHERE subject_id = v_math_id AND paper_number = 4;

  -- Disable validation triggers temporarily to construct exact pre-migration database state
  ALTER TABLE public.past_papers DISABLE TRIGGER trg_validate_past_paper_entry;
  ALTER TABLE public.paper_question_attempts DISABLE TRIGGER trg_validate_question_attempt_chapter;

  -- ── User 1: Unambiguous Maths staged enrolment (mech_stats: P1, P4 at AS, P3, P5 at A2) ──
  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_u_unambig, v_math_id, 'staged', 'as') RETURNING id INTO v_us_unambig;

  -- Pre-migration style selections without subject_paper_id
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  VALUES
    (v_us_unambig, 'Pure 1', 1, 'as', NULL),
    (v_us_unambig, 'Mechanics', 4, 'as', NULL),
    (v_us_unambig, 'Pure 3', 3, 'a2', NULL),
    (v_us_unambig, 'Statistics 1', 5, 'a2', NULL);

  INSERT INTO public.user_chapters (user_id, chapter_id, notes_status, confidence_level)
  VALUES (v_u_unambig, v_ch_p1, 'complete', 4);

  -- Historical past paper & question attempts
  INSERT INTO public.past_papers (user_id, subject_id, paper_number, year, session, score_raw, score_max, stage, paper_code)
  VALUES (v_u_unambig, v_math_id, 12, 2024, 'may_jun', 40, 50, 'as', '9709/12/M/J/24')
  RETURNING id INTO v_pp_u1;

  INSERT INTO public.paper_question_attempts (paper_id, question_number, chapter_id, marks_obtained, marks_available)
  VALUES
    (v_pp_u1, '1', v_ch_p1, 20, 25),
    (v_pp_u1, '2', v_ch_p1, 20, 25);

  INSERT INTO public.xp_events (user_id, xp_amount, event_type, metadata)
  VALUES (v_u_unambig, 150, 'paper_attempt', '{"description": "Completed past paper"}'::JSONB);

  -- ── User 2: Ambiguous elective enrolment (missing paper combinations) ──
  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_u_ambig, v_math_id, 'staged', 'as') RETURNING id INTO v_us_ambig;

  -- Incomplete invalid selection
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  VALUES (v_us_ambig, 'Pure 1', 1, 'as', NULL);

  INSERT INTO public.user_chapters (user_id, chapter_id, notes_status, confidence_level)
  VALUES (v_u_ambig, v_ch_p1, 'in_progress', 2) RETURNING id INTO v_uc_id;

  INSERT INTO public.past_papers (user_id, subject_id, paper_number, year, session, score_raw, score_max, stage, paper_code)
  VALUES (v_u_ambig, v_math_id, 11, 2024, 'may_jun', 35, 50, 'as', '9709/11/M/J/24')
  RETURNING id INTO v_pp_u2;

  INSERT INTO public.paper_question_attempts (paper_id, question_number, chapter_id, marks_obtained, marks_available)
  VALUES (v_pp_u2, '1', v_ch_p1, 35, 50);

  INSERT INTO public.xp_events (user_id, xp_amount, event_type, metadata)
  VALUES (v_u_ambig, 75, 'mission_complete', '{"description": "Completed task"}'::JSONB);

  -- User 2 has 1 completed mission, 1 pending chapter mission, 1 pending attempt_paper mission
  INSERT INTO public.daily_missions (user_id, mission_date, type, target_entity_type, target_entity_id, status, xp_reward, title, description, completed_at)
  VALUES (v_u_ambig, CURRENT_DATE, 'complete_notes', 'chapter', v_uc_id, 'completed', 50, 'Complete P1', 'Desc', NOW())
  RETURNING id INTO v_dm_comp;

  INSERT INTO public.daily_missions (user_id, mission_date, type, target_entity_type, target_entity_id, status, xp_reward, title, description)
  VALUES (v_u_ambig, CURRENT_DATE, 'revisit_weak_topic', 'chapter', v_uc_id, 'pending', 40, 'Revisit P1', 'Desc')
  RETURNING id INTO v_dm_pend_ch;

  INSERT INTO public.daily_missions (user_id, mission_date, type, target_entity_type, target_entity_id, subject_paper_id, status, xp_reward, title, description)
  VALUES (v_u_ambig, CURRENT_DATE, 'attempt_paper', 'subject', v_math_id, v_sp_p4, 'pending', 75, 'Attempt P4', 'Desc')
  RETURNING id INTO v_dm_pend_pp;

  -- ── User 3: Custom subject with colliding code 9709 (is_global = FALSE) ──
  INSERT INTO public.subjects (id, name, code, is_global, is_available)
  VALUES (v_cust_sid, 'Custom Maths Course', '9709', FALSE, FALSE) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.chapters (subject_id, number, title, stage, component, is_active)
  VALUES (v_cust_sid, 1, 'Custom Topic 1', 'as', 'Custom Paper A', TRUE) ON CONFLICT DO NOTHING;

  SELECT id INTO v_cust_ch_id FROM public.chapters WHERE subject_id = v_cust_sid AND number = 1;

  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_u_custom, v_cust_sid, 'as_only', 'as') RETURNING id INTO v_us_custom;

  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  VALUES (v_us_custom, 'Custom Paper A', 1, 'as', NULL);

  INSERT INTO public.user_chapters (user_id, chapter_id, notes_status, confidence_level)
  VALUES (v_u_custom, v_cust_ch_id, 'complete', 5);

  INSERT INTO public.daily_missions (user_id, mission_date, type, target_entity_type, target_entity_id, status, xp_reward, title, description)
  SELECT v_u_custom, CURRENT_DATE, 'complete_notes', 'chapter', uc.id, 'pending', 50, 'Custom Note', 'Desc'
  FROM public.user_chapters uc JOIN public.chapters c ON c.id = uc.chapter_id WHERE uc.user_id = v_u_custom;

  -- ── User 4: Unsupported subject (e.g. Biology 9700, is_available = FALSE) ──
  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_u_unsupp, v_unsupp_id, 'as_only', 'as') RETURNING id INTO v_us_unsupp;

  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  VALUES (v_us_unsupp, 'AS', 1, 'as', NULL);

  INSERT INTO public.past_papers (user_id, subject_id, paper_number, year, session, score_raw, score_max, stage, paper_code)
  VALUES (v_u_unsupp, v_unsupp_id, 11, 2024, 'may_jun', 28, 40, 'as', '9700/11/M/J/24')
  RETURNING id INTO v_pp_unsupp;

  INSERT INTO public.paper_question_attempts (paper_id, question_number, marks_obtained, marks_available)
  VALUES (v_pp_unsupp, '1', 28, 40);

  -- Re-enable validation triggers
  ALTER TABLE public.past_papers ENABLE TRIGGER trg_validate_past_paper_entry;
  ALTER TABLE public.paper_question_attempts ENABLE TRIGGER trg_validate_question_attempt_chapter;

  -- Capture exact pre-repair profile total_xp & xp_events count for preservation assertion
  SELECT total_xp INTO v_xp_u1_before FROM public.profiles WHERE id = v_u_unambig;
  SELECT total_xp INTO v_xp_u2_before FROM public.profiles WHERE id = v_u_ambig;
  SELECT total_xp INTO v_xp_u3_before FROM public.profiles WHERE id = v_u_custom;
  SELECT total_xp INTO v_xp_u4_before FROM public.profiles WHERE id = v_u_unsupp;
  SELECT COUNT(*) INTO v_xpe_before_u1 FROM public.xp_events WHERE user_id = v_u_unambig;

  -- ── Execute upgrade repair function ──
  PERFORM public.repair_and_backfill_subject_routes();

  -- 33. Unambiguous User: route remains 'staged', selections have non-null subject_paper_id
  SELECT study_route::TEXT, current_stage::TEXT INTO v_route_after, v_stage_after FROM public.user_subjects WHERE id = v_us_unambig;
  SELECT COUNT(*) INTO v_sel_count FROM public.subject_paper_selections WHERE user_subject_id = v_us_unambig AND subject_paper_id IS NOT NULL;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (33, v_route_after = 'staged' AND v_stage_after = 'as' AND v_sel_count = 4,
    'Upgrade backfill matches unambiguous elective route and populates all subject_paper_ids');

  -- 34. Ambiguous User: study_route becomes 'unconfirmed', selections deleted
  SELECT study_route::TEXT, current_stage::TEXT INTO v_route_after, v_stage_after FROM public.user_subjects WHERE id = v_us_ambig;
  SELECT COUNT(*) INTO v_sel_count FROM public.subject_paper_selections WHERE user_subject_id = v_us_ambig;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (34, v_route_after = 'unconfirmed' AND v_stage_after IS NULL AND v_sel_count = 0,
    'Upgrade backfill falls back ambiguous elective route to unconfirmed and clears selections');

  -- 35. Ambiguous User Mission Cancellation: pending missions skipped with route_unconfirmed, completed mission intact
  SELECT status, skip_reason INTO v_ch_stat, v_ch_reason FROM public.daily_missions WHERE id = v_dm_pend_ch;
  SELECT status, skip_reason INTO v_pp_stat, v_pp_reason FROM public.daily_missions WHERE id = v_dm_pend_pp;
  SELECT status INTO v_comp_stat FROM public.daily_missions WHERE id = v_dm_comp;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (35,
    v_ch_stat = 'skipped' AND v_ch_reason = 'route_unconfirmed'
    AND v_pp_stat = 'skipped' AND v_pp_reason = 'route_unconfirmed'
    AND v_comp_stat = 'completed'
    AND (SELECT total_xp FROM public.profiles WHERE id = v_u_ambig) = v_xp_u2_before,
    'Upgrade backfill cancels pending missions with status=skipped AND skip_reason=route_unconfirmed, preserving completed missions & total XP');

  -- 36. Historical Past Papers, Question Attempts, XP Events, and User Chapters are strictly preserved
  SELECT COUNT(*) INTO v_pp_cnt_u1 FROM public.past_papers WHERE user_id = v_u_unambig AND id = v_pp_u1 AND score_raw = 40;
  SELECT COUNT(*) INTO v_pqa_cnt_u1 FROM public.paper_question_attempts WHERE paper_id = v_pp_u1;
  SELECT COUNT(*) INTO v_xpe_cnt_u1 FROM public.xp_events WHERE user_id = v_u_unambig;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (36,
    v_pp_cnt_u1 = 1 AND v_pqa_cnt_u1 = 2 AND v_xpe_cnt_u1 = v_xpe_before_u1
    AND (SELECT total_xp FROM public.profiles WHERE id = v_u_unambig) = v_xp_u1_before
    AND (SELECT notes_status FROM public.user_chapters WHERE user_id = v_u_unambig AND chapter_id = v_ch_p1) = 'complete'
    AND (SELECT confidence_level FROM public.user_chapters WHERE user_id = v_u_unambig AND chapter_id = v_ch_p1) = 4
    AND (SELECT notes_status FROM public.user_chapters WHERE user_id = v_u_ambig AND chapter_id = v_ch_p1) = 'in_progress'
    AND (SELECT confidence_level FROM public.user_chapters WHERE user_id = v_u_ambig AND chapter_id = v_ch_p1) = 2,
    'Historical past papers, question attempts, xp_events, profile total_xp, notes_status, and confidence_level are strictly preserved');

  -- 37. Custom Subject & Unsupported Subject Data strictly preserved
  SELECT study_route::TEXT, current_stage::TEXT INTO v_route_after, v_stage_after FROM public.user_subjects WHERE id = v_us_custom;
  SELECT COUNT(*) INTO v_sel_count FROM public.subject_paper_selections WHERE user_subject_id = v_us_custom;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (37,
    v_route_after = 'as_only' AND v_stage_after = 'as' AND v_sel_count = 1
    AND (SELECT total_xp FROM public.profiles WHERE id = v_u_custom) = v_xp_u3_before
    AND (SELECT status FROM public.daily_missions WHERE user_id = v_u_custom) = 'pending'
    AND (SELECT notes_status FROM public.user_chapters WHERE user_id = v_u_custom AND chapter_id = v_cust_ch_id) = 'complete'
    AND (SELECT confidence_level FROM public.user_chapters WHERE user_id = v_u_custom AND chapter_id = v_cust_ch_id) = 5
    AND (SELECT study_route::TEXT FROM public.user_subjects WHERE id = v_us_unsupp) = 'as_only'
    AND (SELECT COUNT(*) FROM public.subject_paper_selections WHERE user_subject_id = v_us_unsupp AND component_name = 'AS' AND paper_number = 1 AND stage = 'as') = 1
    AND (SELECT COUNT(*) FROM public.past_papers WHERE id = v_pp_unsupp AND score_raw = 28 AND score_max = 40) = 1
    AND (SELECT COUNT(*) FROM public.paper_question_attempts WHERE paper_id = v_pp_unsupp AND question_number = '1' AND marks_obtained = 28 AND marks_available = 40) = 1
    AND (SELECT total_xp FROM public.profiles WHERE id = v_u_unsupp) = v_xp_u4_before,
    'Custom subjects and unsupported subjects retain route, stage, selections, user_chapters, question attempts, missions, past papers, and XP without alteration');

  -- 38. Chapter ID stability check (exact UUID equality before vs after)
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (38,
    (SELECT id FROM public.chapters WHERE subject_id = v_math_id AND component = 'Pure 1' AND number = 1) = v_pre_ch_m1
    AND (SELECT id FROM public.chapters WHERE subject_id = v_phys_id AND number = 2) = v_pre_ch_p2
    AND (SELECT id FROM public.chapters WHERE subject_id = v_chem_id AND number = 28) = v_pre_ch_c28,
    'Exact pre-existing chapter UUIDs for Maths, Physics, and Chemistry are unchanged (ID stability verified)');

  -- 39. Deprecated chapter is_active check
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (39,
    (SELECT is_active FROM public.chapters WHERE subject_id = v_math_id AND component = 'Pure 1' AND number = 99) = FALSE
    AND (SELECT is_active FROM public.chapters WHERE subject_id = v_phys_id AND number = 99) = FALSE,
    'Non-syllabus chapters (Vectors 99, Electromagnetic Induction 99) have is_active = FALSE');
END;
$$;

SELECT ok(pass, test_num || '. ' || descr) FROM mvp_test_results WHERE test_num BETWEEN 33 AND 39 ORDER BY test_num;


-- ─── 7. Chapter Access & Stage Transitions Across All 5 MVP Subjects ─────────

DO $$
DECLARE
  v_uid UUID := '11111111-1111-4111-a111-111111111111';
  v_math_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709');
  v_fm_id   UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9231');
  v_phys_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702');
  v_chem_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701');
  v_cs_id   UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9618');
  v_us_math UUID;
  v_us_fm   UUID;
  v_us_phys UUID;
  v_us_chem UUID;
  v_us_cs   UUID;
  v_ch_m_as UUID;
  v_ch_m_a2 UUID;
  v_ch_fm_as UUID;
  v_ch_fm_a2 UUID;
  v_ch_ph_as UUID;
  v_ch_ph_a2 UUID;
  v_ch_ch_as UUID;
  v_ch_ch_a2 UUID;
  v_ch_cs_as UUID;
  v_ch_cs_a2 UUID;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  -- Maths chapters (Pure 1 vs Pure 3)
  SELECT id INTO v_ch_m_as FROM public.chapters WHERE subject_id = v_math_id AND component = 'Pure 1' AND number = 1;
  SELECT id INTO v_ch_m_a2 FROM public.chapters WHERE subject_id = v_math_id AND component = 'Pure 3' AND number = 9;

  -- Further Maths chapters (FP1 Topic 1 vs FP2 Topic 1)
  SELECT id INTO v_ch_fm_as FROM public.chapters WHERE subject_id = v_fm_id AND component = 'Further Pure 1' AND number = 1;
  SELECT id INTO v_ch_fm_a2 FROM public.chapters WHERE subject_id = v_fm_id AND component = 'Further Pure 2' AND number = 1;

  -- Physics chapters (Topic 2 Kinematics vs Topic 12 Circular Motion)
  SELECT id INTO v_ch_ph_as FROM public.chapters WHERE subject_id = v_phys_id AND number = 2;
  SELECT id INTO v_ch_ph_a2 FROM public.chapters WHERE subject_id = v_phys_id AND number = 12;

  -- Chemistry chapters (Topic 1 Atoms vs Topic 27 Group 2)
  SELECT id INTO v_ch_ch_as FROM public.chapters WHERE subject_id = v_chem_id AND number = 1;
  SELECT id INTO v_ch_ch_a2 FROM public.chapters WHERE subject_id = v_chem_id AND number = 27;

  -- CS chapters (Topic 1 Information vs Topic 19 Computational thinking)
  SELECT id INTO v_ch_cs_as FROM public.chapters WHERE subject_id = v_cs_id AND number = 1;
  SELECT id INTO v_ch_cs_a2 FROM public.chapters WHERE subject_id = v_cs_id AND number = 19;

  -- 40. Mathematics: AS student accesses Pure 1, cannot access Pure 3; after A2 transition, accesses Pure 3
  SELECT id INTO v_us_math FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_math_id;
  PERFORM public.configure_subject_route(
    v_uid, v_us_math, 'staged',
    '[{"paper_number": 1, "component_name": "Pure 1", "stage": "as"},
      {"paper_number": 4, "component_name": "Mechanics", "stage": "as"},
      {"paper_number": 3, "component_name": "Pure 3", "stage": "a2"},
      {"paper_number": 5, "component_name": "Statistics 1", "stage": "a2"}]'::JSONB
  );
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (40, public.user_can_access_chapter(v_uid, v_ch_m_as) = TRUE AND public.user_can_access_chapter(v_uid, v_ch_m_a2) = FALSE,
    'Mathematics 9709 AS student accesses AS chapters and is blocked from A2 chapters');

  PERFORM public.transition_to_a2(v_uid, v_us_math, 'manual');
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (41, public.user_can_access_chapter(v_uid, v_ch_m_a2) = TRUE,
    'Mathematics 9709 A2 transition grants access to A2 chapters');

  -- 42. Further Mathematics: AS student accesses FP1, blocked from FP2; after transition accesses FP2
  SELECT id INTO v_us_fm FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_fm_id;
  IF v_us_fm IS NULL THEN
    INSERT INTO public.user_subjects (user_id, subject_id, study_route) VALUES (v_uid, v_fm_id, 'unconfirmed') RETURNING id INTO v_us_fm;
  END IF;
  PERFORM public.configure_subject_route(
    v_uid, v_us_fm, 'staged',
    '[{"paper_number": 1, "component_name": "Further Pure 1", "stage": "as"},
      {"paper_number": 3, "component_name": "Further Mechanics", "stage": "as"},
      {"paper_number": 2, "component_name": "Further Pure 2", "stage": "a2"},
      {"paper_number": 4, "component_name": "Further Probability & Statistics", "stage": "a2"}]'::JSONB
  );
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (42, public.user_can_access_chapter(v_uid, v_ch_fm_as) = TRUE AND public.user_can_access_chapter(v_uid, v_ch_fm_a2) = FALSE,
    'Further Mathematics 9231 AS student accesses FP1 and is blocked from FP2');

  PERFORM public.transition_to_a2(v_uid, v_us_fm, 'manual');
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (43, public.user_can_access_chapter(v_uid, v_ch_fm_a2) = TRUE,
    'Further Mathematics 9231 A2 transition grants access to FP2');

  -- 44. Physics: AS student accesses Topic 2, blocked from Topic 12; after transition accesses Topic 12
  SELECT id INTO v_us_phys FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_phys_id;
  PERFORM public.configure_subject_route(v_uid, v_us_phys, 'staged', '[]'::JSONB);
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (44, public.user_can_access_chapter(v_uid, v_ch_ph_as) = TRUE AND public.user_can_access_chapter(v_uid, v_ch_ph_a2) = FALSE,
    'Physics 9702 AS student accesses AS kinematics and is blocked from A2 circular motion');

  PERFORM public.transition_to_a2(v_uid, v_us_phys, 'manual');
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (45, public.user_can_access_chapter(v_uid, v_ch_ph_a2) = TRUE,
    'Physics 9702 A2 transition grants access to A2 circular motion');

  -- 46. Chemistry: AS student accesses Topic 1, blocked from Topic 27; after transition accesses Topic 27
  SELECT id INTO v_us_chem FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_chem_id;
  PERFORM public.configure_subject_route(v_uid, v_us_chem, 'staged', '[]'::JSONB);
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (46, public.user_can_access_chapter(v_uid, v_ch_ch_as) = TRUE AND public.user_can_access_chapter(v_uid, v_ch_ch_a2) = FALSE,
    'Chemistry 9701 AS student accesses AS topics and is blocked from A2 Group 2');

  PERFORM public.transition_to_a2(v_uid, v_us_chem, 'manual');
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (47, public.user_can_access_chapter(v_uid, v_ch_ch_a2) = TRUE,
    'Chemistry 9701 A2 transition grants access to A2 Group 2');

  -- 48. Computer Science: AS student accesses Topic 1, blocked from Topic 19; after transition accesses Topic 19
  SELECT id INTO v_us_cs FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_cs_id;
  PERFORM public.configure_subject_route(v_uid, v_us_cs, 'staged', '[]'::JSONB);
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (48, public.user_can_access_chapter(v_uid, v_ch_cs_as) = TRUE AND public.user_can_access_chapter(v_uid, v_ch_cs_a2) = FALSE,
    'Computer Science 9618 AS student accesses AS topics and is blocked from A2 Paper 4');

  PERFORM public.transition_to_a2(v_uid, v_us_cs, 'manual');
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (49, public.user_can_access_chapter(v_uid, v_ch_cs_a2) = TRUE,
    'Computer Science 9618 A2 transition grants access to A2 Paper 4 topics');

  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok(pass, test_num || '. ' || descr) FROM mvp_test_results WHERE test_num BETWEEN 40 AND 49 ORDER BY test_num;


-- ─── 8. Practical & Theory Assessment Boundaries Matrix ───────────────────────

DO $$
DECLARE
  v_uid UUID := '11111111-1111-4111-a111-111111111111';
  v_math_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709');
  v_phys_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702');
  v_chem_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701');
  v_cs_id   UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9618');
  v_us_math UUID;
  v_us_chem UUID;
  v_us_cs   UUID;
  v_sp_m_p1 UUID;
  v_sp_m_p3 UUID;
  v_sp_ph_p3 UUID;
  v_sp_ph_p5 UUID;
  v_sp_ch_p3 UUID;
  v_sp_ch_p5 UUID;
  v_sp_cs_p4 UUID;
  v_ch_m_p1 UUID;
  v_ch_m_p3 UUID;
  v_ch_ph_as UUID;
  v_ch_ph_a2 UUID;
  v_ch_ch_as UUID;
  v_ch_ch_a2 UUID;
  v_ch_cs_t1 UUID;
  v_ch_cs_t13 UUID;
  v_ch_cs_t19 UUID;
  v_ch_cs_t20 UUID;
  v_err      TEXT := '';
BEGIN
  SELECT id INTO v_sp_m_p1 FROM public.subject_papers WHERE subject_id = v_math_id AND paper_number = 1;
  SELECT id INTO v_sp_m_p3 FROM public.subject_papers WHERE subject_id = v_math_id AND paper_number = 3;
  SELECT id INTO v_sp_ph_p3 FROM public.subject_papers WHERE subject_id = v_phys_id AND paper_number = 3;
  SELECT id INTO v_sp_ph_p5 FROM public.subject_papers WHERE subject_id = v_phys_id AND paper_number = 5;
  SELECT id INTO v_sp_ch_p3 FROM public.subject_papers WHERE subject_id = v_chem_id AND paper_number = 3;
  SELECT id INTO v_sp_ch_p5 FROM public.subject_papers WHERE subject_id = v_chem_id AND paper_number = 5;
  SELECT id INTO v_sp_cs_p4 FROM public.subject_papers WHERE subject_id = v_cs_id AND paper_number = 4;

  SELECT id INTO v_ch_m_p1 FROM public.chapters WHERE subject_id = v_math_id AND component = 'Pure 1' AND number = 1;
  SELECT id INTO v_ch_m_p3 FROM public.chapters WHERE subject_id = v_math_id AND component = 'Pure 3' AND number = 9;
  SELECT id INTO v_ch_ph_as FROM public.chapters WHERE subject_id = v_phys_id AND number = 2;
  SELECT id INTO v_ch_ph_a2 FROM public.chapters WHERE subject_id = v_phys_id AND number = 12;
  SELECT id INTO v_ch_ch_as FROM public.chapters WHERE subject_id = v_chem_id AND number = 1;
  SELECT id INTO v_ch_ch_a2 FROM public.chapters WHERE subject_id = v_chem_id AND number = 27;
  SELECT id INTO v_ch_cs_t1 FROM public.chapters WHERE subject_id = v_cs_id AND number = 1;
  SELECT id INTO v_ch_cs_t13 FROM public.chapters WHERE subject_id = v_cs_id AND number = 13;
  SELECT id INTO v_ch_cs_t19 FROM public.chapters WHERE subject_id = v_cs_id AND number = 19;
  SELECT id INTO v_ch_cs_t20 FROM public.chapters WHERE subject_id = v_cs_id AND number = 20;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  -- 50. Physics Paper 3 (Practical) allows AS chapter and rejects A2 chapter with P0008
  PERFORM public.log_past_paper_atomic(
    v_uid,
    jsonb_build_object(
      'subject_id', v_phys_id, 'subject_paper_id', v_sp_ph_p3, 'paper_number', 31,
      'stage', 'as', 'year', 2025, 'session', 'may_jun'
    ),
    jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_ph_as, 'marks_obtained', 20, 'marks_available', 20))
  );

  v_err := '';
  BEGIN
    PERFORM public.log_past_paper_atomic(
      v_uid,
      jsonb_build_object(
        'subject_id', v_phys_id, 'subject_paper_id', v_sp_ph_p3, 'paper_number', 31,
        'stage', 'as', 'year', 2024, 'session', 'may_jun'
      ),
      jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_ph_a2, 'marks_obtained', 20, 'marks_available', 20))
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (50, v_err = 'P0008', 'Physics Paper 3 practical accepts AS chapter and rejects A2 chapter with P0008');

  -- 51. Physics Paper 5 allows both AS and A2 accessible chapters
  PERFORM public.log_past_paper_atomic(
    v_uid,
    jsonb_build_object(
      'subject_id', v_phys_id, 'subject_paper_id', v_sp_ph_p5, 'paper_number', 51,
      'stage', 'a2', 'year', 2025, 'session', 'may_jun'
    ),
    jsonb_build_array(
      jsonb_build_object('question_number', '1', 'chapter_id', v_ch_ph_as, 'marks_obtained', 15, 'marks_available', 15),
      jsonb_build_object('question_number', '2', 'chapter_id', v_ch_ph_a2, 'marks_obtained', 15, 'marks_available', 15)
    )
  );
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (51, true, 'Physics Paper 5 evaluation allows both AS and A2 chapter tagging');

  -- 52. Chemistry Paper 3 (Practical) accepts AS chapter and rejects A2 chapter with P0008
  PERFORM public.log_past_paper_atomic(
    v_uid,
    jsonb_build_object(
      'subject_id', v_chem_id, 'subject_paper_id', v_sp_ch_p3, 'paper_number', 31,
      'stage', 'as', 'year', 2025, 'session', 'may_jun'
    ),
    jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_ch_as, 'marks_obtained', 20, 'marks_available', 20))
  );

  v_err := '';
  BEGIN
    PERFORM public.log_past_paper_atomic(
      v_uid,
      jsonb_build_object(
        'subject_id', v_chem_id, 'subject_paper_id', v_sp_ch_p3, 'paper_number', 31,
        'stage', 'as', 'year', 2024, 'session', 'may_jun'
      ),
      jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_ch_a2, 'marks_obtained', 20, 'marks_available', 20))
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (52, v_err = 'P0008', 'Chemistry Paper 3 practical accepts AS chapter and rejects A2 chapter with P0008');

  -- 53. Chemistry Paper 5 allows accessible AS and A2 chapters
  PERFORM public.log_past_paper_atomic(
    v_uid,
    jsonb_build_object(
      'subject_id', v_chem_id, 'subject_paper_id', v_sp_ch_p5, 'paper_number', 51,
      'stage', 'a2', 'year', 2025, 'session', 'may_jun'
    ),
    jsonb_build_array(
      jsonb_build_object('question_number', '1', 'chapter_id', v_ch_ch_as, 'marks_obtained', 15, 'marks_available', 15),
      jsonb_build_object('question_number', '2', 'chapter_id', v_ch_ch_a2, 'marks_obtained', 15, 'marks_available', 15)
    )
  );
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (53, true, 'Chemistry Paper 5 evaluation allows both AS and A2 chapter tagging');

  -- 54. Mathematics Paper 1 (Pure 1 theory) accepts Pure 1, rejects Pure 3 chapter with P0008
  PERFORM public.log_past_paper_atomic(
    v_uid,
    jsonb_build_object(
      'subject_id', v_math_id, 'subject_paper_id', v_sp_m_p1, 'paper_number', 11,
      'stage', 'as', 'year', 2025, 'session', 'feb_mar'
    ),
    jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_m_p1, 'marks_obtained', 30, 'marks_available', 30))
  );

  v_err := '';
  BEGIN
    PERFORM public.log_past_paper_atomic(
      v_uid,
      jsonb_build_object(
        'subject_id', v_math_id, 'subject_paper_id', v_sp_m_p1, 'paper_number', 11,
        'stage', 'as', 'year', 2024, 'session', 'feb_mar'
      ),
      jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_m_p3, 'marks_obtained', 30, 'marks_available', 30))
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (54, v_err = 'P0008', 'Mathematics Paper 1 theory accepts Pure 1 and rejects Pure 3 chapter with P0008');

  -- 55. Mathematics Paper 3 (Pure 3 theory) accepts Pure 3, rejects Pure 1 chapter with P0008
  PERFORM public.log_past_paper_atomic(
    v_uid,
    jsonb_build_object(
      'subject_id', v_math_id, 'subject_paper_id', v_sp_m_p3, 'paper_number', 31,
      'stage', 'a2', 'year', 2025, 'session', 'feb_mar'
    ),
    jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_m_p3, 'marks_obtained', 35, 'marks_available', 35))
  );

  v_err := '';
  BEGIN
    PERFORM public.log_past_paper_atomic(
      v_uid,
      jsonb_build_object(
        'subject_id', v_math_id, 'subject_paper_id', v_sp_m_p3, 'paper_number', 31,
        'stage', 'a2', 'year', 2024, 'session', 'feb_mar'
      ),
      jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_m_p1, 'marks_obtained', 35, 'marks_available', 35))
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (55, v_err = 'P0008', 'Mathematics Paper 3 theory accepts Pure 3 and rejects Pure 1 chapter with P0008');

  -- 56. Computer Science Paper 4 allows practical programming chapters (Topic 19 and Topic 20)
  PERFORM public.log_past_paper_atomic(
    v_uid,
    jsonb_build_object(
      'subject_id', v_cs_id, 'subject_paper_id', v_sp_cs_p4, 'paper_number', 41,
      'stage', 'a2', 'year', 2025, 'session', 'may_jun'
    ),
    jsonb_build_array(
      jsonb_build_object('question_number', '1', 'chapter_id', v_ch_cs_t19, 'marks_obtained', 25, 'marks_available', 25),
      jsonb_build_object('question_number', '2', 'chapter_id', v_ch_cs_t20, 'marks_obtained', 25, 'marks_available', 25)
    )
  );
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (56, true, 'Computer Science Paper 4 allows practical programming chapters (Topic 19 & Topic 20)');

  -- 57. Computer Science Paper 4 rejects theory chapters (Topic 1 & Topic 13) with P0008
  v_err := '';
  BEGIN
    PERFORM public.log_past_paper_atomic(
      v_uid,
      jsonb_build_object(
        'subject_id', v_cs_id, 'subject_paper_id', v_sp_cs_p4, 'paper_number', 41,
        'stage', 'a2', 'year', 2024, 'session', 'may_jun'
      ),
      jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_cs_t1, 'marks_obtained', 30, 'marks_available', 30))
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;

  IF v_err = 'P0008' THEN
    BEGIN
      PERFORM public.log_past_paper_atomic(
        v_uid,
        jsonb_build_object(
          'subject_id', v_cs_id, 'subject_paper_id', v_sp_cs_p4, 'paper_number', 41,
          'stage', 'a2', 'year', 2024, 'session', 'oct_nov'
        ),
        jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_cs_t13, 'marks_obtained', 30, 'marks_available', 30))
      );
    EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;
  END IF;

  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (57, v_err = 'P0008', 'Computer Science Paper 4 rejects theory chapters (Topic 1 & Topic 13) with P0008');

  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok(pass, test_num || '. ' || descr) FROM mvp_test_results WHERE test_num BETWEEN 50 AND 57 ORDER BY test_num;


-- ─── 9. Atomic Past-Paper Operations, Updates & Rollbacks ────────────────────

DO $$
DECLARE
  v_uid UUID := '11111111-1111-4111-a111-111111111111';
  v_math_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709');
  v_us_math UUID;
  v_sp_p1 UUID;
  v_sp_p4 UUID;
  v_sp_p3 UUID;
  v_ch_p1 UUID;
  v_ch_p4 UUID;
  v_ch_p3 UUID;
  v_pp_res JSONB;
  v_pp_id UUID;
  v_ret JSONB;
  v_orig_score_raw INT;
  v_orig_score_max INT;
  v_orig_code TEXT;
  v_orig_attempts JSONB;
  v_after_score_raw INT;
  v_after_score_max INT;
  v_after_code TEXT;
  v_after_attempts JSONB;
  v_after_count INT;
  v_err TEXT := '';
BEGIN
  SELECT id INTO v_us_math FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_math_id;
  SELECT id INTO v_sp_p1 FROM public.subject_papers WHERE subject_id = v_math_id AND paper_number = 1;
  SELECT id INTO v_sp_p4 FROM public.subject_papers WHERE subject_id = v_math_id AND paper_number = 4;
  SELECT id INTO v_sp_p3 FROM public.subject_papers WHERE subject_id = v_math_id AND paper_number = 3;

  SELECT id INTO v_ch_p1 FROM public.chapters WHERE subject_id = v_math_id AND component = 'Pure 1' AND number = 1;
  SELECT id INTO v_ch_p4 FROM public.chapters WHERE subject_id = v_math_id AND component = 'Mechanics' AND number = 1;
  SELECT id INTO v_ch_p3 FROM public.chapters WHERE subject_id = v_math_id AND component = 'Pure 3' AND number = 9;

  -- Ensure user route is configured with staged AS
  UPDATE public.user_subjects SET current_stage = 'as', a2_unlocked_at = NULL, a2_unlock_method = NULL WHERE id = v_us_math;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  -- 58. log_past_paper_atomic creates parent row and question attempts atomically
  v_pp_res := public.log_past_paper_atomic(
    v_uid,
    jsonb_build_object(
      'subject_id', v_math_id, 'subject_paper_id', v_sp_p1, 'paper_number', 12,
      'year', 2025, 'session', 'may_jun'
    ),
    jsonb_build_array(
      jsonb_build_object('question_number', '1', 'chapter_id', v_ch_p1, 'marks_obtained', 5, 'marks_available', 5),
      jsonb_build_object('question_number', '2', 'chapter_id', v_ch_p1, 'marks_obtained', 4, 'marks_available', 5)
    )
  );
  v_pp_id := (v_pp_res->>'id')::UUID;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (58,
    v_pp_id IS NOT NULL
    AND (v_pp_res->>'score_raw')::INT = 9
    AND (v_pp_res->>'score_max')::INT = 10
    AND (v_pp_res->>'stage') = 'as'
    AND (v_pp_res->>'paper_code') = '9709/12/M/J/25',
    'log_past_paper_atomic derives stage, computes scores, and generates accurate paper_code'
  );

  -- 59. update_past_paper_atomic regenerates paper_code on session/year change
  v_ret := public.update_past_paper_atomic(
    v_uid, v_pp_id,
    jsonb_build_object('session', 'oct_nov', 'year', 2024),
    jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_p1, 'marks_obtained', 5, 'marks_available', 5))
  );
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (59, (v_ret->>'paper_code') = '9709/12/O/N/24',
    'update_past_paper_atomic regenerates paper_code on session/year change');

  -- 60. update_past_paper_atomic switches to another accessible selected paper (Mechanics P4)
  v_ret := public.update_past_paper_atomic(
    v_uid, v_pp_id,
    jsonb_build_object('subject_paper_id', v_sp_p4, 'paper_number', 42, 'session', 'may_jun', 'year', 2025),
    jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_p4, 'marks_obtained', 8, 'marks_available', 10))
  );
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (60,
    (v_ret->>'paper_code') = '9709/42/M/J/25'
    AND (v_ret->>'subject_paper_id')::UUID = v_sp_p4
    AND (v_ret->>'score_raw')::INT = 8,
    'update_past_paper_atomic switches successfully to another selected accessible paper'
  );

  -- 61. update_past_paper_atomic rejects A2 paper if student is in AS, succeeds after A2 transition
  -- Reset user route to staged AS
  UPDATE public.user_subjects SET current_stage = 'as', a2_unlocked_at = NULL, a2_unlock_method = NULL WHERE id = v_us_math;

  BEGIN
    PERFORM public.update_past_paper_atomic(
      v_uid, v_pp_id,
      jsonb_build_object('subject_paper_id', v_sp_p3, 'paper_number', 32, 'session', 'may_jun', 'year', 2025),
      jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_p3, 'marks_obtained', 10, 'marks_available', 10))
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (61, v_err IN ('P0001', 'P0008'), 'update_past_paper_atomic rejects A2 paper when user is in AS stage');

  -- 62. Promote user to A2 and update again
  PERFORM public.transition_to_a2(v_uid, v_us_math, 'manual');
  v_ret := public.update_past_paper_atomic(
    v_uid, v_pp_id,
    jsonb_build_object('subject_paper_id', v_sp_p3, 'paper_number', 32, 'session', 'may_jun', 'year', 2025),
    jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_p3, 'marks_obtained', 10, 'marks_available', 10))
  );
  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (62,
    (v_ret->>'subject_paper_id')::UUID = v_sp_p3
    AND (v_ret->>'stage') = 'a2',
    'update_past_paper_atomic succeeds with A2 paper after A2 transition'
  );

  -- 63. Complete Transactional Rollback Test: verifies parent fields, question attempts, and count are unchanged
  SELECT score_raw, score_max, paper_code
  INTO v_orig_score_raw, v_orig_score_max, v_orig_code
  FROM public.past_papers WHERE id = v_pp_id;

  SELECT json_agg(json_build_object('qn', question_number, 'ch', chapter_id, 'obt', marks_obtained, 'avail', marks_available) ORDER BY question_number)
  INTO v_orig_attempts
  FROM public.paper_question_attempts WHERE paper_id = v_pp_id;

  v_err := '';
  BEGIN
    PERFORM public.update_past_paper_atomic(
      v_uid, v_pp_id,
      jsonb_build_object('notes', 'Failed Update Notes Attempt'),
      jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', v_ch_p3, 'marks_obtained', 50, 'marks_available', 10)) -- marks > max
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE; END;

  SELECT score_raw, score_max, paper_code
  INTO v_after_score_raw, v_after_score_max, v_after_code
  FROM public.past_papers WHERE id = v_pp_id;

  SELECT json_agg(json_build_object('qn', question_number, 'ch', chapter_id, 'obt', marks_obtained, 'avail', marks_available) ORDER BY question_number), COUNT(*)
  INTO v_after_attempts, v_after_count
  FROM public.paper_question_attempts WHERE paper_id = v_pp_id;

  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (63,
    v_err = 'P0002'
    AND v_after_score_raw = v_orig_score_raw
    AND v_after_score_max = v_orig_score_max
    AND v_after_code = v_orig_code
    AND v_after_attempts::text = v_orig_attempts::text
    AND v_after_count = jsonb_array_length(v_orig_attempts),
    'update_past_paper_atomic rolls back completely on validation error (parent fields & attempts unchanged)'
  );

  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok(pass, test_num || '. ' || descr) FROM mvp_test_results WHERE test_num BETWEEN 58 AND 63 ORDER BY test_num;


-- ─── 10. Mission Engine & Lifecycle (Paper-Specific) ──────────────────────────

DO $$
DECLARE
  v_uid UUID := '11111111-1111-4111-a111-111111111111';
  v_phys_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702');
  v_chem_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701');
  v_us_phys UUID;
  v_us_chem UUID;
  v_gen_m_id UUID;
  v_gen_sp_id UUID;
  v_rep_json JSONB;
  v_rep_id UUID;
  v_rep_sp_id UUID;
  v_rep_type TEXT;
  v_rep_target_id UUID;
  v_orig_stat TEXT;
  v_orig_reason TEXT;
  v_rep_stat TEXT;
  v_comp_res JSONB;
  v_sp_after_comp UUID;
  v_sp_after_undo UUID;
  v_xp_before INT;
  v_xp_after INT;
BEGIN
  -- Setup deterministic fixture for generate_daily_missions
  DELETE FROM public.daily_missions WHERE user_id = v_uid;

  -- Configure Physics 9702 as staged AS with exam_date tomorrow so Action 5 (attempt_paper) scores highest (27.0)
  SELECT id INTO v_us_phys FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_phys_id;
  UPDATE public.user_subjects
  SET study_route = 'staged', current_stage = 'as', exam_date = CURRENT_DATE + 1, priority = 3, is_archived = FALSE
  WHERE id = v_us_phys;

  -- Ensure other subjects (e.g. Chemistry) do not compete for attempt_paper during initial generation
  SELECT id INTO v_us_chem FROM public.user_subjects WHERE user_id = v_uid AND subject_id = v_chem_id;
  IF v_us_chem IS NOT NULL THEN
    UPDATE public.user_subjects SET exam_date = NULL WHERE id = v_us_chem;
  END IF;

  -- Ensure subject_paper_selections exist for Physics AS
  DELETE FROM public.subject_paper_selections WHERE user_subject_id = v_us_phys;
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_phys, sp.name, sp.paper_number, srp.stage, sp.id
  FROM public.subject_valid_routes svr
  JOIN public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE svr.subject_id = v_phys_id AND svr.route = 'staged';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  -- 64. generate_daily_missions genuinely generates attempt_paper mission with valid non-null subject_paper_id
  PERFORM public.generate_daily_missions(v_uid);

  SELECT id, subject_paper_id INTO v_gen_m_id, v_gen_sp_id
  FROM public.daily_missions
  WHERE user_id = v_uid AND type = 'attempt_paper' AND status = 'pending'
  LIMIT 1;

  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (64,
    v_gen_m_id IS NOT NULL
    AND v_gen_sp_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.subject_paper_selections WHERE user_subject_id = v_us_phys AND subject_paper_id = v_gen_sp_id),
    'generate_daily_missions deterministically produces attempt_paper mission with non-null subject_paper_id from user selections'
  );

  -- 65. complete_mission directly on generated paper mission: preserves exact non-null subject_paper_id and awards XP
  SELECT total_xp INTO v_xp_before FROM public.profiles WHERE id = v_uid;
  v_comp_res := public.complete_mission(v_gen_m_id, v_uid);
  SELECT total_xp INTO v_xp_after FROM public.profiles WHERE id = v_uid;
  SELECT subject_paper_id INTO v_sp_after_comp FROM public.daily_missions WHERE id = v_gen_m_id;

  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (65,
    v_gen_sp_id IS NOT NULL
    AND v_sp_after_comp = v_gen_sp_id
    AND v_xp_after = v_xp_before + (v_comp_res->>'total_xp_awarded')::INT,
    'complete_mission directly on generated paper mission preserves exact non-null subject_paper_id and awards correct XP delta'
  );

  -- 66. undo_mission_completion directly on same paper mission: restores exact total_xp and preserves exact non-null subject_paper_id
  PERFORM public.undo_mission_completion(v_gen_m_id, v_uid);
  SELECT total_xp INTO v_xp_after FROM public.profiles WHERE id = v_uid;
  SELECT subject_paper_id INTO v_sp_after_undo FROM public.daily_missions WHERE id = v_gen_m_id;

  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (66,
    v_xp_after = v_xp_before
    AND v_sp_after_undo = v_gen_sp_id,
    'undo_mission_completion on same paper mission restores exact profile total_xp and preserves exact non-null subject_paper_id'
  );

  -- Configure deterministic replacement fixture:
  -- Set Chemistry 9701 as staged AS with exam_date tomorrow (scores 27.0 base + 100 entity diff + 500 duration = 627.0 replacement score)
  IF v_us_chem IS NULL THEN
    INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage, exam_date, priority)
    VALUES (v_uid, v_chem_id, 'staged', 'as', CURRENT_DATE + 1, 3)
    RETURNING id INTO v_us_chem;
  ELSE
    UPDATE public.user_subjects
    SET study_route = 'staged', current_stage = 'as', exam_date = CURRENT_DATE + 1, priority = 3, is_archived = FALSE
    WHERE id = v_us_chem;
  END IF;

  DELETE FROM public.subject_paper_selections WHERE user_subject_id = v_us_chem;
  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT v_us_chem, sp.name, sp.paper_number, srp.stage, sp.id
  FROM public.subject_valid_routes svr
  JOIN public.subject_route_papers srp ON srp.route_id = svr.id
  JOIN public.subject_papers sp ON sp.id = srp.subject_paper_id
  WHERE svr.subject_id = v_chem_id AND svr.route = 'staged';

  -- Clear chapter actions for this test step so attempt_paper for Chemistry is the deterministically selected candidate
  DELETE FROM public.user_chapters WHERE user_id = v_uid;

  -- 67 & 68. replace_mission called on the Physics paper mission to produce an attempt_paper replacement for Chemistry
  v_rep_json := public.replace_mission(v_gen_m_id, v_uid, 'user_requested');
  v_rep_id := (v_rep_json->'new_mission'->>'id')::UUID;

  SELECT status, skip_reason INTO v_orig_stat, v_orig_reason FROM public.daily_missions WHERE id = v_gen_m_id;
  SELECT status, type::text, target_entity_id, subject_paper_id INTO v_rep_stat, v_rep_type, v_rep_target_id, v_rep_sp_id FROM public.daily_missions WHERE id = v_rep_id;

  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (67,
    v_rep_id IS NOT NULL
    AND v_rep_type = 'attempt_paper'
    AND v_rep_sp_id IS NOT NULL
    AND v_rep_target_id = v_chem_id
    AND EXISTS (
      SELECT 1 FROM public.subject_paper_selections sps
      WHERE sps.user_subject_id = v_us_chem AND sps.subject_paper_id = v_rep_sp_id AND sps.stage = 'as'
    )
    AND EXISTS (
      SELECT 1 FROM public.subject_papers sp
      WHERE sp.id = v_rep_sp_id AND sp.subject_id = v_chem_id
    ),
    'replace_mission deterministically generates attempt_paper replacement with valid non-null subject_paper_id matching destination subject and stage'
  );

  INSERT INTO mvp_test_results (test_num, pass, descr)
  VALUES (68,
    v_orig_stat = 'skipped' AND v_orig_reason = 'user_requested' AND v_rep_stat = 'pending',
    'replace_mission marks original as skipped with custom reason and inserts replacement as pending'
  );

  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT ok(pass, test_num || '. ' || descr) FROM mvp_test_results WHERE test_num BETWEEN 64 AND 68 ORDER BY test_num;

SELECT * FROM finish();
ROLLBACK;
