-- =============================================================================
-- MIGRATION 027: Official Grade-Threshold Foundation
--
-- Additive, versioned storage for official Cambridge threshold publications.
-- This migration intentionally contains no June 2026 (or other) threshold seed.
-- Import workers stage lossless official rows; only the service-role publisher can
-- make a validated document visible to student-facing catalogue reads.
-- =============================================================================

BEGIN;

-- ─── 1. Import audit and versioned document publications ─────────────────────

CREATE TABLE public.grade_threshold_import_runs (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  trigger_kind      TEXT NOT NULL CHECK (trigger_kind IN ('scheduled', 'manual', 'backfill', 'retry')),
  parser_version    TEXT NOT NULL CHECK (LENGTH(BTRIM(parser_version)) > 0),
  status            TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'validating', 'succeeded', 'partial', 'failed')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  aggregate_summary JSONB NOT NULL DEFAULT '{}'::JSONB
                    CHECK (JSONB_TYPEOF(aggregate_summary) = 'object'),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grade_threshold_import_runs_finished_state CHECK (
    (status IN ('succeeded', 'partial', 'failed') AND finished_at IS NOT NULL)
    OR (status IN ('running', 'validating') AND finished_at IS NULL)
  ),
  CONSTRAINT grade_threshold_import_runs_time_order CHECK (
    finished_at IS NULL OR finished_at >= started_at
  )
);

COMMENT ON TABLE public.grade_threshold_import_runs IS
  'Batch execution audit. Source URLs and checksums belong to individual publications, never to the batch.';
COMMENT ON COLUMN public.grade_threshold_import_runs.aggregate_summary IS
  'Importer-produced aggregate counts and diagnostics for the batch as a JSON object.';

CREATE TABLE public.grade_threshold_publications (
  id                       UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  import_run_id            UUID NOT NULL REFERENCES public.grade_threshold_import_runs(id) ON DELETE RESTRICT,
  subject_id               UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  exam_year                SMALLINT NOT NULL CHECK (exam_year BETWEEN 2000 AND 2100),
  exam_series              TEXT NOT NULL CHECK (exam_series IN ('march', 'june', 'november')),
  official_index_url       TEXT NOT NULL CHECK (official_index_url ~ '^https://'),
  official_pdf_url         TEXT NOT NULL CHECK (official_pdf_url ~ '^https://'),
  source_checksum_sha256   BYTEA NOT NULL CHECK (OCTET_LENGTH(source_checksum_sha256) = 32),
  official_published_on    DATE,
  imported_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revision_number          INTEGER NOT NULL DEFAULT 1 CHECK (revision_number >= 1),
  revises_publication_id   UUID REFERENCES public.grade_threshold_publications(id) ON DELETE RESTRICT,
  publication_status       TEXT NOT NULL DEFAULT 'staged'
                           CHECK (publication_status IN ('staged', 'published', 'superseded', 'rejected')),
  is_active                BOOLEAN NOT NULL DEFAULT FALSE,
  published_at             TIMESTAMPTZ,
  source_metadata          JSONB NOT NULL DEFAULT '{}'::JSONB
                           CHECK (JSONB_TYPEOF(source_metadata) = 'object'),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grade_threshold_publications_revision_root CHECK (
    (revision_number = 1 AND revises_publication_id IS NULL)
    OR (revision_number > 1 AND revises_publication_id IS NOT NULL)
  ),
  CONSTRAINT grade_threshold_publications_not_self_revision CHECK (
    revises_publication_id IS NULL OR revises_publication_id <> id
  ),
  CONSTRAINT grade_threshold_publications_lifecycle CHECK (
    (publication_status = 'staged' AND NOT is_active AND published_at IS NULL)
    OR (publication_status = 'rejected' AND NOT is_active AND published_at IS NULL)
    OR (publication_status = 'published' AND is_active AND published_at IS NOT NULL)
    OR (publication_status = 'superseded' AND NOT is_active)
  ),
  CONSTRAINT uq_grade_threshold_publication_revision
    UNIQUE (subject_id, exam_year, exam_series, revision_number),
  CONSTRAINT uq_grade_threshold_publication_document
    UNIQUE (subject_id, exam_year, exam_series, source_checksum_sha256)
);

CREATE UNIQUE INDEX uq_grade_threshold_one_active_publication
  ON public.grade_threshold_publications(subject_id, exam_year, exam_series)
  WHERE publication_status = 'published' AND is_active = TRUE;

CREATE INDEX idx_grade_threshold_publications_lookup
  ON public.grade_threshold_publications(subject_id, exam_year DESC, exam_series, publication_status);

CREATE INDEX idx_grade_threshold_publications_run
  ON public.grade_threshold_publications(import_run_id);

COMMENT ON TABLE public.grade_threshold_publications IS
  'Append-only document revisions. A changed checksum is a new staged revision; an existing checksum is document-level idempotency.';
COMMENT ON COLUMN public.grade_threshold_publications.source_checksum_sha256 IS
  'Exactly 32 raw SHA-256 bytes for the downloaded official PDF.';
COMMENT ON INDEX public.uq_grade_threshold_one_active_publication IS
  'At most one active published revision exists for a subject, year, and series.';

-- ─── 2. Exact component variants and A-E marks ──────────────────────────────

CREATE TABLE public.grade_threshold_component_variants (
  id                 UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  publication_id     UUID NOT NULL REFERENCES public.grade_threshold_publications(id) ON DELETE CASCADE,
  component_code     TEXT NOT NULL CHECK (LENGTH(BTRIM(component_code)) > 0),
  raw_maximum_mark   SMALLINT NOT NULL CHECK (raw_maximum_mark > 0),
  subject_paper_id   UUID REFERENCES public.subject_papers(id) ON DELETE RESTRICT,
  source_label       TEXT,
  source_row_metadata JSONB NOT NULL DEFAULT '{}'::JSONB
                      CHECK (JSONB_TYPEOF(source_row_metadata) = 'object'),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_grade_threshold_component_variant
    UNIQUE (publication_id, component_code)
);

CREATE INDEX idx_grade_threshold_component_variants_publication
  ON public.grade_threshold_component_variants(publication_id);

CREATE INDEX idx_grade_threshold_component_variants_paper
  ON public.grade_threshold_component_variants(subject_paper_id)
  WHERE subject_paper_id IS NOT NULL;

COMMENT ON TABLE public.grade_threshold_component_variants IS
  'Exact official component variants. subject_paper_id is nullable so valid official variants survive incomplete Atlas mapping.';

CREATE TABLE public.grade_threshold_component_marks (
  id                    UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  component_variant_id  UUID NOT NULL REFERENCES public.grade_threshold_component_variants(id) ON DELETE CASCADE,
  grade                 TEXT NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D', 'E')),
  threshold_mark        SMALLINT NOT NULL CHECK (threshold_mark >= 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_grade_threshold_component_mark UNIQUE (component_variant_id, grade)
);

COMMENT ON TABLE public.grade_threshold_component_marks IS
  'Official component thresholds. Cambridge component rows contain A-E only; A* is an overall qualification grade.';

-- ─── 3. Exact qualification combinations and ordered lossless tokens ────────

CREATE TABLE public.grade_threshold_combinations (
  id                    UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  publication_id        UUID NOT NULL REFERENCES public.grade_threshold_publications(id) ON DELETE CASCADE,
  canonical_key         TEXT NOT NULL CHECK (LENGTH(BTRIM(canonical_key)) > 0),
  official_option_label TEXT,
  official_source_label TEXT,
  qualification_level   TEXT NOT NULL CHECK (qualification_level IN ('as', 'a_level')),
  route_type            TEXT NOT NULL CHECK (route_type IN ('as_only', 'staged', 'full_level', 'other')),
  maximum_mark          NUMERIC(9,4) NOT NULL CHECK (maximum_mark > 0),
  weighting_basis       TEXT NOT NULL CHECK (weighting_basis IN ('raw_total', 'weighted_total')),
  planner_eligibility   TEXT NOT NULL DEFAULT 'unreviewed'
                        CHECK (planner_eligibility IN ('unreviewed', 'eligible', 'unsupported', 'ambiguous')),
  atlas_route_id        UUID REFERENCES public.subject_valid_routes(id) ON DELETE RESTRICT,
  review_metadata       JSONB NOT NULL DEFAULT '{}'::JSONB
                        CHECK (JSONB_TYPEOF(review_metadata) = 'object'),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_grade_threshold_combination UNIQUE (publication_id, canonical_key),
  CONSTRAINT grade_threshold_combination_planner_mapping CHECK (
    planner_eligibility <> 'eligible'
    OR (atlas_route_id IS NOT NULL AND route_type <> 'other')
  ),
  CONSTRAINT grade_threshold_combination_level_route CHECK (
    (qualification_level = 'as' AND route_type = 'as_only')
    OR (qualification_level = 'a_level' AND route_type IN ('staged', 'full_level', 'other'))
  )
);

CREATE INDEX idx_grade_threshold_combinations_publication
  ON public.grade_threshold_combinations(publication_id);

CREATE INDEX idx_grade_threshold_combinations_route
  ON public.grade_threshold_combinations(atlas_route_id)
  WHERE atlas_route_id IS NOT NULL;

COMMENT ON TABLE public.grade_threshold_combinations IS
  'Every valid official qualification combination, including combinations Atlas cannot currently map.';
COMMENT ON COLUMN public.grade_threshold_combinations.canonical_key IS
  'Stable importer-generated identity derived from the complete ordered official token sequence; never a display label.';
COMMENT ON COLUMN public.grade_threshold_combinations.planner_eligibility IS
  'Separate reviewed boundary. Only eligible + mapped rows from active published documents may enter the student planner.';
COMMENT ON COLUMN public.grade_threshold_combinations.maximum_mark IS
  'Official overall maximum, interpreted as raw or weighted according to weighting_basis.';

CREATE TABLE public.grade_threshold_combination_marks (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  combination_id  UUID NOT NULL REFERENCES public.grade_threshold_combinations(id) ON DELETE CASCADE,
  grade           TEXT NOT NULL CHECK (grade IN ('A*', 'A', 'B', 'C', 'D', 'E', 'a', 'b', 'c', 'd', 'e')),
  threshold_mark  NUMERIC(9,4) NOT NULL CHECK (threshold_mark >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_grade_threshold_combination_mark UNIQUE (combination_id, grade)
);

COMMENT ON TABLE public.grade_threshold_combination_marks IS
  'Official overall thresholds: A*-E for A Level, or a-e for AS Level.';

CREATE TABLE public.grade_threshold_weighting_sources (
  id                     UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  subject_id             UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  document_year          SMALLINT NOT NULL CHECK (document_year BETWEEN 2000 AND 2100),
  exam_series            TEXT NOT NULL CHECK (exam_series IN ('march', 'june', 'november')),
  official_document_url  TEXT NOT NULL CHECK (official_document_url ~ '^https://'),
  source_checksum_sha256 BYTEA NOT NULL CHECK (OCTET_LENGTH(source_checksum_sha256) = 32),
  source_label           TEXT NOT NULL CHECK (LENGTH(BTRIM(source_label)) > 0),
  review_status          TEXT NOT NULL DEFAULT 'unreviewed'
                         CHECK (review_status IN ('unreviewed', 'approved', 'rejected')),
  reviewed_by            TEXT,
  reviewed_at            TIMESTAMPTZ,
  source_metadata        JSONB NOT NULL DEFAULT '{}'::JSONB
                         CHECK (JSONB_TYPEOF(source_metadata) = 'object'),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_grade_threshold_weighting_source_document
    UNIQUE (subject_id, document_year, exam_series, source_checksum_sha256),
  CONSTRAINT grade_threshold_weighting_source_review CHECK (
    (review_status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (review_status <> 'approved' AND reviewed_at IS NULL)
  )
);

COMMENT ON TABLE public.grade_threshold_weighting_sources IS
  'Reviewed official weighting documents with machine-checkable subject/year/series/checksum identity.';

CREATE TABLE public.grade_threshold_weighting_entries (
  id                  UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  weighting_source_id UUID NOT NULL REFERENCES public.grade_threshold_weighting_sources(id) ON DELETE RESTRICT,
  raw_token           TEXT NOT NULL CHECK (LENGTH(BTRIM(raw_token)) > 0),
  token_kind          TEXT NOT NULL CHECK (token_kind IN ('component_variant', 'carry_forward')),
  raw_maximum         NUMERIC(9,4) NOT NULL CHECK (raw_maximum > 0),
  weighted_maximum    NUMERIC(9,4) NOT NULL CHECK (weighted_maximum > 0),
  official_weighting_factor NUMERIC(12,8) NOT NULL CHECK (official_weighting_factor > 0),
  source_page         SMALLINT NOT NULL CHECK (source_page > 0),
  source_row_label    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_grade_threshold_weighting_entry
    UNIQUE (weighting_source_id, raw_token, token_kind)
);

COMMENT ON TABLE public.grade_threshold_weighting_entries IS
  'Exact official weighting rows preserving printed raw maximum, weighted maximum, factor, code, and page; no factor or code meaning is inferred.';

CREATE TABLE public.grade_threshold_combination_tokens (
  id                            UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  combination_id                UUID NOT NULL REFERENCES public.grade_threshold_combinations(id) ON DELETE CASCADE,
  token_position                SMALLINT NOT NULL CHECK (token_position > 0),
  raw_token                     TEXT NOT NULL CHECK (LENGTH(BTRIM(raw_token)) > 0),
  token_kind                    TEXT NOT NULL
                                CHECK (token_kind IN ('component_variant', 'carry_forward', 'special', 'unresolved')),
  resolved_component_variant_id UUID REFERENCES public.grade_threshold_component_variants(id) ON DELETE RESTRICT,
  stage                         TEXT CHECK (stage IN ('as', 'a2')),
  maximum_mark                  NUMERIC(9,4) CHECK (maximum_mark > 0),
  weighting_factor              NUMERIC(12,8) CHECK (weighting_factor > 0),
  weighting_entry_id            UUID REFERENCES public.grade_threshold_weighting_entries(id) ON DELETE RESTRICT,
  carry_forward_mapping_status  TEXT CHECK (carry_forward_mapping_status IN ('unreviewed', 'approved', 'rejected')),
  mapping_reviewed_by           TEXT,
  mapping_reviewed_at           TIMESTAMPTZ,
  source_token_metadata         JSONB NOT NULL DEFAULT '{}'::JSONB
                                CHECK (JSONB_TYPEOF(source_token_metadata) = 'object'),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_grade_threshold_combination_token_position UNIQUE (combination_id, token_position),
  CONSTRAINT grade_threshold_token_resolution_kind CHECK (
    token_kind = 'component_variant' OR resolved_component_variant_id IS NULL
  ),
  CONSTRAINT grade_threshold_token_weighting_provenance CHECK (
    (weighting_factor IS NULL) = (weighting_entry_id IS NULL)
  ),
  CONSTRAINT grade_threshold_token_carry_forward_mapping CHECK (
    (token_kind = 'carry_forward') = (carry_forward_mapping_status IS NOT NULL)
    AND (token_kind <> 'carry_forward' OR stage = 'as')
    AND (
      COALESCE(carry_forward_mapping_status <> 'approved', TRUE)
      OR (mapping_reviewed_by IS NOT NULL AND mapping_reviewed_at IS NOT NULL)
    )
  )
);

CREATE INDEX idx_grade_threshold_combination_tokens_combination
  ON public.grade_threshold_combination_tokens(combination_id, token_position);

CREATE INDEX idx_grade_threshold_combination_tokens_component
  ON public.grade_threshold_combination_tokens(resolved_component_variant_id)
  WHERE resolved_component_variant_id IS NOT NULL;

COMMENT ON TABLE public.grade_threshold_combination_tokens IS
  'Ordered, lossless official tokens such as 11, 84, 87, or 99. Special/carry-forward tokens never create subject_papers.';
COMMENT ON COLUMN public.grade_threshold_combination_tokens.weighting_factor IS
  'Nullable official factor. A non-null factor must exactly equal its normalized official weighting entry; missing weightings are never inferred.';
COMMENT ON COLUMN public.grade_threshold_combination_tokens.carry_forward_mapping_status IS
  'Explicit review of a staged-route AS aggregate token. Its meaning is never inferred from token digits.';

-- ─── 4. Validation/import issues ─────────────────────────────────────────────

CREATE TABLE public.grade_threshold_import_issues (
  id               UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  import_run_id    UUID NOT NULL REFERENCES public.grade_threshold_import_runs(id) ON DELETE CASCADE,
  publication_id   UUID REFERENCES public.grade_threshold_publications(id) ON DELETE CASCADE,
  severity         TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  issue_code       TEXT NOT NULL CHECK (LENGTH(BTRIM(issue_code)) > 0),
  message          TEXT NOT NULL CHECK (LENGTH(BTRIM(message)) > 0),
  resolution_status TEXT NOT NULL DEFAULT 'open'
                    CHECK (resolution_status IN ('open', 'accepted', 'resolved')),
  record_reference JSONB NOT NULL DEFAULT '{}'::JSONB
                   CHECK (JSONB_TYPEOF(record_reference) = 'object'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  CONSTRAINT grade_threshold_issue_resolution_time CHECK (
    (resolution_status = 'open' AND resolved_at IS NULL)
    OR (resolution_status IN ('accepted', 'resolved') AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX idx_grade_threshold_import_issues_run
  ON public.grade_threshold_import_issues(import_run_id, severity, resolution_status);

CREATE INDEX idx_grade_threshold_import_issues_publication
  ON public.grade_threshold_import_issues(publication_id)
  WHERE publication_id IS NOT NULL;

COMMENT ON TABLE public.grade_threshold_import_issues IS
  'Administrative parse and validation findings. Open errors block atomic publication.';

-- ─── 5. Explicitly approved component-variant benchmark groups ──────────────

CREATE TABLE public.grade_threshold_variant_benchmark_groups (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  publication_id    UUID NOT NULL REFERENCES public.grade_threshold_publications(id) ON DELETE CASCADE,
  subject_paper_id  UUID NOT NULL REFERENCES public.subject_papers(id) ON DELETE RESTRICT,
  component_grade   TEXT NOT NULL CHECK (component_grade IN ('A', 'B', 'C', 'D', 'E')),
  raw_maximum_mark  SMALLINT NOT NULL CHECK (raw_maximum_mark > 0),
  approval_status   TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft', 'approved', 'rejected')),
  approved_by       TEXT,
  approved_at       TIMESTAMPTZ,
  approval_notes    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_grade_threshold_variant_benchmark_group
    UNIQUE (publication_id, subject_paper_id, component_grade, raw_maximum_mark),
  CONSTRAINT grade_threshold_variant_benchmark_approval CHECK (
    (approval_status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (approval_status <> 'approved' AND approved_at IS NULL)
  )
);

CREATE TABLE public.grade_threshold_variant_benchmark_members (
  group_id             UUID NOT NULL REFERENCES public.grade_threshold_variant_benchmark_groups(id) ON DELETE CASCADE,
  component_variant_id UUID NOT NULL REFERENCES public.grade_threshold_component_variants(id) ON DELETE RESTRICT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, component_variant_id)
);

COMMENT ON TABLE public.grade_threshold_variant_benchmark_groups IS
  'Explicit review boundary for variants allowed in a ceiling-average Atlas estimate.';
COMMENT ON TABLE public.grade_threshold_variant_benchmark_members IS
  'Only named member variants are included; no compatible-looking variant is added implicitly.';

-- ─── 6. Cross-row validation triggers ────────────────────────────────────────

CREATE FUNCTION public.validate_grade_threshold_publication_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_previous public.grade_threshold_publications%ROWTYPE;
BEGIN
  IF NEW.revises_publication_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_previous
  FROM public.grade_threshold_publications
  WHERE id = NEW.revises_publication_id;

  IF NOT FOUND
     OR v_previous.subject_id <> NEW.subject_id
     OR v_previous.exam_year <> NEW.exam_year
     OR v_previous.exam_series <> NEW.exam_series
     OR NEW.revision_number <> v_previous.revision_number + 1
     OR v_previous.source_checksum_sha256 = NEW.source_checksum_sha256 THEN
    RAISE EXCEPTION 'Invalid grade-threshold revision lineage'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_grade_threshold_publication_revision
  BEFORE INSERT OR UPDATE OF subject_id, exam_year, exam_series, revision_number,
    revises_publication_id, source_checksum_sha256
  ON public.grade_threshold_publications
  FOR EACH ROW EXECUTE FUNCTION public.validate_grade_threshold_publication_revision();

CREATE FUNCTION public.validate_grade_threshold_component_variant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_publication_subject UUID;
  v_paper_subject       UUID;
BEGIN
  IF NEW.subject_paper_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.subject_id INTO v_publication_subject
  FROM public.grade_threshold_publications p
  WHERE p.id = NEW.publication_id;

  SELECT sp.subject_id INTO v_paper_subject
  FROM public.subject_papers sp
  WHERE sp.id = NEW.subject_paper_id;

  IF v_publication_subject IS DISTINCT FROM v_paper_subject THEN
    RAISE EXCEPTION 'Component variant subject_paper_id belongs to another subject'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_grade_threshold_component_variant
  BEFORE INSERT OR UPDATE OF publication_id, subject_paper_id
  ON public.grade_threshold_component_variants
  FOR EACH ROW EXECUTE FUNCTION public.validate_grade_threshold_component_variant();

CREATE FUNCTION public.validate_grade_threshold_component_mark()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_maximum SMALLINT;
  v_rank    INTEGER;
BEGIN
  SELECT raw_maximum_mark INTO v_maximum
  FROM public.grade_threshold_component_variants
  WHERE id = NEW.component_variant_id;

  IF NEW.threshold_mark > v_maximum THEN
    RAISE EXCEPTION 'Component threshold % exceeds maximum %', NEW.threshold_mark, v_maximum
      USING ERRCODE = '23514';
  END IF;

  v_rank := CASE NEW.grade WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END;

  IF EXISTS (
    SELECT 1
    FROM public.grade_threshold_component_marks m
    WHERE m.component_variant_id = NEW.component_variant_id
      AND m.id <> NEW.id
      AND (
        (CASE m.grade WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END < v_rank
          AND m.threshold_mark < NEW.threshold_mark)
        OR
        (CASE m.grade WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END > v_rank
          AND m.threshold_mark > NEW.threshold_mark)
      )
  ) THEN
    RAISE EXCEPTION 'Component thresholds must be non-increasing from A through E'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_grade_threshold_component_mark
  BEFORE INSERT OR UPDATE OF component_variant_id, grade, threshold_mark
  ON public.grade_threshold_component_marks
  FOR EACH ROW EXECUTE FUNCTION public.validate_grade_threshold_component_mark();

CREATE FUNCTION public.validate_grade_threshold_combination()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_publication_subject UUID;
  v_route_subject       UUID;
BEGIN
  IF NEW.atlas_route_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.subject_id INTO v_publication_subject
  FROM public.grade_threshold_publications p
  WHERE p.id = NEW.publication_id;

  SELECT r.subject_id INTO v_route_subject
  FROM public.subject_valid_routes r
  WHERE r.id = NEW.atlas_route_id;

  IF v_publication_subject IS DISTINCT FROM v_route_subject THEN
    RAISE EXCEPTION 'Atlas route mapping belongs to another subject'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_grade_threshold_combination
  BEFORE INSERT OR UPDATE OF publication_id, atlas_route_id
  ON public.grade_threshold_combinations
  FOR EACH ROW EXECUTE FUNCTION public.validate_grade_threshold_combination();

CREATE FUNCTION public.validate_grade_threshold_combination_mark()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_level   TEXT;
  v_maximum NUMERIC(9,4);
  v_rank    INTEGER;
BEGIN
  SELECT qualification_level, maximum_mark
  INTO v_level, v_maximum
  FROM public.grade_threshold_combinations
  WHERE id = NEW.combination_id;

  IF (v_level = 'a_level' AND NEW.grade NOT IN ('A*', 'A', 'B', 'C', 'D', 'E'))
     OR (v_level = 'as' AND NEW.grade NOT IN ('a', 'b', 'c', 'd', 'e')) THEN
    RAISE EXCEPTION 'Grade % is invalid for qualification level %', NEW.grade, v_level
      USING ERRCODE = '23514';
  END IF;

  IF NEW.threshold_mark > v_maximum THEN
    RAISE EXCEPTION 'Combination threshold % exceeds weighted maximum %', NEW.threshold_mark, v_maximum
      USING ERRCODE = '23514';
  END IF;

  v_rank := CASE NEW.grade
    WHEN 'A*' THEN 0 WHEN 'A' THEN 1 WHEN 'a' THEN 1 WHEN 'B' THEN 2 WHEN 'b' THEN 2
    WHEN 'C' THEN 3 WHEN 'c' THEN 3 WHEN 'D' THEN 4 WHEN 'd' THEN 4 ELSE 5 END;

  IF EXISTS (
    SELECT 1
    FROM public.grade_threshold_combination_marks m
    WHERE m.combination_id = NEW.combination_id
      AND m.id <> NEW.id
      AND (
        (CASE m.grade
          WHEN 'A*' THEN 0 WHEN 'A' THEN 1 WHEN 'a' THEN 1 WHEN 'B' THEN 2 WHEN 'b' THEN 2
          WHEN 'C' THEN 3 WHEN 'c' THEN 3 WHEN 'D' THEN 4 WHEN 'd' THEN 4 ELSE 5 END < v_rank
          AND m.threshold_mark < NEW.threshold_mark)
        OR
        (CASE m.grade
          WHEN 'A*' THEN 0 WHEN 'A' THEN 1 WHEN 'a' THEN 1 WHEN 'B' THEN 2 WHEN 'b' THEN 2
          WHEN 'C' THEN 3 WHEN 'c' THEN 3 WHEN 'D' THEN 4 WHEN 'd' THEN 4 ELSE 5 END > v_rank
          AND m.threshold_mark > NEW.threshold_mark)
      )
  ) THEN
    RAISE EXCEPTION 'Combination thresholds must be non-increasing by grade'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_grade_threshold_combination_mark
  BEFORE INSERT OR UPDATE OF combination_id, grade, threshold_mark
  ON public.grade_threshold_combination_marks
  FOR EACH ROW EXECUTE FUNCTION public.validate_grade_threshold_combination_mark();

CREATE FUNCTION public.validate_grade_threshold_combination_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_combination_publication UUID;
  v_publication_subject     UUID;
  v_publication_year        SMALLINT;
  v_publication_series      TEXT;
  v_variant_publication     UUID;
  v_component_code          TEXT;
  v_variant_maximum         SMALLINT;
  v_weighting_subject       UUID;
  v_weighting_year          SMALLINT;
  v_weighting_series        TEXT;
  v_weighting_status        TEXT;
  v_entry_raw_token         TEXT;
  v_entry_token_kind        TEXT;
  v_entry_raw_maximum       NUMERIC(9,4);
  v_entry_factor            NUMERIC(12,8);
BEGIN
  SELECT c.publication_id, p.subject_id, p.exam_year, p.exam_series
  INTO v_combination_publication, v_publication_subject, v_publication_year, v_publication_series
  FROM public.grade_threshold_combinations c
  JOIN public.grade_threshold_publications p ON p.id = c.publication_id
  WHERE c.id = NEW.combination_id;

  IF NEW.resolved_component_variant_id IS NOT NULL THEN
    SELECT v.publication_id, v.component_code, v.raw_maximum_mark
    INTO v_variant_publication, v_component_code, v_variant_maximum
    FROM public.grade_threshold_component_variants v
    WHERE v.id = NEW.resolved_component_variant_id;

    IF v_combination_publication IS DISTINCT FROM v_variant_publication THEN
      RAISE EXCEPTION 'Resolved token component belongs to another publication'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.raw_token <> v_component_code THEN
      RAISE EXCEPTION 'Raw token must exactly equal the resolved official component code'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.maximum_mark IS NOT NULL AND NEW.maximum_mark <> v_variant_maximum THEN
      RAISE EXCEPTION 'Resolved token maximum disagrees with component maximum'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.weighting_entry_id IS NOT NULL THEN
    SELECT
      s.subject_id, s.document_year, s.exam_series, s.review_status,
      e.raw_token, e.token_kind, e.raw_maximum, e.official_weighting_factor
    INTO
      v_weighting_subject, v_weighting_year, v_weighting_series, v_weighting_status,
      v_entry_raw_token, v_entry_token_kind, v_entry_raw_maximum, v_entry_factor
    FROM public.grade_threshold_weighting_entries e
    JOIN public.grade_threshold_weighting_sources s ON s.id = e.weighting_source_id
    WHERE e.id = NEW.weighting_entry_id;

    IF v_weighting_subject IS DISTINCT FROM v_publication_subject
       OR v_weighting_year IS DISTINCT FROM v_publication_year
       OR v_weighting_series IS DISTINCT FROM v_publication_series
       OR v_weighting_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'Weighting source must be approved and match publication subject, year, and series'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.raw_token IS DISTINCT FROM v_entry_raw_token
       OR NEW.token_kind IS DISTINCT FROM v_entry_token_kind
       OR NEW.maximum_mark IS DISTINCT FROM v_entry_raw_maximum
       OR NEW.weighting_factor IS DISTINCT FROM v_entry_factor THEN
      RAISE EXCEPTION 'Token code, kind, maximum, and factor must exactly match the official weighting entry'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_grade_threshold_combination_token
  BEFORE INSERT OR UPDATE OF combination_id, raw_token, token_kind,
    resolved_component_variant_id, maximum_mark, weighting_factor, weighting_entry_id
  ON public.grade_threshold_combination_tokens
  FOR EACH ROW EXECUTE FUNCTION public.validate_grade_threshold_combination_token();

CREATE FUNCTION public.prevent_grade_threshold_weighting_entry_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Official weighting entries are immutable; insert a corrected source entry'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER prevent_grade_threshold_weighting_entry_mutation
  BEFORE UPDATE OR DELETE ON public.grade_threshold_weighting_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_grade_threshold_weighting_entry_mutation();

CREATE FUNCTION public.validate_grade_threshold_benchmark_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_group   public.grade_threshold_variant_benchmark_groups%ROWTYPE;
  v_variant public.grade_threshold_component_variants%ROWTYPE;
BEGIN
  SELECT * INTO v_group
  FROM public.grade_threshold_variant_benchmark_groups
  WHERE id = NEW.group_id;

  SELECT * INTO v_variant
  FROM public.grade_threshold_component_variants
  WHERE id = NEW.component_variant_id;

  IF v_group.publication_id <> v_variant.publication_id
     OR v_group.subject_paper_id <> v_variant.subject_paper_id
     OR v_group.raw_maximum_mark <> v_variant.raw_maximum_mark
     OR NOT EXISTS (
       SELECT 1
       FROM public.grade_threshold_component_marks m
       WHERE m.component_variant_id = v_variant.id
         AND m.grade = v_group.component_grade
     ) THEN
    RAISE EXCEPTION 'Benchmark member must match publication, paper, maximum, and grade'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_grade_threshold_benchmark_member
  BEFORE INSERT OR UPDATE OF group_id, component_variant_id
  ON public.grade_threshold_variant_benchmark_members
  FOR EACH ROW EXECUTE FUNCTION public.validate_grade_threshold_benchmark_member();

-- ─── 7. Service-role-only atomic validation and publication ──────────────────

CREATE FUNCTION public.publish_grade_threshold_publication(p_publication_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_target             public.grade_threshold_publications%ROWTYPE;
  v_current            public.grade_threshold_publications%ROWTYPE;
  v_component_invalid  INTEGER;
  v_combination_invalid INTEGER;
BEGIN
  SELECT * INTO v_target
  FROM public.grade_threshold_publications
  WHERE id = p_publication_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grade-threshold publication not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_target.publication_status = 'published' AND v_target.is_active THEN
    RETURN v_target.id;
  END IF;

  IF v_target.publication_status <> 'staged' THEN
    RAISE EXCEPTION 'Only a staged publication can be published'
      USING ERRCODE = 'P0003';
  END IF;

  -- Serialise competing publishers for the same document identity.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_target.subject_id::TEXT || ':' || v_target.exam_year::TEXT || ':' || v_target.exam_series,
      0
    )
  );

  SELECT * INTO v_current
  FROM public.grade_threshold_publications
  WHERE subject_id = v_target.subject_id
    AND exam_year = v_target.exam_year
    AND exam_series = v_target.exam_series
    AND publication_status = 'published'
    AND is_active = TRUE
  FOR UPDATE;

  IF FOUND THEN
    IF v_target.revision_number <= v_current.revision_number
       OR v_target.source_checksum_sha256 = v_current.source_checksum_sha256 THEN
      RAISE EXCEPTION 'Staged revision does not safely supersede the active publication'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      WITH RECURSIVE lineage AS (
        SELECT id, revises_publication_id
        FROM public.grade_threshold_publications
        WHERE id = v_target.id
        UNION ALL
        SELECT p.id, p.revises_publication_id
        FROM public.grade_threshold_publications p
        JOIN lineage l ON l.revises_publication_id = p.id
      )
      SELECT 1 FROM lineage WHERE id = v_current.id
    ) THEN
      RAISE EXCEPTION 'Staged revision does not descend from the active publication'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_target.revision_number <> 1 OR v_target.revises_publication_id IS NOT NULL THEN
    RAISE EXCEPTION 'First published document must be revision 1 without a predecessor'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.grade_threshold_import_issues i
    WHERE i.publication_id = v_target.id
      AND i.severity = 'error'
      AND i.resolution_status = 'open'
  ) THEN
    RAISE EXCEPTION 'Publication has unresolved validation errors'
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO v_component_invalid
  FROM public.grade_threshold_component_variants v
  WHERE v.publication_id = v_target.id
    AND (
      (SELECT COUNT(*) FROM public.grade_threshold_component_marks m WHERE m.component_variant_id = v.id) <> 5
      OR (SELECT ARRAY_AGG(m.grade ORDER BY m.grade) FROM public.grade_threshold_component_marks m WHERE m.component_variant_id = v.id)
         IS DISTINCT FROM ARRAY['A','B','C','D','E']::TEXT[]
    );

  IF NOT EXISTS (
    SELECT 1 FROM public.grade_threshold_component_variants v WHERE v.publication_id = v_target.id
  ) OR v_component_invalid > 0 THEN
    RAISE EXCEPTION 'Every publication needs complete exact component A-E marks'
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO v_combination_invalid
  FROM public.grade_threshold_combinations c
  WHERE c.publication_id = v_target.id
    AND (
      (c.qualification_level = 'a_level' AND (
        (SELECT COUNT(*) FROM public.grade_threshold_combination_marks m WHERE m.combination_id = c.id) <> 6
        OR (
          SELECT ARRAY_AGG(m.grade ORDER BY CASE m.grade WHEN 'A*' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 ELSE 5 END)
          FROM public.grade_threshold_combination_marks m WHERE m.combination_id = c.id
        ) IS DISTINCT FROM ARRAY['A*','A','B','C','D','E']::TEXT[]
      ))
      OR
      (c.qualification_level = 'as' AND (
        (SELECT COUNT(*) FROM public.grade_threshold_combination_marks m WHERE m.combination_id = c.id) <> 5
        OR (
          SELECT ARRAY_AGG(m.grade ORDER BY CASE m.grade WHEN 'a' THEN 1 WHEN 'b' THEN 2 WHEN 'c' THEN 3 WHEN 'd' THEN 4 ELSE 5 END)
          FROM public.grade_threshold_combination_marks m WHERE m.combination_id = c.id
        ) IS DISTINCT FROM ARRAY['a','b','c','d','e']::TEXT[]
      ))
      OR NOT EXISTS (
        SELECT 1 FROM public.grade_threshold_combination_tokens t WHERE t.combination_id = c.id
      )
      OR EXISTS (
        SELECT 1
        FROM generate_series(1, (SELECT MAX(t.token_position) FROM public.grade_threshold_combination_tokens t WHERE t.combination_id = c.id)) AS expected(position)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.grade_threshold_combination_tokens t
          WHERE t.combination_id = c.id AND t.token_position = expected.position
        )
      )
      OR (c.planner_eligibility = 'eligible' AND (
        (c.route_type IN ('as_only', 'full_level') AND (
          EXISTS (
            SELECT 1
            FROM public.grade_threshold_combination_tokens t
            LEFT JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
            WHERE t.combination_id = c.id
              AND (t.token_kind <> 'component_variant' OR v.subject_paper_id IS NULL OR t.stage IS NULL)
          )
          OR EXISTS (
            SELECT 1
            FROM public.grade_threshold_combination_tokens t
            JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
            LEFT JOIN public.subject_route_papers rp
              ON rp.route_id = c.atlas_route_id
             AND rp.subject_paper_id = v.subject_paper_id
             AND rp.stage = t.stage
            WHERE t.combination_id = c.id AND rp.id IS NULL
          )
          OR EXISTS (
            SELECT 1
            FROM public.subject_route_papers rp
            WHERE rp.route_id = c.atlas_route_id
              AND NOT EXISTS (
                SELECT 1
                FROM public.grade_threshold_combination_tokens t
                JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
                WHERE t.combination_id = c.id
                  AND v.subject_paper_id = rp.subject_paper_id
                  AND t.stage = rp.stage
              )
          )
        ))
        OR (c.route_type = 'staged' AND (
          (SELECT COUNT(*)
           FROM public.grade_threshold_combination_tokens t
           WHERE t.combination_id = c.id
             AND t.token_kind = 'carry_forward'
             AND t.stage = 'as'
             AND t.carry_forward_mapping_status = 'approved') <> 1
          OR EXISTS (
            SELECT 1
            FROM public.grade_threshold_combination_tokens t
            LEFT JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
            WHERE t.combination_id = c.id
              AND (
                t.token_kind NOT IN ('component_variant', 'carry_forward')
                OR (t.token_kind = 'component_variant' AND (v.subject_paper_id IS NULL OR t.stage <> 'a2'))
                OR (t.token_kind = 'carry_forward' AND (
                  t.stage <> 'as' OR t.carry_forward_mapping_status <> 'approved'
                ))
              )
          )
          OR NOT EXISTS (
            SELECT 1 FROM public.subject_route_papers rp
            WHERE rp.route_id = c.atlas_route_id AND rp.stage = 'as'
          )
          OR EXISTS (
            SELECT 1
            FROM public.grade_threshold_combination_tokens t
            JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
            LEFT JOIN public.subject_route_papers rp
              ON rp.route_id = c.atlas_route_id
             AND rp.stage = 'a2'
             AND rp.subject_paper_id = v.subject_paper_id
            WHERE t.combination_id = c.id
              AND t.token_kind = 'component_variant'
              AND rp.id IS NULL
          )
          OR EXISTS (
            SELECT 1
            FROM public.subject_route_papers rp
            WHERE rp.route_id = c.atlas_route_id
              AND rp.stage = 'a2'
              AND NOT EXISTS (
                SELECT 1
                FROM public.grade_threshold_combination_tokens t
                JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
                WHERE t.combination_id = c.id
                  AND t.token_kind = 'component_variant'
                  AND t.stage = 'a2'
                  AND v.subject_paper_id = rp.subject_paper_id
              )
          )
        ))
        OR (
          SELECT COUNT(*)
          FROM public.grade_threshold_combination_tokens t
          JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
          WHERE t.combination_id = c.id
        ) <> (
          SELECT COUNT(DISTINCT v.subject_paper_id)
          FROM public.grade_threshold_combination_tokens t
          JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
          WHERE t.combination_id = c.id
        )
      ))
    );

  IF NOT EXISTS (
    SELECT 1 FROM public.grade_threshold_combinations c WHERE c.publication_id = v_target.id
  ) OR v_combination_invalid > 0 THEN
    RAISE EXCEPTION 'Publication has incomplete or planner-ineligible qualification combinations'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.grade_threshold_variant_benchmark_groups g
    WHERE g.publication_id = v_target.id
      AND g.approval_status = 'approved'
      AND (SELECT COUNT(*) FROM public.grade_threshold_variant_benchmark_members m WHERE m.group_id = g.id) < 2
  ) THEN
    RAISE EXCEPTION 'Approved benchmark groups require at least two explicit variants'
      USING ERRCODE = '23514';
  END IF;

  IF v_current.id IS NOT NULL THEN
    UPDATE public.grade_threshold_publications
    SET publication_status = 'superseded', is_active = FALSE
    WHERE id = v_current.id;
  END IF;

  UPDATE public.grade_threshold_publications
  SET publication_status = 'superseded', is_active = FALSE
  WHERE subject_id = v_target.subject_id
    AND exam_year = v_target.exam_year
    AND exam_series = v_target.exam_series
    AND revision_number < v_target.revision_number
    AND publication_status = 'staged';

  UPDATE public.grade_threshold_publications
  SET publication_status = 'published',
      is_active = TRUE,
      published_at = NOW()
  WHERE id = v_target.id;

  RETURN v_target.id;
END;
$$;

COMMENT ON FUNCTION public.publish_grade_threshold_publication(UUID) IS
  'Validates and atomically activates one staged revision while superseding its direct predecessor. Service role only.';

REVOKE ALL ON FUNCTION public.publish_grade_threshold_publication(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_grade_threshold_publication(UUID) TO service_role;

CREATE FUNCTION public.stage_grade_threshold_publication_bundle(p_bundle JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_pub_json            JSONB := p_bundle->'publication';
  v_publication_id      UUID;
  v_raw_checksum        TEXT;
  v_bytea_checksum      BYTEA;
  v_revision_number     INTEGER;
  v_revises_id          UUID;
  v_variant_item        JSONB;
  v_variant_id          UUID;
  v_component_code      TEXT;
  v_mark_item           JSONB;
  v_combo_item          JSONB;
  v_combo_id            UUID;
  v_token_item          JSONB;
  v_resolved_comp_id    UUID;
  v_resolved_code       TEXT;
  v_issue_item          JSONB;
  v_auto_publish        BOOLEAN := COALESCE((p_bundle->>'auto_publish')::BOOLEAN, FALSE);
BEGIN
  IF v_pub_json IS NULL THEN
    RAISE EXCEPTION 'Missing publication payload in bundle' USING ERRCODE = '22023';
  END IF;

  v_raw_checksum := v_pub_json->>'source_checksum_sha256';
  IF SUBSTRING(v_raw_checksum FROM 1 FOR 2) = '\x' THEN
    v_bytea_checksum := DECODE(SUBSTRING(v_raw_checksum FROM 3), 'hex');
  ELSE
    v_bytea_checksum := DECODE(v_raw_checksum, 'hex');
  END IF;

  v_revision_number := (v_pub_json->>'revision_number')::INTEGER;
  v_revises_id := (v_pub_json->>'revises_publication_id')::UUID;

  IF v_auto_publish AND (v_revision_number > 1 OR v_revises_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Changed-checksum revisions require separate administrative review and cannot be auto-published'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.grade_threshold_publications (
    import_run_id,
    subject_id,
    exam_year,
    exam_series,
    official_index_url,
    official_pdf_url,
    source_checksum_sha256,
    revision_number,
    revises_publication_id,
    publication_status,
    is_active,
    source_metadata
  ) VALUES (
    (v_pub_json->>'import_run_id')::UUID,
    (v_pub_json->>'subject_id')::UUID,
    (v_pub_json->>'exam_year')::SMALLINT,
    v_pub_json->>'exam_series',
    v_pub_json->>'official_index_url',
    v_pub_json->>'official_pdf_url',
    v_bytea_checksum,
    v_revision_number,
    v_revises_id,
    'staged',
    FALSE,
    COALESCE(v_pub_json->'source_metadata', '{}'::JSONB)
  )
  RETURNING id INTO v_publication_id;

  CREATE TEMPORARY TABLE IF NOT EXISTS _bundle_variant_map (
    component_code TEXT PRIMARY KEY,
    variant_id UUID NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE _bundle_variant_map;

  IF p_bundle ? 'variants' AND JSONB_TYPEOF(p_bundle->'variants') = 'array' THEN
    FOR v_variant_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_bundle->'variants') LOOP
      v_component_code := v_variant_item->>'component_code';

      INSERT INTO public.grade_threshold_component_variants (
        publication_id,
        component_code,
        raw_maximum_mark,
        subject_paper_id,
        source_label,
        source_row_metadata
      ) VALUES (
        v_publication_id,
        v_component_code,
        (v_variant_item->>'raw_maximum_mark')::SMALLINT,
        (v_variant_item->>'subject_paper_id')::UUID,
        v_variant_item->>'source_label',
        COALESCE(v_variant_item->'source_row_metadata', '{}'::JSONB)
      )
      RETURNING id INTO v_variant_id;

      INSERT INTO _bundle_variant_map (component_code, variant_id)
      VALUES (v_component_code, v_variant_id);

      IF v_variant_item ? 'marks' AND JSONB_TYPEOF(v_variant_item->'marks') = 'array' THEN
        FOR v_mark_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(v_variant_item->'marks') LOOP
          INSERT INTO public.grade_threshold_component_marks (
            component_variant_id,
            grade,
            threshold_mark
          ) VALUES (
            v_variant_id,
            v_mark_item->>'grade',
            (v_mark_item->>'threshold_mark')::SMALLINT
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  IF p_bundle ? 'combinations' AND JSONB_TYPEOF(p_bundle->'combinations') = 'array' THEN
    FOR v_combo_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_bundle->'combinations') LOOP
      INSERT INTO public.grade_threshold_combinations (
        publication_id,
        canonical_key,
        official_option_label,
        official_source_label,
        qualification_level,
        route_type,
        maximum_mark,
        weighting_basis,
        planner_eligibility,
        atlas_route_id,
        review_metadata
      ) VALUES (
        v_publication_id,
        v_combo_item->>'canonical_key',
        v_combo_item->>'official_option_label',
        v_combo_item->>'official_source_label',
        v_combo_item->>'qualification_level',
        v_combo_item->>'route_type',
        (v_combo_item->>'maximum_mark')::NUMERIC,
        v_combo_item->>'weighting_basis',
        COALESCE(v_combo_item->>'planner_eligibility', 'unreviewed'),
        (v_combo_item->>'atlas_route_id')::UUID,
        COALESCE(v_combo_item->'review_metadata', '{}'::JSONB)
      )
      RETURNING id INTO v_combo_id;

      IF v_combo_item ? 'marks' AND JSONB_TYPEOF(v_combo_item->'marks') = 'array' THEN
        FOR v_mark_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(v_combo_item->'marks') LOOP
          INSERT INTO public.grade_threshold_combination_marks (
            combination_id,
            grade,
            threshold_mark
          ) VALUES (
            v_combo_id,
            v_mark_item->>'grade',
            (v_mark_item->>'threshold_mark')::NUMERIC
          );
        END LOOP;
      END IF;

      IF v_combo_item ? 'tokens' AND JSONB_TYPEOF(v_combo_item->'tokens') = 'array' THEN
        FOR v_token_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(v_combo_item->'tokens') LOOP
          v_resolved_comp_id := (v_token_item->>'resolved_component_variant_id')::UUID;
          v_resolved_code := v_token_item->>'resolved_component_code';

          IF v_resolved_comp_id IS NULL AND v_resolved_code IS NOT NULL THEN
            SELECT variant_id INTO v_resolved_comp_id
            FROM _bundle_variant_map
            WHERE component_code = v_resolved_code;
          END IF;

          INSERT INTO public.grade_threshold_combination_tokens (
            combination_id,
            token_position,
            raw_token,
            token_kind,
            resolved_component_variant_id,
            stage,
            maximum_mark,
            weighting_factor,
            weighting_entry_id,
            carry_forward_mapping_status,
            mapping_reviewed_by,
            mapping_reviewed_at,
            source_token_metadata
          ) VALUES (
            v_combo_id,
            (v_token_item->>'token_position')::SMALLINT,
            v_token_item->>'raw_token',
            v_token_item->>'token_kind',
            v_resolved_comp_id,
            v_token_item->>'stage',
            (v_token_item->>'maximum_mark')::NUMERIC,
            (v_token_item->>'weighting_factor')::NUMERIC,
            (v_token_item->>'weighting_entry_id')::UUID,
            v_token_item->>'carry_forward_mapping_status',
            v_token_item->>'mapping_reviewed_by',
            (v_token_item->>'mapping_reviewed_at')::TIMESTAMPTZ,
            COALESCE(v_token_item->'source_token_metadata', '{}'::JSONB)
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  IF p_bundle ? 'issues' AND JSONB_TYPEOF(p_bundle->'issues') = 'array' THEN
    FOR v_issue_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_bundle->'issues') LOOP
      INSERT INTO public.grade_threshold_import_issues (
        import_run_id,
        publication_id,
        severity,
        issue_code,
        message,
        resolution_status,
        record_reference
      ) VALUES (
        (v_issue_item->>'import_run_id')::UUID,
        v_publication_id,
        v_issue_item->>'severity',
        v_issue_item->>'issue_code',
        v_issue_item->>'message',
        COALESCE(v_issue_item->>'resolution_status', 'open'),
        COALESCE(v_issue_item->'record_reference', '{}'::JSONB)
      );
    END LOOP;
  END IF;

  IF v_auto_publish THEN
    PERFORM public.publish_grade_threshold_publication(v_publication_id);
  END IF;

  RETURN v_publication_id;
END;
$$;

COMMENT ON FUNCTION public.stage_grade_threshold_publication_bundle(JSONB) IS
  'Atomically stages a publication along with variants, marks, combinations, tokens, issues, and optional activation inside a single database transaction. Service role only.';

REVOKE ALL ON FUNCTION public.stage_grade_threshold_publication_bundle(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_grade_threshold_publication_bundle(JSONB) TO service_role;

CREATE FUNCTION public.stage_grade_threshold_weighting_source_bundle(p_bundle JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_id       UUID;
  v_raw_checksum    TEXT;
  v_bytea_checksum  BYTEA;
  v_entry_item      JSONB;
BEGIN
  -- Weighting sources must always be staged as unreviewed without reviewer metadata
  IF (p_bundle ? 'review_status' AND p_bundle->>'review_status' IS NOT NULL AND p_bundle->>'review_status' <> 'unreviewed')
     OR (p_bundle ? 'reviewed_by' AND p_bundle->>'reviewed_by' IS NOT NULL)
     OR (p_bundle ? 'reviewed_at' AND p_bundle->>'reviewed_at' IS NOT NULL) THEN
    RAISE EXCEPTION 'Weighting sources must be staged as unreviewed without reviewer metadata'
      USING ERRCODE = '23514';
  END IF;

  v_raw_checksum := p_bundle->>'source_checksum_sha256';
  IF SUBSTRING(v_raw_checksum FROM 1 FOR 2) = '\x' THEN
    v_bytea_checksum := DECODE(SUBSTRING(v_raw_checksum FROM 3), 'hex');
  ELSE
    v_bytea_checksum := DECODE(v_raw_checksum, 'hex');
  END IF;

  INSERT INTO public.grade_threshold_weighting_sources (
    subject_id,
    document_year,
    exam_series,
    official_document_url,
    source_checksum_sha256,
    source_label,
    review_status,
    reviewed_by,
    reviewed_at,
    source_metadata
  ) VALUES (
    (p_bundle->>'subject_id')::UUID,
    (p_bundle->>'document_year')::SMALLINT,
    p_bundle->>'exam_series',
    p_bundle->>'official_document_url',
    v_bytea_checksum,
    p_bundle->>'source_label',
    'unreviewed',
    NULL,
    NULL,
    COALESCE(p_bundle->'source_metadata', '{}'::JSONB)
  )
  RETURNING id INTO v_source_id;

  IF p_bundle ? 'entries' AND JSONB_TYPEOF(p_bundle->'entries') = 'array' THEN
    FOR v_entry_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_bundle->'entries') LOOP
      INSERT INTO public.grade_threshold_weighting_entries (
        weighting_source_id,
        raw_token,
        token_kind,
        raw_maximum,
        weighted_maximum,
        official_weighting_factor,
        source_page,
        source_row_label
      ) VALUES (
        v_source_id,
        v_entry_item->>'raw_token',
        v_entry_item->>'token_kind',
        (v_entry_item->>'raw_maximum')::NUMERIC,
        (v_entry_item->>'weighted_maximum')::NUMERIC,
        (v_entry_item->>'official_weighting_factor')::NUMERIC,
        (v_entry_item->>'source_page')::SMALLINT,
        v_entry_item->>'source_row_label'
      );
    END LOOP;
  END IF;

  RETURN v_source_id;
END;
$$;

COMMENT ON FUNCTION public.stage_grade_threshold_weighting_source_bundle(JSONB) IS
  'Atomically stages a weighting source header and all constituent weighting entries in a single database transaction. Service role only.';

REVOKE ALL ON FUNCTION public.stage_grade_threshold_weighting_source_bundle(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_grade_threshold_weighting_source_bundle(JSONB) TO service_role;

CREATE FUNCTION public.approve_grade_threshold_weighting_source(
  p_source_id   UUID,
  p_reviewed_by TEXT,
  p_reviewed_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  IF p_reviewed_by IS NULL OR LENGTH(BTRIM(p_reviewed_by)) = 0 THEN
    RAISE EXCEPTION 'reviewed_by is required for approving a weighting source'
      USING ERRCODE = '23514';
  END IF;

  SELECT review_status INTO v_current_status
  FROM public.grade_threshold_weighting_sources
  WHERE id = p_source_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Weighting source not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_current_status <> 'unreviewed' THEN
    RAISE EXCEPTION 'Only unreviewed weighting sources can be approved (current status: %)', v_current_status
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.grade_threshold_weighting_sources
  SET review_status = 'approved',
      reviewed_by = p_reviewed_by,
      reviewed_at = COALESCE(p_reviewed_at, NOW())
  WHERE id = p_source_id;

  RETURN p_source_id;
END;
$$;

COMMENT ON FUNCTION public.approve_grade_threshold_weighting_source(UUID, TEXT, TIMESTAMPTZ) IS
  'Administratively reviews and approves a weighting source. Service role only.';

REVOKE ALL ON FUNCTION public.approve_grade_threshold_weighting_source(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_grade_threshold_weighting_source(UUID, TEXT, TIMESTAMPTZ) TO service_role;

-- Internal trigger functions are not callable application APIs.
REVOKE ALL ON FUNCTION public.validate_grade_threshold_publication_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_grade_threshold_component_variant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_grade_threshold_component_mark() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_grade_threshold_combination() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_grade_threshold_combination_mark() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_grade_threshold_combination_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_grade_threshold_weighting_entry_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_grade_threshold_benchmark_member() FROM PUBLIC, anon, authenticated;

-- ─── 8. Safe derived read models ─────────────────────────────────────────────

CREATE VIEW public.published_grade_threshold_combinations
WITH (security_invoker = TRUE)
AS
SELECT
  c.*,
  NOT EXISTS (
    SELECT 1
    FROM public.grade_threshold_combination_tokens t
    LEFT JOIN public.grade_threshold_weighting_entries we
      ON we.id = t.weighting_entry_id
     AND we.raw_token = t.raw_token
     AND we.token_kind = t.token_kind
     AND we.raw_maximum = t.maximum_mark
     AND we.official_weighting_factor = t.weighting_factor
    LEFT JOIN public.grade_threshold_weighting_sources ws
      ON ws.id = we.weighting_source_id
     AND ws.subject_id = p.subject_id
     AND ws.document_year = p.exam_year
     AND ws.exam_series = p.exam_series
     AND ws.review_status = 'approved'
    WHERE t.combination_id = c.id
      AND (
        t.token_kind NOT IN ('component_variant', 'carry_forward')
        OR (t.token_kind = 'component_variant' AND (
          t.resolved_component_variant_id IS NULL
          OR t.maximum_mark IS NULL
          OR t.weighting_factor IS NULL
          OR we.id IS NULL
          OR ws.id IS NULL
        ))
        OR (t.token_kind = 'carry_forward' AND (
          t.carry_forward_mapping_status <> 'approved'
          OR t.maximum_mark IS NULL
          OR t.weighting_factor IS NULL
          OR we.id IS NULL
          OR ws.id IS NULL
        ))
      )
  ) AS per_paper_allocation_eligible
FROM public.grade_threshold_combinations c
JOIN public.grade_threshold_publications p ON p.id = c.publication_id
WHERE p.publication_status = 'published'
  AND p.is_active = TRUE
  AND c.planner_eligibility = 'eligible'
  AND c.atlas_route_id IS NOT NULL
  AND (
    (c.route_type IN ('as_only', 'full_level')
      AND NOT EXISTS (
        SELECT 1
        FROM public.grade_threshold_combination_tokens t
        LEFT JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
        LEFT JOIN public.subject_route_papers rp
          ON rp.route_id = c.atlas_route_id
         AND rp.subject_paper_id = v.subject_paper_id
         AND rp.stage = t.stage
        WHERE t.combination_id = c.id
          AND (t.token_kind <> 'component_variant' OR v.subject_paper_id IS NULL OR rp.id IS NULL)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.subject_route_papers rp
        WHERE rp.route_id = c.atlas_route_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.grade_threshold_combination_tokens t
            JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
            WHERE t.combination_id = c.id
              AND v.subject_paper_id = rp.subject_paper_id
              AND t.stage = rp.stage
          )
      )
    )
    OR
    (c.route_type = 'staged'
      AND (SELECT COUNT(*)
           FROM public.grade_threshold_combination_tokens t
           WHERE t.combination_id = c.id
             AND t.token_kind = 'carry_forward'
             AND t.stage = 'as'
             AND t.carry_forward_mapping_status = 'approved') = 1
      AND NOT EXISTS (
        SELECT 1
        FROM public.grade_threshold_combination_tokens t
        LEFT JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
        LEFT JOIN public.subject_route_papers rp
          ON rp.route_id = c.atlas_route_id
         AND rp.stage = 'a2'
         AND rp.subject_paper_id = v.subject_paper_id
        WHERE t.combination_id = c.id
          AND (
            t.token_kind NOT IN ('component_variant', 'carry_forward')
            OR (t.token_kind = 'component_variant' AND (t.stage <> 'a2' OR v.subject_paper_id IS NULL OR rp.id IS NULL))
            OR (t.token_kind = 'carry_forward' AND (t.stage <> 'as' OR t.carry_forward_mapping_status <> 'approved'))
          )
      )
      AND EXISTS (
        SELECT 1 FROM public.subject_route_papers rp
        WHERE rp.route_id = c.atlas_route_id AND rp.stage = 'as'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.subject_route_papers rp
        WHERE rp.route_id = c.atlas_route_id
          AND rp.stage = 'a2'
          AND NOT EXISTS (
            SELECT 1
            FROM public.grade_threshold_combination_tokens t
            JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
            WHERE t.combination_id = c.id
              AND t.token_kind = 'component_variant'
              AND t.stage = 'a2'
              AND v.subject_paper_id = rp.subject_paper_id
          )
      )
    )
  )
  AND (
    SELECT COUNT(*)
    FROM public.grade_threshold_combination_tokens t
    JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
    WHERE t.combination_id = c.id
  ) = (
    SELECT COUNT(DISTINCT v.subject_paper_id)
    FROM public.grade_threshold_combination_tokens t
    JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
    WHERE t.combination_id = c.id
  );

COMMENT ON VIEW public.published_grade_threshold_combinations IS
  'Student-planner boundary: active published + reviewed eligible + mapped only. Allocation additionally requires complete source-backed token weighting.';

CREATE VIEW public.published_grade_threshold_variant_benchmarks
WITH (security_invoker = TRUE)
AS
SELECT
  g.id AS benchmark_group_id,
  g.publication_id,
  g.subject_paper_id,
  g.component_grade,
  g.raw_maximum_mark,
  CEIL(AVG(m.threshold_mark))::SMALLINT AS ceiling_average_mark,
  ARRAY_AGG(v.component_code ORDER BY v.component_code) AS included_variants,
  COUNT(*)::INTEGER AS variant_count
FROM public.grade_threshold_variant_benchmark_groups g
JOIN public.grade_threshold_publications p ON p.id = g.publication_id
JOIN public.grade_threshold_variant_benchmark_members bm ON bm.group_id = g.id
JOIN public.grade_threshold_component_variants v ON v.id = bm.component_variant_id
JOIN public.grade_threshold_component_marks m
  ON m.component_variant_id = v.id AND m.grade = g.component_grade
WHERE p.publication_status = 'published'
  AND p.is_active = TRUE
  AND g.approval_status = 'approved'
GROUP BY g.id, g.publication_id, g.subject_paper_id, g.component_grade, g.raw_maximum_mark;

COMMENT ON VIEW public.published_grade_threshold_variant_benchmarks IS
  'Approved Atlas estimates only: exact named variants, same paper/grade/maximum, averaged then rounded upward.';

-- ─── 9. RLS and grants ───────────────────────────────────────────────────────

ALTER TABLE public.grade_threshold_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_threshold_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_threshold_component_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_threshold_component_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_threshold_combinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_threshold_combination_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_threshold_weighting_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_threshold_weighting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_threshold_combination_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_threshold_import_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_threshold_variant_benchmark_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_threshold_variant_benchmark_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY grade_threshold_publications_select_published
  ON public.grade_threshold_publications FOR SELECT TO anon, authenticated
  USING (publication_status = 'published' AND is_active = TRUE);

CREATE POLICY grade_threshold_component_variants_select_published
  ON public.grade_threshold_component_variants FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.grade_threshold_publications p
    WHERE p.id = publication_id AND p.publication_status = 'published' AND p.is_active = TRUE
  ));

CREATE POLICY grade_threshold_component_marks_select_published
  ON public.grade_threshold_component_marks FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.grade_threshold_component_variants v
    JOIN public.grade_threshold_publications p ON p.id = v.publication_id
    WHERE v.id = component_variant_id AND p.publication_status = 'published' AND p.is_active = TRUE
  ));

CREATE POLICY grade_threshold_combinations_select_published
  ON public.grade_threshold_combinations FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.grade_threshold_publications p
    WHERE p.id = publication_id AND p.publication_status = 'published' AND p.is_active = TRUE
  ));

CREATE POLICY grade_threshold_combination_marks_select_published
  ON public.grade_threshold_combination_marks FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.grade_threshold_combinations c
    JOIN public.grade_threshold_publications p ON p.id = c.publication_id
    WHERE c.id = combination_id AND p.publication_status = 'published' AND p.is_active = TRUE
  ));

CREATE POLICY grade_threshold_weighting_sources_select_published
  ON public.grade_threshold_weighting_sources FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.grade_threshold_weighting_entries e
    JOIN public.grade_threshold_combination_tokens t ON t.weighting_entry_id = e.id
    JOIN public.grade_threshold_combinations c ON c.id = t.combination_id
    JOIN public.grade_threshold_publications p ON p.id = c.publication_id
    WHERE e.weighting_source_id = grade_threshold_weighting_sources.id
      AND p.publication_status = 'published'
      AND p.is_active = TRUE
  ));

CREATE POLICY grade_threshold_weighting_entries_select_published
  ON public.grade_threshold_weighting_entries FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.grade_threshold_combination_tokens t
    JOIN public.grade_threshold_combinations c ON c.id = t.combination_id
    JOIN public.grade_threshold_publications p ON p.id = c.publication_id
    WHERE t.weighting_entry_id = grade_threshold_weighting_entries.id
      AND p.publication_status = 'published'
      AND p.is_active = TRUE
  ));

CREATE POLICY grade_threshold_combination_tokens_select_published
  ON public.grade_threshold_combination_tokens FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.grade_threshold_combinations c
    JOIN public.grade_threshold_publications p ON p.id = c.publication_id
    WHERE c.id = combination_id AND p.publication_status = 'published' AND p.is_active = TRUE
  ));

CREATE POLICY grade_threshold_benchmark_groups_select_published
  ON public.grade_threshold_variant_benchmark_groups FOR SELECT TO anon, authenticated
  USING (approval_status = 'approved' AND EXISTS (
    SELECT 1 FROM public.grade_threshold_publications p
    WHERE p.id = publication_id AND p.publication_status = 'published' AND p.is_active = TRUE
  ));

CREATE POLICY grade_threshold_benchmark_members_select_published
  ON public.grade_threshold_variant_benchmark_members FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.grade_threshold_variant_benchmark_groups g
    JOIN public.grade_threshold_publications p ON p.id = g.publication_id
    WHERE g.id = group_id
      AND g.approval_status = 'approved'
      AND p.publication_status = 'published'
      AND p.is_active = TRUE
  ));

-- Catalogue SELECT is safe only through the published-row RLS policies above.
GRANT SELECT ON TABLE
  public.grade_threshold_publications,
  public.grade_threshold_component_variants,
  public.grade_threshold_component_marks,
  public.grade_threshold_combinations,
  public.grade_threshold_combination_marks,
  public.grade_threshold_weighting_sources,
  public.grade_threshold_weighting_entries,
  public.grade_threshold_combination_tokens,
  public.grade_threshold_variant_benchmark_groups,
  public.grade_threshold_variant_benchmark_members
TO anon, authenticated;

GRANT SELECT ON TABLE
  public.published_grade_threshold_combinations,
  public.published_grade_threshold_variant_benchmarks
TO anon, authenticated;

-- No client grants or policies exist for batch audit or validation issues.
REVOKE ALL ON TABLE
  public.grade_threshold_import_runs,
  public.grade_threshold_import_issues
FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.grade_threshold_publications,
  public.grade_threshold_component_variants,
  public.grade_threshold_component_marks,
  public.grade_threshold_combinations,
  public.grade_threshold_combination_marks,
  public.grade_threshold_weighting_sources,
  public.grade_threshold_weighting_entries,
  public.grade_threshold_combination_tokens,
  public.grade_threshold_variant_benchmark_groups,
  public.grade_threshold_variant_benchmark_members
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.grade_threshold_import_runs,
  public.grade_threshold_publications,
  public.grade_threshold_component_variants,
  public.grade_threshold_component_marks,
  public.grade_threshold_combinations,
  public.grade_threshold_combination_marks,
  public.grade_threshold_weighting_sources,
  public.grade_threshold_weighting_entries,
  public.grade_threshold_combination_tokens,
  public.grade_threshold_import_issues,
  public.grade_threshold_variant_benchmark_groups,
  public.grade_threshold_variant_benchmark_members
TO service_role;

GRANT SELECT ON TABLE
  public.published_grade_threshold_combinations,
  public.published_grade_threshold_variant_benchmarks
TO service_role;

GRANT SELECT ON TABLE
  public.subjects
TO authenticated, service_role;

COMMIT;
