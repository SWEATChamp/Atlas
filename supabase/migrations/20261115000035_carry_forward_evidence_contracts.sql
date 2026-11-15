-- =============================================================================
-- MIGRATION 035: Official Carry-Forward Evidence Contracts & Planner Gating
-- Migration: 20261115000035_carry_forward_evidence_contracts.sql
--
-- Milestone 5 Slice 2C Gate 1: Schema-only carry-forward evidence contracts.
-- Reconciled strictly against authoritative Migration 027 and Migration 029.
--
-- Objects created:
-- 1. Table: public.grade_threshold_carry_forward_evidence_documents
-- 2. Table: public.grade_threshold_carry_forward_source_mappings
-- 3. Table: public.grade_threshold_combination_carry_forward_links
-- 4. Triggers:
--    - trg_validate_combination_carry_forward_link
--    - trg_prevent_linked_source_mapping_structural_mutation
--    - trg_prevent_linked_evidence_doc_structural_mutation
-- 5. View: public.published_grade_threshold_carry_forward_mappings
-- 6. Updated View: public.published_grade_threshold_combinations
-- =============================================================================

BEGIN;

-- ─── 0. Array Validation Helper Function ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_is_valid_evidence_text_array(p_arr TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
COST 10
SET search_path = public, pg_catalog
AS $$
  SELECT p_arr IS NULL OR NOT EXISTS (
    SELECT 1
    FROM unnest(p_arr) AS elem
    WHERE elem IS NULL OR LENGTH(BTRIM(elem)) = 0
  );
$$;

REVOKE ALL ON FUNCTION public.fn_is_valid_evidence_text_array(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_valid_evidence_text_array(TEXT[]) TO service_role;

COMMENT ON FUNCTION public.fn_is_valid_evidence_text_array(TEXT[]) IS
  'Validates that text arrays contain no NULL, empty, or whitespace-only elements while preserving NULL array semantics.';

-- ─── 1. Evidence Documents Table ──────────────────────────────────────────────
CREATE TABLE public.grade_threshold_carry_forward_evidence_documents (
  id                             UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  document_title                 TEXT NOT NULL CHECK (LENGTH(BTRIM(document_title)) > 0),
  issuer                         TEXT NOT NULL CHECK (LENGTH(BTRIM(issuer)) > 0),
  source_url                     TEXT NOT NULL CHECK (source_url ~ '^https://'),
  checksum_sha256                BYTEA NOT NULL UNIQUE CHECK (OCTET_LENGTH(checksum_sha256) = 32),
  file_size_bytes                BIGINT NOT NULL CHECK (file_size_bytes > 0),
  pdf_version                    TEXT NOT NULL CHECK (LENGTH(BTRIM(pdf_version)) > 0),
  page_count                     INTEGER NOT NULL CHECK (page_count > 0),
  official_published_on          DATE,
  exam_year                      SMALLINT NOT NULL CHECK (exam_year BETWEEN 2000 AND 2100),
  exam_series                    TEXT NOT NULL CHECK (exam_series IN ('march', 'june', 'november')),
  scope_basis                    TEXT NOT NULL CHECK (scope_basis IN ('global', 'administrative_zone', 'territory')),
  declared_administrative_zones  TEXT[],
  declared_territories           TEXT[],
  scope_declaration              TEXT NOT NULL CHECK (LENGTH(BTRIM(scope_declaration)) > 0),
  review_status                  TEXT NOT NULL DEFAULT 'unreviewed'
                                 CHECK (review_status IN ('unreviewed', 'approved', 'rejected')),
  reviewed_by                    TEXT,
  reviewed_at                    TIMESTAMPTZ,
  is_active                      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_evidence_doc_review_lifecycle CHECK (
    (review_status = 'unreviewed' AND reviewed_by IS NULL AND reviewed_at IS NULL AND NOT is_active)
    OR (review_status = 'approved' AND reviewed_by IS NOT NULL AND LENGTH(BTRIM(reviewed_by)) > 0 AND reviewed_at IS NOT NULL)
    OR (review_status = 'rejected' AND reviewed_by IS NOT NULL AND LENGTH(BTRIM(reviewed_by)) > 0 AND reviewed_at IS NOT NULL AND NOT is_active)
  ),

  CONSTRAINT chk_evidence_doc_scope_discrimination CHECK (
    (scope_basis = 'global'
      AND declared_administrative_zones IS NULL
      AND declared_territories IS NULL)
    OR
    (scope_basis = 'administrative_zone'
      AND declared_administrative_zones IS NOT NULL
      AND cardinality(declared_administrative_zones) > 0
      AND (declared_territories IS NULL OR cardinality(declared_territories) > 0))
    OR
    (scope_basis = 'territory'
      AND declared_territories IS NOT NULL
      AND cardinality(declared_territories) > 0
      AND declared_administrative_zones IS NULL)
  ),

  CONSTRAINT chk_evidence_doc_zones_valid_elements CHECK (
    public.fn_is_valid_evidence_text_array(declared_administrative_zones)
  ),
  CONSTRAINT chk_evidence_doc_territories_valid_elements CHECK (
    public.fn_is_valid_evidence_text_array(declared_territories)
  )
);

CREATE INDEX idx_evidence_docs_lookup
  ON public.grade_threshold_carry_forward_evidence_documents(exam_year DESC, exam_series, review_status, is_active);

COMMENT ON TABLE public.grade_threshold_carry_forward_evidence_documents IS
  'Official provenance documents for carry-forward option rules (e.g. Cambridge Guides to Making Entries).';

-- ─── 2. Source Mappings Table ────────────────────────────────────────────────
CREATE TABLE public.grade_threshold_carry_forward_source_mappings (
  id                             UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  evidence_document_id           UUID NOT NULL REFERENCES public.grade_threshold_carry_forward_evidence_documents(id) ON DELETE RESTRICT,
  syllabus_code                  TEXT NOT NULL CHECK (syllabus_code ~ '^[0-9]{4}$'),
  entry_option_code              TEXT NOT NULL CHECK (entry_option_code ~ '^[A-Z0-9]{1,4}$'),
  raw_carry_forward_token        TEXT NOT NULL CHECK (LENGTH(BTRIM(raw_carry_forward_token)) > 0),
  sitting_components             TEXT[] NOT NULL CHECK (cardinality(sitting_components) > 0),
  carried_as_components          TEXT[] NOT NULL CHECK (cardinality(carried_as_components) > 0),
  applicable_paper_variants      TEXT[],
  sitting_exam_year              SMALLINT NOT NULL CHECK (sitting_exam_year BETWEEN 2000 AND 2100),
  sitting_exam_series            TEXT NOT NULL CHECK (sitting_exam_series IN ('march', 'june', 'november')),
  carried_exam_year              SMALLINT NOT NULL CHECK (carried_exam_year BETWEEN 2000 AND 2100),
  carried_exam_series            TEXT NOT NULL CHECK (carried_exam_series IN ('march', 'june', 'november')),
  scope_basis                    TEXT NOT NULL CHECK (scope_basis IN ('global', 'administrative_zone', 'territory')),
  scope_administrative_zones     TEXT[],
  scope_territories              TEXT[],
  scope_declaration              TEXT NOT NULL CHECK (LENGTH(BTRIM(scope_declaration)) > 0),
  page_locator                   TEXT NOT NULL CHECK (LENGTH(BTRIM(page_locator)) > 0),
  evidence_status                TEXT NOT NULL DEFAULT 'unreviewed'
                                 CHECK (evidence_status IN ('unreviewed', 'confirmed', 'unresolved', 'ambiguous', 'unsupported', 'rejected')),
  unresolved_reasons             TEXT[],
  ambiguity_reasons              TEXT[],
  rejection_reason               TEXT,
  authorized_by                  TEXT,
  authorized_at                  TIMESTAMPTZ,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_source_mapping_identity
    UNIQUE (evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token),

  CONSTRAINT chk_source_mapping_applicable_variants CHECK (
    applicable_paper_variants IS NULL OR cardinality(applicable_paper_variants) > 0
  ),

  CONSTRAINT chk_source_mapping_scope_discrimination CHECK (
    (scope_basis = 'global'
      AND scope_administrative_zones IS NULL
      AND scope_territories IS NULL)
    OR
    (scope_basis = 'administrative_zone'
      AND scope_administrative_zones IS NOT NULL
      AND cardinality(scope_administrative_zones) > 0
      AND (scope_territories IS NULL OR cardinality(scope_territories) > 0))
    OR
    (scope_basis = 'territory'
      AND scope_territories IS NOT NULL
      AND cardinality(scope_territories) > 0
      AND scope_administrative_zones IS NULL)
  ),

  CONSTRAINT chk_source_mapping_status_guards CHECK (
    (evidence_status = 'unreviewed'
      AND authorized_by IS NULL AND authorized_at IS NULL
      AND unresolved_reasons IS NULL AND ambiguity_reasons IS NULL AND rejection_reason IS NULL)
    OR
    (evidence_status = 'confirmed'
      AND authorized_by IS NOT NULL AND LENGTH(BTRIM(authorized_by)) > 0 AND authorized_at IS NOT NULL
      AND rejection_reason IS NULL AND unresolved_reasons IS NULL AND ambiguity_reasons IS NULL)
    OR
    (evidence_status = 'unresolved'
      AND unresolved_reasons IS NOT NULL AND cardinality(unresolved_reasons) > 0
      AND authorized_by IS NULL AND authorized_at IS NULL
      AND ambiguity_reasons IS NULL AND rejection_reason IS NULL)
    OR
    (evidence_status = 'ambiguous'
      AND ambiguity_reasons IS NOT NULL AND cardinality(ambiguity_reasons) > 0
      AND authorized_by IS NULL AND authorized_at IS NULL
      AND unresolved_reasons IS NULL AND rejection_reason IS NULL)
    OR
    (evidence_status = 'unsupported'
      AND rejection_reason IS NOT NULL AND LENGTH(BTRIM(rejection_reason)) > 0
      AND authorized_by IS NULL AND authorized_at IS NULL
      AND unresolved_reasons IS NULL AND ambiguity_reasons IS NULL)
    OR
    (evidence_status = 'rejected'
      AND rejection_reason IS NOT NULL AND LENGTH(BTRIM(rejection_reason)) > 0
      AND authorized_by IS NULL AND authorized_at IS NULL
      AND unresolved_reasons IS NULL AND ambiguity_reasons IS NULL)
  ),

  CONSTRAINT chk_source_mapping_sitting_components_elements CHECK (
    public.fn_is_valid_evidence_text_array(sitting_components)
  ),
  CONSTRAINT chk_source_mapping_carried_components_elements CHECK (
    public.fn_is_valid_evidence_text_array(carried_as_components)
  ),
  CONSTRAINT chk_source_mapping_variants_elements CHECK (
    public.fn_is_valid_evidence_text_array(applicable_paper_variants)
  ),
  CONSTRAINT chk_source_mapping_zones_elements CHECK (
    public.fn_is_valid_evidence_text_array(scope_administrative_zones)
  ),
  CONSTRAINT chk_source_mapping_territories_elements CHECK (
    public.fn_is_valid_evidence_text_array(scope_territories)
  ),
  CONSTRAINT chk_source_mapping_unresolved_elements CHECK (
    public.fn_is_valid_evidence_text_array(unresolved_reasons)
  ),
  CONSTRAINT chk_source_mapping_ambiguity_elements CHECK (
    public.fn_is_valid_evidence_text_array(ambiguity_reasons)
  )
);

CREATE INDEX idx_source_mappings_lookup
  ON public.grade_threshold_carry_forward_source_mappings(syllabus_code, sitting_exam_year DESC, sitting_exam_series, evidence_status);

CREATE INDEX idx_source_mappings_doc
  ON public.grade_threshold_carry_forward_source_mappings(evidence_document_id);

COMMENT ON TABLE public.grade_threshold_carry_forward_source_mappings IS
  'Document-derived entry option carry-forward rules, independent of Atlas threshold publications.';

-- ─── 3. Combination Carry-Forward Links Table ───────────────────────────────
CREATE TABLE public.grade_threshold_combination_carry_forward_links (
  id                   UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  source_mapping_id    UUID NOT NULL REFERENCES public.grade_threshold_carry_forward_source_mappings(id) ON DELETE RESTRICT,
  combination_id       UUID NOT NULL REFERENCES public.grade_threshold_combinations(id) ON DELETE CASCADE,
  token_id             UUID NOT NULL REFERENCES public.grade_threshold_combination_tokens(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           TEXT NOT NULL DEFAULT CURRENT_USER,

  CONSTRAINT uq_combination_token_link UNIQUE (combination_id, token_id),
  CONSTRAINT uq_combination_source_mapping UNIQUE (combination_id, source_mapping_id)
);

CREATE INDEX idx_carry_forward_links_combination
  ON public.grade_threshold_combination_carry_forward_links(combination_id);

CREATE INDEX idx_carry_forward_links_source_mapping
  ON public.grade_threshold_combination_carry_forward_links(source_mapping_id);

COMMENT ON TABLE public.grade_threshold_combination_carry_forward_links IS
  'Relational bridge linking a confirmed source mapping to a combination token without duplicated columns.';

-- ─── 4. Bridge Validation Trigger Function ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_combination_carry_forward_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_mapping        public.grade_threshold_carry_forward_source_mappings%ROWTYPE;
  v_doc            public.grade_threshold_carry_forward_evidence_documents%ROWTYPE;
  v_token          public.grade_threshold_combination_tokens%ROWTYPE;
  v_combination    public.grade_threshold_combinations%ROWTYPE;
  v_publication    public.grade_threshold_publications%ROWTYPE;
  v_subject_code   TEXT;
  v_sitting_tokens TEXT[];
  v_doc_id         UUID;
BEGIN
  -- 1. Deterministic lock acquisition to serialize bridge creation against structural mutations:
  -- Lock Order: 1. Evidence Document (FOR SHARE), 2. Source Mapping (FOR SHARE)
  LOOP
    SELECT evidence_document_id INTO v_doc_id
    FROM public.grade_threshold_carry_forward_source_mappings
    WHERE id = NEW.source_mapping_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target source mapping % does not exist', NEW.source_mapping_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Lock 1: Backing evidence document
    SELECT * INTO v_doc
    FROM public.grade_threshold_carry_forward_evidence_documents
    WHERE id = v_doc_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Evidence document % does not exist', v_doc_id
        USING ERRCODE = 'P0002';
    END IF;

    -- Lock 2: Source mapping
    SELECT * INTO v_mapping
    FROM public.grade_threshold_carry_forward_source_mappings
    WHERE id = NEW.source_mapping_id
    FOR SHARE;

    EXIT WHEN v_mapping.evidence_document_id = v_doc.id;
  END LOOP;

  -- 2. Validate source mapping status
  IF v_mapping.evidence_status <> 'confirmed' THEN
    RAISE EXCEPTION 'Cannot link source mapping % with status % (must be confirmed)',
      v_mapping.id, v_mapping.evidence_status
      USING ERRCODE = '23514';
  END IF;

  -- 3. Validate backing evidence document status
  IF v_doc.review_status <> 'approved' OR NOT v_doc.is_active THEN
    RAISE EXCEPTION 'Source mapping is backed by inactive or unapproved evidence document % (status: %, is_active: %)',
      v_mapping.evidence_document_id, v_doc.review_status, v_doc.is_active
      USING ERRCODE = '23514';
  END IF;

  -- 3. Fetch combination and assert staged route type
  SELECT * INTO v_combination
  FROM public.grade_threshold_combinations
  WHERE id = NEW.combination_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target combination % does not exist', NEW.combination_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_combination.route_type <> 'staged' THEN
    RAISE EXCEPTION 'Cannot create carry-forward link on non-staged combination % (route_type: %)',
      NEW.combination_id, v_combination.route_type
      USING ERRCODE = '23514';
  END IF;

  -- 4. Fetch combination token and verify ownership & kind
  SELECT * INTO v_token
  FROM public.grade_threshold_combination_tokens
  WHERE id = NEW.token_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target combination token % does not exist', NEW.token_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_token.combination_id <> NEW.combination_id THEN
    RAISE EXCEPTION 'Token % does not belong to combination %', NEW.token_id, NEW.combination_id
      USING ERRCODE = '23514';
  END IF;

  IF v_token.token_kind <> 'carry_forward' THEN
    RAISE EXCEPTION 'Linked token % must have token_kind = carry_forward (got %)',
      NEW.token_id, v_token.token_kind
      USING ERRCODE = '23514';
  END IF;

  IF v_token.stage <> 'as' THEN
    RAISE EXCEPTION 'Linked token % must have stage = as (got %)',
      NEW.token_id, v_token.stage
      USING ERRCODE = '23514';
  END IF;

  IF v_token.raw_token <> v_mapping.raw_carry_forward_token THEN
    RAISE EXCEPTION 'Token raw_token "%" does not match mapping raw_carry_forward_token "%"',
      v_token.raw_token, v_mapping.raw_carry_forward_token
      USING ERRCODE = '23514';
  END IF;

  -- 5. Fetch publication and resolve subject syllabus code
  SELECT * INTO v_publication
  FROM public.grade_threshold_publications
  WHERE id = v_combination.publication_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publication % for combination % does not exist',
      v_combination.publication_id, NEW.combination_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT s.code INTO v_subject_code
  FROM public.subjects s
  WHERE s.id = v_publication.subject_id;

  IF NOT FOUND OR v_subject_code IS NULL THEN
    RAISE EXCEPTION 'Subject % for publication % has no valid syllabus code',
      v_publication.subject_id, v_publication.id
      USING ERRCODE = '23514';
  END IF;

  IF v_subject_code <> v_mapping.syllabus_code THEN
    RAISE EXCEPTION 'Publication syllabus % does not match mapping syllabus %',
      v_subject_code, v_mapping.syllabus_code
      USING ERRCODE = '23514';
  END IF;

  IF v_publication.exam_year <> v_mapping.sitting_exam_year
     OR v_publication.exam_series <> v_mapping.sitting_exam_series THEN
    RAISE EXCEPTION 'Publication session (% %) does not match mapping sitting session (% %)',
      v_publication.exam_series, v_publication.exam_year,
      v_mapping.sitting_exam_series, v_mapping.sitting_exam_year
      USING ERRCODE = '23514';
  END IF;

  -- 6. Sitting component comparison: exact ordered component_variant tokens
  SELECT ARRAY(
    SELECT raw_token
    FROM public.grade_threshold_combination_tokens
    WHERE combination_id = NEW.combination_id
      AND token_kind = 'component_variant'
    ORDER BY token_position ASC
  ) INTO v_sitting_tokens;

  IF v_sitting_tokens IS DISTINCT FROM v_mapping.sitting_components THEN
    RAISE EXCEPTION 'Combination sitting components % do not match mapping sitting components %',
      v_sitting_tokens, v_mapping.sitting_components
      USING ERRCODE = '23514';
  END IF;

  -- 7. Scope containment: mapping scope must be equal to or narrower than document scope
  IF v_doc.scope_basis = 'territory' THEN
    IF v_mapping.scope_basis <> 'territory' THEN
      RAISE EXCEPTION 'Territory-scoped document % cannot authorize % mapping %',
        v_doc.id, v_mapping.scope_basis, v_mapping.id
        USING ERRCODE = '23514';
    END IF;
    IF v_mapping.scope_territories IS NULL
       OR NOT (v_mapping.scope_territories <@ v_doc.declared_territories) THEN
      RAISE EXCEPTION 'Mapping territories % not contained in document territories %',
        v_mapping.scope_territories, v_doc.declared_territories
        USING ERRCODE = '23514';
    END IF;

  ELSIF v_doc.scope_basis = 'administrative_zone' THEN
    IF v_mapping.scope_basis = 'global' THEN
      RAISE EXCEPTION 'Administrative zone document % cannot authorize global mapping %',
        v_doc.id, v_mapping.id
        USING ERRCODE = '23514';
    END IF;

    IF v_mapping.scope_basis = 'administrative_zone' THEN
      IF v_mapping.scope_administrative_zones IS NULL
         OR NOT (v_mapping.scope_administrative_zones <@ v_doc.declared_administrative_zones) THEN
        RAISE EXCEPTION 'Mapping zones % not contained in document zones %',
          v_mapping.scope_administrative_zones, v_doc.declared_administrative_zones
          USING ERRCODE = '23514';
      END IF;

      -- If document has an included territory restriction (e.g. China), mapping cannot omit or broaden it
      IF v_doc.declared_territories IS NOT NULL THEN
        IF v_mapping.scope_territories IS NULL
           OR NOT (v_mapping.scope_territories <@ v_doc.declared_territories) THEN
          RAISE EXCEPTION 'Mapping territory restriction % not contained in document territory restriction %',
            v_mapping.scope_territories, v_doc.declared_territories
            USING ERRCODE = '23514';
        END IF;
      END IF;

    ELSIF v_mapping.scope_basis = 'territory' THEN
      IF v_doc.declared_territories IS NOT NULL THEN
        IF v_mapping.scope_territories IS NULL
           OR NOT (v_mapping.scope_territories <@ v_doc.declared_territories) THEN
          RAISE EXCEPTION 'Territory mapping % not contained in document territory restriction %',
            v_mapping.scope_territories, v_doc.declared_territories
            USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;

  ELSIF v_doc.scope_basis = 'global' THEN
    -- Global document may support global mapping or narrower zone/territory mapping if source declaration specifies
    NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_validate_combination_carry_forward_link() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_validate_combination_carry_forward_link
  BEFORE INSERT OR UPDATE ON public.grade_threshold_combination_carry_forward_links
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_combination_carry_forward_link();

-- ─── 4b. Source Mapping Immutability Trigger ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_prevent_linked_source_mapping_structural_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.grade_threshold_combination_carry_forward_links
    WHERE source_mapping_id = OLD.id
  ) THEN
    IF NEW.evidence_document_id IS DISTINCT FROM OLD.evidence_document_id
       OR NEW.syllabus_code IS DISTINCT FROM OLD.syllabus_code
       OR NEW.entry_option_code IS DISTINCT FROM OLD.entry_option_code
       OR NEW.raw_carry_forward_token IS DISTINCT FROM OLD.raw_carry_forward_token
       OR NEW.sitting_components IS DISTINCT FROM OLD.sitting_components
       OR NEW.carried_as_components IS DISTINCT FROM OLD.carried_as_components
       OR NEW.applicable_paper_variants IS DISTINCT FROM OLD.applicable_paper_variants
       OR NEW.sitting_exam_year IS DISTINCT FROM OLD.sitting_exam_year
       OR NEW.sitting_exam_series IS DISTINCT FROM OLD.sitting_exam_series
       OR NEW.carried_exam_year IS DISTINCT FROM OLD.carried_exam_year
       OR NEW.carried_exam_series IS DISTINCT FROM OLD.carried_exam_series
       OR NEW.scope_basis IS DISTINCT FROM OLD.scope_basis
       OR NEW.scope_administrative_zones IS DISTINCT FROM OLD.scope_administrative_zones
       OR NEW.scope_territories IS DISTINCT FROM OLD.scope_territories
       OR NEW.scope_declaration IS DISTINCT FROM OLD.scope_declaration
       OR NEW.page_locator IS DISTINCT FROM OLD.page_locator THEN
      RAISE EXCEPTION 'Cannot modify structural evidence fields on linked source mapping % (remove bridge links first)', OLD.id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_prevent_linked_source_mapping_structural_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_prevent_linked_source_mapping_structural_mutation
  BEFORE UPDATE ON public.grade_threshold_carry_forward_source_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_linked_source_mapping_structural_mutation();

-- ─── 4c. Evidence Document Immutability Trigger ──────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_prevent_linked_evidence_doc_structural_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.grade_threshold_carry_forward_source_mappings sm
    JOIN public.grade_threshold_combination_carry_forward_links ccl ON ccl.source_mapping_id = sm.id
    WHERE sm.evidence_document_id = OLD.id
  ) THEN
    IF NEW.document_title IS DISTINCT FROM OLD.document_title
       OR NEW.issuer IS DISTINCT FROM OLD.issuer
       OR NEW.source_url IS DISTINCT FROM OLD.source_url
       OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
       OR NEW.file_size_bytes IS DISTINCT FROM OLD.file_size_bytes
       OR NEW.pdf_version IS DISTINCT FROM OLD.pdf_version
       OR NEW.page_count IS DISTINCT FROM OLD.page_count
       OR NEW.official_published_on IS DISTINCT FROM OLD.official_published_on
       OR NEW.exam_year IS DISTINCT FROM OLD.exam_year
       OR NEW.exam_series IS DISTINCT FROM OLD.exam_series
       OR NEW.scope_basis IS DISTINCT FROM OLD.scope_basis
       OR NEW.declared_administrative_zones IS DISTINCT FROM OLD.declared_administrative_zones
       OR NEW.declared_territories IS DISTINCT FROM OLD.declared_territories
       OR NEW.scope_declaration IS DISTINCT FROM OLD.scope_declaration THEN
      RAISE EXCEPTION 'Cannot modify structural provenance or scope fields on linked evidence document %', OLD.id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_prevent_linked_evidence_doc_structural_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_prevent_linked_evidence_doc_structural_mutation
  BEFORE UPDATE ON public.grade_threshold_carry_forward_evidence_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_linked_evidence_doc_structural_mutation();

-- ─── 5. Row-Level Security and Privilege Hardening ───────────────────────────
ALTER TABLE public.grade_threshold_carry_forward_evidence_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_threshold_carry_forward_source_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_threshold_combination_carry_forward_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.grade_threshold_carry_forward_evidence_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.grade_threshold_carry_forward_source_mappings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.grade_threshold_combination_carry_forward_links FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
  ON public.grade_threshold_carry_forward_evidence_documents FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
  ON public.grade_threshold_carry_forward_source_mappings FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
  ON public.grade_threshold_combination_carry_forward_links FROM PUBLIC, anon, authenticated;

-- ─── 6. Non-Recursive Published Evidence View with Dynamic Validation ────────
CREATE VIEW public.published_grade_threshold_carry_forward_mappings
WITH (security_barrier = TRUE)
AS
SELECT
  ccl.id AS link_id,
  ccl.combination_id,
  ccl.token_id,
  c.canonical_key AS combination_canonical_key,
  c.atlas_route_id,
  p.id AS publication_id,
  s.code AS syllabus_code,
  p.exam_year AS sitting_exam_year,
  p.exam_series AS sitting_exam_series,
  sm.id AS source_mapping_id,
  sm.entry_option_code,
  sm.raw_carry_forward_token,
  sm.sitting_components,
  sm.carried_as_components,
  sm.applicable_paper_variants,
  sm.carried_exam_year,
  sm.carried_exam_series,
  sm.scope_basis,
  sm.scope_administrative_zones,
  sm.scope_territories,
  sm.scope_declaration,
  sm.page_locator,
  ed.id AS evidence_document_id,
  ed.document_title,
  ed.issuer AS document_issuer,
  ed.source_url AS document_source_url,
  ed.checksum_sha256 AS document_checksum_sha256,
  ed.official_published_on AS document_published_on
FROM public.grade_threshold_combination_carry_forward_links ccl
JOIN public.grade_threshold_combinations c ON c.id = ccl.combination_id
JOIN public.grade_threshold_combination_tokens t ON t.id = ccl.token_id AND t.combination_id = c.id
JOIN public.grade_threshold_publications p ON p.id = c.publication_id
JOIN public.subjects s ON s.id = p.subject_id
JOIN public.grade_threshold_carry_forward_source_mappings sm ON sm.id = ccl.source_mapping_id
JOIN public.grade_threshold_carry_forward_evidence_documents ed ON ed.id = sm.evidence_document_id
WHERE p.publication_status = 'published'
  AND p.is_active = TRUE
  AND sm.evidence_status = 'confirmed'
  AND ed.review_status = 'approved'
  AND ed.is_active = TRUE
  AND c.route_type = 'staged'
  AND t.token_kind = 'carry_forward'
  AND t.stage = 'as'
  AND t.raw_token = sm.raw_carry_forward_token
  AND s.code = sm.syllabus_code
  AND p.exam_year = sm.sitting_exam_year
  AND p.exam_series = sm.sitting_exam_series
  AND (
    SELECT ARRAY(
      SELECT t2.raw_token
      FROM public.grade_threshold_combination_tokens t2
      WHERE t2.combination_id = c.id
        AND t2.token_kind = 'component_variant'
      ORDER BY t2.token_position ASC
    )
  ) = sm.sitting_components;

ALTER VIEW public.published_grade_threshold_carry_forward_mappings OWNER TO postgres;

COMMENT ON VIEW public.published_grade_threshold_carry_forward_mappings IS
  'Published carry-forward evidence read boundary with dynamic threshold-side validation. Accessible to client roles; bypasses locked base tables non-recursively.';

GRANT SELECT ON public.published_grade_threshold_carry_forward_mappings TO anon, authenticated;

-- ─── 7. Planner View Integration ─────────────────────────────────────────────
-- Replaces public.published_grade_threshold_combinations (security_invoker = TRUE).
-- Preserves all existing columns, allocations, and route rules, but replaces staged
-- evidence predicates to require matching row in published_grade_threshold_carry_forward_mappings.
CREATE OR REPLACE VIEW public.published_grade_threshold_combinations
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
          OR NOT EXISTS (
            SELECT 1
            FROM public.published_grade_threshold_carry_forward_mappings m
            WHERE m.combination_id = c.id AND m.token_id = t.id
          )
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
           JOIN public.published_grade_threshold_carry_forward_mappings m
             ON m.combination_id = c.id AND m.token_id = t.id
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
            OR (t.token_kind = 'carry_forward' AND (
              t.stage <> 'as'
              OR t.carry_forward_mapping_status <> 'approved'
              OR NOT EXISTS (
                SELECT 1
                FROM public.published_grade_threshold_carry_forward_mappings m
                WHERE m.combination_id = c.id AND m.token_id = t.id
              )
            ))
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
  'Student-planner boundary: active published + reviewed eligible + mapped only. Staged routes require approved carry-forward mapping backed by active published evidence.';

GRANT SELECT ON public.published_grade_threshold_combinations TO anon, authenticated;

COMMIT;
