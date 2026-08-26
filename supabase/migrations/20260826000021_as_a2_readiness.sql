-- ============================================================
-- MIGRATION 021: AS/A2 Readiness, Route Functions, Undo Mission
--
-- Does NOT add new tables. Does:
--   1. Add mission_undo to xp_event_type_enum
--   2. Tighten carry_forward constraint (require result_type = 'actual')
--   3. user_can_access_chapter     helper (used in RLS + functions)
--   4. cancel_inaccessible_missions helper
--   5. compute_readiness_score(uuid,uuid,text) – new 3-arg function
--   6. compute_readiness_score(uuid,uuid)      – wrapper: signature kept,
--                                                body replaced to call 3-arg
--   7. configure_subject_route    atomic route setter
--   8. transition_to_a2           atomic A2 unlocker
--   9. generate_daily_missions    updated: stage filter, unconfirmed excluded
--  10. complete_mission           updated: auth guard, inaccessible guard,
--                                          bonus now uses mission_id as ref
--  11. undo_mission_completion    new atomic undo function
--  12. get_user_dashboard_stats   updated: per-stage readiness, no overall
--  13. RLS: replace user_chapters insert/update policies (accessibility gate)
--  14. RLS: replace past_papers   update policy (split ownership / stage)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. ENUM: add mission_undo
-- ════════════════════════════════════════════════════════════

ALTER TYPE public.xp_event_type_enum ADD VALUE IF NOT EXISTS 'mission_undo';


-- ════════════════════════════════════════════════════════════
-- 2. CONSTRAINT: carry_forward requires stage='as' AND result_type='actual'
--
-- Migration 020 added ssr_carry_forward_as_only which only checks stage='as'.
-- This migration tightens it to also require result_type = 'actual'.
-- We drop the old constraint and replace it with the stricter one.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.subject_stage_results
  DROP CONSTRAINT IF EXISTS ssr_carry_forward_as_only;

ALTER TABLE public.subject_stage_results
  ADD CONSTRAINT ssr_carry_forward_actual CHECK (
    carry_forward = FALSE
    OR (stage = 'as' AND result_type = 'actual')
  );

COMMENT ON CONSTRAINT ssr_carry_forward_actual ON public.subject_stage_results IS
  'carry_forward = TRUE is only valid for an actual AS result. '
  'Expected or forecast results cannot be carry-forwarded — '
  'only an official result (result_type = actual) may contribute to a final A-Level grade.';


-- ════════════════════════════════════════════════════════════
-- 3. user_can_access_chapter
--    Helper called from RLS WITH CHECK and from other functions.
--    Returns TRUE when the authenticated user may read/write this chapter.
--    Auth guard: raises 42501 if caller is not the claimed user.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.user_can_access_chapter(
  p_user_id    UUID,
  p_chapter_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_chapter_stage TEXT;   -- chapter_stage_enum stored as TEXT for CASE
  v_component     TEXT;
  v_subject_id    UUID;
  v_route         TEXT;   -- study_route_enum
  v_stage         TEXT;   -- subject_stage_enum
  v_us_id         UUID;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT c.stage::TEXT, c.component, c.subject_id
  INTO   v_chapter_stage, v_component, v_subject_id
  FROM   public.chapters c
  WHERE  c.id = p_chapter_id;

  IF NOT FOUND     THEN RETURN FALSE; END IF;
  IF v_chapter_stage IS NULL THEN RETURN FALSE; END IF;  -- unclassified = inaccessible

  SELECT us.id, us.study_route::TEXT, us.current_stage::TEXT
  INTO   v_us_id, v_route, v_stage
  FROM   public.user_subjects us
  WHERE  us.user_id    = p_user_id
    AND  us.subject_id = v_subject_id
    AND  us.is_archived = FALSE;

  IF NOT FOUND              THEN RETURN FALSE; END IF;
  IF v_route = 'unconfirmed' THEN RETURN FALSE; END IF;

  RETURN CASE v_chapter_stage
    WHEN 'as'     THEN TRUE
    WHEN 'shared' THEN TRUE
    WHEN 'a2'     THEN v_stage IN ('a2', 'full')
    WHEN 'route_dependent' THEN
      EXISTS (
        SELECT 1
        FROM   public.subject_paper_selections sps
        WHERE  sps.user_subject_id = v_us_id
          AND  sps.component_name  = v_component
          AND  (
            sps.stage = 'as'
            OR (sps.stage = 'a2' AND v_stage IN ('a2', 'full'))
          )
      )
    ELSE FALSE
  END;
END;
$$;

COMMENT ON FUNCTION public.user_can_access_chapter IS
  'Returns TRUE when auth.uid() may access a chapter under their confirmed study route. '
  'Called from RLS WITH CHECK policies and from complete_mission. '
  'Auth guard raises 42501 on user_id mismatch or unauthenticated caller.';

REVOKE ALL ON FUNCTION public.user_can_access_chapter(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_can_access_chapter(UUID, UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 4. cancel_inaccessible_missions
--    Marks pending missions whose target chapter is no longer accessible
--    as skipped. Called atomically at the end of configure_subject_route
--    and transition_to_a2.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cancel_inaccessible_missions(
  p_user_id         UUID,
  p_user_subject_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancelled INTEGER;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Mark pending chapter missions whose chapter is now inaccessible as skipped
  WITH cancelled AS (
    UPDATE public.daily_missions dm
    SET    status      = 'skipped',
           skip_reason = 'chapter_inaccessible',
           skipped_at  = NOW()
    FROM   public.user_chapters uc
    JOIN   public.chapters      c  ON c.id = uc.chapter_id
    JOIN   public.user_subjects us ON us.id = p_user_subject_id
                                   AND us.user_id = p_user_id
                                   AND us.subject_id = c.subject_id
    WHERE  dm.user_id              = p_user_id
      AND  dm.status               = 'pending'
      AND  dm.target_entity_type   = 'chapter'
      AND  dm.target_entity_id     = uc.id
      AND  NOT public.user_can_access_chapter(p_user_id, c.id)
    RETURNING dm.id
  )
  SELECT COUNT(*) INTO v_cancelled FROM cancelled;

  RETURN COALESCE(v_cancelled, 0);
END;
$$;

COMMENT ON FUNCTION public.cancel_inaccessible_missions IS
  'Skips pending chapter missions that are no longer accessible after a route change. '
  'Atomic — called inside configure_subject_route and transition_to_a2.';

REVOKE ALL ON FUNCTION public.cancel_inaccessible_missions(UUID, UUID) FROM PUBLIC;


-- ════════════════════════════════════════════════════════════
-- 5. compute_readiness_score(uuid, uuid, text)  — NEW 3-arg function
--
-- p_stage:
--   'as'  → AS + shared chapters; route_dependent where selection stage='as'; AS papers
--   'a2'  → A2 + shared chapters; route_dependent where selection stage='a2'; A2 papers
--   'all' → accessible chapters under the user's confirmed route for the subject;
--            unconfirmed subjects → returns 0
--
-- Formula (unchanged from migration 008):
--   readiness = (notes_pct × 0.35) + (paper_accuracy × 0.40) + (confidence × 0.25)
--
-- Corrections vs migration 008:
--   - Denominator = ALL accessible syllabus chapters (not only user_chapters rows)
--   - Untouched chapters: notes = 0, confidence = 0
--   - Notes scoring:   complete → 1.0,  in_progress/none → 0
--   - Confidence:      SUM(COALESCE(confidence_level,0)/5.0) / total_accessible_chapters
--   - Papers:          only stage-classified papers, filtered by p_stage
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_readiness_score(
  p_user_id    UUID,
  p_subject_id UUID,    -- required, no default; NULL = aggregate across all subjects
  p_stage      TEXT     -- required: 'as' | 'a2' | 'all'
)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_total_chapters     INTEGER;
  v_complete_notes     INTEGER;
  v_notes_pct          NUMERIC;
  v_confidence_sum     NUMERIC;
  v_confidence_pct     NUMERIC;
  v_paper_accuracy     NUMERIC;
BEGIN
  -- Auth guard
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Validate stage
  IF p_stage NOT IN ('as', 'a2', 'all') THEN
    RAISE EXCEPTION 'Invalid stage: %. Must be ''as'', ''a2'', or ''all''.', p_stage
      USING ERRCODE = 'P0002';
  END IF;

  -- ── Build the accessible chapter set ─────────────────────────────────────
  -- Chapters matching (p_user_id, p_subject_id, p_stage) are collected into
  -- a CTE used for all three metric queries below.

  -- Count total accessible chapters (denominator for notes and confidence)
  SELECT COUNT(DISTINCT c.id)
  INTO   v_total_chapters
  FROM   public.chapters c
  JOIN   public.user_subjects us
         ON  us.subject_id = c.subject_id
         AND us.user_id    = p_user_id
         AND us.is_archived = FALSE
  WHERE  (p_subject_id IS NULL OR c.subject_id = p_subject_id)
    AND  (
           -- Stage filter
           CASE p_stage
             WHEN 'as' THEN
               c.stage IN ('as', 'shared')
               OR (
                 c.stage = 'route_dependent'
                 AND EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE  sps.user_subject_id = us.id
                     AND  sps.component_name  = c.component
                     AND  sps.stage           = 'as'
                 )
               )
             WHEN 'a2' THEN
               c.stage IN ('a2', 'shared')
               OR (
                 c.stage = 'route_dependent'
                 AND EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE  sps.user_subject_id = us.id
                     AND  sps.component_name  = c.component
                     AND  sps.stage           = 'a2'
                 )
               )
             WHEN 'all' THEN
               -- Chapters accessible under the user's confirmed route
               us.study_route != 'unconfirmed'
               AND (
                 c.stage IN ('as', 'shared')
                 OR (c.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
                 OR (
                   c.stage = 'route_dependent'
                   AND EXISTS (
                     SELECT 1 FROM public.subject_paper_selections sps
                     WHERE  sps.user_subject_id = us.id
                       AND  sps.component_name  = c.component
                       AND  (
                         sps.stage = 'as'
                         OR (sps.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
                       )
                   )
                 )
               )
           END
         )
    AND  c.stage IS NOT NULL;  -- never include unclassified chapters

  -- No accessible chapters → readiness = 0
  IF v_total_chapters = 0 THEN
    RETURN 0.00;
  END IF;

  -- ── Notes: complete = 1, in_progress = 0, none = 0, untouched = 0 ─────────
  SELECT COUNT(DISTINCT c.id) FILTER (
           WHERE uc.notes_status = 'complete'
         )
  INTO   v_complete_notes
  FROM   public.chapters c
  JOIN   public.user_subjects us
         ON  us.subject_id = c.subject_id
         AND us.user_id    = p_user_id
         AND us.is_archived = FALSE
  LEFT JOIN public.user_chapters uc
         ON  uc.chapter_id = c.id
         AND uc.user_id    = p_user_id
  WHERE  (p_subject_id IS NULL OR c.subject_id = p_subject_id)
    AND  (
           CASE p_stage
             WHEN 'as' THEN
               c.stage IN ('as', 'shared')
               OR (c.stage = 'route_dependent' AND EXISTS (
                 SELECT 1 FROM public.subject_paper_selections sps
                 WHERE sps.user_subject_id = us.id AND sps.component_name = c.component AND sps.stage = 'as'
               ))
             WHEN 'a2' THEN
               c.stage IN ('a2', 'shared')
               OR (c.stage = 'route_dependent' AND EXISTS (
                 SELECT 1 FROM public.subject_paper_selections sps
                 WHERE sps.user_subject_id = us.id AND sps.component_name = c.component AND sps.stage = 'a2'
               ))
             WHEN 'all' THEN
               us.study_route != 'unconfirmed'
               AND (
                 c.stage IN ('as', 'shared')
                 OR (c.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
                 OR (c.stage = 'route_dependent' AND EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE sps.user_subject_id = us.id AND sps.component_name = c.component
                     AND (sps.stage = 'as' OR (sps.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full')))
                 ))
               )
           END
         )
    AND  c.stage IS NOT NULL;

  v_notes_pct := COALESCE(v_complete_notes, 0)::NUMERIC / v_total_chapters;

  -- ── Confidence: SUM(COALESCE(level,0)/5.0) / total_accessible_chapters ────
  -- Untouched chapters (no user_chapters row) contribute 0. Denominator is
  -- always total_accessible_chapters, never limited to rows that have confidence set.
  SELECT COALESCE(
           SUM(COALESCE(uc.confidence_level, 0)::NUMERIC / 5.0),
           0
         )
  INTO   v_confidence_sum
  FROM   public.chapters c
  JOIN   public.user_subjects us
         ON  us.subject_id = c.subject_id
         AND us.user_id    = p_user_id
         AND us.is_archived = FALSE
  LEFT JOIN public.user_chapters uc
         ON  uc.chapter_id = c.id
         AND uc.user_id    = p_user_id
  WHERE  (p_subject_id IS NULL OR c.subject_id = p_subject_id)
    AND  (
           CASE p_stage
             WHEN 'as' THEN
               c.stage IN ('as', 'shared')
               OR (c.stage = 'route_dependent' AND EXISTS (
                 SELECT 1 FROM public.subject_paper_selections sps
                 WHERE sps.user_subject_id = us.id AND sps.component_name = c.component AND sps.stage = 'as'
               ))
             WHEN 'a2' THEN
               c.stage IN ('a2', 'shared')
               OR (c.stage = 'route_dependent' AND EXISTS (
                 SELECT 1 FROM public.subject_paper_selections sps
                 WHERE sps.user_subject_id = us.id AND sps.component_name = c.component AND sps.stage = 'a2'
               ))
             WHEN 'all' THEN
               us.study_route != 'unconfirmed'
               AND (
                 c.stage IN ('as', 'shared')
                 OR (c.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
                 OR (c.stage = 'route_dependent' AND EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE sps.user_subject_id = us.id AND sps.component_name = c.component
                     AND (sps.stage = 'as' OR (sps.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full')))
                 ))
               )
           END
         )
    AND  c.stage IS NOT NULL;

  v_confidence_pct := v_confidence_sum / v_total_chapters;

  -- ── Paper accuracy: only stage-classified papers ─────────────────────────
  -- p_stage='as'  → past_papers.stage = 'as'
  -- p_stage='a2'  → past_papers.stage = 'a2'
  -- p_stage='all' → past_papers whose stage is accessible under the user's route
  SELECT COALESCE(
           AVG(pp.accuracy_pct) / 100.0,
           0
         )
  INTO   v_paper_accuracy
  FROM   public.past_papers pp
  JOIN   public.user_subjects us
         ON  us.subject_id = pp.subject_id
         AND us.user_id    = p_user_id
         AND us.is_archived = FALSE
  WHERE  pp.user_id = p_user_id
    AND  (p_subject_id IS NULL OR pp.subject_id = p_subject_id)
    AND  pp.stage IS NOT NULL   -- ignore unclassified papers
    AND  (
           CASE p_stage
             WHEN 'as'  THEN pp.stage = 'as'
             WHEN 'a2'  THEN pp.stage = 'a2'
             WHEN 'all' THEN
               us.study_route != 'unconfirmed'
               AND (
                 pp.stage = 'as'
                 OR (pp.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
               )
           END
         );

  RETURN ROUND(
    (v_notes_pct * 0.35 + v_paper_accuracy * 0.40 + v_confidence_pct * 0.25) * 100.0,
    2
  );
END;
$$;

COMMENT ON FUNCTION public.compute_readiness_score(UUID, UUID, TEXT) IS
  'Stage-aware readiness. p_stage: ''as'' | ''a2'' | ''all''. '
  'Denominator always = total accessible syllabus chapters (untouched chapters count as zero). '
  'Notes scoring: complete=1, else=0. Confidence: COALESCE(level,0)/5 per chapter. '
  'Papers: only stage-classified papers, filtered by stage. '
  'p_stage=''all'' = chapters accessible under the user''s confirmed route; unconfirmed → 0.';

REVOKE ALL ON FUNCTION public.compute_readiness_score(UUID, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.compute_readiness_score(UUID, UUID, TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 6. compute_readiness_score(uuid, uuid)  — wrapper
--    SIGNATURE PRESERVED. Body replaced to delegate to 3-arg function.
--    All existing call sites (migration 019, application code) keep working.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_readiness_score(
  p_user_id    UUID,
  p_subject_id UUID DEFAULT NULL
)
RETURNS NUMERIC(5,2)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT public.compute_readiness_score(p_user_id, p_subject_id, 'all');
$$;

COMMENT ON FUNCTION public.compute_readiness_score(UUID, UUID) IS
  'Backward-compatible wrapper. Signature unchanged; body now delegates to the '
  '3-arg stage-aware function with p_stage=''all''.';


-- ════════════════════════════════════════════════════════════
-- 7. configure_subject_route
--    Atomic: validates, saves route+stage+selections, clears stale unlock
--    data, cancels inaccessible pending missions. All-or-nothing.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.configure_subject_route(
  p_user_id          UUID,
  p_user_subject_id  UUID,
  p_route            study_route_enum,
  p_paper_selections JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_us          public.user_subjects%ROWTYPE;
  v_new_stage   subject_stage_enum;
  v_subject_id  UUID;
  v_sel         JSONB;
  v_comp        TEXT;
  v_sel_stage   TEXT;
  v_paper_num   SMALLINT;
BEGIN
  -- Auth guard
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Reject 'unconfirmed' as a target route
  IF p_route = 'unconfirmed' THEN
    RAISE EXCEPTION 'Cannot set study_route to unconfirmed' USING ERRCODE = 'P0001';
  END IF;

  -- Fetch and lock the user_subject row
  SELECT * INTO v_us
  FROM   public.user_subjects
  WHERE  id      = p_user_subject_id
    AND  user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found or not owned' USING ERRCODE = '42501';
  END IF;

  v_subject_id := v_us.subject_id;

  -- Determine new current_stage
  v_new_stage := CASE p_route
    WHEN 'as_only'    THEN 'as'::subject_stage_enum
    WHEN 'staged'     THEN 'as'::subject_stage_enum
    WHEN 'full_level' THEN 'full'::subject_stage_enum
  END;

  -- ── Validate paper selections ─────────────────────────────────────────────
  FOR v_sel IN SELECT * FROM jsonb_array_elements(p_paper_selections) LOOP
    v_comp      := v_sel->>'component_name';
    v_sel_stage := v_sel->>'stage';
    v_paper_num := (v_sel->>'paper_number')::SMALLINT;

    -- component must exist in chapters for this subject
    IF NOT EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE  c.subject_id = v_subject_id
        AND  c.component  = v_comp
    ) THEN
      RAISE EXCEPTION 'Component "%" does not belong to subject %', v_comp, v_subject_id
        USING ERRCODE = 'P0003';
    END IF;

    -- stage must be 'as' or 'a2'
    IF v_sel_stage NOT IN ('as', 'a2') THEN
      RAISE EXCEPTION 'Paper selection stage must be ''as'' or ''a2'', got: %', v_sel_stage
        USING ERRCODE = 'P0003';
    END IF;

    -- as_only route may not have A2 selections
    IF p_route = 'as_only' AND v_sel_stage = 'a2' THEN
      RAISE EXCEPTION 'as_only route cannot have A2 paper selections'
        USING ERRCODE = 'P0003';
    END IF;
  END LOOP;

  -- ── Apply route + stage update ────────────────────────────────────────────
  -- Clear unlock fields if the new route does not keep the user in A2
  UPDATE public.user_subjects
  SET
    study_route      = p_route,
    current_stage    = v_new_stage,
    a2_unlocked_at   = CASE WHEN v_new_stage::TEXT = 'a2' THEN a2_unlocked_at ELSE NULL END,
    a2_unlock_method = CASE WHEN v_new_stage::TEXT = 'a2' THEN a2_unlock_method ELSE NULL END,
    updated_at       = NOW()
  WHERE id = p_user_subject_id;

  -- ── Replace paper selections ──────────────────────────────────────────────
  DELETE FROM public.subject_paper_selections
  WHERE  user_subject_id = p_user_subject_id;

  INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage)
  SELECT
    p_user_subject_id,
    sel->>'component_name',
    (sel->>'paper_number')::SMALLINT,
    sel->>'stage'
  FROM jsonb_array_elements(p_paper_selections) sel
  ON CONFLICT (user_subject_id, component_name) DO UPDATE
    SET stage        = EXCLUDED.stage,
        paper_number = EXCLUDED.paper_number;

  -- ── Cancel now-inaccessible pending missions ──────────────────────────────
  PERFORM public.cancel_inaccessible_missions(p_user_id, p_user_subject_id);
END;
$$;

COMMENT ON FUNCTION public.configure_subject_route IS
  'Atomic: sets study_route + current_stage + paper selections in one transaction. '
  'Validates paper selections (component must belong to subject, no A2 selections for as_only). '
  'Clears a2_unlocked_at/method when route no longer requires A2. '
  'Cancels pending missions whose chapters become inaccessible. '
  'Auth: raises 42501 on user_id mismatch.';

REVOKE ALL ON FUNCTION public.configure_subject_route(UUID, UUID, study_route_enum, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.configure_subject_route(UUID, UUID, study_route_enum, JSONB) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 8. transition_to_a2
--    Atomic: inserts AS result (when provided) and unlocks A2 together.
--    If either step fails the whole transaction rolls back.
--
--    normal_transition:
--      - Requires study_route='staged' AND current_stage='as'
--      - All result fields required
--    manual:
--      - Allows study_route IN ('staged','as_only') AND current_stage='as'
--      - Result fields optional (all or none)
--      - If study_route='as_only': also sets study_route='staged' atomically
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.transition_to_a2(
  p_user_id          UUID,
  p_user_subject_id  UUID,
  p_unlock_method    a2_unlock_method_enum,
  p_result_type      result_type_enum   DEFAULT NULL,
  p_score_obtained   SMALLINT           DEFAULT NULL,
  p_score_maximum    SMALLINT           DEFAULT NULL,
  p_exam_series      paper_session_enum DEFAULT NULL,
  p_exam_year        SMALLINT           DEFAULT NULL,
  p_carry_forward    BOOLEAN            DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_us             public.user_subjects%ROWTYPE;
  v_has_result     BOOLEAN;
  v_result_partial BOOLEAN;
BEGIN
  -- Auth guard
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Fetch and lock
  SELECT * INTO v_us
  FROM   public.user_subjects
  WHERE  id      = p_user_subject_id
    AND  user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found or not owned' USING ERRCODE = '42501';
  END IF;

  -- Already in A2 or full
  IF v_us.current_stage::TEXT IN ('a2', 'full') THEN
    RAISE EXCEPTION 'Already in A2 or full level' USING ERRCODE = 'P0001';
  END IF;

  -- Validate result field completeness (all or none)
  v_has_result := (p_result_type IS NOT NULL);
  v_result_partial := (
    (p_result_type  IS NOT NULL)::INTEGER +
    (p_score_obtained IS NOT NULL)::INTEGER +
    (p_score_maximum  IS NOT NULL)::INTEGER +
    (p_exam_series   IS NOT NULL)::INTEGER +
    (p_exam_year     IS NOT NULL)::INTEGER
  ) NOT IN (0, 5);

  IF v_result_partial THEN
    RAISE EXCEPTION 'Provide all result fields or none' USING ERRCODE = 'P0001';
  END IF;

  -- Method-specific checks
  IF p_unlock_method = 'normal_transition' THEN
    IF v_us.study_route::TEXT != 'staged' OR v_us.current_stage::TEXT != 'as' THEN
      RAISE EXCEPTION 'normal_transition requires study_route=staged and current_stage=as'
        USING ERRCODE = 'P0001';
    END IF;
    IF NOT v_has_result THEN
      RAISE EXCEPTION 'normal_transition requires an AS result' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_unlock_method = 'manual' THEN
    IF v_us.study_route::TEXT NOT IN ('staged', 'as_only') OR v_us.current_stage::TEXT != 'as' THEN
      RAISE EXCEPTION 'manual unlock requires study_route in (staged, as_only) and current_stage=as'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Insert AS result if provided (constraint ssr_carry_forward_actual enforces carry_forward rule)
  IF v_has_result THEN
    INSERT INTO public.subject_stage_results (
      user_subject_id, stage, result_type,
      score_obtained, score_maximum,
      exam_series, exam_year, carry_forward
    ) VALUES (
      p_user_subject_id, 'as', p_result_type,
      p_score_obtained, p_score_maximum,
      p_exam_series, p_exam_year, p_carry_forward
    );
    -- If this insert violates any constraint (score, carry_forward, unique),
    -- the entire transaction rolls back automatically.
  END IF;

  -- Atomically unlock A2 (+ convert as_only → staged if manual)
  UPDATE public.user_subjects
  SET
    study_route      = CASE WHEN v_us.study_route::TEXT = 'as_only' THEN 'staged'::study_route_enum
                            ELSE v_us.study_route END,
    current_stage    = 'a2'::subject_stage_enum,
    a2_unlocked_at   = NOW(),
    a2_unlock_method = p_unlock_method,
    updated_at       = NOW()
  WHERE id = p_user_subject_id;

  -- No missions are cancelled: A2 unlock only expands access, never restricts it.
END;
$$;

COMMENT ON FUNCTION public.transition_to_a2 IS
  'Atomic A2 unlock. normal_transition: requires staged/as + full result. '
  'manual: allows staged or as_only; as_only converted to staged in same UPDATE. '
  'Result insert and unlock update are in one transaction — if either fails, both roll back. '
  'Auth: raises 42501 on user_id mismatch.';

REVOKE ALL ON FUNCTION public.transition_to_a2(UUID, UUID, a2_unlock_method_enum, result_type_enum, SMALLINT, SMALLINT, paper_session_enum, SMALLINT, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.transition_to_a2(UUID, UUID, a2_unlock_method_enum, result_type_enum, SMALLINT, SMALLINT, paper_session_enum, SMALLINT, BOOLEAN) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 9. generate_daily_missions  — updated
--    Changes from migration 019:
--      - auth.uid() = p_user_id guard added
--      - Subjects with study_route='unconfirmed' excluded
--      - Chapter accessibility filter added (matches user_can_access_chapter logic)
--      - If no accessible chapters exist, returns 0 without updating last_generated
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_daily_missions(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today          DATE;
  v_existing_count INTEGER;
  v_inserted       INTEGER := 0;
  v_budget         INTEGER;
  v_max_missions   INTEGER;
  v_last_generated DATE;
  rec              RECORD;
  v_mission_type   mission_type_enum;
  v_title          TEXT;
  v_description    TEXT;
  v_xp_reward      SMALLINT;
  v_difficulty     TEXT;
  v_rows           INTEGER;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_today := public.get_user_local_date(p_user_id);

  SELECT max_missions_per_day, missions_last_generated_date
  INTO   v_max_missions, v_last_generated
  FROM   public.user_settings
  WHERE  user_id = p_user_id;

  v_max_missions := COALESCE(v_max_missions, 3);

  IF v_last_generated = v_today THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM   public.daily_missions
  WHERE  user_id = p_user_id AND mission_date = v_today;

  v_budget := v_max_missions - v_existing_count;
  IF v_budget <= 0 THEN
    UPDATE public.user_settings SET missions_last_generated_date = v_today WHERE user_id = p_user_id;
    RETURN 0;
  END IF;

  -- ── Chapter missions ──────────────────────────────────────────────────────
  FOR rec IN
    WITH chapter_scores AS (
      SELECT
        uc.id                     AS user_chapter_id,
        uc.chapter_id,
        c.title                   AS chapter_title,
        s.id                      AS subject_id,
        s.name                    AS subject_name,
        us.priority,
        uc.notes_status,
        uc.confidence_level,
        uc.last_reviewed_at,
        uc.revision_count,
        CASE WHEN uc.notes_status != 'complete' THEN 1.0 ELSE 0.0 END AS notes_gap,
        (5.0 - COALESCE(uc.confidence_level, 3)) / 4.0                AS confidence_gap,
        (1.0 - COALESCE((
          SELECT AVG(pqa.marks_obtained::NUMERIC / NULLIF(pqa.marks_available, 0))
          FROM   public.paper_question_attempts pqa
          JOIN   public.past_papers pp ON pp.id = pqa.paper_id
          WHERE  pqa.chapter_id = uc.chapter_id AND pp.user_id = p_user_id
        ), 0.7))                                                       AS accuracy_gap,
        LEAST(COALESCE(
          EXTRACT(DAY FROM (NOW() - uc.last_reviewed_at))::NUMERIC, 14
        ), 14) / 14.0 * (1.0 / GREATEST(COALESCE(uc.revision_count,0)::NUMERIC * 0.2 + 1.0, 1.0))
                                                                       AS recency_penalty,
        GREATEST(1.0 / NULLIF((us.exam_date - v_today)::NUMERIC, 0), 0.01) AS urgency
      FROM   public.user_chapters uc
      JOIN   public.chapters c  ON c.id = uc.chapter_id
      JOIN   public.subjects s  ON s.id = c.subject_id
      JOIN   public.user_subjects us
             ON  us.user_id    = p_user_id
             AND us.subject_id = s.id
      WHERE  uc.user_id          = p_user_id
        AND  us.exam_date        IS NOT NULL
        AND  us.exam_date        > v_today
        AND  us.is_archived      = FALSE
        -- Exclude unconfirmed subjects
        AND  us.study_route::TEXT != 'unconfirmed'
        -- Chapter accessibility filter (mirrors user_can_access_chapter logic inline
        -- for set-based performance — avoids per-row function calls)
        AND  c.stage IS NOT NULL
        AND  (
               c.stage IN ('as', 'shared')
               OR (c.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
               OR (
                 c.stage = 'route_dependent'
                 AND EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE  sps.user_subject_id = us.id
                     AND  sps.component_name  = c.component
                     AND  (
                       sps.stage = 'as'
                       OR (sps.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
                     )
                 )
               )
             )
    )
    SELECT *,
      (notes_gap * 0.25 + confidence_gap * 0.30 +
       accuracy_gap * 0.30 + recency_penalty * 0.15)
      * urgency * (priority::NUMERIC / 3.0) AS chapter_score
    FROM chapter_scores
    ORDER BY chapter_score DESC
    LIMIT v_budget
  LOOP
    IF rec.notes_status = 'none' THEN
      v_mission_type := 'complete_notes';
      v_title        := 'Complete Chapter Notes';
      v_description  := rec.chapter_title || ' · ' || rec.subject_name;
      v_xp_reward    := 50;
      v_difficulty   := 'medium';
    ELSIF rec.accuracy_gap > 0.4 THEN
      v_mission_type := 'revisit_weak_topic';
      v_title        := 'Revisit Weak Topic';
      v_description  := rec.chapter_title || ' — low accuracy detected';
      v_xp_reward    := 40;
      v_difficulty   := 'hard';
    ELSIF rec.notes_status = 'in_progress' THEN
      v_mission_type := 'complete_notes';
      v_title        := 'Finish Chapter Notes';
      v_description  := rec.chapter_title || ' · ' || rec.subject_name;
      v_xp_reward    := 50;
      v_difficulty   := 'medium';
    ELSE
      v_mission_type := 'review_chapter';
      v_title        := 'Review Chapter';
      v_description  := rec.chapter_title || ' · ' || rec.subject_name;
      v_xp_reward    := 30;
      v_difficulty   := 'easy';
    END IF;

    INSERT INTO public.daily_missions (
      user_id, mission_date, type, target_entity_type,
      target_entity_id, title, description, xp_reward, status, difficulty
    ) VALUES (
      p_user_id, v_today, v_mission_type, 'chapter',
      rec.user_chapter_id, v_title, v_description, v_xp_reward, 'pending', v_difficulty
    )
    ON CONFLICT (user_id, mission_date, type, target_entity_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_inserted + v_rows;
    v_budget   := v_budget - 1;
    EXIT WHEN v_budget <= 0;
  END LOOP;

  -- ── Paper mission (only for subjects with a confirmed route) ─────────────
  IF v_budget > 0 AND NOT EXISTS (
    SELECT 1 FROM public.past_papers
    WHERE  user_id = p_user_id
      AND  attempted_at BETWEEN (v_today - 6) AND v_today
  ) THEN
    INSERT INTO public.daily_missions (
      user_id, mission_date, type, target_entity_type,
      target_entity_id, title, description, xp_reward, status, difficulty
    )
    SELECT
      p_user_id, v_today, 'attempt_paper', 'subject',
      us.subject_id,
      'Attempt a Past Paper',
      'Practice with a ' || s.name || ' past paper',
      75, 'pending', 'hard'
    FROM   public.user_subjects us
    JOIN   public.subjects s ON s.id = us.subject_id
    WHERE  us.user_id         = p_user_id
      AND  us.exam_date       IS NOT NULL
      AND  us.exam_date       > v_today
      AND  us.is_archived     = FALSE
      AND  us.study_route::TEXT != 'unconfirmed'
    ORDER BY us.exam_date ASC
    LIMIT 1
    ON CONFLICT (user_id, mission_date, type, target_entity_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_inserted + v_rows;
  END IF;

  UPDATE public.user_settings
  SET    missions_last_generated_date = v_today
  WHERE  user_id = p_user_id;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.generate_daily_missions IS
  'Generates daily missions using the user''s local calendar date. '
  'Excludes unconfirmed subjects. '
  'Chapter accessibility filter: AS/shared always accessible; A2 only when staged-A2 or full_level; '
  'route_dependent resolved via subject_paper_selections. '
  'ON CONFLICT ensures idempotency. Auth: raises 42501 on user_id mismatch.';


-- ════════════════════════════════════════════════════════════
-- 10. complete_mission  — updated
--     Changes:
--       - Auth guard (auth.uid() = p_user_id)
--       - Local-date guard (uses get_user_local_date, as in migration 019)
--       - Inaccessible chapter guard (raises P0004)
--       - All-missions-complete bonus now uses p_mission_id as reference_id
--         (enables exact bonus reversal in undo without timestamp heuristics)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.complete_mission(
  p_mission_id UUID,
  p_user_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission      public.daily_missions%ROWTYPE;
  v_profile      public.profiles%ROWTYPE;
  v_streak       public.streaks%ROWTYPE;
  v_achievements JSONB    := '[]'::JSONB;
  v_ach_xp       SMALLINT := 0;
  v_today        DATE;
  rec            RECORD;
BEGIN
  -- Auth guard
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_today := public.get_user_local_date(p_user_id);

  -- Fetch and lock (must be pending)
  SELECT * INTO v_mission
  FROM   public.daily_missions
  WHERE  id      = p_mission_id
    AND  user_id = p_user_id
    AND  status  = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission not found, already completed/skipped, or unauthorised: %', p_mission_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Inaccessible chapter guard
  IF v_mission.target_entity_type = 'chapter'
     AND v_mission.target_entity_id IS NOT NULL
  THEN
    IF NOT public.user_can_access_chapter(
      p_user_id,
      (SELECT chapter_id FROM public.user_chapters
       WHERE  id = v_mission.target_entity_id)
    ) THEN
      RAISE EXCEPTION 'Mission target chapter is no longer accessible' USING ERRCODE = 'P0004';
    END IF;
  END IF;

  -- Mark complete
  UPDATE public.daily_missions
  SET    status = 'completed', completed_at = NOW()
  WHERE  id = p_mission_id;

  -- Award mission XP
  PERFORM public.award_xp(
    p_user_id, v_mission.xp_reward, 'mission_complete',
    p_mission_id,
    jsonb_build_object('mission_type', v_mission.type)
  );

  -- All-missions-complete bonus — reference_id = p_mission_id for exact reversal
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_missions
    WHERE  user_id      = p_user_id
      AND  mission_date = v_today
      AND  status       = 'pending'
      AND  id           != p_mission_id
  ) THEN
    PERFORM public.award_xp(
      p_user_id, 25, 'mission_complete',
      p_mission_id,   -- ← reference_id = mission_id (changed from NULL)
      '{"bonus": "all_missions_complete"}'::JSONB
    );
  END IF;

  PERFORM public.update_streak(p_user_id);

  -- Touch last_reviewed_at on the chapter
  IF v_mission.target_entity_type = 'chapter'
     AND v_mission.target_entity_id IS NOT NULL
  THEN
    UPDATE public.user_chapters
    SET    last_reviewed_at = NOW(), updated_at = NOW()
    WHERE  id      = v_mission.target_entity_id
      AND  user_id = p_user_id;
  END IF;

  FOR rec IN SELECT * FROM public.check_and_unlock_achievements(p_user_id) LOOP
    v_achievements := v_achievements || jsonb_build_object(
      'key', rec.achievement_key, 'xp', rec.xp_reward
    );
    v_ach_xp := v_ach_xp + rec.xp_reward;
  END LOOP;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  SELECT * INTO v_streak  FROM public.streaks  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'xp_awarded',            v_mission.xp_reward,
    'achievement_xp',        v_ach_xp,
    'new_total_xp',          v_profile.total_xp,
    'new_level',             v_profile.current_level,
    'level_title',           public.compute_level_title(v_profile.current_level),
    'streak_days',           v_streak.current_streak,
    'achievements_unlocked', v_achievements
  );
END;
$$;

COMMENT ON FUNCTION public.complete_mission IS
  'Atomic mission completion. Marks done, awards XP, updates streak, checks achievements. '
  'Auth: raises 42501 on mismatch. Inaccessible chapter: raises P0004. '
  'All-missions-complete bonus uses mission_id as reference_id for exact undo reversal. '
  'MVP limitation: last_reviewed_at update is NOT reversed on undo.';


-- ════════════════════════════════════════════════════════════
-- 11. undo_mission_completion
--     MVP undo contract:
--       - Same local calendar day only (P0006)
--       - Within 10 minutes of completion (P0006)
--       - Duplicate undo check FIRST, before status check (P0007)
--       - Restores mission to pending
--       - Reverses mission XP (negative xp_events record; history preserved)
--       - Reverses all-missions-complete bonus using exact reference_id match
--       - XP floor: total_xp cannot go below 0
--       - Streak NOT modified (unsafe to decrement; another activity may own the day)
--       - Achievements NOT reversed (MVP limitation — documented)
--       - last_reviewed_at NOT reversed (MVP limitation — documented)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.undo_mission_completion(
  p_mission_id UUID,
  p_user_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission          public.daily_missions%ROWTYPE;
  v_today            DATE;
  v_xp_to_reverse    SMALLINT;
  v_bonus_to_reverse SMALLINT := 0;
  v_total_reversal   SMALLINT;
  v_current_xp       INTEGER;
  v_profile          public.profiles%ROWTYPE;
  v_streak           public.streaks%ROWTYPE;
BEGIN
  -- Auth guard
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_today := public.get_user_local_date(p_user_id);

  -- Fetch and lock the mission row
  SELECT * INTO v_mission
  FROM   public.daily_missions
  WHERE  id      = p_mission_id
    AND  user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission not found or not owned' USING ERRCODE = '42501';
  END IF;

  -- ── Duplicate undo check FIRST (before status check) ─────────────────────
  -- This ensures a duplicate undo attempt always returns P0007, even if the
  -- mission was somehow put back to pending by another path.
  IF EXISTS (
    SELECT 1 FROM public.xp_events
    WHERE  user_id     = p_user_id
      AND  reference_id = p_mission_id
      AND  event_type  = 'mission_undo'
      AND  xp_amount   < 0
  ) THEN
    RAISE EXCEPTION 'This mission has already been undone' USING ERRCODE = 'P0007';
  END IF;

  -- Mission must be completed
  IF v_mission.status != 'completed' THEN
    RAISE EXCEPTION 'Mission is not completed; cannot undo' USING ERRCODE = 'P0005';
  END IF;

  -- Must be the same local calendar day
  IF v_mission.mission_date != v_today THEN
    RAISE EXCEPTION 'Undo is only allowed on the same local calendar day' USING ERRCODE = 'P0006';
  END IF;

  -- Must be within 10 minutes of completion
  IF NOW() - v_mission.completed_at > INTERVAL '10 minutes' THEN
    RAISE EXCEPTION 'Undo window has expired (10-minute limit)' USING ERRCODE = 'P0006';
  END IF;

  -- ── Determine XP to reverse ───────────────────────────────────────────────
  v_xp_to_reverse := v_mission.xp_reward;

  -- Bonus reversal: find the all-missions-complete bonus event for this exact mission.
  -- complete_mission now stores reference_id = p_mission_id for the bonus event.
  SELECT COALESCE(SUM(xp_amount), 0)::SMALLINT
  INTO   v_bonus_to_reverse
  FROM   public.xp_events
  WHERE  user_id      = p_user_id
    AND  reference_id = p_mission_id
    AND  event_type   = 'mission_complete'
    AND  metadata->>'bonus' = 'all_missions_complete'
    AND  xp_amount    > 0;

  -- Total XP to reverse (mission + bonus)
  v_total_reversal := v_xp_to_reverse + v_bonus_to_reverse;

  -- ── XP floor: do not reduce total_xp below zero ──────────────────────────
  SELECT total_xp INTO v_current_xp FROM public.profiles WHERE id = p_user_id;
  IF v_current_xp - v_total_reversal < 0 THEN
    v_total_reversal := v_current_xp;
    -- Adjust bonus separately to keep reversal amounts meaningful
    IF v_total_reversal < v_xp_to_reverse THEN
      v_xp_to_reverse    := v_total_reversal;
      v_bonus_to_reverse := 0;
    ELSE
      v_bonus_to_reverse := v_total_reversal - v_xp_to_reverse;
    END IF;
  END IF;

  -- ── Restore mission to pending ────────────────────────────────────────────
  UPDATE public.daily_missions
  SET    status       = 'pending',
         completed_at = NULL
  WHERE  id = p_mission_id;

  -- ── Reverse mission XP (negative record; history preserved) ──────────────
  IF v_xp_to_reverse > 0 THEN
    PERFORM public.award_xp(
      p_user_id,
      (-v_xp_to_reverse)::SMALLINT,
      'mission_undo',
      p_mission_id,
      jsonb_build_object('reversed_mission_type', v_mission.type)
    );
  END IF;

  -- ── Reverse bonus XP if it was triggered by this mission ─────────────────
  IF v_bonus_to_reverse > 0 THEN
    PERFORM public.award_xp(
      p_user_id,
      (-v_bonus_to_reverse)::SMALLINT,
      'mission_undo',
      p_mission_id,
      jsonb_build_object('reversed_bonus', 'all_missions_complete')
    );
  END IF;

  -- Streak is NOT modified: decrementing current_streak - 1 is unsafe because
  -- another activity (e.g. a second mission completion, a paper logged) may have
  -- also advanced the streak on the same day. MVP limitation — documented.

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  SELECT * INTO v_streak  FROM public.streaks  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'xp_reversed',    v_xp_to_reverse + v_bonus_to_reverse,
    'new_total_xp',   v_profile.total_xp,
    'new_level',      v_profile.current_level,
    'level_title',    public.compute_level_title(v_profile.current_level),
    'streak_days',    v_streak.current_streak,
    'mission_status', 'pending'
  );
END;
$$;

COMMENT ON FUNCTION public.undo_mission_completion IS
  'MVP undo: restores mission to pending and reverses XP within 10 minutes on the same local day. '
  'Duplicate check (P0007) runs before status check so it always returns the intended error. '
  'XP floor: total_xp cannot go below zero. '
  'Bonus reversed by exact reference_id match (not timestamp). '
  'MVP limitations (not reversed): streak, achievements, last_reviewed_at.';

REVOKE ALL ON FUNCTION public.undo_mission_completion(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.undo_mission_completion(UUID, UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- 12. get_user_dashboard_stats  — updated
--     Changes:
--       - Removes overall_readiness (no combined score)
--       - subject_readiness gains as_readiness, a2_readiness, study_route, current_stage
--       - Legacy readiness field: = as_readiness for as/staged-as;
--                                 = as_readiness for staged-a2 (primary context);
--                                 = NULL for full_level (do not silently choose one)
--                                 = NULL for unconfirmed
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_user_dashboard_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  public.profiles%ROWTYPE;
  v_streak   public.streaks%ROWTYPE;
  v_result   JSONB;
  v_today    DATE;
  v_timezone TEXT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  SELECT * INTO v_streak  FROM public.streaks  WHERE user_id = p_user_id;
  v_timezone := public.get_user_timezone(p_user_id);
  v_today    := public.get_user_local_date(p_user_id);

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'full_name',     v_profile.full_name,
      'avatar_url',    v_profile.avatar_url,
      'total_xp',      v_profile.total_xp,
      'current_level', v_profile.current_level,
      'level_title',   public.compute_level_title(v_profile.current_level),
      'timezone',      v_timezone
    ),
    'streak', jsonb_build_object(
      'current',      COALESCE(v_streak.current_streak, 0),
      'longest',      COALESCE(v_streak.longest_streak, 0),
      'last_date',    v_streak.last_activity_date,
      'active_today', COALESCE(v_streak.last_activity_date = v_today, FALSE)
    ),
    -- overall_readiness removed: no combined score
    'today_missions', (
      SELECT json_agg(row_to_json(dm.*) ORDER BY dm.generated_at)
      FROM   public.daily_missions dm
      WHERE  dm.user_id      = p_user_id
        AND  dm.mission_date = v_today
        AND  dm.status      != 'skipped'
    ),
    'has_exam_dates', (
      SELECT EXISTS (
        SELECT 1 FROM public.user_subjects
        WHERE  user_id     = p_user_id
          AND  exam_date   IS NOT NULL
          AND  is_archived = FALSE
      )
    ),
    'has_chapter_data', (
      SELECT EXISTS (
        SELECT 1 FROM public.user_chapters WHERE user_id = p_user_id
      )
    ),
    'has_unconfirmed_routes', (
      SELECT EXISTS (
        SELECT 1 FROM public.user_subjects
        WHERE  user_id      = p_user_id
          AND  study_route  = 'unconfirmed'
          AND  is_archived  = FALSE
      )
    ),
    'subject_readiness', (
      SELECT json_agg(jsonb_build_object(
        'user_subject_id', us.id,
        'subject_id',      us.subject_id,
        'subject_name',    s.name,
        'color_hex',       s.color_hex,
        'exam_date',       us.exam_date,
        'days_until',      (us.exam_date - v_today),
        'study_route',     us.study_route,
        'current_stage',   us.current_stage,
        -- Per-stage readiness (NULL for unconfirmed)
        'as_readiness', CASE WHEN us.study_route = 'unconfirmed' THEN NULL
                             ELSE public.compute_readiness_score(p_user_id, us.subject_id, 'as') END,
        'a2_readiness', CASE WHEN us.study_route IN ('unconfirmed', 'as_only') THEN NULL
                             WHEN us.study_route = 'staged' AND us.current_stage::TEXT = 'as' THEN NULL
                             ELSE public.compute_readiness_score(p_user_id, us.subject_id, 'a2') END,
        -- Legacy readiness field for backward compatibility
        'readiness', CASE
          WHEN us.study_route = 'unconfirmed' THEN NULL
          WHEN us.study_route = 'full_level'  THEN NULL  -- do not silently choose one stage
          ELSE public.compute_readiness_score(p_user_id, us.subject_id, 'as')
        END
      ))
      FROM   public.user_subjects us
      JOIN   public.subjects s ON s.id = us.subject_id
      WHERE  us.user_id     = p_user_id
        AND  us.is_archived = FALSE
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_user_dashboard_stats IS
  'Returns dashboard data using the user''s local date. '
  'overall_readiness removed — no combined score. '
  'subject_readiness includes user_subject_id, as_readiness, a2_readiness, study_route, current_stage. '
  'Legacy readiness field: NULL for unconfirmed and full_level; as_readiness otherwise. '
  'Auth: raises 42501 on user_id mismatch or unauthenticated caller.';


-- ════════════════════════════════════════════════════════════
-- 13. RLS: user_chapters — accessibility-gated INSERT/UPDATE
--     Drops the old permissive policies and replaces them with ones
--     that call user_can_access_chapter. This enforces chapter access
--     at the database layer — direct Supabase writes are also blocked.
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "user_chapters_insert_own" ON public.user_chapters;
DROP POLICY IF EXISTS "user_chapters_update_own" ON public.user_chapters;

CREATE POLICY "user_chapters_insert_accessible"
  ON public.user_chapters FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.user_can_access_chapter(auth.uid(), chapter_id)
  );

CREATE POLICY "user_chapters_update_accessible"
  ON public.user_chapters FOR UPDATE
  USING  (auth.uid() = user_id)  -- ownership on existing row
  WITH CHECK (
    auth.uid() = user_id
    AND public.user_can_access_chapter(auth.uid(), chapter_id)
  );

COMMENT ON POLICY "user_chapters_insert_accessible" ON public.user_chapters IS
  'INSERT allowed only when the chapter is accessible under the user''s confirmed route. '
  'Blocks direct Supabase writes to inaccessible chapters.';

COMMENT ON POLICY "user_chapters_update_accessible" ON public.user_chapters IS
  'UPDATE: USING checks ownership; WITH CHECK also requires chapter accessibility. '
  'Prevents updating a chapter the user cannot access even via direct API calls.';


-- ════════════════════════════════════════════════════════════
-- 14. RLS: past_papers — stage-access INSERT & UPDATE
--     INSERT: WITH CHECK enforces ownership and stage-access rules
--             (stage=a2 requires unlocked A2).
--     UPDATE: USING allows selecting own papers (including stage=NULL);
--             WITH CHECK enforces ownership and stage-access rules for new stage.
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "past_papers_insert_own" ON public.past_papers;
DROP POLICY IF EXISTS "past_papers_update_own" ON public.past_papers;

CREATE POLICY "past_papers_insert_accessible"
  ON public.past_papers FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      -- New papers MUST specify stage 'as' or 'a2'
      (stage = 'as' AND EXISTS (
        SELECT 1 FROM public.user_subjects us
        WHERE  us.user_id     = auth.uid()
          AND  us.subject_id  = past_papers.subject_id
          AND  us.study_route != 'unconfirmed'
          AND  us.is_archived = FALSE
      ))
      -- Setting stage='a2': only when A2 is unlocked for this subject
      OR (stage = 'a2' AND EXISTS (
        SELECT 1 FROM public.user_subjects us
        WHERE  us.user_id          = auth.uid()
          AND  us.subject_id       = past_papers.subject_id
          AND  us.current_stage::TEXT IN ('a2', 'full')
          AND  us.is_archived      = FALSE
      ))
    )
  );

CREATE POLICY "past_papers_update_own"
  ON public.past_papers FOR UPDATE
  USING  (auth.uid() = user_id)   -- ownership on existing row (stage=NULL papers included)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      -- Keeping stage NULL: always allowed
      stage IS NULL
      -- Setting stage='as': allowed for any confirmed enrollment
      OR (stage = 'as' AND EXISTS (
        SELECT 1 FROM public.user_subjects us
        WHERE  us.user_id     = auth.uid()
          AND  us.subject_id  = past_papers.subject_id
          AND  us.study_route != 'unconfirmed'
          AND  us.is_archived = FALSE
      ))
      -- Setting stage='a2': only when A2 is unlocked for this subject
      OR (stage = 'a2' AND EXISTS (
        SELECT 1 FROM public.user_subjects us
        WHERE  us.user_id          = auth.uid()
          AND  us.subject_id       = past_papers.subject_id
          AND  us.current_stage::TEXT IN ('a2', 'full')
          AND  us.is_archived      = FALSE
      ))
    )
  );

COMMENT ON POLICY "past_papers_insert_accessible" ON public.past_papers IS
  'INSERT: requires explicit stage in (as, a2). stage=as requires confirmed route; '
  'stage=a2 requires A2 unlocked for the subject. Prevents inserting an A2 paper before unlocking A2.';

COMMENT ON POLICY "past_papers_update_own" ON public.past_papers IS
  'USING: ownership only — legacy stage=NULL papers can be updated. '
  'WITH CHECK: stage=NULL always allowed; stage=as requires confirmed route; '
  'stage=a2 requires A2 unlocked for the subject. Prevents labelling a paper as A2 before unlocking A2.';


-- ════════════════════════════════════════════════════════════
-- 15. TABLE PERMISSIONS: grant access for Migration 020 tables
-- ════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subject_stage_results TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subject_paper_selections TO authenticated, service_role;


-- ════════════════════════════════════════════════════════════
-- END OF MIGRATION 021
-- ════════════════════════════════════════════════════════════
