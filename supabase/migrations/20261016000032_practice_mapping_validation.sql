-- Migration 032: mandatory mappings on new/replacement practice writes.
-- Forward-only correction to the applied 031 foundation; no historical backfill.
-- Logging-only compatibility must never widen current-route readiness.
CREATE FUNCTION public.m4_logging_chapter_eligible(
  p_us public.user_subjects, p_stage TEXT, p_chapter UUID, p_paper UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN p_paper IS NULL THEN public.m4_chapter_eligible(p_us, p_stage, p_chapter)
    WHEN EXISTS (SELECT 1 FROM public.subject_paper_selections sel
                 WHERE sel.user_subject_id = (p_us).id AND sel.subject_paper_id = p_paper)
      THEN EXISTS (SELECT 1 FROM public.subject_paper_selections sel
                   WHERE sel.user_subject_id = (p_us).id AND sel.subject_paper_id = p_paper
                     AND sel.stage = p_stage)
        AND public.m4_chapter_eligible(p_us, p_stage, p_chapter, p_paper)
    ELSE EXISTS (
      SELECT 1 FROM public.chapters c
      JOIN public.subjects s ON s.id = c.subject_id
      JOIN public.subject_papers sp ON sp.id = p_paper AND sp.subject_id = c.subject_id
      WHERE c.id = p_chapter AND c.subject_id = (p_us).subject_id AND c.is_active
        AND public.m4_stage_open(p_us, p_stage)
        AND CASE sp.stage_behavior
          WHEN 'fixed_as' THEN p_stage = 'as'
          WHEN 'fixed_a2' THEN p_stage = 'a2'
          ELSE sp.default_stage = p_stage END
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

-- Both atomic mutation RPCs already call this shared resolver before any writes.
-- Missing/null/non-array IDs fail P0007; an empty/oversized array fails P0003.
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
  IF NOT FOUND OR NOT public.m4_stage_open(v_us, p_stage) THEN
    RAISE EXCEPTION 'Active confirmed enrollment and unlocked stage required' USING ERRCODE = 'P0005';
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

-- Assessment-only tightening: source-free mapped evidence must be assessed by
-- a selected paper at its actual recorded stage. Preserve legacy no-junction
-- component fallback and explicit science P3/P5 behavior in the existing helper.
-- Do not use this helper for logging, notes or confidence denominators.
CREATE FUNCTION public.m4_assessment_chapter_eligible(
  p_us public.user_subjects, p_stage TEXT, p_chapter UUID, p_paper UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT public.m4_chapter_eligible(p_us, p_stage, p_chapter, p_paper)
    AND (p_paper IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM public.chapter_papers cp WHERE cp.chapter_id = p_chapter)
      OR EXISTS (SELECT 1 FROM public.chapter_papers cp JOIN public.subject_paper_selections sel
                 ON sel.subject_paper_id = cp.subject_paper_id
                 WHERE cp.chapter_id = p_chapter AND sel.user_subject_id = (p_us).id AND sel.stage = p_stage)
      OR EXISTS (SELECT 1 FROM public.chapters c JOIN public.subject_paper_selections sel
                  ON sel.component_name = c.component
                  WHERE c.id = p_chapter AND sel.user_subject_id = (p_us).id AND sel.stage = p_stage));
$$;

-- Original 031 definition, with only the practice-item chapter predicate changed.
-- The notes/confidence denominator, full-paper branch and 35/40/25 weights are exact.
CREATE OR REPLACE FUNCTION public.compute_readiness_score(p_user_id UUID, p_subject_id UUID, p_stage TEXT)
RETURNS NUMERIC(5,2) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_chapters BIGINT; v_notes NUMERIC; v_conf NUMERIC; v_raw NUMERIC; v_max NUMERIC;
BEGIN
  IF p_user_id IS NULL OR NOT ((auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_stage IS NULL OR p_stage NOT IN ('as', 'a2', 'all') THEN
    RAISE EXCEPTION 'Invalid stage; expected as, a2 or all' USING ERRCODE = 'P0002';
  END IF;
  -- One distinct accessible chapter set drives denominator, notes and confidence.
  -- Shared chapters count once in 'all'; A2 sets are empty while A2 is locked.
  SELECT count(*), COALESCE(sum(CASE WHEN uc.notes_status = 'complete' THEN 1 ELSE 0 END), 0),
    COALESCE(sum(COALESCE(uc.confidence_level, 0)::NUMERIC / 5), 0)
  INTO v_chapters, v_notes, v_conf
  FROM public.chapters c JOIN public.user_subjects us ON us.subject_id = c.subject_id AND us.user_id = p_user_id
  LEFT JOIN public.user_chapters uc ON uc.chapter_id = c.id AND uc.user_id = p_user_id
  WHERE (p_subject_id IS NULL OR c.subject_id = p_subject_id)
    AND EXISTS (SELECT 1 FROM (VALUES ('as'::TEXT), ('a2'::TEXT)) bucket(stage)
                WHERE (p_stage = 'all' OR bucket.stage = p_stage)
                  AND public.m4_chapter_eligible(us, bucket.stage, c.id));
  IF v_chapters = 0 THEN RETURN 0.00; END IF;
  SELECT COALESCE(sum(e.raw), 0), COALESCE(sum(e.max), 0) INTO v_raw, v_max FROM (
    -- Resolve legacy component identity without guessing its recorded stage.
    SELECT pp.score_raw::BIGINT AS raw, pp.score_max::BIGINT AS max
    FROM public.past_papers pp JOIN public.user_subjects us ON us.subject_id = pp.subject_id AND us.user_id = pp.user_id
    JOIN public.subject_papers sp ON sp.subject_id = pp.subject_id
      AND sp.paper_number = CASE WHEN pp.paper_number >= 10 THEN pp.paper_number / 10 ELSE pp.paper_number END
      AND (pp.subject_paper_id IS NULL OR sp.id = pp.subject_paper_id)
    WHERE pp.user_id = p_user_id AND (p_subject_id IS NULL OR pp.subject_id = p_subject_id)
      AND (p_stage = 'all' OR pp.stage = p_stage) AND public.m4_stage_open(us, pp.stage)
      AND (pp.paper_number BETWEEN 1 AND 9 OR
           (pp.paper_number BETWEEN 11 AND 99 AND pp.paper_number % 10 BETWEEN 1 AND 9))
      AND pp.score_max > 0 AND pp.score_raw BETWEEN 0 AND pp.score_max
      AND EXISTS (SELECT 1 FROM public.subject_paper_selections sel WHERE sel.user_subject_id = us.id
                    AND sel.subject_paper_id = sp.id AND sel.stage = pp.stage)
    UNION ALL
    SELECT i.marks_obtained::BIGINT, i.marks_available::BIGINT
    FROM public.practice_session_items i JOIN public.practice_sessions ps ON ps.id = i.session_id
    JOIN public.user_subjects us ON us.subject_id = ps.subject_id AND us.user_id = ps.user_id
    WHERE ps.user_id = p_user_id AND (p_subject_id IS NULL OR ps.subject_id = p_subject_id)
      AND (p_stage = 'all' OR ps.stage = p_stage) AND public.m4_stage_open(us, ps.stage)
      AND (i.subject_paper_id IS NULL OR EXISTS (SELECT 1 FROM public.subject_paper_selections sel
            WHERE sel.user_subject_id = us.id AND sel.subject_paper_id = i.subject_paper_id AND sel.stage = ps.stage))
      AND NOT EXISTS (SELECT 1 FROM public.practice_session_chapters pc WHERE pc.item_id = i.id
                       AND NOT public.m4_assessment_chapter_eligible(us, ps.stage, pc.chapter_id, i.subject_paper_id))
  ) e;
  RETURN round((0.35 * v_notes / v_chapters + 0.25 * v_conf / v_chapters
    + 0.40 * CASE WHEN v_max > 0 THEN v_raw / v_max ELSE 0 END) * 100, 2);
END;
$$;

-- CREATE OR REPLACE retains resolver/readiness ownership and ACLs.
REVOKE ALL ON FUNCTION public.m4_logging_chapter_eligible(public.user_subjects, TEXT, UUID, UUID),
  public.m4_assessment_chapter_eligible(public.user_subjects, TEXT, UUID, UUID),
  public.resolve_practice_payload(UUID, UUID, TEXT, TEXT, DATE, SMALLINT, JSONB, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
