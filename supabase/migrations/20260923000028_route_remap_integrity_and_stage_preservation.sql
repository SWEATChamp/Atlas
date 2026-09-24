-- ============================================================
-- MIGRATION 028: Route remap integrity and stage preservation
--
-- 1. configure_subject_route:
--    Preserves current_stage = 'a2', a2_unlocked_at, and a2_unlock_method
--    when an already staged/A2 enrollment reconfigures its staged route
--    or updates its paper combination.
--
-- 2. transition_to_a2:
--    Atomically handles AS-only to Staged/A2 conversions:
--    - Fixed subjects (9702, 9701, 9618) automatically receive their
--      canonical staged paper set.
--    - Maths 9709 p1_m1 automatically resolves to mech_stats.
--    - Maths 9709 p1_s1 automatically resolves to stats_mech.
--    - Maths 9709 p1_p2 is blocked unless the user explicitly provides
--      a compatible staged paper combination.
--    - Further Maths 9231 fp1_fm resolves to fm_fps, fp1_fps to fps_fm.
--    - Supports optional p_paper_selections parameter to allow explicit
--      staged paper selection during transition.
--    - Guarantees an AS-only student is NEVER converted to staged/A2
--      while retaining an AS-only paper set.
--    - Atomic rollback: failure in any step rolls back the entire transition.
-- ============================================================

-- ─── 1. Update configure_subject_route ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.configure_subject_route(
  p_user_id          UUID,
  p_user_subject_id  UUID,
  p_route            public.study_route_enum,
  p_paper_selections JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_us                   public.user_subjects%ROWTYPE;
  v_new_stage            public.subject_stage_enum;
  v_subject_id           UUID;
  v_subj_code            TEXT;
  v_has_canonical_routes BOOLEAN;
  v_sel                  JSONB;
  v_comp                 TEXT;
  v_sel_stage            TEXT;
  v_paper_num            SMALLINT;
  v_sp_id                UUID;
  v_matching_route_id    UUID;
  v_matching_route_count INTEGER;
  v_selections_count     INTEGER;
  v_is_fixed_route       BOOLEAN;
BEGIN
  -- Trusted caller guard
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_route = 'unconfirmed' THEN
    RAISE EXCEPTION 'Cannot set study_route to unconfirmed' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_us
  FROM   public.user_subjects
  WHERE  id      = p_user_subject_id
    AND  user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found or not owned' USING ERRCODE = '42501';
  END IF;

  v_subject_id := v_us.subject_id;

  SELECT code INTO v_subj_code
  FROM   public.subjects
  WHERE  id = v_subject_id;

  SELECT EXISTS (
    SELECT 1 FROM public.subject_valid_routes
    WHERE subject_id = v_subject_id
  ) INTO v_has_canonical_routes;

  -- Stage preservation: If already staged and in A2, staying in staged preserves A2 stage and unlock metadata
  IF p_route = 'staged' AND v_us.study_route = 'staged' AND v_us.current_stage::TEXT = 'a2' THEN
    v_new_stage := 'a2'::public.subject_stage_enum;
  ELSE
    v_new_stage := CASE p_route
      WHEN 'as_only'    THEN 'as'::public.subject_stage_enum
      WHEN 'staged'     THEN 'as'::public.subject_stage_enum
      WHEN 'full_level' THEN 'full'::public.subject_stage_enum
    END;
  END IF;

  v_is_fixed_route := (v_subj_code IN ('9702', '9701', '9618'));

  -- Temporary table to hold resolved paper selections for validation and insertion
  CREATE TEMP TABLE IF NOT EXISTS temp_route_selections (
    component_name   TEXT NOT NULL,
    paper_number     SMALLINT NOT NULL,
    stage            TEXT NOT NULL,
    subject_paper_id UUID
  ) ON COMMIT DROP;
  TRUNCATE TABLE temp_route_selections;

  -- Handle paper selections for catalogued subjects
  IF v_has_canonical_routes THEN
    IF v_is_fixed_route AND (p_paper_selections IS NULL OR jsonb_array_length(p_paper_selections) = 0) THEN
      -- Automatically populate canonical route papers for fixed-route subject
      INSERT INTO temp_route_selections (component_name, paper_number, stage, subject_paper_id)
      SELECT sp.name, sp.paper_number, srp.stage, sp.id
      FROM   public.subject_valid_routes svr
      JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
      JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
      WHERE  svr.subject_id = v_subject_id
        AND  svr.route = p_route;
    ELSE
      -- Resolve and validate submitted paper selections
      v_selections_count := COALESCE(jsonb_array_length(p_paper_selections), 0);
      IF v_selections_count = 0 THEN
        RAISE EXCEPTION 'Paper selections must be provided for %', v_subj_code
          USING ERRCODE = 'P0003';
      END IF;

      FOR v_sel IN SELECT * FROM jsonb_array_elements(p_paper_selections) LOOP
        v_comp      := v_sel->>'component_name';
        v_sel_stage := v_sel->>'stage';
        v_paper_num := (v_sel->>'paper_number')::SMALLINT;

        IF v_sel_stage NOT IN ('as', 'a2') THEN
          RAISE EXCEPTION 'Paper selection stage must be ''as'' or ''a2'', got: %', v_sel_stage
            USING ERRCODE = 'P0003';
        END IF;

        IF p_route = 'as_only' AND v_sel_stage = 'a2' THEN
          RAISE EXCEPTION 'as_only route cannot have A2 paper selections'
            USING ERRCODE = 'P0003';
        END IF;

        -- Resolve subject_paper_id
        SELECT id, name, paper_number
        INTO   v_sp_id, v_comp, v_paper_num
        FROM   public.subject_papers
        WHERE  subject_id = v_subject_id
          AND  (
            (v_paper_num IS NOT NULL AND paper_number = v_paper_num)
            OR name ILIKE v_comp || '%'
            OR v_comp ILIKE name || '%'
          )
        LIMIT 1;

        IF v_sp_id IS NULL THEN
          RAISE EXCEPTION 'Paper "%" (num: %) does not belong to subject %', v_comp, v_paper_num, v_subject_id
            USING ERRCODE = 'P0003';
        END IF;

        -- Check duplicate paper within submission
        IF EXISTS (SELECT 1 FROM temp_route_selections WHERE subject_paper_id = v_sp_id) THEN
          RAISE EXCEPTION 'Duplicate paper selection: %', v_comp
            USING ERRCODE = 'P0003';
        END IF;

        INSERT INTO temp_route_selections (component_name, paper_number, stage, subject_paper_id)
        VALUES (v_comp, v_paper_num, v_sel_stage, v_sp_id);
      END LOOP;

      -- Validate that the resolved paper set EXACTLY matches one canonical combination in subject_valid_routes
      SELECT COUNT(svr.id)
      INTO   v_matching_route_count
      FROM   public.subject_valid_routes svr
      WHERE  svr.subject_id = v_subject_id
        AND  svr.route = p_route
        -- All route papers are present in submitted selections
        AND NOT EXISTS (
          SELECT 1 FROM public.subject_route_papers srp
          WHERE srp.route_id = svr.id
            AND NOT EXISTS (
              SELECT 1 FROM temp_route_selections trs
              WHERE trs.subject_paper_id = srp.subject_paper_id
                AND trs.stage = srp.stage
            )
        )
        -- No extra submitted selections outside this route
        AND NOT EXISTS (
          SELECT 1 FROM temp_route_selections trs
          WHERE NOT EXISTS (
            SELECT 1 FROM public.subject_route_papers srp
            WHERE srp.route_id = svr.id
              AND srp.subject_paper_id = trs.subject_paper_id
              AND srp.stage = trs.stage
          )
        );

      IF v_matching_route_count != 1 THEN
        RAISE EXCEPTION 'Invalid paper selection combination for % route %', v_subj_code, p_route
          USING ERRCODE = 'P0003';
      END IF;
    END IF;
  ELSE
    -- Unsupported or custom subject fallback
    FOR v_sel IN SELECT * FROM jsonb_array_elements(p_paper_selections) LOOP
      v_comp      := v_sel->>'component_name';
      v_sel_stage := v_sel->>'stage';
      v_paper_num := COALESCE((v_sel->>'paper_number')::SMALLINT, 1);

      IF v_sel_stage NOT IN ('as', 'a2') THEN
        RAISE EXCEPTION 'Paper selection stage must be ''as'' or ''a2'', got: %', v_sel_stage
          USING ERRCODE = 'P0003';
      END IF;

      IF p_route = 'as_only' AND v_sel_stage = 'a2' THEN
        RAISE EXCEPTION 'as_only route cannot have A2 paper selections'
          USING ERRCODE = 'P0003';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.chapters WHERE subject_id = v_subject_id AND component = v_comp
      ) AND NOT EXISTS (
        SELECT 1 FROM public.subject_papers WHERE subject_id = v_subject_id AND (name ILIKE v_comp || '%' OR v_comp ILIKE name || '%')
      ) THEN
        RAISE EXCEPTION 'Component "%" does not belong to subject %', v_comp, v_subject_id
          USING ERRCODE = 'P0003';
      END IF;

      INSERT INTO temp_route_selections (component_name, paper_number, stage, subject_paper_id)
      VALUES (v_comp, v_paper_num, v_sel_stage, NULL);
    END LOOP;
  END IF;

  -- ── Update user_subjects route and stage ─────────────────────────────────
  UPDATE public.user_subjects
  SET
    study_route      = p_route,
    current_stage    = v_new_stage,
    a2_unlocked_at   = CASE WHEN v_new_stage::TEXT = 'a2' THEN a2_unlocked_at ELSE NULL END,
    a2_unlock_method = CASE WHEN v_new_stage::TEXT = 'a2' THEN a2_unlock_method ELSE NULL END,
    updated_at       = NOW()
  WHERE id = p_user_subject_id;

  -- ── Replace Paper Selections with validated temporary selections ─────────
  DELETE FROM public.subject_paper_selections
  WHERE  user_subject_id = p_user_subject_id;

  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
  SELECT p_user_subject_id, component_name, paper_number, stage, subject_paper_id
  FROM   temp_route_selections;

  -- ── Auto-populate user_chapters for newly accessible active chapters ──────
  INSERT INTO public.user_chapters (user_id, chapter_id, notes_status)
  SELECT p_user_id, c.id, 'none'
  FROM   public.chapters c
  WHERE  c.subject_id = v_subject_id
    AND  c.is_active = TRUE
    AND  public.user_can_access_chapter(p_user_id, c.id)
  ON CONFLICT (user_id, chapter_id) DO NOTHING;

  -- ── Cancel inaccessible missions ─────────────────────────────────────────
  PERFORM public.cancel_inaccessible_missions(p_user_id, p_user_subject_id);
END;
$$;

COMMENT ON FUNCTION public.configure_subject_route(UUID, UUID, public.study_route_enum, JSONB) IS
  'Configures study route and paper selections with stage preservation for already-staged A2 students.';

REVOKE ALL ON FUNCTION public.configure_subject_route(UUID, UUID, public.study_route_enum, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.configure_subject_route(UUID, UUID, public.study_route_enum, JSONB) TO authenticated, service_role;


-- ─── 2. Update transition_to_a2 ──────────────────────────────────────────────
-- Drop old 9-argument signature to prevent function overload ambiguity in PostgREST
DROP FUNCTION IF EXISTS public.transition_to_a2(
  UUID,
  UUID,
  public.a2_unlock_method_enum,
  public.result_type_enum,
  SMALLINT,
  SMALLINT,
  public.paper_session_enum,
  SMALLINT,
  BOOLEAN
);

CREATE OR REPLACE FUNCTION public.transition_to_a2(
  p_user_id          UUID,
  p_user_subject_id  UUID,
  p_unlock_method    public.a2_unlock_method_enum,
  p_result_type      public.result_type_enum   DEFAULT NULL,
  p_score_obtained   SMALLINT                  DEFAULT NULL,
  p_score_maximum    SMALLINT                  DEFAULT NULL,
  p_exam_series      public.paper_session_enum DEFAULT NULL,
  p_exam_year        SMALLINT                  DEFAULT NULL,
  p_carry_forward    BOOLEAN                   DEFAULT FALSE,
  p_paper_selections JSONB                     DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_us                   public.user_subjects%ROWTYPE;
  v_has_result           BOOLEAN;
  v_result_partial       BOOLEAN;
  v_subj_code            TEXT;
  v_has_canonical_routes BOOLEAN;
  v_current_combo_key    TEXT;
  v_target_combo_key     TEXT;
  v_matching_route_count INTEGER;
  v_sel                  JSONB;
  v_comp                 TEXT;
  v_sel_stage            TEXT;
  v_paper_num            SMALLINT;
  v_sp_id                UUID;
  v_needs_paper_update   BOOLEAN := FALSE;
BEGIN
  -- Trusted caller guard
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_us
  FROM   public.user_subjects
  WHERE  id      = p_user_subject_id
    AND  user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found or not owned' USING ERRCODE = '42501';
  END IF;

  IF v_us.current_stage::TEXT IN ('a2', 'full') THEN
    RAISE EXCEPTION 'Already in A2 or full level' USING ERRCODE = 'P0001';
  END IF;

  v_has_result := (p_result_type IS NOT NULL);
  v_result_partial := (
    (p_result_type IS NOT NULL)::INT +
    (p_score_obtained IS NOT NULL)::INT +
    (p_score_maximum IS NOT NULL)::INT +
    (p_exam_series IS NOT NULL)::INT +
    (p_exam_year IS NOT NULL)::INT
  ) NOT IN (0, 5);

  IF v_result_partial THEN
    RAISE EXCEPTION 'All result fields (result_type, score_obtained, score_maximum, exam_series, exam_year) must be provided together'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_unlock_method = 'normal_transition' THEN
    IF v_us.study_route != 'staged' OR v_us.current_stage::TEXT != 'as' THEN
      RAISE EXCEPTION 'normal_transition requires a staged AS enrollment' USING ERRCODE = 'P0001';
    END IF;
    IF NOT v_has_result THEN
      RAISE EXCEPTION 'normal_transition requires an AS examination result' USING ERRCODE = 'P0002';
    END IF;
  ELSIF p_unlock_method = 'manual' THEN
    IF v_us.current_stage::TEXT != 'as' THEN
      RAISE EXCEPTION 'manual unlock requires current_stage=''as''' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_has_result THEN
    IF p_score_obtained > p_score_maximum THEN
      RAISE EXCEPTION 'score_obtained (%) cannot exceed score_maximum (%)', p_score_obtained, p_score_maximum
        USING ERRCODE = 'P0002';
    END IF;
    IF p_carry_forward AND p_result_type != 'actual' THEN
      RAISE EXCEPTION 'carry_forward can only be TRUE for actual results' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.subject_stage_results (
      user_subject_id, stage, result_type, score_obtained, score_maximum,
      exam_series, exam_year, carry_forward
    )
    VALUES (
      p_user_subject_id, 'as', p_result_type, p_score_obtained, p_score_maximum,
      p_exam_series, p_exam_year, p_carry_forward
    )
    ON CONFLICT (user_subject_id, stage, result_type, exam_series, exam_year) DO UPDATE
      SET score_obtained = EXCLUDED.score_obtained,
          score_maximum  = EXCLUDED.score_maximum,
          carry_forward  = EXCLUDED.carry_forward,
          updated_at     = NOW();
  END IF;

  -- ── Handle Paper Selections Resolution & Validation ───────────────────────
  SELECT code INTO v_subj_code
  FROM   public.subjects
  WHERE  id = v_us.subject_id;

  SELECT EXISTS (
    SELECT 1 FROM public.subject_valid_routes
    WHERE subject_id = v_us.subject_id AND route = 'as_only'
  ) AND EXISTS (
    SELECT 1 FROM public.subject_valid_routes
    WHERE subject_id = v_us.subject_id AND route = 'staged'
  ) INTO v_has_canonical_routes;

  CREATE TEMP TABLE IF NOT EXISTS temp_a2_route_selections (
    component_name   TEXT NOT NULL,
    paper_number     SMALLINT NOT NULL,
    stage            TEXT NOT NULL,
    subject_paper_id UUID
  ) ON COMMIT DROP;
  TRUNCATE TABLE temp_a2_route_selections;

  -- Reject paper-selection payloads from an already-staged enrollment
  IF v_us.study_route != 'as_only' AND (p_paper_selections IS NOT NULL AND jsonb_array_length(p_paper_selections) > 0) THEN
    RAISE EXCEPTION 'Cannot specify paper selections during A2 transition for route %; use configure_subject_route instead', v_us.study_route
      USING ERRCODE = 'P0001';
  END IF;

  IF v_us.study_route = 'as_only' THEN
    IF NOT v_has_canonical_routes THEN
      IF p_paper_selections IS NOT NULL AND jsonb_array_length(p_paper_selections) > 0 THEN
        RAISE EXCEPTION 'Cannot specify paper selections during A2 transition for subject % without canonical staged routes', COALESCE(v_subj_code, v_us.subject_id::text)
          USING ERRCODE = 'P0003';
      END IF;
      -- Omitted or empty selections: preserve existing paper selections
      v_needs_paper_update := FALSE;
    ELSE
      v_needs_paper_update := TRUE;

      -- Identify current AS combination key from subject_paper_selections
      SELECT svr.combination_key
      INTO   v_current_combo_key
    FROM   public.subject_valid_routes svr
    WHERE  svr.subject_id = v_us.subject_id
      AND  svr.route = 'as_only'
      AND NOT EXISTS (
        SELECT 1 FROM public.subject_route_papers srp
        WHERE srp.route_id = svr.id
          AND NOT EXISTS (
            SELECT 1 FROM public.subject_paper_selections sps
            WHERE sps.user_subject_id = p_user_subject_id
              AND sps.subject_paper_id = srp.subject_paper_id
              AND sps.stage = srp.stage
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.subject_paper_selections sps
        WHERE sps.user_subject_id = p_user_subject_id
          AND NOT EXISTS (
            SELECT 1 FROM public.subject_route_papers srp
            WHERE srp.route_id = svr.id
              AND srp.subject_paper_id = sps.subject_paper_id
              AND srp.stage = sps.stage
          )
      );

    IF p_paper_selections IS NOT NULL AND jsonb_array_length(p_paper_selections) > 0 THEN
      -- Validate and resolve explicitly provided staged paper selections
      FOR v_sel IN SELECT * FROM jsonb_array_elements(p_paper_selections) LOOP
        v_comp      := v_sel->>'component_name';
        v_sel_stage := v_sel->>'stage';
        v_paper_num := (v_sel->>'paper_number')::SMALLINT;

        IF v_sel_stage NOT IN ('as', 'a2') THEN
          RAISE EXCEPTION 'Paper selection stage must be ''as'' or ''a2'', got: %', v_sel_stage
            USING ERRCODE = 'P0003';
        END IF;

        SELECT id, name, paper_number
        INTO   v_sp_id, v_comp, v_paper_num
        FROM   public.subject_papers
        WHERE  subject_id = v_us.subject_id
          AND  (
            (v_paper_num IS NOT NULL AND paper_number = v_paper_num)
            OR name ILIKE v_comp || '%'
            OR v_comp ILIKE name || '%'
          )
        LIMIT 1;

        IF v_sp_id IS NULL THEN
          RAISE EXCEPTION 'Paper "%" (num: %) does not belong to subject %', v_comp, v_paper_num, v_us.subject_id
            USING ERRCODE = 'P0003';
        END IF;

        IF EXISTS (SELECT 1 FROM temp_a2_route_selections WHERE subject_paper_id = v_sp_id) THEN
          RAISE EXCEPTION 'Duplicate paper selection: %', v_comp
            USING ERRCODE = 'P0003';
        END IF;

        INSERT INTO temp_a2_route_selections (component_name, paper_number, stage, subject_paper_id)
        VALUES (v_comp, v_paper_num, v_sel_stage, v_sp_id);
      END LOOP;

      -- Validate that the resolved paper set EXACTLY matches one canonical combination in subject_valid_routes for staged
      SELECT COUNT(svr.id)
      INTO   v_matching_route_count
      FROM   public.subject_valid_routes svr
      WHERE  svr.subject_id = v_us.subject_id
        AND  svr.route = 'staged'
        AND NOT EXISTS (
          SELECT 1 FROM public.subject_route_papers srp
          WHERE srp.route_id = svr.id
            AND NOT EXISTS (
              SELECT 1 FROM temp_a2_route_selections trs
              WHERE trs.subject_paper_id = srp.subject_paper_id
                AND trs.stage = srp.stage
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM temp_a2_route_selections trs
          WHERE NOT EXISTS (
            SELECT 1 FROM public.subject_route_papers srp
            WHERE srp.route_id = svr.id
              AND srp.subject_paper_id = trs.subject_paper_id
              AND srp.stage = trs.stage
          )
        );

      IF v_matching_route_count != 1 THEN
        RAISE EXCEPTION 'Invalid paper selection combination for % route staged', v_subj_code
          USING ERRCODE = 'P0003';
      END IF;

      -- Require target staged combination's AS-stage paper multiset to exactly equal
      -- the enrollment's existing AS paper multiset (except for Maths p1_p2 exception)
      IF NOT (v_subj_code = '9709' AND v_current_combo_key = 'p1_p2') THEN
        IF EXISTS (
          SELECT 1 FROM temp_a2_route_selections trs
          WHERE trs.stage = 'as'
            AND NOT EXISTS (
              SELECT 1 FROM public.subject_paper_selections sps
              WHERE sps.user_subject_id = p_user_subject_id
                AND sps.subject_paper_id = trs.subject_paper_id
            )
        ) OR EXISTS (
          SELECT 1 FROM public.subject_paper_selections sps
          WHERE sps.user_subject_id = p_user_subject_id
            AND NOT EXISTS (
              SELECT 1 FROM temp_a2_route_selections trs
              WHERE trs.stage = 'as'
                AND trs.subject_paper_id = sps.subject_paper_id
            )
        ) OR (
          (SELECT COUNT(*) FROM temp_a2_route_selections WHERE stage = 'as') !=
          (SELECT COUNT(*) FROM public.subject_paper_selections WHERE user_subject_id = p_user_subject_id)
        ) THEN
          RAISE EXCEPTION 'Target staged combination AS papers do not match existing AS paper enrollment for %', v_subj_code
            USING ERRCODE = 'P0003';
        END IF;
      END IF;

    ELSE
      -- p_paper_selections was not provided. Auto-resolve staged combination for as_only enrollment.
      IF v_subj_code IN ('9702', '9701', '9618') OR (SELECT COUNT(*) FROM public.subject_valid_routes WHERE subject_id = v_us.subject_id AND route = 'staged') = 1 THEN
        -- Fixed subjects (or any catalogued subject with exactly one staged route) automatically receive their canonical staged route
        INSERT INTO temp_a2_route_selections (component_name, paper_number, stage, subject_paper_id)
        SELECT sp.name, sp.paper_number, srp.stage, sp.id
        FROM   public.subject_valid_routes svr
        JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
        JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
        WHERE  svr.subject_id = v_us.subject_id
          AND  svr.route = 'staged';

      ELSE
        -- v_current_combo_key is already resolved above
        IF v_subj_code = '9709' THEN
          IF v_current_combo_key = 'p1_m1' THEN
            v_target_combo_key := 'mech_stats';
          ELSIF v_current_combo_key = 'p1_s1' THEN
            v_target_combo_key := 'stats_mech';
          ELSIF v_current_combo_key = 'p1_p2' THEN
            RAISE EXCEPTION 'Mathematics p1_p2 must select a valid staged paper combination before transitioning to A2'
              USING ERRCODE = 'P0003';
          ELSE
            RAISE EXCEPTION 'Cannot resolve valid staged paper combination for Mathematics'
              USING ERRCODE = 'P0003';
          END IF;

          INSERT INTO temp_a2_route_selections (component_name, paper_number, stage, subject_paper_id)
          SELECT sp.name, sp.paper_number, srp.stage, sp.id
          FROM   public.subject_valid_routes svr
          JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
          JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
          WHERE  svr.subject_id = v_us.subject_id
            AND  svr.route = 'staged'
            AND  svr.combination_key = v_target_combo_key;

        ELSIF v_subj_code = '9231' THEN
          IF v_current_combo_key = 'fp1_fm' THEN
            v_target_combo_key := 'fm_fps';
          ELSIF v_current_combo_key = 'fp1_fps' THEN
            v_target_combo_key := 'fps_fm';
          ELSE
            RAISE EXCEPTION 'Cannot resolve valid staged paper combination for Further Mathematics'
              USING ERRCODE = 'P0003';
          END IF;

          INSERT INTO temp_a2_route_selections (component_name, paper_number, stage, subject_paper_id)
          SELECT sp.name, sp.paper_number, srp.stage, sp.id
          FROM   public.subject_valid_routes svr
          JOIN   public.subject_route_papers srp ON srp.route_id = svr.id
          JOIN   public.subject_papers sp ON sp.id = srp.subject_paper_id
          WHERE  svr.subject_id = v_us.subject_id
            AND  svr.route = 'staged'
            AND  svr.combination_key = v_target_combo_key;

        ELSE
          RAISE EXCEPTION 'Unsupported subject for automatic A2 transition: %', COALESCE(v_subj_code, v_us.subject_id::text)
            USING ERRCODE = 'P0003';
        END IF;
      END IF;
    END IF;
  END IF;
END IF;

  -- ── Update user_subjects route and stage ─────────────────────────────────
  UPDATE public.user_subjects
  SET
    study_route      = CASE WHEN study_route = 'as_only' THEN 'staged'::public.study_route_enum ELSE study_route END,
    current_stage    = 'a2'::public.subject_stage_enum,
    a2_unlocked_at   = NOW(),
    a2_unlock_method = p_unlock_method,
    updated_at       = NOW()
  WHERE id = p_user_subject_id;

  -- ── Apply Paper Selections if needed ─────────────────────────────────────
  IF v_needs_paper_update THEN
    DELETE FROM public.subject_paper_selections
    WHERE  user_subject_id = p_user_subject_id;

    INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
    SELECT p_user_subject_id, component_name, paper_number, stage, subject_paper_id
    FROM   temp_a2_route_selections;
  END IF;

  -- ── Auto-populate user_chapters for newly accessible active chapters ──────
  INSERT INTO public.user_chapters (user_id, chapter_id, notes_status)
  SELECT p_user_id, c.id, 'none'
  FROM   public.chapters c
  WHERE  c.subject_id = v_us.subject_id
    AND  c.is_active = TRUE
    AND  public.user_can_access_chapter(p_user_id, c.id)
  ON CONFLICT (user_id, chapter_id) DO NOTHING;

  -- ── Cancel inaccessible missions ─────────────────────────────────────────
  PERFORM public.cancel_inaccessible_missions(p_user_id, p_user_subject_id);
END;
$$;

COMMENT ON FUNCTION public.transition_to_a2(UUID, UUID, public.a2_unlock_method_enum, public.result_type_enum, SMALLINT, SMALLINT, public.paper_session_enum, SMALLINT, BOOLEAN, JSONB) IS
  'Atomically transitions enrollment to A2, converts as_only to staged with canonical paper selections, updates results, unlocks chapters, and cancels missions.';

REVOKE ALL ON FUNCTION public.transition_to_a2(UUID, UUID, public.a2_unlock_method_enum, public.result_type_enum, SMALLINT, SMALLINT, public.paper_session_enum, SMALLINT, BOOLEAN, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.transition_to_a2(UUID, UUID, public.a2_unlock_method_enum, public.result_type_enum, SMALLINT, SMALLINT, public.paper_session_enum, SMALLINT, BOOLEAN, JSONB) TO authenticated, service_role;
