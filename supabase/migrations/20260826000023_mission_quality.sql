-- ============================================================
-- MIGRATION 023: Mission Quality, Daily Workload & Variety Balancing
-- 1. Add estimated_minutes to daily_missions (BETWEEN 5 AND 120)
-- 2. Backfill estimated_minutes on existing daily_missions
-- 3. Constrain user_settings.max_missions_per_day to 1..3 (backfill >3 to 3)
-- 4. Direct manipulation security: Revoke INSERT/UPDATE/DELETE from client roles
-- 5. Overhaul generate_daily_missions (60–120m workload promise, strict relevance, variety)
-- 6. Add atomic, pre-validated replace_mission RPC
-- ============================================================

-- ─── 1. Add estimated_minutes to daily_missions ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'daily_missions'
      AND column_name = 'estimated_minutes'
  ) THEN
    ALTER TABLE public.daily_missions
      ADD COLUMN estimated_minutes SMALLINT NOT NULL DEFAULT 30
      CONSTRAINT daily_missions_estimated_minutes_check CHECK (estimated_minutes BETWEEN 5 AND 120);
  END IF;
END;
$$;

COMMENT ON COLUMN public.daily_missions.estimated_minutes IS
  'Estimated time in minutes to complete this study mission (typically 10 to 60 mins).';


-- ─── 2. Backfill estimated_minutes on existing daily_missions ────────────────
UPDATE public.daily_missions
SET estimated_minutes = CASE type
  WHEN 'confidence_check'   THEN 10
  WHEN 'review_chapter'      THEN 20
  WHEN 'complete_notes'      THEN 30
  WHEN 'revisit_weak_topic'  THEN 30
  WHEN 'attempt_paper'       THEN 60
  ELSE 30
END;


-- ─── 3. Constrain user_settings.max_missions_per_day to 1..3 ─────────────────
UPDATE public.user_settings
SET max_missions_per_day = 3
WHERE max_missions_per_day > 3;

ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_max_missions_check,
  DROP CONSTRAINT IF EXISTS user_settings_max_missions_per_day_check;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_max_missions_per_day_check
  CHECK (max_missions_per_day BETWEEN 1 AND 3);

COMMENT ON COLUMN public.user_settings.max_missions_per_day IS
  'Maximum active daily missions generated per day (constrained to 1..3 for MVP).';


-- ─── 4. Protect daily_missions from Direct Client Mutation ───────────────────
-- Revoke direct table mutations from client roles; mutations must run via SECURITY DEFINER RPCs
REVOKE INSERT, UPDATE, DELETE ON TABLE public.daily_missions FROM anon, authenticated;
GRANT SELECT ON TABLE public.daily_missions TO authenticated;

DROP POLICY IF EXISTS "daily_missions_update_status" ON public.daily_missions;
DROP POLICY IF EXISTS "daily_missions_insert_own"    ON public.daily_missions;
DROP POLICY IF EXISTS "daily_missions_update_own"    ON public.daily_missions;
DROP POLICY IF EXISTS "daily_missions_delete_own"    ON public.daily_missions;
DROP POLICY IF EXISTS "daily_missions_select_own"    ON public.daily_missions;

CREATE POLICY "daily_missions_select_own"
  ON public.daily_missions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- ─── 5. generate_daily_missions (Overhauled with Workload Promise & Relevance) ──
CREATE OR REPLACE FUNCTION public.generate_daily_missions(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_today                DATE;
  v_active_count         INTEGER;
  v_inserted             INTEGER := 0;
  v_budget               INTEGER;
  v_max_missions         INTEGER;
  v_accumulated_minutes  INTEGER := 0;
  rec                    RECORD;
  v_rows                 INTEGER;
BEGIN
  -- Strict auth guard (IS DISTINCT FROM protects against NULL bypass)
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- 1. Serialize user mission generation by locking user_settings row
  SELECT max_missions_per_day
  INTO   v_max_missions
  FROM   public.user_settings
  WHERE  user_id = p_user_id
  FOR UPDATE;

  v_max_missions := LEAST(COALESCE(v_max_missions, 3), 3);
  v_today := public.get_user_local_date(p_user_id);

  -- 2. Recalculate active missions count & accumulated minutes after obtaining the lock
  SELECT COUNT(*), COALESCE(SUM(estimated_minutes), 0)
  INTO   v_active_count, v_accumulated_minutes
  FROM   public.daily_missions
  WHERE  user_id = p_user_id
    AND  mission_date = v_today
    AND  status != 'skipped';

  v_budget := v_max_missions - v_active_count;
  IF v_budget <= 0 THEN
    UPDATE public.user_settings SET missions_last_generated_date = v_today WHERE user_id = p_user_id;
    RETURN 0;
  END IF;

  -- 3. Candidate scoring and selection loop
  FOR rec IN
    WITH existing_state AS (
      SELECT
        dm.type,
        dm.target_entity_id,
        CASE
          WHEN dm.target_entity_type = 'subject' THEN dm.target_entity_id
          WHEN dm.target_entity_type = 'chapter' THEN (
            SELECT c.subject_id FROM public.user_chapters uc
            JOIN public.chapters c ON c.id = uc.chapter_id
            WHERE uc.id = dm.target_entity_id
          )
          ELSE NULL
        END AS subject_id
      FROM public.daily_missions dm
      WHERE dm.user_id = p_user_id
        AND dm.mission_date = v_today
        AND dm.status != 'skipped'
    ),
    accessible_chapters AS (
      SELECT
        uc.id                     AS user_chapter_id,
        uc.chapter_id,
        c.title                   AS chapter_title,
        c.number                  AS chapter_number,
        s.id                      AS subject_id,
        s.name                    AS subject_name,
        us.priority,
        uc.notes_status,
        uc.confidence_level,
        uc.last_reviewed_at,
        uc.revision_count,
        CASE WHEN uc.notes_status != 'complete' THEN 1.0 ELSE 0.0 END AS notes_gap,
        (5.0 - COALESCE(uc.confidence_level, 3)) / 4.0                AS confidence_gap,
        (
          SELECT AVG(pqa.marks_obtained::NUMERIC / NULLIF(pqa.marks_available, 0))
          FROM   public.paper_question_attempts pqa
          JOIN   public.past_papers pp ON pp.id = pqa.paper_id
          WHERE  pqa.chapter_id = uc.chapter_id AND pp.user_id = p_user_id
        )                                                             AS real_accuracy,
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
    ),
    scored_chapter_actions AS (
      -- Action 1: Notes task (Category A) — strictly requires notes_status != 'complete'
      SELECT
        ac.user_chapter_id AS target_entity_id,
        'chapter'::public.entity_type_enum AS target_entity_type,
        ac.subject_id,
        'complete_notes'::public.mission_type_enum AS type,
        'Work on notes for ' || ac.chapter_title AS title,
        ac.subject_name || ' · Chapter ' || ac.chapter_number || ' · Spend ~30 min drafting or updating chapter summary notes' AS description,
        50::SMALLINT AS xp_reward,
        'medium' AS difficulty,
        30::SMALLINT AS estimated_minutes,
        (ac.notes_gap * 0.50 + ac.confidence_gap * 0.20 + ac.recency_penalty * 0.30)
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + 10.0 AS score
      FROM accessible_chapters ac
      WHERE ac.notes_status != 'complete'

      UNION ALL

      -- Action 2: Weak questions task (Category B) — strictly requires real question attempts with low accuracy (<70%)
      SELECT
        ac.user_chapter_id AS target_entity_id,
        'chapter'::public.entity_type_enum AS target_entity_type,
        ac.subject_id,
        'revisit_weak_topic'::public.mission_type_enum AS type,
        'Practise weak questions from ' || ac.chapter_title AS title,
        ac.subject_name || ' · Chapter ' || ac.chapter_number || ' · Spend ~30 min tackling challenging questions and correcting mistakes' AS description,
        40::SMALLINT AS xp_reward,
        'hard' AS difficulty,
        30::SMALLINT AS estimated_minutes,
        ((1.0 - ac.real_accuracy) * 0.50 + ac.confidence_gap * 0.30 + ac.recency_penalty * 0.20)
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + 10.0 AS score
      FROM accessible_chapters ac
      WHERE ac.real_accuracy IS NOT NULL AND ac.real_accuracy < 0.70

      UNION ALL

      -- Action 3: Review chapter task (Category C)
      SELECT
        ac.user_chapter_id AS target_entity_id,
        'chapter'::public.entity_type_enum AS target_entity_type,
        ac.subject_id,
        'review_chapter'::public.mission_type_enum AS type,
        'Review ' || ac.chapter_title AS title,
        ac.subject_name || ' · Chapter ' || ac.chapter_number || ' · Spend ~20 min reviewing core concepts and key formulas' AS description,
        30::SMALLINT AS xp_reward,
        'easy' AS difficulty,
        20::SMALLINT AS estimated_minutes,
        (ac.recency_penalty * 0.60 + (1.0 - ac.confidence_gap) * 0.40)
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + 5.0 AS score
      FROM accessible_chapters ac

      UNION ALL

      -- Action 4: Confidence check task (Category C)
      SELECT
        ac.user_chapter_id AS target_entity_id,
        'chapter'::public.entity_type_enum AS target_entity_type,
        ac.subject_id,
        'confidence_check'::public.mission_type_enum AS type,
        'Rate your confidence after reviewing ' || ac.chapter_title AS title,
        ac.subject_name || ' · Chapter ' || ac.chapter_number || ' · Spend ~10 min assessing topic mastery and updating confidence' AS description,
        20::SMALLINT AS xp_reward,
        'easy' AS difficulty,
        10::SMALLINT AS estimated_minutes,
        (ac.confidence_gap * 0.50 + ac.recency_penalty * 0.50)
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + (CASE WHEN ac.confidence_level IS NULL THEN 8.0 ELSE 2.0 END) AS score
      FROM accessible_chapters ac

      UNION ALL

      -- Action 5: Timed past paper section (Category B)
      SELECT
        us.subject_id AS target_entity_id,
        'subject'::public.entity_type_enum AS target_entity_type,
        us.subject_id,
        'attempt_paper'::public.mission_type_enum AS type,
        'Attempt a timed ' || s.name || ' past-paper section' AS title,
        s.name || ' · Spend ~45–60 min completing a timed past-paper question section' AS description,
        75::SMALLINT AS xp_reward,
        'hard' AS difficulty,
        60::SMALLINT AS estimated_minutes,
        GREATEST(1.0 / NULLIF((us.exam_date - v_today)::NUMERIC, 0), 0.01) * (us.priority::NUMERIC / 3.0) * 12.0
          + (CASE WHEN NOT EXISTS (
              SELECT 1 FROM public.past_papers pp
              WHERE pp.user_id = p_user_id AND pp.subject_id = us.subject_id AND pp.attempted_at BETWEEN (v_today - 6) AND v_today
            ) THEN 15.0 ELSE 0.0 END) AS score
      FROM public.user_subjects us
      JOIN public.subjects s ON s.id = us.subject_id
      WHERE us.user_id = p_user_id
        AND us.exam_date IS NOT NULL
        AND us.exam_date > v_today
        AND us.is_archived = FALSE
        AND us.study_route::TEXT != 'unconfirmed'
    )
    SELECT
      sca.*
    FROM scored_chapter_actions sca
    ORDER BY sca.score DESC
  LOOP
    EXIT WHEN v_budget <= 0;

    -- Variety & Constraint Checks against current active state
    -- 1. Check if target_entity_id is already active today
    IF EXISTS (
      SELECT 1 FROM public.daily_missions dm
      WHERE dm.user_id = p_user_id
        AND dm.mission_date = v_today
        AND dm.status != 'skipped'
        AND dm.target_entity_id = rec.target_entity_id
    ) THEN
      CONTINUE;
    END IF;

    -- 2. Check if this exact (type, target_entity_id) already exists today (even skipped)
    IF EXISTS (
      SELECT 1 FROM public.daily_missions dm
      WHERE dm.user_id = p_user_id
        AND dm.mission_date = v_today
        AND dm.type = rec.type
        AND dm.target_entity_id = rec.target_entity_id
    ) THEN
      CONTINUE;
    END IF;

    -- 3. Check if this subject already has 2 active missions today
    IF (
      SELECT COUNT(*) FROM public.daily_missions dm
      WHERE dm.user_id = p_user_id
        AND dm.mission_date = v_today
        AND dm.status != 'skipped'
        AND (
          (dm.target_entity_type = 'subject' AND dm.target_entity_id = rec.subject_id)
          OR (dm.target_entity_type = 'chapter' AND EXISTS (
            SELECT 1 FROM public.user_chapters uc
            JOIN public.chapters c ON c.id = uc.chapter_id
            WHERE uc.id = dm.target_entity_id AND c.subject_id = rec.subject_id
          ))
        )
    ) >= 2 THEN
      CONTINUE;
    END IF;

    -- 4. Limit attempt_paper to max 1 per day (due to 60m duration)
    IF rec.type = 'attempt_paper' AND (
      SELECT COUNT(*) FROM public.daily_missions dm
      WHERE dm.user_id = p_user_id
        AND dm.mission_date = v_today
        AND dm.status != 'skipped'
        AND dm.type = 'attempt_paper'
    ) >= 1 THEN
      CONTINUE;
    END IF;

    -- 5. Limit other types to max 2 per day
    IF (
      SELECT COUNT(*) FROM public.daily_missions dm
      WHERE dm.user_id = p_user_id
        AND dm.mission_date = v_today
        AND dm.status != 'skipped'
        AND dm.type = rec.type
    ) >= 2 THEN
      CONTINUE;
    END IF;

    -- 6. Workload upper bound: never exceed 120 minutes total daily workload
    IF (v_accumulated_minutes + rec.estimated_minutes) > 120 THEN
      CONTINUE;
    END IF;

    -- 7. Workload lower bound & final-slot decision:
    -- If selecting this candidate would leave the completed 3-mission workload under 60 minutes,
    -- check whether ANY currently eligible candidate in the syllabus can bring the total to between 60 and 120 minutes.
    -- If such an eligible candidate exists, skip this shorter candidate to select the qualifying longer candidate.
    IF (v_budget = 1 AND (v_accumulated_minutes + rec.estimated_minutes) < 60)
       OR (v_budget = 2 AND (v_accumulated_minutes + rec.estimated_minutes + 60) < 60) THEN
      IF EXISTS (
        -- Check Chapter Actions (Notes 30m, Weak 30m, Review 20m, Confidence 10m)
        SELECT 1
        FROM public.user_chapters uc2
        JOIN public.chapters c2 ON c2.id = uc2.chapter_id
        JOIN public.user_subjects us2 ON us2.user_id = p_user_id AND us2.subject_id = c2.subject_id
        CROSS JOIN (VALUES
          ('complete_notes'::public.mission_type_enum, 30::SMALLINT),
          ('revisit_weak_topic'::public.mission_type_enum, 30::SMALLINT),
          ('review_chapter'::public.mission_type_enum, 20::SMALLINT),
          ('confidence_check'::public.mission_type_enum, 10::SMALLINT)
        ) AS act(act_type, est_mins)
        WHERE uc2.user_id = p_user_id
          AND us2.exam_date IS NOT NULL AND us2.exam_date > v_today AND us2.is_archived = FALSE
          AND us2.study_route::TEXT != 'unconfirmed'
          AND (
            c2.stage IN ('as', 'shared')
            OR (c2.stage = 'a2' AND us2.current_stage::TEXT IN ('a2', 'full'))
            OR (
              c2.stage = 'route_dependent'
              AND EXISTS (
                SELECT 1 FROM public.subject_paper_selections sps
                WHERE  sps.user_subject_id = us2.id
                  AND  sps.component_name  = c2.component
                  AND  (sps.stage = 'as' OR (sps.stage = 'a2' AND us2.current_stage::TEXT IN ('a2', 'full')))
              )
            )
          )
          -- Workload criteria: brings total to >= 60 and <= 120
          AND (v_accumulated_minutes + act.est_mins) BETWEEN 60 AND 120
          -- Relevance criteria
          AND (act.act_type != 'complete_notes' OR uc2.notes_status != 'complete')
          AND (act.act_type != 'revisit_weak_topic' OR (
            SELECT AVG(pqa2.marks_obtained::NUMERIC / NULLIF(pqa2.marks_available, 0))
            FROM public.paper_question_attempts pqa2
            JOIN public.past_papers pp2 ON pp2.id = pqa2.paper_id
            WHERE pqa2.chapter_id = uc2.chapter_id AND pp2.user_id = p_user_id
          ) < 0.70)
          -- Target uniqueness
          AND NOT EXISTS (
            SELECT 1 FROM public.daily_missions dm2
            WHERE dm2.user_id = p_user_id AND dm2.mission_date = v_today AND dm2.status != 'skipped'
              AND dm2.target_entity_id = uc2.id
          )
          -- Exact (type, target_entity_id) uniqueness
          AND NOT EXISTS (
            SELECT 1 FROM public.daily_missions dm2
            WHERE dm2.user_id = p_user_id AND dm2.mission_date = v_today
              AND dm2.type = act.act_type AND dm2.target_entity_id = uc2.id
          )
          -- Subject cap (<2 active)
          AND (
            SELECT COUNT(*) FROM public.daily_missions dm2
            WHERE dm2.user_id = p_user_id AND dm2.mission_date = v_today AND dm2.status != 'skipped'
              AND (
                (dm2.target_entity_type = 'subject' AND dm2.target_entity_id = c2.subject_id)
                OR (dm2.target_entity_type = 'chapter' AND EXISTS (
                  SELECT 1 FROM public.user_chapters uc3
                  JOIN public.chapters c3 ON c3.id = uc3.chapter_id
                  WHERE uc3.id = dm2.target_entity_id AND c3.subject_id = c2.subject_id
                ))
              )
          ) < 2
          -- Type cap (<2 active)
          AND (
            SELECT COUNT(*) FROM public.daily_missions dm2
            WHERE dm2.user_id = p_user_id AND dm2.mission_date = v_today AND dm2.status != 'skipped'
              AND dm2.type = act.act_type
          ) < 2

        UNION ALL

        -- Check Past Paper Actions (60m)
        SELECT 1
        FROM public.user_subjects us2
        JOIN public.subjects s2 ON s2.id = us2.subject_id
        WHERE us2.user_id = p_user_id
          AND us2.exam_date IS NOT NULL AND us2.exam_date > v_today AND us2.is_archived = FALSE
          AND us2.study_route::TEXT != 'unconfirmed'
          AND (v_accumulated_minutes + 60) BETWEEN 60 AND 120
          -- Target uniqueness
          AND NOT EXISTS (
            SELECT 1 FROM public.daily_missions dm2
            WHERE dm2.user_id = p_user_id AND dm2.mission_date = v_today AND dm2.status != 'skipped'
              AND dm2.target_entity_id = us2.subject_id
          )
          -- Exact uniqueness
          AND NOT EXISTS (
            SELECT 1 FROM public.daily_missions dm2
            WHERE dm2.user_id = p_user_id AND dm2.mission_date = v_today
              AND dm2.type = 'attempt_paper' AND dm2.target_entity_id = us2.subject_id
          )
          -- Subject cap (<2 active)
          AND (
            SELECT COUNT(*) FROM public.daily_missions dm2
            WHERE dm2.user_id = p_user_id AND dm2.mission_date = v_today AND dm2.status != 'skipped'
              AND (
                (dm2.target_entity_type = 'subject' AND dm2.target_entity_id = us2.subject_id)
                OR (dm2.target_entity_type = 'chapter' AND EXISTS (
                  SELECT 1 FROM public.user_chapters uc3
                  JOIN public.chapters c3 ON c3.id = uc3.chapter_id
                  WHERE uc3.id = dm2.target_entity_id AND c3.subject_id = us2.subject_id
                ))
              )
          ) < 2
          -- attempt_paper cap (<1 active)
          AND NOT EXISTS (
            SELECT 1 FROM public.daily_missions dm2
            WHERE dm2.user_id = p_user_id AND dm2.mission_date = v_today AND dm2.status != 'skipped'
              AND dm2.type = 'attempt_paper'
          )
      ) THEN
        CONTINUE;
      END IF;
    END IF;

    -- Insert candidate mission
    INSERT INTO public.daily_missions (
      user_id, mission_date, type, target_entity_type,
      target_entity_id, title, description, xp_reward,
      status, difficulty, estimated_minutes
    ) VALUES (
      p_user_id, v_today, rec.type, rec.target_entity_type,
      rec.target_entity_id, rec.title, rec.description, rec.xp_reward,
      'pending', rec.difficulty, rec.estimated_minutes
    )
    ON CONFLICT (user_id, mission_date, type, target_entity_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      v_inserted            := v_inserted + 1;
      v_budget              := v_budget - 1;
      v_accumulated_minutes := v_accumulated_minutes + rec.estimated_minutes;
    END IF;
  END LOOP;

  UPDATE public.user_settings
  SET    missions_last_generated_date = v_today
  WHERE  user_id = p_user_id;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.generate_daily_missions(UUID) IS
  'Generates up to 3 realistic, varied daily missions totalling 60–120 mins when sufficient content exists. Enforces max 2 per subject, varied types, and no duplicate targets.';

REVOKE ALL ON FUNCTION public.generate_daily_missions(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.generate_daily_missions(UUID) TO authenticated, service_role;


-- ─── 6. replace_mission (Atomic & Pre-Validated Mission Replacement) ───────────
CREATE OR REPLACE FUNCTION public.replace_mission(
  p_mission_id UUID,
  p_user_id    UUID,
  p_reason     TEXT DEFAULT 'replaced'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_old_mission    public.daily_missions%ROWTYPE;
  v_new_mission    public.daily_missions%ROWTYPE;
  v_old_subject_id UUID;
  v_today          DATE;
  v_max_missions   INTEGER;
  v_other_minutes  INTEGER := 0;
  rec              RECORD;
  v_rows           INTEGER;
BEGIN
  -- 1. Strict auth guard (IS DISTINCT FROM protects against NULL bypass)
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- 2. Serialize user mission changes by locking user_settings row
  SELECT max_missions_per_day
  INTO   v_max_missions
  FROM   public.user_settings
  WHERE  user_id = p_user_id
  FOR UPDATE;

  v_today := public.get_user_local_date(p_user_id);

  -- 3. Fetch and lock the pending mission to replace
  SELECT * INTO v_old_mission
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
  IF v_old_mission.mission_date != v_today THEN
    RAISE EXCEPTION 'Missions can only be replaced on their scheduled local calendar day'
      USING ERRCODE = 'P0006';
  END IF;

  -- Calculate total minutes of other active missions today
  SELECT COALESCE(SUM(dm.estimated_minutes), 0)
  INTO   v_other_minutes
  FROM   public.daily_missions dm
  WHERE  dm.user_id = p_user_id
    AND  dm.mission_date = v_today
    AND  dm.status != 'skipped'
    AND  dm.id != p_mission_id;

  -- Resolve old mission subject_id
  IF v_old_mission.target_entity_type = 'subject' THEN
    v_old_subject_id := v_old_mission.target_entity_id;
  ELSIF v_old_mission.target_entity_type = 'chapter' THEN
    SELECT c.subject_id INTO v_old_subject_id
    FROM   public.user_chapters uc
    JOIN   public.chapters c ON c.id = uc.chapter_id
    WHERE  uc.id = v_old_mission.target_entity_id;
  END IF;

  -- 4. Find exactly ONE suitable replacement candidate BEFORE modifying any rows
  -- Candidate must:
  --   a) Belong to accessible AS/A2 syllabus of confirmed enrolled subject
  --   b) Not already be active today (excluding old mission)
  --   c) Subject active count < 2 (excluding old mission)
  --   d) Type active count < 2 (excluding old mission) and attempt_paper < 1
  --   e) Exact (type, target_entity_id) not in daily_missions today (even skipped)
  --   f) Strict relevance: complete_notes requires notes_status != 'complete', revisit_weak_topic requires real_accuracy < 0.70
  --   g) Workload preservation: prioritize candidates keeping total >= 60m and never exceed 120m
  SELECT * INTO rec
  FROM (
    WITH other_active AS (
      SELECT
        dm.type,
        dm.target_entity_id,
        CASE
          WHEN dm.target_entity_type = 'subject' THEN dm.target_entity_id
          WHEN dm.target_entity_type = 'chapter' THEN (
            SELECT c.subject_id FROM public.user_chapters uc
            JOIN public.chapters c ON c.id = uc.chapter_id
            WHERE uc.id = dm.target_entity_id
          )
          ELSE NULL
        END AS subject_id
      FROM public.daily_missions dm
      WHERE dm.user_id = p_user_id
        AND dm.mission_date = v_today
        AND dm.status != 'skipped'
        AND dm.id != p_mission_id
    ),
    accessible_chapters AS (
      SELECT
        uc.id                     AS user_chapter_id,
        uc.chapter_id,
        c.title                   AS chapter_title,
        c.number                  AS chapter_number,
        s.id                      AS subject_id,
        s.name                    AS subject_name,
        us.priority,
        uc.notes_status,
        uc.confidence_level,
        uc.last_reviewed_at,
        uc.revision_count,
        CASE WHEN uc.notes_status != 'complete' THEN 1.0 ELSE 0.0 END AS notes_gap,
        (5.0 - COALESCE(uc.confidence_level, 3)) / 4.0                AS confidence_gap,
        (
          SELECT AVG(pqa.marks_obtained::NUMERIC / NULLIF(pqa.marks_available, 0))
          FROM   public.paper_question_attempts pqa
          JOIN   public.past_papers pp ON pp.id = pqa.paper_id
          WHERE  pqa.chapter_id = uc.chapter_id AND pp.user_id = p_user_id
        )                                                             AS real_accuracy,
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
    ),
    scored_chapter_actions AS (
      -- Notes action — strictly requires notes_status != 'complete'
      SELECT
        ac.user_chapter_id AS target_entity_id,
        'chapter'::public.entity_type_enum AS target_entity_type,
        ac.subject_id,
        'complete_notes'::public.mission_type_enum AS type,
        'Work on notes for ' || ac.chapter_title AS title,
        ac.subject_name || ' · Chapter ' || ac.chapter_number || ' · Spend ~30 min drafting or updating chapter summary notes' AS description,
        50::SMALLINT AS xp_reward,
        'medium' AS difficulty,
        30::SMALLINT AS estimated_minutes,
        (ac.notes_gap * 0.50 + ac.confidence_gap * 0.20 + ac.recency_penalty * 0.30)
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + 10.0 AS score
      FROM accessible_chapters ac
      WHERE ac.notes_status != 'complete'

      UNION ALL

      -- Weak questions action — strictly requires real question attempts with low accuracy (<70%)
      SELECT
        ac.user_chapter_id AS target_entity_id,
        'chapter'::public.entity_type_enum AS target_entity_type,
        ac.subject_id,
        'revisit_weak_topic'::public.mission_type_enum AS type,
        'Practise weak questions from ' || ac.chapter_title AS title,
        ac.subject_name || ' · Chapter ' || ac.chapter_number || ' · Spend ~30 min tackling challenging questions and correcting mistakes' AS description,
        40::SMALLINT AS xp_reward,
        'hard' AS difficulty,
        30::SMALLINT AS estimated_minutes,
        ((1.0 - ac.real_accuracy) * 0.50 + ac.confidence_gap * 0.30 + ac.recency_penalty * 0.20)
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + 10.0 AS score
      FROM accessible_chapters ac
      WHERE ac.real_accuracy IS NOT NULL AND ac.real_accuracy < 0.70

      UNION ALL

      -- Review action
      SELECT
        ac.user_chapter_id AS target_entity_id,
        'chapter'::public.entity_type_enum AS target_entity_type,
        ac.subject_id,
        'review_chapter'::public.mission_type_enum AS type,
        'Review ' || ac.chapter_title AS title,
        ac.subject_name || ' · Chapter ' || ac.chapter_number || ' · Spend ~20 min reviewing core concepts and key formulas' AS description,
        30::SMALLINT AS xp_reward,
        'easy' AS difficulty,
        20::SMALLINT AS estimated_minutes,
        (ac.recency_penalty * 0.60 + (1.0 - ac.confidence_gap) * 0.40)
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + 5.0 AS score
      FROM accessible_chapters ac

      UNION ALL

      -- Confidence action
      SELECT
        ac.user_chapter_id AS target_entity_id,
        'chapter'::public.entity_type_enum AS target_entity_type,
        ac.subject_id,
        'confidence_check'::public.mission_type_enum AS type,
        'Rate your confidence after reviewing ' || ac.chapter_title AS title,
        ac.subject_name || ' · Chapter ' || ac.chapter_number || ' · Spend ~10 min assessing topic mastery and updating confidence' AS description,
        20::SMALLINT AS xp_reward,
        'easy' AS difficulty,
        10::SMALLINT AS estimated_minutes,
        (ac.confidence_gap * 0.50 + ac.recency_penalty * 0.50)
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + (CASE WHEN ac.confidence_level IS NULL THEN 8.0 ELSE 2.0 END) AS score
      FROM accessible_chapters ac

      UNION ALL

      -- Timed past paper section
      SELECT
        us.subject_id AS target_entity_id,
        'subject'::public.entity_type_enum AS target_entity_type,
        us.subject_id,
        'attempt_paper'::public.mission_type_enum AS type,
        'Attempt a timed ' || s.name || ' past-paper section' AS title,
        s.name || ' · Spend ~45–60 min completing a timed past-paper question section' AS description,
        75::SMALLINT AS xp_reward,
        'hard' AS difficulty,
        60::SMALLINT AS estimated_minutes,
        GREATEST(1.0 / NULLIF((us.exam_date - v_today)::NUMERIC, 0), 0.01) * (us.priority::NUMERIC / 3.0) * 12.0
          + (CASE WHEN NOT EXISTS (
              SELECT 1 FROM public.past_papers pp
              WHERE pp.user_id = p_user_id AND pp.subject_id = us.subject_id AND pp.attempted_at BETWEEN (v_today - 6) AND v_today
            ) THEN 15.0 ELSE 0.0 END) AS score
      FROM public.user_subjects us
      JOIN public.subjects s ON s.id = us.subject_id
      WHERE us.user_id = p_user_id
        AND us.exam_date IS NOT NULL
        AND us.exam_date > v_today
        AND us.is_archived = FALSE
        AND us.study_route::TEXT != 'unconfirmed'
    )
    SELECT
      sca.*,
      (sca.score
        + (CASE WHEN sca.target_entity_id != v_old_mission.target_entity_id THEN 100.0 ELSE 0.0 END)
        + (CASE WHEN sca.type != v_old_mission.type THEN 50.0 ELSE 0.0 END)
        + (CASE WHEN (v_other_minutes + sca.estimated_minutes BETWEEN 60 AND 120) THEN 500.0 ELSE 0.0 END)
      ) AS replacement_score
    FROM scored_chapter_actions sca
    WHERE
      -- Target must not be among other active missions today
      sca.target_entity_id NOT IN (SELECT oa.target_entity_id FROM other_active oa WHERE oa.target_entity_id IS NOT NULL)
      -- Subject must not already have >= 2 active missions (excluding old mission)
      AND (SELECT COUNT(*) FROM other_active oa WHERE oa.subject_id = sca.subject_id) < 2
      -- Type must not already have >= 2 active missions (excluding old mission)
      AND (SELECT COUNT(*) FROM other_active oa WHERE oa.type = sca.type) < 2
      -- attempt_paper must not already be active
      AND (sca.type != 'attempt_paper' OR (SELECT COUNT(*) FROM other_active oa WHERE oa.type = 'attempt_paper') < 1)
      -- Never exceed 120 minutes total daily workload
      AND (v_other_minutes + sca.estimated_minutes) <= 120
      -- Exact (type, target_entity_id) must not already exist today in daily_missions (even skipped)
      AND NOT EXISTS (
        SELECT 1 FROM public.daily_missions dm
        WHERE dm.user_id = p_user_id
          AND dm.mission_date = v_today
          AND dm.type = sca.type
          AND dm.target_entity_id = sca.target_entity_id
      )
    ORDER BY replacement_score DESC
    LIMIT 1
  ) candidates;

  -- If no replacement candidate exists, abort and leave old mission pending with zero side-effects
  IF rec.target_entity_id IS NULL THEN
    RAISE EXCEPTION 'No suitable replacement available' USING ERRCODE = 'P0002';
  END IF;

  -- 5. Mark old mission as skipped
  UPDATE public.daily_missions
  SET    status      = 'skipped',
         skipped_at  = NOW(),
         skip_reason = COALESCE(p_reason, 'replaced')
  WHERE  id = p_mission_id;

  -- 6. Insert new replacement mission
  INSERT INTO public.daily_missions (
    user_id, mission_date, type, target_entity_type,
    target_entity_id, title, description, xp_reward,
    status, difficulty, estimated_minutes
  ) VALUES (
    p_user_id, v_today, rec.type, rec.target_entity_type,
    rec.target_entity_id, rec.title, rec.description, rec.xp_reward,
    'pending', rec.difficulty, rec.estimated_minutes
  )
  RETURNING * INTO v_new_mission;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows != 1 OR v_new_mission.id IS NULL THEN
    RAISE EXCEPTION 'Failed to insert replacement mission' USING ERRCODE = 'P0003';
  END IF;

  -- 7. Return atomic payload
  RETURN jsonb_build_object(
    'success', true,
    'replaced_mission_id', p_mission_id,
    'new_mission', row_to_json(v_new_mission)
  );
END;
$$;

COMMENT ON FUNCTION public.replace_mission(UUID, UUID, TEXT) IS
  'Atomically replaces a pending mission with an accessible alternative candidate while enforcing variety and subject balance.';

REVOKE ALL ON FUNCTION public.replace_mission(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.replace_mission(UUID, UUID, TEXT) TO authenticated, service_role;
