-- Migration: 20261116000036_seed_china_zone5_carry_forward_evidence.sql
-- Description: Milestone 5 Slice 2C Gate 2: Seed unreviewed, inactive China Zone 5 carry-forward evidence
--              document and 10 normalized source mappings for Mathematics (9709) and Further Mathematics (9231).
-- Prepared by: Slice 2C Gate 2 Implementer
-- Strict Boundaries:
--   - Does NOT approve or activate evidence records (review_status = 'unreviewed', is_active = FALSE).
--   - Does NOT authorize source mappings (evidence_status = 'unreviewed', authorized_by/at = NULL).
--   - Does NOT create bridge links.
--   - Does NOT promote planner eligibility.
--   - Does NOT mutate publications, combinations, tokens, weightings, routes, or user records.

BEGIN;

DO $$
DECLARE
  v_existing_doc_by_id UUID;
  v_existing_doc_by_checksum UUID;
  v_existing_doc_id UUID;
  v_doc_valid BOOLEAN;
  v_missing_mappings_count INT;
  v_unexpected_mappings_count INT;
  c_doc_id CONSTANT UUID := '00000036-0000-4000-8000-000000000001';
  c_doc_sha256 CONSTANT BYTEA := decode('80f88e04138b06e984c14a5292a0c298e654ca35806d3344043d9ad7de729fda', 'hex');
BEGIN
  -- ─── 1. Fail-closed Pre-checks & Exact Idempotency ───────────────────────────
  SELECT id INTO v_existing_doc_by_id
  FROM public.grade_threshold_carry_forward_evidence_documents
  WHERE id = c_doc_id;

  SELECT id INTO v_existing_doc_by_checksum
  FROM public.grade_threshold_carry_forward_evidence_documents
  WHERE checksum_sha256 = c_doc_sha256;

  IF v_existing_doc_by_id IS NOT NULL OR v_existing_doc_by_checksum IS NOT NULL THEN
    IF v_existing_doc_by_id IS DISTINCT FROM v_existing_doc_by_checksum THEN
      RAISE EXCEPTION 'Migration 036: Conflicting evidence document exists (ID: %, checksum match ID: %)',
        v_existing_doc_by_id, v_existing_doc_by_checksum
        USING ERRCODE = '23505';
    END IF;

    v_existing_doc_id := v_existing_doc_by_id;

    -- Validate all 17 non-timestamp fields of existing evidence document
    SELECT (
      d.id = c_doc_id
      AND d.document_title = 'Cambridge Guide to Making Entries: Including syllabus and option codes for June 2026 series'
      AND d.issuer = 'Cambridge University Press & Assessment'
      AND d.source_url = 'https://www.cambridgeinternational.org/Images/724211-guide-to-making-entries.pdf'
      AND d.checksum_sha256 = c_doc_sha256
      AND d.file_size_bytes = 2063398
      AND d.pdf_version = '1.6'
      AND d.page_count = 69
      AND d.official_published_on IS NULL
      AND d.exam_year = 2026
      AND d.exam_series = 'june'
      AND d.scope_basis = 'administrative_zone'
      AND d.declared_administrative_zones = ARRAY['5']::TEXT[]
      AND d.declared_territories = ARRAY['CN']::TEXT[]
      AND d.scope_declaration = 'China (administrative zone 5), June 2026 series'
      AND d.review_status = 'unreviewed'
      AND d.reviewed_by IS NULL
      AND d.reviewed_at IS NULL
      AND d.is_active = FALSE
    ) INTO v_doc_valid
    FROM public.grade_threshold_carry_forward_evidence_documents d
    WHERE d.id = v_existing_doc_id;

    IF NOT coalesce(v_doc_valid, FALSE) THEN
      RAISE EXCEPTION 'Migration 036: Existing evidence document has altered metadata, checksum, or lifecycle state'
        USING ERRCODE = 'P0001';
    END IF;

    -- Validate exact expected 10 mappings with bidirectional comparison on all non-timestamp fields
    WITH expected_mappings AS (
      SELECT * FROM (VALUES
        (
          '00000036-9709-4000-8000-000000000001'::UUID,
          c_doc_id,
          '9709'::TEXT,
          'DC'::TEXT,
          '82'::TEXT,
          ARRAY['35', '55']::TEXT[],
          ARRAY['15', '45']::TEXT[],
          ARRAY['15', '35', '45', '55']::TEXT[],
          2026::SMALLINT,
          'june'::TEXT,
          2025::SMALLINT,
          'june'::TEXT,
          'administrative_zone'::TEXT,
          ARRAY['5']::TEXT[],
          ARRAY['CN']::TEXT[],
          'China (administrative zone 5), June 2026 series'::TEXT,
          'Section 3.7, printed p. 50, PDF p. 50'::TEXT,
          'unreviewed'::TEXT,
          NULL::TEXT[],
          NULL::TEXT[],
          NULL::TEXT,
          NULL::TEXT,
          NULL::TIMESTAMPTZ
        ),
        (
          '00000036-9709-4000-8000-000000000002'::UUID,
          c_doc_id,
          '9709'::TEXT,
          'EC'::TEXT,
          '83'::TEXT,
          ARRAY['35', '45']::TEXT[],
          ARRAY['15', '55']::TEXT[],
          ARRAY['15', '35', '45', '55']::TEXT[],
          2026::SMALLINT,
          'june'::TEXT,
          2025::SMALLINT,
          'june'::TEXT,
          'administrative_zone'::TEXT,
          ARRAY['5']::TEXT[],
          ARRAY['CN']::TEXT[],
          'China (administrative zone 5), June 2026 series'::TEXT,
          'Section 3.7, printed p. 50, PDF p. 50'::TEXT,
          'unreviewed'::TEXT,
          NULL::TEXT[],
          NULL::TEXT[],
          NULL::TEXT,
          NULL::TEXT,
          NULL::TIMESTAMPTZ
        ),
        (
          '00000036-9709-4000-8000-000000000003'::UUID,
          c_doc_id,
          '9709'::TEXT,
          'GC'::TEXT,
          '83'::TEXT,
          ARRAY['35', '65']::TEXT[],
          ARRAY['15', '55']::TEXT[],
          ARRAY['15', '35', '55', '65']::TEXT[],
          2026::SMALLINT,
          'june'::TEXT,
          2025::SMALLINT,
          'june'::TEXT,
          'administrative_zone'::TEXT,
          ARRAY['5']::TEXT[],
          ARRAY['CN']::TEXT[],
          'China (administrative zone 5), June 2026 series'::TEXT,
          'Section 3.7, printed p. 50, PDF p. 50'::TEXT,
          'unreviewed'::TEXT,
          NULL::TEXT[],
          NULL::TEXT[],
          NULL::TEXT,
          NULL::TEXT,
          NULL::TIMESTAMPTZ
        ),
        (
          '00000036-9709-4000-8000-000000000004'::UUID,
          c_doc_id,
          '9709'::TEXT,
          'HC'::TEXT,
          '92'::TEXT,
          ARRAY['35', '55']::TEXT[],
          ARRAY['15', '45']::TEXT[],
          ARRAY['15', '35', '45', '55']::TEXT[],
          2026::SMALLINT,
          'june'::TEXT,
          2025::SMALLINT,
          'november'::TEXT,
          'administrative_zone'::TEXT,
          ARRAY['5']::TEXT[],
          ARRAY['CN']::TEXT[],
          'China (administrative zone 5), June 2026 series'::TEXT,
          'Section 3.7, printed p. 50, PDF p. 50'::TEXT,
          'unreviewed'::TEXT,
          NULL::TEXT[],
          NULL::TEXT[],
          NULL::TEXT,
          NULL::TEXT,
          NULL::TIMESTAMPTZ
        ),
        (
          '00000036-9709-4000-8000-000000000005'::UUID,
          c_doc_id,
          '9709'::TEXT,
          'IC'::TEXT,
          '93'::TEXT,
          ARRAY['35', '45']::TEXT[],
          ARRAY['15', '55']::TEXT[],
          ARRAY['15', '35', '45', '55']::TEXT[],
          2026::SMALLINT,
          'june'::TEXT,
          2025::SMALLINT,
          'november'::TEXT,
          'administrative_zone'::TEXT,
          ARRAY['5']::TEXT[],
          ARRAY['CN']::TEXT[],
          'China (administrative zone 5), June 2026 series'::TEXT,
          'Section 3.7, printed p. 50, PDF p. 50'::TEXT,
          'unreviewed'::TEXT,
          NULL::TEXT[],
          NULL::TEXT[],
          NULL::TEXT,
          NULL::TEXT,
          NULL::TIMESTAMPTZ
        ),
        (
          '00000036-9709-4000-8000-000000000006'::UUID,
          c_doc_id,
          '9709'::TEXT,
          'KC'::TEXT,
          '93'::TEXT,
          ARRAY['35', '65']::TEXT[],
          ARRAY['15', '55']::TEXT[],
          ARRAY['15', '35', '55', '65']::TEXT[],
          2026::SMALLINT,
          'june'::TEXT,
          2025::SMALLINT,
          'november'::TEXT,
          'administrative_zone'::TEXT,
          ARRAY['5']::TEXT[],
          ARRAY['CN']::TEXT[],
          'China (administrative zone 5), June 2026 series'::TEXT,
          'Section 3.7, printed p. 50, PDF p. 50'::TEXT,
          'unreviewed'::TEXT,
          NULL::TEXT[],
          NULL::TEXT[],
          NULL::TEXT,
          NULL::TEXT,
          NULL::TIMESTAMPTZ
        ),
        (
          '00000036-9231-4000-8000-000000000001'::UUID,
          c_doc_id,
          '9231'::TEXT,
          'BC'::TEXT,
          '62'::TEXT,
          ARRAY['24', '44']::TEXT[],
          ARRAY['14', '34']::TEXT[],
          ARRAY['14', '24', '34', '44']::TEXT[],
          2026::SMALLINT,
          'june'::TEXT,
          2025::SMALLINT,
          'june'::TEXT,
          'administrative_zone'::TEXT,
          ARRAY['5']::TEXT[],
          ARRAY['CN']::TEXT[],
          'China (administrative zone 5), June 2026 series'::TEXT,
          'Section 3.7, printed p. 46, PDF p. 46'::TEXT,
          'unreviewed'::TEXT,
          NULL::TEXT[],
          NULL::TEXT[],
          NULL::TEXT,
          NULL::TEXT,
          NULL::TIMESTAMPTZ
        ),
        (
          '00000036-9231-4000-8000-000000000002'::UUID,
          c_doc_id,
          '9231'::TEXT,
          'CC'::TEXT,
          '63'::TEXT,
          ARRAY['24', '34']::TEXT[],
          ARRAY['14', '44']::TEXT[],
          ARRAY['14', '24', '34', '44']::TEXT[],
          2026::SMALLINT,
          'june'::TEXT,
          2025::SMALLINT,
          'june'::TEXT,
          'administrative_zone'::TEXT,
          ARRAY['5']::TEXT[],
          ARRAY['CN']::TEXT[],
          'China (administrative zone 5), June 2026 series'::TEXT,
          'Section 3.7, printed p. 46, PDF p. 46'::TEXT,
          'unreviewed'::TEXT,
          NULL::TEXT[],
          NULL::TEXT[],
          NULL::TEXT,
          NULL::TEXT,
          NULL::TIMESTAMPTZ
        ),
        (
          '00000036-9231-4000-8000-000000000003'::UUID,
          c_doc_id,
          '9231'::TEXT,
          'DC'::TEXT,
          '72'::TEXT,
          ARRAY['24', '44']::TEXT[],
          ARRAY['14', '34']::TEXT[],
          ARRAY['14', '24', '34', '44']::TEXT[],
          2026::SMALLINT,
          'june'::TEXT,
          2025::SMALLINT,
          'november'::TEXT,
          'administrative_zone'::TEXT,
          ARRAY['5']::TEXT[],
          ARRAY['CN']::TEXT[],
          'China (administrative zone 5), June 2026 series'::TEXT,
          'Section 3.7, printed p. 46, PDF p. 46'::TEXT,
          'unreviewed'::TEXT,
          NULL::TEXT[],
          NULL::TEXT[],
          NULL::TEXT,
          NULL::TEXT,
          NULL::TIMESTAMPTZ
        ),
        (
          '00000036-9231-4000-8000-000000000004'::UUID,
          c_doc_id,
          '9231'::TEXT,
          'EC'::TEXT,
          '73'::TEXT,
          ARRAY['24', '34']::TEXT[],
          ARRAY['14', '44']::TEXT[],
          ARRAY['14', '24', '34', '44']::TEXT[],
          2026::SMALLINT,
          'june'::TEXT,
          2025::SMALLINT,
          'november'::TEXT,
          'administrative_zone'::TEXT,
          ARRAY['5']::TEXT[],
          ARRAY['CN']::TEXT[],
          'China (administrative zone 5), June 2026 series'::TEXT,
          'Section 3.7, printed p. 46, PDF p. 46'::TEXT,
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
        id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
        sitting_components, carried_as_components, applicable_paper_variants,
        sitting_exam_year, sitting_exam_series, carried_exam_year, carried_exam_series,
        scope_basis, scope_administrative_zones, scope_territories, scope_declaration,
        page_locator, evidence_status, unresolved_reasons, ambiguity_reasons, rejection_reason,
        authorized_by, authorized_at
      FROM public.grade_threshold_carry_forward_source_mappings
      WHERE evidence_document_id = c_doc_id
         OR id IN (SELECT id FROM expected_mappings)
    ),
    diff_missing AS (
      SELECT * FROM expected_mappings
      EXCEPT
      SELECT * FROM actual_mappings
    ),
    diff_unexpected AS (
      SELECT * FROM actual_mappings
      EXCEPT
      SELECT * FROM expected_mappings
    )
    SELECT
      (SELECT count(*) FROM diff_missing),
      (SELECT count(*) FROM diff_unexpected)
    INTO v_missing_mappings_count, v_unexpected_mappings_count;

    IF v_missing_mappings_count = 0 AND v_unexpected_mappings_count = 0 THEN
      RAISE NOTICE 'Migration 036: China Zone 5 evidence document and all 10 source mappings already exist with exact expected metadata and lifecycle state. Safe idempotent no-op.';
      RETURN;
    ELSE
      RAISE EXCEPTION 'Migration 036: Pre-existing China Zone 5 source mappings differ from expected seed state (% missing/altered expected, % unexpected/altered actual)',
        v_missing_mappings_count, v_unexpected_mappings_count
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ─── 2. Fail-closed Check for Orphaned Mapping Rows ─────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.grade_threshold_carry_forward_source_mappings
    WHERE evidence_document_id = c_doc_id
       OR id IN (
         '00000036-9709-4000-8000-000000000001',
         '00000036-9709-4000-8000-000000000002',
         '00000036-9709-4000-8000-000000000003',
         '00000036-9709-4000-8000-000000000004',
         '00000036-9709-4000-8000-000000000005',
         '00000036-9709-4000-8000-000000000006',
         '00000036-9231-4000-8000-000000000001',
         '00000036-9231-4000-8000-000000000002',
         '00000036-9231-4000-8000-000000000003',
         '00000036-9231-4000-8000-000000000004'
       )
  ) THEN
    RAISE EXCEPTION 'Migration 036: Orphaned or conflicting source mappings exist without target document'
      USING ERRCODE = 'P0001';
  END IF;

  -- ─── 3. Insert Inactive Unreviewed Evidence Document ────────────────────────
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    id,
    document_title,
    issuer,
    source_url,
    checksum_sha256,
    file_size_bytes,
    pdf_version,
    page_count,
    official_published_on,
    exam_year,
    exam_series,
    scope_basis,
    declared_administrative_zones,
    declared_territories,
    scope_declaration,
    review_status,
    reviewed_by,
    reviewed_at,
    is_active
  ) VALUES (
    c_doc_id,
    'Cambridge Guide to Making Entries: Including syllabus and option codes for June 2026 series',
    'Cambridge University Press & Assessment',
    'https://www.cambridgeinternational.org/Images/724211-guide-to-making-entries.pdf',
    c_doc_sha256,
    2063398,
    '1.6',
    69,
    NULL,
    2026,
    'june',
    'administrative_zone',
    ARRAY['5']::TEXT[],
    ARRAY['CN']::TEXT[],
    'China (administrative zone 5), June 2026 series',
    'unreviewed',
    NULL,
    NULL,
    FALSE
  );

  -- ─── 4. Insert 10 Unreviewed Source Mappings ────────────────────────────────
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
    evidence_status,
    unresolved_reasons,
    ambiguity_reasons,
    rejection_reason,
    authorized_by,
    authorized_at
  ) VALUES
    -- ── Mathematics 9709 (June 2025 carried AS) ──
    (
      '00000036-9709-4000-8000-000000000001',
      c_doc_id,
      '9709',
      'DC',
      '82',
      ARRAY['35', '55']::TEXT[],
      ARRAY['15', '45']::TEXT[],
      ARRAY['15', '35', '45', '55']::TEXT[],
      2026,
      'june',
      2025,
      'june',
      'administrative_zone',
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series',
      'Section 3.7, printed p. 50, PDF p. 50',
      'unreviewed',
      NULL, NULL, NULL,
      NULL, NULL
    ),
    (
      '00000036-9709-4000-8000-000000000002',
      c_doc_id,
      '9709',
      'EC',
      '83',
      ARRAY['35', '45']::TEXT[],
      ARRAY['15', '55']::TEXT[],
      ARRAY['15', '35', '45', '55']::TEXT[],
      2026,
      'june',
      2025,
      'june',
      'administrative_zone',
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series',
      'Section 3.7, printed p. 50, PDF p. 50',
      'unreviewed',
      NULL, NULL, NULL,
      NULL, NULL
    ),
    (
      '00000036-9709-4000-8000-000000000003',
      c_doc_id,
      '9709',
      'GC',
      '83',
      ARRAY['35', '65']::TEXT[],
      ARRAY['15', '55']::TEXT[],
      ARRAY['15', '35', '55', '65']::TEXT[],
      2026,
      'june',
      2025,
      'june',
      'administrative_zone',
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series',
      'Section 3.7, printed p. 50, PDF p. 50',
      'unreviewed',
      NULL, NULL, NULL,
      NULL, NULL
    ),

    -- ── Mathematics 9709 (November 2025 carried AS) ──
    (
      '00000036-9709-4000-8000-000000000004',
      c_doc_id,
      '9709',
      'HC',
      '92',
      ARRAY['35', '55']::TEXT[],
      ARRAY['15', '45']::TEXT[],
      ARRAY['15', '35', '45', '55']::TEXT[],
      2026,
      'june',
      2025,
      'november',
      'administrative_zone',
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series',
      'Section 3.7, printed p. 50, PDF p. 50',
      'unreviewed',
      NULL, NULL, NULL,
      NULL, NULL
    ),
    (
      '00000036-9709-4000-8000-000000000005',
      c_doc_id,
      '9709',
      'IC',
      '93',
      ARRAY['35', '45']::TEXT[],
      ARRAY['15', '55']::TEXT[],
      ARRAY['15', '35', '45', '55']::TEXT[],
      2026,
      'june',
      2025,
      'november',
      'administrative_zone',
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series',
      'Section 3.7, printed p. 50, PDF p. 50',
      'unreviewed',
      NULL, NULL, NULL,
      NULL, NULL
    ),
    (
      '00000036-9709-4000-8000-000000000006',
      c_doc_id,
      '9709',
      'KC',
      '93',
      ARRAY['35', '65']::TEXT[],
      ARRAY['15', '55']::TEXT[],
      ARRAY['15', '35', '55', '65']::TEXT[],
      2026,
      'june',
      2025,
      'november',
      'administrative_zone',
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series',
      'Section 3.7, printed p. 50, PDF p. 50',
      'unreviewed',
      NULL, NULL, NULL,
      NULL, NULL
    ),

    -- ── Further Mathematics 9231 (June 2025 carried AS) ──
    (
      '00000036-9231-4000-8000-000000000001',
      c_doc_id,
      '9231',
      'BC',
      '62',
      ARRAY['24', '44']::TEXT[],
      ARRAY['14', '34']::TEXT[],
      ARRAY['14', '24', '34', '44']::TEXT[],
      2026,
      'june',
      2025,
      'june',
      'administrative_zone',
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series',
      'Section 3.7, printed p. 46, PDF p. 46',
      'unreviewed',
      NULL, NULL, NULL,
      NULL, NULL
    ),
    (
      '00000036-9231-4000-8000-000000000002',
      c_doc_id,
      '9231',
      'CC',
      '63',
      ARRAY['24', '34']::TEXT[],
      ARRAY['14', '44']::TEXT[],
      ARRAY['14', '24', '34', '44']::TEXT[],
      2026,
      'june',
      2025,
      'june',
      'administrative_zone',
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series',
      'Section 3.7, printed p. 46, PDF p. 46',
      'unreviewed',
      NULL, NULL, NULL,
      NULL, NULL
    ),

    -- ── Further Mathematics 9231 (November 2025 carried AS) ──
    (
      '00000036-9231-4000-8000-000000000003',
      c_doc_id,
      '9231',
      'DC',
      '72',
      ARRAY['24', '44']::TEXT[],
      ARRAY['14', '34']::TEXT[],
      ARRAY['14', '24', '34', '44']::TEXT[],
      2026,
      'june',
      2025,
      'november',
      'administrative_zone',
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series',
      'Section 3.7, printed p. 46, PDF p. 46',
      'unreviewed',
      NULL, NULL, NULL,
      NULL, NULL
    ),
    (
      '00000036-9231-4000-8000-000000000004',
      c_doc_id,
      '9231',
      'EC',
      '73',
      ARRAY['24', '34']::TEXT[],
      ARRAY['14', '44']::TEXT[],
      ARRAY['14', '24', '34', '44']::TEXT[],
      2026,
      'june',
      2025,
      'november',
      'administrative_zone',
      ARRAY['5']::TEXT[],
      ARRAY['CN']::TEXT[],
      'China (administrative zone 5), June 2026 series',
      'Section 3.7, printed p. 46, PDF p. 46',
      'unreviewed',
      NULL, NULL, NULL,
      NULL, NULL
    );

  RAISE NOTICE 'Migration 036 (Slice 2C Gate 2): Successfully seeded China Zone 5 evidence document and 10 unreviewed source mappings.';
END;
$$;

COMMIT;
