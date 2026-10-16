-- Migration 032 write contract. Disposable local database only; all fixtures
-- roll back. Each scenario uses fresh users rather than accumulated evidence.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_catalog;
SET LOCAL TIME ZONE 'UTC';
SELECT plan(90);

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


-- Explicit chapters are passed to every successful new write.
SELECT pg_temp.new_user('owner','9709','full_level','full_mech_stats');
SELECT pg_temp.new_user('other','9709','as_only','p1_m1');
SELECT pg_temp.new_user('stats','9709','full_level','full_stats_double');
SELECT pg_temp.new_user('locked','9709','staged','mech_stats');
SELECT pg_temp.new_user('unconfirmed','9709','unconfirmed');
SELECT pg_temp.new_user('physics','9702','full_level');
SELECT pg_temp.new_user('chemistry','9701','full_level');
INSERT INTO m4_ctx(key,id) SELECT s.code||'.p'||sp.paper_number,sp.id
 FROM subject_papers sp JOIN subjects s ON s.id=sp.subject_id;
INSERT INTO m4_ctx(key,id) SELECT DISTINCT ON (s.code,c.stage) s.code||'.chapter.'||c.stage::text,c.id
 FROM chapters c JOIN subjects s ON s.id=c.subject_id WHERE c.is_active
 ORDER BY s.code,c.stage,c.number,c.id;
INSERT INTO m4_ctx(key,id) SELECT 'mechanics',c.id FROM chapters c JOIN subjects s ON s.id=c.subject_id
 JOIN chapter_papers cp ON cp.chapter_id=c.id JOIN subject_papers sp ON sp.id=cp.subject_paper_id
 WHERE s.code='9709' AND sp.paper_number=4 AND c.is_active ORDER BY c.number LIMIT 1;
INSERT INTO m4_ctx(key,id) SELECT 'stats2',c.id FROM chapters c JOIN subjects s ON s.id=c.subject_id
 JOIN chapter_papers cp ON cp.chapter_id=c.id JOIN subject_papers sp ON sp.id=cp.subject_paper_id
 WHERE s.code='9709' AND sp.paper_number=6 AND c.is_active ORDER BY c.number LIMIT 1;
INSERT INTO m4_ctx(key,id) SELECT 'pure.second',c.id FROM chapters c JOIN subjects s ON s.id=c.subject_id
 WHERE s.code='9709' AND c.stage='as' AND c.is_active ORDER BY c.number OFFSET 1 LIMIT 1;
WITH row AS (INSERT INTO chapters(subject_id,number,title,stage,is_active)
 SELECT id,999,'032 inactive','as',false FROM subjects WHERE code='9709' RETURNING id)
 INSERT INTO m4_ctx(key,id) SELECT 'inactive',id FROM row;
CREATE FUNCTION pg_temp.mapped(p_raw integer DEFAULT 8,p_max integer DEFAULT 10,p_chapter text DEFAULT '9709.chapter.as',
 p_mode text DEFAULT 'none',p_prov jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT pg_temp.items(p_raw,p_max,p_mode,p_prov,jsonb_build_array(pg_temp.ref(p_chapter)));
$$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('owner');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.mapped())$$,'one chapter is accepted');
INSERT INTO m4_ctx(key,id) SELECT 'owned',id FROM practice_sessions WHERE user_id=pg_temp.ref('owner');
INSERT INTO m4_ctx(key,value) VALUES ('owned.graph',pg_temp.graph(pg_temp.ref('owned')));
-- Missing, JSON null and non-array fail shape; empty/oversized arrays fail count.
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',jsonb_build_array((pg_temp.mapped()->0)-'chapter_ids'))$$,'P0007',NULL,'create missing chapters rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(1,2,'none',NULL,'null'))$$,'P0007',NULL,'create null chapters rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner')$$,'P0003',NULL,'create empty chapters rejected');
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{}',jsonb_build_array((pg_temp.mapped()->0)-'chapter_ids'))$$,'P0007',NULL,'replacement missing chapters rejected');
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{}',pg_temp.items(1,2,'none',NULL,'null'))$$,'P0007',NULL,'replacement null chapters rejected');
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'))$$,'P0003',NULL,'replacement empty chapters rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(1,2,'none',NULL,'{}'))$$,'P0007',NULL,'mapping object rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(1,2,'none',NULL,'[null]'))$$,'P0006',NULL,'null chapter element rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(1,2,'none',NULL,'[12]'))$$,'P0006',NULL,'numeric chapter element rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(1,2,'none',NULL,'["bad"]'))$$,'P0006',NULL,'malformed UUID rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(1,2,'none',NULL,
 jsonb_build_array(pg_temp.ref('9709.chapter.as'),pg_temp.ref('9709.chapter.as'))))$$,'P0006',NULL,'duplicates rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(1,2,'none',NULL,
 (SELECT jsonb_agg(gen_random_uuid()) FROM generate_series(1,201))))$$,'P0003',NULL,'201 mappings rejected');
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{}',pg_temp.items(1,2,'none',NULL,
 (SELECT jsonb_agg(gen_random_uuid()) FROM generate_series(1,201))))$$,'P0003',NULL,'replacement 201 mappings rejected');
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{}',pg_temp.items(1,2,'none',NULL,'["bad"]'))$$,'P0006',NULL,'replacement malformed UUID rejected');
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{}',pg_temp.items(1,2,'none',NULL,
 jsonb_build_array(pg_temp.ref('9709.chapter.as'),pg_temp.ref('9709.chapter.as'))))$$,'P0006',NULL,'replacement duplicates rejected');
SELECT is(pg_temp.graph(pg_temp.ref('owned')),(SELECT value FROM m4_ctx WHERE key='owned.graph'),'all invalid replacements preserve complete old graph including IDs');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.mapped(1,2,'9702.chapter.as'))$$,'P0006',NULL,'wrong-subject chapter rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.mapped(1,2,'inactive'))$$,'P0006',NULL,'inactive chapter rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{"paper_number":1}',pg_temp.mapped(1,2,'mechanics','inherit'))$$,'P0006',NULL,'cross-paper mapping rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{"paper_number":6}',pg_temp.mapped(1,2,'stats2','inherit'))$$,'P0008',NULL,'catalogue-stage mismatch rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as',jsonb_build_object('subject_paper_id',gen_random_uuid()),pg_temp.mapped(1,2,'9709.chapter.as','inherit'))$$,'P0008',NULL,'unknown source paper rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as',jsonb_build_object('subject_paper_id',pg_temp.ref('9702.p1')),pg_temp.mapped(1,2,'9709.chapter.as','inherit'))$$,'P0008',NULL,'wrong-subject paper rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{"paper_number":5}',pg_temp.mapped(1,2,'9709.chapter.as','inherit'))$$,'P0008',NULL,'selected paper moved to A2 rejects original AS stage');

-- Multi-chapter links attribute a single scored item only once to readiness.
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(2,10,'none',NULL,
 jsonb_build_array(pg_temp.ref('9709.chapter.as'),pg_temp.ref('pure.second'))))$$,'multi-chapter item accepted');
SELECT is(pg_temp.ready('owner'),20.00::numeric,'contrasting item scores prove multiple junction links do not duplicate marks');
SELECT is((SELECT sum(total_score_max) FROM practice_sessions WHERE user_id=pg_temp.ref('owner')),20::bigint,'parents match two scored items once');
SELECT is((SELECT count(*) FROM practice_session_chapters),3::bigint,'both mappings retained without duplicating items');
INSERT INTO m4_ctx(key,value) VALUES ('before.offroute',to_jsonb(pg_temp.ready('owner','9709','all')));
SELECT ok(EXISTS(SELECT 1 FROM subject_paper_selections WHERE user_subject_id=pg_temp.ref('owner.enrollment') AND subject_paper_id=pg_temp.ref('9709.p4'))
 AND EXISTS(SELECT 1 FROM subject_paper_selections WHERE user_subject_id=pg_temp.ref('owner.enrollment') AND subject_paper_id=pg_temp.ref('9709.p5'))
 AND NOT EXISTS(SELECT 1 FROM subject_paper_selections WHERE user_subject_id=pg_temp.ref('owner.enrollment') AND subject_paper_id=pg_temp.ref('9709.p6')),'fixture selects Mechanics and Stats1 but not Stats2');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','a2','{"paper_number":6}',pg_temp.mapped(0,100,'stats2','inherit'))$$,'off-route A2 Statistics2 inherits source and maps valid chapter');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','a2','{}',pg_temp.mapped(100,100,'stats2','override','{"paper_number":6}'))$$,'off-route Statistics2 override accepted');
INSERT INTO m4_ctx(key,id) SELECT 'offroute',i.session_id FROM practice_session_items i JOIN practice_sessions p ON p.id=i.session_id
 WHERE p.user_id=pg_temp.ref('owner') AND p.stage='a2' AND i.provenance_mode='inherit';
SELECT lives_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('offroute'),'{"paper_number":6}',pg_temp.mapped(50,100,'stats2','inherit'))$$,'replacement also permits off-route Stats2 history');
SELECT is((SELECT count(*) FROM practice_sessions WHERE user_id=pg_temp.ref('owner') AND stage='a2'),2::bigint,'off-route attempts remain readable history');
SELECT is(to_jsonb(pg_temp.ready('owner','9709','all')),(SELECT value FROM m4_ctx WHERE key='before.offroute'),'off-route Statistics2 excluded from current-route Maths readiness');
SELECT is(pg_temp.ready('owner','9709','a2'),0.00::numeric,'off-route Statistics2 excluded from A2 readiness');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','a2','{"paper_number":6}',pg_temp.mapped(100,100,'stats2','none'))$$,'source-free Stats2 remains loggable as history');
SELECT is(to_jsonb(pg_temp.ready('owner','9709','all')),(SELECT value FROM m4_ctx WHERE key='before.offroute'),'source-free Stats2 cannot enter aggregate Maths readiness');
SELECT is(pg_temp.ready('owner','9709','a2'),0.00::numeric,'source-free Stats2 contributes zero A2 readiness');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','a2','{"paper_number":6}',pg_temp.mapped(1,2,'9709.chapter.a2','none'))$$,'none permits current-route topical chapter without inheriting off-route paper');
SELECT ok(NOT EXISTS(SELECT 1 FROM practice_session_items i JOIN practice_sessions p ON p.id=i.session_id
 WHERE p.user_id=pg_temp.ref('owner') AND i.provenance_mode='none' AND i.subject_paper_id IS NOT NULL),'none materializes no source paper');

SELECT pg_temp.login('stats');
SELECT lives_ok($$SELECT pg_temp.log('stats','9709','as','{"paper_number":4}',pg_temp.mapped(1,10,'mechanics','inherit'))$$,'AS Mechanics outside Stats route allowed as mapped history');
SELECT is(pg_temp.ready('stats','9709','all'),0.00::numeric,'off-route AS Mechanics contributes no readiness');
SELECT throws_ok($$SELECT pg_temp.log('stats','9709','as','{}',pg_temp.mapped(1,10,'mechanics'))$$,'P0006',NULL,'source-free off-route Mechanics remains forbidden');
SELECT throws_ok($$SELECT pg_temp.log('stats','9709','a2','{"paper_number":4}',pg_temp.mapped(1,10,'mechanics','inherit'))$$,'P0008',NULL,'off-route Mechanics respects catalogue AS stage');
SELECT pg_temp.login('locked');
SELECT throws_ok($$SELECT pg_temp.log('locked','9709','a2','{"paper_number":6}',pg_temp.mapped(1,10,'stats2','inherit'))$$,'P0005',NULL,'off-route paper never bypasses locked A2');
SELECT pg_temp.login('unconfirmed');
SELECT throws_ok($$SELECT pg_temp.log('unconfirmed','9709','as','{}',pg_temp.mapped())$$,'P0005',NULL,'unconfirmed route rejected');
SELECT pg_temp.login('physics');
SELECT lives_ok($$SELECT pg_temp.log('physics','9702','as','{"paper_number":3}',pg_temp.mapped(1,2,'9702.chapter.as','inherit'))$$,'Physics P3 permits AS foundation');
SELECT throws_ok($$SELECT pg_temp.log('physics','9702','as','{"paper_number":3}',pg_temp.mapped(1,2,'9702.chapter.a2','inherit'))$$,'P0006',NULL,'Physics P3 denies A2 chapter');
SELECT lives_ok($$SELECT pg_temp.log('physics','9702','a2','{"paper_number":5}',pg_temp.mapped(1,2,'9702.chapter.as','inherit'))$$,'Physics P5 cross-cutting AS exception');
SELECT lives_ok($$SELECT pg_temp.log('physics','9702','a2','{"paper_number":5}',pg_temp.mapped(1,2,'9702.chapter.a2','inherit'))$$,'Physics P5 permits A2 chapter');
SELECT pg_temp.login('chemistry');
SELECT lives_ok($$SELECT pg_temp.log('chemistry','9701','as','{"paper_number":3}',pg_temp.mapped(1,2,'9701.chapter.as','inherit'))$$,'Chemistry P3 permits AS foundation');
SELECT lives_ok($$SELECT pg_temp.log('chemistry','9701','a2','{"paper_number":5}',pg_temp.mapped(1,2,'9701.chapter.as','inherit'))$$,'Chemistry P5 cross-cutting AS exception');
SELECT lives_ok($$SELECT pg_temp.log('chemistry','9701','a2','{"paper_number":5}',pg_temp.mapped(1,2,'9701.chapter.a2','inherit'))$$,'Chemistry P5 permits A2 chapter');

-- Security boundaries remain unchanged.
SELECT pg_temp.login('other');
SELECT is((SELECT count(*) FROM practice_sessions),0::bigint,'other user cannot read sessions');
SELECT is((SELECT count(*) FROM practice_session_items),0::bigint,'other user cannot read items');
SELECT is((SELECT count(*) FROM practice_session_chapters),0::bigint,'other user cannot read mappings');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.mapped())$$,'42501',NULL,'spoofed create forbidden');
SELECT throws_ok($$SELECT pg_temp.replace('other',pg_temp.ref('owned'),'{}',pg_temp.mapped())$$,'P0005',NULL,'foreign update forbidden');
SELECT is(public.delete_practice_session(pg_temp.ref('other'),pg_temp.ref('owned')),false,'foreign delete denied');
SELECT throws_ok($$INSERT INTO practice_sessions DEFAULT VALUES$$,'42501',NULL,'direct parent write forbidden');
SELECT throws_ok($$INSERT INTO practice_session_items DEFAULT VALUES$$,'42501',NULL,'direct item write forbidden');
SELECT throws_ok($$INSERT INTO practice_session_chapters DEFAULT VALUES$$,'42501',NULL,'direct mapping write forbidden');
SELECT throws_ok($$SELECT public.m4_logging_chapter_eligible(NULL,'as',NULL,NULL)$$,'42501',NULL,'new logging helper inaccessible to client');
RESET ROLE;
SELECT ok((SELECT bool_and(NOT has_function_privilege(r.name,p.oid,'EXECUTE')) FROM pg_proc p
 CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(name)
 WHERE p.oid='public.m4_logging_chapter_eligible(public.user_subjects,text,uuid,uuid)'::regprocedure),'new helper denies all client and service roles');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
 WHERE p.oid='public.m4_logging_chapter_eligible(public.user_subjects,text,uuid,uuid)'::regprocedure AND a.grantee=0),'new helper has no PUBLIC execution');
SELECT ok((SELECT proconfig @> ARRAY['search_path=pg_catalog'] FROM pg_proc
 WHERE oid='public.m4_logging_chapter_eligible(public.user_subjects,text,uuid,uuid)'::regprocedure),'new helper pins private search path');
SELECT ok((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN
 ('practice_sessions'::regclass,'practice_session_items'::regclass,'practice_session_chapters'::regclass)),'RLS remains enabled on all practice tables');
SELECT ok((SELECT bool_and(NOT has_table_privilege('authenticated',t.name,v.name)) FROM
 (VALUES('practice_sessions'),('practice_session_items'),('practice_session_chapters')) t(name)
 CROSS JOIN (VALUES('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) v(name)),'no client writes granted');
-- Downstream failure occurs after deleting old graph / writing first replacement.
CREATE FUNCTION pg_temp.fail_second() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.item_order=2 THEN RAISE EXCEPTION '032 late fixture failure' USING ERRCODE='P0001'; END IF; RETURN NEW; END;
$$;
CREATE TRIGGER m4_032_late BEFORE INSERT ON practice_session_items FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_second();
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('owner');
INSERT INTO m4_ctx(key,value) VALUES ('rollback.graph',pg_temp.graph(pg_temp.ref('owned'))),
 ('rollback.counts',jsonb_build_array((SELECT count(*) FROM practice_sessions),(SELECT count(*) FROM practice_session_items),(SELECT count(*) FROM practice_session_chapters))),
 ('rollback.effects',pg_temp.side_effects('owner')),('rollback.papers',pg_temp.paper_baseline('owner')),('rollback.thresholds',pg_temp.threshold_baseline());
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{}',pg_temp.mapped() ||
 jsonb_build_array(jsonb_set(pg_temp.mapped()->0,'{item_order}','2')))$$,'P0001','032 late fixture failure','late replacement fails after graph changes');
SELECT is(pg_temp.graph(pg_temp.ref('owned')),(SELECT value FROM m4_ctx WHERE key='rollback.graph'),'late failure restores complete old parent/items/links including IDs');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.mapped() ||
 jsonb_build_array(jsonb_set(pg_temp.mapped()->0,'{item_order}','2')))$$,'P0001','032 late fixture failure','late create failure rolls back');
SELECT is(jsonb_build_array((SELECT count(*) FROM practice_sessions),(SELECT count(*) FROM practice_session_items),(SELECT count(*) FROM practice_session_chapters)),
 (SELECT value FROM m4_ctx WHERE key='rollback.counts'),'late create leaves no partial graph');
RESET ROLE;
DROP TRIGGER m4_032_late ON practice_session_items;
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('owner');
SELECT lives_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{"paper_number":1}',pg_temp.mapped(2,5,'9709.chapter.as','inherit'))$$,'valid full replacement succeeds');
SELECT is((SELECT total_score_raw FROM practice_sessions WHERE id=pg_temp.ref('owned')),2,'replacement recalculates raw marks');
SELECT is((SELECT total_score_max FROM practice_sessions WHERE id=pg_temp.ref('owned')),5,'replacement recalculates maximum');
SELECT is((SELECT count(*) FROM practice_session_chapters c JOIN practice_session_items i ON i.id=c.item_id
 WHERE i.session_id=pg_temp.ref('owned')),1::bigint,'replacement persists exactly requested chapter');
SELECT is(pg_temp.side_effects('owner'),(SELECT value FROM m4_ctx WHERE key='rollback.effects'),'practice writes do not change XP/streak/events/achievements');
SELECT is(pg_temp.paper_baseline('owner'),(SELECT value FROM m4_ctx WHERE key='rollback.papers'),'practice writes preserve full-paper baseline');
SELECT is(pg_temp.threshold_baseline(),(SELECT value FROM m4_ctx WHERE key='rollback.thresholds'),'practice writes preserve official threshold catalogue');

-- Explicit distinct upper bound uses real valid catalogue fixture chapters.
RESET ROLE;
INSERT INTO chapters(subject_id,number,title,stage,is_active)
 SELECT id,2000+n,'032 upper-bound chapter '||n,'as',true FROM subjects CROSS JOIN generate_series(1,200) n WHERE code='9709';
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('owner');
SELECT lives_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.items(0,1,'none',NULL,
 (SELECT jsonb_agg(c.id) FROM chapters c JOIN subjects s ON s.id=c.subject_id WHERE s.code='9709' AND c.number BETWEEN 2001 AND 2200)))$$,'200 distinct valid chapter mappings accepted');
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{}',pg_temp.items(1,2,'none',NULL,'{}'))$$,'P0007',NULL,'replacement invalid mapping shape rejected');
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{}',pg_temp.mapped(1,2,'inactive'))$$,'P0006',NULL,'replacement inactive chapter rejected');
SELECT throws_ok($$SELECT pg_temp.log('owner','9709','as','{}',pg_temp.mapped() ||
 jsonb_build_array(jsonb_set(pg_temp.mapped(1,2,'inactive')->0,'{item_order}','2')))$$,'P0006',NULL,'invalid chapter in second item aborts create');
SELECT throws_ok($$SELECT pg_temp.replace('owner',pg_temp.ref('owned'),'{}',pg_temp.mapped() ||
 jsonb_build_array(jsonb_set(pg_temp.mapped(1,2,'inactive')->0,'{item_order}','2')))$$,'P0006',NULL,'invalid chapter in second item aborts replacement');

RESET ROLE;
SELECT pg_temp.new_user('topical32','9709','full_level','full_mech_stats');
INSERT INTO m4_ctx(key,id) SELECT 'stats1',c.id FROM chapters c JOIN chapter_papers cp ON cp.chapter_id=c.id
 JOIN subject_papers sp ON sp.id=cp.subject_paper_id JOIN subjects s ON s.id=c.subject_id
 WHERE s.code='9709' AND sp.paper_number=5 AND c.component='Statistics 1' AND c.is_active ORDER BY c.number LIMIT 1;
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('topical32');
SELECT is(pg_temp.ready('topical32','9709','all'),0.00::numeric,'clean source-free Stats2 fixture starts at zero');
SELECT lives_ok($$SELECT pg_temp.log('topical32','9709','a2','{}',pg_temp.mapped(10,10,'stats2','none'))$$,'source-free Stats2 alone saves as history');
SELECT is(pg_temp.ready('topical32','9709','all'),0.00::numeric,'source-free Stats2 alone keeps readiness exactly zero');
SELECT lives_ok($$SELECT pg_temp.log('topical32','9709','a2','{}',pg_temp.mapped(8,10,'stats1','none') ||
 jsonb_build_array(jsonb_set(pg_temp.items(5,5,'none',NULL,jsonb_build_array(pg_temp.ref('stats1'),pg_temp.ref('stats2')))->0,'{item_order}','2')))$$,'same-stage selected and mixed off-route questions both remain loggable');
SELECT is(pg_temp.ready('topical32','9709','a2'),32.00::numeric,'only selected-stage8/10 counts; mixed off-route5/5 excluded atomically per item');
SELECT is((SELECT sum(total_score_raw) FROM practice_sessions WHERE user_id=pg_temp.ref('topical32')),23::bigint,'history retains all on-route and off-route marks');

SELECT * FROM finish();
ROLLBACK;
