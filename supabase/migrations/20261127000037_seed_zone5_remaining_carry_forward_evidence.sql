-- Migration: 20261127000037_seed_zone5_remaining_carry_forward_evidence.sql
-- Description: Milestone 5 v1.5.0: Seed the remaining 10 unreviewed, unauthorized China Zone 5
--              carry-forward source mappings for Chemistry (9701), Physics (9702), and
--              Computer Science (9618) referencing the Migration 036 evidence document.
-- Strict Boundaries:
--   - Does NOT approve or activate the evidence document.
--   - Does NOT authorize source mappings (evidence_status = 'unreviewed', authorized_by/at = NULL).
--   - Does NOT create bridge links or promote planner eligibility.
--   - Does NOT mutate publications, combinations, tokens, weightings, routes, or user records.

BEGIN;

DO $$
DECLARE
  v_existing_doc_id UUID;
  v_doc_sha_valid BOOLEAN;
  v_missing_mappings_count INT;
  v_unexpected_mappings_count INT;
  v_existing_count INT;
  c_doc_id CONSTANT UUID := '00000036-0000-4000-8000-000000000001';
  c_doc_sha256 CONSTANT BYTEA := decode('80f88e04138b06e984c14a5292a0c298e654ca35806d3344043d9ad7de729fda', 'hex');
BEGIN
  -- ─── 1. Verify Migration 036 Evidence Document Exists with Exact Checksum ────
  SELECT id INTO v_existing_doc_id
  FROM public.grade_threshold_carry_forward_evidence_documents
  WHERE id = c_doc_id;

  IF v_existing_doc_id IS NULL THEN
    RAISE EXCEPTION 'Migration 037: Required Migration 036 evidence document (%) is missing', c_doc_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT (
    d.checksum_sha256 = c_doc_sha256
    AND d.exam_year = 2026
    AND d.exam_series = 'june'
    AND d.scope_basis = 'administrative_zone'
    AND d.declared_administrative_zones = ARRAY['5']::TEXT[]
    AND d.declared_territories = ARRAY['CN']::TEXT[]
  ) INTO v_doc_sha_valid
  FROM public.grade_threshold_carry_forward_evidence_documents d
  WHERE d.id = c_doc_id;

  IF NOT coalesce(v_doc_sha_valid, FALSE) THEN
    RAISE EXCEPTION 'Migration 037: Migration 036 evidence document (%) failed integrity/scope check', c_doc_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ─── 2. Exact Idempotency vs Conflict Check for the 10 New Mappings ──────────
  WITH expected_mappings AS (
    SELECT * FROM (VALUES
      (
        '00000037-9701-4000-8000-000000000001'::UUID,
        c_doc_id,
        '9701'::TEXT,
        'BC'::TEXT,
        '62'::TEXT,
        ARRAY['44', '54']::TEXT[],
        ARRAY['14', '24', '37']::TEXT[],
        ARRAY['14', '24', '37', '44', '54']::TEXT[],
        2026::SMALLINT,
        'june'::TEXT,
        2025::SMALLINT,
        'june'::TEXT,
        'administrative_zone'::TEXT,
        ARRAY['5']::TEXT[],
        ARRAY['CN']::TEXT[],
        'China (administrative zone 5), June 2026 series'::TEXT,
        'Section 3.7, printed p. 41, PDF p. 41'::TEXT,
        'unreviewed'::TEXT,
        NULL::TEXT[],
        NULL::TEXT[],
        NULL::TEXT,
        NULL::TEXT,
        NULL::TIMESTAMPTZ
      ),
      (
        '00000037-9701-4000-8000-000000000002'::UUID,
        c_doc_id,
        '9701'::TEXT,
        'BC'::TEXT,
        '63'::TEXT,
        ARRAY['44', '54']::TEXT[],
        ARRAY['14', '24', '38']::TEXT[],
        ARRAY['14', '24', '38', '44', '54']::TEXT[],
        2026::SMALLINT,
        'june'::TEXT,
        2025::SMALLINT,
        'june'::TEXT,
        'administrative_zone'::TEXT,
        ARRAY['5']::TEXT[],
        ARRAY['CN']::TEXT[],
        'China (administrative zone 5), June 2026 series'::TEXT,
        'Section 3.7, printed p. 41, PDF p. 41'::TEXT,
        'unreviewed'::TEXT,
        NULL::TEXT[],
        NULL::TEXT[],
        NULL::TEXT,
        NULL::TEXT,
        NULL::TIMESTAMPTZ
      ),
      (
        '00000037-9701-4000-8000-000000000003'::UUID,
        c_doc_id,
        '9701'::TEXT,
        'CC'::TEXT,
        '72'::TEXT,
        ARRAY['44', '54']::TEXT[],
        ARRAY['14', '24', '37']::TEXT[],
        ARRAY['14', '24', '37', '44', '54']::TEXT[],
        2026::SMALLINT,
        'june'::TEXT,
        2025::SMALLINT,
        'november'::TEXT,
        'administrative_zone'::TEXT,
        ARRAY['5']::TEXT[],
        ARRAY['CN']::TEXT[],
        'China (administrative zone 5), June 2026 series'::TEXT,
        'Section 3.7, printed p. 41, PDF p. 41'::TEXT,
        'unreviewed'::TEXT,
        NULL::TEXT[],
        NULL::TEXT[],
        NULL::TEXT,
        NULL::TEXT,
        NULL::TIMESTAMPTZ
      ),
      (
        '00000037-9701-4000-8000-000000000004'::UUID,
        c_doc_id,
        '9701'::TEXT,
        'CC'::TEXT,
        '73'::TEXT,
        ARRAY['44', '54']::TEXT[],
        ARRAY['14', '24', '38']::TEXT[],
        ARRAY['14', '24', '38', '44', '54']::TEXT[],
        2026::SMALLINT,
        'june'::TEXT,
        2025::SMALLINT,
        'november'::TEXT,
        'administrative_zone'::TEXT,
        ARRAY['5']::TEXT[],
        ARRAY['CN']::TEXT[],
        'China (administrative zone 5), June 2026 series'::TEXT,
        'Section 3.7, printed p. 41, PDF p. 41'::TEXT,
        'unreviewed'::TEXT,
        NULL::TEXT[],
        NULL::TEXT[],
        NULL::TEXT,
        NULL::TEXT,
        NULL::TIMESTAMPTZ
      ),
      (
        '00000037-9702-4000-8000-000000000001'::UUID,
        c_doc_id,
        '9702'::TEXT,
        'BC'::TEXT,
        '62'::TEXT,
        ARRAY['44', '54']::TEXT[],
        ARRAY['14', '24', '37']::TEXT[],
        ARRAY['14', '24', '37', '44', '54']::TEXT[],
        2026::SMALLINT,
        'june'::TEXT,
        2025::SMALLINT,
        'june'::TEXT,
        'administrative_zone'::TEXT,
        ARRAY['5']::TEXT[],
        ARRAY['CN']::TEXT[],
        'China (administrative zone 5), June 2026 series'::TEXT,
        'Section 3.7, printed p. 52, PDF p. 52'::TEXT,
        'unreviewed'::TEXT,
        NULL::TEXT[],
        NULL::TEXT[],
        NULL::TEXT,
        NULL::TEXT,
        NULL::TIMESTAMPTZ
      ),
      (
        '00000037-9702-4000-8000-000000000002'::UUID,
        c_doc_id,
        '9702'::TEXT,
        'BC'::TEXT,
        '63'::TEXT,
        ARRAY['44', '54']::TEXT[],
        ARRAY['14', '24', '38']::TEXT[],
        ARRAY['14', '24', '38', '44', '54']::TEXT[],
        2026::SMALLINT,
        'june'::TEXT,
        2025::SMALLINT,
        'june'::TEXT,
        'administrative_zone'::TEXT,
        ARRAY['5']::TEXT[],
        ARRAY['CN']::TEXT[],
        'China (administrative zone 5), June 2026 series'::TEXT,
        'Section 3.7, printed p. 52, PDF p. 52'::TEXT,
        'unreviewed'::TEXT,
        NULL::TEXT[],
        NULL::TEXT[],
        NULL::TEXT,
        NULL::TEXT,
        NULL::TIMESTAMPTZ
      ),
      (
        '00000037-9702-4000-8000-000000000003'::UUID,
        c_doc_id,
        '9702'::TEXT,
        'CC'::TEXT,
        '72'::TEXT,
        ARRAY['44', '54']::TEXT[],
        ARRAY['14', '24', '37']::TEXT[],
        ARRAY['14', '24', '37', '44', '54']::TEXT[],
        2026::SMALLINT,
        'june'::TEXT,
        2025::SMALLINT,
        'november'::TEXT,
        'administrative_zone'::TEXT,
        ARRAY['5']::TEXT[],
        ARRAY['CN']::TEXT[],
        'China (administrative zone 5), June 2026 series'::TEXT,
        'Section 3.7, printed p. 52, PDF p. 52'::TEXT,
        'unreviewed'::TEXT,
        NULL::TEXT[],
        NULL::TEXT[],
        NULL::TEXT,
        NULL::TEXT,
        NULL::TIMESTAMPTZ
      ),
      (
        '00000037-9702-4000-8000-000000000004'::UUID,
        c_doc_id,
        '9702'::TEXT,
        'CC'::TEXT,
        '73'::TEXT,
        ARRAY['44', '54']::TEXT[],
        ARRAY['14', '24', '38']::TEXT[],
        ARRAY['14', '24', '38', '44', '54']::TEXT[],
        2026::SMALLINT,
        'june'::TEXT,
        2025::SMALLINT,
        'november'::TEXT,
        'administrative_zone'::TEXT,
        ARRAY['5']::TEXT[],
        ARRAY['CN']::TEXT[],
        'China (administrative zone 5), June 2026 series'::TEXT,
        'Section 3.7, printed p. 52, PDF p. 52'::TEXT,
        'unreviewed'::TEXT,
        NULL::TEXT[],
        NULL::TEXT[],
        NULL::TEXT,
        NULL::TEXT,
        NULL::TIMESTAMPTZ
      ),
      (
        '00000037-9618-4000-8000-000000000001'::UUID,
        c_doc_id,
        '9618'::TEXT,
        'BZ'::TEXT,
        '89'::TEXT,
        ARRAY['33', '43']::TEXT[],
        ARRAY['13', '23']::TEXT[],
        ARRAY['13', '23', '33', '43']::TEXT[],
        2026::SMALLINT,
        'june'::TEXT,
        2025::SMALLINT,
        'june'::TEXT,
        'administrative_zone'::TEXT,
        ARRAY['5']::TEXT[],
        ARRAY['CN']::TEXT[],
        'China (administrative zone 5), June 2026 series'::TEXT,
        'Section 3.7, printed p. 42, PDF p. 42'::TEXT,
        'unreviewed'::TEXT,
        NULL::TEXT[],
        NULL::TEXT[],
        NULL::TEXT,
        NULL::TEXT,
        NULL::TIMESTAMPTZ
      ),
      (
        '00000037-9618-4000-8000-000000000002'::UUID,
        c_doc_id,
        '9618'::TEXT,
        'CU'::TEXT,
        '98'::TEXT,
        ARRAY['33', '43']::TEXT[],
        ARRAY['12', '22']::TEXT[],
        ARRAY['12', '22', '33', '43']::TEXT[],
        2026::SMALLINT,
        'june'::TEXT,
        2025::SMALLINT,
        'november'::TEXT,
        'administrative_zone'::TEXT,
        ARRAY['5']::TEXT[],
        ARRAY['CN']::TEXT[],
        'China (administrative zone 5), June 2026 series'::TEXT,
        'Section 3.7, printed p. 42, PDF p. 42'::TEXT,
        'unreviewed'::TEXT,
        NULL::TEXT[],
        NULL::TEXT[],
        NULL::TEXT,
        NULL::TEXT,
        NULL::TIMESTAMPTZ
      )
    ) AS t(
      id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
      sitting_components, carried_as_components, applicable_paper_variants,
      sitting_exam_year, sitting_exam_series, carried_exam_year, carried_exam_series,
      scope_basis, scope_administrative_zones, scope_territories, scope_declaration,
      page_locator, evidence_status, unresolved_reasons, ambiguity_reasons, rejection_reason,
      authorized_by, authorized_at
    )
  ),
  actual_mappings AS (
    SELECT
      m.id, m.evidence_document_id, m.syllabus_code, m.entry_option_code, m.raw_carry_forward_token,
      m.sitting_components, m.carried_as_components, m.applicable_paper_variants,
      m.sitting_exam_year, m.sitting_exam_series, m.carried_exam_year, m.carried_exam_series,
      m.scope_basis, m.scope_administrative_zones, m.scope_territories, m.scope_declaration,
      m.page_locator, m.unresolved_reasons, m.ambiguity_reasons, m.rejection_reason
    FROM public.grade_threshold_carry_forward_source_mappings m
    WHERE m.id IN (SELECT id FROM expected_mappings)
       OR (
         m.evidence_document_id = c_doc_id
         AND m.syllabus_code IN ('9701', '9702', '9618')
       )
  ),
  expected_material AS (
    SELECT
      id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
      sitting_components, carried_as_components, applicable_paper_variants,
      sitting_exam_year, sitting_exam_series, carried_exam_year, carried_exam_series,
      scope_basis, scope_administrative_zones, scope_territories, scope_declaration,
      page_locator, unresolved_reasons, ambiguity_reasons, rejection_reason
    FROM expected_mappings
  ),
  diff_missing AS (
    SELECT * FROM expected_material
    EXCEPT
    SELECT * FROM actual_mappings
  ),
  diff_unexpected AS (
    SELECT * FROM actual_mappings
    EXCEPT
    SELECT * FROM expected_material
  ),
  invalid_lifecycle AS (
    SELECT m.id
    FROM public.grade_threshold_carry_forward_source_mappings m
    WHERE m.id IN (SELECT id FROM expected_mappings)
      AND NOT (
        (m.evidence_status = 'unreviewed' AND m.authorized_by IS NULL AND m.authorized_at IS NULL)
        OR
        (m.evidence_status = 'confirmed' AND m.authorized_by IS NOT NULL AND m.authorized_at IS NOT NULL)
      )
  )
  SELECT
    (SELECT count(*) FROM actual_mappings),
    (SELECT count(*) FROM diff_missing),
    (SELECT count(*) FROM diff_unexpected) + (SELECT count(*) FROM invalid_lifecycle)
  INTO v_existing_count, v_missing_mappings_count, v_unexpected_mappings_count;

  IF v_existing_count > 0 THEN
    IF v_missing_mappings_count > 0 OR v_unexpected_mappings_count > 0 THEN
      RAISE EXCEPTION 'Migration 037: Existing 9701/9702/9618 Zone 5 mappings conflict with expected records (missing: %, unexpected: %)',
        v_missing_mappings_count, v_unexpected_mappings_count
        USING ERRCODE = '23505';
    END IF;
    -- Exact idempotent match: no-op
    RETURN;
  END IF;

  -- ─── 3. Insert the 10 Unreviewed, Unauthorized Zone 5 Mappings ─────────────
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    id,
    evidence_document_id,
    syllabus_code,
    entry_option_code,
    raw_carry_forward_token,
    sitting_components,
    carried_as_components,
    applicable_paper_variants,
    sitting_exam_year,
    sitting_exam_series,
    carried_exam_year,
    carried_exam_series,
    scope_basis,
    scope_administrative_zones,
    scope_territories,
    scope_declaration,
    page_locator,
    evidence_status
  ) VALUES
    ('00000037-9701-4000-8000-000000000001', c_doc_id, '9701', 'BC', '62', ARRAY['44', '54'], ARRAY['14', '24', '37'], ARRAY['14', '24', '37', '44', '54'], 2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China (administrative zone 5), June 2026 series', 'Section 3.7, printed p. 41, PDF p. 41', 'unreviewed'),
    ('00000037-9701-4000-8000-000000000002', c_doc_id, '9701', 'BC', '63', ARRAY['44', '54'], ARRAY['14', '24', '38'], ARRAY['14', '24', '38', '44', '54'], 2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China (administrative zone 5), June 2026 series', 'Section 3.7, printed p. 41, PDF p. 41', 'unreviewed'),
    ('00000037-9701-4000-8000-000000000003', c_doc_id, '9701', 'CC', '72', ARRAY['44', '54'], ARRAY['14', '24', '37'], ARRAY['14', '24', '37', '44', '54'], 2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China (administrative zone 5), June 2026 series', 'Section 3.7, printed p. 41, PDF p. 41', 'unreviewed'),
    ('00000037-9701-4000-8000-000000000004', c_doc_id, '9701', 'CC', '73', ARRAY['44', '54'], ARRAY['14', '24', '38'], ARRAY['14', '24', '38', '44', '54'], 2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China (administrative zone 5), June 2026 series', 'Section 3.7, printed p. 41, PDF p. 41', 'unreviewed'),
    ('00000037-9702-4000-8000-000000000001', c_doc_id, '9702', 'BC', '62', ARRAY['44', '54'], ARRAY['14', '24', '37'], ARRAY['14', '24', '37', '44', '54'], 2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China (administrative zone 5), June 2026 series', 'Section 3.7, printed p. 52, PDF p. 52', 'unreviewed'),
    ('00000037-9702-4000-8000-000000000002', c_doc_id, '9702', 'BC', '63', ARRAY['44', '54'], ARRAY['14', '24', '38'], ARRAY['14', '24', '38', '44', '54'], 2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China (administrative zone 5), June 2026 series', 'Section 3.7, printed p. 52, PDF p. 52', 'unreviewed'),
    ('00000037-9702-4000-8000-000000000003', c_doc_id, '9702', 'CC', '72', ARRAY['44', '54'], ARRAY['14', '24', '37'], ARRAY['14', '24', '37', '44', '54'], 2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China (administrative zone 5), June 2026 series', 'Section 3.7, printed p. 52, PDF p. 52', 'unreviewed'),
    ('00000037-9702-4000-8000-000000000004', c_doc_id, '9702', 'CC', '73', ARRAY['44', '54'], ARRAY['14', '24', '38'], ARRAY['14', '24', '38', '44', '54'], 2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China (administrative zone 5), June 2026 series', 'Section 3.7, printed p. 52, PDF p. 52', 'unreviewed'),
    ('00000037-9618-4000-8000-000000000001', c_doc_id, '9618', 'BZ', '89', ARRAY['33', '43'], ARRAY['13', '23'],       ARRAY['13', '23', '33', '43'],       2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China (administrative zone 5), June 2026 series', 'Section 3.7, printed p. 42, PDF p. 42', 'unreviewed'),
    ('00000037-9618-4000-8000-000000000002', c_doc_id, '9618', 'CU', '98', ARRAY['33', '43'], ARRAY['12', '22'],       ARRAY['12', '22', '33', '43'],       2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China (administrative zone 5), June 2026 series', 'Section 3.7, printed p. 42, PDF p. 42', 'unreviewed');
END
$$;

COMMIT;
