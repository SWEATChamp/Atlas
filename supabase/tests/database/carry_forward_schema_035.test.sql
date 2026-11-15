-- =============================================================================
-- DATABASE TESTS: Carry-Forward Evidence Contracts & Gating (Migration 035)
--
-- File: supabase/tests/database/carry_forward_schema_035.test.sql
-- Run via: docker exec -i m5_gate1_final_pg psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/database/carry_forward_schema_035.test.sql
--
-- All fixtures and helper functions roll back cleanly; no fixture rows persist.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(137);

-- ─── Section 1: Series & Scope Check Constraints ─────────────────────────────

-- 1. Full series values enforced on evidence documents (abbreviations rejected)
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, scope_declaration
  ) VALUES (
    'Test Doc', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('1111111111111111111111111111111111111111111111111111111111111111', 'hex'),
    1000, '1.6', 50, 2026, 's', 'global', 'Global scope'
  )
  $$,
  '23514',
  NULL,
  '1. Abbreviated exam_series (s) is rejected on evidence documents'
);

SELECT lives_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    id, document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, scope_declaration
  ) VALUES (
    '11111111-1111-4111-8111-111111111111',
    'Test Doc', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('1111111111111111111111111111111111111111111111111111111111111111', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'global', 'Global scope'
  )
  $$,
  '2. Full exam_series (june) is accepted on evidence documents'
);

-- 3. Administrative-zone scope requires non-empty zones array
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, declared_administrative_zones, scope_declaration
  ) VALUES (
    'Zone Doc Bad', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('2222222222222222222222222222222222222222222222222222222222222222', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'administrative_zone', NULL, 'Zone scope'
  )
  $$,
  '23514',
  NULL,
  '3. administrative_zone scope rejects NULL declared_administrative_zones'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, declared_administrative_zones, scope_declaration
  ) VALUES (
    'Zone Doc Empty', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('2222222222222222222222222222222222222222222222222222222222222222', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'administrative_zone', '{}', 'Zone scope'
  )
  $$,
  '23514',
  NULL,
  '4. administrative_zone scope rejects empty array declared_administrative_zones'
);

-- 5. Territory scope requires non-empty territories array
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, declared_territories, scope_declaration
  ) VALUES (
    'Territory Doc Empty', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('3333333333333333333333333333333333333333333333333333333333333333', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'territory', '{}', 'Territory scope'
  )
  $$,
  '23514',
  NULL,
  '5. territory scope rejects empty array declared_territories'
);

-- 6. Global scope rejects non-null zones or territories
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, declared_administrative_zones, scope_declaration
  ) VALUES (
    'Global Doc Bad', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('4444444444444444444444444444444444444444444444444444444444444444', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'global', ARRAY['5'], 'Global scope'
  )
  $$,
  '23514',
  NULL,
  '6. global scope rejects non-null declared_administrative_zones'
);

-- 7. Zone 5 plus China restriction is representable
SELECT lives_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    id, document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis,
    declared_administrative_zones, declared_territories, scope_declaration,
    review_status, reviewed_by, reviewed_at, is_active
  ) VALUES (
    '22222222-2222-4222-8222-222222222222',
    'China Guide 2026', 'Cambridge Assessment International Education',
    'https://example.com/china_guide_2026.pdf',
    decode('5555555555555555555555555555555555555555555555555555555555555555', 'hex'),
    2063398, '1.6', 69, 2026, 'june', 'administrative_zone',
    ARRAY['5'], ARRAY['CN'], 'Administrative Zone 5 (China)',
    'approved', 'auditor@atlas.edu', NOW(), TRUE
  )
  $$,
  '7. Zone 5 plus China included-territory restriction is representable and accepted'
);

-- ─── Section 1b: Array Element Validation (Non-blank & Non-null) ─────────────

-- 8 & 9. declared_administrative_zones rejects null and blank elements
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, declared_administrative_zones, scope_declaration
  ) VALUES (
    'Zone Null Elem', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'administrative_zone', ARRAY['5', NULL]::text[], 'Zone scope'
  )
  $$,
  '23514',
  NULL,
  '8. declared_administrative_zones rejects array containing NULL element'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, declared_administrative_zones, scope_declaration
  ) VALUES (
    'Zone Blank Elem', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'administrative_zone', ARRAY['5', '   ']::text[], 'Zone scope'
  )
  $$,
  '23514',
  NULL,
  '9. declared_administrative_zones rejects array containing blank element'
);

-- 10 & 11. declared_territories rejects null and blank elements
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, declared_territories, scope_declaration
  ) VALUES (
    'Territory Null Elem', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'territory', ARRAY['CN', NULL]::text[], 'Territory scope'
  )
  $$,
  '23514',
  NULL,
  '10. declared_territories rejects array containing NULL element'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, declared_territories, scope_declaration
  ) VALUES (
    'Territory Blank Elem', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'territory', ARRAY['CN', '   ']::text[], 'Territory scope'
  )
  $$,
  '23514',
  NULL,
  '11. declared_territories rejects array containing blank element'
);

-- 12 & 13. sitting_components rejects null and blank elements
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', NULL]::text[], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 1'
  )
  $$,
  '23514',
  NULL,
  '12. sitting_components rejects array containing NULL element'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', '   ']::text[], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 1'
  )
  $$,
  '23514',
  NULL,
  '13. sitting_components rejects array containing blank element'
);

-- 14 & 15. carried_as_components rejects null and blank elements
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', '55'], ARRAY['15', NULL]::text[], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 1'
  )
  $$,
  '23514',
  NULL,
  '14. carried_as_components rejects array containing NULL element'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', '55'], ARRAY['15', '   ']::text[], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 1'
  )
  $$,
  '23514',
  NULL,
  '15. carried_as_components rejects array containing blank element'
);

-- 16 & 17. applicable_paper_variants rejects null and blank elements
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, applicable_paper_variants,
    sitting_exam_year, sitting_exam_series, carried_exam_year, carried_exam_series,
    scope_basis, scope_declaration, page_locator
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], ARRAY['1', NULL]::text[],
    2026, 'june', 2025, 'june', 'global', 'Global', 'p. 1'
  )
  $$,
  '23514',
  NULL,
  '16. applicable_paper_variants rejects array containing NULL element'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, applicable_paper_variants,
    sitting_exam_year, sitting_exam_series, carried_exam_year, carried_exam_series,
    scope_basis, scope_declaration, page_locator
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], ARRAY['1', '   ']::text[],
    2026, 'june', 2025, 'june', 'global', 'Global', 'p. 1'
  )
  $$,
  '23514',
  NULL,
  '17. applicable_paper_variants rejects array containing blank element'
);

-- 18 & 19. scope_administrative_zones rejects null and blank elements
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_administrative_zones,
    scope_declaration, page_locator
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'administrative_zone', ARRAY['5', NULL]::text[], 'Zone scope', 'p. 1'
  )
  $$,
  '23514',
  NULL,
  '18. scope_administrative_zones rejects array containing NULL element'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_administrative_zones,
    scope_declaration, page_locator
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'administrative_zone', ARRAY['5', '   ']::text[], 'Zone scope', 'p. 1'
  )
  $$,
  '23514',
  NULL,
  '19. scope_administrative_zones rejects array containing blank element'
);

-- 20 & 21. scope_territories rejects null and blank elements
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_territories,
    scope_declaration, page_locator
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'territory', ARRAY['CN', NULL]::text[], 'Territory scope', 'p. 1'
  )
  $$,
  '23514',
  NULL,
  '20. scope_territories rejects array containing NULL element'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_territories,
    scope_declaration, page_locator
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'territory', ARRAY['CN', '   ']::text[], 'Territory scope', 'p. 1'
  )
  $$,
  '23514',
  NULL,
  '21. scope_territories rejects array containing blank element'
);

-- 22 & 23. unresolved_reasons rejects null and blank elements
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, unresolved_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 1', 'unresolved', ARRAY['Reason 1', NULL]::text[]
  )
  $$,
  '23514',
  NULL,
  '22. unresolved_reasons rejects array containing NULL element'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, unresolved_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 1', 'unresolved', ARRAY['Reason 1', '   ']::text[]
  )
  $$,
  '23514',
  NULL,
  '23. unresolved_reasons rejects array containing blank element'
);

-- 24 & 25. ambiguity_reasons rejects null and blank elements
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, ambiguity_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 1', 'ambiguous', ARRAY['Ambiguity 1', NULL]::text[]
  )
  $$,
  '23514',
  NULL,
  '24. ambiguity_reasons rejects array containing NULL element'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, ambiguity_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'TX', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 1', 'ambiguous', ARRAY['Ambiguity 1', '   ']::text[]
  )
  $$,
  '23514',
  NULL,
  '25. ambiguity_reasons rejects array containing blank element'
);

-- 26. Valid non-empty applicable_paper_variants succeeds
SELECT lives_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, applicable_paper_variants,
    sitting_exam_year, sitting_exam_series, carried_exam_year, carried_exam_series,
    scope_basis, scope_declaration, page_locator, evidence_status
  ) VALUES (
    '33333333-3333-4333-8333-333333333391',
    '22222222-2222-4222-8222-222222222222', '9709', 'TA', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], ARRAY['1', '2'],
    2026, 'june', 2025, 'june', 'global', 'Global', 'p. 1', 'unreviewed'
  )
  $$,
  '26. Valid non-empty applicable_paper_variants succeeds'
);

-- 27. Valid non-empty unresolved_reasons succeeds
SELECT lives_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, unresolved_reasons
  ) VALUES (
    '33333333-3333-4333-8333-333333333392',
    '22222222-2222-4222-8222-222222222222', '9709', 'TB', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 1', 'unresolved', ARRAY['Valid unresolved investigation note']
  )
  $$,
  '27. Valid non-empty unresolved_reasons succeeds'
);

-- 28. Valid non-empty ambiguity_reasons succeeds
SELECT lives_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, ambiguity_reasons
  ) VALUES (
    '33333333-3333-4333-8333-333333333393',
    '22222222-2222-4222-8222-222222222222', '9709', 'TC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 1', 'ambiguous', ARRAY['Valid ambiguity explanation']
  )
  $$,
  '28. Valid non-empty ambiguity_reasons succeeds'
);

-- 29. Valid non-empty scope_territories succeeds
SELECT lives_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_territories,
    scope_declaration, page_locator, evidence_status
  ) VALUES (
    '33333333-3333-4333-8333-333333333394',
    '22222222-2222-4222-8222-222222222222', '9709', 'TD', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'territory', ARRAY['CN'], 'Territory CN', 'p. 1', 'unreviewed'
  )
  $$,
  '29. Valid non-empty scope_territories succeeds'
);

-- ─── Section 2: Lifecycle Exclusivity & Blank String Rejections ──────────────

-- Evidence Document Lifecycle Checks
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, scope_declaration,
    review_status, reviewed_by, reviewed_at
  ) VALUES (
    'Unreviewed with reviewer', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('1212121212121212121212121212121212121212121212121212121212121212', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'global', 'Global',
    'unreviewed', 'auditor@atlas.edu', NOW()
  )
  $$,
  '23514',
  NULL,
  '30. evidence doc unreviewed status with non-null reviewed_by is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, scope_declaration,
    review_status, is_active
  ) VALUES (
    'Unreviewed active', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('1313131313131313131313131313131313131313131313131313131313131313', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'global', 'Global',
    'unreviewed', TRUE
  )
  $$,
  '23514',
  NULL,
  '31. evidence doc unreviewed status with is_active = TRUE is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, scope_declaration,
    review_status, reviewed_by, reviewed_at, is_active
  ) VALUES (
    'Blank reviewer', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('1414141414141414141414141414141414141414141414141414141414141414', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'global', 'Global',
    'approved', '   ', NOW(), TRUE
  )
  $$,
  '23514',
  NULL,
  '32. evidence doc approved status with blank reviewed_by is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, scope_declaration,
    review_status, reviewed_by, reviewed_at, is_active
  ) VALUES (
    'Rejected active doc', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('1515151515151515151515151515151515151515151515151515151515151515', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'global', 'Global',
    'rejected', 'auditor@atlas.edu', NOW(), TRUE
  )
  $$,
  '23514',
  NULL,
  '33. evidence doc rejected status with is_active = TRUE is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, scope_declaration,
    review_status, reviewed_by, reviewed_at, is_active
  ) VALUES (
    'Rejected blank reviewer', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('1616161616161616161616161616161616161616161616161616161616161616', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'global', 'Global',
    'rejected', '   ', NOW(), FALSE
  )
  $$,
  '23514',
  NULL,
  '34. evidence doc rejected status with blank reviewed_by is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, scope_declaration
  ) VALUES (
    '   ', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('1717171717171717171717171717171717171717171717171717171717171717', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'global', 'Global'
  )
  $$,
  '23514',
  NULL,
  '35. evidence doc blank document_title is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, scope_declaration
  ) VALUES (
    'Doc Title', '   ', 'https://example.com/doc.pdf',
    decode('1818181818181818181818181818181818181818181818181818181818181818', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'global', 'Global'
  )
  $$,
  '23514',
  NULL,
  '36. evidence doc blank issuer is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, scope_declaration
  ) VALUES (
    'Doc Title', 'Cambridge Test', 'https://example.com/doc.pdf',
    decode('1919191919191919191919191919191919191919191919191919191919191919', 'hex'),
    1000, '1.6', 50, 2026, 'june', 'global', '   '
  )
  $$,
  '23514',
  NULL,
  '37. evidence doc blank scope_declaration is rejected'
);

-- Source Mapping Lifecycle & Mutual Exclusivity Checks
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, authorized_by, authorized_at
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'confirmed', NULL, NULL
  )
  $$,
  '23514',
  NULL,
  '38. source mapping confirmed status without authorized_by is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, authorized_by, authorized_at
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'confirmed', '   ', NOW()
  )
  $$,
  '23514',
  NULL,
  '39. source mapping confirmed status with blank authorized_by is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, authorized_by, authorized_at, rejection_reason
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'confirmed', 'auditor@atlas.edu', NOW(), 'Conflicting reason'
  )
  $$,
  '23514',
  NULL,
  '40. source mapping confirmed status with rejection_reason is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, authorized_by, authorized_at, unresolved_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'confirmed', 'auditor@atlas.edu', NOW(), ARRAY['Need check']
  )
  $$,
  '23514',
  NULL,
  '41. source mapping confirmed status with unresolved_reasons is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, authorized_by, authorized_at, ambiguity_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'confirmed', 'auditor@atlas.edu', NOW(), ARRAY['Ambiguous']
  )
  $$,
  '23514',
  NULL,
  '42. source mapping confirmed status with ambiguity_reasons is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, unresolved_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unresolved', NULL
  )
  $$,
  '23514',
  NULL,
  '43. source mapping unresolved status without unresolved_reasons is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, unresolved_reasons, authorized_by, authorized_at
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unresolved', ARRAY['Under investigation'], 'auditor@atlas.edu', NOW()
  )
  $$,
  '23514',
  NULL,
  '44. source mapping unresolved status with authorized_by is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, unresolved_reasons, rejection_reason
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unresolved', ARRAY['Under investigation'], 'Rejection text'
  )
  $$,
  '23514',
  NULL,
  '45. source mapping unresolved status with rejection_reason is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, unresolved_reasons, ambiguity_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unresolved', ARRAY['Under investigation'], ARRAY['Ambiguous']
  )
  $$,
  '23514',
  NULL,
  '46. source mapping unresolved status with ambiguity_reasons is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, ambiguity_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'ambiguous', NULL
  )
  $$,
  '23514',
  NULL,
  '47. source mapping ambiguous status without ambiguity_reasons is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, ambiguity_reasons, authorized_by, authorized_at
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'ambiguous', ARRAY['Multiple interpretations'], 'auditor@atlas.edu', NOW()
  )
  $$,
  '23514',
  NULL,
  '48. source mapping ambiguous status with authorized_by is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, ambiguity_reasons, rejection_reason
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'ambiguous', ARRAY['Multiple interpretations'], 'Rejection'
  )
  $$,
  '23514',
  NULL,
  '49. source mapping ambiguous status with rejection_reason is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, ambiguity_reasons, unresolved_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'ambiguous', ARRAY['Multiple interpretations'], ARRAY['Unresolved']
  )
  $$,
  '23514',
  NULL,
  '50. source mapping ambiguous status with unresolved_reasons is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, rejection_reason
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unsupported', NULL
  )
  $$,
  '23514',
  NULL,
  '51. source mapping unsupported status without rejection_reason is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, rejection_reason
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unsupported', '   '
  )
  $$,
  '23514',
  NULL,
  '52. source mapping unsupported status with blank rejection_reason is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, rejection_reason, authorized_by, authorized_at
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unsupported', 'Unsupported route', 'auditor@atlas.edu', NOW()
  )
  $$,
  '23514',
  NULL,
  '53. source mapping unsupported status with authorized_by is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, rejection_reason, unresolved_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unsupported', 'Unsupported route', ARRAY['Unresolved']
  )
  $$,
  '23514',
  NULL,
  '54. source mapping unsupported status with unresolved_reasons is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, rejection_reason, ambiguity_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unsupported', 'Unsupported route', ARRAY['Ambiguity']
  )
  $$,
  '23514',
  NULL,
  '55. source mapping unsupported status with ambiguity_reasons is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, rejection_reason
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'rejected', NULL
  )
  $$,
  '23514',
  NULL,
  '56. source mapping rejected status without rejection_reason is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, rejection_reason
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'rejected', '   '
  )
  $$,
  '23514',
  NULL,
  '57. source mapping rejected status with blank rejection_reason is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, rejection_reason, authorized_by, authorized_at
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'rejected', 'Invalid option', 'auditor@atlas.edu', NOW()
  )
  $$,
  '23514',
  NULL,
  '58. source mapping rejected status with authorized_by is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, rejection_reason, unresolved_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'rejected', 'Invalid option', ARRAY['Unresolved']
  )
  $$,
  '23514',
  NULL,
  '59. source mapping rejected status with unresolved_reasons is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, rejection_reason, ambiguity_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'rejected', 'Invalid option', ARRAY['Ambiguous']
  )
  $$,
  '23514',
  NULL,
  '60. source mapping rejected status with ambiguity_reasons is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, authorized_by, authorized_at
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unreviewed', 'auditor@atlas.edu', NOW()
  )
  $$,
  '23514',
  NULL,
  '61. source mapping unreviewed status with authorized_by is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, rejection_reason
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unreviewed', 'Some rejection'
  )
  $$,
  '23514',
  NULL,
  '62. source mapping unreviewed status with rejection_reason is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, unresolved_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unreviewed', ARRAY['Reason']
  )
  $$,
  '23514',
  NULL,
  '63. source mapping unreviewed status with unresolved_reasons is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status, ambiguity_reasons
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unreviewed', ARRAY['Ambiguity']
  )
  $$,
  '23514',
  NULL,
  '64. source mapping unreviewed status with ambiguity_reasons is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '   ',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', 'p. 50', 'unreviewed'
  )
  $$,
  '23514',
  NULL,
  '65. source mapping blank raw_carry_forward_token is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', '   ', 'p. 50', 'unreviewed'
  )
  $$,
  '23514',
  NULL,
  '66. source mapping blank scope_declaration is rejected'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator,
    evidence_status
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'global', 'Global', '   ', 'unreviewed'
  )
  $$,
  '23514',
  NULL,
  '67. source mapping blank page_locator is rejected'
);

-- 68. Cross-syllabus option codes and shared tokens coexist without collision
SELECT lives_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_administrative_zones,
    scope_territories, scope_declaration, page_locator, evidence_status,
    authorized_by, authorized_at
  ) VALUES (
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222', '9709', 'DC', '82',
    ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
    'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China Zone 5', 'p. 50',
    'confirmed', 'auditor@atlas.edu', NOW()
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '22222222-2222-4222-8222-222222222222', '9231', 'DC', '82',
    ARRAY['25', '45'], ARRAY['15', '35'], 2026, 'june', 2025, 'june',
    'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China Zone 5', 'p. 46',
    'confirmed', 'auditor@atlas.edu', NOW()
  )
  $$,
  '68. Mappings with identical option code (DC) and raw token (82) across syllabuses 9709 and 9231 coexist'
);

-- ─── Section 3: Seed Catalogue Data for Bridge Trigger Tests ─────────────────

INSERT INTO public.grade_threshold_import_runs (
  id, trigger_kind, parser_version, status, started_at, finished_at
) VALUES (
  '55555555-5555-4555-8555-555555555555', 'manual', '1.0.0', 'succeeded', NOW(), NOW()
);

INSERT INTO public.grade_threshold_publications (
  id, import_run_id, subject_id, exam_year, exam_series, official_index_url,
  official_pdf_url, source_checksum_sha256, publication_status, is_active, published_at
) VALUES (
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555',
  '07aa2f25-f47d-53a8-bbf7-2a3484fd5896', -- 9709
  2026, 'june', 'https://example.com/index.html',
  'https://example.com/9709_threshold.pdf',
  decode('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hex'),
  'published', TRUE, NOW()
);

INSERT INTO public.grade_threshold_component_variants (
  id, publication_id, subject_paper_id, component_code, raw_maximum_mark
) VALUES
  ('77777777-7777-4777-8777-777777777771', '66666666-6666-4666-8666-666666666666', '69ec93cb-e83f-5488-9ca1-0ed53ffa2503', '35', 75),
  ('77777777-7777-4777-8777-777777777772', '66666666-6666-4666-8666-666666666666', '5fb10590-88f6-5430-8311-b5d0f9d685c7', '55', 50);

INSERT INTO public.grade_threshold_combinations (
  id, publication_id, canonical_key, qualification_level, route_type,
  maximum_mark, weighting_basis, planner_eligibility, atlas_route_id
) VALUES (
  '88888888-8888-4888-8888-888888888888',
  '66666666-6666-4666-8666-666666666666',
  '9709-june-2026-staged-dc',
  'a_level', 'staged', 250, 'raw_total', 'eligible',
  '99578e02-66ae-53b0-9d67-ed86804a17a9'
);

INSERT INTO public.grade_threshold_weighting_sources (
  id, subject_id, document_year, exam_series, source_label, official_document_url,
  source_checksum_sha256, review_status, reviewed_by, reviewed_at
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '07aa2f25-f47d-53a8-bbf7-2a3484fd5896', 2026, 'june',
  '9709 Syllabus 2026', 'https://example.com/syllabus_9709.pdf',
  decode('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'hex'),
  'approved', 'auditor@atlas.edu', NOW()
);

INSERT INTO public.grade_threshold_weighting_entries (
  id, weighting_source_id, raw_token, token_kind, raw_maximum, weighted_maximum, official_weighting_factor, source_page
) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '35', 'component_variant', 75, 75, 1.0, 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55', 'component_variant', 50, 50, 1.0, 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '82', 'carry_forward', 125, 125, 1.0, 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '99', 'carry_forward', 125, 125, 1.0, 1);

INSERT INTO public.grade_threshold_combination_tokens (
  id, combination_id, token_position, raw_token, token_kind,
  resolved_component_variant_id, stage, maximum_mark, weighting_factor,
  weighting_entry_id, carry_forward_mapping_status, mapping_reviewed_by, mapping_reviewed_at
) VALUES
  ('99999999-9999-4999-8999-999999999991', '88888888-8888-4888-8888-888888888888', 1, '35', 'component_variant', '77777777-7777-4777-8777-777777777771', 'a2', 75, 1.0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', NULL, NULL, NULL),
  ('99999999-9999-4999-8999-999999999992', '88888888-8888-4888-8888-888888888888', 2, '55', 'component_variant', '77777777-7777-4777-8777-777777777772', 'a2', 50, 1.0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', NULL, NULL, NULL),
  ('99999999-9999-4999-8999-999999999993', '88888888-8888-4888-8888-888888888888', 3, '82', 'carry_forward', NULL, 'as', 125, 1.0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'approved', 'auditor@atlas.edu', NOW());

-- ─── Section 4: Bridge Trigger Validation Tests ───────────────────────────────

-- 69. Fully valid bridge link succeeds
SELECT lives_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    id, source_mapping_id, combination_id, token_id
  ) VALUES (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '33333333-3333-4333-8333-333333333333', -- 9709 mapping
    '88888888-8888-4888-8888-888888888888', -- 9709 combination
    '99999999-9999-4999-8999-999999999993'  -- token 82
  )
  $$,
  '69. Fully valid bridge link succeeds'
);

-- 70. Cross-subject links fail
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id, combination_id, token_id
  ) VALUES (
    '44444444-4444-4444-8444-444444444444', -- 9231 mapping
    '88888888-8888-4888-8888-888888888888', -- 9709 combination
    '99999999-9999-4999-8999-999999999993'
  )
  $$,
  '23514',
  NULL,
  '70. Cross-subject link (9231 mapping to 9709 combination) fails trigger validation'
);

-- 71. Cross-session link fails (sitting session november vs publication session june)
INSERT INTO public.grade_threshold_carry_forward_source_mappings (
  id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
  sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
  carried_exam_year, carried_exam_series, scope_basis, scope_administrative_zones,
  scope_territories, scope_declaration, page_locator, evidence_status,
  authorized_by, authorized_at
) VALUES (
  '33333333-3333-4333-8333-333333333330',
  '22222222-2222-4222-8222-222222222222', '9709', 'DX', '82',
  ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'november', -- NOVEMBER vs combo JUNE!
  2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China Zone 5', 'p. 50',
  'confirmed', 'auditor@atlas.edu', NOW()
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id, combination_id, token_id
  ) VALUES (
    '33333333-3333-4333-8333-333333333330',
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999993'
  )
  $$,
  '23514',
  NULL,
  '71. Cross-session bridge link (sitting series november vs publication june) fails trigger validation'
);

-- 72. Non-staged combination link fails
INSERT INTO public.grade_threshold_combinations (
  id, publication_id, canonical_key, qualification_level, route_type,
  maximum_mark, weighting_basis, planner_eligibility, atlas_route_id
) VALUES (
  '88888888-8888-4888-8888-888888888889',
  '66666666-6666-4666-8666-666666666666',
  '9709-june-2026-as-only',
  'as', 'as_only', 125, 'raw_total', 'eligible',
  '6e5260a6-47c7-5361-bbb0-88d71ada7456'
);

INSERT INTO public.grade_threshold_combination_tokens (
  id, combination_id, token_position, raw_token, token_kind,
  stage, maximum_mark, weighting_factor, weighting_entry_id,
  carry_forward_mapping_status, mapping_reviewed_by, mapping_reviewed_at
) VALUES (
  '99999999-9999-4999-8999-999999999994',
  '88888888-8888-4888-8888-888888888889',
  1, '82', 'carry_forward', 'as', 125, 1.0,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
  'approved', 'auditor@atlas.edu', NOW()
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id, combination_id, token_id
  ) VALUES (
    '33333333-3333-4333-8333-333333333333',
    '88888888-8888-4888-8888-888888888889', -- as_only combination
    '99999999-9999-4999-8999-999999999994'
  )
  $$,
  '23514',
  NULL,
  '72. Linking to non-staged combination fails trigger validation'
);

-- 73. Non-carry-forward token link fails
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id, combination_id, token_id
  ) VALUES (
    '33333333-3333-4333-8333-333333333333',
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999991' -- token 35 is component_variant
  )
  $$,
  '23514',
  NULL,
  '73. Linking to non-carry-forward token fails trigger validation'
);

-- 74. Carry-forward token with non-AS stage is rejected by constraints
SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_tokens (
    id, combination_id, token_position, raw_token, token_kind,
    stage, maximum_mark, weighting_factor, weighting_entry_id,
    carry_forward_mapping_status, mapping_reviewed_by, mapping_reviewed_at
  ) VALUES (
    '99999999-9999-4999-8999-999999999996',
    '88888888-8888-4888-8888-888888888888',
    4, '82', 'carry_forward', 'a2', -- non-AS stage rejected!
    125, 1.0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    'approved', 'auditor@atlas.edu', NOW()
  )
  $$,
  '23514',
  NULL,
  '74. Carry-forward token with non-AS stage is rejected by constraints'
);

-- 75. Token raw_token mismatch fails
SAVEPOINT sp_token_83;

INSERT INTO public.grade_threshold_combination_tokens (
  id, combination_id, token_position, raw_token, token_kind,
  stage, maximum_mark, weighting_factor, weighting_entry_id,
  carry_forward_mapping_status, mapping_reviewed_by, mapping_reviewed_at
) VALUES (
  '99999999-9999-4999-8999-999999999995',
  '88888888-8888-4888-8888-888888888888',
  4, '83', 'carry_forward', 'as', 125, NULL, NULL,
  'approved', 'auditor@atlas.edu', NOW()
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id, combination_id, token_id
  ) VALUES (
    '33333333-3333-4333-8333-333333333333', -- expects raw_token '82'
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999995'  -- has raw_token '83'
  )
  $$,
  '23514',
  NULL,
  '75. Raw token mismatch (token 83 vs mapping 82) fails trigger validation'
);

ROLLBACK TO SAVEPOINT sp_token_83;

-- 76. Sitting component mismatch fails
INSERT INTO public.grade_threshold_carry_forward_source_mappings (
  id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
  sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
  carried_exam_year, carried_exam_series, scope_basis, scope_administrative_zones,
  scope_territories, scope_declaration, page_locator, evidence_status,
  authorized_by, authorized_at
) VALUES (
  '33333333-3333-4333-8333-333333333334',
  '22222222-2222-4222-8222-222222222222', '9709', 'EC', '82',
  ARRAY['35', '45'], -- combination has 35, 55!
  ARRAY['15', '55'], 2026, 'june', 2025, 'june',
  'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China Zone 5', 'p. 50',
  'confirmed', 'auditor@atlas.edu', NOW()
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id, combination_id, token_id
  ) VALUES (
    '33333333-3333-4333-8333-333333333334',
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999993'
  )
  $$,
  '23514',
  NULL,
  '76. Sitting component mismatch (mapping {35,45} vs combo {35,55}) fails trigger validation'
);

-- 77. Sitting component reordering fails
INSERT INTO public.grade_threshold_carry_forward_source_mappings (
  id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
  sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
  carried_exam_year, carried_exam_series, scope_basis, scope_administrative_zones,
  scope_territories, scope_declaration, page_locator, evidence_status,
  authorized_by, authorized_at
) VALUES (
  '33333333-3333-4333-8333-333333333335',
  '22222222-2222-4222-8222-222222222222', '9709', 'DCR', '82',
  ARRAY['55', '35'], -- reordered! combo is 35, 55
  ARRAY['15', '45'], 2026, 'june', 2025, 'june',
  'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China Zone 5', 'p. 50',
  'confirmed', 'auditor@atlas.edu', NOW()
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id, combination_id, token_id
  ) VALUES (
    '33333333-3333-4333-8333-333333333335',
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999993'
  )
  $$,
  '23514',
  NULL,
  '77. Reordered sitting components ({55,35} vs combo {35,55}) fails trigger validation'
);

-- 78. Unconfirmed mapping link fails
INSERT INTO public.grade_threshold_carry_forward_source_mappings (
  id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
  sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
  carried_exam_year, carried_exam_series, scope_basis, scope_administrative_zones,
  scope_territories, scope_declaration, page_locator, evidence_status
) VALUES (
  '33333333-3333-4333-8333-333333333336',
  '22222222-2222-4222-8222-222222222222', '9709', 'DCU', '82',
  ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
  'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China Zone 5', 'p. 50',
  'unreviewed'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id, combination_id, token_id
  ) VALUES (
    '33333333-3333-4333-8333-333333333336',
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999993'
  )
  $$,
  '23514',
  NULL,
  '78. Unconfirmed source mapping fails trigger validation'
);

-- 79. Inactive document backing mapping fails link trigger
INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
  id, document_title, issuer, source_url, checksum_sha256, file_size_bytes,
  pdf_version, page_count, exam_year, exam_series, scope_basis,
  declared_administrative_zones, declared_territories, scope_declaration,
  review_status, reviewed_by, reviewed_at, is_active
) VALUES (
  '22222222-2222-4222-8222-222222222223',
  'Inactive Guide', 'Cambridge Assessment', 'https://example.com/inactive.pdf',
  decode('6666666666666666666666666666666666666666666666666666666666666666', 'hex'),
  1000, '1.6', 50, 2026, 'june', 'administrative_zone',
  ARRAY['5'], ARRAY['CN'], 'China Zone 5',
  'approved', 'auditor@atlas.edu', NOW(), FALSE -- INACTIVE!
);

INSERT INTO public.grade_threshold_carry_forward_source_mappings (
  id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
  sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
  carried_exam_year, carried_exam_series, scope_basis, scope_administrative_zones,
  scope_territories, scope_declaration, page_locator, evidence_status,
  authorized_by, authorized_at
) VALUES (
  '33333333-3333-4333-8333-333333333337',
  '22222222-2222-4222-8222-222222222223', '9709', 'DCI', '82',
  ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
  'administrative_zone', ARRAY['5'], ARRAY['CN'], 'China Zone 5', 'p. 50',
  'confirmed', 'auditor@atlas.edu', NOW()
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id, combination_id, token_id
  ) VALUES (
    '33333333-3333-4333-8333-333333333337',
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999993'
  )
  $$,
  '23514',
  NULL,
  '79. Mapping backed by inactive document fails trigger validation'
);

-- 80. Scope containment: Mapping broadening territory restriction fails
INSERT INTO public.grade_threshold_carry_forward_source_mappings (
  id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
  sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
  carried_exam_year, carried_exam_series, scope_basis, scope_administrative_zones,
  scope_territories, scope_declaration, page_locator, evidence_status,
  authorized_by, authorized_at
) VALUES (
  '33333333-3333-4333-8333-333333333338',
  '22222222-2222-4222-8222-222222222222', -- Doc has zones: {5}, territories: {CN}
  '9709', 'DCB', '82',
  ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
  'administrative_zone', ARRAY['5'], ARRAY['CN', 'SG'], -- BROADENED territory!
  'China Zone 5 Broadened', 'p. 50',
  'confirmed', 'auditor@atlas.edu', NOW()
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id, combination_id, token_id
  ) VALUES (
    '33333333-3333-4333-8333-333333333338',
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999993'
  )
  $$,
  '23514',
  NULL,
  '80. Mapping broadening document territory restriction fails trigger scope containment'
);

-- 81. Scope containment: Mapping omitting territory restriction fails
INSERT INTO public.grade_threshold_carry_forward_source_mappings (
  id, evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
  sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
  carried_exam_year, carried_exam_series, scope_basis, scope_administrative_zones,
  scope_territories, scope_declaration, page_locator, evidence_status,
  authorized_by, authorized_at
) VALUES (
  '33333333-3333-4333-8333-333333333339',
  '22222222-2222-4222-8222-222222222222', -- Doc has territories: {CN}
  '9709', 'DCN', '82',
  ARRAY['35', '55'], ARRAY['15', '45'], 2026, 'june', 2025, 'june',
  'administrative_zone', ARRAY['5'], NULL, -- OMITTED territory restriction!
  'All Zone 5', 'p. 50',
  'confirmed', 'auditor@atlas.edu', NOW()
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id, combination_id, token_id
  ) VALUES (
    '33333333-3333-4333-8333-333333333339',
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999993'
  )
  $$,
  '23514',
  NULL,
  '81. Mapping omitting document territory restriction fails trigger scope containment'
);

-- ─── Section 5: Linked Evidence Immutability Triggers ─────────────────────────

-- 82. Structural update to linked mapping syllabus_code is rejected
SELECT throws_ok(
  $$
  UPDATE public.grade_threshold_carry_forward_source_mappings
  SET syllabus_code = '9999'
  WHERE id = '33333333-3333-4333-8333-333333333333';
  $$,
  '23514',
  NULL,
  '82. Structural update to linked mapping syllabus_code is rejected by immutability trigger'
);

-- 83. Structural update to linked mapping raw_carry_forward_token is rejected
SELECT throws_ok(
  $$
  UPDATE public.grade_threshold_carry_forward_source_mappings
  SET raw_carry_forward_token = '88'
  WHERE id = '33333333-3333-4333-8333-333333333333';
  $$,
  '23514',
  NULL,
  '83. Structural update to linked mapping raw_carry_forward_token is rejected by immutability trigger'
);

-- 84. Structural update to linked mapping sitting_components is rejected
SELECT throws_ok(
  $$
  UPDATE public.grade_threshold_carry_forward_source_mappings
  SET sitting_components = ARRAY['11', '22']
  WHERE id = '33333333-3333-4333-8333-333333333333';
  $$,
  '23514',
  NULL,
  '84. Structural update to linked mapping sitting_components is rejected by immutability trigger'
);

-- 85. Structural update to linked mapping entry_option_code is rejected
SELECT throws_ok(
  $$
  UPDATE public.grade_threshold_carry_forward_source_mappings
  SET entry_option_code = 'ZZ'
  WHERE id = '33333333-3333-4333-8333-333333333333';
  $$,
  '23514',
  NULL,
  '85. Structural update to linked mapping entry_option_code is rejected by immutability trigger'
);

-- 86. Structural update to linked document document_title is rejected
SELECT throws_ok(
  $$
  UPDATE public.grade_threshold_carry_forward_evidence_documents
  SET document_title = 'Altered Document Title'
  WHERE id = '22222222-2222-4222-8222-222222222222';
  $$,
  '23514',
  NULL,
  '86. Structural update to linked document document_title is rejected by immutability trigger'
);

-- 87. Structural update to linked document checksum_sha256 is rejected
SELECT throws_ok(
  $$
  UPDATE public.grade_threshold_carry_forward_evidence_documents
  SET checksum_sha256 = decode('9999999999999999999999999999999999999999999999999999999999999999', 'hex')
  WHERE id = '22222222-2222-4222-8222-222222222222';
  $$,
  '23514',
  NULL,
  '87. Structural update to linked document checksum_sha256 is rejected by immutability trigger'
);

-- 88. Structural update to linked document source_url is rejected
SELECT throws_ok(
  $$
  UPDATE public.grade_threshold_carry_forward_evidence_documents
  SET source_url = 'https://example.com/altered.pdf'
  WHERE id = '22222222-2222-4222-8222-222222222222';
  $$,
  '23514',
  NULL,
  '88. Structural update to linked document source_url is rejected by immutability trigger'
);

-- 89. Structural update to linked document exam_year is rejected
SELECT throws_ok(
  $$
  UPDATE public.grade_threshold_carry_forward_evidence_documents
  SET exam_year = 2027
  WHERE id = '22222222-2222-4222-8222-222222222222';
  $$,
  '23514',
  NULL,
  '89. Structural update to linked document exam_year is rejected by immutability trigger'
);

-- 90. Lifecycle update on linked mapping (rejection) remains permitted
SAVEPOINT sp_lifecycle_map_reject;

SELECT lives_ok(
  $$
  UPDATE public.grade_threshold_carry_forward_source_mappings
  SET evidence_status = 'rejected', rejection_reason = 'Disputed by exam officer',
      authorized_by = NULL, authorized_at = NULL
  WHERE id = '33333333-3333-4333-8333-333333333333';
  $$,
  '90. Lifecycle rejection update on linked mapping is permitted'
);

ROLLBACK TO SAVEPOINT sp_lifecycle_map_reject;

-- 91. Lifecycle update on linked evidence document (deactivation) remains permitted
SAVEPOINT sp_lifecycle_doc_deactivate;

SELECT lives_ok(
  $$
  UPDATE public.grade_threshold_carry_forward_evidence_documents
  SET is_active = FALSE
  WHERE id = '22222222-2222-4222-8222-222222222222';
  $$,
  '91. Lifecycle deactivation update on linked evidence document is permitted'
);

ROLLBACK TO SAVEPOINT sp_lifecycle_doc_deactivate;

-- ─── Section 6: Dynamic Validation & Fail-Closed Behavior ─────────────────────

-- 92. Published read view non-recursive evaluation returns correct linked row
SELECT results_eq(
  $$
  SELECT syllabus_code, sitting_exam_year, sitting_exam_series, entry_option_code, raw_carry_forward_token
  FROM public.published_grade_threshold_carry_forward_mappings
  WHERE combination_id = '88888888-8888-4888-8888-888888888888'
  $$,
  $$ VALUES ('9709'::TEXT, 2026::SMALLINT, 'june'::TEXT, 'DC'::TEXT, '82'::TEXT) $$,
  '92. Published evidence view returns confirmed linked row non-recursively'
);

-- 93. Valid confirmed link satisfies published planner view for staged combination
SELECT results_eq(
  $$
  SELECT id, canonical_key, route_type, per_paper_allocation_eligible
  FROM public.published_grade_threshold_combinations
  WHERE id = '88888888-8888-4888-8888-888888888888'
  $$,
  $$ VALUES ('88888888-8888-4888-8888-888888888888'::UUID, '9709-june-2026-staged-dc'::TEXT, 'staged'::TEXT, TRUE::BOOLEAN) $$,
  '93. Confirmed bridge link satisfies published planner view for staged combination'
);

-- 94. Combination with approved carry-forward token but NO link is absent from planner view
INSERT INTO public.grade_threshold_combinations (
  id, publication_id, canonical_key, qualification_level, route_type,
  maximum_mark, weighting_basis, planner_eligibility, atlas_route_id
) VALUES (
  '88888888-8888-4888-8888-888888888880',
  '66666666-6666-4666-8666-666666666666',
  '9709-june-2026-staged-unlinked',
  'a_level', 'staged', 250, 'raw_total', 'eligible',
  '99578e02-66ae-53b0-9d67-ed86804a17a9'
);

INSERT INTO public.grade_threshold_combination_tokens (
  id, combination_id, token_position, raw_token, token_kind,
  resolved_component_variant_id, stage, maximum_mark, weighting_factor,
  weighting_entry_id, carry_forward_mapping_status, mapping_reviewed_by, mapping_reviewed_at
) VALUES
  ('99999999-9999-4999-8999-999999999901', '88888888-8888-4888-8888-888888888880', 1, '35', 'component_variant', '77777777-7777-4777-8777-777777777771', 'a2', 75, 1.0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', NULL, NULL, NULL),
  ('99999999-9999-4999-8999-999999999902', '88888888-8888-4888-8888-888888888880', 2, '55', 'component_variant', '77777777-7777-4777-8777-777777777772', 'a2', 50, 1.0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', NULL, NULL, NULL),
  ('99999999-9999-4999-8999-999999999903', '88888888-8888-4888-8888-888888888880', 3, '82', 'carry_forward', NULL, 'as', 125, 1.0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'approved', 'auditor@atlas.edu', NOW());

SELECT is_empty(
  $$
  SELECT id FROM public.published_grade_threshold_combinations
  WHERE id = '88888888-8888-4888-8888-888888888880'
  $$,
  '94. Approved carry-forward token without bridge link remains absent from published planner view'
);

-- 95 & 96. Token raw_token mutation after linking makes row fail closed dynamically
SAVEPOINT sp_token_raw_mutate;

UPDATE public.grade_threshold_combination_tokens
SET raw_token = '99', weighting_entry_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9'
WHERE id = '99999999-9999-4999-8999-999999999993';

SELECT is_empty(
  $$
  SELECT * FROM public.published_grade_threshold_carry_forward_mappings
  WHERE combination_id = '88888888-8888-4888-8888-888888888888';
  $$,
  '95. Mutating linked token raw_token hides row from published evidence view dynamically'
);

SELECT is_empty(
  $$
  SELECT id FROM public.published_grade_threshold_combinations
  WHERE id = '88888888-8888-4888-8888-888888888888';
  $$,
  '96. Mutating linked token raw_token causes published planner view to fail closed dynamically'
);

ROLLBACK TO SAVEPOINT sp_token_raw_mutate;

-- 97. Token stage mutation to non-AS after linking is rejected by constraint
SELECT throws_ok(
  $$
  UPDATE public.grade_threshold_combination_tokens
  SET stage = 'a2'
  WHERE id = '99999999-9999-4999-8999-999999999993';
  $$,
  '23514',
  NULL,
  '97. Mutating linked token stage to non-AS after linking is rejected by existing constraint'
);

-- 98 & 99. Component sequence mutation after linking hides row dynamically
SAVEPOINT sp_component_seq_mutate;

-- Swap positions between token 35 (position 1) and token 55 (position 2)
UPDATE public.grade_threshold_combination_tokens
SET token_position = 5
WHERE id = '99999999-9999-4999-8999-999999999991';

UPDATE public.grade_threshold_combination_tokens
SET token_position = 1
WHERE id = '99999999-9999-4999-8999-999999999992';

UPDATE public.grade_threshold_combination_tokens
SET token_position = 2
WHERE id = '99999999-9999-4999-8999-999999999991';

SELECT is_empty(
  $$
  SELECT * FROM public.published_grade_threshold_carry_forward_mappings
  WHERE combination_id = '88888888-8888-4888-8888-888888888888';
  $$,
  '98. Mutating sitting component token sequence hides row from published evidence view dynamically'
);

SELECT is_empty(
  $$
  SELECT id FROM public.published_grade_threshold_combinations
  WHERE id = '88888888-8888-4888-8888-888888888888';
  $$,
  '99. Mutating sitting component token sequence causes published planner view to fail closed dynamically'
);

ROLLBACK TO SAVEPOINT sp_component_seq_mutate;

-- 100. Combination route_type mutation after linking hides row dynamically
SAVEPOINT sp_route_type_mutate;

UPDATE public.grade_threshold_combinations
SET route_type = 'full_level'
WHERE id = '88888888-8888-4888-8888-888888888888';

SELECT is_empty(
  $$
  SELECT * FROM public.published_grade_threshold_carry_forward_mappings
  WHERE combination_id = '88888888-8888-4888-8888-888888888888';
  $$,
  '100. Mutating combination route_type to non-staged hides row from published evidence view dynamically'
);

ROLLBACK TO SAVEPOINT sp_route_type_mutate;

-- 101. Publication session mutation after linking hides row dynamically
SAVEPOINT sp_pub_session_mutate;

UPDATE public.grade_threshold_publications
SET exam_series = 'november'
WHERE id = '66666666-6666-4666-8666-666666666666';

SELECT is_empty(
  $$
  SELECT * FROM public.published_grade_threshold_carry_forward_mappings
  WHERE combination_id = '88888888-8888-4888-8888-888888888888';
  $$,
  '101. Mutating publication exam_series hides row from published evidence view dynamically'
);

ROLLBACK TO SAVEPOINT sp_pub_session_mutate;

-- 102. Link deletion fails closed
SAVEPOINT sp_link_delete;

DELETE FROM public.grade_threshold_combination_carry_forward_links
WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

SELECT is_empty(
  $$
  SELECT id FROM public.published_grade_threshold_combinations
  WHERE id = '88888888-8888-4888-8888-888888888888';
  $$,
  '102. Deleting bridge link immediately removes combination from planner view (fails closed)'
);

ROLLBACK TO SAVEPOINT sp_link_delete;

-- 103. Document deactivation fails closed
SAVEPOINT sp_doc_deactivate;

UPDATE public.grade_threshold_carry_forward_evidence_documents
SET is_active = FALSE
WHERE id = '22222222-2222-4222-8222-222222222222';

SELECT is_empty(
  $$
  SELECT id FROM public.published_grade_threshold_combinations
  WHERE id = '88888888-8888-4888-8888-888888888888';
  $$,
  '103. Deactivating evidence document immediately removes combination from planner view (fails closed)'
);

ROLLBACK TO SAVEPOINT sp_doc_deactivate;

-- 104. Mapping rejection fails closed
SAVEPOINT sp_mapping_reject;

UPDATE public.grade_threshold_carry_forward_source_mappings
SET evidence_status = 'rejected', rejection_reason = 'Disputed by exam officer',
    authorized_by = NULL, authorized_at = NULL
WHERE id = '33333333-3333-4333-8333-333333333333';

SELECT is_empty(
  $$
  SELECT id FROM public.published_grade_threshold_combinations
  WHERE id = '88888888-8888-4888-8888-888888888888';
  $$,
  '104. Rejecting source mapping immediately removes combination from planner view (fails closed)'
);

ROLLBACK TO SAVEPOINT sp_mapping_reject;

-- 105. Publication supersession fails closed
SAVEPOINT sp_pub_supersede;

UPDATE public.grade_threshold_publications
SET is_active = FALSE, publication_status = 'superseded'
WHERE id = '66666666-6666-4666-8666-666666666666';

SELECT is_empty(
  $$
  SELECT id FROM public.published_grade_threshold_combinations
  WHERE id = '88888888-8888-4888-8888-888888888888';
  $$,
  '105. Superseding threshold publication immediately removes combination from planner view (fails closed)'
);

ROLLBACK TO SAVEPOINT sp_pub_supersede;

-- 106. Full-level linear combination visibility remains unaffected
INSERT INTO public.grade_threshold_combination_marks (
  combination_id, grade, threshold_mark
) VALUES
  ('88888888-8888-4888-8888-888888888888', 'A*', 200),
  ('88888888-8888-4888-8888-888888888888', 'A', 180);

INSERT INTO public.grade_threshold_combinations (
  id, publication_id, canonical_key, qualification_level, route_type,
  maximum_mark, weighting_basis, planner_eligibility, atlas_route_id
) VALUES (
  '88888888-8888-4888-8888-888888888887',
  '66666666-6666-4666-8666-666666666666',
  '9709-june-2026-full-level',
  'a_level', 'full_level', 250, 'raw_total', 'eligible',
  '18efca50-e2e0-5817-bfe3-1e0182181c7c'
);

INSERT INTO public.grade_threshold_component_variants (
  id, publication_id, subject_paper_id, component_code, raw_maximum_mark
) VALUES
  ('77777777-7777-4777-8777-777777777773', '66666666-6666-4666-8666-666666666666', '85180183-41d1-528f-8f3d-e2e0837aed83', '15', 75),
  ('77777777-7777-4777-8777-777777777774', '66666666-6666-4666-8666-666666666666', '36d54a29-83f4-5873-90c7-ab2c364382dc', '45', 50);

INSERT INTO public.grade_threshold_weighting_entries (
  id, weighting_source_id, raw_token, token_kind, raw_maximum, weighted_maximum, official_weighting_factor, source_page
) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '15', 'component_variant', 75, 75, 1.0, 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '45', 'component_variant', 50, 50, 1.0, 1);

INSERT INTO public.grade_threshold_combination_tokens (
  id, combination_id, token_position, raw_token, token_kind,
  resolved_component_variant_id, stage, maximum_mark, weighting_factor,
  weighting_entry_id
) VALUES
  ('99999999-9999-4999-8999-999999999971', '88888888-8888-4888-8888-888888888887', 1, '15', 'component_variant', '77777777-7777-4777-8777-777777777773', 'as', 75, 1.0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4'),
  ('99999999-9999-4999-8999-999999999972', '88888888-8888-4888-8888-888888888887', 2, '35', 'component_variant', '77777777-7777-4777-8777-777777777771', 'a2', 75, 1.0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'),
  ('99999999-9999-4999-8999-999999999973', '88888888-8888-4888-8888-888888888887', 3, '45', 'component_variant', '77777777-7777-4777-8777-777777777774', 'as', 50, 1.0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5'),
  ('99999999-9999-4999-8999-999999999974', '88888888-8888-4888-8888-888888888887', 4, '55', 'component_variant', '77777777-7777-4777-8777-777777777772', 'a2', 50, 1.0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2');

SELECT results_eq(
  $$
  SELECT id, canonical_key, route_type, per_paper_allocation_eligible
  FROM public.published_grade_threshold_combinations
  WHERE id = '88888888-8888-4888-8888-888888888887'
  $$,
  $$ VALUES ('88888888-8888-4888-8888-888888888887'::UUID, '9709-june-2026-full-level'::TEXT, 'full_level'::TEXT, TRUE::BOOLEAN) $$,
  '106. Full-level linear combinations continue to be admitted without carry-forward evidence dependency'
);

-- 107. AS-only combinations continue to be admitted without carry-forward evidence dependency
-- Create a valid AS-only combination with paper 1 and paper 4
INSERT INTO public.grade_threshold_combinations (
  id, publication_id, canonical_key, qualification_level, route_type,
  maximum_mark, weighting_basis, planner_eligibility, atlas_route_id
) VALUES (
  '88888888-8888-4888-8888-888888888886',
  '66666666-6666-4666-8666-666666666666',
  '9709-june-2026-as-pure-mech',
  'as', 'as_only', 125, 'raw_total', 'eligible',
  'fcc79856-ace1-588b-b832-4e5ea4adcbc6'
);

INSERT INTO public.grade_threshold_combination_tokens (
  id, combination_id, token_position, raw_token, token_kind,
  resolved_component_variant_id, stage, maximum_mark, weighting_factor,
  weighting_entry_id
) VALUES
  ('99999999-9999-4999-8999-999999999961', '88888888-8888-4888-8888-888888888886', 1, '15', 'component_variant', '77777777-7777-4777-8777-777777777773', 'as', 75, 1.0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4'),
  ('99999999-9999-4999-8999-999999999962', '88888888-8888-4888-8888-888888888886', 2, '45', 'component_variant', '77777777-7777-4777-8777-777777777774', 'as', 50, 1.0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5');

SELECT results_eq(
  $$
  SELECT id, canonical_key, route_type, per_paper_allocation_eligible
  FROM public.published_grade_threshold_combinations
  WHERE id = '88888888-8888-4888-8888-888888888886'
  $$,
  $$ VALUES ('88888888-8888-4888-8888-888888888886'::UUID, '9709-june-2026-as-pure-mech'::TEXT, 'as_only'::TEXT, TRUE::BOOLEAN) $$,
  '107. AS-only combinations continue to be admitted without carry-forward evidence dependency'
);

-- ─── Section 7: Security, RLS & Client Permissions ────────────────────────────

-- ─── Anonymous Role Checks (tests 108 to 122) ─────────────────────────────────
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$ SELECT * FROM public.grade_threshold_carry_forward_evidence_documents $$,
  '42501', NULL,
  '108. Direct SELECT on evidence_documents denied to anon'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, scope_declaration
  ) VALUES (
    'Hack', 'Hack', 'https://example.com/hack.pdf',
    decode('9999999999999999999999999999999999999999999999999999999999999999', 'hex'),
    100, '1.6', 10, 2026, 'june', 'global', 'Hack'
  )
  $$,
  '42501', NULL,
  '109. Direct INSERT on evidence_documents denied to anon'
);

SELECT throws_ok(
  $$ UPDATE public.grade_threshold_carry_forward_evidence_documents SET is_active = FALSE $$,
  '42501', NULL,
  '110. Direct UPDATE on evidence_documents denied to anon'
);

SELECT throws_ok(
  $$ DELETE FROM public.grade_threshold_carry_forward_evidence_documents $$,
  '42501', NULL,
  '111. Direct DELETE on evidence_documents denied to anon'
);

SELECT throws_ok(
  $$ SELECT * FROM public.grade_threshold_carry_forward_source_mappings $$,
  '42501', NULL,
  '112. Direct SELECT on source_mappings denied to anon'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'ZZ', '82',
    ARRAY['35'], ARRAY['15'], 2026, 'june', 2025, 'june', 'global', 'Scope', 'p. 1'
  )
  $$,
  '42501', NULL,
  '113. Direct INSERT on source_mappings denied to anon'
);

SELECT throws_ok(
  $$ UPDATE public.grade_threshold_carry_forward_source_mappings SET page_locator = 'p. 99' $$,
  '42501', NULL,
  '114. Direct UPDATE on source_mappings denied to anon'
);

SELECT throws_ok(
  $$ DELETE FROM public.grade_threshold_carry_forward_source_mappings $$,
  '42501', NULL,
  '115. Direct DELETE on source_mappings denied to anon'
);

SELECT throws_ok(
  $$ SELECT * FROM public.grade_threshold_combination_carry_forward_links $$,
  '42501', NULL,
  '116. Direct SELECT on combination_carry_forward_links denied to anon'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id, combination_id, token_id
  ) VALUES (
    '33333333-3333-4333-8333-333333333333',
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999993'
  )
  $$,
  '42501', NULL,
  '117. Direct INSERT on combination_carry_forward_links denied to anon'
);

SELECT throws_ok(
  $$ UPDATE public.grade_threshold_combination_carry_forward_links SET created_by = 'anon' $$,
  '42501', NULL,
  '118. Direct UPDATE on combination_carry_forward_links denied to anon'
);

SELECT throws_ok(
  $$ DELETE FROM public.grade_threshold_combination_carry_forward_links $$,
  '42501', NULL,
  '119. Direct DELETE on combination_carry_forward_links denied to anon'
);

SELECT throws_ok(
  $$ SELECT public.fn_is_valid_evidence_text_array(ARRAY['test']) $$,
  '42501', NULL,
  '120. Direct EXECUTE on fn_is_valid_evidence_text_array denied to anon'
);

SELECT lives_ok(
  $$ SELECT * FROM public.published_grade_threshold_carry_forward_mappings $$,
  '121. Published evidence view is readable by anon'
);

SELECT lives_ok(
  $$ SELECT * FROM public.published_grade_threshold_combinations $$,
  '122. Published combinations view is readable by anon'
);

-- ─── Authenticated Role Checks (tests 123 to 137) ────────────────────────────
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT * FROM public.grade_threshold_carry_forward_evidence_documents $$,
  '42501', NULL,
  '123. Direct SELECT on evidence_documents denied to authenticated'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_evidence_documents (
    document_title, issuer, source_url, checksum_sha256, file_size_bytes,
    pdf_version, page_count, exam_year, exam_series, scope_basis, scope_declaration
  ) VALUES (
    'Hack', 'Hack', 'https://example.com/hack.pdf',
    decode('9999999999999999999999999999999999999999999999999999999999999999', 'hex'),
    100, '1.6', 10, 2026, 'june', 'global', 'Hack'
  )
  $$,
  '42501', NULL,
  '124. Direct INSERT on evidence_documents denied to authenticated'
);

SELECT throws_ok(
  $$ UPDATE public.grade_threshold_carry_forward_evidence_documents SET is_active = FALSE $$,
  '42501', NULL,
  '125. Direct UPDATE on evidence_documents denied to authenticated'
);

SELECT throws_ok(
  $$ DELETE FROM public.grade_threshold_carry_forward_evidence_documents $$,
  '42501', NULL,
  '126. Direct DELETE on evidence_documents denied to authenticated'
);

SELECT throws_ok(
  $$ SELECT * FROM public.grade_threshold_carry_forward_source_mappings $$,
  '42501', NULL,
  '127. Direct SELECT on source_mappings denied to authenticated'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_carry_forward_source_mappings (
    evidence_document_id, syllabus_code, entry_option_code, raw_carry_forward_token,
    sitting_components, carried_as_components, sitting_exam_year, sitting_exam_series,
    carried_exam_year, carried_exam_series, scope_basis, scope_declaration, page_locator
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', '9709', 'ZZ', '82',
    ARRAY['35'], ARRAY['15'], 2026, 'june', 2025, 'june', 'global', 'Scope', 'p. 1'
  )
  $$,
  '42501', NULL,
  '128. Direct INSERT on source_mappings denied to authenticated'
);

SELECT throws_ok(
  $$ UPDATE public.grade_threshold_carry_forward_source_mappings SET page_locator = 'p. 99' $$,
  '42501', NULL,
  '129. Direct UPDATE on source_mappings denied to authenticated'
);

SELECT throws_ok(
  $$ DELETE FROM public.grade_threshold_carry_forward_source_mappings $$,
  '42501', NULL,
  '130. Direct DELETE on source_mappings denied to authenticated'
);

SELECT throws_ok(
  $$ SELECT * FROM public.grade_threshold_combination_carry_forward_links $$,
  '42501', NULL,
  '131. Direct SELECT on combination_carry_forward_links denied to authenticated'
);

SELECT throws_ok(
  $$
  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id, combination_id, token_id
  ) VALUES (
    '33333333-3333-4333-8333-333333333333',
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999993'
  )
  $$,
  '42501', NULL,
  '132. Direct INSERT on combination_carry_forward_links denied to authenticated'
);

SELECT throws_ok(
  $$ UPDATE public.grade_threshold_combination_carry_forward_links SET created_by = 'authenticated' $$,
  '42501', NULL,
  '133. Direct UPDATE on combination_carry_forward_links denied to authenticated'
);

SELECT throws_ok(
  $$ DELETE FROM public.grade_threshold_combination_carry_forward_links $$,
  '42501', NULL,
  '134. Direct DELETE on combination_carry_forward_links denied to authenticated'
);

SELECT throws_ok(
  $$ SELECT public.fn_is_valid_evidence_text_array(ARRAY['test']) $$,
  '42501', NULL,
  '135. Direct EXECUTE on fn_is_valid_evidence_text_array denied to authenticated'
);

SELECT lives_ok(
  $$ SELECT * FROM public.published_grade_threshold_carry_forward_mappings $$,
  '136. Published evidence view is readable by authenticated'
);

SELECT lives_ok(
  $$ SELECT * FROM public.published_grade_threshold_combinations $$,
  '137. Published combinations view is readable by authenticated'
);

RESET ROLE;

-- ─── Finish and Rollback ──────────────────────────────────────────────────────
SELECT * FROM finish();
ROLLBACK;
