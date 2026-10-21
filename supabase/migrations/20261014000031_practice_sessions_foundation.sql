-- Milestone 4 database foundation. Requires the approved 000-029 baseline.
-- New forward version: never rename/rewrite an applied 030 to deploy this file.
-- Unexpected prior practice schemas require separately reviewed reconciliation.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname IN
               ('practice_sessions', 'practice_session_items', 'practice_session_chapters'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname IN
                  ('resolve_practice_payload', 'log_practice_session_atomic', 'update_practice_session_atomic',
                   'delete_practice_session', 'm4_stage_open', 'm4_chapter_eligible', 'm4_resolve_provenance',
                   'm4_write_items')) THEN
    RAISE EXCEPTION 'Unexpected existing practice schema; inspect history and prepare a forward correction';
  END IF;
  IF pg_catalog.has_table_privilege('authenticated', 'public.subject_paper_selections', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.user_subjects', 'UPDATE') THEN
    RAISE EXCEPTION 'Migration 029 permission baseline is required';
  END IF;
END;
$$;

CREATE TABLE public.practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  stage TEXT NOT NULL CHECK (stage IN ('as', 'a2')),
  session_date DATE NOT NULL CHECK (session_date >= DATE '1990-01-01'),
  title TEXT CHECK (length(title) <= 100),
  duration_mins SMALLINT CHECK (duration_mins BETWEEN 1 AND 1440),
  notes TEXT CHECK (length(notes) <= 2000),
  total_score_raw INTEGER NOT NULL CHECK (total_score_raw >= 0),
  total_score_max INTEGER NOT NULL CHECK (total_score_max BETWEEN 1 AND 10000),
  accuracy_pct NUMERIC(5,2) GENERATED ALWAYS AS
    (round(total_score_raw::NUMERIC / total_score_max * 100, 2)) STORED,
  subject_paper_id UUID REFERENCES public.subject_papers(id) ON DELETE RESTRICT,
  paper_number SMALLINT CHECK (paper_number BETWEEN 1 AND 9),
  exam_year SMALLINT CHECK (exam_year BETWEEN 1990 AND 2100),
  exam_series public.paper_session_enum,
  exam_variant SMALLINT CHECK (exam_variant BETWEEN 1 AND 9),
  source_label TEXT CHECK (length(source_label) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (total_score_raw <= total_score_max)
);
CREATE TABLE public.practice_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.practice_sessions(id) ON DELETE CASCADE,
  item_order SMALLINT NOT NULL CHECK (item_order BETWEEN 1 AND 200),
  question_label TEXT CHECK (length(question_label) <= 50),
  marks_obtained INTEGER NOT NULL CHECK (marks_obtained >= 0),
  marks_available INTEGER NOT NULL CHECK (marks_available BETWEEN 1 AND 1000),
  provenance_mode TEXT NOT NULL CHECK (provenance_mode IN ('inherit', 'override', 'none')),
  subject_paper_id UUID REFERENCES public.subject_papers(id) ON DELETE RESTRICT,
  paper_number SMALLINT CHECK (paper_number BETWEEN 1 AND 9),
  exam_year SMALLINT CHECK (exam_year BETWEEN 1990 AND 2100),
  exam_series public.paper_session_enum,
  exam_variant SMALLINT CHECK (exam_variant BETWEEN 1 AND 9),
  source_label TEXT CHECK (length(source_label) <= 120),
  notes TEXT CHECK (length(notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (marks_obtained <= marks_available),
  UNIQUE (session_id, item_order)
);
CREATE TABLE public.practice_session_chapters (
  item_id UUID NOT NULL REFERENCES public.practice_session_items(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE RESTRICT,
  PRIMARY KEY (item_id, chapter_id)
);
CREATE INDEX practice_sessions_owner_subject_date ON public.practice_sessions(user_id, subject_id, session_date DESC);
CREATE INDEX practice_sessions_component ON public.practice_sessions(subject_paper_id);
CREATE INDEX practice_items_component ON public.practice_session_items(subject_paper_id);
CREATE INDEX practice_chapters_chapter ON public.practice_session_chapters(chapter_id);

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_session_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY practice_sessions_owner_read ON public.practice_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY practice_items_owner_read ON public.practice_session_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.practice_sessions ps WHERE ps.id = session_id AND ps.user_id = auth.uid()));
CREATE POLICY practice_chapters_owner_read ON public.practice_session_chapters FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.practice_session_items i JOIN public.practice_sessions ps ON ps.id = i.session_id
                 WHERE i.id = item_id AND ps.user_id = auth.uid()));
REVOKE ALL ON public.practice_sessions, public.practice_session_items, public.practice_session_chapters
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.practice_sessions, public.practice_session_items, public.practice_session_chapters TO authenticated;
GRANT ALL ON public.practice_sessions, public.practice_session_items, public.practice_session_chapters TO service_role;

-- Private helpers share the recorded-stage contract between writes and reads.
CREATE FUNCTION public.m4_stage_open(p_us public.user_subjects, p_stage TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT COALESCE(NOT (p_us).is_archived AND (p_us).study_route::TEXT <> 'unconfirmed'
    AND (p_stage = 'as' OR (p_stage = 'a2' AND (p_us).current_stage::TEXT IN ('a2', 'full'))), FALSE);
$$;

CREATE FUNCTION public.m4_chapter_eligible(p_us public.user_subjects, p_stage TEXT, p_chapter UUID, p_paper UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chapters c JOIN public.subjects s ON s.id = c.subject_id
    LEFT JOIN public.subject_papers sp ON sp.id = p_paper AND sp.subject_id = c.subject_id
    WHERE c.id = p_chapter AND c.subject_id = (p_us).subject_id AND c.is_active
      AND public.m4_stage_open(p_us, p_stage)
      AND (c.stage::TEXT IN (p_stage, 'shared')
        OR (c.stage::TEXT = 'route_dependent' AND (
          EXISTS (SELECT 1 FROM public.chapter_papers cp JOIN public.subject_paper_selections sel
                    ON sel.subject_paper_id = cp.subject_paper_id
                  WHERE cp.chapter_id = c.id AND sel.user_subject_id = (p_us).id AND sel.stage = p_stage)
          OR EXISTS (SELECT 1 FROM public.subject_paper_selections sel
                     WHERE sel.user_subject_id = (p_us).id AND sel.component_name = c.component AND sel.stage = p_stage)))
        -- P5 assesses accessible AS foundations as well as A2 content (024).
        OR (s.code IN ('9702', '9701') AND sp.paper_number = 5 AND p_stage = 'a2' AND c.stage::TEXT = 'as'))
      AND (p_paper IS NULL OR (sp.id IS NOT NULL AND (
        (s.code IN ('9702', '9701') AND sp.paper_number = 3 AND p_stage = 'as' AND c.stage::TEXT IN ('as', 'shared'))
        OR (s.code IN ('9702', '9701') AND sp.paper_number = 5 AND p_stage = 'a2')
        OR EXISTS (SELECT 1 FROM public.chapter_papers cp WHERE cp.chapter_id = c.id AND cp.subject_paper_id = sp.id))))
  );
$$;

CREATE FUNCTION public.m4_resolve_provenance(p_us public.user_subjects, p_stage TEXT, p_bundle JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  v_key TEXT;
  v_num INTEGER;
  v_id UUID;
  v_sp public.subject_papers%ROWTYPE;
  v_selected TEXT;
  v_series public.paper_session_enum;
  v_source TEXT;
BEGIN
  IF jsonb_typeof(p_bundle) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Provenance must be an object' USING ERRCODE = 'P0007';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_bundle) LOOP
    IF v_key NOT IN ('subject_paper_id', 'paper_number', 'exam_year', 'exam_series', 'exam_variant', 'source_label') THEN
      RAISE EXCEPTION 'Unknown provenance field: %', v_key USING ERRCODE = 'P0007';
    END IF;
    IF p_bundle->v_key <> 'null'::JSONB THEN
      IF v_key IN ('paper_number', 'exam_year', 'exam_variant') THEN
        IF jsonb_typeof(p_bundle->v_key) <> 'number' THEN
          RAISE EXCEPTION 'Provenance numbers must be integers' USING ERRCODE = 'P0003';
        END IF;
        IF (p_bundle->>v_key)::NUMERIC <> trunc((p_bundle->>v_key)::NUMERIC)
          OR (p_bundle->>v_key)::NUMERIC NOT BETWEEN
            (CASE WHEN v_key = 'exam_year' THEN 1990 ELSE 1 END) AND
            (CASE WHEN v_key = 'exam_year' THEN 2100 ELSE 9 END) THEN
          RAISE EXCEPTION 'Invalid provenance number: %', v_key USING ERRCODE = 'P0003';
        END IF;
      ELSIF jsonb_typeof(p_bundle->v_key) <> 'string' THEN
        RAISE EXCEPTION 'Provenance text must be a string' USING ERRCODE = 'P0007';
      END IF;
    END IF;
  END LOOP;
  BEGIN
    v_id := (p_bundle->>'subject_paper_id')::UUID;
    v_series := (p_bundle->>'exam_series')::public.paper_session_enum;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid paper ID or examination series' USING ERRCODE = 'P0008';
  END;
  v_num := ((p_bundle->>'paper_number')::NUMERIC)::INTEGER;
  v_source := nullif(btrim(p_bundle->>'source_label'), '');
  IF length(v_source) > 120 THEN
    RAISE EXCEPTION 'Source label exceeds 120 characters' USING ERRCODE = 'P0003';
  END IF;
  IF v_id IS NOT NULL OR v_num IS NOT NULL THEN
    SELECT * INTO v_sp FROM public.subject_papers sp
      WHERE sp.subject_id = p_us.subject_id AND
        ((v_id IS NOT NULL AND sp.id = v_id) OR (v_id IS NULL AND sp.paper_number = v_num));
    IF NOT FOUND OR (v_num IS NOT NULL AND v_num <> v_sp.paper_number) THEN
      RAISE EXCEPTION 'Paper identity does not match the subject/component' USING ERRCODE = 'P0008';
    END IF;
    SELECT sel.stage INTO v_selected FROM public.subject_paper_selections sel
      WHERE sel.user_subject_id = p_us.id AND sel.subject_paper_id = v_sp.id;
    IF FOUND THEN
      IF v_selected IS DISTINCT FROM p_stage THEN
        RAISE EXCEPTION 'Selected paper stage differs from recorded stage' USING ERRCODE = 'P0008';
      END IF;
    ELSIF (v_sp.stage_behavior = 'fixed_as' AND p_stage <> 'as')
       OR (v_sp.stage_behavior = 'fixed_a2' AND p_stage <> 'a2')
       OR (v_sp.stage_behavior = 'route_dependent' AND v_sp.default_stage IS DISTINCT FROM p_stage) THEN
      RAISE EXCEPTION 'Off-route paper is incompatible with recorded stage' USING ERRCODE = 'P0008';
    END IF;
    v_id := v_sp.id;
    v_num := v_sp.paper_number;
  END IF;
  RETURN jsonb_build_object('subject_paper_id', v_id, 'paper_number', v_num,
    'exam_year', ((p_bundle->>'exam_year')::NUMERIC)::INTEGER, 'exam_series', v_series,
    'exam_variant', ((p_bundle->>'exam_variant')::NUMERIC)::INTEGER, 'source_label', v_source);
END;
$$;

-- This is the sole payload validator. Both mutation paths call it before writes.
-- Enrollment lock serializes practice validation with 028 route changes/archive.
CREATE FUNCTION public.resolve_practice_payload(p_user_id UUID, p_subject_id UUID, p_stage TEXT,
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
    v_chapters := COALESCE(v_item->'chapter_ids', '[]'::JSONB);
    IF jsonb_typeof(v_chapters) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Chapter IDs must be an array' USING ERRCODE = 'P0007';
    END IF;
    IF jsonb_array_length(v_chapters) > 200 THEN
      RAISE EXCEPTION 'Too many chapter mappings' USING ERRCODE = 'P0003';
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
        IF NOT public.m4_chapter_eligible(v_us, p_stage, v_ch::UUID, (v_effective->>'subject_paper_id')::UUID) THEN
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

-- Insertion plumbing consumes only the resolver's normalized output.
CREATE FUNCTION public.m4_write_items(p_session UUID, p_items JSONB)
RETURNS VOID LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_item JSONB; v_prov JSONB; v_id UUID;
BEGIN
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_prov := v_item->'provenance';
    INSERT INTO public.practice_session_items(session_id, item_order, question_label, marks_obtained, marks_available,
      provenance_mode, subject_paper_id, paper_number, exam_year, exam_series, exam_variant, source_label, notes)
    VALUES (p_session, (v_item->>'item_order')::SMALLINT, v_item->>'question_label',
      (v_item->>'marks_obtained')::INTEGER, (v_item->>'marks_available')::INTEGER, v_item->>'provenance_mode',
      (v_prov->>'subject_paper_id')::UUID, (v_prov->>'paper_number')::SMALLINT, (v_prov->>'exam_year')::SMALLINT,
      (v_prov->>'exam_series')::public.paper_session_enum, (v_prov->>'exam_variant')::SMALLINT,
      v_prov->>'source_label', v_item->>'notes') RETURNING id INTO v_id;
    INSERT INTO public.practice_session_chapters(item_id, chapter_id)
      SELECT v_id, value::UUID FROM jsonb_array_elements_text(v_item->'chapter_ids');
  END LOOP;
END;
$$;

CREATE FUNCTION public.log_practice_session_atomic(p_user_id UUID, p_subject_id UUID, p_stage TEXT,
  p_title TEXT, p_session_date DATE, p_duration_mins SMALLINT,
  p_session_provenance JSONB DEFAULT '{}', p_items JSONB DEFAULT '[]', p_notes TEXT DEFAULT NULL)
RETURNS public.practice_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_res JSONB; v_prov JSONB; v_row public.practice_sessions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR NOT ((auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  v_res := public.resolve_practice_payload(p_user_id, p_subject_id, p_stage, p_title, p_session_date,
    p_duration_mins, p_session_provenance, p_items, p_notes);
  v_prov := v_res->'provenance';
  INSERT INTO public.practice_sessions(user_id, subject_id, stage, title, session_date, duration_mins, notes,
    total_score_raw, total_score_max, subject_paper_id, paper_number, exam_year, exam_series, exam_variant, source_label)
  VALUES (p_user_id, p_subject_id, p_stage, nullif(btrim(p_title), ''), p_session_date, p_duration_mins,
    nullif(btrim(p_notes), ''), (v_res->>'total_raw')::INTEGER, (v_res->>'total_max')::INTEGER,
    (v_prov->>'subject_paper_id')::UUID, (v_prov->>'paper_number')::SMALLINT, (v_prov->>'exam_year')::SMALLINT,
    (v_prov->>'exam_series')::public.paper_session_enum, (v_prov->>'exam_variant')::SMALLINT, v_prov->>'source_label')
  RETURNING * INTO v_row;
  PERFORM public.m4_write_items(v_row.id, v_res->'items');
  RETURN v_row;
END;
$$;

CREATE FUNCTION public.update_practice_session_atomic(p_user_id UUID, p_session_id UUID,
  p_title TEXT, p_session_date DATE, p_duration_mins SMALLINT,
  p_session_provenance JSONB DEFAULT '{}', p_items JSONB DEFAULT '[]', p_notes TEXT DEFAULT NULL)
RETURNS public.practice_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_orig public.practice_sessions%ROWTYPE; v_row public.practice_sessions%ROWTYPE; v_res JSONB; v_prov JSONB;
BEGIN
  IF p_user_id IS NULL OR NOT ((auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  -- Read immutable identity first; acquire enrollment before session lock.
  SELECT * INTO v_orig FROM public.practice_sessions WHERE id = p_session_id AND user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Practice session not found or access denied' USING ERRCODE = 'P0005'; END IF;
  v_res := public.resolve_practice_payload(p_user_id, v_orig.subject_id, v_orig.stage, p_title, p_session_date,
    p_duration_mins, p_session_provenance, p_items, p_notes);
  PERFORM 1 FROM public.practice_sessions WHERE id = p_session_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Practice session not found or access denied' USING ERRCODE = 'P0005'; END IF;
  v_prov := v_res->'provenance';
  UPDATE public.practice_sessions SET title = nullif(btrim(p_title), ''), session_date = p_session_date,
    duration_mins = p_duration_mins, notes = nullif(btrim(p_notes), ''), updated_at = now(),
    total_score_raw = (v_res->>'total_raw')::INTEGER, total_score_max = (v_res->>'total_max')::INTEGER,
    subject_paper_id = (v_prov->>'subject_paper_id')::UUID, paper_number = (v_prov->>'paper_number')::SMALLINT,
    exam_year = (v_prov->>'exam_year')::SMALLINT, exam_series = (v_prov->>'exam_series')::public.paper_session_enum,
    exam_variant = (v_prov->>'exam_variant')::SMALLINT, source_label = v_prov->>'source_label'
  WHERE id = p_session_id RETURNING * INTO v_row;
  DELETE FROM public.practice_session_items WHERE session_id = p_session_id;
  PERFORM public.m4_write_items(p_session_id, v_res->'items');
  RETURN v_row;
END;
$$;

CREATE FUNCTION public.delete_practice_session(p_user_id UUID, p_session_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_user_id IS NULL OR NOT ((auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.practice_sessions WHERE id = p_session_id AND user_id = p_user_id;
  RETURN FOUND;
END;
$$;

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
                       AND NOT public.m4_chapter_eligible(us, ps.stage, pc.chapter_id, i.subject_paper_id))
  ) e;
  RETURN round((0.35 * v_notes / v_chapters + 0.25 * v_conf / v_chapters
    + 0.40 * CASE WHEN v_max > 0 THEN v_raw / v_max ELSE 0 END) * 100, 2);
END;
$$;
CREATE OR REPLACE FUNCTION public.compute_readiness_score(p_user_id UUID, p_subject_id UUID DEFAULT NULL)
RETURNS NUMERIC(5,2) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT public.compute_readiness_score(p_user_id, p_subject_id, 'all');
$$;

-- Revoke PostgreSQL's default PUBLIC function execution, including plumbing.
REVOKE ALL ON FUNCTION public.m4_stage_open(public.user_subjects, TEXT),
  public.m4_chapter_eligible(public.user_subjects, TEXT, UUID, UUID),
  public.m4_resolve_provenance(public.user_subjects, TEXT, JSONB),
  public.resolve_practice_payload(UUID, UUID, TEXT, TEXT, DATE, SMALLINT, JSONB, JSONB, TEXT),
  public.m4_write_items(UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.log_practice_session_atomic(UUID, UUID, TEXT, TEXT, DATE, SMALLINT, JSONB, JSONB, TEXT),
  public.update_practice_session_atomic(UUID, UUID, TEXT, DATE, SMALLINT, JSONB, JSONB, TEXT),
  public.delete_practice_session(UUID, UUID), public.compute_readiness_score(UUID, UUID, TEXT),
  public.compute_readiness_score(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_practice_session_atomic(UUID, UUID, TEXT, TEXT, DATE, SMALLINT, JSONB, JSONB, TEXT),
  public.update_practice_session_atomic(UUID, UUID, TEXT, DATE, SMALLINT, JSONB, JSONB, TEXT),
  public.delete_practice_session(UUID, UUID), public.compute_readiness_score(UUID, UUID, TEXT),
  public.compute_readiness_score(UUID, UUID) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
