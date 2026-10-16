-- Migration 031 database contract. Disposable local database only; all fixtures
-- roll back. Each scenario uses fresh users rather than accumulated evidence.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_catalog;
SET LOCAL TIME ZONE 'UTC';
-- 201 explicit, single-row pgTAP assertions; setup/fixture SELECTs are not tests.
SELECT plan(201);

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
CREATE FUNCTION pg_temp.new_user(p_key TEXT, p_code TEXT, p_route public.study_route_enum, p_combo TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_uid UUID := gen_random_uuid(); v_sid UUID; v_us UUID; v_selections JSONB;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data)
    VALUES (v_uid, v_uid::TEXT || '@m4.test', jsonb_build_object('full_name', p_key));
  -- handle_new_user owns creation; update its rows instead of duplicate inserts.
  UPDATE public.profiles SET timezone = 'UTC' WHERE id = v_uid;
  SELECT id INTO STRICT v_sid FROM public.subjects WHERE code = p_code;
  INSERT INTO public.user_subjects(user_id, subject_id) VALUES (v_uid, v_sid) RETURNING id INTO v_us;
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
    p_stage, 'Test', CURRENT_DATE, 30::SMALLINT, p_prov, p_items);
$$;
CREATE FUNCTION pg_temp.replace(p_user TEXT, p_id UUID, p_prov JSONB DEFAULT '{}', p_items JSONB DEFAULT pg_temp.items())
RETURNS public.practice_sessions LANGUAGE sql AS $$
  SELECT public.update_practice_session_atomic(pg_temp.ref(p_user), p_id, 'Updated', CURRENT_DATE, 30::SMALLINT, p_prov, p_items);
$$;
CREATE FUNCTION pg_temp.ready(p_user TEXT, p_code TEXT DEFAULT '9709', p_stage TEXT DEFAULT 'as')
RETURNS NUMERIC LANGUAGE sql AS $$
  SELECT public.compute_readiness_score(pg_temp.ref(p_user), (SELECT id FROM public.subjects WHERE code = p_code), p_stage);
$$;
CREATE FUNCTION pg_temp.paper(p_user TEXT, p_code TEXT DEFAULT '9709', p_base INTEGER DEFAULT 1,
  p_stage TEXT DEFAULT 'as', p_raw INTEGER DEFAULT 60, p_max INTEGER DEFAULT 75)
RETURNS UUID LANGUAGE sql AS $$
  SELECT (public.log_past_paper_atomic(pg_temp.ref(p_user),
    jsonb_build_object('subject_id', (SELECT id FROM public.subjects WHERE code = p_code),
      'subject_paper_id', (SELECT sp.id FROM public.subject_papers sp JOIN public.subjects s ON s.id = sp.subject_id
                          WHERE s.code = p_code AND sp.paper_number = p_base),
      'paper_number', p_base * 10 + 2, 'stage', p_stage, 'year', 2024,
      'session', 'may_jun', 'attempted_at', CURRENT_DATE -
        (SELECT count(*)::INTEGER FROM public.past_papers WHERE user_id=pg_temp.ref(p_user))),
    jsonb_build_array(jsonb_build_object('question_number', '1', 'chapter_id', NULL,
      'marks_obtained', p_raw, 'marks_available', p_max))) ->> 'id')::UUID;
$$;
CREATE FUNCTION pg_temp.graph(p_id UUID) RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object('parent', (SELECT to_jsonb(p) FROM public.practice_sessions p WHERE p.id = p_id),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.practice_session_items i WHERE i.session_id = p_id), '[]'),
    'chapters', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.item_id, c.chapter_id)
       FROM public.practice_session_chapters c JOIN public.practice_session_items i ON i.id = c.item_id WHERE i.session_id = p_id), '[]'));
$$;
CREATE FUNCTION pg_temp.side_effects(p_user TEXT) RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object('xp', (SELECT total_xp FROM public.profiles WHERE id = pg_temp.ref(p_user)),
    'streak', (SELECT to_jsonb(s) FROM public.streaks s WHERE user_id = pg_temp.ref(p_user)),
    'events', (SELECT count(*) FROM public.xp_events WHERE user_id = pg_temp.ref(p_user)),
    'achievements', (SELECT count(*) FROM public.user_achievements WHERE user_id = pg_temp.ref(p_user)),
    'notifications', (SELECT count(*) FROM public.notifications WHERE user_id = pg_temp.ref(p_user)));
$$;
CREATE FUNCTION pg_temp.paper_baseline(p_user TEXT) RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object('rows', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.past_papers p
    WHERE p.user_id = pg_temp.ref(p_user)), '[]'), 'count', count(*), 'best', max(accuracy_pct),
    'weighted', sum(score_raw::BIGINT)::NUMERIC / NULLIF(sum(score_max::BIGINT), 0))
  FROM public.past_papers WHERE user_id = pg_temp.ref(p_user);
$$;
CREATE FUNCTION pg_temp.threshold_baseline() RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_array(
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::TEXT,'')) FROM public.grade_threshold_publications t),
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::TEXT,'')) FROM public.grade_threshold_component_variants t),
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::TEXT,'')) FROM public.grade_threshold_component_marks t),
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::TEXT,'')) FROM public.grade_threshold_combinations t),
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::TEXT,'')) FROM public.grade_threshold_combination_marks t),
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::TEXT,'')) FROM public.grade_threshold_combination_tokens t));
$$;

SELECT pg_temp.new_user('owner', '9709', 'full_level', 'full_mech_stats');
SELECT pg_temp.new_user('other', '9709', 'as_only', 'p1_m1');
SELECT pg_temp.new_user('locked', '9709', 'staged', 'mech_stats');
SELECT pg_temp.new_user('unconfirmed', '9709', 'unconfirmed');
SELECT pg_temp.new_user('physics', '9702', 'full_level');
SELECT pg_temp.new_user('chemistry', '9701', 'full_level');
INSERT INTO m4_ctx(key, id)
SELECT s.code || '.p' || sp.paper_number, sp.id FROM public.subject_papers sp JOIN public.subjects s ON s.id = sp.subject_id;
INSERT INTO m4_ctx(key, id)
SELECT DISTINCT ON (s.code, c.stage) s.code || '.chapter.' || c.stage::TEXT, c.id
FROM public.chapters c JOIN public.subjects s ON s.id = c.subject_id WHERE c.is_active
ORDER BY s.code, c.stage, c.number, c.id;
INSERT INTO m4_ctx(key, id)
SELECT 'math.mechanics', c.id FROM public.chapters c WHERE c.is_active AND c.component = 'Mechanics'
  AND c.subject_id = (SELECT id FROM public.subjects WHERE code = '9709') ORDER BY c.number LIMIT 1;
WITH fixture AS (
  INSERT INTO chapters(subject_id,number,title,stage,is_active)
  SELECT id,999,'M4 inactive fixture','as',FALSE FROM subjects WHERE code='9709' RETURNING id
) INSERT INTO m4_ctx(key,id) SELECT 'inactive',id FROM fixture;
WITH fixture AS (
  INSERT INTO chapters(subject_id,number,title,component,stage,is_active)
  SELECT id,998,'M4 component fallback fixture','Mechanics','route_dependent',TRUE FROM subjects WHERE code='9709' RETURNING id
) INSERT INTO m4_ctx(key,id) SELECT 'fallback',id FROM fixture;

-- Schema/permissions: test effective privileges, including inherited grants.
SELECT has_table('public', 'practice_sessions', 'session relation exists');
SELECT has_table('public', 'practice_session_items', 'item relation exists');
SELECT has_table('public', 'practice_session_chapters', 'junction relation exists');
SELECT ok((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN
  ('public.practice_sessions'::regclass, 'public.practice_session_items'::regclass, 'public.practice_session_chapters'::regclass)), 'all practice relations enable RLS');
SELECT ok((SELECT bool_and(NOT has_table_privilege(role_name, relation_name, priv)) FROM
  (VALUES ('anon'), ('authenticated')) r(role_name) CROSS JOIN
  (VALUES ('public.practice_sessions'), ('public.practice_session_items'), ('public.practice_session_chapters')) t(relation_name)
  CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) p(priv)),
  'all client writes/dangerous privileges denied on every relation');
SELECT ok((SELECT bool_and(has_table_privilege('authenticated', relation_name, 'SELECT')) FROM
  (VALUES ('public.practice_sessions'), ('public.practice_session_items'), ('public.practice_session_chapters')) t(relation_name)), 'authenticated SELECT preserved');
SELECT ok((SELECT bool_and(NOT has_table_privilege('anon', relation_name, 'SELECT')) FROM
  (VALUES ('public.practice_sessions'), ('public.practice_session_items'), ('public.practice_session_chapters')) t(relation_name)), 'anonymous SELECT denied');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
  WHERE n.nspname = 'public' AND c.relname LIKE 'practice_%' AND a.grantee = 0), 'PUBLIC has no relation ACL');
SELECT ok((SELECT bool_and(NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
                           AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                           AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
    AND (p.proname LIKE 'm4_%' OR p.proname = 'resolve_practice_payload')), 'all private helpers deny client/service execution');
SELECT ok((SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('log_practice_session_atomic','update_practice_session_atomic','delete_practice_session')), 'public CRUD grants are explicit');
SELECT ok((SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=pg_catalog'])
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
    AND p.proname IN ('log_practice_session_atomic','update_practice_session_atomic','delete_practice_session','compute_readiness_score')), 'public RPCs pin their search paths');
SELECT ok(NOT has_table_privilege('authenticated', 'public.subject_paper_selections', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.user_subjects', 'UPDATE'), '029 boundary remains intact');

SET LOCAL ROLE authenticated;
SELECT pg_temp.login('owner');
SELECT lives_ok($$SELECT pg_temp.log('owner')$$, 'topical session with omitted provenance/label is valid');
INSERT INTO m4_ctx(key, id) SELECT 'owned', id FROM public.practice_sessions WHERE user_id = pg_temp.ref('owner');
SELECT is((SELECT question_label FROM public.practice_session_items WHERE session_id = pg_temp.ref('owned')), NULL::TEXT, 'omitted question number is not fabricated');
SELECT is((SELECT accuracy_pct FROM public.practice_sessions WHERE id = pg_temp.ref('owned')), 100.00::NUMERIC, 'stored session accuracy is derived from marks');
SELECT is((SELECT count(*) FROM public.practice_session_items WHERE session_id = pg_temp.ref('owned')), 1::BIGINT, 'owner reads their child item');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{"paper_number":4}',
  pg_temp.items(3,10,'inherit',NULL,jsonb_build_array(pg_temp.ref('math.mechanics'))))$$, 'owned junction fixture has an actual mapped item');
SELECT is((SELECT count(*) FROM public.practice_session_chapters), 1::BIGINT, 'owner reads actual junction before foreign-read test');
SELECT throws_ok($$INSERT INTO public.practice_sessions DEFAULT VALUES$$, '42501', NULL, 'direct parent insert denied');
SELECT throws_ok($$UPDATE public.practice_sessions SET title='tamper'$$, '42501', NULL, 'direct parent update denied');
SELECT throws_ok($$DELETE FROM public.practice_sessions$$, '42501', NULL, 'direct parent delete denied');
SELECT throws_ok($$INSERT INTO public.practice_session_items DEFAULT VALUES$$, '42501', NULL, 'direct item insert denied');
SELECT throws_ok($$UPDATE public.practice_session_items SET question_label='tamper'$$, '42501', NULL, 'direct item update denied');
SELECT throws_ok($$DELETE FROM public.practice_session_items$$, '42501', NULL, 'direct item delete denied');
SELECT throws_ok($$INSERT INTO public.practice_session_chapters DEFAULT VALUES$$, '42501', NULL, 'direct junction insert denied');
SELECT throws_ok($$UPDATE public.practice_session_chapters SET chapter_id=gen_random_uuid()$$, '42501', NULL, 'direct junction update denied');
SELECT throws_ok($$DELETE FROM public.practice_session_chapters$$, '42501', NULL, 'direct junction delete denied');
SELECT throws_ok($$TRUNCATE public.practice_sessions CASCADE$$, '42501', NULL, 'TRUNCATE cannot bypass RLS');
SELECT throws_ok($$SELECT public.m4_write_items(pg_temp.ref('owned'), '[]')$$, '42501', NULL, 'private plumbing cannot bypass validation');
SELECT throws_ok($$SELECT public.resolve_practice_payload(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)$$, '42501', NULL, 'private resolver execution denied');
SELECT pg_temp.login('other');
SELECT is((SELECT count(*) FROM public.practice_sessions), 0::BIGINT, 'other user cannot read parent');
SELECT is((SELECT count(*) FROM public.practice_session_items), 0::BIGINT, 'other user cannot read child');
SELECT is((SELECT count(*) FROM public.practice_session_chapters), 0::BIGINT, 'other user cannot read junction');
SELECT throws_ok($$SELECT pg_temp.log('owner')$$, '42501', NULL, 'spoofed create denied');
SELECT throws_ok($$SELECT pg_temp.replace('other', pg_temp.ref('owned'))$$, 'P0005', NULL, 'foreign update denied without disclosure');
SELECT is(public.delete_practice_session(pg_temp.ref('other'), pg_temp.ref('owned')), FALSE, 'foreign delete returns false');
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok($$SELECT pg_temp.log('owner')$$, '42501', NULL, 'missing JWT subject denied');
SELECT throws_ok($$SELECT public.delete_practice_session(NULL,NULL)$$, '42501', NULL, 'NULL user cannot satisfy ownership');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.log_practice_session_atomic(NULL,NULL,'as',NULL,CURRENT_DATE,NULL)$$, '42501', NULL, 'anon CRUD execution denied');
SELECT throws_ok($$SELECT public.update_practice_session_atomic(NULL,NULL,NULL,CURRENT_DATE,NULL)$$, '42501', NULL, 'anon update execution denied');
SELECT throws_ok($$SELECT public.delete_practice_session(NULL,NULL)$$, '42501', NULL, 'anon delete execution denied');
SELECT throws_ok($$SELECT public.compute_readiness_score(NULL,NULL,'all')$$, '42501', NULL, 'anon readiness execution denied');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('owner');
SELECT is((SELECT count(*) FROM public.practice_sessions WHERE id=pg_temp.ref('owned')), 1::BIGINT, 'denied mutations preserved owned parent');

-- Input edge cases use the same validator on both mutation paths.
SELECT throws_ok($$SELECT pg_temp.log('owner','9709',NULL)$$, 'P0002', NULL, 'NULL stage rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','all')$$, 'P0002', NULL, 'aggregate stage is not a logging stage');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',NULL)$$, 'P0007', NULL, 'SQL NULL items rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}','null')$$, 'P0007', NULL, 'JSON null items rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}','{}')$$, 'P0007', NULL, 'scalar/object items rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}','[]')$$, 'P0003', NULL, 'empty items rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}','[null]')$$, 'P0007', NULL, 'null item rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}','[{"item_order":1,"marks_obtained":0,"marks_available":1,"provenance_mode":"none","surprise":1}]')$$, 'P0007', NULL, 'unknown item fields rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(-1,10))$$, 'P0003', NULL, 'negative marks rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(11,10))$$, 'P0003', NULL, 'obtained above available rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(0,0))$$, 'P0003', NULL, 'zero available rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(1,1001))$$, 'P0003', NULL, 'per-item maximum enforced');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}','[{"item_order":1,"marks_obtained":0.5,"marks_available":1,"provenance_mode":"none"}]')$$, 'P0003', NULL, 'fractional marks rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}','[{"item_order":2,"marks_obtained":0,"marks_available":1,"provenance_mode":"none"}]')$$, 'P0003', NULL, 'orders start at one');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}','[{"item_order":1,"marks_obtained":"1","marks_available":1,"provenance_mode":"none"}]')$$, 'P0003', NULL, 'numeric strings rejected');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(0,1))$$, 'zero of one is valid');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{}',
  (SELECT jsonb_agg(jsonb_build_object('item_order',n,'marks_obtained',0,'marks_available',1000,'provenance_mode','none')) FROM generate_series(1,10) n))$$, 'aggregate 10000 boundary is valid');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',
  (SELECT jsonb_agg(jsonb_build_object('item_order',n,'marks_obtained',0,'marks_available',1000,'provenance_mode','none')) FROM generate_series(1,11) n))$$,
  'P0003', 'Session total marks cannot exceed 10000', 'aggregate overflow reaches the aggregate validator');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',
  (SELECT jsonb_agg(jsonb_build_object('item_order',n,'marks_obtained',0,'marks_available',1,'provenance_mode','none')) FROM generate_series(1,201) n))$$,
  'P0003', NULL, '201 items rejected before writing');
SELECT throws_ok($$SELECT public.log_practice_session_atomic(pg_temp.ref('owner'),(SELECT id FROM subjects WHERE code='9709'),'as',NULL,NULL,NULL,'{}',pg_temp.items())$$, 'P0003', NULL, 'date is required');
SELECT throws_ok($$SELECT public.log_practice_session_atomic(pg_temp.ref('owner'),(SELECT id FROM subjects WHERE code='9709'),'as',NULL,CURRENT_DATE+1,NULL,'{}',pg_temp.items())$$, 'P0003', NULL, 'future local date rejected');
SELECT throws_ok($$SELECT public.log_practice_session_atomic(pg_temp.ref('owner'),(SELECT id FROM subjects WHERE code='9709'),'as',NULL,'1989-12-31',NULL,'{}',pg_temp.items())$$, 'P0003', NULL, 'date lower bound enforced');
SELECT throws_ok($$SELECT public.log_practice_session_atomic(pg_temp.ref('owner'),(SELECT id FROM subjects WHERE code='9709'),'as',repeat('x',101),CURRENT_DATE,NULL,'{}',pg_temp.items())$$, 'P0003', NULL, 'title bound enforced');
SELECT throws_ok($$SELECT public.log_practice_session_atomic(pg_temp.ref('owner'),(SELECT id FROM subjects WHERE code='9709'),'as',NULL,CURRENT_DATE,0::SMALLINT,'{}',pg_temp.items())$$, 'P0003', NULL, 'zero duration rejected');
SELECT throws_ok($$SELECT public.log_practice_session_atomic(pg_temp.ref('owner'),(SELECT id FROM subjects WHERE code='9709'),'as',NULL,CURRENT_DATE,1441::SMALLINT,'{}',pg_temp.items())$$, 'P0003', NULL, 'duration upper bound enforced');
SELECT throws_ok($$SELECT public.log_practice_session_atomic(pg_temp.ref('owner'),(SELECT id FROM subjects WHERE code='9709'),'as',NULL,CURRENT_DATE,NULL,'{}',pg_temp.items(),repeat('x',2001))$$, 'P0003', NULL, 'session notes bound enforced');
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{}',pg_temp.items(11,10))$$, 'P0003', NULL, 'update shares score validation');
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{}',NULL)$$, 'P0007', NULL, 'update shares NULL-array validation');
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{"paper_number":5}')$$, 'P0008', NULL, 'update shares selected-paper recorded-stage validation');
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{}',
  pg_temp.items(3,10,'none',NULL,jsonb_build_array(pg_temp.ref('9702.chapter.as'))))$$, 'P0006', NULL, 'update shares chapter ownership/stage validation');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{}',
  (SELECT jsonb_agg(jsonb_build_object('item_order',n,'marks_obtained',0,'marks_available',1,'provenance_mode','none')) FROM generate_series(1,200) n))$$,
  '200 valid ordered items allowed');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',
  jsonb_build_array(jsonb_build_object('item_order',1,'marks_obtained',1,'marks_available',1,'provenance_mode','none','question_label',repeat('x',51))))$$,
  'P0003', NULL, 'question label length enforced');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',
  jsonb_build_array(jsonb_build_object('item_order',1,'marks_obtained',1,'marks_available',1,'provenance_mode','none','notes',repeat('x',1001))))$$,
  'P0003', NULL, 'item notes length enforced');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,'none',NULL,'null'))$$, 'P0007', NULL, 'explicit-null mapping array rejected');

-- Provenance resolver: bundles never fall back field by field.
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{"source_label":"Worksheet"}',pg_temp.items(3,10,'inherit'))$$, 'source-only parent inheritance');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{"exam_year":2024}',pg_temp.items(3,10,'inherit'))$$, 'year-only parent inheritance');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{"paper_number":1}',pg_temp.items(3,10,'inherit'))$$, 'paper-number-only resolves canonical identity');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,'inherit'))$$, 'P0002', NULL, 'inherit cannot fabricate missing parent');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{"paper_number":1}',pg_temp.items(3,10,'inherit','null'))$$, 'P0002', NULL, 'inherit rejects even explicit-null child bundle');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,'override','{}'))$$, 'P0002', NULL, 'empty override rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,'none','{"exam_year":null}'))$$, 'P0002', NULL, 'none rejects examination keys including null');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,'none','{"source_label":"Topical"}'))$$, 'none accepts independent source label');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{"exam_year":2024}',pg_temp.items(3,10,'override','{"exam_year":2025}'))$$, 'year-only override supported');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,NULL))$$, 'P0002', NULL, 'mode is mandatory');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','null')$$, 'P0007', NULL, 'JSON-null parent bundle rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{"unexpected":1}')$$, 'P0007', NULL, 'unknown provenance key rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{"exam_year":2101}')$$, 'P0003', NULL, 'year bound validated');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{"paper_number":1.5}')$$, 'P0003', NULL, 'fractional provenance rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{"exam_variant":0}')$$, 'P0003', NULL, 'variant bound validated');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{"exam_series":"summer"}')$$, 'P0008', NULL, 'invalid series has controlled error');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{"subject_paper_id":"broken"}')$$, 'P0008', NULL, 'invalid paper UUID has controlled error');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as',jsonb_build_object('source_label',repeat('x',121)))$$, 'P0003', NULL, 'source bound validated');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as',jsonb_build_object('subject_paper_id',pg_temp.ref('9702.p1')))$$, 'P0008', NULL, 'cross-subject paper rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as',jsonb_build_object('subject_paper_id',pg_temp.ref('9709.p1'),'paper_number',4))$$, 'P0008', NULL, 'paper ID/number disagreement rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{"paper_number":5}')$$, 'P0008', NULL, 'selected A2 stage overrides default AS');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','a2','{"paper_number":5}',pg_temp.items(3,10,'inherit'))$$, 'selected A2 paper valid despite AS default');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{"paper_number":2}',pg_temp.items(3,10,'inherit'))$$, 'genuinely off-route fixed-AS practice retained');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{"paper_number":6}')$$, 'P0008', NULL, 'off-route fixed-A2 stage mismatch rejected');
RESET ROLE;
SELECT pg_temp.new_user('off-dependent','9709','full_level','full_stats_double');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('off-dependent');
SELECT lives_ok($$SELECT pg_temp.log('off-dependent','9709','as','{"paper_number":4}',pg_temp.items(3,10,'inherit'))$$, 'off-route route-dependent default AS accepted');
SELECT throws_ok($$SELECT pg_temp.log('off-dependent','9709','a2','{"paper_number":4}')$$, 'P0008', NULL, 'off-route route-dependent A2 rejected against default');

SELECT pg_temp.login('locked');
SELECT throws_ok($$SELECT pg_temp.log('locked','9709','a2')$$, 'P0005', NULL, 'locked A2 create denied');
SELECT pg_temp.login('unconfirmed');
SELECT throws_ok($$SELECT pg_temp.log('unconfirmed')$$, 'P0005', NULL, 'unconfirmed enrollment denied');
SELECT throws_ok($$SELECT pg_temp.log('unconfirmed','9702')$$, 'P0005', NULL, 'missing enrollment denied separately');
RESET ROLE;
SELECT pg_temp.new_user('archived','9709','as_only','p1_m1');
INSERT INTO m4_ctx(key,id) SELECT 'archived.session',(pg_temp.log('archived')).id;
UPDATE public.user_subjects SET is_archived=TRUE WHERE id=pg_temp.ref('archived.enrollment');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('archived');
SELECT throws_ok($$SELECT pg_temp.log('archived')$$, 'P0005', NULL, 'archived enrollment denied');
SELECT throws_ok($$SELECT pg_temp.replace('archived',pg_temp.ref('archived.session'))$$, 'P0005', NULL, 'archived replacement rejected by shared resolver');
SELECT is((SELECT count(*) FROM practice_sessions WHERE id=pg_temp.ref('archived.session')), 1::BIGINT, 'archived practice history remains readable');
SELECT is(public.delete_practice_session(pg_temp.ref('archived'),pg_temp.ref('archived.session')), TRUE, 'owner may delete archived history');

-- Chapter and practical cases have correct, confirmed enrollments.
SELECT pg_temp.login('owner');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,'none',NULL,jsonb_build_array(pg_temp.ref('9702.chapter.as'))))$$, 'P0006', NULL, 'cross-subject chapter rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,'none',NULL,jsonb_build_array(pg_temp.ref('9709.chapter.a2'))))$$, 'P0006', NULL, 'A2 chapter rejected in AS');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','a2','{}',pg_temp.items(3,10,'none',NULL,jsonb_build_array(pg_temp.ref('9709.chapter.as'))))$$, 'P0006', NULL, 'ordinary A2 topical item rejects AS chapter');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,'none',NULL,'[null]'))$$, 'P0006', NULL, 'null chapter UUID rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,'none',NULL,'["broken"]'))$$, 'P0006', NULL, 'malformed chapter UUID rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,'none',NULL,'{}'))$$, 'P0007', NULL, 'chapter mapping shape enforced');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,'none',NULL,jsonb_build_array(pg_temp.ref('inactive'))))$$, 'P0006', NULL, 'inactive chapter rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{"paper_number":1}',pg_temp.items(3,10,'inherit',NULL,jsonb_build_array(pg_temp.ref('math.mechanics'))))$$, 'P0006', NULL, 'ordinary paper chapter mapping enforced');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,'none',NULL,jsonb_build_array(pg_temp.ref('math.mechanics'),pg_temp.ref('math.mechanics'))))$$, 'P0006', NULL, 'duplicate mappings rejected');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{"paper_number":4}',pg_temp.items(3,10,'inherit',NULL,jsonb_build_array(pg_temp.ref('math.mechanics'))))$$, 'route-dependent mapping evaluated at AS');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10,'none',NULL,jsonb_build_array(pg_temp.ref('fallback'))))$$, 'component-name fallback admits chapter without chapter_papers row');
SELECT pg_temp.login('physics');
SELECT lives_ok($$SELECT pg_temp.log('physics','9702','as','{"paper_number":3}',pg_temp.items(3,10,'inherit',NULL,jsonb_build_array(pg_temp.ref('9702.chapter.as'))))$$, 'Physics P3 AS mapping valid');
SELECT throws_ok($$SELECT pg_temp.log('physics','9702','as','{"paper_number":3}',pg_temp.items(3,10,'inherit',NULL,jsonb_build_array(pg_temp.ref('9702.chapter.a2'))))$$, 'P0006', NULL, 'Physics P3 A2 chapter denied');
SELECT lives_ok($$SELECT pg_temp.log('physics','9702','a2','{"paper_number":5}',pg_temp.items(3,10,'inherit',NULL,jsonb_build_array(pg_temp.ref('9702.chapter.as'))))$$, 'Physics P5 accessible AS foundation exception');
SELECT lives_ok($$SELECT pg_temp.log('physics','9702','a2','{"paper_number":5}',pg_temp.items(3,10,'inherit',NULL,jsonb_build_array(pg_temp.ref('9702.chapter.a2'))))$$, 'Physics P5 A2 mapping valid');
SELECT pg_temp.login('chemistry');
SELECT lives_ok($$SELECT pg_temp.log('chemistry','9701','as','{"paper_number":3}',pg_temp.items(3,10,'inherit',NULL,jsonb_build_array(pg_temp.ref('9701.chapter.as'))))$$, 'Chemistry P3 AS mapping valid');
SELECT lives_ok($$SELECT pg_temp.log('chemistry','9701','a2','{"paper_number":5}',pg_temp.items(3,10,'inherit',NULL,jsonb_build_array(pg_temp.ref('9701.chapter.as'))))$$, 'Chemistry P5 accessible AS foundation exception');
SELECT lives_ok($$SELECT pg_temp.log('chemistry','9701','a2','{"paper_number":5}',pg_temp.items(3,10,'inherit',NULL,jsonb_build_array(pg_temp.ref('9701.chapter.a2'))))$$, 'Chemistry P5 A2 mapping valid');

-- Full replacement, provenance clearing, and real graph rollback.
SELECT pg_temp.login('owner');
INSERT INTO m4_ctx(key,id) SELECT 'replace', (pg_temp.log('owner','9709','as','{"paper_number":4,"exam_year":2024}',
  pg_temp.items(4,10,'inherit',NULL,jsonb_build_array(pg_temp.ref('math.mechanics'))))).id;
INSERT INTO m4_ctx(key,value) VALUES ('replace.before',pg_temp.graph(pg_temp.ref('replace')));
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('replace'),'{}',pg_temp.items(4,10) ||
  jsonb_build_array(jsonb_build_object('item_order',2,'marks_obtained',11,'marks_available',10,'provenance_mode','none')))$$,
  'P0003', NULL, 'late replacement failure has controlled error');
SELECT is(pg_temp.graph(pg_temp.ref('replace')), (SELECT value FROM m4_ctx WHERE key='replace.before'), 'failed update preserves entire graph');
INSERT INTO m4_ctx(key,value) VALUES ('create.counts',jsonb_build_array((SELECT count(*) FROM practice_sessions),(SELECT count(*) FROM practice_session_items),(SELECT count(*) FROM practice_session_chapters)));
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(4,10) ||
  jsonb_build_array(jsonb_build_object('item_order',2,'marks_obtained',11,'marks_available',10,'provenance_mode','none')))$$,
  'P0003', NULL, 'late create failure has controlled error');
SELECT is(jsonb_build_array((SELECT count(*) FROM practice_sessions),(SELECT count(*) FROM practice_session_items),(SELECT count(*) FROM practice_session_chapters)),
  (SELECT value FROM m4_ctx WHERE key='create.counts'), 'failed create leaves no parent/child/junction');
SELECT lives_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('replace'),'{"paper_number":4,"exam_year":2025}',
  pg_temp.items(3,10,'inherit') || jsonb_build_array(jsonb_build_object('item_order',2,'marks_obtained',6,'marks_available',20,
    'provenance_mode','override','provenance',jsonb_build_object('source_label','Independent','exam_year',NULL))))$$,
  'replacement re-resolves inherited and independent bundles');
SELECT is((SELECT total_score_raw FROM practice_sessions WHERE id=pg_temp.ref('replace')), 9, 'replacement parent raw recomputed');
SELECT is((SELECT total_score_max FROM practice_sessions WHERE id=pg_temp.ref('replace')), 30, 'replacement parent maximum recomputed');
SELECT is((SELECT exam_year FROM practice_session_items WHERE session_id=pg_temp.ref('replace') AND item_order=1), 2025::SMALLINT, 'inherit follows changed parent');
SELECT is((SELECT subject_paper_id FROM practice_session_items WHERE session_id=pg_temp.ref('replace') AND item_order=2), NULL::UUID, 'override clears parent component');
SELECT is((SELECT exam_year FROM practice_session_items WHERE session_id=pg_temp.ref('replace') AND item_order=2), NULL::SMALLINT, 'explicit override null clears parent year');
SELECT is((SELECT count(*) FROM practice_session_chapters pc JOIN practice_session_items i ON i.id=pc.item_id WHERE i.session_id=pg_temp.ref('replace')), 0::BIGINT, 'replacement removes old mappings');
SELECT lives_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('replace'),'{"paper_number":4}',pg_temp.items(2,10,'none'))$$, 'none item clears effective parent provenance');
SELECT is((SELECT subject_paper_id FROM practice_session_items WHERE session_id=pg_temp.ref('replace')), NULL::UUID, 'none never inherits identified parent');
SELECT lives_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('replace'),'{"paper_number":4}',
  pg_temp.items(2,10,'inherit',NULL,jsonb_build_array(pg_temp.ref('math.mechanics'))))$$, 'owned replacement can restore mapped item');
INSERT INTO m4_ctx(key,id) SELECT 'delete.item', id FROM practice_session_items WHERE session_id=pg_temp.ref('replace');
SELECT is(public.delete_practice_session(pg_temp.ref('owner'),pg_temp.ref('replace')), TRUE, 'owned deletion acknowledged');
SELECT is((SELECT count(*) FROM practice_session_items WHERE id=pg_temp.ref('delete.item')), 0::BIGINT, 'delete cascades child');
SELECT is((SELECT count(*) FROM practice_session_chapters WHERE item_id=pg_temp.ref('delete.item')), 0::BIGINT, 'delete cascades junction');
SELECT is(public.delete_practice_session(pg_temp.ref('owner'),pg_temp.ref('replace')), FALSE, 'second deletion returns false');

RESET ROLE;
-- Inject a downstream insertion failure to prove transaction rollback after a
-- parent and first child have actually been written, not just early validation.
CREATE FUNCTION pg_temp.fail_second_item() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.item_order=2 AND NEW.notes='force late insertion failure' THEN
    RAISE EXCEPTION 'Forced downstream fixture failure' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER m4_test_late_failure BEFORE INSERT ON public.practice_session_items
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_second_item();
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('owner');
INSERT INTO m4_ctx(key,value) VALUES ('downstream.graph',pg_temp.graph(pg_temp.ref('owned'))),
  ('downstream.counts',jsonb_build_array((SELECT count(*) FROM practice_sessions),(SELECT count(*) FROM practice_session_items),(SELECT count(*) FROM practice_session_chapters)));
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{}',pg_temp.items(3,10) ||
  jsonb_build_array(jsonb_build_object('item_order',2,'marks_obtained',3,'marks_available',10,'provenance_mode','none','notes','force late insertion failure')))$$,
  'P0001','Forced downstream fixture failure','failure after first replacement child rolls back');
SELECT is(pg_temp.graph(pg_temp.ref('owned')), (SELECT value FROM m4_ctx WHERE key='downstream.graph'), 'downstream update failure restores deleted children and parent');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(3,10) ||
  jsonb_build_array(jsonb_build_object('item_order',2,'marks_obtained',3,'marks_available',10,'provenance_mode','none','notes','force late insertion failure')))$$,
  'P0001','Forced downstream fixture failure','failure after first created child rolls back');
SELECT is(jsonb_build_array((SELECT count(*) FROM practice_sessions),(SELECT count(*) FROM practice_session_items),(SELECT count(*) FROM practice_session_chapters)),
  (SELECT value FROM m4_ctx WHERE key='downstream.counts'), 'downstream create failure leaves no partial graph');
RESET ROLE;
DROP TRIGGER m4_test_late_failure ON public.practice_session_items;
-- Restrictive provenance references cannot change identified evidence to topical.
SELECT throws_ok($$DELETE FROM subject_papers WHERE id=pg_temp.ref('9709.p2')$$, '23503', NULL, 'referenced off-route component deletion restricted');
SELECT throws_ok($$DELETE FROM chapters WHERE id=pg_temp.ref('math.mechanics')$$, '23503', NULL, 'referenced chapter deletion restricted');

-- Fresh hand-calculation fixtures for all five supported subjects/routes.
SELECT pg_temp.new_user('math.calc','9709','as_only','p1_m1');
SELECT pg_temp.new_user('fm.calc','9231','as_only','fp1_fm');
SELECT pg_temp.new_user('physics.calc','9702','as_only');
SELECT pg_temp.new_user('chemistry.calc','9701','as_only');
SELECT pg_temp.new_user('cs.calc','9618','as_only');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('math.calc');
INSERT INTO m4_ctx(key,id) SELECT 'math.paper', pg_temp.paper('math.calc');
SELECT pg_temp.log('math.calc','9709','as','{"paper_number":1}',pg_temp.items(40,50,'inherit'));
SELECT is(pg_temp.ready('math.calc'), 32.00::NUMERIC, 'Mathematics combined marks give readiness 32');
RESET ROLE;
INSERT INTO public.paper_question_attempts(paper_id,question_number,marks_obtained,marks_available)
  VALUES (pg_temp.ref('math.paper'),'extra',1,20);
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('math.calc');
SELECT is(pg_temp.ready('math.calc'), 32.00::NUMERIC, 'full-paper child breakdown is never counted in assessment sums');
SELECT pg_temp.login('fm.calc');
SELECT pg_temp.paper('fm.calc','9231');
SELECT pg_temp.log('fm.calc','9231','as','{"paper_number":1}',pg_temp.items(40,50,'inherit'));
SELECT is(pg_temp.ready('fm.calc','9231'), 32.00::NUMERIC, 'Further Mathematics combined marks give readiness 32');
SELECT pg_temp.login('physics.calc');
SELECT pg_temp.paper('physics.calc','9702');
SELECT pg_temp.log('physics.calc','9702','as','{"paper_number":1}',pg_temp.items(40,50,'inherit'));
SELECT is(pg_temp.ready('physics.calc','9702'), 32.00::NUMERIC, 'Physics combined marks give readiness 32');
SELECT pg_temp.login('chemistry.calc');
SELECT pg_temp.paper('chemistry.calc','9701');
SELECT pg_temp.log('chemistry.calc','9701','as','{"paper_number":1}',pg_temp.items(40,50,'inherit'));
SELECT is(pg_temp.ready('chemistry.calc','9701'), 32.00::NUMERIC, 'Chemistry combined marks give readiness 32');
SELECT pg_temp.login('cs.calc');
SELECT pg_temp.paper('cs.calc','9618');
SELECT pg_temp.log('cs.calc','9618','as','{"paper_number":1}',pg_temp.items(40,50,'inherit'));
SELECT is(pg_temp.ready('cs.calc','9618'), 32.00::NUMERIC, 'Computer Science combined marks give readiness 32');
RESET ROLE;
SELECT pg_temp.new_user('mixed','9709','full_level','full_mech_stats');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('mixed');
INSERT INTO m4_ctx(key,id) SELECT 'mixed.session', (pg_temp.log('mixed','9709','as','{}',
  pg_temp.items(8,10,'override','{"paper_number":1}') ||
  jsonb_build_array(jsonb_build_object('item_order',2,'marks_obtained',0,'marks_available',90,
    'provenance_mode','override','provenance',jsonb_build_object('paper_number',2))))).id;
SELECT is((SELECT accuracy_pct FROM practice_sessions WHERE id=pg_temp.ref('mixed.session')), 8.00::NUMERIC, 'mixed session history includes all scored items');
SELECT is(pg_temp.ready('mixed'), 32.00::NUMERIC, 'same-stage mixed session counts on-route item only');
SELECT is(pg_temp.ready('mixed','9709','all'), 32.00::NUMERIC, 'aggregate all also excludes genuinely off-route AS item');
SELECT ok(NOT EXISTS (SELECT 1 FROM subject_paper_selections WHERE user_subject_id=pg_temp.ref('mixed.enrollment')
  AND subject_paper_id=pg_temp.ref('9709.p2')), 'off-route fixture actually lacks P2 selection');

-- Real remap: component remains selected but its stage moves. Mapped topical
-- evidence and historical full papers must both disappear from current scores.
RESET ROLE;
SELECT pg_temp.new_user('remap','9709','staged','mech_stats');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('remap');
SELECT public.transition_to_a2(pg_temp.ref('remap'),pg_temp.ref('remap.enrollment'),'manual');
INSERT INTO m4_ctx(key,id) SELECT 'remap.session', (pg_temp.log('remap','9709','as','{}',
  pg_temp.items(80,100,'none',NULL,jsonb_build_array(pg_temp.ref('math.mechanics'))))).id;
SELECT pg_temp.paper('remap','9709',4,'as',20,100);
SELECT is(pg_temp.ready('remap','9709','all'), 20.00::NUMERIC, 'pre-remap full and topical evidence totals 100/200');
INSERT INTO m4_ctx(key,value) VALUES ('remap.graph',pg_temp.graph(pg_temp.ref('remap.session'))), ('remap.papers',pg_temp.paper_baseline('remap'));
SELECT public.configure_subject_route(pg_temp.ref('remap'),pg_temp.ref('remap.enrollment'),'staged',
  (SELECT jsonb_agg(jsonb_build_object('paper_number',sp.paper_number,'component_name',sp.name,'stage',rp.stage))
   FROM subject_valid_routes vr JOIN subject_route_papers rp ON rp.route_id=vr.id JOIN subject_papers sp ON sp.id=rp.subject_paper_id
   WHERE vr.subject_id=(SELECT id FROM subjects WHERE code='9709') AND vr.route='staged' AND vr.combination_key='stats_mech'));
SELECT is(pg_temp.ready('remap','9709','all'), 0.00::NUMERIC, 'all uses actual AS evidence stage after component moved to A2');
SELECT is(pg_temp.ready('remap','9709','as'), 0.00::NUMERIC, 'AS excludes both historical full-paper and topical Mechanics');
SELECT is(pg_temp.ready('remap','9709','a2'), 0.00::NUMERIC, 'historical AS evidence is never reclassified as A2');
SELECT is(pg_temp.graph(pg_temp.ref('remap.session')), (SELECT value FROM m4_ctx WHERE key='remap.graph'), 'remap preserves practice graph');
SELECT is(pg_temp.paper_baseline('remap'), (SELECT value FROM m4_ctx WHERE key='remap.papers'), 'remap preserves historical full papers');
SELECT pg_temp.log('remap','9709','a2','{"paper_number":4}',pg_temp.items(50,50,'inherit',NULL,jsonb_build_array(pg_temp.ref('math.mechanics'))));
SELECT is(pg_temp.ready('remap','9709','a2'), 40.00::NUMERIC, 'real scored child gives A2 readiness after transition/remap');
SELECT is(pg_temp.ready('remap','9709','all'), 40.00::NUMERIC, 'all excludes old-stage evidence while admitting new A2 child');

RESET ROLE;
SELECT pg_temp.new_user('removed','9709','as_only','p1_m1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('removed');
SELECT pg_temp.paper('removed','9709',4,'as',20,100);
SELECT pg_temp.log('removed','9709','as','{}',pg_temp.items(80,100,'none',NULL,jsonb_build_array(pg_temp.ref('fallback'))));
SELECT is(pg_temp.ready('removed'), 20.00::NUMERIC, 'fallback and full-paper evidence are eligible before route removal');
SELECT public.configure_subject_route(pg_temp.ref('removed'),pg_temp.ref('removed.enrollment'),'as_only',
  (SELECT jsonb_agg(jsonb_build_object('paper_number',sp.paper_number,'component_name',sp.name,'stage',rp.stage))
   FROM subject_valid_routes vr JOIN subject_route_papers rp ON rp.route_id=vr.id JOIN subject_papers sp ON sp.id=rp.subject_paper_id
   WHERE vr.subject_id=(SELECT id FROM subjects WHERE code='9709') AND vr.route='as_only' AND vr.combination_key='p1_s1'));
SELECT is(pg_temp.ready('removed'), 0.00::NUMERIC, 'removed full-paper and component-name fallback evidence excluded dynamically');
SELECT is((SELECT count(*) FROM past_papers WHERE user_id=pg_temp.ref('removed')), 1::BIGINT, 'removed full-paper history is not deleted');
SELECT is((SELECT count(*) FROM practice_sessions WHERE user_id=pg_temp.ref('removed')), 1::BIGINT, 'removed mapped topical history is not deleted');
RESET ROLE;
SELECT pg_temp.login('locked');
INSERT INTO user_chapters(user_id,chapter_id,notes_status,confidence_level)
  SELECT pg_temp.ref('locked'),id,'complete',5 FROM chapters
    WHERE public.user_can_access_chapter(pg_temp.ref('locked'),id)
  ON CONFLICT (user_id,chapter_id) DO UPDATE SET notes_status='complete',confidence_level=5;
INSERT INTO user_chapters(user_id,chapter_id,notes_status,confidence_level)
  SELECT pg_temp.ref('locked'),id,'complete',5 FROM chapters WHERE id=pg_temp.ref('9709.chapter.a2');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('locked');
SELECT is(pg_temp.ready('locked','9709','as'), 60.00::NUMERIC, 'notes 35 and confidence 25 weights preserved');
SELECT is(pg_temp.ready('locked','9709','a2'), 0.00::NUMERIC, 'locked A2 excludes historical notes/confidence as well as marks');
SELECT is(pg_temp.ready('locked','9709','all'), 60.00::NUMERIC, 'all counts accessible chapter set only');

-- Clean aggregate fixture: confirmed Math + historical unconfirmed Physics.
RESET ROLE;
SELECT pg_temp.new_user('aggregate','9709','as_only','p1_m1');
INSERT INTO public.user_subjects(user_id,subject_id,study_route,current_stage)
  SELECT pg_temp.ref('aggregate'),id,'unconfirmed',NULL FROM subjects WHERE code='9702';
INSERT INTO practice_sessions(user_id,subject_id,stage,session_date,total_score_raw,total_score_max)
  SELECT pg_temp.ref('aggregate'),id,'as',CURRENT_DATE,100,100 FROM subjects WHERE code='9702';
INSERT INTO practice_session_items(session_id,item_order,marks_obtained,marks_available,provenance_mode)
  SELECT id,1,100,100,'none' FROM practice_sessions WHERE user_id=pg_temp.ref('aggregate');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('aggregate');
SELECT pg_temp.log('aggregate','9709','as','{}',pg_temp.items(50,100));
SELECT is(public.compute_readiness_score(pg_temp.ref('aggregate'),NULL,'all'), 20.00::NUMERIC, 'null-subject aggregate excludes unconfirmed historical subject');
SELECT is(public.compute_readiness_score(pg_temp.ref('aggregate'),NULL), 20.00::NUMERIC, 'two-argument compatibility wrapper preserves aggregate contract');
RESET ROLE;
UPDATE user_subjects SET study_route='as_only',current_stage='as',is_archived=TRUE
  WHERE user_id=pg_temp.ref('aggregate') AND subject_id=(SELECT id FROM subjects WHERE code='9702');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('aggregate');
SELECT is(public.compute_readiness_score(pg_temp.ref('aggregate'),NULL,'all'), 20.00::NUMERIC, 'null-subject aggregate also excludes confirmed archived historical evidence');
RESET ROLE;
UPDATE profiles SET timezone='Pacific/Kiritimati' WHERE id=pg_temp.ref('aggregate');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('aggregate');
SELECT lives_ok($$SELECT public.log_practice_session_atomic(pg_temp.ref('aggregate'),
  (SELECT id FROM subjects WHERE code='9709'),'as',NULL,public.get_user_local_date(pg_temp.ref('aggregate')),NULL,'{}',pg_temp.items())$$,
  'user-local today is accepted even across UTC date boundary');
SELECT throws_ok($$SELECT public.log_practice_session_atomic(pg_temp.ref('aggregate'),
  (SELECT id FROM subjects WHERE code='9709'),'as',NULL,public.get_user_local_date(pg_temp.ref('aggregate'))+1,NULL,'{}',pg_temp.items())$$,
  'P0003', NULL, 'future cutoff follows user local date');
SELECT throws_ok($$SELECT public.compute_readiness_score(pg_temp.ref('aggregate'),NULL,NULL)$$, 'P0002', NULL, 'NULL readiness stage rejected');
SELECT throws_ok($$SELECT public.compute_readiness_score(pg_temp.ref('owner'),NULL,'all')$$, '42501', NULL, 'foreign readiness denied');

-- Legacy component resolution without stage guessing. Temporarily unavailable
-- catalogue simulates pre-024 inserts within this rollback-only transaction.
RESET ROLE;
SELECT pg_temp.new_user('legacy','9709','as_only','p1_m1');
UPDATE subjects SET is_available=FALSE WHERE code='9709';
INSERT INTO past_papers(user_id,subject_id,paper_code,paper_number,year,session,stage,score_raw,score_max)
  SELECT pg_temp.ref('legacy'),id,'9709/12',12,2024,'may_jun','as',50,100 FROM subjects WHERE code='9709';
INSERT INTO past_papers(user_id,subject_id,paper_code,paper_number,year,session,stage,score_raw,score_max)
  SELECT pg_temp.ref('legacy'),id,'unknown',92,2024,'may_jun','as',100,100 FROM subjects WHERE code='9709';
INSERT INTO past_papers(user_id,subject_id,paper_code,paper_number,year,session,stage,score_raw,score_max,attempted_at)
  SELECT pg_temp.ref('legacy'),id,'9709/12',12,2024,'may_jun',NULL,100,100,CURRENT_DATE-1 FROM subjects WHERE code='9709';
UPDATE subjects SET is_available=TRUE WHERE code='9709';
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('legacy');
SELECT is(pg_temp.ready('legacy'), 20.00::NUMERIC, 'legacy known numeric component counts; unknown component/NULL stage excluded');
SELECT is((SELECT count(*) FROM past_papers WHERE user_id=pg_temp.ref('legacy')), 3::BIGINT, 'legacy records preserved in history');
SELECT throws_ok($$INSERT INTO past_papers(user_id,subject_id,paper_code,paper_number,year,session,stage,score_raw,score_max)
  SELECT pg_temp.ref('legacy'),id,'9709/12',12,2024,'may_jun','as',100,100 FROM subjects WHERE code='9709'$$,
  '42501', NULL, 'new full papers remain RPC-controlled');

-- Practice operations leave paper results and all five paper achievements alone.
RESET ROLE;
SELECT pg_temp.new_user('isolation','9709','as_only','p1_m1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('isolation');
SELECT pg_temp.paper('isolation','9709',1,'as',30,40);
SELECT pg_temp.paper('isolation','9709',1,'as',60,100);
SELECT is((SELECT round(sum(score_raw::BIGINT)::NUMERIC/sum(score_max::BIGINT)*100,2)
  FROM past_papers WHERE user_id=pg_temp.ref('isolation')), 64.29::NUMERIC, 'differing maxima full-paper weighted percentage is 64.29');
SELECT is((SELECT round(avg(accuracy_pct),2) FROM past_papers WHERE user_id=pg_temp.ref('isolation')),
  67.50::NUMERIC, 'unweighted percentage differs from mark-weighted evidence');
SELECT is((SELECT score_raw FROM past_papers WHERE user_id=pg_temp.ref('isolation')
  ORDER BY accuracy_pct DESC,attempted_at DESC,created_at DESC,id DESC LIMIT 1), 30::SMALLINT,
  'highest percentage can have lower raw marks');
SELECT is(pg_temp.ready('isolation'), 25.71::NUMERIC, 'actual readiness uses mark weighting across differing maxima');
SELECT is((SELECT count(*) FROM past_papers WHERE user_id=pg_temp.ref('isolation')), 2::BIGINT, 'full-paper fixture has two distinct compatible attempts');
INSERT INTO m4_ctx(key,value) VALUES ('isolation.papers',pg_temp.paper_baseline('isolation')), ('isolation.effects',pg_temp.side_effects('isolation'));
INSERT INTO m4_ctx(key,value) VALUES ('isolation.thresholds',pg_temp.threshold_baseline());
INSERT INTO m4_ctx(key,id) SELECT 'isolation.session',(pg_temp.log('isolation')).id;
SELECT is(pg_temp.paper_baseline('isolation'), (SELECT value FROM m4_ctx WHERE key='isolation.papers'), 'practice create cannot change full-paper count/best/average/rows');
SELECT pg_temp.replace('isolation',pg_temp.ref('isolation.session'),'{}',pg_temp.items(0,1000));
SELECT is(pg_temp.paper_baseline('isolation'), (SELECT value FROM m4_ctx WHERE key='isolation.papers'), 'extreme practice update cannot change full-paper baseline');
SELECT public.delete_practice_session(pg_temp.ref('isolation'),pg_temp.ref('isolation.session'));
SELECT is(pg_temp.paper_baseline('isolation'), (SELECT value FROM m4_ctx WHERE key='isolation.papers'), 'practice delete cannot change full-paper baseline');
SELECT is(pg_temp.side_effects('isolation'), (SELECT value FROM m4_ctx WHERE key='isolation.effects'), 'practice CRUD leaves XP/streak/events/achievements/notifications unchanged');
SELECT is(pg_temp.threshold_baseline(), (SELECT value FROM m4_ctx WHERE key='isolation.thresholds'), 'practice CRUD leaves official catalogue/marks/tokens unchanged');
RESET ROLE;
SELECT pg_temp.new_user('achievements','9709','as_only','p1_m1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('achievements');
SELECT pg_temp.log('achievements') FROM generate_series(1,10);
SELECT is((SELECT count(*) FROM public.check_and_unlock_achievements(pg_temp.ref('achievements'),NULL,NULL)
  WHERE achievement_key IN ('paper_hunter','five_papers','ten_papers','ace','perfect_score')), 0::BIGINT,
  'ten perfect practice sessions cannot unlock any paper achievement');
SELECT pg_temp.paper('achievements','9709',1,'as',100,100);
SELECT is((SELECT count(*) FROM public.check_and_unlock_achievements(pg_temp.ref('achievements'),NULL,NULL)
  WHERE achievement_key IN ('paper_hunter','ace','perfect_score')), 3::BIGINT, 'real perfect full paper unlocks first/ace/perfect controls');
SELECT pg_temp.paper('achievements','9709',1,'as',80,100) FROM generate_series(1,4);
SELECT is((SELECT count(*) FROM public.check_and_unlock_achievements(pg_temp.ref('achievements'),NULL,NULL)
  WHERE achievement_key='five_papers'), 1::BIGINT, 'five real full papers unlock count control');
SELECT pg_temp.paper('achievements','9709',1,'as',80,100) FROM generate_series(1,5);
SELECT is((SELECT count(*) FROM public.check_and_unlock_achievements(pg_temp.ref('achievements'),NULL,NULL)
  WHERE achievement_key='ten_papers'), 1::BIGINT, 'ten real full papers unlock count control');

SELECT * FROM finish();
ROLLBACK;
