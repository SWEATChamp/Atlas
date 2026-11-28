-- =============================================================================
-- DIAGNOSTIC: Milestone 5 Gate 4 Preview Route & Threshold Read-Only Audit
--
-- File: supabase/tests/fixtures/milestone_5_hosted_smoke/diagnose_preview_routes.sql
--
-- Purpose:
--   Read-only diagnostic for investigating why specific routes (e.g. 9709
--   full_mech_stats, 9231 full_all) resolve or fail to resolve in Preview,
--   using the visible smoke username without printing UUIDs, emails,
--   credentials, URLs, or project refs.
--
-- Usage (psql):
--   psql "$CONN" -X -v ON_ERROR_STOP=1 -v smoke_username='<visible_username>' \
--     -f supabase/tests/fixtures/milestone_5_hosted_smoke/diagnose_preview_routes.sql
-- =============================================================================

\pset pager off
\pset format aligned
\pset border 2

BEGIN TRANSACTION READ ONLY;

-- ── 1. Project Ledger & Migration Identity (No URLs/Refs/Credentials) ────────
SELECT '=== 1. DATABASE & MIGRATION LEDGER ===' AS section;

SELECT
  current_database() AS database_name,
  current_user AS session_user,
  (SELECT count(*)::int FROM supabase_migrations.schema_migrations) AS migration_count,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS latest_migration;

-- ── 2. Exact Case-Insensitive Smoke Username Resolution (Fail-Closed) ────────
SELECT '=== 2. IDENTITY SANITY (NON-SENSITIVE) ===' AS section;

SELECT set_config(
  'atlas.diag_smoke_input',
  :'smoke_username',
  true
) IS NOT NULL AS smoke_input_captured;

DO $$
DECLARE
  v_raw_input text := current_setting('atlas.diag_smoke_input', true);
  v_norm text;
  v_match_count int := 0;
  v_user_id uuid;
  v_via_lower boolean := false;
  v_via_username boolean := false;
  v_method text;
  v_norm_match boolean := false;
BEGIN
  IF v_raw_input IS NULL OR length(btrim(v_raw_input)) = 0 THEN
    RAISE EXCEPTION 'DIAG_IDENTITY_ERROR: smoke_username must be non-empty';
  END IF;

  v_norm := lower(ltrim(btrim(v_raw_input), '@'));
  IF length(v_norm) = 0 THEN
    RAISE EXCEPTION 'DIAG_IDENTITY_ERROR: smoke_username normalized to empty string';
  END IF;

  WITH matched AS (
    SELECT
      p.id,
      (p.username_lower = v_norm) AS matched_lower,
      (lower(btrim(p.username)) = v_norm) AS matched_username,
      coalesce(p.username_lower, lower(btrim(p.username))) AS stored_norm
    FROM public.profiles p
    WHERE p.username_lower = v_norm
       OR lower(btrim(p.username)) = v_norm
  )
  SELECT
    count(DISTINCT id)::int,
    min(id::text)::uuid,
    bool_or(matched_lower),
    bool_or(matched_username),
    bool_or(stored_norm = v_norm)
  INTO
    v_match_count,
    v_user_id,
    v_via_lower,
    v_via_username,
    v_norm_match
  FROM matched;

  IF v_match_count = 0 THEN
    RAISE EXCEPTION 'DIAG_IDENTITY_ERROR: Zero profiles matched supplied smoke_username';
  END IF;

  IF v_match_count > 1 THEN
    RAISE EXCEPTION 'DIAG_IDENTITY_ERROR: Ambiguous smoke_username matched % distinct profiles', v_match_count;
  END IF;

  IF v_via_lower THEN
    v_method := 'username_lower';
  ELSIF v_via_username THEN
    v_method := 'username_fallback';
  ELSE
    v_method := 'unknown';
  END IF;

  PERFORM set_config('atlas.diag_user_id', v_user_id::text, true);
  PERFORM set_config('atlas.diag_res_method', v_method, true);
  PERFORM set_config('atlas.diag_match_count', v_match_count::text, true);
  PERFORM set_config('atlas.diag_norm_match', v_norm_match::text, true);
END
$$;

SELECT
  'RESOLVED'::text AS resolution_status,
  current_setting('atlas.diag_res_method', true) AS resolution_method,
  current_setting('atlas.diag_match_count', true)::int AS matched_profile_count,
  (
    SELECT count(*)::int
    FROM public.user_subjects us
    JOIN public.subjects s ON s.id = us.subject_id
    WHERE us.user_id = current_setting('atlas.diag_user_id', true)::uuid
      AND s.code IN ('9709', '9231', '9701', '9702', '9618')
  ) AS enrolled_mvp_subject_count,
  current_setting('atlas.diag_norm_match', true)::boolean AS normalized_username_match;

-- ── 3. Owner-Role Capture: user_subjects & subject_paper_selections ──────────
SELECT '=== 3. OWNER VIEW: USER_SUBJECTS (MVP SUBJECTS) ===' AS section;

SELECT
  s.code AS subject_code,
  us.study_route,
  us.current_stage,
  us.target_grade,
  us.exam_date,
  us.is_archived,
  us.updated_at
FROM public.user_subjects us
JOIN public.subjects s ON s.id = us.subject_id
WHERE us.user_id = current_setting('atlas.diag_user_id', true)::uuid
ORDER BY s.code;

SELECT '=== 4. OWNER VIEW: SUBJECT_PAPER_SELECTIONS ===' AS section;

SELECT
  s.code AS subject_code,
  us.study_route,
  (sps.subject_paper_id IS NOT NULL) AS has_subject_paper_id,
  sp.paper_number AS catalog_paper_number,
  sps.paper_number AS selection_paper_number,
  sps.component_name,
  sps.stage,
  sps.created_at
FROM public.subject_paper_selections sps
JOIN public.user_subjects us ON us.id = sps.user_subject_id
JOIN public.subjects s ON s.id = us.subject_id
LEFT JOIN public.subject_papers sp ON sp.id = sps.subject_paper_id
WHERE us.user_id = current_setting('atlas.diag_user_id', true)::uuid
ORDER BY s.code, sps.stage, coalesce(sp.paper_number, sps.paper_number), sps.component_name;

-- ── 5. Selection vs Canonical Route Comparison ───────────────────────────────
SELECT '=== 5. ROUTE MATCHING: SELECTIONS VS SUBJECT_VALID_ROUTES ===' AS section;

WITH target_user_subjects AS (
  SELECT
    us.id AS target_us_id,
    us.subject_id,
    s.code AS subject_code,
    us.study_route
  FROM public.user_subjects us
  JOIN public.subjects s ON s.id = us.subject_id
  WHERE us.user_id = current_setting('atlas.diag_user_id', true)::uuid
),
route_deltas AS (
  SELECT
    tus.subject_code,
    tus.study_route,
    svr.combination_key,
    (
      SELECT count(*)::int
      FROM public.subject_paper_selections sps
      WHERE sps.user_subject_id = tus.target_us_id
    ) AS user_selection_count,
    (
      SELECT count(*)::int
      FROM public.subject_paper_selections sps
      WHERE sps.user_subject_id = tus.target_us_id
        AND sps.subject_paper_id IS NULL
    ) AS null_paper_id_count,
    (
      SELECT count(*)::int
      FROM public.subject_route_papers srp
      WHERE srp.route_id = svr.id
    ) AS route_paper_count,
    (
      SELECT count(*)::int
      FROM public.subject_route_papers srp
      WHERE srp.route_id = svr.id
        AND NOT EXISTS (
          SELECT 1
          FROM public.subject_paper_selections sps
          WHERE sps.user_subject_id = tus.target_us_id
            AND sps.subject_paper_id = srp.subject_paper_id
            AND sps.stage = srp.stage
        )
    ) AS missing_from_user_selections,
    (
      SELECT count(*)::int
      FROM public.subject_paper_selections sps
      WHERE sps.user_subject_id = tus.target_us_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.subject_route_papers srp
          WHERE srp.route_id = svr.id
            AND srp.subject_paper_id = sps.subject_paper_id
            AND srp.stage = sps.stage
        )
    ) AS extra_or_stage_mismatched_in_user
  FROM target_user_subjects tus
  JOIN public.subject_valid_routes svr
    ON svr.subject_id = tus.subject_id
   AND svr.route = tus.study_route
)
SELECT
  subject_code,
  study_route,
  combination_key,
  user_selection_count,
  null_paper_id_count,
  route_paper_count,
  missing_from_user_selections,
  extra_or_stage_mismatched_in_user,
  (
    missing_from_user_selections = 0
    AND extra_or_stage_mismatched_in_user = 0
    AND null_paper_id_count = 0
  ) AS exact_route_match
FROM route_deltas
ORDER BY subject_code, exact_route_match DESC, combination_key;

-- ── 6. Live June 2026 Publications & Published Combinations (Owner View) ─────
SELECT '=== 6. OWNER VIEW: LIVE JUNE 2026 PUBLICATIONS ===' AS section;

SELECT
  s.code AS subject_code,
  p.exam_year,
  p.exam_series,
  p.publication_status,
  p.is_active,
  p.official_published_on,
  p.published_at
FROM public.grade_threshold_publications p
JOIN public.subjects s ON s.id = p.subject_id
WHERE p.exam_year = 2026 AND p.exam_series = 'june'
ORDER BY s.code, p.published_at DESC NULLS LAST;

SELECT '=== 7. OWNER VIEW: PUBLISHED COMBINATIONS FOR 9709 & 9231 ===' AS section;

SELECT
  s.code AS subject_code,
  svr.combination_key,
  pgtc.canonical_key,
  pgtc.route_type,
  pgtc.planner_eligibility,
  pgtc.maximum_mark,
  pgtc.per_paper_allocation_eligible,
  (
    SELECT string_agg(
      format('%s:%s(paper=%s)', t.raw_token, t.stage, coalesce(sp.paper_number::text, 'NULL')),
      ',' ORDER BY t.token_position
    )
    FROM public.grade_threshold_combination_tokens t
    LEFT JOIN public.grade_threshold_component_variants v ON v.id = t.resolved_component_variant_id
    LEFT JOIN public.subject_papers sp ON sp.id = v.subject_paper_id
    WHERE t.combination_id = pgtc.id
  ) AS tokens_summary,
  (
    SELECT string_agg(
      format('%s=%s', m.grade, m.threshold_mark),
      ',' ORDER BY m.grade
    )
    FROM public.grade_threshold_combination_marks m
    WHERE m.combination_id = pgtc.id AND m.grade IN ('A*', 'A', 'B')
  ) AS key_marks
FROM public.published_grade_threshold_combinations pgtc
JOIN public.grade_threshold_publications p ON p.id = pgtc.publication_id
JOIN public.subjects s ON s.id = p.subject_id
LEFT JOIN public.subject_valid_routes svr ON svr.id = pgtc.atlas_route_id
WHERE s.code IN ('9709', '9231')
  AND p.exam_year = 2026
  AND p.exam_series = 'june'
ORDER BY s.code, svr.combination_key, pgtc.canonical_key;

SELECT '=== 8. OWNER VIEW: BASE COMBINATIONS & WEIGHTING STATUS FOR TARGET ROUTES ===' AS section;

SELECT
  s.code AS subject_code,
  svr.combination_key,
  c.canonical_key,
  c.route_type,
  c.planner_eligibility,
  c.maximum_mark,
  count(t.id)::int AS token_count,
  count(we.id)::int AS linked_weighting_entry_count,
  count(ws.id) FILTER (WHERE ws.review_status = 'approved')::int AS approved_weighting_source_count
FROM public.grade_threshold_combinations c
JOIN public.grade_threshold_publications p ON p.id = c.publication_id
JOIN public.subjects s ON s.id = p.subject_id
LEFT JOIN public.subject_valid_routes svr ON svr.id = c.atlas_route_id
LEFT JOIN public.grade_threshold_combination_tokens t ON t.combination_id = c.id
LEFT JOIN public.grade_threshold_weighting_entries we ON we.id = t.weighting_entry_id
LEFT JOIN public.grade_threshold_weighting_sources ws ON ws.id = we.weighting_source_id
WHERE s.code IN ('9709', '9231')
  AND p.exam_year = 2026
  AND p.exam_series = 'june'
  AND (
    svr.combination_key IN ('full_mech_stats', 'full_stats_double', 'full_all')
    OR c.atlas_route_id IS NULL
  )
GROUP BY s.code, svr.combination_key, c.id, c.canonical_key, c.route_type, c.planner_eligibility, c.maximum_mark
ORDER BY s.code, svr.combination_key NULLS LAST, c.canonical_key;

-- ── 9. Owner vs Authenticated Role Visibility Comparison ─────────────────────
SELECT '=== 9. OWNER VS AUTHENTICATED ROLE VISIBILITY ===' AS section;

SELECT set_config(
  'atlas.diag_owner_counts',
  jsonb_build_object(
    'user_subjects', (SELECT count(*)::int FROM public.user_subjects WHERE user_id = current_setting('atlas.diag_user_id', true)::uuid),
    'subject_paper_selections', (SELECT count(*)::int FROM public.subject_paper_selections sps JOIN public.user_subjects us ON us.id = sps.user_subject_id WHERE us.user_id = current_setting('atlas.diag_user_id', true)::uuid),
    'subject_valid_routes', (SELECT count(*)::int FROM public.subject_valid_routes),
    'subject_route_papers', (SELECT count(*)::int FROM public.subject_route_papers),
    'subject_papers', (SELECT count(*)::int FROM public.subject_papers),
    'publications_june_2026', (SELECT count(*)::int FROM public.grade_threshold_publications WHERE exam_year = 2026 AND exam_series = 'june'),
    'published_combinations_9709_9231', (SELECT count(*)::int FROM public.published_grade_threshold_combinations pgtc JOIN public.grade_threshold_publications p ON p.id = pgtc.publication_id JOIN public.subjects s ON s.id = p.subject_id WHERE s.code IN ('9709', '9231') AND p.exam_year = 2026 AND p.exam_series = 'june'),
    'published_combinations_9709_mech_stats', (SELECT count(*)::int FROM public.published_grade_threshold_combinations pgtc JOIN public.subject_valid_routes svr ON svr.id = pgtc.atlas_route_id JOIN public.subjects s ON s.id = svr.subject_id WHERE s.code = '9709' AND svr.combination_key = 'full_mech_stats'),
    'published_combinations_9231_full_all', (SELECT count(*)::int FROM public.published_grade_threshold_combinations pgtc JOIN public.subject_valid_routes svr ON svr.id = pgtc.atlas_route_id JOIN public.subjects s ON s.id = svr.subject_id WHERE s.code = '9231' AND svr.combination_key = 'full_all'),
    'component_variants_9709_9231', (SELECT count(*)::int FROM public.grade_threshold_component_variants v JOIN public.grade_threshold_publications p ON p.id = v.publication_id JOIN public.subjects s ON s.id = p.subject_id WHERE s.code IN ('9709', '9231')),
    'component_marks_9709_9231', (SELECT count(*)::int FROM public.grade_threshold_component_marks cm JOIN public.grade_threshold_component_variants v ON v.id = cm.component_variant_id JOIN public.grade_threshold_publications p ON p.id = v.publication_id JOIN public.subjects s ON s.id = p.subject_id WHERE s.code IN ('9709', '9231')),
    'combination_marks_9709_9231', (SELECT count(*)::int FROM public.grade_threshold_combination_marks m JOIN public.published_grade_threshold_combinations pgtc ON pgtc.id = m.combination_id JOIN public.grade_threshold_publications p ON p.id = pgtc.publication_id JOIN public.subjects s ON s.id = p.subject_id WHERE s.code IN ('9709', '9231')),
    'combination_tokens_9709_9231', (SELECT count(*)::int FROM public.grade_threshold_combination_tokens t JOIN public.published_grade_threshold_combinations pgtc ON pgtc.id = t.combination_id JOIN public.grade_threshold_publications p ON p.id = pgtc.publication_id JOIN public.subjects s ON s.id = p.subject_id WHERE s.code IN ('9709', '9231'))
  )::text,
  true
) IS NOT NULL AS owner_snapshot_captured;

DO $$
DECLARE
  v_uid text := current_setting('atlas.diag_user_id', true);
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', v_uid, true);
END
$$;

SET LOCAL ROLE authenticated;

SELECT set_config(
  'atlas.diag_auth_counts',
  jsonb_build_object(
    'user_subjects', (SELECT count(*)::int FROM public.user_subjects),
    'subject_paper_selections', (SELECT count(*)::int FROM public.subject_paper_selections),
    'subject_valid_routes', (SELECT count(*)::int FROM public.subject_valid_routes),
    'subject_route_papers', (SELECT count(*)::int FROM public.subject_route_papers),
    'subject_papers', (SELECT count(*)::int FROM public.subject_papers),
    'publications_june_2026', (SELECT count(*)::int FROM public.grade_threshold_publications WHERE exam_year = 2026 AND exam_series = 'june'),
    'published_combinations_9709_9231', (SELECT count(*)::int FROM public.published_grade_threshold_combinations pgtc JOIN public.grade_threshold_publications p ON p.id = pgtc.publication_id JOIN public.subjects s ON s.id = p.subject_id WHERE s.code IN ('9709', '9231') AND p.exam_year = 2026 AND p.exam_series = 'june'),
    'published_combinations_9709_mech_stats', (SELECT count(*)::int FROM public.published_grade_threshold_combinations pgtc JOIN public.subject_valid_routes svr ON svr.id = pgtc.atlas_route_id JOIN public.subjects s ON s.id = svr.subject_id WHERE s.code = '9709' AND svr.combination_key = 'full_mech_stats'),
    'published_combinations_9231_full_all', (SELECT count(*)::int FROM public.published_grade_threshold_combinations pgtc JOIN public.subject_valid_routes svr ON svr.id = pgtc.atlas_route_id JOIN public.subjects s ON s.id = svr.subject_id WHERE s.code = '9231' AND svr.combination_key = 'full_all'),
    'component_variants_9709_9231', (SELECT count(*)::int FROM public.grade_threshold_component_variants v JOIN public.grade_threshold_publications p ON p.id = v.publication_id JOIN public.subjects s ON s.id = p.subject_id WHERE s.code IN ('9709', '9231')),
    'component_marks_9709_9231', (SELECT count(*)::int FROM public.grade_threshold_component_marks cm JOIN public.grade_threshold_component_variants v ON v.id = cm.component_variant_id JOIN public.grade_threshold_publications p ON p.id = v.publication_id JOIN public.subjects s ON s.id = p.subject_id WHERE s.code IN ('9709', '9231')),
    'combination_marks_9709_9231', (SELECT count(*)::int FROM public.grade_threshold_combination_marks m JOIN public.published_grade_threshold_combinations pgtc ON pgtc.id = m.combination_id JOIN public.grade_threshold_publications p ON p.id = pgtc.publication_id JOIN public.subjects s ON s.id = p.subject_id WHERE s.code IN ('9709', '9231')),
    'combination_tokens_9709_9231', (SELECT count(*)::int FROM public.grade_threshold_combination_tokens t JOIN public.published_grade_threshold_combinations pgtc ON pgtc.id = t.combination_id JOIN public.grade_threshold_publications p ON p.id = pgtc.publication_id JOIN public.subjects s ON s.id = p.subject_id WHERE s.code IN ('9709', '9231'))
  )::text,
  true
) IS NOT NULL AS auth_snapshot_captured;

RESET ROLE;

WITH owner_kv AS (
  SELECT key, value::int AS owner_count
  FROM jsonb_each_text(current_setting('atlas.diag_owner_counts', true)::jsonb)
),
auth_kv AS (
  SELECT key, value::int AS auth_count
  FROM jsonb_each_text(current_setting('atlas.diag_auth_counts', true)::jsonb)
)
SELECT
  owner_kv.key AS metric,
  owner_kv.owner_count,
  auth_kv.auth_count,
  (owner_kv.owner_count - auth_kv.auth_count) AS rls_delta
FROM owner_kv
JOIN auth_kv USING (key)
ORDER BY owner_kv.key;

-- ── 10. Automated Mismatch Flags ─────────────────────────────────────────────
SELECT '=== 10. AUTOMATED MISMATCH SUMMARY ===' AS section;

WITH o AS (SELECT current_setting('atlas.diag_owner_counts', true)::jsonb AS j),
     a AS (SELECT current_setting('atlas.diag_auth_counts', true)::jsonb AS j)
SELECT
  (SELECT count(*)::int FROM public.user_subjects us WHERE us.user_id = current_setting('atlas.diag_user_id', true)::uuid) AS user_subject_rows,
  ((o.j->>'published_combinations_9709_mech_stats')::int - (a.j->>'published_combinations_9709_mech_stats')::int) AS rls_delta_9709_mech_stats,
  ((o.j->>'published_combinations_9231_full_all')::int - (a.j->>'published_combinations_9231_full_all')::int) AS rls_delta_9231_full_all,
  ((o.j->>'combination_marks_9709_9231')::int - (a.j->>'combination_marks_9709_9231')::int) AS rls_delta_comb_marks,
  ((o.j->>'combination_tokens_9709_9231')::int - (a.j->>'combination_tokens_9709_9231')::int) AS rls_delta_comb_tokens,
  ((o.j->>'component_variants_9709_9231')::int - (a.j->>'component_variants_9709_9231')::int) AS rls_delta_comp_variants,
  ((o.j->>'component_marks_9709_9231')::int - (a.j->>'component_marks_9709_9231')::int) AS rls_delta_comp_marks
FROM o, a;

ROLLBACK;
