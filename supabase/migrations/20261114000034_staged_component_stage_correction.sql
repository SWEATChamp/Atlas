-- =============================================================================
-- Migration 034: Forward-Only Staged Component Token Stage Correction (Milestone 5 Slice 2A)
--
-- Context:
--   During initial official grade-threshold ingestion for June 2026, the importer
--   consulted `subject_papers.default_stage` for staged sitting question papers.
--   Because Cambridge Mathematics 9709 (Papers 4 & 5) and Further Mathematics 9231
--   (Papers 3 & 4) carry syllabus default stages of 'as', their sitting component
--   variant tokens in staged A-Level combinations were incorrectly assigned stage = 'as'.
--
--   In Cambridge staged assessment, the AS portion of the qualification is represented
--   solely by the carry-forward token (stage = 'as'). All sitting question papers sat
--   in that exam series belong to the A2 qualification sitting and must have stage = 'a2'.
--
-- Clean Database & Empty Catalogue Compatibility:
--   - If no active published June 2026 publication exists for 9709 or 9231 (e.g. clean/fresh
--     database or environment where thresholds have not yet been ingested), the migration
--     emits a descriptive notice and exits cleanly as a safe no-op. Future threshold imports
--     will use the corrected Slice 1 importer.
--
-- Fail-Closed Catalogue Resolution:
--   - If any target publication exists, the complete expected catalogue must resolve exactly:
--       - Both 9709 and 9231 active published June 2026 publications present
--       - Exactly 40 distinct allowlisted component variant tokens matched
--       - Subject split: exactly 16 for 9709 and 24 for 9231
--       - Staged parent combination (`route_type = 'staged'`)
--       - Component variant token (`token_kind = 'component_variant'`)
--       - Zero unallowlisted component variant tokens with stage = 'as' in target publications
--       - Zero tokens with unexpected/NULL stages
--       - Strictly all-as initial state or all-a2 already-applied state
--   - Rejects partial publication presence, missing targets, duplicate resolution,
--     unexpected extra defective tokens, mixed as/a2 state, and invalid stages.
--
-- Strict Non-Modification Guarantees:
--   - Updates ONLY `grade_threshold_combination_tokens.stage`.
--   - Does NOT modify carry-forward mapping status (`carry_forward_mapping_status`).
--   - Does NOT modify reviewer metadata (`mapping_reviewed_by`, `mapping_reviewed_at`, `review_metadata`).
--   - Does NOT modify planner eligibility (`planner_eligibility`).
--   - Does NOT modify Atlas route assignments (`atlas_route_id`).
--   - Does NOT modify weighting data, publications, marks, or variant tables.
--   - Does NOT modify AS-only or full-level (linear) combinations.
--   - Does NOT modify any student-owned tables or user data.
--   - Does NOT promote combinations or approve carry-forward mappings.
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.apply_stage_correction_034()
RETURNS VOID
LANGUAGE plpgsql
AS $m034$
DECLARE
  v_target_pub_count       INTEGER;
  v_allowlist_count        INTEGER := 40;
  v_allowlist_actual       INTEGER;
  v_matched_count          INTEGER;
  v_distinct_token_count   INTEGER;
  v_as_count               INTEGER;
  v_a2_count               INTEGER;
  v_other_stage_count      INTEGER;
  v_maths_count            INTEGER;
  v_fm_count               INTEGER;
  v_unallowlisted_count    INTEGER;
  v_updated_count          INTEGER;
  v_post_check_count       INTEGER;
BEGIN
  -- ─── 1. Detect genuinely empty target catalogue ─────────────────────────────
  -- On a clean/fresh database where official thresholds have not yet been imported,
  -- no active published June 2026 publications exist for 9709 or 9231.
  -- In this case, perform a safe no-op. Future imports will use the corrected Slice 1 importer.
  SELECT COUNT(*)
  INTO v_target_pub_count
  FROM public.grade_threshold_publications p
  JOIN public.subjects s ON s.id = p.subject_id
  WHERE s.code IN ('9709', '9231')
    AND p.exam_year = 2026
    AND p.exam_series = 'june'
    AND p.publication_status = 'published'
    AND p.is_active = TRUE;

  IF v_target_pub_count = 0 THEN
    RAISE NOTICE 'Migration 034 (Slice 2A): No active published June 2026 publications found for 9709 or 9231 (clean database / empty target catalogue). Safe no-op; future imports will use corrected Slice 1 importer.';
    RETURN;
  END IF;

  -- ─── 2. Fail closed on partial publication state ────────────────────────────
  -- If any target publication exists, both 9709 and 9231 must be fully present.
  IF v_target_pub_count <> 2 THEN
    RAISE EXCEPTION 'Catalogue integrity error: expected exactly 2 target publications (9709 and 9231 for June 2026), found %.',
      v_target_pub_count;
  END IF;

  -- ─── 3. Create temporary allowlist table (safe for same-session rerun) ──────
  DROP TABLE IF EXISTS _m5_slice2a_allowlist;
  CREATE TEMP TABLE _m5_slice2a_allowlist (
    syllabus_code  TEXT NOT NULL CHECK (syllabus_code IN ('9709', '9231')),
    exam_year      SMALLINT NOT NULL CHECK (exam_year = 2026),
    exam_series    TEXT NOT NULL CHECK (exam_series = 'june'),
    canonical_key  TEXT NOT NULL,
    token_position SMALLINT NOT NULL CHECK (token_position > 0),
    raw_token      TEXT NOT NULL,
    PRIMARY KEY (syllabus_code, exam_year, exam_series, canonical_key, token_position)
  ) ON COMMIT DROP;

  -- ─── 4. Populate exact 40 allowlisted rows ──────────────────────────────────
  INSERT INTO _m5_slice2a_allowlist (syllabus_code, exam_year, exam_series, canonical_key, token_position, raw_token)
  VALUES
    -- Further Mathematics 9231 (24 tokens across 24 staged combinations)
    ('9231', 2026, 'june', '21,31,87', 2, '31'),
    ('9231', 2026, 'june', '21,31,97', 2, '31'),
    ('9231', 2026, 'june', '21,31,99', 2, '31'),
    ('9231', 2026, 'june', '21,41,84', 2, '41'),
    ('9231', 2026, 'june', '21,41,94', 2, '41'),
    ('9231', 2026, 'june', '21,41,96', 2, '41'),
    ('9231', 2026, 'june', '22,32,88', 2, '32'),
    ('9231', 2026, 'june', '22,32,97', 2, '32'),
    ('9231', 2026, 'june', '22,32,98', 2, '32'),
    ('9231', 2026, 'june', '22,42,85', 2, '42'),
    ('9231', 2026, 'june', '22,42,94', 2, '42'),
    ('9231', 2026, 'june', '22,42,95', 2, '42'),
    ('9231', 2026, 'june', '23,33,89', 2, '33'),
    ('9231', 2026, 'june', '23,33,91', 2, '33'),
    ('9231', 2026, 'june', '23,33,98', 2, '33'),
    ('9231', 2026, 'june', '23,33,99', 2, '33'),
    ('9231', 2026, 'june', '23,43,86', 2, '43'),
    ('9231', 2026, 'june', '23,43,92', 2, '43'),
    ('9231', 2026, 'june', '23,43,95', 2, '43'),
    ('9231', 2026, 'june', '23,43,96', 2, '43'),
    ('9231', 2026, 'june', '24,34,63', 2, '34'),
    ('9231', 2026, 'june', '24,34,73', 2, '34'),
    ('9231', 2026, 'june', '24,44,62', 2, '44'),
    ('9231', 2026, 'june', '24,44,72', 2, '44'),

    -- Mathematics 9709 (16 tokens across 16 staged combinations)
    ('9709', 2026, 'june', '31,41,87', 2, '41'),
    ('9709', 2026, 'june', '31,41,97', 2, '41'),
    ('9709', 2026, 'june', '31,51,84', 2, '51'),
    ('9709', 2026, 'june', '31,51,94', 2, '51'),
    ('9709', 2026, 'june', '32,42,88', 2, '42'),
    ('9709', 2026, 'june', '32,42,98', 2, '42'),
    ('9709', 2026, 'june', '32,52,85', 2, '52'),
    ('9709', 2026, 'june', '32,52,95', 2, '52'),
    ('9709', 2026, 'june', '33,43,89', 2, '43'),
    ('9709', 2026, 'june', '33,43,99', 2, '43'),
    ('9709', 2026, 'june', '33,53,86', 2, '53'),
    ('9709', 2026, 'june', '33,53,96', 2, '53'),
    ('9709', 2026, 'june', '35,45,83', 2, '45'),
    ('9709', 2026, 'june', '35,45,93', 2, '45'),
    ('9709', 2026, 'june', '35,55,82', 2, '55'),
    ('9709', 2026, 'june', '35,55,92', 2, '55');

  -- Verify allowlist table contains exactly 40 entries
  SELECT COUNT(*) INTO v_allowlist_actual FROM _m5_slice2a_allowlist;
  IF v_allowlist_actual <> v_allowlist_count THEN
    RAISE EXCEPTION 'Allowlist integrity error: expected % rows in allowlist definition, found %.',
      v_allowlist_count, v_allowlist_actual;
  END IF;

  -- ─── 5. Query matching tokens and inspect current states ───────────────────
  SELECT
    COUNT(*),
    COUNT(DISTINCT t.id),
    COUNT(*) FILTER (WHERE t.stage = 'as'),
    COUNT(*) FILTER (WHERE t.stage = 'a2'),
    COUNT(*) FILTER (WHERE t.stage NOT IN ('as', 'a2') OR t.stage IS NULL),
    COUNT(*) FILTER (WHERE a.syllabus_code = '9709'),
    COUNT(*) FILTER (WHERE a.syllabus_code = '9231')
  INTO
    v_matched_count,
    v_distinct_token_count,
    v_as_count,
    v_a2_count,
    v_other_stage_count,
    v_maths_count,
    v_fm_count
  FROM _m5_slice2a_allowlist a
  JOIN public.subjects s
    ON s.code = a.syllabus_code
  JOIN public.grade_threshold_publications p
    ON p.subject_id = s.id
   AND p.exam_year = a.exam_year
   AND p.exam_series = a.exam_series
   AND p.publication_status = 'published'
   AND p.is_active = TRUE
  JOIN public.grade_threshold_combinations c
    ON c.publication_id = p.id
   AND c.canonical_key = a.canonical_key
   AND c.route_type = 'staged'
  JOIN public.grade_threshold_combination_tokens t
    ON t.combination_id = c.id
   AND t.token_position = a.token_position
   AND t.raw_token = a.raw_token
   AND t.token_kind = 'component_variant';

  -- Ensure all 40 allowlist entries match exactly 40 unique tokens (fail closed on missing or duplicate)
  IF v_matched_count <> v_allowlist_count OR v_distinct_token_count <> v_allowlist_count THEN
    RAISE EXCEPTION 'Catalogue match integrity error: expected % distinct tokens matched, found % (distinct: %).',
      v_allowlist_count, v_matched_count, v_distinct_token_count;
  END IF;

  -- Ensure exact subject split (16 for 9709, 24 for 9231)
  IF v_maths_count <> 16 OR v_fm_count <> 24 THEN
    RAISE EXCEPTION 'Subject split integrity error: expected 16 for 9709 and 24 for 9231, found % and %.',
      v_maths_count, v_fm_count;
  END IF;

  -- Ensure no token possesses an unexpected or NULL stage
  IF v_other_stage_count > 0 THEN
    RAISE EXCEPTION 'Token integrity error: found % tokens with invalid stage (neither as nor a2).',
      v_other_stage_count;
  END IF;

  -- ─── 6. Check for unallowlisted defect tokens in the target publications ────
  SELECT COUNT(*)
  INTO v_unallowlisted_count
  FROM public.grade_threshold_combination_tokens t
  JOIN public.grade_threshold_combinations c ON c.id = t.combination_id
  JOIN public.grade_threshold_publications p ON p.id = c.publication_id
  JOIN public.subjects s ON s.id = p.subject_id
  WHERE p.exam_year = 2026
    AND p.exam_series = 'june'
    AND p.publication_status = 'published'
    AND p.is_active = TRUE
    AND s.code IN ('9709', '9231')
    AND c.route_type = 'staged'
    AND t.token_kind = 'component_variant'
    AND t.stage = 'as'
    AND NOT EXISTS (
      SELECT 1
      FROM _m5_slice2a_allowlist a
      WHERE a.syllabus_code = s.code
        AND a.exam_year = p.exam_year
        AND a.exam_series = p.exam_series
        AND a.canonical_key = c.canonical_key
        AND a.token_position = t.token_position
        AND a.raw_token = t.raw_token
    );

  IF v_unallowlisted_count > 0 THEN
    RAISE EXCEPTION 'Allowlist completeness error: found % staged component_variant tokens with stage = as outside the allowlist.',
      v_unallowlisted_count;
  END IF;

  -- ─── 7. State Guard & Idempotency Boundary ──────────────────────────────────
  -- We strictly accept:
  --   Case A: exactly 40 'as' tokens and 0 'a2' tokens -> un-migrated clean state, perform update.
  --   Case B: 0 'as' tokens and exactly 40 'a2' tokens -> fully migrated state, safe idempotent no-op.
  -- Any partial or mixed state is rejected.
  IF v_as_count = v_allowlist_count AND v_a2_count = 0 THEN
    WITH target_token_ids AS (
      SELECT t.id
      FROM _m5_slice2a_allowlist a
      JOIN public.subjects s
        ON s.code = a.syllabus_code
      JOIN public.grade_threshold_publications p
        ON p.subject_id = s.id
       AND p.exam_year = a.exam_year
       AND p.exam_series = a.exam_series
       AND p.publication_status = 'published'
       AND p.is_active = TRUE
      JOIN public.grade_threshold_combinations c
        ON c.publication_id = p.id
       AND c.canonical_key = a.canonical_key
       AND c.route_type = 'staged'
      JOIN public.grade_threshold_combination_tokens t
        ON t.combination_id = c.id
       AND t.token_position = a.token_position
       AND t.raw_token = a.raw_token
       AND t.token_kind = 'component_variant'
      WHERE t.stage = 'as'
    )
    UPDATE public.grade_threshold_combination_tokens
    SET stage = 'a2'
    WHERE id IN (SELECT id FROM target_token_ids);

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> v_allowlist_count THEN
      RAISE EXCEPTION 'Update verification failure: expected % rows updated, actual was %.',
        v_allowlist_count, v_updated_count;
    END IF;

    RAISE NOTICE 'Migration 034 (Slice 2A): Successfully corrected % staged component tokens from as to a2.',
      v_updated_count;

  ELSIF v_as_count = 0 AND v_a2_count = v_allowlist_count THEN
    RAISE NOTICE 'Migration 034 (Slice 2A): All % allowlisted tokens are already stage = a2. Idempotent no-op.',
      v_allowlist_count;

  ELSE
    RAISE EXCEPTION 'Idempotency guard rejected partial state: as_count=%, a2_count=%. Migration requires either exactly % as tokens (to apply) or exactly % a2 tokens (no-op).',
      v_as_count, v_a2_count, v_allowlist_count, v_allowlist_count;
  END IF;

  -- ─── 8. Post-execution verification ─────────────────────────────────────────
  SELECT COUNT(*)
  INTO v_post_check_count
  FROM _m5_slice2a_allowlist a
  JOIN public.subjects s
    ON s.code = a.syllabus_code
  JOIN public.grade_threshold_publications p
    ON p.subject_id = s.id
   AND p.exam_year = a.exam_year
   AND p.exam_series = a.exam_series
   AND p.publication_status = 'published'
   AND p.is_active = TRUE
  JOIN public.grade_threshold_combinations c
    ON c.publication_id = p.id
   AND c.canonical_key = a.canonical_key
   AND c.route_type = 'staged'
  JOIN public.grade_threshold_combination_tokens t
    ON t.combination_id = c.id
   AND t.token_position = a.token_position
   AND t.raw_token = a.raw_token
   AND t.token_kind = 'component_variant'
  WHERE t.stage = 'a2';

  IF v_post_check_count <> v_allowlist_count THEN
    RAISE EXCEPTION 'Post-migration assertion failed: expected % tokens with stage = a2, actual found %.',
      v_allowlist_count, v_post_check_count;
  END IF;

  -- Clean up temporary allowlist table for safe same-session reruns
  DROP TABLE IF EXISTS _m5_slice2a_allowlist;

END;
$m034$;

SELECT pg_temp.apply_stage_correction_034();
