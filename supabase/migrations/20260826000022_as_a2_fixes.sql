-- ============================================================
-- MIGRATION 022: AS/A2 Fixes & Gamification Accounting Hardening
-- 1. Add completion_attempt to daily_missions
-- 2. Pure 2 Mathematics chapter classification -> route_dependent
-- 3. configure_subject_route -> auto-populate user_chapters for accessible chapters
-- 4. transition_to_a2 -> upsert duplicate AS results and populate A2 user_chapters
-- 5. generate_daily_missions -> exclude skipped missions, allow budget-based regeneration
-- 6. get_user_dashboard_stats -> include profiles.username
-- 7. set_onboarding_subjects -> atomic subject selection guarded by onboarding_completed = FALSE (max 5)
-- 8. sync_xp_to_profile -> strict ledger tracking profiles.total_xp = SUM(xp_events)
-- 9. check_and_unlock_achievements -> auth protected, associate unlocked achievements with mission and attempt
-- 10. complete_mission -> validate user local date, track attempts, return full breakdown, associate XP events with attempt
-- 11. undo_mission_completion -> exact attempt-scoped reversal of mission XP, bonus XP, and achievements
-- 12. Declarative backfill of user_chapters for existing confirmed enrollments (auth-independent)
-- ============================================================

-- ─── 1. Add completion_attempt to daily_missions ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'daily_missions'
      AND column_name = 'completion_attempt'
  ) THEN
    ALTER TABLE public.daily_missions
      ADD COLUMN completion_attempt INTEGER NOT NULL DEFAULT 0;
  END IF;
END;
$$;

COMMENT ON COLUMN public.daily_missions.completion_attempt IS
  'Monotonically increasing completion attempt counter. Scopes XP events and undos to the specific attempt.';


-- ─── 2. Pure 2 Mathematics Chapter Classification ───────────────────────────
UPDATE public.chapters
SET    stage = 'route_dependent'
WHERE  subject_id = extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709')
  AND  component = 'Pure 2';


-- ─── 3. Atomic Onboarding Subject Selection Function ─────────────────────────
CREATE OR REPLACE FUNCTION public.set_onboarding_subjects(
  p_user_id     UUID,
  p_subject_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_onboarding_done BOOLEAN;
  v_count           INTEGER;
  v_idx             INTEGER;
  v_subj_id         UUID;
BEGIN
  -- Auth guard
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Verify onboarding is not completed
  SELECT onboarding_completed INTO v_onboarding_done
  FROM   public.profiles
  WHERE  id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_onboarding_done THEN
    RAISE EXCEPTION 'Onboarding has already been completed' USING ERRCODE = 'P0001';
  END IF;

  -- Validate subject count (1 to 5 aligned with user_subjects priority constraint)
  v_count := cardinality(p_subject_ids);
  IF v_count IS NULL OR v_count < 1 OR v_count > 5 THEN
    RAISE EXCEPTION 'Must select between 1 and 5 subjects' USING ERRCODE = 'P0003';
  END IF;

  -- Verify all subjects exist in public.subjects
  IF (SELECT COUNT(DISTINCT id) FROM public.subjects WHERE id = ANY(p_subject_ids)) != v_count THEN
    RAISE EXCEPTION 'One or more selected subjects do not exist' USING ERRCODE = 'P0003';
  END IF;

  -- 1. Remove stale unselected subjects for this user
  DELETE FROM public.user_subjects
  WHERE  user_id = p_user_id
    AND  subject_id != ALL(p_subject_ids);

  -- 2. Upsert the selected subjects with priority 1..N
  FOR v_idx IN 1..v_count LOOP
    v_subj_id := p_subject_ids[v_idx];

    INSERT INTO public.user_subjects (
      user_id,
      subject_id,
      priority,
      study_route,
      current_stage,
      is_archived
    ) VALUES (
      p_user_id,
      v_subj_id,
      v_idx::SMALLINT,
      'unconfirmed',
      NULL,
      FALSE
    )
    ON CONFLICT (user_id, subject_id) DO UPDATE SET
      priority    = EXCLUDED.priority,
      is_archived = FALSE,
      updated_at  = NOW();
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.set_onboarding_subjects(UUID, UUID[]) IS
  'Atomic onboarding subject selection. Only allowed while onboarding_completed = FALSE. '
  'Enforces 1-5 subjects and atomic delete/upsert rollback.';

REVOKE ALL ON FUNCTION public.set_onboarding_subjects(UUID, UUID[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_onboarding_subjects(UUID, UUID[]) TO authenticated, service_role;


-- ─── 4. configure_subject_route (Updated) ───────────────────────────────────
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
  v_us         public.user_subjects%ROWTYPE;
  v_subject_id UUID;
  v_new_stage  subject_stage_enum;
  v_sel        JSONB;
  v_comp       TEXT;
  v_sel_stage  TEXT;
  v_paper_num  SMALLINT;
BEGIN
  -- Auth guard
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
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

  v_new_stage := CASE p_route
    WHEN 'as_only'    THEN 'as'::subject_stage_enum
    WHEN 'staged'     THEN 'as'::subject_stage_enum
    WHEN 'full_level' THEN 'full'::subject_stage_enum
  END;

  FOR v_sel IN SELECT * FROM jsonb_array_elements(p_paper_selections) LOOP
    v_comp      := v_sel->>'component_name';
    v_sel_stage := v_sel->>'stage';
    v_paper_num := (v_sel->>'paper_number')::SMALLINT;

    IF NOT EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE  c.subject_id = v_subject_id
        AND  c.component  = v_comp
    ) THEN
      RAISE EXCEPTION 'Component "%" does not belong to subject %', v_comp, v_subject_id
        USING ERRCODE = 'P0003';
    END IF;

    IF v_sel_stage NOT IN ('as', 'a2') THEN
      RAISE EXCEPTION 'Paper selection stage must be ''as'' or ''a2'', got: %', v_sel_stage
        USING ERRCODE = 'P0003';
    END IF;

    IF p_route = 'as_only' AND v_sel_stage = 'a2' THEN
      RAISE EXCEPTION 'as_only route cannot have A2 paper selections'
        USING ERRCODE = 'P0003';
    END IF;
  END LOOP;

  UPDATE public.user_subjects
  SET
    study_route      = p_route,
    current_stage    = v_new_stage,
    a2_unlocked_at   = CASE WHEN v_new_stage::TEXT = 'a2' THEN a2_unlocked_at ELSE NULL END,
    a2_unlock_method = CASE WHEN v_new_stage::TEXT = 'a2' THEN a2_unlock_method ELSE NULL END,
    updated_at       = NOW()
  WHERE id = p_user_subject_id;

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

  INSERT INTO public.user_chapters (user_id, chapter_id, notes_status)
  SELECT p_user_id, c.id, 'none'
  FROM   public.chapters c
  WHERE  c.subject_id = v_subject_id
    AND  public.user_can_access_chapter(p_user_id, c.id)
  ON CONFLICT (user_id, chapter_id) DO NOTHING;

  PERFORM public.cancel_inaccessible_missions(p_user_id, p_user_subject_id);
END;
$$;

COMMENT ON FUNCTION public.configure_subject_route(UUID, UUID, study_route_enum, JSONB) IS
  'Atomic: sets study_route + current_stage + paper selections, auto-creates accessible user_chapters, '
  'and cancels inaccessible missions in one transaction.';

REVOKE ALL ON FUNCTION public.configure_subject_route(UUID, UUID, study_route_enum, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.configure_subject_route(UUID, UUID, study_route_enum, JSONB) TO authenticated, service_role;


-- ─── 5. transition_to_a2 (Updated) ──────────────────────────────────────────
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
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
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
    (p_result_type  IS NOT NULL)::INTEGER +
    (p_score_obtained IS NOT NULL)::INTEGER +
    (p_score_maximum  IS NOT NULL)::INTEGER +
    (p_exam_series   IS NOT NULL)::INTEGER +
    (p_exam_year     IS NOT NULL)::INTEGER
  ) NOT IN (0, 5);

  IF v_result_partial THEN
    RAISE EXCEPTION 'Provide all result fields or none' USING ERRCODE = 'P0001';
  END IF;

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

  IF v_has_result THEN
    INSERT INTO public.subject_stage_results (
      user_subject_id, stage, result_type,
      score_obtained, score_maximum,
      exam_series, exam_year, carry_forward
    ) VALUES (
      p_user_subject_id, 'as', p_result_type,
      p_score_obtained, p_score_maximum,
      p_exam_series, p_exam_year, p_carry_forward
    )
    ON CONFLICT (user_subject_id, stage, result_type, exam_series, exam_year)
    DO UPDATE SET
      score_obtained = EXCLUDED.score_obtained,
      score_maximum  = EXCLUDED.score_maximum,
      carry_forward  = EXCLUDED.carry_forward,
      created_at     = NOW();
  END IF;

  UPDATE public.user_subjects
  SET
    study_route      = CASE WHEN v_us.study_route::TEXT = 'as_only' THEN 'staged'::study_route_enum
                            ELSE v_us.study_route END,
    current_stage    = 'a2'::subject_stage_enum,
    a2_unlocked_at   = NOW(),
    a2_unlock_method = p_unlock_method,
    updated_at       = NOW()
  WHERE id = p_user_subject_id;

  INSERT INTO public.user_chapters (user_id, chapter_id, notes_status)
  SELECT p_user_id, c.id, 'none'
  FROM   public.chapters c
  WHERE  c.subject_id = v_us.subject_id
    AND  public.user_can_access_chapter(p_user_id, c.id)
  ON CONFLICT (user_id, chapter_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.transition_to_a2(UUID, UUID, a2_unlock_method_enum, result_type_enum, SMALLINT, SMALLINT, paper_session_enum, SMALLINT, BOOLEAN) IS
  'Atomic A2 unlock: upserts AS result (reusing/updating on duplicate key), unlocks A2, and auto-populates A2 user_chapters.';

REVOKE ALL ON FUNCTION public.transition_to_a2(UUID, UUID, a2_unlock_method_enum, result_type_enum, SMALLINT, SMALLINT, paper_session_enum, SMALLINT, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.transition_to_a2(UUID, UUID, a2_unlock_method_enum, result_type_enum, SMALLINT, SMALLINT, paper_session_enum, SMALLINT, BOOLEAN) TO authenticated, service_role;


-- ─── 6. generate_daily_missions (Updated) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_daily_missions(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today          DATE;
  v_active_count   INTEGER;
  v_inserted       INTEGER := 0;
  v_budget         INTEGER;
  v_max_missions   INTEGER;
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

  SELECT max_missions_per_day
  INTO   v_max_missions
  FROM   public.user_settings
  WHERE  user_id = p_user_id;

  v_max_missions := COALESCE(v_max_missions, 3);

  SELECT COUNT(*) INTO v_active_count
  FROM   public.daily_missions
  WHERE  user_id = p_user_id
    AND  mission_date = v_today
    AND  status != 'skipped';

  v_budget := v_max_missions - v_active_count;
  IF v_budget <= 0 THEN
    UPDATE public.user_settings SET missions_last_generated_date = v_today WHERE user_id = p_user_id;
    RETURN 0;
  END IF;

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
        AND  us.study_route::TEXT != 'unconfirmed'
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
    LIMIT v_budget * 2
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
    IF v_rows > 0 THEN
      v_inserted := v_inserted + 1;
      v_budget   := v_budget - 1;
      EXIT WHEN v_budget <= 0;
    END IF;
  END LOOP;

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
    IF v_rows > 0 THEN
      v_inserted := v_inserted + 1;
    END IF;
  END IF;

  UPDATE public.user_settings
  SET    missions_last_generated_date = v_today
  WHERE  user_id = p_user_id;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.generate_daily_missions(UUID) IS
  'Generates daily missions. Excludes skipped missions from budget count, allowing dynamic replenishment.';

REVOKE ALL ON FUNCTION public.generate_daily_missions(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generate_daily_missions(UUID) TO authenticated, service_role;


-- ─── 7. get_user_dashboard_stats (Updated) ──────────────────────────────────
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
      'username',      v_profile.username,
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
        'as_readiness', CASE WHEN us.study_route = 'unconfirmed' THEN NULL
                             ELSE public.compute_readiness_score(p_user_id, us.subject_id, 'as') END,
        'a2_readiness', CASE WHEN us.study_route IN ('unconfirmed', 'as_only') THEN NULL
                             WHEN us.study_route = 'staged' AND us.current_stage::TEXT = 'as' THEN NULL
                             ELSE public.compute_readiness_score(p_user_id, us.subject_id, 'a2') END,
        'readiness', CASE
          WHEN us.study_route = 'unconfirmed' THEN NULL
          WHEN us.study_route = 'full_level'  THEN NULL
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

COMMENT ON FUNCTION public.get_user_dashboard_stats(UUID) IS
  'Returns dashboard aggregate payload including username, streak, per-stage readiness, and today missions.';

REVOKE ALL ON FUNCTION public.get_user_dashboard_stats(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_user_dashboard_stats(UUID) TO authenticated, service_role;


-- ─── 8. sync_xp_to_profile (Strict Ledger Invariant) ─────────────────────────
CREATE OR REPLACE FUNCTION public.sync_xp_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    total_xp      = total_xp + NEW.xp_amount,
    current_level = public.compute_level(total_xp + NEW.xp_amount),
    updated_at    = NOW()
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_xp_to_profile() IS
  'Trigger function on xp_events insert: strictly updates profile total_xp to maintain profiles.total_xp = SUM(xp_events.xp_amount).';


-- ─── 9. check_and_unlock_achievements (Auth Protected & Mission/Attempt Scope) ───
DROP FUNCTION IF EXISTS public.check_and_unlock_achievements(UUID);

CREATE OR REPLACE FUNCTION public.check_and_unlock_achievements(
  p_user_id    UUID,
  p_mission_id UUID    DEFAULT NULL,
  p_attempt    INTEGER DEFAULT NULL
)
RETURNS TABLE(achievement_key TEXT, xp_reward SMALLINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec           RECORD;
  v_condition_met BOOLEAN;
  v_inserted      INTEGER;
  v_today         DATE;
  v_timezone      TEXT;
BEGIN
  -- Auth guard
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_today := public.get_user_local_date(p_user_id);
  v_timezone := public.get_user_timezone(p_user_id);

  FOR v_rec IN
    SELECT ad.*
    FROM public.achievement_definitions ad
    WHERE ad.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_achievements ua
        WHERE ua.user_id = p_user_id
          AND ua.achievement_key = ad.key
      )
  LOOP
    v_condition_met := FALSE;

    CASE v_rec.key
      WHEN 'first_blood' THEN
        SELECT COUNT(*) > 0 INTO v_condition_met
        FROM public.user_chapters
        WHERE user_id = p_user_id AND notes_status = 'complete';

      WHEN 'paper_hunter' THEN
        SELECT COUNT(*) > 0 INTO v_condition_met
        FROM public.past_papers
        WHERE user_id = p_user_id;

      WHEN 'five_papers' THEN
        SELECT COUNT(*) >= 5 INTO v_condition_met
        FROM public.past_papers
        WHERE user_id = p_user_id;

      WHEN 'ten_papers' THEN
        SELECT COUNT(*) >= 10 INTO v_condition_met
        FROM public.past_papers
        WHERE user_id = p_user_id;

      WHEN 'ace' THEN
        SELECT COUNT(*) > 0 INTO v_condition_met
        FROM public.past_papers
        WHERE user_id = p_user_id AND accuracy_pct >= 90;

      WHEN 'perfect_score' THEN
        SELECT COUNT(*) > 0 INTO v_condition_met
        FROM public.past_papers
        WHERE user_id = p_user_id AND accuracy_pct = 100;

      WHEN 'streak_7' THEN
        SELECT current_streak >= 7 INTO v_condition_met
        FROM public.streaks
        WHERE user_id = p_user_id;

      WHEN 'streak_30' THEN
        SELECT current_streak >= 30 INTO v_condition_met
        FROM public.streaks
        WHERE user_id = p_user_id;

      WHEN 'streak_100' THEN
        SELECT current_streak >= 100 INTO v_condition_met
        FROM public.streaks
        WHERE user_id = p_user_id;

      WHEN 'completionist' THEN
        SELECT EXISTS (
          SELECT us.subject_id
          FROM public.user_subjects us
          WHERE us.user_id = p_user_id AND us.is_archived = FALSE
          GROUP BY us.subject_id
          HAVING
            (SELECT COUNT(*)
             FROM public.chapters c
             WHERE c.subject_id = us.subject_id AND c.is_global = TRUE)
            =
            (SELECT COUNT(*)
             FROM public.user_chapters uc
             JOIN public.chapters c ON c.id = uc.chapter_id
             WHERE uc.user_id = p_user_id
               AND c.subject_id = us.subject_id
               AND uc.notes_status = 'complete')
        ) INTO v_condition_met;

      WHEN 'speed_run' THEN
        SELECT COUNT(*) >= 3 INTO v_condition_met
        FROM public.daily_missions
        WHERE user_id = p_user_id
          AND status = 'completed'
          AND mission_date = v_today;

      WHEN 'night_owl' THEN
        SELECT COUNT(*) > 0 INTO v_condition_met
        FROM public.xp_events
        WHERE user_id = p_user_id
          AND EXTRACT(HOUR FROM (created_at AT TIME ZONE v_timezone)) < 4;

      WHEN 'multi_subject' THEN
        SELECT COUNT(*) >= 3 INTO v_condition_met
        FROM public.user_subjects
        WHERE user_id = p_user_id AND is_archived = FALSE;

      WHEN 'level_5' THEN
        SELECT current_level >= 5 INTO v_condition_met
        FROM public.profiles
        WHERE id = p_user_id;

      WHEN 'level_10' THEN
        SELECT current_level >= 10 INTO v_condition_met
        FROM public.profiles
        WHERE id = p_user_id;

      WHEN 'atlas_legend' THEN
        SELECT current_level >= 15 INTO v_condition_met
        FROM public.profiles
        WHERE id = p_user_id;

      WHEN 'consistent' THEN
        SELECT COUNT(DISTINCT mission_date) >= 14 INTO v_condition_met
        FROM public.daily_missions
        WHERE user_id = p_user_id AND status = 'completed';

      WHEN 'high_confidence' THEN
        SELECT AVG(confidence_level) >= 4 INTO v_condition_met
        FROM public.user_chapters
        WHERE user_id = p_user_id AND confidence_level IS NOT NULL;

      WHEN 'docs_connected' THEN
        SELECT COUNT(*) > 0 INTO v_condition_met
        FROM public.google_docs_tokens
        WHERE user_id = p_user_id;

      WHEN 'linked_notes' THEN
        SELECT COUNT(*) >= 5 INTO v_condition_met
        FROM public.user_chapters
        WHERE user_id = p_user_id AND google_doc_id IS NOT NULL;

      ELSE
        v_condition_met := FALSE;
    END CASE;

    IF v_condition_met THEN
      INSERT INTO public.user_achievements (user_id, achievement_key)
      VALUES (p_user_id, v_rec.key)
      ON CONFLICT ON CONSTRAINT user_achievements_unique DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;

      IF v_inserted = 1 THEN
        IF v_rec.xp_reward > 0 THEN
          PERFORM public.award_xp(
            p_user_id,
            v_rec.xp_reward,
            'achievement_unlock',
            p_mission_id,
            jsonb_build_object(
              'achievement_key', v_rec.key,
              'mission_id', p_mission_id,
              'completion_attempt', p_attempt
            )
          );
        END IF;

        achievement_key := v_rec.key;
        xp_reward := v_rec.xp_reward;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_and_unlock_achievements(UUID, UUID, INTEGER) IS
  'Evaluates achievements using local date. Auth protected. Associates XP events with mission attempt when invoked from complete_mission.';

REVOKE ALL ON FUNCTION public.check_and_unlock_achievements(UUID, UUID, INTEGER) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_and_unlock_achievements(UUID, UUID, INTEGER) TO authenticated, service_role;


-- ─── 10. complete_mission (Updated with Date Guard & Attempt Tracking) ────────
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
  v_bonus_xp     SMALLINT := 0;
  v_total_xp     SMALLINT := 0;
  v_attempt      INTEGER;
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

  -- Date guard: mission must be on user's current local date
  IF v_mission.mission_date != v_today THEN
    RAISE EXCEPTION 'Missions can only be completed on their scheduled local calendar day'
      USING ERRCODE = 'P0006';
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

  -- Increment completion attempt counter
  v_attempt := COALESCE(v_mission.completion_attempt, 0) + 1;

  -- Mark complete and store attempt
  UPDATE public.daily_missions
  SET    status             = 'completed',
         completed_at       = NOW(),
         completion_attempt = v_attempt
  WHERE  id = p_mission_id;

  -- Award mission XP associated with this attempt
  PERFORM public.award_xp(
    p_user_id, v_mission.xp_reward, 'mission_complete',
    p_mission_id,
    jsonb_build_object(
      'mission_type', v_mission.type,
      'completion_attempt', v_attempt
    )
  );

  -- All-missions-complete bonus — associated with this mission and attempt
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_missions
    WHERE  user_id      = p_user_id
      AND  mission_date = v_today
      AND  status       = 'pending'
      AND  id           != p_mission_id
  ) THEN
    v_bonus_xp := 25;
    PERFORM public.award_xp(
      p_user_id, 25, 'mission_complete',
      p_mission_id,
      jsonb_build_object(
        'bonus', 'all_missions_complete',
        'completion_attempt', v_attempt
      )
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

  -- Check achievements passing mission_id and attempt
  FOR rec IN SELECT * FROM public.check_and_unlock_achievements(p_user_id, p_mission_id, v_attempt) LOOP
    v_achievements := v_achievements || jsonb_build_object(
      'key', rec.achievement_key, 'xp', rec.xp_reward
    );
    v_ach_xp := v_ach_xp + rec.xp_reward;
  END LOOP;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  SELECT * INTO v_streak  FROM public.streaks  WHERE user_id = p_user_id;

  v_total_xp := v_mission.xp_reward + v_bonus_xp + v_ach_xp;

  RETURN jsonb_build_object(
    'mission_xp',            v_mission.xp_reward,
    'daily_bonus_xp',        v_bonus_xp,
    'achievement_xp',        v_ach_xp,
    'total_xp_awarded',      v_total_xp,
    'xp_awarded',            v_total_xp,
    'new_total_xp',          v_profile.total_xp,
    'new_level',             v_profile.current_level,
    'level_title',           public.compute_level_title(v_profile.current_level),
    'streak_days',           v_streak.current_streak,
    'achievements_unlocked', v_achievements
  );
END;
$$;

COMMENT ON FUNCTION public.complete_mission(UUID, UUID) IS
  'Atomic mission completion. Validates user local date, increments attempt, awards XP, updates streak, checks achievements, returns full breakdown.';

REVOKE ALL ON FUNCTION public.complete_mission(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.complete_mission(UUID, UUID) TO authenticated, service_role;


-- ─── 11. undo_mission_completion (Updated with Exact Attempt Reversal) ────────
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
  v_mission_xp       SMALLINT := 0;
  v_bonus_xp         SMALLINT := 0;
  v_ach_reversed     SMALLINT := 0;
  v_total_reversal   SMALLINT := 0;
  v_profile          public.profiles%ROWTYPE;
  v_streak           public.streaks%ROWTYPE;
  v_ach_rec          RECORD;
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

  -- ── Duplicate undo check for CURRENT completion attempt ──────────────────
  IF EXISTS (
    SELECT 1 FROM public.xp_events
    WHERE  user_id      = p_user_id
      AND  reference_id = p_mission_id
      AND  event_type   = 'mission_undo'
      AND  (metadata->>'completion_attempt')::INTEGER = v_mission.completion_attempt
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

  -- ── Query exact XP events for THIS completion attempt ────────────────────
  -- 1. Mission XP
  SELECT COALESCE(SUM(xp_amount), 0)::SMALLINT
  INTO   v_mission_xp
  FROM   public.xp_events
  WHERE  user_id      = p_user_id
    AND  reference_id = p_mission_id
    AND  event_type   = 'mission_complete'
    AND  metadata->>'bonus' IS NULL
    AND  (metadata->>'completion_attempt')::INTEGER = v_mission.completion_attempt;

  -- 2. Daily bonus XP
  SELECT COALESCE(SUM(xp_amount), 0)::SMALLINT
  INTO   v_bonus_xp
  FROM   public.xp_events
  WHERE  user_id      = p_user_id
    AND  reference_id = p_mission_id
    AND  event_type   = 'mission_complete'
    AND  metadata->>'bonus' = 'all_missions_complete'
    AND  (metadata->>'completion_attempt')::INTEGER = v_mission.completion_attempt;

  -- 3. Achievements unlocked during THIS completion attempt
  FOR v_ach_rec IN
    SELECT xp_amount, metadata->>'achievement_key' AS achievement_key
    FROM   public.xp_events
    WHERE  user_id      = p_user_id
      AND  reference_id = p_mission_id
      AND  event_type   = 'achievement_unlock'
      AND  (metadata->>'completion_attempt')::INTEGER = v_mission.completion_attempt
  LOOP
    -- Delete achievement record so it can be earned again
    DELETE FROM public.user_achievements
    WHERE  user_id         = p_user_id
      AND  achievement_key = v_ach_rec.achievement_key;

    -- Reverse achievement XP
    PERFORM public.award_xp(
      p_user_id,
      (-v_ach_rec.xp_amount)::SMALLINT,
      'mission_undo',
      p_mission_id,
      jsonb_build_object(
        'reversed_achievement_key', v_ach_rec.achievement_key,
        'completion_attempt', v_mission.completion_attempt
      )
    );
    v_ach_reversed := v_ach_reversed + v_ach_rec.xp_amount;
  END LOOP;

  -- ── Reverse mission XP ───────────────────────────────────────────────────
  IF v_mission_xp > 0 THEN
    PERFORM public.award_xp(
      p_user_id,
      (-v_mission_xp)::SMALLINT,
      'mission_undo',
      p_mission_id,
      jsonb_build_object(
        'reversed_mission_type', v_mission.type,
        'completion_attempt', v_mission.completion_attempt
      )
    );
  END IF;

  -- ── Reverse bonus XP ─────────────────────────────────────────────────────
  IF v_bonus_xp > 0 THEN
    PERFORM public.award_xp(
      p_user_id,
      (-v_bonus_xp)::SMALLINT,
      'mission_undo',
      p_mission_id,
      jsonb_build_object(
        'reversed_bonus', 'all_missions_complete',
        'completion_attempt', v_mission.completion_attempt
      )
    );
  END IF;

  -- ── Restore mission to pending ───────────────────────────────────────────
  UPDATE public.daily_missions
  SET    status       = 'pending',
         completed_at = NULL
  WHERE  id = p_mission_id;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  SELECT * INTO v_streak  FROM public.streaks  WHERE user_id = p_user_id;

  v_total_reversal := v_mission_xp + v_bonus_xp + v_ach_reversed;

  RETURN jsonb_build_object(
    'xp_reversed',             v_total_reversal,
    'mission_xp_reversed',     v_mission_xp,
    'daily_bonus_xp_reversed', v_bonus_xp,
    'achievement_xp_reversed', v_ach_reversed,
    'new_total_xp',            v_profile.total_xp,
    'new_level',               v_profile.current_level,
    'level_title',             public.compute_level_title(v_profile.current_level),
    'streak_days',             v_streak.current_streak,
    'mission_status',          'pending'
  );
END;
$$;

COMMENT ON FUNCTION public.undo_mission_completion(UUID, UUID) IS
  'Atomic attempt-scoped mission undo. Reverses mission XP, bonus, and unlocked achievements, and restores pending state.';

REVOKE ALL ON FUNCTION public.undo_mission_completion(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.undo_mission_completion(UUID, UUID) TO authenticated, service_role;


-- ─── 12. Declarative Backfill of user_chapters (Auth-Independent) ────────────
-- Uses relational joins instead of user_can_access_chapter so it executes
-- correctly during migrations when auth.uid() IS NULL.
INSERT INTO public.user_chapters (user_id, chapter_id, notes_status)
SELECT us.user_id, c.id, 'none'
FROM   public.user_subjects us
JOIN   public.chapters c ON c.subject_id = us.subject_id
WHERE  us.is_archived = FALSE
  AND  us.study_route::TEXT != 'unconfirmed'
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
ON CONFLICT (user_id, chapter_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- END OF MIGRATION 022
-- ════════════════════════════════════════════════════════════
