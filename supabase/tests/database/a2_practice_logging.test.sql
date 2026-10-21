-- Migration 033: A2 practice logging by AS learners and study indicator isolation.
-- Disposable local database only; all fixtures roll back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_catalog;
SET LOCAL TIME ZONE 'UTC';
SELECT plan(24);

CREATE TEMP TABLE m4_ctx (key TEXT PRIMARY KEY, id UUID, value JSONB);
GRANT SELECT, INSERT, UPDATE ON m4_ctx TO authenticated, anon;

CREATE FUNCTION pg_temp.ref(p_key TEXT) RETURNS UUID LANGUAGE sql AS $$
  SELECT id FROM pg_temp.m4_ctx WHERE key = p_key;
$$;

CREATE FUNCTION pg_temp.login(p_key TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', pg_temp.ref(p_key), 'role', 'authenticated')::TEXT, true);
  RETURN set_config('request.jwt.claim.sub', pg_temp.ref(p_key)::TEXT, true);
END;
$$;

CREATE FUNCTION pg_temp.new_user(p_key TEXT, p_code TEXT, p_route public.study_route_enum, p_combo TEXT DEFAULT NULL, p_stage TEXT DEFAULT 'as')
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_uid UUID := gen_random_uuid(); v_sid UUID; v_us UUID; v_selections JSONB;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data)
    VALUES (v_uid, v_uid::TEXT || '@m4.test', jsonb_build_object('full_name', p_key));
  UPDATE public.profiles SET timezone = 'UTC' WHERE id = v_uid;
  SELECT id INTO STRICT v_sid FROM public.subjects WHERE code = p_code;
  IF p_route = 'unconfirmed' THEN
    INSERT INTO public.user_subjects(user_id, subject_id, study_route, current_stage) VALUES (v_uid, v_sid, 'unconfirmed', NULL) RETURNING id INTO v_us;
  ELSE
    INSERT INTO public.user_subjects(user_id, subject_id, study_route, current_stage) VALUES (v_uid, v_sid, p_route, p_stage::public.subject_stage_enum) RETURNING id INTO v_us;
  END IF;
  INSERT INTO pg_temp.m4_ctx(key, id) VALUES (p_key, v_uid), (p_key || '.enrollment', v_us);
  PERFORM pg_temp.login(p_key);
  IF p_route <> 'unconfirmed' THEN
    SELECT jsonb_agg(jsonb_build_object('paper_number', sp.paper_number, 'component_name', sp.name, 'stage', rp.stage)
      ORDER BY sp.paper_number) INTO v_selections
    FROM public.subject_valid_routes vr JOIN public.subject_route_papers rp ON rp.route_id = vr.id
    JOIN public.subject_papers sp ON sp.id = rp.subject_paper_id
    WHERE vr.subject_id = v_sid AND vr.route = p_route AND (p_combo IS NULL OR vr.combination_key = p_combo);
    PERFORM public.configure_subject_route(v_uid, v_us, p_route, COALESCE(v_selections, '[]'));
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.items(p_raw INTEGER DEFAULT 10, p_max INTEGER DEFAULT 10,
  p_mode TEXT DEFAULT 'none', p_prov JSONB DEFAULT NULL, p_chapters JSONB DEFAULT '[]')
RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_array(jsonb_build_object('item_order', 1, 'marks_obtained', p_raw, 'marks_available', p_max,
    'provenance_mode', p_mode, 'chapter_ids', p_chapters) ||
    CASE WHEN p_prov IS NULL THEN '{}'::JSONB ELSE jsonb_build_object('provenance', p_prov) END);
$$;

CREATE FUNCTION pg_temp.log(p_user TEXT, p_code TEXT DEFAULT '9709', p_stage TEXT DEFAULT 'as',
  p_prov JSONB DEFAULT '{}', p_items JSONB DEFAULT pg_temp.items())
RETURNS public.practice_sessions LANGUAGE sql AS $$
  SELECT public.log_practice_session_atomic(pg_temp.ref(p_user), (SELECT id FROM public.subjects WHERE code = p_code),
    p_stage, 'A2 Test Session', CURRENT_DATE, 30::SMALLINT, p_prov, p_items);
$$;

CREATE FUNCTION pg_temp.replace(p_user TEXT, p_id UUID, p_title TEXT,
  p_prov JSONB DEFAULT '{}', p_items JSONB DEFAULT pg_temp.items())
RETURNS public.practice_sessions LANGUAGE sql AS $$
  SELECT public.update_practice_session_atomic(pg_temp.ref(p_user), p_id, p_title, CURRENT_DATE, 30::SMALLINT, p_prov, p_items);
$$;

CREATE FUNCTION pg_temp.ready(p_user TEXT, p_code TEXT DEFAULT '9709', p_stage TEXT DEFAULT 'all')
RETURNS NUMERIC LANGUAGE sql AS $$
  SELECT public.compute_readiness_score(pg_temp.ref(p_user), (SELECT id FROM public.subjects WHERE code = p_code), p_stage);
$$;

-- Setup test users
SELECT pg_temp.new_user('as_maths', '9709', 'staged', 'mech_stats', 'as');
SELECT pg_temp.new_user('as_physics', '9702', 'staged', 'standard', 'as');

-- Resolve reference chapter IDs
INSERT INTO pg_temp.m4_ctx(key, id)
  SELECT '9709.ch.pure1', id FROM public.chapters WHERE subject_id = (SELECT id FROM public.subjects WHERE code = '9709') AND component = 'Pure 1' AND number = 1 LIMIT 1;
INSERT INTO pg_temp.m4_ctx(key, id)
  SELECT '9709.ch.pure3', id FROM public.chapters WHERE subject_id = (SELECT id FROM public.subjects WHERE code = '9709') AND stage::TEXT = 'a2' LIMIT 1;
INSERT INTO pg_temp.m4_ctx(key, id)
  SELECT '9709.ch.stats2', id FROM public.chapters WHERE subject_id = (SELECT id FROM public.subjects WHERE code = '9709') AND component = 'Statistics 2' LIMIT 1;
INSERT INTO pg_temp.m4_ctx(key, id)
  SELECT '9702.ch.as', id FROM public.chapters WHERE subject_id = (SELECT id FROM public.subjects WHERE code = '9702') AND stage::TEXT = 'as' LIMIT 1;
INSERT INTO pg_temp.m4_ctx(key, id)
  SELECT '9702.ch.a2', id FROM public.chapters WHERE subject_id = (SELECT id FROM public.subjects WHERE code = '9702') AND stage::TEXT = 'a2' LIMIT 1;

-- 1. AS learner logging valid on-route A2 question practice succeeds
SELECT pg_temp.login('as_maths');
SELECT lives_ok(
  $$INSERT INTO pg_temp.m4_ctx(key, id)
    SELECT 'as_maths.a2_sess', (pg_temp.log('as_maths', '9709', 'a2', '{"paper_number": 3}', pg_temp.items(8, 10, 'inherit', NULL, jsonb_build_array(pg_temp.ref('9709.ch.pure3'))))).id$$,
  'staged AS learner can record valid A2 question practice'
);

-- 2. Recorded practice record stores stage = "a2" directly (never retagged)
SELECT is(
  (SELECT stage::TEXT FROM public.practice_sessions WHERE id = (SELECT id FROM pg_temp.m4_ctx WHERE key = 'as_maths.a2_sess')),
  'a2',
  'early practice is stored with stage=a2'
);

-- 3. AS readiness remains 0.00 while in AS
SELECT is(
  pg_temp.ready('as_maths', '9709', 'as'),
  0.00::NUMERIC,
  'early A2 practice excluded from AS readiness'
);

-- 4. Overall readiness remains 0.00 while in AS (A2 bucket is empty for AS learners)
SELECT is(
  pg_temp.ready('as_maths', '9709', 'all'),
  0.00::NUMERIC,
  'early A2 practice excluded from overall readiness while in AS'
);

-- 5. Locked A2 readiness remains 0.00 while in AS
SELECT is(
  pg_temp.ready('as_maths', '9709', 'a2'),
  0.00::NUMERIC,
  'early A2 practice excluded from locked A2 readiness while in AS'
);

-- 6. Staged AS learner logging off-route A2 component (Stats 2 when on Mechanics major) succeeds as history
SELECT lives_ok(
  $$INSERT INTO pg_temp.m4_ctx(key, id)
    SELECT 'as_maths.stats2_sess', (pg_temp.log('as_maths', '9709', 'a2', '{"paper_number": 6}', pg_temp.items(5, 10, 'inherit', NULL, jsonb_build_array(pg_temp.ref('9709.ch.stats2'))))).id$$,
  'staged AS learner can log off-route A2 Stats 2 as history'
);

-- 7. Off-route Mechanics default AS rejected when logged as A2 (P0008)
SELECT throws_ok(
  $$SELECT pg_temp.log('as_maths', '9709', 'a2', '{"paper_number": 4}', pg_temp.items(5, 10, 'inherit', NULL, jsonb_build_array(pg_temp.ref('9709.ch.pure1'))))$$,
  'P0008',
  NULL,
  'off-route Mechanics with default AS stage rejected as A2'
);

-- 8. Source-free science A2 practice rejects AS-only chapter (P0006)
SELECT pg_temp.login('as_physics');
SELECT throws_ok(
  $$SELECT pg_temp.log('as_physics', '9702', 'a2', '{}', pg_temp.items(10, 10, 'none', NULL, jsonb_build_array(pg_temp.ref('9702.ch.as'))))$$,
  'P0006',
  NULL,
  'source-free science A2 rejects AS-only chapter'
);

-- 9. Source-free science A2 practice accepts A2 chapter
SELECT lives_ok(
  $$SELECT pg_temp.log('as_physics', '9702', 'a2', '{}', pg_temp.items(10, 10, 'none', NULL, jsonb_build_array(pg_temp.ref('9702.ch.a2'))))$$,
  'source-free science A2 accepts A2 chapter'
);

-- 10. Effective science P5 A2 accepts AS foundation chapter
SELECT lives_ok(
  $$SELECT pg_temp.log('as_physics', '9702', 'a2', '{"paper_number": 5}', pg_temp.items(10, 10, 'inherit', NULL, jsonb_build_array(pg_temp.ref('9702.ch.as'))))$$,
  'effective science P5 A2 accepts AS foundation chapter'
);

-- 11. Effective science P5 A2 accepts A2 chapter
SELECT lives_ok(
  $$SELECT pg_temp.log('as_physics', '9702', 'a2', '{"paper_number": 5}', pg_temp.items(10, 10, 'inherit', NULL, jsonb_build_array(pg_temp.ref('9702.ch.a2'))))$$,
  'effective science P5 A2 accepts A2 chapter'
);

-- 12. Effective science P3 AS rejects A2 chapter (P0006)
SELECT throws_ok(
  $$SELECT pg_temp.log('as_physics', '9702', 'as', '{"paper_number": 3}', pg_temp.items(10, 10, 'inherit', NULL, jsonb_build_array(pg_temp.ref('9702.ch.a2'))))$$,
  'P0006',
  NULL,
  'effective science P3 AS rejects A2 chapter'
);

-- 13. Incompatible chapter-stage mapping rejected: A2 chapter mapped to AS paper 1 (P0006)
SELECT throws_ok(
  $$SELECT pg_temp.log('as_physics', '9702', 'as', '{"paper_number": 1}', pg_temp.items(10, 10, 'inherit', NULL, jsonb_build_array(pg_temp.ref('9702.ch.a2'))))$$,
  'P0006',
  NULL,
  'A2 chapter mapped to AS Paper 1 rejected'
);

-- 14. Staged AS learner can update early A2 practice session
SELECT pg_temp.login('as_maths');
SELECT lives_ok(
  $$SELECT pg_temp.replace('as_maths', (SELECT id FROM pg_temp.m4_ctx WHERE key = 'as_maths.a2_sess'), 'Updated A2 Session', '{"paper_number": 3}', pg_temp.items(8, 10, 'inherit', NULL, jsonb_build_array(pg_temp.ref('9709.ch.pure3'))))$$,
  'staged AS learner can update early A2 practice session'
);

-- 15. Early A2 session update persists
SELECT is(
  (SELECT title FROM public.practice_sessions WHERE id = (SELECT id FROM pg_temp.m4_ctx WHERE key = 'as_maths.a2_sess')),
  'Updated A2 Session',
  'early A2 session update persists'
);

-- 16. Other user cannot update early A2 session (access denied P0005)
SELECT pg_temp.login('as_physics');
SELECT throws_ok(
  $$SELECT pg_temp.replace('as_physics', (SELECT id FROM pg_temp.m4_ctx WHERE key = 'as_maths.a2_sess'), 'Hacked Session', '{"paper_number": 3}', pg_temp.items(8, 10, 'inherit', NULL, jsonb_build_array(pg_temp.ref('9709.ch.pure3'))))$$,
  'P0005',
  NULL,
  'other user cannot update early A2 session'
);
SELECT pg_temp.login('as_maths');

-- 17. Invalid update (marks_obtained > marks_available) rejected
SELECT throws_ok(
  $$SELECT pg_temp.replace('as_maths', (SELECT id FROM pg_temp.m4_ctx WHERE key = 'as_maths.a2_sess'), 'Invalid Attempt', '{"paper_number": 3}', pg_temp.items(15, 10, 'inherit', NULL, jsonb_build_array(pg_temp.ref('9709.ch.pure3'))))$$,
  'P0003',
  NULL,
  'invalid update (marks_obtained > marks_available) rejected'
);

-- 18. Early A2 session unchanged after rolled-back update attempt
SELECT is(
  (SELECT title FROM public.practice_sessions WHERE id = (SELECT id FROM pg_temp.m4_ctx WHERE key = 'as_maths.a2_sess')),
  'Updated A2 Session',
  'early A2 session unchanged after rolled-back update attempt'
);

-- 19. On-route early A2 practice activates for A2 readiness after unlock
UPDATE public.user_subjects
  SET current_stage = 'a2', a2_unlocked_at = now(), a2_unlock_method = 'manual'
  WHERE id = pg_temp.ref('as_maths.enrollment');
SELECT pg_temp.login('as_maths');
SELECT cmp_ok(
  pg_temp.ready('as_maths', '9709', 'a2'),
  '>',
  0.00::NUMERIC,
  'on-route early A2 practice activates for A2 readiness after unlock'
);

-- 20. Off-route Stats 2 paper is not in selected route papers
SELECT is(
  EXISTS (
    SELECT 1 FROM public.subject_paper_selections sel
    WHERE sel.user_subject_id = pg_temp.ref('as_maths.enrollment')
      AND sel.subject_paper_id = (SELECT subject_paper_id FROM public.practice_sessions WHERE id = (SELECT id FROM pg_temp.m4_ctx WHERE key = 'as_maths.stats2_sess'))
  ),
  FALSE,
  'off-route Stats 2 paper is not in selected route papers'
);

-- 21. Exact A2 readiness score excludes off-route Stats 2 and reflects on-route Pure 3 only
-- Pure 3: 8 / 10 marks = 80% accuracy. Weight is 40%, notes/conf = 0 -> exact readiness = 32.00
-- If Stats 2 were included: (8 + 5) / (10 + 10) = 65% -> readiness would be 26.00
SELECT is(
  pg_temp.ready('as_maths', '9709', 'a2'),
  32.00::NUMERIC,
  'exact A2 readiness score excludes off-route Stats 2 (pure 3 only = 32.00)'
);

-- 22. Configuration assertion: m4_logging_stage_open search_path is pinned to pg_catalog
SELECT is(
  (SELECT proconfig FROM pg_catalog.pg_proc WHERE proname = 'm4_logging_stage_open' LIMIT 1),
  ARRAY['search_path=pg_catalog'],
  'm4_logging_stage_open search_path is pinned to pg_catalog'
);

-- 23. Configuration assertion: log_practice_session_atomic is SECURITY DEFINER with search_path=pg_catalog
SELECT ok(
  (SELECT prosecdef AND 'search_path=pg_catalog' = ANY(proconfig)
   FROM pg_catalog.pg_proc WHERE proname = 'log_practice_session_atomic' LIMIT 1),
  'log_practice_session_atomic is SECURITY DEFINER with search_path=pg_catalog'
);

-- 24. Permission assertion: direct execute revoked on private m4_logging helpers from client roles
SELECT ok(
  NOT has_function_privilege('anon', 'public.m4_logging_stage_open(public.user_subjects, text)', 'execute')
  AND NOT has_function_privilege('authenticated', 'public.m4_logging_stage_open(public.user_subjects, text)', 'execute')
  AND NOT has_function_privilege('anon', 'public.m4_logging_chapter_eligible(public.user_subjects, text, uuid, uuid)', 'execute')
  AND NOT has_function_privilege('authenticated', 'public.m4_logging_chapter_eligible(public.user_subjects, text, uuid, uuid)', 'execute'),
  'direct execute revoked from client roles on private m4_logging helpers'
);

ROLLBACK;
