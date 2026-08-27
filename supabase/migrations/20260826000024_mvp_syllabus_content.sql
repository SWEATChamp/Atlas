-- ============================================================================
-- MIGRATION 024: Five-Subject MVP Syllabus Content & Subject Availability
--
-- 1. Add is_available column to public.subjects (DEFAULT FALSE).
--    Mark exactly 5 MVP subjects as is_available = TRUE:
--      Mathematics (9709), Further Mathematics (9231), Physics (9702),
--      Chemistry (9701), Computer Science (9618).
-- 2. Add is_active column to public.chapters (DEFAULT TRUE).
-- 3. Add subject_paper_id column to public.daily_missions (indexed).
-- 4. Create normalized paper-route schema:
--      public.subject_papers
--      public.subject_valid_routes
--      public.subject_route_papers
--      public.chapter_papers
-- 5. Backfill subject_paper_selections.subject_paper_id and past_papers.subject_paper_id.
-- 6. Scoped positive-number renumbering (+1000 staging) for Mathematics 9709,
--    Physics 9702, and Chemistry 9701 global legacy chapters.
-- 7. Seed missing official chapters for Further Mathematics 9231, Computer Science 9618,
--    Physics 9702 splits, and Chemistry 9701 topics.
-- 8. Seed chapter_papers linkages.
-- 9. Update database functions to honor is_active, enforce subject availability,
--    and validate route/paper access integrity:
--      - set_onboarding_subjects
--      - configure_subject_route
--      - transition_to_a2
--      - compute_readiness_score (3-arg & 2-arg)
--      - user_can_access_chapter
--      - generate_daily_missions
--      - replace_mission
--      - get_user_dashboard_stats
--      - validate_past_paper_entry (trigger)
--      - validate_subject_paper_selection (trigger)
--      - validate_chapter_paper_subject (trigger)
-- ============================================================================

BEGIN;

-- ─── 1. Subject Availability Column ──────────────────────────────────────────
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.subjects.is_available IS
  'True if the subject is part of the active MVP scope and open for new user enrolment.';

-- Mark exactly the five MVP subjects as available
UPDATE public.subjects
SET    is_available = TRUE
WHERE  code IN ('9709', '9231', '9702', '9701', '9618')
  AND  is_global = TRUE;

-- All other subjects remain is_available = FALSE
UPDATE public.subjects
SET    is_available = FALSE
WHERE  code NOT IN ('9709', '9231', '9702', '9701', '9618')
   OR  is_global = FALSE;


-- ─── 2. Chapter Lifecycle Column ─────────────────────────────────────────────
ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.chapters.is_active IS
  'True for active official syllabus chapters. False for deprecated historical chapters preserved for progress history.';


-- ─── 3. Daily Missions Paper Reference Column ─────────────────────────────────
ALTER TABLE public.daily_missions
  ADD COLUMN IF NOT EXISTS subject_paper_id UUID;

CREATE INDEX IF NOT EXISTS idx_daily_missions_subject_paper_id
  ON public.daily_missions(subject_paper_id)
  WHERE subject_paper_id IS NOT NULL;

COMMENT ON COLUMN public.daily_missions.subject_paper_id IS
  'Foreign key to subject_papers for attempt_paper missions. Null for chapter/note missions and legacy rows.';


-- ─── 4. Normalized Paper & Route Tables ───────────────────────────────────────

-- 4.1 Official Subject Papers
CREATE TABLE IF NOT EXISTS public.subject_papers (
  id             UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  subject_id     UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  paper_number   SMALLINT NOT NULL CHECK (paper_number >= 1 AND paper_number <= 9),
  name           TEXT NOT NULL,
  code_suffix    TEXT NOT NULL,
  stage_behavior TEXT NOT NULL CHECK (stage_behavior IN ('fixed_as', 'fixed_a2', 'route_dependent')),
  default_stage  TEXT CHECK (default_stage IN ('as', 'a2')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_subject_papers_subject_number UNIQUE (subject_id, paper_number)
);

CREATE INDEX IF NOT EXISTS idx_subject_papers_subject_id
  ON public.subject_papers(subject_id);

COMMENT ON TABLE public.subject_papers IS
  'Official CAIE exam paper definitions for supported MVP subjects.';

-- 4.2 Authoritative Subject Route Combinations
CREATE TABLE IF NOT EXISTS public.subject_valid_routes (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  subject_id      UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  route           public.study_route_enum NOT NULL,
  combination_key TEXT NOT NULL,
  label           TEXT NOT NULL,
  description     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_subject_valid_routes_key UNIQUE (subject_id, route, combination_key)
);

CREATE INDEX IF NOT EXISTS idx_subject_valid_routes_subject_route
  ON public.subject_valid_routes(subject_id, route);

COMMENT ON TABLE public.subject_valid_routes IS
  'Official route options and valid paper combinations per subject.';

-- 4.3 Normalized Route Component Papers
CREATE TABLE IF NOT EXISTS public.subject_route_papers (
  id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  route_id         UUID NOT NULL REFERENCES public.subject_valid_routes(id) ON DELETE CASCADE,
  subject_paper_id UUID NOT NULL REFERENCES public.subject_papers(id) ON DELETE CASCADE,
  stage            TEXT NOT NULL CHECK (stage IN ('as', 'a2')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_subject_route_papers_route_paper UNIQUE (route_id, subject_paper_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_route_papers_route_id
  ON public.subject_route_papers(route_id);

CREATE INDEX IF NOT EXISTS idx_subject_route_papers_paper_id
  ON public.subject_route_papers(subject_paper_id);

COMMENT ON TABLE public.subject_route_papers IS
  'Normalized association between valid route combinations and their constituent papers with effective stages.';

-- 4.4 Chapter to Paper Assessment Linkage
CREATE TABLE IF NOT EXISTS public.chapter_papers (
  id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  chapter_id       UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  subject_paper_id UUID NOT NULL REFERENCES public.subject_papers(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_chapter_papers_chapter_paper UNIQUE (chapter_id, subject_paper_id)
);

CREATE INDEX IF NOT EXISTS idx_chapter_papers_chapter_id
  ON public.chapter_papers(chapter_id);

CREATE INDEX IF NOT EXISTS idx_chapter_papers_paper_id
  ON public.chapter_papers(subject_paper_id);

COMMENT ON TABLE public.chapter_papers IS
  'Maps syllabus chapters to the official exam papers in which they are assessed.';

-- Add subject_paper_id FK to daily_missions if table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_daily_missions_subject_paper'
      AND table_name = 'daily_missions'
  ) THEN
    ALTER TABLE public.daily_missions
      ADD CONSTRAINT fk_daily_missions_subject_paper
      FOREIGN KEY (subject_paper_id) REFERENCES public.subject_papers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4.5 Schema Extension for subject_paper_selections
ALTER TABLE public.subject_paper_selections
  ADD COLUMN IF NOT EXISTS subject_paper_id UUID REFERENCES public.subject_papers(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sps_user_subj_paper
  ON public.subject_paper_selections (user_subject_id, subject_paper_id)
  WHERE subject_paper_id IS NOT NULL;

-- 4.6 Schema Extension for past_papers
ALTER TABLE public.past_papers
  ADD COLUMN IF NOT EXISTS subject_paper_id UUID REFERENCES public.subject_papers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_past_papers_subject_paper_id
  ON public.past_papers(subject_paper_id)
  WHERE subject_paper_id IS NOT NULL;

ALTER TABLE public.subject_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_valid_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_route_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_papers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subject_papers_select_all" ON public.subject_papers;
CREATE POLICY "subject_papers_select_all" ON public.subject_papers FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "subject_valid_routes_select_all" ON public.subject_valid_routes;
CREATE POLICY "subject_valid_routes_select_all" ON public.subject_valid_routes FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "subject_route_papers_select_all" ON public.subject_route_papers;
CREATE POLICY "subject_route_papers_select_all" ON public.subject_route_papers FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "chapter_papers_select_all" ON public.chapter_papers;
CREATE POLICY "chapter_papers_select_all" ON public.chapter_papers FOR SELECT USING (TRUE);

GRANT SELECT ON public.subject_papers TO anon, authenticated, service_role;
GRANT SELECT ON public.subject_valid_routes TO anon, authenticated, service_role;
GRANT SELECT ON public.subject_route_papers TO anon, authenticated, service_role;
GRANT SELECT ON public.chapter_papers TO anon, authenticated, service_role;

REVOKE INSERT, UPDATE, DELETE ON public.subject_papers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subject_valid_routes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subject_route_papers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chapter_papers FROM anon, authenticated;

-- Protect subject_paper_selections from direct write mutation (all route changes must use configure_subject_route)
REVOKE ALL ON public.subject_paper_selections FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.subject_paper_selections FROM authenticated;
GRANT SELECT ON public.subject_paper_selections TO authenticated, service_role;
GRANT ALL ON public.subject_paper_selections TO service_role;


-- ─── 5. Seed Official Papers & Route Combinations ─────────────────────────────

DO $$
DECLARE
  v_m_id  UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709');
  v_fm_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9231');
  v_p_id  UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702');
  v_c_id  UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701');
  v_cs_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9618');
  v_r_id  UUID;
BEGIN
  -- ── Mathematics 9709 Papers ──────────────────────────────────────────────
  INSERT INTO public.subject_papers (id, subject_id, paper_number, name, code_suffix, stage_behavior, default_stage) VALUES
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-1'), v_m_id, 1, 'Pure Mathematics 1', 'P1', 'fixed_as', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-2'), v_m_id, 2, 'Pure Mathematics 2', 'P2', 'fixed_as', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-3'), v_m_id, 3, 'Pure Mathematics 3', 'P3', 'fixed_a2', 'a2'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-4'), v_m_id, 4, 'Mechanics', 'P4', 'route_dependent', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-5'), v_m_id, 5, 'Probability & Statistics 1', 'P5', 'route_dependent', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-6'), v_m_id, 6, 'Probability & Statistics 2', 'P6', 'fixed_a2', 'a2')
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, code_suffix = EXCLUDED.code_suffix, stage_behavior = EXCLUDED.stage_behavior, default_stage = EXCLUDED.default_stage;

  -- ── Further Mathematics 9231 Papers ──────────────────────────────────────
  INSERT INTO public.subject_papers (id, subject_id, paper_number, name, code_suffix, stage_behavior, default_stage) VALUES
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-1'), v_fm_id, 1, 'Further Pure Mathematics 1', 'P1', 'fixed_as', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-2'), v_fm_id, 2, 'Further Pure Mathematics 2', 'P2', 'fixed_a2', 'a2'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-3'), v_fm_id, 3, 'Further Mechanics', 'P3', 'route_dependent', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-4'), v_fm_id, 4, 'Further Probability & Statistics', 'P4', 'route_dependent', 'as')
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, code_suffix = EXCLUDED.code_suffix, stage_behavior = EXCLUDED.stage_behavior, default_stage = EXCLUDED.default_stage;

  -- ── Physics 9702 Papers ──────────────────────────────────────────────────
  INSERT INTO public.subject_papers (id, subject_id, paper_number, name, code_suffix, stage_behavior, default_stage) VALUES
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-1'), v_p_id, 1, 'Multiple Choice (AS)', 'P1', 'fixed_as', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-2'), v_p_id, 2, 'AS Level Structured Questions', 'P2', 'fixed_as', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-3'), v_p_id, 3, 'Advanced Practical Skills', 'P3', 'fixed_as', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-4'), v_p_id, 4, 'A Level Structured Questions', 'P4', 'fixed_a2', 'a2'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-5'), v_p_id, 5, 'Planning, Analysis and Evaluation', 'P5', 'fixed_a2', 'a2')
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, code_suffix = EXCLUDED.code_suffix, stage_behavior = EXCLUDED.stage_behavior, default_stage = EXCLUDED.default_stage;

  -- ── Chemistry 9701 Papers ────────────────────────────────────────────────
  INSERT INTO public.subject_papers (id, subject_id, paper_number, name, code_suffix, stage_behavior, default_stage) VALUES
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-1'), v_c_id, 1, 'Multiple Choice (AS)', 'P1', 'fixed_as', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-2'), v_c_id, 2, 'AS Level Structured Questions', 'P2', 'fixed_as', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-3'), v_c_id, 3, 'Advanced Practical Skills', 'P3', 'fixed_as', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-4'), v_c_id, 4, 'A Level Structured Questions', 'P4', 'fixed_a2', 'a2'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-5'), v_c_id, 5, 'Planning, Analysis and Evaluation', 'P5', 'fixed_a2', 'a2')
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, code_suffix = EXCLUDED.code_suffix, stage_behavior = EXCLUDED.stage_behavior, default_stage = EXCLUDED.default_stage;

  -- ── Computer Science 9618 Papers ─────────────────────────────────────────
  INSERT INTO public.subject_papers (id, subject_id, paper_number, name, code_suffix, stage_behavior, default_stage) VALUES
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-1'), v_cs_id, 1, 'Theory Fundamentals', 'P1', 'fixed_as', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-2'), v_cs_id, 2, 'Fundamental Problem-solving & Programming Skills', 'P2', 'fixed_as', 'as'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-3'), v_cs_id, 3, 'Advanced Theory', 'P3', 'fixed_a2', 'a2'),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-4'), v_cs_id, 4, 'Practical', 'P4', 'fixed_a2', 'a2')
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, code_suffix = EXCLUDED.code_suffix, stage_behavior = EXCLUDED.stage_behavior, default_stage = EXCLUDED.default_stage;

  -- ── Route Combinations: Mathematics 9709 ─────────────────────────────────
  -- AS Only: p1_p2, p1_m1, p1_s1
  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9709-as-p1-p2');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_m_id, 'as_only', 'p1_p2', 'Pure 1 + Pure 2 (Papers 1 & 2)', 'Pure Mathematics 1 & 2')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-2'), 'as')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9709-as-p1-m1');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_m_id, 'as_only', 'p1_m1', 'Pure 1 + Mechanics (Papers 1 & 4)', 'Pure Mathematics 1 & Mechanics')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-4'), 'as')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9709-as-p1-s1');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_m_id, 'as_only', 'p1_s1', 'Pure 1 + Statistics 1 (Papers 1 & 5)', 'Pure Mathematics 1 & Probability & Statistics 1')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-5'), 'as')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  -- Staged: mech_stats, stats_mech, stats_double
  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9709-staged-mech-stats');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_m_id, 'staged', 'mech_stats', 'Pure 1 + Mechanics (AS) → Pure 3 + Stats 1 (A2)', 'Pure 1 & Mechanics in AS, then Pure 3 & Statistics 1 in A2 (Papers 1, 4, 3, 5)')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-4'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-3'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-5'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9709-staged-stats-mech');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_m_id, 'staged', 'stats_mech', 'Pure 1 + Stats 1 (AS) → Pure 3 + Mechanics (A2)', 'Pure 1 & Statistics 1 in AS, then Pure 3 & Mechanics in A2 (Papers 1, 5, 3, 4)')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-5'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-3'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-4'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9709-staged-stats-double');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_m_id, 'staged', 'stats_double', 'Pure 1 + Stats 1 (AS) → Pure 3 + Stats 2 (A2)', 'Pure 1 & Statistics 1 in AS, then Pure 3 & Statistics 2 in A2 (Papers 1, 5, 3, 6)')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-5'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-3'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-6'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  -- Full Level: full_mech_stats, full_stats_double
  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9709-full-mech-stats');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_m_id, 'full_level', 'full_mech_stats', 'Pure Mathematics, Mechanics & Statistics 1', 'Linear A Level with Papers 1, 3, 4 & 5')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-4'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-3'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-5'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9709-full-stats-double');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_m_id, 'full_level', 'full_stats_double', 'Pure Mathematics & Statistics 1–2', 'Linear A Level with Papers 1, 3, 5 & 6')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-5'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-3'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-6'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  -- ── Route Combinations: Further Mathematics 9231 ─────────────────────────
  -- AS Only: fp1_fm, fp1_fps
  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9231-as-fp1-fm');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_fm_id, 'as_only', 'fp1_fm', 'Further Pure 1 + Further Mechanics (Papers 1 & 3)', 'Further Pure Mathematics 1 & Further Mechanics')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-3'), 'as')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9231-as-fp1-fps');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_fm_id, 'as_only', 'fp1_fps', 'Further Pure 1 + Further Stats (Papers 1 & 4)', 'Further Pure Mathematics 1 & Further Probability & Statistics')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-4'), 'as')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  -- Staged: fm_fps, fps_fm
  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9231-staged-fm-fps');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_fm_id, 'staged', 'fm_fps', 'Further Pure 1 + FM (AS) → Further Pure 2 + FPS (A2)', 'Further Pure 1 & Mechanics in AS, then Further Pure 2 & Statistics in A2 (Papers 1, 3, 2, 4)')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-3'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-2'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-4'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9231-staged-fps-fm');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_fm_id, 'staged', 'fps_fm', 'Further Pure 1 + FPS (AS) → Further Pure 2 + FM (A2)', 'Further Pure 1 & Statistics in AS, then Further Pure 2 & Mechanics in A2 (Papers 1, 4, 2, 3)')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-4'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-2'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-3'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  -- Full Level: full_all
  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9231-full-all');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_fm_id, 'full_level', 'full_all', 'All Four Papers (Papers 1, 2, 3 & 4)', 'Complete Linear A Level covering Further Pure 1 & 2, Further Mechanics, and Further Statistics')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-3'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-2'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-4'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  -- ── Route Combinations: Physics 9702 (Fixed Set) ─────────────────────────
  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9702-as-standard');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_p_id, 'as_only', 'standard', 'AS Level Physics (Papers 1, 2 & 3)', 'Multiple Choice, AS Structured Questions, and Advanced Practical Skills')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-2'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-3'), 'as')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9702-staged-standard');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_p_id, 'staged', 'standard', 'Staged A Level Physics (AS: P1–P3 → A2: P4–P5)', 'Papers 1–3 in AS, then Papers 4–5 in A2')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-2'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-3'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-4'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-5'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9702-full-standard');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_p_id, 'full_level', 'standard', 'Full A Level Physics (All Papers 1–5)', 'All 5 papers taken in one series')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-2'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-3'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-4'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-5'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  -- ── Route Combinations: Chemistry 9701 (Fixed Set) ───────────────────────
  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9701-as-standard');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_c_id, 'as_only', 'standard', 'AS Level Chemistry (Papers 1, 2 & 3)', 'Multiple Choice, AS Structured Questions, and Advanced Practical Skills')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-2'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-3'), 'as')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9701-staged-standard');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_c_id, 'staged', 'standard', 'Staged A Level Chemistry (AS: P1–P3 → A2: P4–P5)', 'Papers 1–3 in AS, then Papers 4–5 in A2')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-2'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-3'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-4'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-5'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9701-full-standard');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_c_id, 'full_level', 'standard', 'Full A Level Chemistry (All Papers 1–5)', 'All 5 papers taken in one series')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-2'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-3'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-4'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-5'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  -- ── Route Combinations: Computer Science 9618 (Fixed Set) ────────────────
  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9618-as-standard');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_cs_id, 'as_only', 'standard', 'AS Level Computer Science (Papers 1 & 2)', 'Theory Fundamentals and Problem-solving & Programming Skills')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-2'), 'as')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9618-staged-standard');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_cs_id, 'staged', 'standard', 'Staged A Level Computer Science (AS: P1–P2 → A2: P3–P4)', 'Papers 1 & 2 in AS, then Advanced Theory and Practical in A2')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-2'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-3'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-4'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;

  v_r_id := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'svr-9618-full-standard');
  INSERT INTO public.subject_valid_routes (id, subject_id, route, combination_key, label, description) VALUES
    (v_r_id, v_cs_id, 'full_level', 'standard', 'Full A Level Computer Science (All Papers 1–4)', 'All 4 papers taken in one series')
  ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  INSERT INTO public.subject_route_papers (route_id, subject_paper_id, stage) VALUES
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-1'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-2'), 'as'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-3'), 'a2'),
    (v_r_id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-4'), 'a2')
  ON CONFLICT (route_id, subject_paper_id) DO NOTHING;
END $$;


-- ─── 6. Reusable Route Repair & Upgrade Backfill Function ─────────────────────

CREATE OR REPLACE FUNCTION public.repair_and_backfill_subject_routes()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_us                   RECORD;
  v_matching_route_id    UUID;
  v_matching_route_count INTEGER;
  v_math_id              UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709');
  v_fm_id                UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9231');
  v_phys_id              UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702');
  v_chem_id              UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701');
  v_cs_id                UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9618');
BEGIN
  -- 1. Deterministic canonical backfill for confirmed fixed-route subjects (Physics, Chemistry, Computer Science)
  FOR v_us IN
    SELECT us.id AS user_subject_id, us.user_id, us.study_route, us.subject_id
    FROM public.user_subjects us
    JOIN public.subjects s ON s.id = us.subject_id
    WHERE s.is_global = TRUE
      AND s.id IN (v_phys_id, v_chem_id, v_cs_id)
      AND us.study_route IN ('as_only', 'staged', 'full_level')
  LOOP
    DELETE FROM public.subject_paper_selections WHERE user_subject_id = v_us.user_subject_id;

    INSERT INTO public.subject_paper_selections (user_subject_id, component_name, paper_number, stage, subject_paper_id)
    SELECT
      v_us.user_subject_id,
      sp.name,
      sp.paper_number,
      srp.stage,
      sp.id
    FROM public.subject_valid_routes svr
    JOIN public.subject_route_papers srp ON srp.route_id = svr.id
    JOIN public.subject_papers sp ON sp.id = srp.subject_paper_id
    JOIN public.user_subjects us ON us.id = v_us.user_subject_id AND us.subject_id = svr.subject_id
    WHERE svr.route = v_us.study_route;
  END LOOP;

  -- 2. Backfill subject_paper_id on existing elective selections
  UPDATE public.subject_paper_selections sps
  SET    subject_paper_id = sp.id
  FROM   public.user_subjects us
  JOIN   public.subjects s ON s.id = us.subject_id
  JOIN   public.subject_papers sp ON sp.subject_id = s.id
  WHERE  sps.user_subject_id = us.id
    AND  s.is_global = TRUE
    AND  s.id IN (v_math_id, v_fm_id, v_phys_id, v_chem_id, v_cs_id)
    AND  sps.subject_paper_id IS NULL
    AND  (
           (sps.paper_number IS NOT NULL AND sp.paper_number = sps.paper_number)
           OR (sps.component_name IS NOT NULL AND (
                sp.name ILIKE sps.component_name || '%'
                OR sps.component_name ILIKE sp.name || '%'
                OR (sps.component_name = 'Pure 1' AND sp.paper_number = 1)
                OR (sps.component_name = 'Pure 2' AND sp.paper_number = 2)
                OR (sps.component_name = 'Pure 3' AND sp.paper_number = 3)
                OR (sps.component_name = 'Mechanics' AND sp.paper_number = 4)
                OR (sps.component_name = 'Statistics 1' AND sp.paper_number = 5)
                OR (sps.component_name = 'Statistics 2' AND sp.paper_number = 6)
                OR (sps.component_name = 'Further Pure 1' AND sp.paper_number = 1)
                OR (sps.component_name = 'Further Pure 2' AND sp.paper_number = 2)
                OR (sps.component_name = 'Further Mechanics' AND sp.paper_number = 3)
                OR (sps.component_name = 'Further Probability & Statistics' AND sp.paper_number = 4)
              ))
         );

  -- 3. Non-coercive fallback for ambiguous / missing elective enrolments (Mathematics 9709, Further Mathematics 9231)
  FOR v_us IN
    SELECT us.id AS user_subject_id, us.user_id, us.study_route, us.subject_id
    FROM public.user_subjects us
    JOIN public.subjects s ON s.id = us.subject_id
    WHERE s.is_global = TRUE
      AND s.id IN (v_math_id, v_fm_id)
      AND us.study_route IN ('as_only', 'staged', 'full_level')
  LOOP
    -- Count how many valid route combinations match the user's paper selections exactly
    SELECT COUNT(svr.id), MAX(svr.id::text)::uuid
    INTO v_matching_route_count, v_matching_route_id
    FROM public.subject_valid_routes svr
    JOIN public.user_subjects us ON us.id = v_us.user_subject_id AND us.subject_id = svr.subject_id
    WHERE svr.route = v_us.study_route
      -- All route papers are present in user selections
      AND NOT EXISTS (
        SELECT 1 FROM public.subject_route_papers srp
        WHERE srp.route_id = svr.id
          AND NOT EXISTS (
            SELECT 1 FROM public.subject_paper_selections sps
            WHERE sps.user_subject_id = v_us.user_subject_id
              AND sps.subject_paper_id = srp.subject_paper_id
              AND sps.stage = srp.stage
          )
      )
      -- No extra user selections outside this route
      AND NOT EXISTS (
        SELECT 1 FROM public.subject_paper_selections sps
        WHERE sps.user_subject_id = v_us.user_subject_id
          AND NOT EXISTS (
            SELECT 1 FROM public.subject_route_papers srp
            WHERE srp.route_id = svr.id
              AND srp.subject_paper_id = sps.subject_paper_id
              AND srp.stage = sps.stage
          )
      );

    IF v_matching_route_count != 1 THEN
      -- Ambiguous / missing / invalid elective selections fallback:
      -- Set study_route = 'unconfirmed', current_stage = NULL, clear invalid live selections, cancel pending missions
      UPDATE public.user_subjects
      SET    study_route      = 'unconfirmed',
             current_stage    = NULL,
             a2_unlocked_at   = NULL,
             a2_unlock_method = NULL,
             updated_at       = NOW()
      WHERE  id = v_us.user_subject_id;

      DELETE FROM public.subject_paper_selections
      WHERE  user_subject_id = v_us.user_subject_id;

      -- Cancel only inaccessible pending missions directly and safely
      UPDATE public.daily_missions dm
      SET    status      = 'skipped',
             skip_reason = 'route_unconfirmed',
             skipped_at  = NOW()
      WHERE  dm.user_id = v_us.user_id
        AND  dm.status  = 'pending'
        AND  (
          (dm.target_entity_type = 'subject' AND dm.target_entity_id = v_us.subject_id AND dm.type = 'attempt_paper')
          OR (dm.target_entity_type = 'chapter' AND EXISTS (
            SELECT 1 FROM public.user_chapters uc
            JOIN public.chapters c ON c.id = uc.chapter_id
            WHERE uc.id = dm.target_entity_id
              AND uc.user_id = v_us.user_id
              AND c.subject_id = v_us.subject_id
          ))
        );
    END IF;
  END LOOP;

  -- 4. Backfill past_papers where paper_number can be deterministically resolved
  UPDATE public.past_papers pp
  SET    subject_paper_id = sp.id
  FROM   public.subjects s
  JOIN   public.subject_papers sp ON sp.subject_id = s.id
  WHERE  pp.subject_id = s.id
    AND  s.is_global = TRUE
    AND  s.is_available = TRUE
    AND  pp.subject_paper_id IS NULL
    AND  sp.paper_number = (
           CASE WHEN pp.paper_number >= 10 THEN (pp.paper_number / 10)::SMALLINT ELSE pp.paper_number END
         );
END;
$$;

REVOKE ALL ON FUNCTION public.repair_and_backfill_subject_routes() FROM PUBLIC, anon, authenticated, service_role;

-- Execute initial migration repair and backfill
SELECT public.repair_and_backfill_subject_routes();


-- ─── 7. Scoped Positive-Number Renumbering for Legacy Chapters ─────────────────

DO $$
DECLARE
  v_m_id  UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709');
  v_p_id  UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702');
  v_c_id  UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701');
  v_m_cnt INTEGER;
  v_p_cnt INTEGER;
  v_c_cnt INTEGER;
BEGIN
  -- 1. Create temporary table to scope legacy rows
  CREATE TEMP TABLE temp_legacy_chapters (
    chapter_id UUID PRIMARY KEY,
    subject_id UUID NOT NULL,
    component  TEXT NOT NULL,
    old_number INTEGER NOT NULL,
    title      TEXT NOT NULL
  ) ON COMMIT DROP;

  -- 2. Capture exact global legacy rows
  INSERT INTO temp_legacy_chapters (chapter_id, subject_id, component, old_number, title)
  SELECT id, subject_id, component, number, title
  FROM   public.chapters
  WHERE  is_global = TRUE
    AND  subject_id IN (v_m_id, v_p_id, v_c_id);

  SELECT COUNT(*) INTO v_m_cnt FROM temp_legacy_chapters WHERE subject_id = v_m_id;
  SELECT COUNT(*) INTO v_p_cnt FROM temp_legacy_chapters WHERE subject_id = v_p_id;
  SELECT COUNT(*) INTO v_c_cnt FROM temp_legacy_chapters WHERE subject_id = v_c_id;

  IF v_m_cnt != 39 OR v_p_cnt != 24 OR v_c_cnt != 24 THEN
    RAISE EXCEPTION 'Legacy chapter capture count mismatch: Math=%, Phys=%, Chem=% (expected 39, 24, 24)',
      v_m_cnt, v_p_cnt, v_c_cnt;
  END IF;

  -- 3. Assert target deprecated number 99 is unused by any existing chapter
  IF EXISTS (
    SELECT 1 FROM public.chapters
    WHERE (subject_id = v_m_id AND component = 'Pure 1' AND number = 99)
       OR (subject_id = v_p_id AND component = 'A2 Core' AND number = 99)
  ) THEN
    RAISE EXCEPTION 'Target deprecated number 99 is already in use';
  END IF;

  -- 4. Move captured legacy rows into positive staging range (+1000)
  UPDATE public.chapters c
  SET    number = c.number + 1000
  FROM   temp_legacy_chapters t
  WHERE  c.id = t.chapter_id;

  -- 5. Apply final official numbers & in-place corrections to Mathematics 9709
  -- Pure 1: Deprecate Vectors (99), Series -> 6, Diff -> 7, Int -> 8
  UPDATE public.chapters c SET number = 99, is_active = FALSE, title = 'Vectors (Deprecated Pure 1)'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_m_id AND t.component = 'Pure 1' AND t.old_number = 6;

  UPDATE public.chapters c SET number = 6, is_active = TRUE
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_m_id AND t.component = 'Pure 1' AND t.old_number = 7;

  UPDATE public.chapters c SET number = 7, is_active = TRUE
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_m_id AND t.component = 'Pure 1' AND t.old_number = 8;

  UPDATE public.chapters c SET number = 8, is_active = TRUE
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_m_id AND t.component = 'Pure 1' AND t.old_number = 9;

  -- Pure 1 Quadratics(1), Functions(2), Coordinate Geometry(3), Circular Measure(4), Trigonometry(5)
  UPDATE public.chapters c SET number = t.old_number, is_active = TRUE
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_m_id AND t.component = 'Pure 1' AND t.old_number BETWEEN 1 AND 5;

  -- Pure 2: Numerical Methods -> Numerical Solution of Equations (6)
  UPDATE public.chapters c SET number = 6, title = 'Numerical Solution of Equations', is_active = TRUE, stage = 'route_dependent'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_m_id AND t.component = 'Pure 2' AND t.old_number = 6;

  UPDATE public.chapters c SET number = t.old_number, is_active = TRUE, stage = 'route_dependent'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_m_id AND t.component = 'Pure 2' AND t.old_number BETWEEN 1 AND 5;

  -- Pure 3: Numerical Methods -> Numerical Solution of Equations (6), others 1..9
  UPDATE public.chapters c SET number = 6, title = 'Numerical Solution of Equations', is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_m_id AND t.component = 'Pure 3' AND t.old_number = 6;

  UPDATE public.chapters c SET number = t.old_number, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_m_id AND t.component = 'Pure 3' AND t.old_number != 6;

  -- Mechanics: 1..5
  UPDATE public.chapters c SET number = t.old_number, is_active = TRUE, stage = 'route_dependent'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_m_id AND t.component = 'Mechanics';

  -- Statistics 1: 1..5
  UPDATE public.chapters c SET number = t.old_number, is_active = TRUE, stage = 'route_dependent'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_m_id AND t.component = 'Statistics 1';

  -- Statistics 2: 1..5
  UPDATE public.chapters c SET number = t.old_number, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_m_id AND t.component = 'Statistics 2';


  -- 6. Apply final official numbers & in-place corrections to Physics 9702
  -- AS Core:
  -- Topic 1..6: Physical Quantities(1), Kinematics(2), Dynamics(3), Forces(4), Work(5), Deformation(6)
  UPDATE public.chapters c SET number = t.old_number, is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'AS Core' AND t.old_number BETWEEN 1 AND 6;

  -- Topic 7: Waves and Superposition -> Waves (7)
  UPDATE public.chapters c SET number = 7, title = 'Waves', is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'AS Core' AND t.old_number = 7;

  -- Topic 9: Electricity (old 8 -> 9)
  UPDATE public.chapters c SET number = 9, title = 'Electricity', is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'AS Core' AND t.old_number = 8;

  -- Topic 10: D.C. Circuits (old 9 -> 10)
  UPDATE public.chapters c SET number = 10, title = 'D.C. Circuits', is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'AS Core' AND t.old_number = 9;

  -- Topic 11: Particle Physics (old 10 Nuclear Physics -> 11 Particle Physics)
  UPDATE public.chapters c SET number = 11, title = 'Particle Physics', is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'AS Core' AND t.old_number = 10;

  -- A2 Core:
  -- Topic 12: Motion in a Circle (old 1 -> 12)
  UPDATE public.chapters c SET number = 12, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Core' AND t.old_number = 1;

  -- Topic 13: Gravitational Fields (old 2 -> 13)
  UPDATE public.chapters c SET number = 13, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Core' AND t.old_number = 2;

  -- Topic 14: Temperature (old 3 Temperature and Ideal Gases -> 14 Temperature)
  UPDATE public.chapters c SET number = 14, title = 'Temperature', is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Core' AND t.old_number = 3;

  -- Topic 16: Thermodynamics (old 4 -> 16)
  UPDATE public.chapters c SET number = 16, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Core' AND t.old_number = 4;

  -- Topic 17: Oscillations (old 5 -> 17)
  UPDATE public.chapters c SET number = 17, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Core' AND t.old_number = 5;

  -- Topic 18: Electric Fields (old 6 -> 18)
  UPDATE public.chapters c SET number = 18, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Core' AND t.old_number = 6;

  -- Topic 19: Capacitance (old 7 -> 19)
  UPDATE public.chapters c SET number = 19, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Core' AND t.old_number = 7;

  -- Topic 20: Magnetic Fields (old 8 Magnetic Fields and Electromagnetism -> 20 Magnetic Fields)
  UPDATE public.chapters c SET number = 20, title = 'Magnetic Fields', is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Core' AND t.old_number = 8;

  -- Deprecated A2 Core 9 Electromagnetic Induction -> 99
  UPDATE public.chapters c SET number = 99, title = 'Electromagnetic Induction (Deprecated)', is_active = FALSE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Core' AND t.old_number = 9;

  -- Topic 21: Alternating Currents (old 10 -> 21)
  UPDATE public.chapters c SET number = 21, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Core' AND t.old_number = 10;

  -- Topic 22: Quantum Physics (old 11 -> 22)
  UPDATE public.chapters c SET number = 22, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Core' AND t.old_number = 11;

  -- Topic 23: Nuclear Physics (old 12 Nuclear Physics (A2) -> 23 Nuclear Physics)
  UPDATE public.chapters c SET number = 23, title = 'Nuclear Physics', is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Core' AND t.old_number = 12;

  -- A2 Applied:
  -- Topic 24: Medical Physics (old 1 Medical Imaging -> 24 Medical Physics)
  UPDATE public.chapters c SET number = 24, title = 'Medical Physics', is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Applied' AND t.old_number = 1;

  -- Topic 25: Astronomy and Cosmology (old 2 -> 25)
  UPDATE public.chapters c SET number = 25, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_p_id AND t.component = 'A2 Applied' AND t.old_number = 2;


  -- 7. Apply final official numbers & in-place corrections to Chemistry 9701
  -- AS Physical Topics 1..8
  UPDATE public.chapters c SET number = t.old_number, is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'AS Physical' AND t.old_number BETWEEN 1 AND 8;

  -- AS Inorganic Topics 9..12 (old 1..4 -> 9..12)
  UPDATE public.chapters c SET number = 9, title = 'The Periodic Table: Chemical Periodicity', is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'AS Inorganic' AND t.old_number = 1;

  UPDATE public.chapters c SET number = 10, is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'AS Inorganic' AND t.old_number = 2;

  UPDATE public.chapters c SET number = 11, is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'AS Inorganic' AND t.old_number = 3;

  UPDATE public.chapters c SET number = 12, is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'AS Inorganic' AND t.old_number = 4;

  -- AS Organic Topics 13..17 (old 1..5 -> 13..17)
  UPDATE public.chapters c SET number = 13, title = 'An Introduction to AS Level Organic Chemistry', is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'AS Organic' AND t.old_number = 1;

  UPDATE public.chapters c SET number = 14, is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'AS Organic' AND t.old_number = 2;

  UPDATE public.chapters c SET number = 15, is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'AS Organic' AND t.old_number = 3;

  UPDATE public.chapters c SET number = 16, is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'AS Organic' AND t.old_number = 4;

  UPDATE public.chapters c SET number = 17, is_active = TRUE, stage = 'as'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'AS Organic' AND t.old_number = 5;

  -- A2 Physical Topics 23..25 (old 1..3 -> 23..25)
  UPDATE public.chapters c SET number = 23, title = 'Chemical Energetics', is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'A2 Physical' AND t.old_number = 1;

  UPDATE public.chapters c SET number = 24, title = 'Electrochemistry', is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'A2 Physical' AND t.old_number = 2;

  UPDATE public.chapters c SET number = 25, title = 'Equilibria', is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'A2 Physical' AND t.old_number = 3;

  -- A2 Inorganic Topic 28 (Chemistry of Transition Elements, old 1 -> 28)
  UPDATE public.chapters c SET number = 28, title = 'Chemistry of Transition Elements', is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'A2 Inorganic' AND t.old_number = 1;

  -- A2 Organic Topics 33..35 (Carboxylic Acids(33), Nitrogen Compounds(34), Polymerisation(35), old 1..3 -> 33..35)
  UPDATE public.chapters c SET number = 33, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'A2 Organic' AND t.old_number = 1;

  UPDATE public.chapters c SET number = 34, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'A2 Organic' AND t.old_number = 2;

  UPDATE public.chapters c SET number = 35, is_active = TRUE, stage = 'a2'
  FROM temp_legacy_chapters t WHERE c.id = t.chapter_id AND t.subject_id = v_c_id AND t.component = 'A2 Organic' AND t.old_number = 3;

  -- 8. Assert that NONE of the captured legacy chapter IDs remain in the staging range
  IF EXISTS (
    SELECT 1 FROM public.chapters c
    JOIN   temp_legacy_chapters t ON t.chapter_id = c.id
    WHERE  c.number >= 1000
  ) THEN
    RAISE EXCEPTION 'Scoped renumbering assertion failed: legacy chapters remain in staging range >= 1000';
  END IF;
END $$;


-- ─── 8. Seed New Official Chapters (Deterministic UUIDv5) ─────────────────────

DO $$
DECLARE
  v_fm_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9231');
  v_p_id  UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702');
  v_c_id  UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701');
  v_cs_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9618');
BEGIN
  -- ── Physics 9702 Missing Splits ──────────────────────────────────────────
  INSERT INTO public.chapters (id, subject_id, title, number, component, stage, is_active, is_global) VALUES
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9702-superposition'), v_p_id, 'Superposition', 8, 'AS Core', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9702-ideal-gases'), v_p_id, 'Ideal Gases', 15, 'A2 Core', 'a2', TRUE, TRUE)
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, number = EXCLUDED.number, component = EXCLUDED.component, stage = EXCLUDED.stage, is_active = EXCLUDED.is_active;

  -- ── Chemistry 9701 Missing Topics ────────────────────────────────────────
  INSERT INTO public.chapters (id, subject_id, title, number, component, stage, is_active, is_global) VALUES
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9701-as-carboxylic'), v_c_id, 'Carboxylic Acids and Derivatives', 18, 'AS Organic', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9701-as-nitrogen'), v_c_id, 'Nitrogen Compounds', 19, 'AS Organic', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9701-as-polymerisation'), v_c_id, 'Polymerisation', 20, 'AS Organic', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9701-as-synthesis'), v_c_id, 'Organic Synthesis', 21, 'AS Organic', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9701-as-analytical'), v_c_id, 'Analytical Techniques', 22, 'AS Analysis', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9701-a2-kinetics'), v_c_id, 'Reaction Kinetics', 26, 'A2 Physical', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9701-a2-group2'), v_c_id, 'Group 2', 27, 'A2 Inorganic', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9701-a2-intro-organic'), v_c_id, 'An Introduction to A Level Organic Chemistry', 29, 'A2 Organic', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9701-a2-hydrocarbons'), v_c_id, 'Hydrocarbons', 30, 'A2 Organic', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9701-a2-halogen'), v_c_id, 'Halogen Compounds', 31, 'A2 Organic', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9701-a2-hydroxy'), v_c_id, 'Hydroxy Compounds', 32, 'A2 Organic', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9701-a2-synthesis'), v_c_id, 'Organic Synthesis', 36, 'A2 Organic', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9701-a2-analytical'), v_c_id, 'Analytical Techniques', 37, 'A2 Analysis', 'a2', TRUE, TRUE)
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, number = EXCLUDED.number, component = EXCLUDED.component, stage = EXCLUDED.stage, is_active = EXCLUDED.is_active;

  -- ── Further Mathematics 9231 Chapters (24 chapters) ──────────────────────
  INSERT INTO public.chapters (id, subject_id, title, number, component, stage, is_active, is_global) VALUES
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fp1-1'), v_fm_id, 'Roots of Polynomial Equations', 1, 'Further Pure 1', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fp1-2'), v_fm_id, 'Rational Functions and Graphs', 2, 'Further Pure 1', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fp1-3'), v_fm_id, 'Summation of Series', 3, 'Further Pure 1', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fp1-4'), v_fm_id, 'Matrices', 4, 'Further Pure 1', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fp1-5'), v_fm_id, 'Polar Coordinates', 5, 'Further Pure 1', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fp1-6'), v_fm_id, 'Vectors', 6, 'Further Pure 1', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fp1-7'), v_fm_id, 'Proof by Induction', 7, 'Further Pure 1', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fp2-1'), v_fm_id, 'Hyperbolic Functions', 1, 'Further Pure 2', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fp2-2'), v_fm_id, 'Matrices', 2, 'Further Pure 2', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fp2-3'), v_fm_id, 'Differentiation', 3, 'Further Pure 2', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fp2-4'), v_fm_id, 'Integration', 4, 'Further Pure 2', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fp2-5'), v_fm_id, 'Complex Numbers', 5, 'Further Pure 2', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fp2-6'), v_fm_id, 'Differential Equations', 6, 'Further Pure 2', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fm-1'), v_fm_id, 'Motion of a Projectile', 1, 'Further Mechanics', 'route_dependent', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fm-2'), v_fm_id, 'Equilibrium of a Rigid Body', 2, 'Further Mechanics', 'route_dependent', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fm-3'), v_fm_id, 'Circular Motion', 3, 'Further Mechanics', 'route_dependent', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fm-4'), v_fm_id, 'Hooke''s Law', 4, 'Further Mechanics', 'route_dependent', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fm-5'), v_fm_id, 'Linear Motion under a Variable Force', 5, 'Further Mechanics', 'route_dependent', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fm-6'), v_fm_id, 'Momentum', 6, 'Further Mechanics', 'route_dependent', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fps-1'), v_fm_id, 'Continuous Random Variables', 1, 'Further Probability & Statistics', 'route_dependent', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fps-2'), v_fm_id, 'Inference Using Normal and t-Distributions', 2, 'Further Probability & Statistics', 'route_dependent', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fps-3'), v_fm_id, 'Chi-squared Tests', 3, 'Further Probability & Statistics', 'route_dependent', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fps-4'), v_fm_id, 'Non-parametric Tests', 4, 'Further Probability & Statistics', 'route_dependent', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9231-fps-5'), v_fm_id, 'Probability Generating Functions', 5, 'Further Probability & Statistics', 'route_dependent', TRUE, TRUE)
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, number = EXCLUDED.number, component = EXCLUDED.component, stage = EXCLUDED.stage, is_active = EXCLUDED.is_active;

  -- ── Computer Science 9618 Chapters (20 chapters) ─────────────────────────
  INSERT INTO public.chapters (id, subject_id, title, number, component, stage, is_active, is_global) VALUES
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p1-1'), v_cs_id, 'Information Representation', 1, 'Theory Fundamentals', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p1-2'), v_cs_id, 'Communication', 2, 'Theory Fundamentals', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p1-3'), v_cs_id, 'Hardware', 3, 'Theory Fundamentals', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p1-4'), v_cs_id, 'Processor Fundamentals', 4, 'Theory Fundamentals', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p1-5'), v_cs_id, 'System Software', 5, 'Theory Fundamentals', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p1-6'), v_cs_id, 'Security, Privacy and Data Integrity', 6, 'Theory Fundamentals', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p1-7'), v_cs_id, 'Ethics and Ownership', 7, 'Theory Fundamentals', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p1-8'), v_cs_id, 'Databases', 8, 'Theory Fundamentals', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p2-9'), v_cs_id, 'Algorithm Design and Problem-solving', 9, 'Fundamental Problem-solving & Programming', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p2-10'), v_cs_id, 'Data Types and Structures', 10, 'Fundamental Problem-solving & Programming', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p2-11'), v_cs_id, 'Programming', 11, 'Fundamental Problem-solving & Programming', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p2-12'), v_cs_id, 'Software Development', 12, 'Fundamental Problem-solving & Programming', 'as', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p3-13'), v_cs_id, 'Data Representation', 13, 'Advanced Theory', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p3-14'), v_cs_id, 'Communication and Internet Technologies', 14, 'Advanced Theory', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p3-15'), v_cs_id, 'Hardware and Virtual Machines', 15, 'Advanced Theory', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p3-16'), v_cs_id, 'System Software', 16, 'Advanced Theory', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p3-17'), v_cs_id, 'Security', 17, 'Advanced Theory', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p3-18'), v_cs_id, 'Artificial Intelligence (AI)', 18, 'Advanced Theory', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p4-19'), v_cs_id, 'Computational Thinking and Problem-solving', 19, 'Further Problem-solving & Programming', 'a2', TRUE, TRUE),
    (extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'c-9618-p4-20'), v_cs_id, 'Further Programming', 20, 'Further Problem-solving & Programming', 'a2', TRUE, TRUE)
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, number = EXCLUDED.number, component = EXCLUDED.component, stage = EXCLUDED.stage, is_active = EXCLUDED.is_active;
END $$;


-- ─── 9. Seed Chapter to Paper Linkages (chapter_papers) ───────────────────────

DO $$
DECLARE
  v_m_id  UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9709');
  v_fm_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9231');
  v_p_id  UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702');
  v_c_id  UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701');
  v_cs_id UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9618');
BEGIN
  -- ── Mathematics 9709 ─────────────────────────────────────────────────────
  -- Pure 1 (Chapters 1..8) -> Paper 1
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-1')
  FROM   public.chapters c WHERE c.subject_id = v_m_id AND c.component = 'Pure 1' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- Pure 2 (Chapters 1..6) -> Paper 2
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-2')
  FROM   public.chapters c WHERE c.subject_id = v_m_id AND c.component = 'Pure 2' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- Pure 3 (Chapters 1..9) -> Paper 3
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-3')
  FROM   public.chapters c WHERE c.subject_id = v_m_id AND c.component = 'Pure 3' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- Mechanics (Chapters 1..5) -> Paper 4
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-4')
  FROM   public.chapters c WHERE c.subject_id = v_m_id AND c.component = 'Mechanics' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- Statistics 1 (Chapters 1..5) -> Paper 5
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-5')
  FROM   public.chapters c WHERE c.subject_id = v_m_id AND c.component = 'Statistics 1' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- Statistics 2 (Chapters 1..5) -> Paper 6
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9709-6')
  FROM   public.chapters c WHERE c.subject_id = v_m_id AND c.component = 'Statistics 2' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- ── Further Mathematics 9231 ─────────────────────────────────────────────
  -- Further Pure 1 (Chapters 1..7) -> Paper 1
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-1')
  FROM   public.chapters c WHERE c.subject_id = v_fm_id AND c.component = 'Further Pure 1' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- Further Pure 2 (Chapters 1..6) -> Paper 2
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-2')
  FROM   public.chapters c WHERE c.subject_id = v_fm_id AND c.component = 'Further Pure 2' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- Further Mechanics (Chapters 1..6) -> Paper 3
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-3')
  FROM   public.chapters c WHERE c.subject_id = v_fm_id AND c.component = 'Further Mechanics' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- Further Probability & Statistics (Chapters 1..5) -> Paper 4
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9231-4')
  FROM   public.chapters c WHERE c.subject_id = v_fm_id AND c.component = 'Further Probability & Statistics' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- ── Physics 9702 ─────────────────────────────────────────────────────────
  -- Papers 1, 2 -> AS Core (Topics 1..11)
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-1')
  FROM   public.chapters c WHERE c.subject_id = v_p_id AND c.stage = 'as' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-2')
  FROM   public.chapters c WHERE c.subject_id = v_p_id AND c.stage = 'as' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- Paper 4 -> A2 Core & Applied (Topics 12..25)
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9702-4')
  FROM   public.chapters c WHERE c.subject_id = v_p_id AND c.stage = 'a2' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- (Note: Physics Papers 3 and 5 assess cross-cutting practical/experimental skills; no direct chapter rows needed)

  -- ── Chemistry 9701 ───────────────────────────────────────────────────────
  -- Papers 1, 2 -> AS Topics 1..22
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-1')
  FROM   public.chapters c WHERE c.subject_id = v_c_id AND c.stage = 'as' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-2')
  FROM   public.chapters c WHERE c.subject_id = v_c_id AND c.stage = 'as' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- Paper 4 -> A2 Topics 23..37
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9701-4')
  FROM   public.chapters c WHERE c.subject_id = v_c_id AND c.stage = 'a2' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- (Note: Chemistry Papers 3 and 5 assess cross-cutting practical/experimental skills; no direct chapter rows needed)

  -- ── Computer Science 9618 ────────────────────────────────────────────────
  -- Paper 1 -> Theory Fundamentals (Chapters 1..8)
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-1')
  FROM   public.chapters c WHERE c.subject_id = v_cs_id AND c.component = 'Theory Fundamentals' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- Paper 2 -> Problem-solving & Programming (Chapters 9..12)
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-2')
  FROM   public.chapters c WHERE c.subject_id = v_cs_id AND c.component = 'Fundamental Problem-solving & Programming' AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- Paper 3 -> Advanced Theory (Chapters 13..20)
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-3')
  FROM   public.chapters c WHERE c.subject_id = v_cs_id AND c.number BETWEEN 13 AND 20 AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;

  -- Paper 4 -> Practical Programming (Chapters 19..20)
  INSERT INTO public.chapter_papers (chapter_id, subject_paper_id)
  SELECT c.id, extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 'sp-9618-4')
  FROM   public.chapters c WHERE c.subject_id = v_cs_id AND c.number IN (19, 20) AND c.is_active = TRUE
  ON CONFLICT (chapter_id, subject_paper_id) DO NOTHING;
END $$;


-- ─── 10. Database Triggers for Boundary Integrity ────────────────────────────

-- 10.1 Chapter to Paper subject match trigger
CREATE OR REPLACE FUNCTION public.validate_chapter_paper_subject()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_c_subj  UUID;
  v_sp_subj UUID;
BEGIN
  SELECT subject_id INTO v_c_subj FROM public.chapters WHERE id = NEW.chapter_id;
  SELECT subject_id INTO v_sp_subj FROM public.subject_papers WHERE id = NEW.subject_paper_id;

  IF v_c_subj IS DISTINCT FROM v_sp_subj THEN
    RAISE EXCEPTION 'Chapter subject (%) does not match Paper subject (%)', v_c_subj, v_sp_subj
      USING ERRCODE = 'P0008';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_chapter_paper_subject ON public.chapter_papers;
CREATE TRIGGER trg_validate_chapter_paper_subject
  BEFORE INSERT OR UPDATE ON public.chapter_papers
  FOR EACH ROW EXECUTE FUNCTION public.validate_chapter_paper_subject();

-- 10.2 Subject paper selection subject match & route integrity trigger
CREATE OR REPLACE FUNCTION public.validate_subject_paper_selection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_us_subj     UUID;
  v_us_route    TEXT;
  v_sp_subj     UUID;
  v_sp_behavior TEXT;
BEGIN
  IF NEW.subject_paper_id IS NOT NULL THEN
    SELECT subject_id, study_route::TEXT INTO v_us_subj, v_us_route
    FROM public.user_subjects WHERE id = NEW.user_subject_id;

    SELECT subject_id, stage_behavior INTO v_sp_subj, v_sp_behavior
    FROM public.subject_papers WHERE id = NEW.subject_paper_id;

    IF v_us_subj IS DISTINCT FROM v_sp_subj THEN
      RAISE EXCEPTION 'Selected paper subject (%) does not match enrollment subject (%)', v_sp_subj, v_us_subj
        USING ERRCODE = 'P0008';
    END IF;

    IF v_us_route = 'as_only' AND NEW.stage = 'a2' THEN
      RAISE EXCEPTION 'as_only route cannot include A2 paper selections'
        USING ERRCODE = 'P0008';
    END IF;

    IF v_sp_behavior = 'fixed_as' AND NEW.stage != 'as' THEN
      RAISE EXCEPTION 'Fixed AS paper cannot be selected as A2'
        USING ERRCODE = 'P0008';
    END IF;

    IF v_sp_behavior = 'fixed_a2' AND NEW.stage != 'a2' THEN
      RAISE EXCEPTION 'Fixed A2 paper cannot be selected as AS'
        USING ERRCODE = 'P0008';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_subject_paper_selection ON public.subject_paper_selections;
CREATE TRIGGER trg_validate_subject_paper_selection
  BEFORE INSERT OR UPDATE ON public.subject_paper_selections
  FOR EACH ROW EXECUTE FUNCTION public.validate_subject_paper_selection();

-- 10.3 Past paper integrity trigger (Strict for MVP subjects, allows identity-preserving updates)
CREATE OR REPLACE FUNCTION public.validate_past_paper_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_is_mvp_subject   BOOLEAN;
  v_paper_subject_id UUID;
  v_base_paper_num   SMALLINT;
  v_official_num     SMALLINT;
  v_user_stage       TEXT;
  v_sel_stage        TEXT;
BEGIN
  SELECT is_available INTO v_is_mvp_subject
  FROM   public.subjects
  WHERE  id = NEW.subject_id;

  -- ── Identity-preserving update check ──────────────────────────────────────
  -- An existing record update is allowed if all identity fields are completely unchanged.
  -- This protects both legacy null records, backfills, and historical MVP records whose paper
  -- is no longer in the student's active current route.
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.user_id IS NOT DISTINCT FROM NEW.user_id
        AND OLD.subject_id IS NOT DISTINCT FROM NEW.subject_id
        AND OLD.paper_number IS NOT DISTINCT FROM NEW.paper_number
        AND OLD.stage IS NOT DISTINCT FROM NEW.stage
        AND (OLD.subject_paper_id IS NOT DISTINCT FROM NEW.subject_paper_id
             OR (OLD.subject_paper_id IS NULL AND NEW.subject_paper_id IS NOT NULL))) THEN
      -- If populating subject_paper_id from NULL, verify paper belongs to subject and matches base paper number
      IF OLD.subject_paper_id IS NULL AND NEW.subject_paper_id IS NOT NULL THEN
        SELECT subject_id, paper_number INTO v_paper_subject_id, v_official_num
        FROM   public.subject_papers
        WHERE  id = NEW.subject_paper_id;

        v_base_paper_num := CASE WHEN NEW.paper_number >= 10 THEN (NEW.paper_number / 10)::SMALLINT ELSE NEW.paper_number END;
        IF v_paper_subject_id IS DISTINCT FROM NEW.subject_id OR v_base_paper_num IS DISTINCT FROM v_official_num THEN
          RAISE EXCEPTION 'Backfilled subject_paper_id does not match past paper subject or paper number'
            USING ERRCODE = 'P0008';
        END IF;
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  -- ── Strict MVP Validation ────────────────────────────────────────────────
  IF COALESCE(v_is_mvp_subject, FALSE) = TRUE THEN
    IF NEW.subject_paper_id IS NULL THEN
      RAISE EXCEPTION 'subject_paper_id is required for past papers in MVP subjects'
        USING ERRCODE = 'P0008';
    END IF;

    SELECT subject_id, paper_number INTO v_paper_subject_id, v_official_num
    FROM   public.subject_papers
    WHERE  id = NEW.subject_paper_id;

    IF v_paper_subject_id IS DISTINCT FROM NEW.subject_id THEN
      RAISE EXCEPTION 'Selected paper does not belong to subject %', NEW.subject_id
        USING ERRCODE = 'P0008';
    END IF;

    v_base_paper_num := CASE WHEN NEW.paper_number >= 10 THEN (NEW.paper_number / 10)::SMALLINT ELSE NEW.paper_number END;
    IF v_base_paper_num IS DISTINCT FROM v_official_num THEN
      RAISE EXCEPTION 'Paper code number % does not match official paper %', NEW.paper_number, v_official_num
        USING ERRCODE = 'P0008';
    END IF;

    -- Verify paper is in user's active selections for confirmed route
    SELECT sps.stage, us.current_stage::TEXT
    INTO   v_sel_stage, v_user_stage
    FROM   public.user_subjects us
    JOIN   public.subject_paper_selections sps
           ON sps.user_subject_id = us.id
          AND sps.subject_paper_id = NEW.subject_paper_id
    WHERE  us.user_id = NEW.user_id
      AND  us.subject_id = NEW.subject_id
      AND  us.is_archived = FALSE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Paper % is not selected in the user route for this subject', v_official_num
        USING ERRCODE = 'P0008';
    END IF;

    IF NEW.stage IS DISTINCT FROM v_sel_stage THEN
      RAISE EXCEPTION 'Paper stage % does not match route selection stage %', NEW.stage, v_sel_stage
        USING ERRCODE = 'P0008';
    END IF;

    IF NEW.stage = 'a2' AND v_user_stage NOT IN ('a2', 'full') THEN
      RAISE EXCEPTION 'A2 papers are locked until promotion to A2'
        USING ERRCODE = 'P0008';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_past_paper_entry ON public.past_papers;
CREATE TRIGGER trg_validate_past_paper_entry
  BEFORE INSERT OR UPDATE ON public.past_papers
  FOR EACH ROW EXECUTE FUNCTION public.validate_past_paper_entry();

-- 10.4 Question attempt chapter validation trigger
CREATE OR REPLACE FUNCTION public.validate_question_attempt_chapter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id       UUID;
  v_subj_id       UUID;
  v_sp_id         UUID;
  v_pp_stage      TEXT;
  v_ch_subj_id    UUID;
  v_ch_stage      TEXT;
  v_ch_active     BOOLEAN;
  v_is_available  BOOLEAN;
  v_is_global     BOOLEAN;
  v_sp_subj_id    UUID;
  v_sp_num        SMALLINT;
  v_phys_id       UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9702');
  v_chem_id       UUID := extensions.uuid_generate_v5(extensions.uuid_ns_oid(), 's-9701');
BEGIN
  IF NEW.chapter_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fetch parent past paper info
  SELECT user_id, subject_id, subject_paper_id, stage
  INTO   v_user_id, v_subj_id, v_sp_id, v_pp_stage
  FROM   public.past_papers
  WHERE  id = NEW.paper_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced past paper not found' USING ERRCODE = 'P0008';
  END IF;

  -- Fetch subject info
  SELECT is_available, is_global INTO v_is_available, v_is_global
  FROM   public.subjects
  WHERE  id = v_subj_id;

  -- Fetch chapter info
  SELECT subject_id, stage::TEXT, is_active
  INTO   v_ch_subj_id, v_ch_stage, v_ch_active
  FROM   public.chapters
  WHERE  id = NEW.chapter_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced chapter does not exist' USING ERRCODE = 'P0008';
  END IF;

  -- Chapter must belong to same subject as paper
  IF v_ch_subj_id != v_subj_id THEN
    RAISE EXCEPTION 'Question chapter does not belong to the past paper subject'
      USING ERRCODE = 'P0008';
  END IF;

  -- Chapter must be active
  IF v_ch_active = FALSE THEN
    RAISE EXCEPTION 'Question chapter is inactive or deprecated'
      USING ERRCODE = 'P0008';
  END IF;

  -- For unsupported / custom legacy subjects: only require active user subject enrolment
  IF COALESCE(v_is_available, FALSE) = FALSE OR COALESCE(v_is_global, FALSE) = FALSE THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_subjects
      WHERE user_id = v_user_id AND subject_id = v_subj_id AND is_archived = FALSE
    ) THEN
      RAISE EXCEPTION 'User is not enrolled in this subject' USING ERRCODE = 'P0008';
    END IF;
    RETURN NEW;
  END IF;

  -- For MVP subjects: validate chapter access against the past paper's recorded stage
  IF v_pp_stage = 'as' AND v_ch_stage = 'a2' THEN
    RAISE EXCEPTION 'Cannot assign A2 chapter to an AS past paper' USING ERRCODE = 'P0008';
  END IF;

  -- If subject_paper_id is provided, enforce paper component chapter mapping
  IF v_sp_id IS NOT NULL THEN
    SELECT subject_id, paper_number
    INTO   v_sp_subj_id, v_sp_num
    FROM   public.subject_papers
    WHERE  id = v_sp_id;

    -- Practical cross-cutting rules:
    -- Physics 9702 / Chemistry 9701 Paper 3: AS accessible chapters
    IF (v_sp_subj_id = v_phys_id OR v_sp_subj_id = v_chem_id) AND v_sp_num = 3 THEN
      IF v_ch_stage NOT IN ('as', 'shared') THEN
        RAISE EXCEPTION 'Practical Paper 3 questions may only be tagged with accessible AS chapters'
          USING ERRCODE = 'P0008';
      END IF;
      RETURN NEW;
    END IF;

    -- Physics 9702 / Chemistry 9701 Paper 5: Any accessible active chapter
    IF (v_sp_subj_id = v_phys_id OR v_sp_subj_id = v_chem_id) AND v_sp_num = 5 THEN
      RETURN NEW;
    END IF;

    -- Theory papers & CS: Must match chapter_papers mapping
    IF NOT EXISTS (
      SELECT 1 FROM public.chapter_papers cp
      WHERE cp.subject_paper_id = v_sp_id
        AND cp.chapter_id = NEW.chapter_id
    ) THEN
      RAISE EXCEPTION 'Chapter is not valid for the selected exam paper'
        USING ERRCODE = 'P0008';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_question_attempt_chapter ON public.paper_question_attempts;
CREATE TRIGGER trg_validate_question_attempt_chapter
  BEFORE INSERT OR UPDATE ON public.paper_question_attempts
  FOR EACH ROW EXECUTE FUNCTION public.validate_question_attempt_chapter();


-- ─── 11. Replace / Update Core Database Functions ────────────────────────────

-- 11.1 set_onboarding_subjects (Exact Signature Preserved: strictly 5 global MVP subjects)
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
  -- Trusted caller guard
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Onboarding completion guard
  SELECT onboarding_completed INTO v_onboarding_done
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_onboarding_done = TRUE THEN
    RAISE EXCEPTION 'Onboarding has already been completed for this profile'
      USING ERRCODE = 'P0005';
  END IF;

  -- Validate count: must be between 1 and 5
  v_count := cardinality(p_subject_ids);
  IF v_count IS NULL OR v_count < 1 OR v_count > 5 THEN
    RAISE EXCEPTION 'Must select between 1 and 5 subjects (got %)', COALESCE(v_count, 0)
      USING ERRCODE = 'P0003';
  END IF;

  -- Validate that all selected subjects exist, are global, and are MVP AVAILABLE
  IF (
    SELECT COUNT(DISTINCT id)
    FROM   public.subjects
    WHERE  id = ANY(p_subject_ids)
      AND  is_global = TRUE
      AND  is_available = TRUE
  ) != v_count THEN
    RAISE EXCEPTION 'One or more selected subjects do not exist or are not available for onboarding'
      USING ERRCODE = 'P0003';
  END IF;

  -- 1. Remove stale unselected subjects for this user strictly scoped to available global MVP subjects
  DELETE FROM public.user_subjects us
  USING  public.subjects s
  WHERE  us.subject_id = s.id
    AND  us.user_id = p_user_id
    AND  s.is_global = TRUE
    AND  s.is_available = TRUE
    AND  NOT (us.subject_id = ANY(p_subject_ids));

  -- Insert or unarchive selected subjects in user-specified order
  v_idx := 1;
  FOREACH v_subj_id IN ARRAY p_subject_ids LOOP
    INSERT INTO public.user_subjects (user_id, subject_id, priority, is_archived, study_route, current_stage)
    VALUES (p_user_id, v_subj_id, v_idx, FALSE, 'unconfirmed', NULL)
    ON CONFLICT (user_id, subject_id) DO UPDATE
      SET priority    = v_idx,
          is_archived = FALSE,
          updated_at  = NOW();
    v_idx := v_idx + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.set_onboarding_subjects(UUID, UUID[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_onboarding_subjects(UUID, UUID[]) TO authenticated, service_role;

-- 11.2 user_can_access_chapter (Updated: filters is_active = TRUE and uses chapter_papers)
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
  v_subject_id    UUID;
  v_chapter_stage TEXT;
  v_component     TEXT;
  v_is_active     BOOLEAN;
  v_route         TEXT;
  v_stage         TEXT;
  v_us_id         UUID;
BEGIN
  -- Trusted caller guard
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Fetch chapter details including is_active
  SELECT subject_id, stage, component, is_active
  INTO   v_subject_id, v_chapter_stage, v_component, v_is_active
  FROM   public.chapters
  WHERE  id = p_chapter_id;

  IF NOT FOUND OR v_is_active = FALSE THEN
    RETURN FALSE;
  END IF;

  -- Fetch user enrollment
  SELECT id, study_route::TEXT, current_stage::TEXT
  INTO   v_us_id, v_route, v_stage
  FROM   public.user_subjects
  WHERE  user_id    = p_user_id
    AND  subject_id = v_subject_id
    AND  is_archived = FALSE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_route = 'unconfirmed' OR v_chapter_stage IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN CASE v_chapter_stage
    WHEN 'as'     THEN TRUE
    WHEN 'shared' THEN TRUE
    WHEN 'a2'     THEN v_stage IN ('a2', 'full')
    WHEN 'route_dependent' THEN
      -- Authoritative check via chapter_papers & subject_paper_selections
      EXISTS (
        SELECT 1
        FROM   public.chapter_papers cp
        JOIN   public.subject_paper_selections sps
               ON sps.subject_paper_id = cp.subject_paper_id
        WHERE  cp.chapter_id = p_chapter_id
          AND  sps.user_subject_id = v_us_id
          AND  (
            sps.stage = 'as'
            OR (sps.stage = 'a2' AND v_stage IN ('a2', 'full'))
          )
      ) OR EXISTS (
        -- Fallback for legacy custom component selections
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

REVOKE ALL ON FUNCTION public.user_can_access_chapter(UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_can_access_chapter(UUID, UUID) TO authenticated, service_role;

-- 11.3 compute_readiness_score (3-arg: Filters is_active = TRUE and uses chapter_papers)
CREATE OR REPLACE FUNCTION public.compute_readiness_score(
  p_user_id    UUID,
  p_subject_id UUID,
  p_stage      TEXT
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
  -- Trusted caller guard
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_stage NOT IN ('as', 'a2', 'all') THEN
    RAISE EXCEPTION 'Invalid stage: %. Must be ''as'', ''a2'', or ''all''.', p_stage
      USING ERRCODE = 'P0002';
  END IF;

  -- 1. Total Accessible Active Chapters (Denominator)
  SELECT COUNT(DISTINCT c.id)
  INTO   v_total_chapters
  FROM   public.chapters c
  JOIN   public.user_subjects us
         ON  us.subject_id = c.subject_id
         AND us.user_id    = p_user_id
         AND us.is_archived = FALSE
  WHERE  (p_subject_id IS NULL OR c.subject_id = p_subject_id)
    AND  c.is_active = TRUE
    AND  us.study_route::TEXT != 'unconfirmed'
    AND  (
           CASE p_stage
             WHEN 'as' THEN
               c.stage IN ('as', 'shared')
               OR (c.stage = 'route_dependent' AND (
                 EXISTS (
                   SELECT 1 FROM public.chapter_papers cp
                   JOIN public.subject_paper_selections sps ON sps.subject_paper_id = cp.subject_paper_id
                   WHERE cp.chapter_id = c.id AND sps.user_subject_id = us.id AND sps.stage = 'as'
                 ) OR EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE sps.user_subject_id = us.id AND sps.component_name = c.component AND sps.stage = 'as'
                 )
               ))
             WHEN 'a2' THEN
               c.stage IN ('a2', 'shared')
               OR (c.stage = 'route_dependent' AND (
                 EXISTS (
                   SELECT 1 FROM public.chapter_papers cp
                   JOIN public.subject_paper_selections sps ON sps.subject_paper_id = cp.subject_paper_id
                   WHERE cp.chapter_id = c.id AND sps.user_subject_id = us.id AND sps.stage = 'a2'
                 ) OR EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE sps.user_subject_id = us.id AND sps.component_name = c.component AND sps.stage = 'a2'
                 )
               ))
             WHEN 'all' THEN
               c.stage IN ('as', 'shared')
               OR (c.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
               OR (c.stage = 'route_dependent' AND (
                 EXISTS (
                   SELECT 1 FROM public.chapter_papers cp
                   JOIN public.subject_paper_selections sps ON sps.subject_paper_id = cp.subject_paper_id
                   WHERE cp.chapter_id = c.id AND sps.user_subject_id = us.id
                     AND (sps.stage = 'as' OR (sps.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full')))
                 ) OR EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE sps.user_subject_id = us.id AND sps.component_name = c.component
                     AND (sps.stage = 'as' OR (sps.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full')))
                 )
               ))
           END
         )
    AND  c.stage IS NOT NULL;

  IF v_total_chapters = 0 THEN
    RETURN 0.00;
  END IF;

  -- 2. Complete Notes
  SELECT COUNT(DISTINCT uc.chapter_id)
  INTO   v_complete_notes
  FROM   public.user_chapters uc
  JOIN   public.chapters c ON c.id = uc.chapter_id
  JOIN   public.user_subjects us
         ON  us.subject_id = c.subject_id
         AND us.user_id    = p_user_id
         AND us.is_archived = FALSE
  WHERE  uc.user_id = p_user_id
    AND  uc.notes_status = 'complete'
    AND  c.is_active = TRUE
    AND  (p_subject_id IS NULL OR c.subject_id = p_subject_id)
    AND  us.study_route::TEXT != 'unconfirmed'
    AND  (
           CASE p_stage
             WHEN 'as' THEN
               c.stage IN ('as', 'shared')
               OR (c.stage = 'route_dependent' AND (
                 EXISTS (
                   SELECT 1 FROM public.chapter_papers cp
                   JOIN public.subject_paper_selections sps ON sps.subject_paper_id = cp.subject_paper_id
                   WHERE cp.chapter_id = c.id AND sps.user_subject_id = us.id AND sps.stage = 'as'
                 ) OR EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE sps.user_subject_id = us.id AND sps.component_name = c.component AND sps.stage = 'as'
                 )
               ))
             WHEN 'a2' THEN
               c.stage IN ('a2', 'shared')
               OR (c.stage = 'route_dependent' AND (
                 EXISTS (
                   SELECT 1 FROM public.chapter_papers cp
                   JOIN public.subject_paper_selections sps ON sps.subject_paper_id = cp.subject_paper_id
                   WHERE cp.chapter_id = c.id AND sps.user_subject_id = us.id AND sps.stage = 'a2'
                 ) OR EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE sps.user_subject_id = us.id AND sps.component_name = c.component AND sps.stage = 'a2'
                 )
               ))
             WHEN 'all' THEN
               c.stage IN ('as', 'shared')
               OR (c.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
               OR (c.stage = 'route_dependent' AND (
                 EXISTS (
                   SELECT 1 FROM public.chapter_papers cp
                   JOIN public.subject_paper_selections sps ON sps.subject_paper_id = cp.subject_paper_id
                   WHERE cp.chapter_id = c.id AND sps.user_subject_id = us.id
                     AND (sps.stage = 'as' OR (sps.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full')))
                 ) OR EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE sps.user_subject_id = us.id AND sps.component_name = c.component
                     AND (sps.stage = 'as' OR (sps.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full')))
                 )
               ))
           END
         );

  v_notes_pct := COALESCE(v_complete_notes, 0)::NUMERIC / v_total_chapters;

  -- 3. Confidence Sum
  SELECT COALESCE(SUM(COALESCE(uc.confidence_level, 0)::NUMERIC / 5.0), 0)
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
    AND  c.is_active = TRUE
    AND  us.study_route::TEXT != 'unconfirmed'
    AND  (
           CASE p_stage
             WHEN 'as' THEN
               c.stage IN ('as', 'shared')
               OR (c.stage = 'route_dependent' AND (
                 EXISTS (
                   SELECT 1 FROM public.chapter_papers cp
                   JOIN public.subject_paper_selections sps ON sps.subject_paper_id = cp.subject_paper_id
                   WHERE cp.chapter_id = c.id AND sps.user_subject_id = us.id AND sps.stage = 'as'
                 ) OR EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE sps.user_subject_id = us.id AND sps.component_name = c.component AND sps.stage = 'as'
                 )
               ))
             WHEN 'a2' THEN
               c.stage IN ('a2', 'shared')
               OR (c.stage = 'route_dependent' AND (
                 EXISTS (
                   SELECT 1 FROM public.chapter_papers cp
                   JOIN public.subject_paper_selections sps ON sps.subject_paper_id = cp.subject_paper_id
                   WHERE cp.chapter_id = c.id AND sps.user_subject_id = us.id AND sps.stage = 'a2'
                 ) OR EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE sps.user_subject_id = us.id AND sps.component_name = c.component AND sps.stage = 'a2'
                 )
               ))
             WHEN 'all' THEN
               c.stage IN ('as', 'shared')
               OR (c.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
               OR (c.stage = 'route_dependent' AND (
                 EXISTS (
                   SELECT 1 FROM public.chapter_papers cp
                   JOIN public.subject_paper_selections sps ON sps.subject_paper_id = cp.subject_paper_id
                   WHERE cp.chapter_id = c.id AND sps.user_subject_id = us.id
                     AND (sps.stage = 'as' OR (sps.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full')))
                 ) OR EXISTS (
                   SELECT 1 FROM public.subject_paper_selections sps
                   WHERE sps.user_subject_id = us.id AND sps.component_name = c.component
                     AND (sps.stage = 'as' OR (sps.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full')))
                 )
               ))
           END
         );

  v_confidence_pct := v_confidence_sum / v_total_chapters;

  -- 4. Past Paper Accuracy
  SELECT COALESCE(AVG(pp.accuracy_pct), 0) / 100.0
  INTO   v_paper_accuracy
  FROM   public.past_papers pp
  WHERE  pp.user_id = p_user_id
    AND  (p_subject_id IS NULL OR pp.subject_id = p_subject_id)
    AND  (
           CASE p_stage
             WHEN 'as'  THEN pp.stage = 'as'
             WHEN 'a2'  THEN pp.stage = 'a2'
             WHEN 'all' THEN pp.stage IN ('as', 'a2')
           END
         );

  -- Readiness Formula: notes(35%) + paper_acc(40%) + conf(25%)
  RETURN ROUND(
    (
      (v_notes_pct       * 0.35) +
      (v_paper_accuracy  * 0.40) +
      (v_confidence_pct  * 0.25)
    ) * 100,
    2
  );
END;
$$;

REVOKE ALL ON FUNCTION public.compute_readiness_score(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.compute_readiness_score(UUID, UUID, TEXT) TO authenticated, service_role;

-- 11.4 compute_readiness_score (2-arg wrapper: Exact Signature Preserved)
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

REVOKE ALL ON FUNCTION public.compute_readiness_score(UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.compute_readiness_score(UUID, UUID) TO authenticated, service_role;

-- 11.4.1 cancel_inaccessible_missions helper
CREATE OR REPLACE FUNCTION public.cancel_inaccessible_missions(
  p_user_id         UUID,
  p_user_subject_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_cancelled INTEGER;
BEGIN
  -- Trusted caller guard
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  WITH cancelled_ch AS (
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
  ),
  cancelled_pp AS (
    UPDATE public.daily_missions dm
    SET    status      = 'skipped',
           skip_reason = 'paper_inaccessible',
           skipped_at  = NOW()
    FROM   public.user_subjects us
    WHERE  us.id                   = p_user_subject_id
      AND  us.user_id              = p_user_id
      AND  dm.user_id              = p_user_id
      AND  dm.status               = 'pending'
      AND  dm.target_entity_type   = 'subject'
      AND  dm.target_entity_id     = us.subject_id
      AND  dm.type                 = 'attempt_paper'
      AND  (
             us.study_route = 'unconfirmed'
             OR dm.subject_paper_id IS NULL
             OR NOT EXISTS (
               SELECT 1 FROM public.subject_paper_selections sps
               WHERE sps.user_subject_id = us.id
                 AND sps.subject_paper_id = dm.subject_paper_id
                 AND (sps.stage = 'as' OR (sps.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full')))
             )
           )
    RETURNING dm.id
  )
  SELECT (SELECT COUNT(*) FROM cancelled_ch) + (SELECT COUNT(*) FROM cancelled_pp) INTO v_cancelled;

  RETURN COALESCE(v_cancelled, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_inaccessible_missions(UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_inaccessible_missions(UUID, UUID) TO authenticated, service_role;

-- 11.5 configure_subject_route (Exact Signature Preserved: strictly validates against subject_valid_routes and populates user_chapters)
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
  v_is_available         BOOLEAN;
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

  SELECT code, is_available INTO v_subj_code, v_is_available
  FROM   public.subjects
  WHERE  id = v_subject_id;

  v_new_stage := CASE p_route
    WHEN 'as_only'    THEN 'as'::public.subject_stage_enum
    WHEN 'staged'     THEN 'as'::public.subject_stage_enum
    WHEN 'full_level' THEN 'full'::public.subject_stage_enum
  END;

  v_is_fixed_route := (v_subj_code IN ('9702', '9701', '9618'));

  -- Temporary table to hold resolved paper selections for validation and insertion
  CREATE TEMP TABLE IF NOT EXISTS temp_route_selections (
    component_name   TEXT NOT NULL,
    paper_number     SMALLINT NOT NULL,
    stage            TEXT NOT NULL,
    subject_paper_id UUID
  ) ON COMMIT DROP;
  TRUNCATE TABLE temp_route_selections;

  -- Handle paper selections for available MVP subjects
  IF COALESCE(v_is_available, FALSE) = TRUE THEN
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

      -- Validate that the component exists in the subject's chapters or papers
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

REVOKE ALL ON FUNCTION public.configure_subject_route(UUID, UUID, public.study_route_enum, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.configure_subject_route(UUID, UUID, public.study_route_enum, JSONB) TO authenticated, service_role;

-- 11.6 transition_to_a2 (Exact Signature Preserved: unlocks active A2 chapters)
CREATE OR REPLACE FUNCTION public.transition_to_a2(
  p_user_id          UUID,
  p_user_subject_id  UUID,
  p_unlock_method    public.a2_unlock_method_enum,
  p_result_type      public.result_type_enum   DEFAULT NULL,
  p_score_obtained   SMALLINT                  DEFAULT NULL,
  p_score_maximum    SMALLINT                  DEFAULT NULL,
  p_exam_series      public.paper_session_enum DEFAULT NULL,
  p_exam_year        SMALLINT                  DEFAULT NULL,
  p_carry_forward    BOOLEAN                   DEFAULT FALSE
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

  UPDATE public.user_subjects
  SET
    study_route      = CASE WHEN p_unlock_method = 'manual' AND study_route = 'as_only' THEN 'staged'::public.study_route_enum ELSE study_route END,
    current_stage    = 'a2'::public.subject_stage_enum,
    a2_unlocked_at   = NOW(),
    a2_unlock_method = p_unlock_method,
    updated_at       = NOW()
  WHERE id = p_user_subject_id;

  -- Auto-populate user_chapters for active A2 chapters
  INSERT INTO public.user_chapters (user_id, chapter_id, notes_status)
  SELECT p_user_id, c.id, 'none'
  FROM   public.chapters c
  WHERE  c.subject_id = v_us.subject_id
    AND  c.is_active = TRUE
    AND  public.user_can_access_chapter(p_user_id, c.id)
  ON CONFLICT (user_id, chapter_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_to_a2(UUID, UUID, public.a2_unlock_method_enum, public.result_type_enum, SMALLINT, SMALLINT, public.paper_session_enum, SMALLINT, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.transition_to_a2(UUID, UUID, public.a2_unlock_method_enum, public.result_type_enum, SMALLINT, SMALLINT, public.paper_session_enum, SMALLINT, BOOLEAN) TO authenticated, service_role;

-- 11.7 generate_daily_missions (Exact Signature Preserved: populates subject_paper_id and preserves workload promise)
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
  -- Strict trusted caller guard
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- 2. Serialize user mission generation by locking user_settings row
  SELECT max_missions_per_day
  INTO   v_max_missions
  FROM   public.user_settings
  WHERE  user_id = p_user_id
  FOR UPDATE;

  v_max_missions := LEAST(COALESCE(v_max_missions, 3), 3);
  v_today := public.get_user_local_date(p_user_id);

  -- Recalculate active missions count & accumulated minutes after obtaining the lock
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
        AND  c.is_active         = TRUE
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
                     AND  (sps.component_name  = c.component OR (sps.subject_paper_id IS NOT NULL AND EXISTS (
                            SELECT 1 FROM public.chapter_papers cp WHERE cp.chapter_id = c.id AND cp.subject_paper_id = sps.subject_paper_id
                          )))
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
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + 10.0 AS score,
        NULL::UUID AS subject_paper_id
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
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + 10.0 AS score,
        NULL::UUID AS subject_paper_id
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
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + 5.0 AS score,
        NULL::UUID AS subject_paper_id
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
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + (CASE WHEN ac.confidence_level IS NULL THEN 8.0 ELSE 2.0 END) AS score,
        NULL::UUID AS subject_paper_id
      FROM accessible_chapters ac

      UNION ALL

      -- Action 5: Timed past paper section (Category B) — requires valid selected accessible subject_paper
      SELECT
        us.subject_id AS target_entity_id,
        'subject'::public.entity_type_enum AS target_entity_type,
        us.subject_id,
        'attempt_paper'::public.mission_type_enum AS type,
        'Attempt a timed ' || s.name || ' (' || COALESCE(sp.name, 'Past Paper') || ') past-paper section' AS title,
        s.name || ' · ' || COALESCE(sp.name, 'Past Paper') || ' · Spend ~45–60 min completing a timed past-paper question section' AS description,
        75::SMALLINT AS xp_reward,
        'hard' AS difficulty,
        60::SMALLINT AS estimated_minutes,
        GREATEST(1.0 / NULLIF((us.exam_date - v_today)::NUMERIC, 0), 0.01) * (us.priority::NUMERIC / 3.0) * 12.0
          + (CASE WHEN NOT EXISTS (
              SELECT 1 FROM public.past_papers pp
              WHERE pp.user_id = p_user_id AND pp.subject_id = us.subject_id AND pp.attempted_at BETWEEN (v_today - 6) AND v_today
            ) THEN 15.0 ELSE 0.0 END) AS score,
        sp.id AS subject_paper_id
      FROM public.user_subjects us
      JOIN public.subjects s ON s.id = us.subject_id
      LEFT JOIN LATERAL (
        SELECT
          sp_sub.id,
          COALESCE(sp_sub.name, sps.component_name, 'Past Paper') AS name
        FROM (
          SELECT sps_inner.subject_paper_id, sps_inner.component_name
          FROM public.subject_paper_selections sps_inner
          WHERE sps_inner.user_subject_id = us.id
            AND (
              sps_inner.stage = 'as'
              OR (sps_inner.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
            )
          ORDER BY sps_inner.created_at
          LIMIT 1
        ) sps
        LEFT JOIN public.subject_papers sp_sub ON sp_sub.id = sps.subject_paper_id
      ) sp ON TRUE
      WHERE us.user_id = p_user_id
        AND us.exam_date IS NOT NULL
        AND us.exam_date > v_today
        AND us.is_archived = FALSE
        AND us.study_route::TEXT != 'unconfirmed'
        AND (s.is_available = FALSE OR sp.id IS NOT NULL)
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
    IF (v_budget = 1 AND (v_accumulated_minutes + rec.estimated_minutes) < 60)
       OR (v_budget = 2 AND (v_accumulated_minutes + rec.estimated_minutes + 60) < 60) THEN
      IF EXISTS (
        -- Check Chapter Actions
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
          AND c2.is_active = TRUE
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
                  AND  (sps.component_name  = c2.component OR (sps.subject_paper_id IS NOT NULL AND EXISTS (
                         SELECT 1 FROM public.chapter_papers cp WHERE cp.chapter_id = c2.id AND cp.subject_paper_id = sps.subject_paper_id
                       )))
                  AND  (sps.stage = 'as' OR (sps.stage = 'a2' AND us2.current_stage::TEXT IN ('a2', 'full')))
              )
            )
          )
          AND (v_accumulated_minutes + act.est_mins) BETWEEN 60 AND 120
          AND (act.act_type != 'complete_notes' OR uc2.notes_status != 'complete')
          AND (act.act_type != 'revisit_weak_topic' OR (
            SELECT AVG(pqa2.marks_obtained::NUMERIC / NULLIF(pqa2.marks_available, 0))
            FROM public.paper_question_attempts pqa2
            JOIN public.past_papers pp2 ON pp2.id = pqa2.paper_id
            WHERE pqa2.chapter_id = uc2.chapter_id AND pp2.user_id = p_user_id
          ) < 0.70)
          AND NOT EXISTS (
            SELECT 1 FROM public.daily_missions dm2
            WHERE dm2.user_id = p_user_id AND dm2.mission_date = v_today AND dm2.status != 'skipped'
              AND dm2.target_entity_id = uc2.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.daily_missions dm2
            WHERE dm2.user_id = p_user_id AND dm2.mission_date = v_today
              AND dm2.type = act.act_type AND dm2.target_entity_id = uc2.id
          )
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
          AND NOT EXISTS (
            SELECT 1 FROM public.daily_missions dm2
            WHERE dm2.user_id = p_user_id AND dm2.mission_date = v_today AND dm2.status != 'skipped'
              AND dm2.target_entity_id = us2.subject_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.daily_missions dm2
            WHERE dm2.user_id = p_user_id AND dm2.mission_date = v_today
              AND dm2.type = 'attempt_paper' AND dm2.target_entity_id = us2.subject_id
          )
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
          AND NOT EXISTS (
            SELECT 1 FROM public.daily_missions dm2
            WHERE dm2.user_id = p_user_id AND dm2.mission_date = v_today AND dm2.status != 'skipped'
              AND dm2.type = 'attempt_paper'
          )
      ) THEN
        CONTINUE;
      END IF;
    END IF;

    -- Insert candidate mission with populated subject_paper_id
    INSERT INTO public.daily_missions (
      user_id, mission_date, type, target_entity_type,
      target_entity_id, title, description, xp_reward,
      status, difficulty, estimated_minutes, subject_paper_id
    ) VALUES (
      p_user_id, v_today, rec.type, rec.target_entity_type,
      rec.target_entity_id, rec.title, rec.description, rec.xp_reward,
      'pending', rec.difficulty, rec.estimated_minutes, rec.subject_paper_id
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

REVOKE ALL ON FUNCTION public.generate_daily_missions(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.generate_daily_missions(UUID) TO authenticated, service_role;

-- 11.8 replace_mission (Exact Signature Preserved: supports subject_paper_id)
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
  -- Strict trusted caller guard
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
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
        AND  c.is_active         = TRUE
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
                     AND  (sps.component_name  = c.component OR (sps.subject_paper_id IS NOT NULL AND EXISTS (
                            SELECT 1 FROM public.chapter_papers cp WHERE cp.chapter_id = c.id AND cp.subject_paper_id = sps.subject_paper_id
                          )))
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
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + 10.0 AS score,
        NULL::UUID AS subject_paper_id
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
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + 10.0 AS score,
        NULL::UUID AS subject_paper_id
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
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + 5.0 AS score,
        NULL::UUID AS subject_paper_id
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
          * ac.urgency * (ac.priority::NUMERIC / 3.0) + (CASE WHEN ac.confidence_level IS NULL THEN 8.0 ELSE 2.0 END) AS score,
        NULL::UUID AS subject_paper_id
      FROM accessible_chapters ac

      UNION ALL

      -- Action 5: Timed past paper section (Category B) — requires valid selected accessible subject_paper
      SELECT
        us.subject_id AS target_entity_id,
        'subject'::public.entity_type_enum AS target_entity_type,
        us.subject_id,
        'attempt_paper'::public.mission_type_enum AS type,
        'Attempt a timed ' || s.name || ' (' || COALESCE(sp.name, 'Past Paper') || ') past-paper section' AS title,
        s.name || ' · ' || COALESCE(sp.name, 'Past Paper') || ' · Spend ~45–60 min completing a timed past-paper question section' AS description,
        75::SMALLINT AS xp_reward,
        'hard' AS difficulty,
        60::SMALLINT AS estimated_minutes,
        GREATEST(1.0 / NULLIF((us.exam_date - v_today)::NUMERIC, 0), 0.01) * (us.priority::NUMERIC / 3.0) * 12.0
          + (CASE WHEN NOT EXISTS (
              SELECT 1 FROM public.past_papers pp
              WHERE pp.user_id = p_user_id AND pp.subject_id = us.subject_id AND pp.attempted_at BETWEEN (v_today - 6) AND v_today
            ) THEN 15.0 ELSE 0.0 END) AS score,
        sp.id AS subject_paper_id
      FROM public.user_subjects us
      JOIN public.subjects s ON s.id = us.subject_id
      LEFT JOIN LATERAL (
        SELECT
          sp_sub.id,
          COALESCE(sp_sub.name, sps.component_name, 'Past Paper') AS name
        FROM (
          SELECT sps_inner.subject_paper_id, sps_inner.component_name
          FROM public.subject_paper_selections sps_inner
          WHERE sps_inner.user_subject_id = us.id
            AND (
              sps_inner.stage = 'as'
              OR (sps_inner.stage = 'a2' AND us.current_stage::TEXT IN ('a2', 'full'))
            )
          ORDER BY sps_inner.created_at
          LIMIT 1
        ) sps
        LEFT JOIN public.subject_papers sp_sub ON sp_sub.id = sps.subject_paper_id
      ) sp ON TRUE
      WHERE us.user_id = p_user_id
        AND us.exam_date IS NOT NULL
        AND us.exam_date > v_today
        AND us.is_archived = FALSE
        AND us.study_route::TEXT != 'unconfirmed'
        AND (s.is_available = FALSE OR sp.id IS NOT NULL)
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
      sca.target_entity_id NOT IN (SELECT oa.target_entity_id FROM other_active oa WHERE oa.target_entity_id IS NOT NULL)
      AND (SELECT COUNT(*) FROM other_active oa WHERE oa.subject_id = sca.subject_id) < 2
      AND (SELECT COUNT(*) FROM other_active oa WHERE oa.type = sca.type) < 2
      AND (sca.type != 'attempt_paper' OR (SELECT COUNT(*) FROM other_active oa WHERE oa.type = 'attempt_paper') < 1)
      AND (v_other_minutes + sca.estimated_minutes) <= 120
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

  IF rec.target_entity_id IS NULL THEN
    RAISE EXCEPTION 'No suitable replacement available' USING ERRCODE = 'P0002';
  END IF;

  -- 5. Mark old mission as skipped
  UPDATE public.daily_missions
  SET    status      = 'skipped',
         skipped_at  = NOW(),
         skip_reason = COALESCE(p_reason, 'replaced')
  WHERE  id = p_mission_id;

  -- 6. Insert new replacement mission with populated subject_paper_id
  INSERT INTO public.daily_missions (
    user_id, mission_date, type, target_entity_type,
    target_entity_id, title, description, xp_reward,
    status, difficulty, estimated_minutes, subject_paper_id
  ) VALUES (
    p_user_id, v_today, rec.type, rec.target_entity_type,
    rec.target_entity_id, rec.title, rec.description, rec.xp_reward,
    'pending', rec.difficulty, rec.estimated_minutes, rec.subject_paper_id
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

REVOKE ALL ON FUNCTION public.replace_mission(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.replace_mission(UUID, UUID, TEXT) TO authenticated, service_role;

-- 11.9 get_user_dashboard_stats (Exact Signature Preserved: subject readiness calculated from active chapters)
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
  v_today    DATE;
  v_timezone TEXT;
BEGIN
  -- Strict trusted caller guard
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  SELECT * INTO v_streak  FROM public.streaks  WHERE user_id = p_user_id;
  v_timezone := public.get_user_timezone(p_user_id);
  v_today    := public.get_user_local_date(p_user_id);

  RETURN jsonb_build_object(
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
    'subject_readiness', (
      SELECT json_agg(
        json_build_object(
          'user_subject_id', us.id,
          'subject_id',      s.id,
          'subject_name',    s.name,
          'color_hex',       s.color_hex,
          'exam_date',       us.exam_date,
          'study_route',     us.study_route,
          'current_stage',   us.current_stage,
          'as_readiness',    CASE WHEN us.study_route = 'unconfirmed' THEN NULL ELSE public.compute_readiness_score(p_user_id, s.id, 'as') END,
          'a2_readiness',    CASE WHEN us.study_route = 'unconfirmed' OR (us.study_route = 'staged' AND us.current_stage::TEXT != 'a2') THEN NULL ELSE public.compute_readiness_score(p_user_id, s.id, 'a2') END,
          'readiness',       CASE WHEN us.study_route IN ('unconfirmed', 'full_level') THEN NULL ELSE public.compute_readiness_score(p_user_id, s.id, 'as') END
        )
        ORDER BY us.priority ASC
      )
      FROM   public.user_subjects us
      JOIN   public.subjects s ON s.id = us.subject_id
      WHERE  us.user_id     = p_user_id
        AND  us.is_archived = FALSE
    ),
    'recent_xp_events', (
      SELECT json_agg(row_to_json(xe.*) ORDER BY xe.created_at DESC)
      FROM   (
        SELECT * FROM public.xp_events
        WHERE  user_id = p_user_id
        ORDER  BY created_at DESC
        LIMIT  5
      ) xe
    ),
    'has_exam_dates', (
      SELECT bool_and(us.exam_date IS NOT NULL)
      FROM   public.user_subjects us
      WHERE  us.user_id = p_user_id AND us.is_archived = FALSE
    ),
    'has_chapter_data', (
      SELECT EXISTS (
        SELECT 1 FROM public.user_chapters uc
        WHERE  uc.user_id = p_user_id
      )
    ),
    'has_unconfirmed_routes', (
      SELECT EXISTS (
        SELECT 1 FROM public.user_subjects us
        WHERE  us.user_id = p_user_id AND us.is_archived = FALSE AND us.study_route = 'unconfirmed'
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_dashboard_stats(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_dashboard_stats(UUID) TO authenticated, service_role;

-- 11.10 log_past_paper_atomic (Atomic Past Paper + Question Attempts logging)
CREATE OR REPLACE FUNCTION public.log_past_paper_atomic(
  p_user_id   UUID,
  p_paper     JSONB,
  p_questions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_subject_id        UUID;
  v_subject_paper_id  UUID;
  v_paper_number      SMALLINT;
  v_paper_code        TEXT;
  v_stage             TEXT;
  v_year              SMALLINT;
  v_session           public.paper_session_enum;
  v_time_taken_mins   SMALLINT;
  v_notes             TEXT;
  v_attempted_at      DATE;
  v_new_paper_id      UUID;
  v_score_raw         SMALLINT := 0;
  v_score_max         SMALLINT := 0;
  v_q                 JSONB;
  v_q_num             TEXT;
  v_q_ch_id           UUID;
  v_q_obtained        SMALLINT;
  v_q_max             SMALLINT;
  v_q_count           INTEGER := 0;
  v_ret               JSONB;
BEGIN
  -- Strict trusted caller guard
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_subject_id       := (p_paper->>'subject_id')::UUID;
  v_subject_paper_id := (p_paper->>'subject_paper_id')::UUID;
  v_paper_number     := (p_paper->>'paper_number')::SMALLINT;
  v_year             := (p_paper->>'year')::SMALLINT;
  v_session          := (p_paper->>'session')::public.paper_session_enum;
  v_time_taken_mins  := (p_paper->>'time_taken_mins')::SMALLINT;
  v_notes            := p_paper->>'notes';
  v_attempted_at     := COALESCE((p_paper->>'attempted_at')::DATE, CURRENT_DATE);

  -- Derive stage from user's exact subject_paper_selections for MVP subjects
  IF v_subject_paper_id IS NOT NULL THEN
    SELECT sps.stage INTO v_stage
    FROM public.user_subjects us
    JOIN public.subject_paper_selections sps ON sps.user_subject_id = us.id AND sps.subject_paper_id = v_subject_paper_id
    WHERE us.user_id = p_user_id AND us.subject_id = v_subject_id AND us.is_archived = FALSE;
  END IF;
  v_stage := COALESCE(v_stage, p_paper->>'stage');

  IF v_subject_id IS NULL OR v_stage IS NULL OR v_paper_number IS NULL OR v_year IS NULL OR v_session IS NULL THEN
    RAISE EXCEPTION 'Missing required past paper fields' USING ERRCODE = 'P0002';
  END IF;

  IF jsonb_array_length(p_questions) = 0 THEN
    RAISE EXCEPTION 'Past paper must include at least one question attempt' USING ERRCODE = 'P0002';
  END IF;

  v_paper_code := COALESCE(
    p_paper->>'paper_code',
    COALESCE((SELECT code FROM public.subjects WHERE id = v_subject_id), 'SUBJ')
    || '/' || v_paper_number
    || '/' || CASE v_session WHEN 'feb_mar' THEN 'F/M' WHEN 'may_jun' THEN 'M/J' WHEN 'oct_nov' THEN 'O/N' ELSE 'EXAM' END
    || '/' || RIGHT(v_year::TEXT, 2)
  );

  -- Validate all questions and calculate marks
  FOR v_q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    v_q_count := v_q_count + 1;
    v_q_obtained := (v_q->>'marks_obtained')::SMALLINT;
    v_q_max      := (v_q->>'marks_available')::SMALLINT;

    IF v_q_obtained IS NULL OR v_q_max IS NULL OR v_q_max <= 0 OR v_q_obtained < 0 OR v_q_obtained > v_q_max THEN
      RAISE EXCEPTION 'Invalid marks for question %: % / %', COALESCE(v_q->>'question_number', v_q_count::TEXT), v_q_obtained, v_q_max
        USING ERRCODE = 'P0002';
    END IF;

    v_score_raw := v_score_raw + v_q_obtained;
    v_score_max := v_score_max + v_q_max;
  END LOOP;

  -- Insert parent past paper (trigger validate_past_paper_entry validates route & paper)
  INSERT INTO public.past_papers (
    user_id, subject_id, subject_paper_id, paper_number, paper_code, stage,
    year, session, score_raw, score_max,
    time_taken_mins, notes, attempted_at
  )
  VALUES (
    p_user_id, v_subject_id, v_subject_paper_id, v_paper_number, v_paper_code, v_stage,
    v_year, v_session, v_score_raw, v_score_max,
    v_time_taken_mins, v_notes, v_attempted_at
  )
  RETURNING id INTO v_new_paper_id;

  -- Insert all question attempts (trigger validate_question_attempt_chapter validates chapter)
  FOR v_q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    v_q_num      := v_q->>'question_number';
    v_q_ch_id    := (v_q->>'chapter_id')::UUID;
    v_q_obtained := (v_q->>'marks_obtained')::SMALLINT;
    v_q_max      := (v_q->>'marks_available')::SMALLINT;

    INSERT INTO public.paper_question_attempts (
      paper_id, question_number, chapter_id, marks_obtained, marks_available
    )
    VALUES (
      v_new_paper_id, v_q_num, v_q_ch_id, v_q_obtained, v_q_max
    );
  END LOOP;

  SELECT row_to_json(pp)::JSONB INTO v_ret
  FROM public.past_papers pp
  WHERE pp.id = v_new_paper_id;

  RETURN v_ret;
END;
$$;

REVOKE ALL ON FUNCTION public.log_past_paper_atomic(UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_past_paper_atomic(UUID, JSONB, JSONB) TO authenticated, service_role;

-- 11.11 update_past_paper_atomic (Atomic Past Paper + Question Attempts update)
CREATE OR REPLACE FUNCTION public.update_past_paper_atomic(
  p_user_id   UUID,
  p_paper_id  UUID,
  p_paper     JSONB,
  p_questions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_old_pp            public.past_papers%ROWTYPE;
  v_subject_id        UUID;
  v_subject_paper_id  UUID;
  v_paper_number      SMALLINT;
  v_paper_code        TEXT;
  v_stage             TEXT;
  v_year              SMALLINT;
  v_session           public.paper_session_enum;
  v_time_taken_mins   SMALLINT;
  v_notes             TEXT;
  v_attempted_at      DATE;
  v_score_raw         SMALLINT := 0;
  v_score_max         SMALLINT := 0;
  v_q                 JSONB;
  v_q_num             TEXT;
  v_q_ch_id           UUID;
  v_q_obtained        SMALLINT;
  v_q_max             SMALLINT;
  v_q_count           INTEGER := 0;
  v_ret               JSONB;
BEGIN
  -- Strict trusted caller guard
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Lock parent paper row
  SELECT * INTO v_old_pp
  FROM public.past_papers
  WHERE id = p_paper_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Past paper not found or unauthorized' USING ERRCODE = '42501';
  END IF;

  v_subject_id       := COALESCE((p_paper->>'subject_id')::UUID, v_old_pp.subject_id);
  v_subject_paper_id := COALESCE((p_paper->>'subject_paper_id')::UUID, v_old_pp.subject_paper_id);
  v_paper_number     := COALESCE((p_paper->>'paper_number')::SMALLINT, v_old_pp.paper_number);
  v_year             := COALESCE((p_paper->>'year')::SMALLINT, v_old_pp.year);
  v_session          := COALESCE((p_paper->>'session')::public.paper_session_enum, v_old_pp.session);
  v_time_taken_mins  := (p_paper->>'time_taken_mins')::SMALLINT;
  v_notes            := p_paper->>'notes';
  v_attempted_at     := COALESCE((p_paper->>'attempted_at')::DATE, v_old_pp.attempted_at);

  -- Derive stage from user's exact subject_paper_selections for MVP subjects
  IF v_subject_paper_id IS NOT NULL THEN
    SELECT sps.stage INTO v_stage
    FROM public.user_subjects us
    JOIN public.subject_paper_selections sps ON sps.user_subject_id = us.id AND sps.subject_paper_id = v_subject_paper_id
    WHERE us.user_id = p_user_id AND us.subject_id = v_subject_id AND us.is_archived = FALSE;
  END IF;
  v_stage := COALESCE(v_stage, p_paper->>'stage', v_old_pp.stage, 'as');

  IF jsonb_array_length(p_questions) = 0 THEN
    RAISE EXCEPTION 'Past paper must include at least one question attempt' USING ERRCODE = 'P0002';
  END IF;

  -- Regenerate paper_code whenever explicitly supplied OR when identity fields change
  IF p_paper->>'paper_code' IS NOT NULL THEN
    v_paper_code := p_paper->>'paper_code';
  ELSIF v_subject_id IS DISTINCT FROM v_old_pp.subject_id
     OR v_paper_number IS DISTINCT FROM v_old_pp.paper_number
     OR v_year IS DISTINCT FROM v_old_pp.year
     OR v_session IS DISTINCT FROM v_old_pp.session
     OR v_old_pp.paper_code IS NULL THEN
    v_paper_code := COALESCE((SELECT code FROM public.subjects WHERE id = v_subject_id), 'SUBJ')
      || '/' || v_paper_number
      || '/' || CASE v_session WHEN 'feb_mar' THEN 'F/M' WHEN 'may_jun' THEN 'M/J' WHEN 'oct_nov' THEN 'O/N' ELSE 'EXAM' END
      || '/' || RIGHT(v_year::TEXT, 2);
  ELSE
    v_paper_code := v_old_pp.paper_code;
  END IF;

  -- Validate questions
  FOR v_q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    v_q_count := v_q_count + 1;
    v_q_obtained := (v_q->>'marks_obtained')::SMALLINT;
    v_q_max      := (v_q->>'marks_available')::SMALLINT;

    IF v_q_obtained IS NULL OR v_q_max IS NULL OR v_q_max <= 0 OR v_q_obtained < 0 OR v_q_obtained > v_q_max THEN
      RAISE EXCEPTION 'Invalid marks for question %: % / %', COALESCE(v_q->>'question_number', v_q_count::TEXT), v_q_obtained, v_q_max
        USING ERRCODE = 'P0002';
    END IF;

    v_score_raw := v_score_raw + v_q_obtained;
    v_score_max := v_score_max + v_q_max;
  END LOOP;

  -- Update parent paper (trigger validate_past_paper_entry validates route, stage, base component)
  UPDATE public.past_papers
  SET
    subject_id       = v_subject_id,
    subject_paper_id = v_subject_paper_id,
    paper_number     = v_paper_number,
    paper_code       = v_paper_code,
    stage            = v_stage,
    year             = v_year,
    session          = v_session,
    score_raw        = v_score_raw,
    score_max        = v_score_max,
    time_taken_mins  = v_time_taken_mins,
    notes            = v_notes,
    attempted_at     = v_attempted_at
  WHERE id = p_paper_id;

  -- Replace question attempts atomically
  DELETE FROM public.paper_question_attempts WHERE paper_id = p_paper_id;

  FOR v_q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    v_q_num      := v_q->>'question_number';
    v_q_ch_id    := (v_q->>'chapter_id')::UUID;
    v_q_obtained := (v_q->>'marks_obtained')::SMALLINT;
    v_q_max      := (v_q->>'marks_available')::SMALLINT;

    INSERT INTO public.paper_question_attempts (
      paper_id, question_number, chapter_id, marks_obtained, marks_available
    )
    VALUES (
      p_paper_id, v_q_num, v_q_ch_id, v_q_obtained, v_q_max
    );
  END LOOP;

  SELECT row_to_json(pp)::JSONB INTO v_ret
  FROM public.past_papers pp
  WHERE pp.id = p_paper_id;

  RETURN v_ret;
END;
$$;

REVOKE ALL ON FUNCTION public.update_past_paper_atomic(UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_past_paper_atomic(UUID, UUID, JSONB, JSONB) TO authenticated, service_role;

-- Complete grant matrix for existing operational functions
REVOKE ALL ON FUNCTION public.complete_mission(UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.complete_mission(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.undo_mission_completion(UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.undo_mission_completion(UUID, UUID) TO authenticated, service_role;

COMMIT;
