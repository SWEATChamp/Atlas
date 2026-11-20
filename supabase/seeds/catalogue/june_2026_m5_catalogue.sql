-- =============================================================================
-- SEED: Milestone 5 Durable June 2026 Grade Threshold Catalogue
--
-- File: supabase/seeds/catalogue/june_2026_m5_catalogue.sql
--
-- Purpose:
--   Durable, authoritative June 2026 Cambridge International AS & A Level
--   grade-threshold catalogue for Chemistry (9701), Physics (9702), and
--   Mathematics (9709).
--
-- Breakdown of the 131 Durable Rows Across 11 Tables:
--   1.  public.grade_threshold_import_runs:                   1 row
--   2.  public.grade_threshold_publications:                  3 rows (9701, 9702, 9709)
--   3.  public.grade_threshold_weighting_sources:             3 rows (9701, 9702, 9709)
--   4.  public.grade_threshold_weighting_entries:            11 rows (3 Chem, 5 Phys, 3 Math)
--   5.  public.grade_threshold_component_variants:           13 rows (3 Chem, 5 Phys, 5 Math)
--   6.  public.grade_threshold_component_marks:              65 rows (13 variants x 5 marks A-E)
--   7.  public.grade_threshold_variant_benchmark_groups:      1 row  (Math P1 Grade A)
--   8.  public.grade_threshold_variant_benchmark_members:     3 rows (Math P1 variants 11, 12, 13)
--   9.  public.grade_threshold_combinations:                  3 rows (Chem S3, Phys AY, Math DC)
--   10. public.grade_threshold_combination_tokens:           11 rows (3 Chem S3, 5 Phys AY, 3 Math DC)
--   11. public.grade_threshold_combination_marks:            17 rows (5 Chem S3, 6 Phys AY, 6 Math DC)
--   Total: 1 + 3 + 3 + 11 + 13 + 65 + 1 + 3 + 3 + 11 + 17 = 131 rows
--
-- Strictly Excluded from this Durable Catalogue:
--   - carry-forward bridge links (public.grade_threshold_combination_carry_forward_links)
--   - student attempts / past papers (public.past_papers)
--   - test users, auth users, and profiles (auth.users, public.profiles)
--   - user enrollments, subject paper selections, chapters, or routes
--   - promotion or mutation of Migration 036 evidence / source mappings
-- =============================================================================

DO $$
DECLARE
  v_subj_chem UUID;
  v_subj_phys UUID;
  v_subj_math UUID;
BEGIN
  -- Resolve subject IDs dynamically from authoritative subjects table
  SELECT id INTO v_subj_chem FROM public.subjects WHERE code = '9701';
  SELECT id INTO v_subj_phys FROM public.subjects WHERE code = '9702';
  SELECT id INTO v_subj_math FROM public.subjects WHERE code = '9709';

  IF v_subj_chem IS NULL OR v_subj_phys IS NULL OR v_subj_math IS NULL THEN
    RAISE EXCEPTION 'Required subjects (9701, 9702, 9709) missing from public.subjects'
      USING ERRCODE = 'P0002';
  END IF;

  -- ── 1. Table 1: grade_threshold_import_runs (1 row) ──────────────────────────
  INSERT INTO public.grade_threshold_import_runs (
    id,
    trigger_kind,
    parser_version,
    status,
    started_at,
    finished_at,
    aggregate_summary
  ) VALUES (
    '00000000-0000-4000-8000-000000000010',
    'manual',
    '1.0.0',
    'succeeded',
    '2026-06-25 10:00:00+00',
    '2026-06-25 10:05:00+00',
    '{"notes": "June 2026 M5 Planner Preflight Import Run"}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  -- ── 2. Table 2: grade_threshold_publications (3 rows) ────────────────────────
  INSERT INTO public.grade_threshold_publications (
    id,
    import_run_id,
    subject_id,
    exam_year,
    exam_series,
    official_index_url,
    official_pdf_url,
    source_checksum_sha256,
    official_published_on,
    revision_number,
    publication_status,
    is_active,
    published_at,
    source_metadata
  ) VALUES
  (
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000010',
    v_subj_chem,
    2026,
    'june',
    'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/grade-threshold-tables/june-2026/',
    'https://www.cambridgeinternational.org/Images/761525-chemistry-9701-june-2026-grade-threshold-table.pdf',
    decode('3ecf1e2e1f8adc21efdf0146293d9aecdf741bf80285d4d8cf80ac0882e1104a', 'hex'),
    '2026-08-10',
    1,
    'published',
    TRUE,
    '2026-08-11 00:00:00+00',
    '{"subject_code": "9701", "series": "June 2026", "document_filename": "761525-chemistry-9701-june-2026-grade-threshold-table.pdf"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000022',
    '00000000-0000-4000-8000-000000000010',
    v_subj_phys,
    2026,
    'june',
    'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/grade-threshold-tables/june-2026/',
    'https://www.cambridgeinternational.org/Images/761526-physics-9702-june-2026-grade-threshold-table.pdf',
    decode('211cfe1b7997bd6ff44e2e221e6d21f0188b3a0ff3615cd902e5692eaf7c8feb', 'hex'),
    '2026-08-10',
    1,
    'published',
    TRUE,
    '2026-08-11 00:00:00+00',
    '{"subject_code": "9702", "series": "June 2026", "document_filename": "761526-physics-9702-june-2026-grade-threshold-table.pdf"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000023',
    '00000000-0000-4000-8000-000000000010',
    v_subj_math,
    2026,
    'june',
    'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/grade-threshold-tables/june-2026/',
    'https://www.cambridgeinternational.org/Images/761530-mathematics-9709-june-2026-grade-threshold-table.pdf',
    decode('1b277a4090965f8d3a7d1f80973952f87521d17b398754f26f695bcfdf46ddab', 'hex'),
    '2026-08-10',
    1,
    'published',
    TRUE,
    '2026-08-11 00:00:00+00',
    '{"subject_code": "9709", "series": "June 2026", "document_filename": "761530-mathematics-9709-june-2026-grade-threshold-table.pdf"}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  -- ── 3. Table 3: grade_threshold_weighting_sources (3 rows) ───────────────────
  INSERT INTO public.grade_threshold_weighting_sources (
    id,
    subject_id,
    document_year,
    exam_series,
    source_label,
    official_document_url,
    source_checksum_sha256,
    review_status,
    reviewed_by,
    reviewed_at,
    source_metadata
  ) VALUES
  (
    '00000000-0000-4000-8000-000000000031',
    v_subj_chem,
    2026,
    'june',
    'Syllabus component weighting factors: November 2025, March 2026 and June 2026',
    'https://www.cambridgeinternational.org/Images/206341-syllabus-component-weighting-factors.pdf',
    decode('d96f96e5d8847470fd7291f75aa01184b3c0cff7075b5010968e16d94218ada9', 'hex'),
    'approved',
    'm5-preflight-auditor',
    '2026-08-10 12:00:00+00',
    '{"document_title": "Syllabus component weighting factors: November 2025, March 2026 and June 2026", "subject_code": "9701", "locator_page": 85}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000032',
    v_subj_phys,
    2026,
    'june',
    'Syllabus component weighting factors: November 2025, March 2026 and June 2026',
    'https://www.cambridgeinternational.org/Images/206341-syllabus-component-weighting-factors.pdf',
    decode('d96f96e5d8847470fd7291f75aa01184b3c0cff7075b5010968e16d94218ada9', 'hex'),
    'approved',
    'm5-preflight-auditor',
    '2026-08-10 12:00:00+00',
    '{"document_title": "Syllabus component weighting factors: November 2025, March 2026 and June 2026", "subject_code": "9702", "locator_pages": [86, 87]}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000033',
    v_subj_math,
    2026,
    'june',
    'Syllabus component weighting factors: November 2025, March 2026 and June 2026',
    'https://www.cambridgeinternational.org/Images/206341-syllabus-component-weighting-factors.pdf',
    decode('d96f96e5d8847470fd7291f75aa01184b3c0cff7075b5010968e16d94218ada9', 'hex'),
    'approved',
    'm5-preflight-auditor',
    '2026-08-10 12:00:00+00',
    '{"document_title": "Syllabus component weighting factors: November 2025, March 2026 and June 2026", "subject_code": "9709", "locator_pages": [89, 90]}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  -- ── 4. Table 4: grade_threshold_weighting_entries (11 rows) ──────────────────
  INSERT INTO public.grade_threshold_weighting_entries (
    id,
    weighting_source_id,
    raw_token,
    token_kind,
    raw_maximum,
    weighted_maximum,
    official_weighting_factor,
    source_page,
    source_row_label
  ) VALUES
  -- Chemistry 9701 (3 entries: p. 85, rows 32, 36, 41)
  ('00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000031', '12', 'component_variant', 40,  40,  1.00000000, 85, 'Row 32 (Paper 12 Multiple Choice)'),
  ('00000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000031', '22', 'component_variant', 60,  60,  1.00000000, 85, 'Row 36 (Paper 22 AS Level Structured Questions)'),
  ('00000000-0000-4000-8000-000000000043', '00000000-0000-4000-8000-000000000031', '33', 'component_variant', 40,  30,  0.75000000, 85, 'Row 41 (Paper 33 Advanced Practical Skills)'),
  -- Physics 9702 (5 entries: p. 86 rows 32, 36, 41, 47; p. 87 row 12)
  ('00000000-0000-4000-8000-000000000044', '00000000-0000-4000-8000-000000000032', '12', 'component_variant', 40,  40,  1.00000000, 86, 'Row 32 (Paper 12 Multiple Choice)'),
  ('00000000-0000-4000-8000-000000000045', '00000000-0000-4000-8000-000000000032', '22', 'component_variant', 60,  60,  1.00000000, 86, 'Row 36 (Paper 22 AS Level Structured Questions)'),
  ('00000000-0000-4000-8000-000000000046', '00000000-0000-4000-8000-000000000032', '33', 'component_variant', 40,  30,  0.75000000, 86, 'Row 41 (Paper 33 Advanced Practical Skills)'),
  ('00000000-0000-4000-8000-000000000047', '00000000-0000-4000-8000-000000000032', '42', 'component_variant', 100, 100, 1.00000000, 86, 'Row 47 (Paper 42 A Level Structured Questions)'),
  ('00000000-0000-4000-8000-000000000048', '00000000-0000-4000-8000-000000000032', '52', 'component_variant', 30,  30,  1.00000000, 87, 'Row 12 (Paper 52 Planning, Analysis and Evaluation)'),
  -- Mathematics 9709 (3 entries: p. 89 rows 31, 40; p. 90 row 12)
  ('00000000-0000-4000-8000-000000000049', '00000000-0000-4000-8000-000000000033', '35', 'component_variant', 75,  75,  1.00000000, 89, 'Row 31 (Paper 35 Pure Mathematics 3)'),
  ('00000000-0000-4000-8000-00000000004a', '00000000-0000-4000-8000-000000000033', '55', 'component_variant', 50,  50,  1.00000000, 89, 'Row 40 (Paper 55 Probability & Statistics 1)'),
  ('00000000-0000-4000-8000-00000000004b', '00000000-0000-4000-8000-000000000033', '82', 'carry_forward',     125, 125, 1.00000000, 90, 'Row 12 (Component 82 June AS Mark Carried Forward)')
  ON CONFLICT (id) DO NOTHING;

  -- ── 5. Table 5: grade_threshold_component_variants (13 rows) ─────────────────
  INSERT INTO public.grade_threshold_component_variants (
    id,
    publication_id,
    component_code,
    raw_maximum_mark,
    subject_paper_id,
    source_label,
    source_row_metadata
  ) VALUES
  -- Chemistry 9701 (3 variants)
  ('00000000-0000-4000-8000-000000000081', '00000000-0000-4000-8000-000000000021', '12', 40, '9727a285-3e3c-5b17-8ccb-9cf8ec26c496', 'Paper 12 (Multiple Choice)', '{"source_page": 1, "source_document": "761525-chemistry-9701-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 12"}'::jsonb),
  ('00000000-0000-4000-8000-000000000082', '00000000-0000-4000-8000-000000000021', '22', 60, '26c24b14-b3b1-53bb-bf0d-5f0ce959214c', 'Paper 22 (AS Level Structured Questions)', '{"source_page": 1, "source_document": "761525-chemistry-9701-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 22"}'::jsonb),
  ('00000000-0000-4000-8000-000000000083', '00000000-0000-4000-8000-000000000021', '33', 40, '8c802754-98a5-599b-8b7a-5e528804f625', 'Paper 33 (Advanced Practical Skills)', '{"source_page": 1, "source_document": "761525-chemistry-9701-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 33"}'::jsonb),
  -- Physics 9702 (5 variants)
  ('00000000-0000-4000-8000-000000000084', '00000000-0000-4000-8000-000000000022', '12', 40,  'efc05eb9-2b55-576b-a429-f94c7868a4d8', 'Paper 12 (Multiple Choice)', '{"source_page": 1, "source_document": "761526-physics-9702-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 12"}'::jsonb),
  ('00000000-0000-4000-8000-000000000085', '00000000-0000-4000-8000-000000000022', '22', 60,  'ae2211e2-8353-55dc-8536-a1e507ce2fe3', 'Paper 22 (AS Level Structured Questions)', '{"source_page": 1, "source_document": "761526-physics-9702-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 22"}'::jsonb),
  ('00000000-0000-4000-8000-000000000086', '00000000-0000-4000-8000-000000000022', '33', 40,  '5a41708c-abf4-5eff-bdcd-16a8c9ed6efe', 'Paper 33 (Advanced Practical Skills)', '{"source_page": 1, "source_document": "761526-physics-9702-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 33"}'::jsonb),
  ('00000000-0000-4000-8000-000000000087', '00000000-0000-4000-8000-000000000022', '42', 100, '81765044-62e9-5750-ac05-7c1ca6a60c6b', 'Paper 42 (A Level Structured Questions)', '{"source_page": 1, "source_document": "761526-physics-9702-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 42"}'::jsonb),
  ('00000000-0000-4000-8000-000000000088', '00000000-0000-4000-8000-000000000022', '52', 30,  'd155d9a6-5cb4-5667-8eb4-ed619625518c', 'Paper 52 (Planning, Analysis and Evaluation)', '{"source_page": 1, "source_document": "761526-physics-9702-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 52"}'::jsonb),
  -- Mathematics 9709 (5 variants: Pure 3, Stats 1, and Pure 1 variants 11, 12, 13)
  ('00000000-0000-4000-8000-000000000089', '00000000-0000-4000-8000-000000000023', '35', 75, '69ec93cb-e83f-5488-9ca1-0ed53ffa2503', 'Paper 35 (Pure Mathematics 3)', '{"source_page": 1, "source_document": "761530-mathematics-9709-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 35"}'::jsonb),
  ('00000000-0000-4000-8000-00000000008a', '00000000-0000-4000-8000-000000000023', '55', 50, '5fb10590-88f6-5430-8311-b5d0f9d685c7', 'Paper 55 (Probability & Statistics 1)', '{"source_page": 1, "source_document": "761530-mathematics-9709-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 55"}'::jsonb),
  ('00000000-0000-4000-8000-00000000008b', '00000000-0000-4000-8000-000000000023', '11', 75, '85180183-41d1-528f-8f3d-e2e0837aed83', 'Paper 11 (Pure Mathematics 1)', '{"source_page": 1, "source_document": "761530-mathematics-9709-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 11"}'::jsonb),
  ('00000000-0000-4000-8000-00000000008c', '00000000-0000-4000-8000-000000000023', '12', 75, '85180183-41d1-528f-8f3d-e2e0837aed83', 'Paper 12 (Pure Mathematics 1)', '{"source_page": 1, "source_document": "761530-mathematics-9709-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 12"}'::jsonb),
  ('00000000-0000-4000-8000-00000000008d', '00000000-0000-4000-8000-000000000023', '13', 75, '85180183-41d1-528f-8f3d-e2e0837aed83', 'Paper 13 (Pure Mathematics 1)', '{"source_page": 1, "source_document": "761530-mathematics-9709-june-2026-grade-threshold-table.pdf", "source_row_label": "Component 13"}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- ── 6. Table 6: grade_threshold_component_marks (65 rows) ─────────────────────
  INSERT INTO public.grade_threshold_component_marks (
    component_variant_id,
    grade,
    threshold_mark
  ) VALUES
  -- Chem 12 (max 40)
  ('00000000-0000-4000-8000-000000000081', 'A', 25),
  ('00000000-0000-4000-8000-000000000081', 'B', 22),
  ('00000000-0000-4000-8000-000000000081', 'C', 18),
  ('00000000-0000-4000-8000-000000000081', 'D', 14),
  ('00000000-0000-4000-8000-000000000081', 'E', 11),
  -- Chem 22 (max 60)
  ('00000000-0000-4000-8000-000000000082', 'A', 37),
  ('00000000-0000-4000-8000-000000000082', 'B', 27),
  ('00000000-0000-4000-8000-000000000082', 'C', 22),
  ('00000000-0000-4000-8000-000000000082', 'D', 18),
  ('00000000-0000-4000-8000-000000000082', 'E', 12),
  -- Chem 33 (max 40)
  ('00000000-0000-4000-8000-000000000083', 'A', 22),
  ('00000000-0000-4000-8000-000000000083', 'B', 17),
  ('00000000-0000-4000-8000-000000000083', 'C', 14),
  ('00000000-0000-4000-8000-000000000083', 'D', 12),
  ('00000000-0000-4000-8000-000000000083', 'E', 10),
  -- Phys 12 (max 40)
  ('00000000-0000-4000-8000-000000000084', 'A', 30),
  ('00000000-0000-4000-8000-000000000084', 'B', 25),
  ('00000000-0000-4000-8000-000000000084', 'C', 21),
  ('00000000-0000-4000-8000-000000000084', 'D', 18),
  ('00000000-0000-4000-8000-000000000084', 'E', 15),
  -- Phys 22 (max 60)
  ('00000000-0000-4000-8000-000000000085', 'A', 40),
  ('00000000-0000-4000-8000-000000000085', 'B', 35),
  ('00000000-0000-4000-8000-000000000085', 'C', 30),
  ('00000000-0000-4000-8000-000000000085', 'D', 24),
  ('00000000-0000-4000-8000-000000000085', 'E', 17),
  -- Phys 33 (max 40)
  ('00000000-0000-4000-8000-000000000086', 'A', 33),
  ('00000000-0000-4000-8000-000000000086', 'B', 30),
  ('00000000-0000-4000-8000-000000000086', 'C', 26),
  ('00000000-0000-4000-8000-000000000086', 'D', 23),
  ('00000000-0000-4000-8000-000000000086', 'E', 20),
  -- Phys 42 (max 100)
  ('00000000-0000-4000-8000-000000000087', 'A', 62),
  ('00000000-0000-4000-8000-000000000087', 'B', 51),
  ('00000000-0000-4000-8000-000000000087', 'C', 41),
  ('00000000-0000-4000-8000-000000000087', 'D', 31),
  ('00000000-0000-4000-8000-000000000087', 'E', 21),
  -- Phys 52 (max 30)
  ('00000000-0000-4000-8000-000000000088', 'A', 20),
  ('00000000-0000-4000-8000-000000000088', 'B', 17),
  ('00000000-0000-4000-8000-000000000088', 'C', 14),
  ('00000000-0000-4000-8000-000000000088', 'D', 11),
  ('00000000-0000-4000-8000-000000000088', 'E', 8),
  -- Math 35 (max 75)
  ('00000000-0000-4000-8000-000000000089', 'A', 55),
  ('00000000-0000-4000-8000-000000000089', 'B', 48),
  ('00000000-0000-4000-8000-000000000089', 'C', 38),
  ('00000000-0000-4000-8000-000000000089', 'D', 27),
  ('00000000-0000-4000-8000-000000000089', 'E', 16),
  -- Math 55 (max 50)
  ('00000000-0000-4000-8000-00000000008a', 'A', 45),
  ('00000000-0000-4000-8000-00000000008a', 'B', 41),
  ('00000000-0000-4000-8000-00000000008a', 'C', 32),
  ('00000000-0000-4000-8000-00000000008a', 'D', 22),
  ('00000000-0000-4000-8000-00000000008a', 'E', 13),
  -- Math 11 (max 75)
  ('00000000-0000-4000-8000-00000000008b', 'A', 59),
  ('00000000-0000-4000-8000-00000000008b', 'B', 48),
  ('00000000-0000-4000-8000-00000000008b', 'C', 37),
  ('00000000-0000-4000-8000-00000000008b', 'D', 26),
  ('00000000-0000-4000-8000-00000000008b', 'E', 15),
  -- Math 12 (max 75)
  ('00000000-0000-4000-8000-00000000008c', 'A', 61),
  ('00000000-0000-4000-8000-00000000008c', 'B', 51),
  ('00000000-0000-4000-8000-00000000008c', 'C', 37),
  ('00000000-0000-4000-8000-00000000008c', 'D', 23),
  ('00000000-0000-4000-8000-00000000008c', 'E', 10),
  -- Math 13 (max 75)
  ('00000000-0000-4000-8000-00000000008d', 'A', 61),
  ('00000000-0000-4000-8000-00000000008d', 'B', 52),
  ('00000000-0000-4000-8000-00000000008d', 'C', 39),
  ('00000000-0000-4000-8000-00000000008d', 'D', 26),
  ('00000000-0000-4000-8000-00000000008d', 'E', 13)
  ON CONFLICT (component_variant_id, grade) DO NOTHING;

  -- ── 7. Table 7: grade_threshold_variant_benchmark_groups (1 row) ────────────
  INSERT INTO public.grade_threshold_variant_benchmark_groups (
    id,
    publication_id,
    subject_paper_id,
    component_grade,
    raw_maximum_mark,
    approval_status,
    approved_by,
    approved_at,
    approval_notes
  ) VALUES (
    '00000000-0000-4000-8000-000000000061',
    '00000000-0000-4000-8000-000000000023',
    '85180183-41d1-528f-8f3d-e2e0837aed83',
    'A',
    75,
    'approved',
    'm5-preflight-auditor',
    '2026-08-10 12:00:00+00',
    'Preflight benchmark group for Math Pure 1 Grade A'
  ) ON CONFLICT (id) DO NOTHING;

  -- ── 8. Table 8: grade_threshold_variant_benchmark_members (3 rows) ───────────
  INSERT INTO public.grade_threshold_variant_benchmark_members (
    group_id,
    component_variant_id
  ) VALUES
  ('00000000-0000-4000-8000-000000000061', '00000000-0000-4000-8000-00000000008b'),
  ('00000000-0000-4000-8000-000000000061', '00000000-0000-4000-8000-00000000008c'),
  ('00000000-0000-4000-8000-000000000061', '00000000-0000-4000-8000-00000000008d')
  ON CONFLICT (group_id, component_variant_id) DO NOTHING;

  -- ── 9. Table 9: grade_threshold_combinations (3 rows) ─────────────────────────
  INSERT INTO public.grade_threshold_combinations (
    id,
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
  ) VALUES
  -- Chemistry 9701 Option S3 (AS-only)
  (
    '00000000-0000-4000-8000-0000000000c1',
    '00000000-0000-4000-8000-000000000021',
    '12,22,33',
    'Option S3',
    'Option S3 (12, 22, 33)',
    'as',
    'as_only',
    130,
    'raw_total',
    'eligible',
    '381f1cd1-0472-55bb-9dc8-98bf03d00f23',
    '{"option_code": "S3"}'::jsonb
  ),
  -- Physics 9702 Option AY (Full A-Level)
  (
    '00000000-0000-4000-8000-0000000000c2',
    '00000000-0000-4000-8000-000000000022',
    '12,22,33,42,52',
    'Option AY',
    'Option AY (12, 22, 33, 42, 52)',
    'a_level',
    'full_level',
    260,
    'raw_total',
    'eligible',
    '66eb6ce0-5911-574a-acdc-ae6f292f176e',
    '{"option_code": "AY"}'::jsonb
  ),
  -- Mathematics 9709 Option DC (Staged: P3, P5, Carry-Forward 82)
  (
    '00000000-0000-4000-8000-0000000000c3',
    '00000000-0000-4000-8000-000000000023',
    '35,55,82',
    'Option DC',
    'Option DC (35, 55, 82)',
    'a_level',
    'staged',
    250,
    'raw_total',
    'eligible',
    '99578e02-66ae-53b0-9d67-ed86804a17a9',
    '{"option_code": "DC"}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  -- ── 10. Table 10: grade_threshold_combination_tokens (11 rows) ────────────────
  INSERT INTO public.grade_threshold_combination_tokens (
    id,
    combination_id,
    token_position,
    raw_token,
    token_kind,
    stage,
    resolved_component_variant_id,
    maximum_mark,
    weighting_factor,
    weighting_entry_id,
    carry_forward_mapping_status,
    mapping_reviewed_by,
    mapping_reviewed_at,
    source_token_metadata
  ) VALUES
  -- Chemistry S3 (3 component_variant tokens)
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 1, '12', 'component_variant', 'as', '00000000-0000-4000-8000-000000000081', 40, 1.00000000, '00000000-0000-4000-8000-000000000041', NULL, NULL, NULL, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', 2, '22', 'component_variant', 'as', '00000000-0000-4000-8000-000000000082', 60, 1.00000000, '00000000-0000-4000-8000-000000000042', NULL, NULL, NULL, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c1', 3, '33', 'component_variant', 'as', '00000000-0000-4000-8000-000000000083', 40, 0.75000000, '00000000-0000-4000-8000-000000000043', NULL, NULL, NULL, '{}'::jsonb),
  -- Physics AY (5 component_variant tokens)
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000c2', 1, '12', 'component_variant', 'as', '00000000-0000-4000-8000-000000000084', 40,  1.00000000, '00000000-0000-4000-8000-000000000044', NULL, NULL, NULL, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000c2', 2, '22', 'component_variant', 'as', '00000000-0000-4000-8000-000000000085', 60,  1.00000000, '00000000-0000-4000-8000-000000000045', NULL, NULL, NULL, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-0000000000c2', 3, '33', 'component_variant', 'as', '00000000-0000-4000-8000-000000000086', 40,  0.75000000, '00000000-0000-4000-8000-000000000046', NULL, NULL, NULL, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000d7', '00000000-0000-4000-8000-0000000000c2', 4, '42', 'component_variant', 'a2', '00000000-0000-4000-8000-000000000087', 100, 1.00000000, '00000000-0000-4000-8000-000000000047', NULL, NULL, NULL, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000c2', 5, '52', 'component_variant', 'a2', '00000000-0000-4000-8000-000000000088', 30,  1.00000000, '00000000-0000-4000-8000-000000000048', NULL, NULL, NULL, '{}'::jsonb),
  -- Mathematics DC (2 component_variant tokens in sitting order + 1 carry_forward token)
  ('00000000-0000-4000-8000-0000000000d9', '00000000-0000-4000-8000-0000000000c3', 1, '35', 'component_variant', 'a2', '00000000-0000-4000-8000-000000000089', 75,  1.00000000, '00000000-0000-4000-8000-000000000049', NULL, NULL, NULL, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000da', '00000000-0000-4000-8000-0000000000c3', 2, '55', 'component_variant', 'a2', '00000000-0000-4000-8000-00000000008a', 50,  1.00000000, '00000000-0000-4000-8000-00000000004a', NULL, NULL, NULL, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000db', '00000000-0000-4000-8000-0000000000c3', 3, '82', 'carry_forward',     'as', NULL,                                    125, 1.00000000, '00000000-0000-4000-8000-00000000004b', 'approved', 'm5-preflight-auditor', '2026-08-10 12:00:00+00', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- ── 11. Table 11: grade_threshold_combination_marks (17 rows) ─────────────────
  INSERT INTO public.grade_threshold_combination_marks (
    id,
    combination_id,
    grade,
    threshold_mark
  ) VALUES
  -- Chem S3 (5 marks: a, b, c, d, e)
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'a', 79),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1', 'b', 62),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000c1', 'c', 51),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000c1', 'd', 41),
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000c1', 'e', 31),
  -- Phys AY (6 marks: A*, A, B, C, D, E)
  ('00000000-0000-4000-8000-0000000000e6', '00000000-0000-4000-8000-0000000000c2', 'A*', 203),
  ('00000000-0000-4000-8000-0000000000e7', '00000000-0000-4000-8000-0000000000c2', 'A',  177),
  ('00000000-0000-4000-8000-0000000000e8', '00000000-0000-4000-8000-0000000000c2', 'B',  151),
  ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000c2', 'C',  126),
  ('00000000-0000-4000-8000-0000000000ea', '00000000-0000-4000-8000-0000000000c2', 'D',  101),
  ('00000000-0000-4000-8000-0000000000eb', '00000000-0000-4000-8000-0000000000c2', 'E',  76),
  -- Math DC (6 marks: A*, A, B, C, D, E)
  ('00000000-0000-4000-8000-0000000000ec', '00000000-0000-4000-8000-0000000000c3', 'A*', 227),
  ('00000000-0000-4000-8000-0000000000ed', '00000000-0000-4000-8000-0000000000c3', 'A',  205),
  ('00000000-0000-4000-8000-0000000000ee', '00000000-0000-4000-8000-0000000000c3', 'B',  178),
  ('00000000-0000-4000-8000-0000000000ef', '00000000-0000-4000-8000-0000000000c3', 'C',  137),
  ('00000000-0000-4000-8000-0000000000f0', '00000000-0000-4000-8000-0000000000c3', 'D',  96),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c3', 'E',  56)
  ON CONFLICT (id) DO NOTHING;

END;
$$;
