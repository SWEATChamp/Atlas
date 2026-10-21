-- Migration 033: Separate practice logging access from assessment readiness eligibility.
-- Allows confirmed, non-archived AS learners to record valid A2 question practice
-- as preparation history while strictly isolating AS readiness.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'm4_logging_chapter_eligible'
  ) THEN
    RAISE EXCEPTION 'Migration 032 baseline required';
  END IF;
END;
$$;

-- 1. Helper: Logging Stage Access
CREATE OR REPLACE FUNCTION public.m4_logging_stage_open(p_us public.user_subjects, p_stage TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT COALESCE(NOT (p_us).is_archived AND (p_us).study_route::TEXT <> 'unconfirmed'
    AND p_stage IN ('as', 'a2'), FALSE);
$$;

-- 2. Update logging chapter eligibility across all three provenance branches
CREATE OR REPLACE FUNCTION public.m4_logging_chapter_eligible(
  p_us public.user_subjects, p_stage TEXT, p_chapter UUID, p_paper UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    -- Branch 1: Source-free (p_paper IS NULL)
    -- Matching-stage / shared chapters and existing selected route-dependent rules only.
    -- NO science cross-stage exception without an effective paper source.
    WHEN p_paper IS NULL THEN (
      SELECT EXISTS (
        SELECT 1 FROM public.chapters c
        WHERE c.id = p_chapter AND c.subject_id = (p_us).subject_id AND c.is_active
          AND public.m4_logging_stage_open(p_us, p_stage)
          AND (c.stage::TEXT IN (p_stage, 'shared')
            OR (c.stage::TEXT = 'route_dependent' AND (
              EXISTS (SELECT 1 FROM public.chapter_papers cp JOIN public.subject_paper_selections sel
                        ON sel.subject_paper_id = cp.subject_paper_id
                      WHERE cp.chapter_id = c.id AND sel.user_subject_id = (p_us).id AND sel.stage = p_stage)
              OR EXISTS (SELECT 1 FROM public.subject_paper_selections sel
                         WHERE sel.user_subject_id = (p_us).id AND sel.component_name = c.component AND sel.stage = p_stage))))
      )
    )
    -- Branch 2: Selected paper on user's route
    WHEN EXISTS (SELECT 1 FROM public.subject_paper_selections sel
                 WHERE sel.user_subject_id = (p_us).id AND sel.subject_paper_id = p_paper)
      THEN EXISTS (SELECT 1 FROM public.subject_paper_selections sel
                   WHERE sel.user_subject_id = (p_us).id AND sel.subject_paper_id = p_paper
                     AND sel.stage = p_stage)
        AND public.m4_logging_stage_open(p_us, p_stage)
        AND EXISTS (
          SELECT 1 FROM public.chapters c
          JOIN public.subjects s ON s.id = c.subject_id
          JOIN public.subject_papers sp ON sp.id = p_paper AND sp.subject_id = c.subject_id
          WHERE c.id = p_chapter AND c.subject_id = (p_us).subject_id AND c.is_active
            -- BOTH chapter-stage compatibility AND paper compatibility must pass:
            AND (c.stage::TEXT IN (p_stage, 'shared')
              OR (c.stage::TEXT = 'route_dependent' AND (
                EXISTS (SELECT 1 FROM public.chapter_papers cp WHERE cp.chapter_id = c.id AND cp.subject_paper_id = sp.id)
                OR EXISTS (SELECT 1 FROM public.subject_paper_selections sel WHERE sel.user_subject_id = (p_us).id AND sel.subject_paper_id = p_paper AND sel.component_name = c.component)
              ))
              OR (s.code IN ('9702', '9701') AND sp.paper_number = 5 AND p_stage = 'a2' AND c.stage::TEXT = 'as'))
            AND (EXISTS (SELECT 1 FROM public.chapter_papers cp WHERE cp.chapter_id = c.id AND cp.subject_paper_id = sp.id)
              OR (s.code IN ('9702', '9701') AND sp.paper_number = 3 AND p_stage = 'as' AND c.stage::TEXT IN ('as', 'shared'))
              OR (s.code IN ('9702', '9701') AND sp.paper_number = 5 AND p_stage = 'a2'))
        )
    -- Branch 3: Off-route paper
    ELSE EXISTS (
      SELECT 1 FROM public.chapters c
      JOIN public.subjects s ON s.id = c.subject_id
      JOIN public.subject_papers sp ON sp.id = p_paper AND sp.subject_id = c.subject_id
      WHERE c.id = p_chapter AND c.subject_id = (p_us).subject_id AND c.is_active
        AND public.m4_logging_stage_open(p_us, p_stage)
        AND CASE sp.stage_behavior
          WHEN 'fixed_as' THEN p_stage = 'as'
          WHEN 'fixed_a2' THEN p_stage = 'a2'
          ELSE sp.default_stage = p_stage END
        -- BOTH chapter-stage compatibility AND paper compatibility must pass:
        AND (c.stage::TEXT IN (p_stage, 'shared')
          OR (c.stage::TEXT = 'route_dependent' AND EXISTS (
            SELECT 1 FROM public.chapter_papers cp WHERE cp.chapter_id = c.id AND cp.subject_paper_id = sp.id))
          OR (s.code IN ('9702', '9701') AND sp.paper_number = 5 AND p_stage = 'a2' AND c.stage::TEXT = 'as'))
        AND (EXISTS (SELECT 1 FROM public.chapter_papers cp WHERE cp.chapter_id = c.id AND cp.subject_paper_id = sp.id)
          OR (s.code IN ('9702', '9701') AND sp.paper_number = 3 AND p_stage = 'as' AND c.stage::TEXT IN ('as', 'shared'))
          OR (s.code IN ('9702', '9701') AND sp.paper_number = 5 AND p_stage = 'a2'))
    )
  END;
$$;

-- 3. Update resolver to check m4_logging_stage_open
CREATE OR REPLACE FUNCTION public.resolve_practice_payload(p_user_id UUID, p_subject_id UUID, p_stage TEXT,
  p_title TEXT, p_date DATE, p_duration SMALLINT, p_provenance JSONB, p_items JSONB, p_notes TEXT)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  v_us public.user_subjects%ROWTYPE;
  v_parent JSONB;
  v_effective JSONB;
  v_item JSONB;
  v_result JSONB := '[]';
  v_chapters JSONB;
  v_ch TEXT;
  v_key TEXT;
  v_mode TEXT;
  v_order INTEGER := 0;
  v_raw INTEGER;
  v_max INTEGER;
  v_total_raw BIGINT := 0;
  v_total_max BIGINT := 0;
BEGIN
  IF p_stage IS NULL OR p_stage NOT IN ('as', 'a2') THEN
    RAISE EXCEPTION 'Recorded stage must be as or a2' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_us FROM public.user_subjects us
    WHERE us.user_id = p_user_id AND us.subject_id = p_subject_id FOR SHARE;
  IF NOT FOUND OR NOT public.m4_logging_stage_open(v_us, p_stage) THEN
    RAISE EXCEPTION 'Active confirmed enrollment required' USING ERRCODE = 'P0005';
  END IF;
  IF p_date IS NULL OR p_date < DATE '1990-01-01' OR p_date > public.get_user_local_date(p_user_id)
    OR length(p_title) > 100 OR length(p_notes) > 2000
    OR (p_duration IS NOT NULL AND p_duration NOT BETWEEN 1 AND 1440) THEN
    RAISE EXCEPTION 'Invalid session date, duration or text length' USING ERRCODE = 'P0003';
  END IF;
  v_parent := public.m4_resolve_provenance(v_us, p_stage, p_provenance);
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Items must be a nonempty array' USING ERRCODE = 'P0007';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Items must contain 1 to 200 entries' USING ERRCODE = 'P0003';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_order := v_order + 1;
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Each item must be an object' USING ERRCODE = 'P0007';
    END IF;
    FOR v_key IN SELECT jsonb_object_keys(v_item) LOOP
      IF v_key NOT IN ('item_order', 'marks_obtained', 'marks_available', 'question_label', 'notes',
        'provenance_mode', 'provenance', 'chapter_ids') THEN
        RAISE EXCEPTION 'Unknown item field: %', v_key USING ERRCODE = 'P0007';
      END IF;
    END LOOP;
    FOREACH v_key IN ARRAY ARRAY['item_order', 'marks_obtained', 'marks_available'] LOOP
      IF jsonb_typeof(v_item->v_key) IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Item order and marks must be integers' USING ERRCODE = 'P0003';
      END IF;
      IF (v_item->>v_key)::NUMERIC <> trunc((v_item->>v_key)::NUMERIC)
        OR (v_item->>v_key)::NUMERIC NOT BETWEEN 0 AND 1000 THEN
        RAISE EXCEPTION 'Invalid item order or marks bounds' USING ERRCODE = 'P0003';
      END IF;
    END LOOP;
    v_raw := ((v_item->>'marks_obtained')::NUMERIC)::INTEGER;
    v_max := ((v_item->>'marks_available')::NUMERIC)::INTEGER;
    IF ((v_item->>'item_order')::NUMERIC)::INTEGER <> v_order OR v_max = 0 OR v_raw > v_max THEN
      RAISE EXCEPTION 'Invalid item order or marks bounds' USING ERRCODE = 'P0003';
    END IF;
    FOREACH v_key IN ARRAY ARRAY['question_label', 'notes'] LOOP
      IF v_item ? v_key AND jsonb_typeof(v_item->v_key) NOT IN ('null', 'string') THEN
        RAISE EXCEPTION 'Item label/notes must be text' USING ERRCODE = 'P0007';
      END IF;
    END LOOP;
    IF length(v_item->>'question_label') > 50 OR length(v_item->>'notes') > 1000 THEN
      RAISE EXCEPTION 'Item label/notes exceeds length limit' USING ERRCODE = 'P0003';
    END IF;
    v_mode := v_item->>'provenance_mode';
    IF v_mode = 'inherit' THEN
      IF v_item ? 'provenance' OR NOT EXISTS (SELECT 1 FROM jsonb_each(v_parent) e WHERE e.value <> 'null'::JSONB) THEN
        RAISE EXCEPTION 'Inherit requires nonempty parent and no child provenance' USING ERRCODE = 'P0002';
      END IF;
      v_effective := v_parent;
    ELSIF v_mode = 'override' THEN
      v_effective := public.m4_resolve_provenance(v_us, p_stage, v_item->'provenance');
      IF NOT EXISTS (SELECT 1 FROM jsonb_each(v_effective) e WHERE e.value <> 'null'::JSONB) THEN
        RAISE EXCEPTION 'Override requires nonempty provenance' USING ERRCODE = 'P0002';
      END IF;
    ELSIF v_mode = 'none' THEN
      IF v_item ? 'provenance' THEN
        IF jsonb_typeof(v_item->'provenance') IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'None provenance must be an object' USING ERRCODE = 'P0007';
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_item->'provenance') k WHERE k <> 'source_label') THEN
          RAISE EXCEPTION 'None forbids examination provenance' USING ERRCODE = 'P0002';
        END IF;
      END IF;
      v_effective := public.m4_resolve_provenance(v_us, p_stage, COALESCE(v_item->'provenance', '{}'::JSONB));
    ELSE
      RAISE EXCEPTION 'Explicit provenance mode required' USING ERRCODE = 'P0002';
    END IF;
    v_chapters := v_item->'chapter_ids';
    IF jsonb_typeof(v_chapters) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Chapter IDs must be an array' USING ERRCODE = 'P0007';
    END IF;
    IF jsonb_array_length(v_chapters) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'Each question requires 1 to 200 chapter mappings' USING ERRCODE = 'P0003';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_chapters) e WHERE jsonb_typeof(e.value) <> 'string') THEN
      RAISE EXCEPTION 'Chapter IDs must be UUID strings' USING ERRCODE = 'P0006';
    END IF;
    BEGIN
      IF (SELECT count(*) FROM jsonb_array_elements_text(v_chapters)) <>
         (SELECT count(DISTINCT value::UUID) FROM jsonb_array_elements_text(v_chapters)) THEN
        RAISE EXCEPTION 'Duplicate chapter mappings' USING ERRCODE = 'P0006';
      END IF;
      FOR v_ch IN SELECT value FROM jsonb_array_elements_text(v_chapters) LOOP
        IF NOT public.m4_logging_chapter_eligible(v_us, p_stage, v_ch::UUID, (v_effective->>'subject_paper_id')::UUID) THEN
          RAISE EXCEPTION 'Chapter is not accessible for recorded stage/component' USING ERRCODE = 'P0006';
        END IF;
      END LOOP;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid chapter UUID' USING ERRCODE = 'P0006';
    END;
    v_total_raw := v_total_raw + v_raw;
    v_total_max := v_total_max + v_max;
    v_result := v_result || jsonb_build_array(jsonb_build_object('item_order', v_order,
      'marks_obtained', v_raw, 'marks_available', v_max, 'provenance_mode', v_mode,
      'question_label', nullif(btrim(v_item->>'question_label'), ''), 'notes', nullif(btrim(v_item->>'notes'), ''),
      'provenance', v_effective, 'chapter_ids', v_chapters));
  END LOOP;
  IF v_total_max > 10000 THEN
    RAISE EXCEPTION 'Session total marks cannot exceed 10000' USING ERRCODE = 'P0003';
  END IF;
  RETURN jsonb_build_object('provenance', v_parent, 'items', v_result, 'total_raw', v_total_raw, 'total_max', v_total_max);
END;
$$;

-- 4. Permissions & Cache Reload
-- Private helpers deny direct execution from all client and administrative roles.
REVOKE ALL ON FUNCTION public.m4_logging_stage_open(public.user_subjects, TEXT),
  public.m4_logging_chapter_eligible(public.user_subjects, TEXT, UUID, UUID),
  public.resolve_practice_payload(UUID, UUID, TEXT, TEXT, DATE, SMALLINT, JSONB, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

