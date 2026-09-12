-- =============================================================================
-- DATABASE TESTS: Official Grade-Threshold Foundation (Migration 027)
--
-- Run via: npm run test:db
-- All fixtures and helper functions roll back; no official threshold data is seeded.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(68);

CREATE TEMP TABLE gt027_test_ctx (
  key   TEXT PRIMARY KEY,
  value TEXT
) ON COMMIT DROP;

GRANT ALL ON TABLE gt027_test_ctx TO anon, authenticated, service_role;

-- Helper: stage a minimal complete publication for route-validation regressions.
CREATE FUNCTION pg_temp.seed_route_publication(
  p_publication_id UUID,
  p_subject_id UUID,
  p_token_route_id UUID,
  p_mapped_route_id UUID,
  p_route_type TEXT,
  p_mode TEXT DEFAULT 'valid'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_combination_id UUID := extensions.uuid_generate_v4();
  v_variant_id     UUID;
  v_position       SMALLINT := 0;
  v_row            RECORD;
  v_extra_paper    UUID;
BEGIN
  INSERT INTO public.grade_threshold_combinations (
    id, publication_id, canonical_key, qualification_level, route_type,
    maximum_mark, weighting_basis, planner_eligibility, atlas_route_id
  ) VALUES (
    v_combination_id, p_publication_id, 'fixture-' || p_mode,
    CASE WHEN p_route_type = 'as_only' THEN 'as' ELSE 'a_level' END,
    p_route_type, 400, 'raw_total', 'eligible', p_mapped_route_id
  );

  FOR v_row IN
    SELECT rp.subject_paper_id, rp.stage, sp.paper_number
    FROM public.subject_route_papers rp
    JOIN public.subject_papers sp ON sp.id = rp.subject_paper_id
    WHERE rp.route_id = p_token_route_id
      AND (p_route_type <> 'staged' OR rp.stage = 'a2')
    ORDER BY rp.stage, sp.paper_number
  LOOP
    IF p_mode = 'missing' AND v_position = 0 THEN
      CONTINUE;
    END IF;

    v_variant_id := extensions.uuid_generate_v4();
    INSERT INTO public.grade_threshold_component_variants (
      id, publication_id, component_code, raw_maximum_mark, subject_paper_id
    ) VALUES (
      v_variant_id, p_publication_id, v_row.paper_number::TEXT || '1', 100, v_row.subject_paper_id
    );

    INSERT INTO public.grade_threshold_component_marks (component_variant_id, grade, threshold_mark)
    VALUES
      (v_variant_id, 'A', 70), (v_variant_id, 'B', 60), (v_variant_id, 'C', 50),
      (v_variant_id, 'D', 40), (v_variant_id, 'E', 30);

    v_position := v_position + 1;

    INSERT INTO public.grade_threshold_combination_tokens (
      combination_id, token_position, raw_token, token_kind,
      resolved_component_variant_id, stage, maximum_mark
    ) VALUES (
      v_combination_id, v_position, v_row.paper_number::TEXT || '1', 'component_variant',
      v_variant_id,
      CASE WHEN p_mode = 'wrong_stage' AND v_position = 1
           THEN CASE v_row.stage WHEN 'as' THEN 'a2' ELSE 'as' END
           ELSE v_row.stage END,
      100
    );
  END LOOP;

  -- Every publication needs at least one exact component even if missing mode skipped all.
  IF NOT EXISTS (
    SELECT 1 FROM public.grade_threshold_component_variants WHERE publication_id = p_publication_id
  ) THEN
    SELECT sp.id INTO v_extra_paper
    FROM public.subject_papers sp WHERE sp.subject_id = p_subject_id ORDER BY sp.paper_number LIMIT 1;
    v_variant_id := extensions.uuid_generate_v4();
    INSERT INTO public.grade_threshold_component_variants (
      id, publication_id, component_code, raw_maximum_mark, subject_paper_id
    ) VALUES (v_variant_id, p_publication_id, 'fixture', 100, v_extra_paper);
    INSERT INTO public.grade_threshold_component_marks (component_variant_id, grade, threshold_mark)
    VALUES
      (v_variant_id, 'A', 70), (v_variant_id, 'B', 60), (v_variant_id, 'C', 50),
      (v_variant_id, 'D', 40), (v_variant_id, 'E', 30);
  END IF;

  IF p_mode = 'extra' THEN
    SELECT sp.id INTO v_extra_paper
    FROM public.subject_papers sp
    WHERE sp.subject_id = p_subject_id
      AND NOT EXISTS (
        SELECT 1 FROM public.subject_route_papers rp
        WHERE rp.route_id = p_mapped_route_id AND rp.subject_paper_id = sp.id
      )
    ORDER BY sp.paper_number
    LIMIT 1;

    v_variant_id := extensions.uuid_generate_v4();
    INSERT INTO public.grade_threshold_component_variants (
      id, publication_id, component_code, raw_maximum_mark, subject_paper_id
    )
    SELECT v_variant_id, p_publication_id, sp.paper_number::TEXT || '1', 100, sp.id
    FROM public.subject_papers sp WHERE sp.id = v_extra_paper;
    INSERT INTO public.grade_threshold_component_marks (component_variant_id, grade, threshold_mark)
    VALUES
      (v_variant_id, 'A', 70), (v_variant_id, 'B', 60), (v_variant_id, 'C', 50),
      (v_variant_id, 'D', 40), (v_variant_id, 'E', 30);
    v_position := v_position + 1;
    INSERT INTO public.grade_threshold_combination_tokens (
      combination_id, token_position, raw_token, token_kind,
      resolved_component_variant_id, stage, maximum_mark
    )
    SELECT v_combination_id, v_position, sp.paper_number::TEXT || '1', 'component_variant',
           v_variant_id, 'a2', 100
    FROM public.subject_papers sp WHERE sp.id = v_extra_paper;
  ELSIF p_mode = 'duplicate_paper' THEN
    SELECT sp.id INTO v_extra_paper
    FROM public.subject_papers sp
    JOIN public.subject_route_papers rp ON rp.subject_paper_id = sp.id
    WHERE rp.route_id = p_mapped_route_id
    ORDER BY sp.paper_number
    LIMIT 1;

    v_variant_id := extensions.uuid_generate_v4();
    INSERT INTO public.grade_threshold_component_variants (
      id, publication_id, component_code, raw_maximum_mark, subject_paper_id
    )
    SELECT v_variant_id, p_publication_id, sp.paper_number::TEXT || '9', 100, sp.id
    FROM public.subject_papers sp WHERE sp.id = v_extra_paper;
    INSERT INTO public.grade_threshold_component_marks (component_variant_id, grade, threshold_mark)
    VALUES
      (v_variant_id, 'A', 70), (v_variant_id, 'B', 60), (v_variant_id, 'C', 50),
      (v_variant_id, 'D', 40), (v_variant_id, 'E', 30);
    v_position := v_position + 1;
    INSERT INTO public.grade_threshold_combination_tokens (
      combination_id, token_position, raw_token, token_kind,
      resolved_component_variant_id, stage, maximum_mark
    )
    SELECT v_combination_id, v_position, sp.paper_number::TEXT || '9', 'component_variant',
           v_variant_id, 'as', 100
    FROM public.subject_papers sp WHERE sp.id = v_extra_paper;
  END IF;

  IF p_route_type = 'staged' THEN
    v_position := v_position + 1;
    INSERT INTO public.grade_threshold_combination_tokens (
      combination_id, token_position, raw_token, token_kind, stage,
      carry_forward_mapping_status, mapping_reviewed_by, mapping_reviewed_at
    ) VALUES (
      v_combination_id, v_position, '84', 'carry_forward', 'as',
      CASE WHEN p_mode = 'unreviewed_carry' THEN 'unreviewed' ELSE 'approved' END,
      CASE WHEN p_mode = 'unreviewed_carry' THEN NULL ELSE 'fixture-reviewer' END,
      CASE WHEN p_mode = 'unreviewed_carry' THEN NULL ELSE NOW() END
    );
  END IF;

  IF p_mode <> 'no_marks' THEN
    IF p_route_type = 'as_only' THEN
      INSERT INTO public.grade_threshold_combination_marks (combination_id, grade, threshold_mark)
      VALUES
        (v_combination_id, 'a', 280), (v_combination_id, 'b', 240),
        (v_combination_id, 'c', 200), (v_combination_id, 'd', 160),
        (v_combination_id, 'e', 120);
    ELSE
      INSERT INTO public.grade_threshold_combination_marks (combination_id, grade, threshold_mark)
      VALUES
        (v_combination_id, 'A*', 320), (v_combination_id, 'A', 280),
        (v_combination_id, 'B', 240), (v_combination_id, 'C', 200),
        (v_combination_id, 'D', 160), (v_combination_id, 'E', 120);
    END IF;
  END IF;

  RETURN v_combination_id;
END;
$$;

-- ─── 1. Schema and privilege shape ──────────────────────────────────────────

SELECT has_table('public', 'grade_threshold_import_runs', '1. import-run audit table exists');
SELECT has_table('public', 'grade_threshold_publications', '2. versioned publication table exists');
SELECT has_table('public', 'grade_threshold_component_variants', '3. exact component-variant table exists');
SELECT has_table('public', 'grade_threshold_component_marks', '4. component A-E marks table exists');
SELECT has_table('public', 'grade_threshold_combinations', '5. qualification-combination table exists');
SELECT has_table('public', 'grade_threshold_combination_marks', '6. overall threshold marks table exists');
SELECT has_table('public', 'grade_threshold_combination_tokens', '7. ordered lossless token table exists');
SELECT has_table('public', 'grade_threshold_weighting_sources', '8. normalized weighting provenance table exists');
SELECT has_table('public', 'grade_threshold_weighting_entries', '8b. exact immutable weighting-entry table exists');
SELECT has_table('public', 'grade_threshold_import_issues', '9. validation issue table exists');
SELECT has_table('public', 'grade_threshold_variant_benchmark_groups', '10. reviewed benchmark group table exists');
SELECT has_table('public', 'grade_threshold_variant_benchmark_members', '11. explicit benchmark member table exists');
SELECT has_view('public', 'published_grade_threshold_combinations', '12. planner boundary view exists');
SELECT has_view('public', 'published_grade_threshold_variant_benchmarks', '13. ceiling-average benchmark view exists');

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'grade_threshold_import_runs'
      AND column_name IN ('source_url', 'official_pdf_url', 'source_checksum_sha256', 'checksum')
  ),
  '14. batch runs do not own document URLs or checksums'
);

SELECT is(
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'grade_threshold_publications'
     AND column_name = 'source_checksum_sha256'),
  'bytea',
  '15. publication SHA-256 is stored as raw bytes'
);

SELECT ok(
  NOT has_function_privilege('public', 'public.publish_grade_threshold_publication(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.publish_grade_threshold_publication(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.publish_grade_threshold_publication(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.publish_grade_threshold_publication(uuid)', 'EXECUTE'),
  '16. publishing is executable by service_role only'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.grade_threshold_publications', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.grade_threshold_combinations', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.grade_threshold_combination_tokens', 'DELETE')
  AND NOT has_table_privilege('anon', 'public.grade_threshold_import_runs', 'SELECT'),
  '17. clients cannot mutate catalogue rows or read import audit data'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.grade_threshold_publications'::REGCLASS)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.grade_threshold_import_runs'::REGCLASS)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.grade_threshold_import_issues'::REGCLASS),
  '18. catalogue and administrative tables have RLS enabled'
);

-- ─── 2. Main staged fixture: exact rows, lossless tokens, no invented weights ─

DO $$
DECLARE
  v_subject UUID;
  v_route_full UUID;
  v_route_as UUID;
  v_run UUID := '02700000-0000-4000-a000-000000000001';
  v_pub UUID := '02700000-0000-4000-a000-000000000002';
  v_paper_count INTEGER;
  v_variant UUID;
  v_combination UUID;
  v_group UUID := '02700000-0000-4000-a000-000000000090';
  v_code TEXT;
  v_paper UUID;
  v_stage TEXT;
BEGIN
  SELECT id INTO v_subject FROM public.subjects WHERE code = '9709' AND is_global = TRUE;
  SELECT id INTO v_route_full FROM public.subject_valid_routes
  WHERE subject_id = v_subject AND route = 'full_level' AND combination_key = 'full_mech_stats';
  SELECT id INTO v_route_as FROM public.subject_valid_routes
  WHERE subject_id = v_subject AND route = 'as_only' AND combination_key = 'p1_p2';
  SELECT COUNT(*) INTO v_paper_count FROM public.subject_papers WHERE subject_id = v_subject;

  INSERT INTO public.grade_threshold_import_runs (
    id, trigger_kind, parser_version, status, started_at, finished_at, aggregate_summary
  ) VALUES (
    v_run, 'scheduled', 'fixture-parser-1', 'succeeded', NOW() - INTERVAL '1 minute', NOW(),
    '{"documents":1,"official_rows":3}'::JSONB
  );

  INSERT INTO public.grade_threshold_publications (
    id, import_run_id, subject_id, exam_year, exam_series,
    official_index_url, official_pdf_url, source_checksum_sha256,
    official_published_on, source_metadata
  ) VALUES (
    v_pub, v_run, v_subject, 2026, 'june',
    'https://www.cambridgeinternational.org/fixture-index',
    'https://www.cambridgeinternational.org/fixture.pdf',
    DECODE(REPEAT('11', 32), 'hex'), DATE '2026-08-11', '{"fixture":true}'::JSONB
  );

  -- Exact official component codes. No digit/suffix meaning is inferred.
  FOR v_code, v_paper, v_stage IN
    SELECT x.component_code, sp.id, x.stage
    FROM (VALUES ('11', 1, 'as'), ('12', 1, 'as'), ('21', 2, 'as'),
                 ('32', 3, 'a2'), ('42', 4, 'as'), ('52', 5, 'a2')) AS x(component_code, paper_number, stage)
    JOIN public.subject_papers sp ON sp.subject_id = v_subject AND sp.paper_number = x.paper_number
  LOOP
    v_variant := extensions.uuid_generate_v4();
    INSERT INTO public.grade_threshold_component_variants (
      id, publication_id, component_code, raw_maximum_mark, subject_paper_id
    ) VALUES (v_variant, v_pub, v_code, 100, v_paper);
    INSERT INTO public.grade_threshold_component_marks (component_variant_id, grade, threshold_mark)
    VALUES
      (v_variant, 'A', CASE WHEN v_code = '11' THEN 55 WHEN v_code = '12' THEN 54 ELSE 70 END),
      (v_variant, 'B', 48), (v_variant, 'C', 41), (v_variant, 'D', 34), (v_variant, 'E', 27);
  END LOOP;

  -- Eligible full route, deliberately without any weighting factors.
  v_combination := '02700000-0000-4000-a000-000000000010';
  INSERT INTO public.grade_threshold_combinations (
    id, publication_id, canonical_key, official_option_label, qualification_level,
    route_type, maximum_mark, weighting_basis, planner_eligibility, atlas_route_id
  ) VALUES (
    v_combination, v_pub, '11+42+32+52', 'Option AY', 'a_level',
    'full_level', 400, 'raw_total', 'eligible', v_route_full
  );
  INSERT INTO public.grade_threshold_combination_marks (combination_id, grade, threshold_mark)
  VALUES
    (v_combination, 'A*', 320), (v_combination, 'A', 280), (v_combination, 'B', 240),
    (v_combination, 'C', 200), (v_combination, 'D', 160), (v_combination, 'E', 120);
  INSERT INTO public.grade_threshold_combination_tokens (
    combination_id, token_position, raw_token, token_kind,
    resolved_component_variant_id, stage, maximum_mark
  )
  SELECT v_combination, x.position, x.code, 'component_variant', v.id, x.stage, 100
  FROM (VALUES (1, '11', 'as'), (2, '42', 'as'), (3, '32', 'a2'), (4, '52', 'a2'))
    AS x(position, code, stage)
  JOIN public.grade_threshold_component_variants v
    ON v.publication_id = v_pub AND v.component_code = x.code;

  -- AS uses lowercase a-e and an exact reviewed AS route mapping.
  v_combination := '02700000-0000-4000-a000-000000000011';
  INSERT INTO public.grade_threshold_combinations (
    id, publication_id, canonical_key, qualification_level, route_type,
    maximum_mark, weighting_basis, planner_eligibility, atlas_route_id
  ) VALUES (v_combination, v_pub, '11+21', 'as', 'as_only', 200, 'raw_total', 'eligible', v_route_as);
  INSERT INTO public.grade_threshold_combination_marks (combination_id, grade, threshold_mark)
  VALUES (v_combination, 'a', 140), (v_combination, 'b', 120), (v_combination, 'c', 100),
         (v_combination, 'd', 80), (v_combination, 'e', 60);
  INSERT INTO public.grade_threshold_combination_tokens (
    combination_id, token_position, raw_token, token_kind,
    resolved_component_variant_id, stage, maximum_mark
  )
  SELECT v_combination, x.position, x.code, 'component_variant', v.id, 'as', 100
  FROM (VALUES (1, '11'), (2, '21')) AS x(position, code)
  JOIN public.grade_threshold_component_variants v
    ON v.publication_id = v_pub AND v.component_code = x.code;

  -- Unmapped official row remains lossless and is not planner eligible.
  v_combination := '02700000-0000-4000-a000-000000000012';
  INSERT INTO public.grade_threshold_combinations (
    id, publication_id, canonical_key, official_source_label, qualification_level,
    route_type, maximum_mark, weighting_basis, planner_eligibility
  ) VALUES (
    v_combination, v_pub, '11+84+87+99', 'Official unmapped fixture', 'a_level',
    'other', 400, 'raw_total', 'unsupported'
  );
  INSERT INTO public.grade_threshold_combination_marks (combination_id, grade, threshold_mark)
  VALUES
    (v_combination, 'A*', 320), (v_combination, 'A', 280), (v_combination, 'B', 240),
    (v_combination, 'C', 200), (v_combination, 'D', 160), (v_combination, 'E', 120);
  INSERT INTO public.grade_threshold_combination_tokens (
    combination_id, token_position, raw_token, token_kind,
    resolved_component_variant_id, stage, maximum_mark,
    carry_forward_mapping_status
  )
  SELECT v_combination, 1, '11', 'component_variant', v.id, 'as', 100, NULL
  FROM public.grade_threshold_component_variants v
  WHERE v.publication_id = v_pub AND v.component_code = '11';
  INSERT INTO public.grade_threshold_combination_tokens (
    combination_id, token_position, raw_token, token_kind, stage, carry_forward_mapping_status
  ) VALUES
    (v_combination, 2, '84', 'carry_forward', 'as', 'unreviewed'),
    (v_combination, 3, '87', 'special', NULL, NULL),
    (v_combination, 4, '99', 'unresolved', NULL, NULL);

  SELECT v.id INTO v_variant
  FROM public.grade_threshold_component_variants v
  WHERE v.publication_id = v_pub AND v.component_code = '11';
  INSERT INTO public.grade_threshold_variant_benchmark_groups (
    id, publication_id, subject_paper_id, component_grade, raw_maximum_mark,
    approval_status, approved_by, approved_at
  )
  SELECT v_group, v_pub, v.subject_paper_id, 'A', 100, 'approved', 'fixture-reviewer', NOW()
  FROM public.grade_threshold_component_variants v WHERE v.id = v_variant;
  INSERT INTO public.grade_threshold_variant_benchmark_members (group_id, component_variant_id)
  SELECT v_group, v.id FROM public.grade_threshold_component_variants v
  WHERE v.publication_id = v_pub AND v.component_code IN ('11', '12');

  INSERT INTO gt027_test_ctx (key, value) VALUES
    ('subject', v_subject::TEXT), ('run', v_run::TEXT), ('publication_v1', v_pub::TEXT),
    ('full_route', v_route_full::TEXT), ('as_route', v_route_as::TEXT),
    ('subject_paper_count', v_paper_count::TEXT);
END;
$$;

SET LOCAL ROLE anon;
SELECT is(
  (SELECT COUNT(*) FROM public.grade_threshold_publications)::BIGINT,
  0::BIGINT,
  '19. staged publications are invisible to anonymous catalogue reads'
);
RESET ROLE;

DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.grade_threshold_publications (
      import_run_id, subject_id, exam_year, exam_series, official_index_url,
      official_pdf_url, source_checksum_sha256
    ) VALUES (
      (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'run'),
      (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject'),
      2026, 'march', 'https://example.test/index', 'https://example.test/doc.pdf',
      DECODE(REPEAT('ab', 32), 'hex')
    );
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO gt027_test_ctx VALUES ('anon_write_sqlstate', SQLSTATE);
  END;
  RESET ROLE;
END;
$$;

SELECT is(
  (SELECT value FROM gt027_test_ctx WHERE key = 'anon_write_sqlstate'),
  '42501',
  '20. anonymous clients are denied direct catalogue writes'
);

SELECT is(
  (SELECT ARRAY_AGG(raw_token ORDER BY token_position)
   FROM public.grade_threshold_combination_tokens
   WHERE combination_id = '02700000-0000-4000-a000-000000000012'),
  ARRAY['11','84','87','99']::TEXT[],
  '21. exact raw tokens including 84, 87, and 99 are preserved in source order'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.grade_threshold_combination_tokens
    WHERE combination_id = '02700000-0000-4000-a000-000000000012'
      AND raw_token = '84' AND token_kind = 'carry_forward'
      AND resolved_component_variant_id IS NULL
  ),
  '22. carry-forward remains explicit and unresolved rather than becoming a paper'
);

SELECT is(
  (SELECT COUNT(*)::TEXT FROM public.subject_papers
   WHERE subject_id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject')),
  (SELECT value FROM gt027_test_ctx WHERE key = 'subject_paper_count'),
  '23. special and carry-forward tokens create no synthetic subject_papers'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.grade_threshold_combination_tokens
    WHERE combination_id IN (
      '02700000-0000-4000-a000-000000000010',
      '02700000-0000-4000-a000-000000000011'
    ) AND (weighting_factor IS NOT NULL OR weighting_entry_id IS NOT NULL)
  ),
  '24. absent official weighting remains NULL without invention'
);

-- Constraint and trigger failures are captured without changing the valid fixture.
DO $$
DECLARE
  v_variant UUID;
  v_combo UUID := '02700000-0000-4000-a000-000000000010';
  v_source UUID;
  v_entry UUID;
  v_carry_entry UUID;
  v_other_subject UUID;
  v_wrong_subj_source UUID;
  v_wrong_subj_entry UUID;
  v_wrong_series_source UUID;
  v_wrong_series_entry UUID;
BEGIN
  SELECT id INTO v_variant FROM public.grade_threshold_component_variants
  WHERE publication_id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'publication_v1')
    AND component_code = '11';

  SELECT id INTO v_other_subject
  FROM public.subjects
  WHERE id <> (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject')
  LIMIT 1;

  BEGIN
    INSERT INTO public.grade_threshold_weighting_sources (
      id, subject_id, document_year, exam_series, official_document_url,
      source_checksum_sha256, source_label, review_status, reviewed_by, reviewed_at
    ) VALUES (
      extensions.uuid_generate_v4(),
      (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject'),
      2026, 'june', 'https://www.cambridgeinternational.org/invalid-checksum.pdf',
      DECODE(REPEAT('77', 16), 'hex'), 'invalid checksum source', 'approved', 'fixture-reviewer', NOW()
    );
  EXCEPTION WHEN OTHERS THEN INSERT INTO gt027_test_ctx VALUES ('weight_checksum', SQLSTATE); END;

  BEGIN
    INSERT INTO public.grade_threshold_component_marks (component_variant_id, grade, threshold_mark)
    VALUES (v_variant, 'A', 101);
  EXCEPTION WHEN OTHERS THEN INSERT INTO gt027_test_ctx VALUES ('impossible_component', SQLSTATE); END;

  BEGIN
    UPDATE public.grade_threshold_component_marks
    SET threshold_mark = 20 WHERE component_variant_id = v_variant AND grade = 'A';
  EXCEPTION WHEN OTHERS THEN INSERT INTO gt027_test_ctx VALUES ('component_order', SQLSTATE); END;

  BEGIN
    UPDATE public.grade_threshold_combination_marks
    SET threshold_mark = 100 WHERE combination_id = v_combo AND grade = 'A*';
  EXCEPTION WHEN OTHERS THEN INSERT INTO gt027_test_ctx VALUES ('combination_order', SQLSTATE); END;

  BEGIN
    INSERT INTO public.grade_threshold_combinations (
      publication_id, canonical_key, qualification_level, route_type,
      maximum_mark, weighting_basis
    ) VALUES (
      (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'publication_v1'),
      'invalid-level-route', 'as', 'staged', 100, 'raw_total'
    );
  EXCEPTION WHEN OTHERS THEN INSERT INTO gt027_test_ctx VALUES ('level_route', SQLSTATE); END;

  BEGIN
    INSERT INTO public.grade_threshold_combination_tokens (
      combination_id, token_position, raw_token, token_kind,
      resolved_component_variant_id, stage, maximum_mark
    ) VALUES (v_combo, 10, '12', 'component_variant', v_variant, 'as', 100);
  EXCEPTION WHEN OTHERS THEN INSERT INTO gt027_test_ctx VALUES ('raw_resolution', SQLSTATE); END;

  INSERT INTO public.grade_threshold_weighting_sources (
    id, subject_id, document_year, exam_series, official_document_url,
    source_checksum_sha256, source_label, review_status, reviewed_by, reviewed_at
  ) VALUES (
    extensions.uuid_generate_v4(),
    (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject'),
    2025, 'june', 'https://www.cambridgeinternational.org/2025-weighting-fixture.pdf',
    DECODE(REPEAT('55', 32), 'hex'), '2025 official fixture', 'approved', 'fixture-reviewer', NOW()
  ) RETURNING id INTO v_source;

  INSERT INTO public.grade_threshold_weighting_entries (
    weighting_source_id, raw_token, token_kind, raw_maximum, weighted_maximum,
    official_weighting_factor, source_page
  ) VALUES (v_source, '11', 'component_variant', 100, 80, 0.8, 1)
  RETURNING id INTO v_entry;

  BEGIN
    INSERT INTO public.grade_threshold_combination_tokens (
      combination_id, token_position, raw_token, token_kind,
      resolved_component_variant_id, stage, maximum_mark,
      weighting_factor, weighting_entry_id
    ) VALUES (v_combo, 10, '11', 'component_variant', v_variant, 'as', 100, 0.8, v_entry);
  EXCEPTION WHEN OTHERS THEN INSERT INTO gt027_test_ctx VALUES ('weight_year', SQLSTATE); END;

  INSERT INTO public.grade_threshold_weighting_sources (
    id, subject_id, document_year, exam_series, official_document_url,
    source_checksum_sha256, source_label, review_status, reviewed_by, reviewed_at
  ) VALUES (
    extensions.uuid_generate_v4(),
    v_other_subject,
    2026, 'june', 'https://www.cambridgeinternational.org/wrong-subj.pdf',
    DECODE(REPEAT('78', 32), 'hex'), 'wrong subject source', 'approved', 'fixture-reviewer', NOW()
  ) RETURNING id INTO v_wrong_subj_source;

  INSERT INTO public.grade_threshold_weighting_entries (
    weighting_source_id, raw_token, token_kind, raw_maximum, weighted_maximum,
    official_weighting_factor, source_page
  ) VALUES (v_wrong_subj_source, '11', 'component_variant', 100, 100, 1.0, 1)
  RETURNING id INTO v_wrong_subj_entry;

  BEGIN
    INSERT INTO public.grade_threshold_combination_tokens (
      combination_id, token_position, raw_token, token_kind,
      resolved_component_variant_id, stage, maximum_mark,
      weighting_factor, weighting_entry_id
    ) VALUES (v_combo, 10, '11', 'component_variant', v_variant, 'as', 100, 1.0, v_wrong_subj_entry);
  EXCEPTION WHEN OTHERS THEN INSERT INTO gt027_test_ctx VALUES ('weight_subject', SQLSTATE); END;

  INSERT INTO public.grade_threshold_weighting_sources (
    id, subject_id, document_year, exam_series, official_document_url,
    source_checksum_sha256, source_label, review_status, reviewed_by, reviewed_at
  ) VALUES (
    extensions.uuid_generate_v4(),
    (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject'),
    2026, 'november', 'https://www.cambridgeinternational.org/wrong-series.pdf',
    DECODE(REPEAT('79', 32), 'hex'), 'wrong series source', 'approved', 'fixture-reviewer', NOW()
  ) RETURNING id INTO v_wrong_series_source;

  INSERT INTO public.grade_threshold_weighting_entries (
    weighting_source_id, raw_token, token_kind, raw_maximum, weighted_maximum,
    official_weighting_factor, source_page
  ) VALUES (v_wrong_series_source, '11', 'component_variant', 100, 100, 1.0, 1)
  RETURNING id INTO v_wrong_series_entry;

  BEGIN
    INSERT INTO public.grade_threshold_combination_tokens (
      combination_id, token_position, raw_token, token_kind,
      resolved_component_variant_id, stage, maximum_mark,
      weighting_factor, weighting_entry_id
    ) VALUES (v_combo, 10, '11', 'component_variant', v_variant, 'as', 100, 1.0, v_wrong_series_entry);
  EXCEPTION WHEN OTHERS THEN INSERT INTO gt027_test_ctx VALUES ('weight_series', SQLSTATE); END;

  BEGIN
    INSERT INTO public.grade_threshold_combination_tokens (
      combination_id, token_position, raw_token, token_kind,
      resolved_component_variant_id, stage, maximum_mark,
      weighting_factor
    ) VALUES (v_combo, 10, '11', 'component_variant', v_variant, 'as', 100, 1.0);
  EXCEPTION WHEN OTHERS THEN INSERT INTO gt027_test_ctx VALUES ('weight_no_source', SQLSTATE); END;

  INSERT INTO public.grade_threshold_weighting_sources (
    id, subject_id, document_year, exam_series, official_document_url,
    source_checksum_sha256, source_label, review_status, reviewed_by, reviewed_at
  ) VALUES (
    extensions.uuid_generate_v4(),
    (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject'),
    2026, 'june', 'https://www.cambridgeinternational.org/2026-weighting-fixture.pdf',
    DECODE(REPEAT('66', 32), 'hex'), '2026 official rollback-only fixture',
    'approved', 'fixture-reviewer', NOW()
  ) RETURNING id INTO v_source;

  INSERT INTO public.grade_threshold_weighting_entries (
    weighting_source_id, raw_token, token_kind, raw_maximum, weighted_maximum,
    official_weighting_factor, source_page
  ) VALUES (v_source, '11', 'component_variant', 100, 100, 1.0, 1)
  RETURNING id INTO v_entry;

  INSERT INTO public.grade_threshold_weighting_entries (
    weighting_source_id, raw_token, token_kind, raw_maximum, weighted_maximum,
    official_weighting_factor, source_page
  ) VALUES (v_source, '84', 'carry_forward', 100, 80, 0.8, 2)
  RETURNING id INTO v_carry_entry;

  BEGIN
    INSERT INTO public.grade_threshold_combination_tokens (
      combination_id, token_position, raw_token, token_kind, stage, maximum_mark,
      weighting_factor, weighting_entry_id, carry_forward_mapping_status
    ) VALUES (
      '02700000-0000-4000-a000-000000000012', 10, '84', 'carry_forward', 'as', 100,
      0.9, v_carry_entry, 'unreviewed'
    );
  EXCEPTION WHEN OTHERS THEN INSERT INTO gt027_test_ctx VALUES ('forged_factor', SQLSTATE); END;

  BEGIN
    INSERT INTO public.grade_threshold_combination_tokens (
      combination_id, token_position, raw_token, token_kind, stage, maximum_mark,
      weighting_factor, weighting_entry_id, carry_forward_mapping_status
    ) VALUES (
      '02700000-0000-4000-a000-000000000012', 10, '84', 'carry_forward', 'as', 99,
      0.8, v_carry_entry, 'unreviewed'
    );
  EXCEPTION WHEN OTHERS THEN INSERT INTO gt027_test_ctx VALUES ('forged_maximum', SQLSTATE); END;

  UPDATE public.grade_threshold_combination_tokens
  SET weighting_factor = 1.0, weighting_entry_id = v_entry
  WHERE combination_id = '02700000-0000-4000-a000-000000000012'
    AND raw_token = '11';

  BEGIN
    UPDATE public.grade_threshold_weighting_entries
    SET official_weighting_factor = 0.9
    WHERE id = v_entry;
  EXCEPTION WHEN OTHERS THEN INSERT INTO gt027_test_ctx VALUES ('entry_immutable', SQLSTATE); END;
END;
$$;

SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'impossible_component'), '23514',
  '25. a component threshold above its raw maximum is rejected');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'component_order'), '23514',
  '26. impossible component grade ordering is rejected');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'combination_order'), '23514',
  '27. impossible qualification grade ordering is rejected');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'level_route'), '23514',
  '28. AS/staged and other impossible qualification-route pairings are rejected');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'raw_resolution'), '23514',
  '29. raw token cannot resolve to a different official component code');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'weight_year'), '23514',
  '30. a 2025 weighting document cannot provide 2026 token provenance');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'weight_no_source'), '23514',
  '31. a weighting factor without normalized source identity is rejected');
SELECT ok(
  (SELECT value FROM gt027_test_ctx WHERE key = 'forged_factor') = '23514'
  AND (SELECT value FROM gt027_test_ctx WHERE key = 'forged_maximum') = '23514',
  '31b. forged factor or maximum is rejected even with a valid official source entry'
);
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'entry_immutable'), '55000',
  '31c. official weighting entries are immutable after insertion');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'weight_checksum'), '23514',
  '31d. a weighting source with an invalid checksum length is rejected');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'weight_subject'), '23514',
  '31e. a weighting document from another subject cannot provide token provenance');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'weight_series'), '23514',
  '31f. a weighting document from another exam series cannot provide token provenance');

-- Same-checksum discovery uses the unique document identity as a no-op.
INSERT INTO public.grade_threshold_publications (
  import_run_id, subject_id, exam_year, exam_series, official_index_url,
  official_pdf_url, source_checksum_sha256, revision_number
)
SELECT
  (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'run'),
  (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject'),
  2026, 'june', 'https://example.test/index', 'https://example.test/same.pdf',
  DECODE(REPEAT('11', 32), 'hex'), 1
ON CONFLICT (subject_id, exam_year, exam_series, source_checksum_sha256) DO NOTHING;

SELECT is(
  (SELECT COUNT(*) FROM public.grade_threshold_publications
   WHERE subject_id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject')
     AND exam_year = 2026 AND exam_series = 'june')::BIGINT,
  1::BIGINT,
  '32. rediscovery of an existing checksum is a document-level no-op'
);

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.publish_grade_threshold_publication(
      (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'publication_v1')
    );
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO gt027_test_ctx VALUES ('authenticated_publish', SQLSTATE);
  END;
  RESET ROLE;
END;
$$;

SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'authenticated_publish'), '42501',
  '33. authenticated clients cannot invoke the publisher');

DO $$
DECLARE v_result UUID;
BEGIN
  SET LOCAL ROLE service_role;
  v_result := public.publish_grade_threshold_publication(
    (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'publication_v1')
  );
  RESET ROLE;
  INSERT INTO gt027_test_ctx VALUES ('published_v1', v_result::TEXT);
END;
$$;

SELECT is(
  (SELECT value FROM gt027_test_ctx WHERE key = 'published_v1'),
  (SELECT value FROM gt027_test_ctx WHERE key = 'publication_v1'),
  '34. service_role atomically publishes a valid staged document'
);

SET LOCAL ROLE authenticated;
SELECT ok(
  (SELECT COUNT(*) FROM public.grade_threshold_weighting_sources) = 1
  AND (SELECT COUNT(*) FROM public.grade_threshold_weighting_entries) = 1,
  '35. authenticated reads only weighting sources referenced by an active publication'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is((SELECT COUNT(*) FROM public.grade_threshold_publications)::BIGINT, 1::BIGINT,
  '36. active published catalogue is readable to anonymous users');
SELECT is((SELECT COUNT(*) FROM public.grade_threshold_combinations)::BIGINT, 3::BIGINT,
  '37. published official catalogue includes the unmapped combination');
SELECT is((SELECT COUNT(*) FROM public.published_grade_threshold_combinations)::BIGINT, 2::BIGINT,
  '38. planner view exposes only published eligible mapped combinations');
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.published_grade_threshold_combinations
    WHERE per_paper_allocation_eligible
  ),
  '39. official overall benchmarks publish while missing weights keep per-paper allocation unavailable'
);
SELECT is(
  (SELECT ceiling_average_mark FROM public.published_grade_threshold_variant_benchmarks),
  55::SMALLINT,
  '40. approved exact variants use a ceiling average'
);
SELECT is(
  (SELECT included_variants FROM public.published_grade_threshold_variant_benchmarks),
  ARRAY['11','12']::TEXT[],
  '41. derived benchmark discloses only explicitly approved variants'
);
RESET ROLE;

-- ─── 3. Route semantics, atomic rollback, and append-only revision safety ────

DO $$
DECLARE
  v_subject UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject');
  v_run UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'run');
  v_full_a UUID := (SELECT id FROM public.subject_valid_routes
    WHERE subject_id = v_subject AND route = 'full_level' AND combination_key = 'full_mech_stats');
  v_full_b UUID := (SELECT id FROM public.subject_valid_routes
    WHERE subject_id = v_subject AND route = 'full_level' AND combination_key = 'full_stats_double');
  v_staged UUID := (SELECT id FROM public.subject_valid_routes
    WHERE subject_id = v_subject AND route = 'staged' AND combination_key = 'mech_stats');
  v_pub UUID;
  v_year SMALLINT := 2030;
  v_mode TEXT;
BEGIN
  FOREACH v_mode IN ARRAY ARRAY['wrong_route','wrong_stage','missing','extra','duplicate_paper','no_marks','unreviewed_carry']
  LOOP
    v_pub := extensions.uuid_generate_v4();
    INSERT INTO public.grade_threshold_publications (
      id, import_run_id, subject_id, exam_year, exam_series,
      official_index_url, official_pdf_url, source_checksum_sha256
    ) VALUES (
      v_pub, v_run, v_subject, v_year, 'march',
      'https://example.test/' || v_mode || '/index',
      'https://example.test/' || v_mode || '.pdf',
      extensions.digest(v_mode || v_year::TEXT, 'sha256')
    );

    IF v_mode = 'wrong_route' THEN
      PERFORM pg_temp.seed_route_publication(v_pub, v_subject, v_full_a, v_full_b, 'full_level', 'valid');
    ELSIF v_mode = 'unreviewed_carry' THEN
      PERFORM pg_temp.seed_route_publication(v_pub, v_subject, v_staged, v_staged, 'staged', v_mode);
    ELSE
      PERFORM pg_temp.seed_route_publication(v_pub, v_subject, v_full_a, v_full_a, 'full_level', v_mode);
    END IF;

    BEGIN
      PERFORM public.publish_grade_threshold_publication(v_pub);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO gt027_test_ctx VALUES ('publish_' || v_mode, SQLSTATE);
    END;
    v_year := v_year + 1;
  END LOOP;

  -- A valid staged combination uses exact A2 papers plus one reviewed AS carry-forward aggregate.
  v_pub := extensions.uuid_generate_v4();
  INSERT INTO public.grade_threshold_publications (
    id, import_run_id, subject_id, exam_year, exam_series,
    official_index_url, official_pdf_url, source_checksum_sha256
  ) VALUES (
    v_pub, v_run, v_subject, 2040, 'march',
    'https://example.test/staged-valid/index', 'https://example.test/staged-valid.pdf',
    extensions.digest('staged-valid', 'sha256')
  );
  PERFORM pg_temp.seed_route_publication(v_pub, v_subject, v_staged, v_staged, 'staged', 'valid');
  PERFORM public.publish_grade_threshold_publication(v_pub);
  INSERT INTO gt027_test_ctx VALUES ('valid_staged_pub', v_pub::TEXT);
END;
$$;

SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'publish_wrong_route'), '23514',
  '42. eligible tokens for a wrong same-subject route cannot publish');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'publish_wrong_stage'), '23514',
  '43. eligible route token with the wrong stage cannot publish');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'publish_missing'), '23514',
  '44. eligible direct route with a missing paper cannot publish');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'publish_extra'), '23514',
  '45. eligible direct route with an extra paper cannot publish');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'publish_duplicate_paper'), '23514',
  '45b. eligible route with duplicate papers cannot publish');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'publish_no_marks'), '23514',
  '46. zero combination marks cannot bypass exact grade-set validation');
SELECT is((SELECT value FROM gt027_test_ctx WHERE key = 'publish_unreviewed_carry'), '23514',
  '47. staged route cannot infer an unreviewed carry-forward token meaning');
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.grade_threshold_publications
    WHERE id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'valid_staged_pub')
      AND publication_status = 'published' AND is_active
  ),
  '48. valid staged route publishes with exact A2 papers and reviewed AS carry-forward'
);

-- Failed revision publication must leave the active predecessor untouched.
DO $$
DECLARE
  v_old UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'publication_v1');
  v_new UUID := '02700000-0000-4000-a000-000000000099';
  v_subject UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject');
  v_run UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'run');
BEGIN
  INSERT INTO public.grade_threshold_publications (
    id, import_run_id, subject_id, exam_year, exam_series,
    official_index_url, official_pdf_url, source_checksum_sha256,
    revision_number, revises_publication_id
  ) VALUES (
    v_new, v_run, v_subject, 2026, 'june',
    'https://example.test/revision/index', 'https://example.test/revision.pdf',
    DECODE(REPEAT('22', 32), 'hex'), 2, v_old
  );
  PERFORM pg_temp.seed_route_publication(
    v_new, v_subject,
    (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'full_route'),
    (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'full_route'),
    'full_level', 'no_marks'
  );
  BEGIN
    PERFORM public.publish_grade_threshold_publication(v_new);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO gt027_test_ctx VALUES ('failed_revision', SQLSTATE);
  END;
END;
$$;

SELECT ok(
  (SELECT value FROM gt027_test_ctx WHERE key = 'failed_revision') = '23514'
  AND EXISTS (
    SELECT 1 FROM public.grade_threshold_publications
    WHERE id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'publication_v1')
      AND publication_status = 'published' AND is_active
  )
  AND EXISTS (
    SELECT 1 FROM public.grade_threshold_publications
    WHERE id = '02700000-0000-4000-a000-000000000099'
      AND publication_status = 'staged' AND NOT is_active
  ),
  '49. failed atomic revision publication rolls back without superseding the active document'
);

DO $$
DECLARE
  v_new UUID := '02700000-0000-4000-a000-000000000099';
  v_combination UUID;
BEGIN
  SELECT id INTO v_combination
  FROM public.grade_threshold_combinations
  WHERE publication_id = v_new AND canonical_key = 'fixture-no_marks';

  INSERT INTO public.grade_threshold_combination_marks (combination_id, grade, threshold_mark)
  VALUES
    (v_combination, 'A*', 320), (v_combination, 'A', 280),
    (v_combination, 'B', 240), (v_combination, 'C', 200),
    (v_combination, 'D', 160), (v_combination, 'E', 120);

  SET LOCAL ROLE service_role;
  PERFORM public.publish_grade_threshold_publication(v_new);
  RESET ROLE;
END;
$$;

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.grade_threshold_publications
    WHERE id = '02700000-0000-4000-a000-000000000099'
      AND revision_number = 2 AND publication_status = 'published' AND is_active
  )
  AND EXISTS (
    SELECT 1 FROM public.grade_threshold_publications
    WHERE id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'publication_v1')
      AND publication_status = 'superseded' AND NOT is_active
  )
  AND EXISTS (
    SELECT 1 FROM public.grade_threshold_component_variants
    WHERE publication_id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'publication_v1')
  ),
  '50. changed checksum publishes as an append-only revision and preserves superseded data'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.grade_threshold_publications
   WHERE subject_id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject')
     AND exam_year = 2026 AND exam_series = 'june'
     AND publication_status = 'published' AND is_active) = 1
  AND EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_grade_threshold_one_active_publication'
  ),
  '51. the active-publication invariant is backed by a unique partial index'
);

-- ─── 4. Atomic Database Bundles (RPCs) ───────────────────────────────────────

DO $$
DECLARE
  v_subject UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject');
  v_run UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'run');
  v_bundle JSONB;
  v_pub_id UUID;
BEGIN
  v_bundle := jsonb_build_object(
    'publication', jsonb_build_object(
      'import_run_id', v_run,
      'subject_id', v_subject,
      'exam_year', 2027,
      'exam_series', 'june',
      'official_index_url', 'https://example.test/2027/index',
      'official_pdf_url', 'https://example.test/2027/bundle.pdf',
      'source_checksum_sha256', repeat('33', 32),
      'revision_number', 1
    ),
    'variants', jsonb_build_array(
      jsonb_build_object(
        'component_code', '11',
        'raw_maximum_mark', 75,
        'marks', jsonb_build_array(
          jsonb_build_object('grade', 'A', 'threshold_mark', 60),
          jsonb_build_object('grade', 'B', 'threshold_mark', 50),
          jsonb_build_object('grade', 'C', 'threshold_mark', 40),
          jsonb_build_object('grade', 'D', 'threshold_mark', 30),
          jsonb_build_object('grade', 'E', 'threshold_mark', 20)
        )
      )
    ),
    'combinations', jsonb_build_array(
      jsonb_build_object(
        'canonical_key', '11',
        'qualification_level', 'as',
        'route_type', 'as_only',
        'maximum_mark', 75,
        'weighting_basis', 'weighted_total',
        'marks', jsonb_build_array(
          jsonb_build_object('grade', 'a', 'threshold_mark', 60),
          jsonb_build_object('grade', 'b', 'threshold_mark', 50),
          jsonb_build_object('grade', 'c', 'threshold_mark', 40),
          jsonb_build_object('grade', 'd', 'threshold_mark', 30),
          jsonb_build_object('grade', 'e', 'threshold_mark', 20)
        ),
        'tokens', jsonb_build_array(
          jsonb_build_object(
            'token_position', 1,
            'raw_token', '11',
            'token_kind', 'component_variant',
            'resolved_component_code', '11',
            'stage', 'as',
            'maximum_mark', 75
          )
        )
      )
    ),
    'issues', jsonb_build_array(
      jsonb_build_object(
        'import_run_id', v_run,
        'severity', 'info',
        'issue_code', 'test-bundle-info',
        'message', 'Bundle staged successfully'
      )
    ),
    'auto_publish', false
  );

  SET LOCAL ROLE service_role;
  v_pub_id := public.stage_grade_threshold_publication_bundle(v_bundle);
  RESET ROLE;

  INSERT INTO gt027_test_ctx VALUES ('bundle_pub_id', v_pub_id::TEXT);
END;
$$;

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.grade_threshold_publications
    WHERE id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'bundle_pub_id')
      AND publication_status = 'staged' AND NOT is_active
  )
  AND EXISTS (
    SELECT 1 FROM public.grade_threshold_component_variants
    WHERE publication_id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'bundle_pub_id')
      AND component_code = '11'
  )
  AND EXISTS (
    SELECT 1 FROM public.grade_threshold_combinations
    WHERE publication_id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'bundle_pub_id')
      AND canonical_key = '11'
  )
  AND EXISTS (
    SELECT 1 FROM public.grade_threshold_import_issues
    WHERE publication_id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'bundle_pub_id')
      AND issue_code = 'test-bundle-info'
  ),
  '52. stage_grade_threshold_publication_bundle creates parent and children atomically'
);

DO $$
DECLARE
  v_subject UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject');
  v_run UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'run');
  v_bundle JSONB;
BEGIN
  -- Child error: mark 80 exceeds maximum 75
  v_bundle := jsonb_build_object(
    'publication', jsonb_build_object(
      'import_run_id', v_run,
      'subject_id', v_subject,
      'exam_year', 2028,
      'exam_series', 'june',
      'official_index_url', 'https://example.test/2028/index',
      'official_pdf_url', 'https://example.test/2028/err.pdf',
      'source_checksum_sha256', repeat('44', 32),
      'revision_number', 1
    ),
    'variants', jsonb_build_array(
      jsonb_build_object(
        'component_code', '11',
        'raw_maximum_mark', 75,
        'marks', jsonb_build_array(
          jsonb_build_object('grade', 'A', 'threshold_mark', 80)
        )
      )
    )
  );

  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.stage_grade_threshold_publication_bundle(v_bundle);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO gt027_test_ctx VALUES ('bundle_child_err', SQLSTATE);
  END;
  RESET ROLE;
END;
$$;

SELECT ok(
  (SELECT value FROM gt027_test_ctx WHERE key = 'bundle_child_err') = '23514'
  AND NOT EXISTS (
    SELECT 1 FROM public.grade_threshold_publications
    WHERE source_checksum_sha256 = DECODE(REPEAT('44', 32), 'hex')
  ),
  '53. stage_grade_threshold_publication_bundle rollback on child error leaves zero rows'
);

DO $$
DECLARE
  v_subject UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject');
  v_run UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'run');
  v_prev UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'bundle_pub_id');
  v_bundle JSONB;
BEGIN
  -- Revision 2 with auto_publish: true must be rejected
  v_bundle := jsonb_build_object(
    'publication', jsonb_build_object(
      'import_run_id', v_run,
      'subject_id', v_subject,
      'exam_year', 2027,
      'exam_series', 'june',
      'official_index_url', 'https://example.test/2027/index',
      'official_pdf_url', 'https://example.test/2027/bundle.pdf',
      'source_checksum_sha256', repeat('55', 32),
      'revision_number', 2,
      'revises_publication_id', v_prev
    ),
    'auto_publish', true
  );

  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.stage_grade_threshold_publication_bundle(v_bundle);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO gt027_test_ctx VALUES ('bundle_rev2_autopublish', SQLSTATE);
  END;
  RESET ROLE;
END;
$$;

SELECT is(
  (SELECT value FROM gt027_test_ctx WHERE key = 'bundle_rev2_autopublish'),
  '23514',
  '54. stage_grade_threshold_publication_bundle rejects auto_publish = true on revision 2'
);

DO $$
DECLARE
  v_subject UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject');
  v_bundle JSONB;
  v_src_id UUID;
BEGIN
  v_bundle := jsonb_build_object(
    'subject_id', v_subject,
    'document_year', 2027,
    'exam_series', 'june',
    'official_document_url', 'https://example.test/2027/weighting.pdf',
    'source_checksum_sha256', repeat('88', 32),
    'source_label', 'Weighting Factors 2027',
    'review_status', 'unreviewed',
    'entries', jsonb_build_array(
      jsonb_build_object(
        'raw_token', '11',
        'token_kind', 'component_variant',
        'raw_maximum', 75,
        'weighted_maximum', 75,
        'official_weighting_factor', 1.0,
        'source_page', 1
      )
    )
  );

  SET LOCAL ROLE service_role;
  v_src_id := public.stage_grade_threshold_weighting_source_bundle(v_bundle);
  RESET ROLE;

  INSERT INTO gt027_test_ctx VALUES ('weighting_bundle_src_id', v_src_id::TEXT);
END;
$$;

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.grade_threshold_weighting_sources
    WHERE id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'weighting_bundle_src_id')
      AND review_status = 'unreviewed'
  )
  AND EXISTS (
    SELECT 1 FROM public.grade_threshold_weighting_entries
    WHERE weighting_source_id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'weighting_bundle_src_id')
      AND raw_token = '11'
  ),
  '55. stage_grade_threshold_weighting_source_bundle creates header and entries atomically'
);

DO $$
DECLARE
  v_subject UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject');
  v_bundle JSONB;
BEGIN
  v_bundle := jsonb_build_object(
    'subject_id', v_subject,
    'document_year', 2028,
    'exam_series', 'june',
    'official_document_url', 'https://example.test/2028/weighting-err.pdf',
    'source_checksum_sha256', repeat('99', 32),
    'source_label', 'Weighting Error 2028',
    'review_status', 'unreviewed',
    'entries', jsonb_build_array(
      jsonb_build_object(
        'raw_token', '11',
        'token_kind', 'component_variant',
        'raw_maximum', -5,
        'weighted_maximum', 75,
        'official_weighting_factor', 1.0,
        'source_page', 1
      )
    )
  );

  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.stage_grade_threshold_weighting_source_bundle(v_bundle);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO gt027_test_ctx VALUES ('weighting_bundle_err', SQLSTATE);
  END;
  RESET ROLE;
END;
$$;

SELECT ok(
  (SELECT value FROM gt027_test_ctx WHERE key = 'weighting_bundle_err') = '23514'
  AND NOT EXISTS (
    SELECT 1 FROM public.grade_threshold_weighting_sources
    WHERE source_checksum_sha256 = DECODE(REPEAT('99', 32), 'hex')
  ),
  '56. stage_grade_threshold_weighting_source_bundle rollback on invalid entry leaves zero rows'
);

DO $$
DECLARE
  v_src_id UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'weighting_bundle_src_id');
BEGIN
  SET LOCAL ROLE service_role;
  PERFORM public.approve_grade_threshold_weighting_source(v_src_id, 'qa-auditor@atlas.edu');
  RESET ROLE;
END;
$$;

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.grade_threshold_weighting_sources
    WHERE id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'weighting_bundle_src_id')
      AND review_status = 'approved'
      AND reviewed_by = 'qa-auditor@atlas.edu'
      AND reviewed_at IS NOT NULL
  ),
  '57. approve_grade_threshold_weighting_source administratively approves weighting source'
);

DO $$
DECLARE
  v_subj_id UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject');
  v_run_id  UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'run');
  v_r1_id   UUID;
  v_r2_id   UUID;
  v_r3_id   UUID;
BEGIN
  SET LOCAL ROLE service_role;

  -- 1. Create Revision 1 bundle with auto-publish
  v_r1_id := public.stage_grade_threshold_publication_bundle(jsonb_build_object(
    'publication', jsonb_build_object(
      'import_run_id', v_run_id,
      'subject_id', v_subj_id,
      'exam_year', 2025,
      'exam_series', 'november',
      'official_index_url', 'https://www.cambridgeinternational.org/pgtap-cycle',
      'official_pdf_url', 'https://www.cambridgeinternational.org/pgtap-cycle-1.pdf',
      'source_checksum_sha256', '\x7171717171717171717171717171717171717171717171717171717171717171',
      'revision_number', 1,
      'parser_version', 'v1'
    ),
    'variants', jsonb_build_array(
      jsonb_build_object(
        'component_code', '91',
        'raw_maximum_mark', 75,
        'marks', jsonb_build_array(
          jsonb_build_object('grade', 'A', 'threshold_mark', 60),
          jsonb_build_object('grade', 'B', 'threshold_mark', 50),
          jsonb_build_object('grade', 'C', 'threshold_mark', 40),
          jsonb_build_object('grade', 'D', 'threshold_mark', 30),
          jsonb_build_object('grade', 'E', 'threshold_mark', 20)
        )
      )
    ),
    'combinations', jsonb_build_array(
      jsonb_build_object(
        'canonical_key', '91',
        'qualification_level', 'as',
        'route_type', 'as_only',
        'maximum_mark', 75,
        'weighting_basis', 'weighted_total',
        'planner_eligibility', 'unreviewed',
        'marks', jsonb_build_array(
          jsonb_build_object('grade', 'a', 'threshold_mark', 60),
          jsonb_build_object('grade', 'b', 'threshold_mark', 50),
          jsonb_build_object('grade', 'c', 'threshold_mark', 40),
          jsonb_build_object('grade', 'd', 'threshold_mark', 30),
          jsonb_build_object('grade', 'e', 'threshold_mark', 20)
        ),
        'tokens', jsonb_build_array(
          jsonb_build_object(
            'token_position', 1,
            'raw_token', '91',
            'token_kind', 'component_variant',
            'resolved_component_code', '91',
            'stage', 'as',
            'maximum_mark', 75
          )
        )
      )
    ),
    'issues', '[]'::jsonb,
    'auto_publish', true
  ));

  -- 2. Stage Revision 2 (staged, revises revision 1)
  v_r2_id := public.stage_grade_threshold_publication_bundle(jsonb_build_object(
    'publication', jsonb_build_object(
      'import_run_id', v_run_id,
      'subject_id', v_subj_id,
      'exam_year', 2025,
      'exam_series', 'november',
      'official_index_url', 'https://www.cambridgeinternational.org/pgtap-cycle',
      'official_pdf_url', 'https://www.cambridgeinternational.org/pgtap-cycle-2.pdf',
      'source_checksum_sha256', '\x7272727272727272727272727272727272727272727272727272727272727272',
      'revision_number', 2,
      'revises_publication_id', v_r1_id,
      'parser_version', 'v1'
    ),
    'variants', jsonb_build_array(
      jsonb_build_object(
        'component_code', '91',
        'raw_maximum_mark', 75,
        'marks', jsonb_build_array(
          jsonb_build_object('grade', 'A', 'threshold_mark', 60),
          jsonb_build_object('grade', 'B', 'threshold_mark', 50),
          jsonb_build_object('grade', 'C', 'threshold_mark', 40),
          jsonb_build_object('grade', 'D', 'threshold_mark', 30),
          jsonb_build_object('grade', 'E', 'threshold_mark', 20)
        )
      )
    ),
    'combinations', jsonb_build_array(
      jsonb_build_object(
        'canonical_key', '91',
        'qualification_level', 'as',
        'route_type', 'as_only',
        'maximum_mark', 75,
        'weighting_basis', 'weighted_total',
        'planner_eligibility', 'unreviewed',
        'marks', jsonb_build_array(
          jsonb_build_object('grade', 'a', 'threshold_mark', 60),
          jsonb_build_object('grade', 'b', 'threshold_mark', 50),
          jsonb_build_object('grade', 'c', 'threshold_mark', 40),
          jsonb_build_object('grade', 'd', 'threshold_mark', 30),
          jsonb_build_object('grade', 'e', 'threshold_mark', 20)
        ),
        'tokens', jsonb_build_array(
          jsonb_build_object(
            'token_position', 1,
            'raw_token', '91',
            'token_kind', 'component_variant',
            'resolved_component_code', '91',
            'stage', 'as',
            'maximum_mark', 75
          )
        )
      )
    ),
    'issues', '[]'::jsonb,
    'auto_publish', false
  ));

  -- 3. Stage Revision 3 (staged, revises revision 2)
  v_r3_id := public.stage_grade_threshold_publication_bundle(jsonb_build_object(
    'publication', jsonb_build_object(
      'import_run_id', v_run_id,
      'subject_id', v_subj_id,
      'exam_year', 2025,
      'exam_series', 'november',
      'official_index_url', 'https://www.cambridgeinternational.org/pgtap-cycle',
      'official_pdf_url', 'https://www.cambridgeinternational.org/pgtap-cycle-3.pdf',
      'source_checksum_sha256', '\x7373737373737373737373737373737373737373737373737373737373737373',
      'revision_number', 3,
      'revises_publication_id', v_r2_id,
      'parser_version', 'v1'
    ),
    'variants', jsonb_build_array(
      jsonb_build_object(
        'component_code', '91',
        'raw_maximum_mark', 75,
        'marks', jsonb_build_array(
          jsonb_build_object('grade', 'A', 'threshold_mark', 60),
          jsonb_build_object('grade', 'B', 'threshold_mark', 50),
          jsonb_build_object('grade', 'C', 'threshold_mark', 40),
          jsonb_build_object('grade', 'D', 'threshold_mark', 30),
          jsonb_build_object('grade', 'E', 'threshold_mark', 20)
        )
      )
    ),
    'combinations', jsonb_build_array(
      jsonb_build_object(
        'canonical_key', '91',
        'qualification_level', 'as',
        'route_type', 'as_only',
        'maximum_mark', 75,
        'weighting_basis', 'weighted_total',
        'planner_eligibility', 'unreviewed',
        'marks', jsonb_build_array(
          jsonb_build_object('grade', 'a', 'threshold_mark', 60),
          jsonb_build_object('grade', 'b', 'threshold_mark', 50),
          jsonb_build_object('grade', 'c', 'threshold_mark', 40),
          jsonb_build_object('grade', 'd', 'threshold_mark', 30),
          jsonb_build_object('grade', 'e', 'threshold_mark', 20)
        ),
        'tokens', jsonb_build_array(
          jsonb_build_object(
            'token_position', 1,
            'raw_token', '91',
            'token_kind', 'component_variant',
            'resolved_component_code', '91',
            'stage', 'as',
            'maximum_mark', 75
          )
        )
      )
    ),
    'issues', '[]'::jsonb,
    'auto_publish', false
  ));

  -- 4. Publish revision 3 directly
  PERFORM public.publish_grade_threshold_publication(v_r3_id);

  INSERT INTO gt027_test_ctx VALUES ('cycle_r1_id', v_r1_id::TEXT);
  INSERT INTO gt027_test_ctx VALUES ('cycle_r2_id', v_r2_id::TEXT);
  INSERT INTO gt027_test_ctx VALUES ('cycle_r3_id', v_r3_id::TEXT);

  RESET ROLE;
END;
$$;

SELECT ok(
  (SELECT publication_status = 'superseded' AND is_active = FALSE FROM public.grade_threshold_publications WHERE id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'cycle_r1_id'))
  AND (SELECT publication_status = 'superseded' AND is_active = FALSE FROM public.grade_threshold_publications WHERE id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'cycle_r2_id'))
  AND (SELECT publication_status = 'published' AND is_active = TRUE FROM public.grade_threshold_publications WHERE id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'cycle_r3_id')),
  '58. publishing revision 3 supersedes active revision 1 and earlier staged revision 2, preserving lineage'
);

DO $$
DECLARE
  v_subj_id UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject');
  v_bundle JSONB;
BEGIN
  v_bundle := jsonb_build_object(
    'subject_id', v_subj_id,
    'document_year', 2026,
    'exam_series', 'november',
    'official_document_url', 'https://www.cambridgeinternational.org/fail-staging.pdf',
    'source_checksum_sha256', repeat('fa', 32),
    'source_label', 'Direct Approved Attempt',
    'review_status', 'approved',
    'entries', jsonb_build_array(
      jsonb_build_object(
        'raw_token', '11',
        'token_kind', 'component_variant',
        'raw_maximum', 75,
        'weighted_maximum', 75,
        'official_weighting_factor', 1.0,
        'source_page', 1
      )
    )
  );

  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.stage_grade_threshold_weighting_source_bundle(v_bundle);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO gt027_test_ctx VALUES ('direct_approved_err', SQLSTATE);
  END;
  RESET ROLE;
END;
$$;

SELECT ok(
  (SELECT value FROM gt027_test_ctx WHERE key = 'direct_approved_err') = '23514'
  AND NOT EXISTS (
    SELECT 1 FROM public.grade_threshold_weighting_sources
    WHERE source_checksum_sha256 = DECODE(REPEAT('fa', 32), 'hex')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.grade_threshold_weighting_entries e
    JOIN public.grade_threshold_weighting_sources s ON s.id = e.weighting_source_id
    WHERE s.source_checksum_sha256 = DECODE(REPEAT('fa', 32), 'hex')
  ),
  '59. stage_grade_threshold_weighting_source_bundle rejects direct approved staging and leaves zero rows'
);

DO $$
DECLARE
  v_subj_id UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'subject');
  v_err_occurred BOOLEAN := FALSE;
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    PERFORM public.stage_grade_threshold_weighting_source_bundle(jsonb_build_object(
      'subject_id', v_subj_id,
      'document_year', 2026,
      'exam_series', 'november',
      'official_document_url', 'https://www.cambridgeinternational.org/fail-reviewer.pdf',
      'source_checksum_sha256', '\x8989898989898989898989898989898989898989898989898989898989898989',
      'source_label', 'Direct Reviewer Attempt',
      'reviewed_by', 'qa-admin@atlas.edu',
      'entries', jsonb_build_array()
    ));
  EXCEPTION WHEN check_violation THEN
    v_err_occurred := TRUE;
  END;

  INSERT INTO gt027_test_ctx VALUES ('direct_reviewer_rejected', v_err_occurred::TEXT);
  RESET ROLE;
END;
$$;

SELECT ok(
  (SELECT value = 'true' FROM gt027_test_ctx WHERE key = 'direct_reviewer_rejected')
  AND NOT EXISTS (
    SELECT 1 FROM public.grade_threshold_weighting_sources
    WHERE source_checksum_sha256 = DECODE(REPEAT('89', 32), 'hex')
  ),
  '60. stage_grade_threshold_weighting_source_bundle rejects direct reviewer metadata staging and leaves zero rows'
);

DO $$
DECLARE
  v_src_id UUID := (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'weighting_bundle_src_id');
  v_err_occurred BOOLEAN := FALSE;
BEGIN
  SET LOCAL ROLE service_role;
  BEGIN
    -- v_src_id was already approved in test 57
    PERFORM public.approve_grade_threshold_weighting_source(v_src_id, 'second-reviewer@atlas.edu');
  EXCEPTION WHEN check_violation THEN
    v_err_occurred := TRUE;
  END;

  INSERT INTO gt027_test_ctx VALUES ('second_approval_rejected', v_err_occurred::TEXT);
  RESET ROLE;
END;
$$;

SELECT ok(
  (SELECT value = 'true' FROM gt027_test_ctx WHERE key = 'second_approval_rejected')
  AND (SELECT reviewed_by = 'qa-auditor@atlas.edu' FROM public.grade_threshold_weighting_sources WHERE id = (SELECT value::UUID FROM gt027_test_ctx WHERE key = 'weighting_bundle_src_id')),
  '61. approve_grade_threshold_weighting_source rejects approval of already-approved weighting source'
);

SELECT * FROM finish();
ROLLBACK;
