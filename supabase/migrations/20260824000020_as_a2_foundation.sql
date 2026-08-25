-- ============================================================
-- MIGRATION 020: AS/A2 Database Foundation
--
-- Implements Phase 2.5 data layer. All changes are additive.
-- No existing rows, constraints, or functions are removed.
--
-- Sections:
--   1. Enum types              (guarded DO blocks — pg_type check)
--   2. user_subjects           (4 new columns + 3 constraints)
--   3. chapters                (stage column + backfill including route_dependent)
--   4. past_papers             (stage column)
--   5. subject_paper_selections (new table + RLS + index)
--   6. subject_stage_results   (new table + trigger + RLS + indexes + constraints)
--
-- Chapter classification:
--   All seeded global chapters are classified. Mechanics and Statistics 1
--   (Maths 9709) are marked route_dependent: their effective AS/A2 stage
--   is resolved at query time from subject_paper_selections, not from a
--   fixed column value.
--
-- study_route backfill note:
--   Existing user_subjects rows receive study_route = 'unconfirmed'
--   and current_stage = NULL. The UI must prompt these users to
--   select a route before stage-sensitive features activate.
--   Rows are never silently treated as full_level.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 1: ENUM TYPES
-- PostgreSQL does not reliably support CREATE TYPE IF NOT EXISTS,
-- so each enum is guarded by a pg_type existence check.
-- ═══════════════════════════════════════════════════════════════════

-- Per-subject study path. unconfirmed = not yet chosen by student.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_route_enum') THEN
    CREATE TYPE study_route_enum AS ENUM (
      'unconfirmed',   -- UI must prompt before stage-sensitive features activate
      'as_only',
      'staged',
      'full_level'
    );
  END IF;
END;
$$;

-- Valid stage values for a subject enrolment (user_subjects.current_stage).
-- Also used in subject_stage_results.stage and subject_paper_selections.stage
-- via a narrower TEXT CHECK that excludes 'full'.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subject_stage_enum') THEN
    CREATE TYPE subject_stage_enum AS ENUM ('as', 'a2', 'full');
  END IF;
END;
$$;

-- Chapter content classification.
-- route_dependent = effective stage is resolved at query time from
-- subject_paper_selections, not stored as a fixed column value.
-- This applies to Mathematics components whose CAIE paper placement
-- varies by paper combination (e.g. Mechanics, Statistics 1).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chapter_stage_enum') THEN
    CREATE TYPE chapter_stage_enum AS ENUM ('as', 'a2', 'shared', 'route_dependent');
  END IF;
END;
$$;

-- Certainty of an AS or A2 result.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'result_type_enum') THEN
    CREATE TYPE result_type_enum AS ENUM ('expected', 'forecast', 'actual');
  END IF;
END;
$$;

-- How A2 was unlocked for a staged student.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'a2_unlock_method_enum') THEN
    CREATE TYPE a2_unlock_method_enum AS ENUM ('normal_transition', 'manual');
  END IF;
END;
$$;

COMMENT ON TYPE study_route_enum IS
  'Per-subject study path. unconfirmed = student has not yet made a selection.';
COMMENT ON TYPE subject_stage_enum IS
  'Active stage for a subject enrolment. full is valid only on user_subjects; '
  'per-paper and per-result tables use TEXT CHECK(stage IN (''as'',''a2'')).';
COMMENT ON TYPE chapter_stage_enum IS
  'Classification for a chapter. '
  'as/a2/shared = fixed stage. '
  'route_dependent = effective stage is resolved at query time from subject_paper_selections. '
  'NULL = not yet classified (custom/unseeded chapters only).';
COMMENT ON TYPE result_type_enum IS
  'Certainty of a stage result. Only actual may be treated as measured performance.';
COMMENT ON TYPE a2_unlock_method_enum IS
  'How A2 content was unlocked. Manual unlock of an AS-only subject should also '
  'convert study_route to staged at the application layer.';


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 2: user_subjects — new columns and constraints
-- ═══════════════════════════════════════════════════════════════════

-- Add columns. ADD COLUMN IF NOT EXISTS is safe to re-run.
-- Existing rows receive study_route = 'unconfirmed' and current_stage = NULL
-- via the DEFAULT clauses — no separate UPDATE is needed.

ALTER TABLE public.user_subjects
  ADD COLUMN IF NOT EXISTS study_route      study_route_enum      NOT NULL DEFAULT 'unconfirmed',
  ADD COLUMN IF NOT EXISTS current_stage    subject_stage_enum,             -- NULL when unconfirmed
  ADD COLUMN IF NOT EXISTS a2_unlocked_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS a2_unlock_method a2_unlock_method_enum;

COMMENT ON COLUMN public.user_subjects.study_route IS
  'Per-subject study path. unconfirmed = not yet selected by student; '
  'the UI must prompt before stage-sensitive features activate.';
COMMENT ON COLUMN public.user_subjects.current_stage IS
  'Active study stage. NULL when study_route = unconfirmed. '
  'Kept consistent with study_route by route_stage_check constraint.';
COMMENT ON COLUMN public.user_subjects.a2_unlocked_at IS
  'Timestamp when A2 content was unlocked. Always set together with a2_unlock_method.';
COMMENT ON COLUMN public.user_subjects.a2_unlock_method IS
  'normal_transition = staged student moved up after entering AS results. '
  'manual = early unlock with UI warning. '
  'When manual, the application layer must also set study_route = ''staged'' '
  'to avoid contradictory data on an as_only enrolment.';

-- ── Constraint: route and stage must be mutually consistent ─────────────────
-- unconfirmed → current_stage NULL
-- as_only     → current_stage = 'as'
-- staged      → current_stage IN ('as', 'a2')
-- full_level  → current_stage = 'full'
-- Existing rows: unconfirmed + NULL → satisfied. ✓
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_subjects_route_stage_check'
      AND conrelid = 'public.user_subjects'::regclass
  ) THEN
    ALTER TABLE public.user_subjects
      ADD CONSTRAINT user_subjects_route_stage_check CHECK (
        (study_route = 'unconfirmed' AND current_stage IS NULL)        OR
        (study_route = 'as_only'    AND current_stage = 'as')          OR
        (study_route = 'staged'     AND current_stage IN ('as', 'a2')) OR
        (study_route = 'full_level' AND current_stage = 'full')
      );
  END IF;
END;
$$;

-- ── Constraint: unlock timestamp and method must both be set or both be NULL ─
-- Existing rows: both NULL → satisfied. ✓
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_subjects_a2_unlock_consistency'
      AND conrelid = 'public.user_subjects'::regclass
  ) THEN
    ALTER TABLE public.user_subjects
      ADD CONSTRAINT user_subjects_a2_unlock_consistency CHECK (
        (a2_unlocked_at IS NULL) = (a2_unlock_method IS NULL)
      );
  END IF;
END;
$$;

-- ── Constraint: a staged subject that has progressed to A2 must have unlock metadata ─
-- Implies the application must record *how* A2 was opened, not only that it was.
-- Existing rows: study_route = 'unconfirmed' ≠ 'staged', so condition is vacuously false. ✓
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_subjects_staged_a2_requires_unlock'
      AND conrelid = 'public.user_subjects'::regclass
  ) THEN
    ALTER TABLE public.user_subjects
      ADD CONSTRAINT user_subjects_staged_a2_requires_unlock CHECK (
        NOT (
          study_route   = 'staged'
          AND current_stage = 'a2'
          AND a2_unlocked_at IS NULL
        )
      );
  END IF;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 3: chapters — AS/A2/shared classification
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS stage chapter_stage_enum;

COMMENT ON COLUMN public.chapters.stage IS
  'Stage classification. '
  'as/a2/shared = fixed membership. '
  'route_dependent = effective stage comes from subject_paper_selections at query time. '
  'NULL = not yet classified (applies only to custom or future unseeded chapters).';

-- ── Backfill — all seeded global chapters ─────────────────────────────────────

-- Mathematics 9709 ─ AS content (always AS regardless of paper combination)
UPDATE public.chapters
SET stage = 'as'
WHERE subject_id = extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709')
  AND component IN ('Pure 1', 'Pure 2');

-- Mathematics 9709 ─ A2 content
UPDATE public.chapters
SET stage = 'a2'
WHERE subject_id = extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709')
  AND component IN ('Pure 3', 'Statistics 2');

-- Mathematics 9709 ─ route_dependent content
-- Mechanics and Statistics 1 appear on papers whose AS/A2 assignment depends on
-- the student's chosen paper combination. Their effective stage is resolved at
-- query time from subject_paper_selections, not stored as a fixed value.
UPDATE public.chapters
SET stage = 'route_dependent'
WHERE subject_id = extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709')
  AND component IN ('Mechanics', 'Statistics 1');

-- Physics 9702 ─ AS content (component name is authoritative in the syllabus)
UPDATE public.chapters
SET stage = 'as'
WHERE subject_id = extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702')
  AND component = 'AS Core';

-- Physics 9702 ─ A2 content
UPDATE public.chapters
SET stage = 'a2'
WHERE subject_id = extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702')
  AND component IN ('A2 Core', 'A2 Applied');

-- Chemistry 9701 ─ AS content
UPDATE public.chapters
SET stage = 'as'
WHERE subject_id = extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701')
  AND component IN ('AS Physical', 'AS Inorganic', 'AS Organic');

-- Chemistry 9701 ─ A2 content
UPDATE public.chapters
SET stage = 'a2'
WHERE subject_id = extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701')
  AND component IN ('A2 Physical', 'A2 Inorganic', 'A2 Organic');

-- ── Diagnostic NOTICE ─────────────────────────────────────────────────────────
-- Reports any global chapters that are still NULL after the backfill above.
-- After a clean apply, the count should be 0 for the three seeded subjects.
-- Non-zero counts indicate custom global chapters or newly seeded subjects
-- that were added without a companion classification UPDATE.
DO $$
DECLARE
  v_null_count  INTEGER;
  v_rd_count    INTEGER;
  v_null_detail TEXT;
BEGIN
  SELECT COUNT(*) INTO v_null_count
  FROM public.chapters
  WHERE stage IS NULL AND is_global = TRUE;

  SELECT COUNT(*) INTO v_rd_count
  FROM public.chapters
  WHERE stage = 'route_dependent' AND is_global = TRUE;

  SELECT STRING_AGG(
    COALESCE(component, '(no component)') || ' — ' || title,
    E'\n  ' ORDER BY subject_id, component, number
  ) INTO v_null_detail
  FROM public.chapters
  WHERE stage IS NULL AND is_global = TRUE;

  RAISE NOTICE
    E'Migration 020 chapter classification summary:\n'
    '  route_dependent (stage resolved via paper selections): %\n'
    '  still unclassified (stage IS NULL): %\n'
    '%',
    v_rd_count,
    v_null_count,
    CASE
      WHEN v_null_count > 0
      THEN E'  Unclassified chapters:\n  ' || v_null_detail
      ELSE ''
    END;
END;
$$;

-- Index: stage-filtered chapter queries (not covered by any existing UNIQUE constraint)
CREATE INDEX IF NOT EXISTS idx_chapters_stage
  ON public.chapters (subject_id, stage)
  WHERE stage IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 4: past_papers — stage column
-- ═══════════════════════════════════════════════════════════════════
-- 'full' is intentionally excluded via CHECK — a paper belongs to
-- exactly one stage. Uses TEXT + CHECK to match the target_grade pattern
-- already used in this schema rather than creating a new enum for 2 values.
-- Existing rows stay NULL; stage cannot be inferred from paper codes alone.

ALTER TABLE public.past_papers
  ADD COLUMN IF NOT EXISTS stage TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'past_papers_stage_check'
      AND conrelid = 'public.past_papers'::regclass
  ) THEN
    ALTER TABLE public.past_papers
      ADD CONSTRAINT past_papers_stage_check CHECK (stage IN ('as', 'a2'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.past_papers.stage IS
  'Which A-Level stage this paper belongs to. as or a2 only — '
  'full is not valid because a paper belongs to exactly one stage. '
  'NULL = not yet tagged (cannot be reliably inferred without syllabus data).';


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 5: subject_paper_selections
-- ═══════════════════════════════════════════════════════════════════
-- One row per selected component/paper per enrolled subject.
-- Ownership is derived exclusively through user_subjects — no user_id column.
-- Directly queryable by readiness calculations; no string parsing required.

CREATE TABLE IF NOT EXISTS public.subject_paper_selections (
  id              UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_subject_id UUID     NOT NULL REFERENCES public.user_subjects(id) ON DELETE CASCADE,
  component_name  TEXT     NOT NULL,
  paper_number    SMALLINT CHECK (paper_number BETWEEN 1 AND 9),
  stage           TEXT     NOT NULL CHECK (stage IN ('as', 'a2')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sps_unique_component UNIQUE (user_subject_id, component_name)
);

COMMENT ON TABLE  public.subject_paper_selections IS
  'Student''s selected paper combination, one row per component. '
  'No user_id: ownership always derived via user_subjects. '
  'Directly queryable by readiness calculations without string parsing.';
COMMENT ON COLUMN public.subject_paper_selections.component_name IS
  'Matches chapters.component (e.g. ''Pure 1'', ''Statistics 1'', ''Mechanics'').';
COMMENT ON COLUMN public.subject_paper_selections.paper_number IS
  'CAIE paper number (e.g. 1, 4, 5). NULL when no fixed paper number applies.';
COMMENT ON COLUMN public.subject_paper_selections.stage IS
  'Whether this component belongs to AS or A2. full is not valid here.';

ALTER TABLE public.subject_paper_selections ENABLE ROW LEVEL SECURITY;

-- UNIQUE (user_subject_id, component_name) already provides a B-tree index
-- with user_subject_id as the leading column, covering point lookups.
-- A separate stage-filter index is still needed for readiness queries that
-- filter by stage within a user_subject.
CREATE INDEX IF NOT EXISTS idx_sps_stage
  ON public.subject_paper_selections (user_subject_id, stage);

CREATE POLICY "sps_select_own"
  ON public.subject_paper_selections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_subjects us
      WHERE us.id  = subject_paper_selections.user_subject_id
        AND us.user_id = auth.uid()
    )
  );

CREATE POLICY "sps_insert_own"
  ON public.subject_paper_selections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_subjects us
      WHERE us.id  = subject_paper_selections.user_subject_id
        AND us.user_id = auth.uid()
    )
  );

CREATE POLICY "sps_update_own"
  ON public.subject_paper_selections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_subjects us
      WHERE us.id  = subject_paper_selections.user_subject_id
        AND us.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_subjects us
      WHERE us.id  = subject_paper_selections.user_subject_id
        AND us.user_id = auth.uid()
    )
  );

CREATE POLICY "sps_delete_own"
  ON public.subject_paper_selections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_subjects us
      WHERE us.id  = subject_paper_selections.user_subject_id
        AND us.user_id = auth.uid()
    )
  );


-- ═══════════════════════════════════════════════════════════════════
-- SECTION 6: subject_stage_results
-- ═══════════════════════════════════════════════════════════════════
-- Stores expected, forecast, or actual AS/A2 results for an enrolled
-- subject. No user_id column: ownership derived via user_subjects.
-- exam_series and exam_year are required (NOT NULL) — a result without
-- a known examination session cannot be meaningfully used.

CREATE TABLE IF NOT EXISTS public.subject_stage_results (
  id              UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  user_subject_id UUID               NOT NULL REFERENCES public.user_subjects(id) ON DELETE CASCADE,
  stage           TEXT               NOT NULL CHECK (stage IN ('as', 'a2')),
  result_type     result_type_enum   NOT NULL,
  score_obtained  SMALLINT           NOT NULL CHECK (score_obtained >= 0),
  score_maximum   SMALLINT           NOT NULL CHECK (score_maximum > 0),
  exam_series     paper_session_enum NOT NULL,
  exam_year       SMALLINT           NOT NULL CHECK (exam_year BETWEEN 1990 AND 2100),
  carry_forward   BOOLEAN            NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  -- score_obtained cannot exceed score_maximum
  CONSTRAINT ssr_score_valid CHECK (score_obtained <= score_maximum),

  -- carry_forward is only meaningful for an AS result.
  -- An A2 result can never carry forward; that would contradict exam board rules.
  CONSTRAINT ssr_carry_forward_as_only CHECK (
    carry_forward = FALSE OR stage = 'as'
  ),

  -- One result per subject/stage/result-type/series/year combination.
  -- The UNIQUE index also serves as the primary lookup index (user_subject_id
  -- is the leading column), so no separate user_subject or stage index is needed.
  CONSTRAINT ssr_unique UNIQUE (user_subject_id, stage, result_type, exam_series, exam_year)
);

COMMENT ON TABLE  public.subject_stage_results IS
  'AS or A2 results (expected, forecast, or actual) for an enrolled subject. '
  'No user_id: ownership always derived via user_subjects. '
  'Only actual results may be treated as measured performance; '
  'expected and forecast remain estimates.';
COMMENT ON COLUMN public.subject_stage_results.stage IS
  'AS or A2 only. full is not valid — a result belongs to exactly one stage.';
COMMENT ON COLUMN public.subject_stage_results.result_type IS
  'expected = pre-exam estimate; forecast = teacher/school forecast; actual = official result.';
COMMENT ON COLUMN public.subject_stage_results.exam_series IS
  'Required. CAIE session when the examination was or will be sat.';
COMMENT ON COLUMN public.subject_stage_results.exam_year IS
  'Required. Calendar year of the examination session.';
COMMENT ON COLUMN public.subject_stage_results.carry_forward IS
  'TRUE only for an AS result (enforced by ssr_carry_forward_as_only). '
  'Indicates this AS score is intended to contribute to the final A-Level grade.';

-- Auto-maintain updated_at using the existing generic trigger function.
CREATE OR REPLACE TRIGGER set_subject_stage_results_updated_at
  BEFORE UPDATE ON public.subject_stage_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Partial index for carry-forward lookups. Not covered by the UNIQUE index
-- because carry_forward is not in the unique key.
CREATE INDEX IF NOT EXISTS idx_ssr_carry_forward
  ON public.subject_stage_results (user_subject_id)
  WHERE carry_forward = TRUE;

ALTER TABLE public.subject_stage_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ssr_select_own"
  ON public.subject_stage_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_subjects us
      WHERE us.id  = subject_stage_results.user_subject_id
        AND us.user_id = auth.uid()
    )
  );

CREATE POLICY "ssr_insert_own"
  ON public.subject_stage_results FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_subjects us
      WHERE us.id  = subject_stage_results.user_subject_id
        AND us.user_id = auth.uid()
    )
  );

CREATE POLICY "ssr_update_own"
  ON public.subject_stage_results FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_subjects us
      WHERE us.id  = subject_stage_results.user_subject_id
        AND us.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_subjects us
      WHERE us.id  = subject_stage_results.user_subject_id
        AND us.user_id = auth.uid()
    )
  );

CREATE POLICY "ssr_delete_own"
  ON public.subject_stage_results FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_subjects us
      WHERE us.id  = subject_stage_results.user_subject_id
        AND us.user_id = auth.uid()
    )
  );


-- ═══════════════════════════════════════════════════════════════════
-- END OF MIGRATION 020
-- ═══════════════════════════════════════════════════════════════════
