-- Migration: 20261127000039_activate_zone5_june2026_carry_forward_evidence.sql
-- Description: Milestone 5 v1.5.0: Forward-only activation of the China administrative
--              Zone 5 June 2026 carry-forward evidence set (20 combinations across 8 Atlas staged
--              routes for 9701, 9702, 9709, 9231, and 9618).
-- Configured attribution (written only if applied under separate explicit hosted authorization;
-- hosted review and authorization have NOT yet occurred):
--   Reviewed by: SWEATChamp
--   Authorized by: SWEATChamp
-- Strict Boundaries:
--   - Activates ONLY the exact Migration 036 evidence document and the exact 20 Migration 036+037
--     China Zone 5 mappings.
--   - Preserves all non-Zone-5, unsupported, unreviewed, and unrelated combinations as unavailable.
--   - Does NOT alter user records, publications, thresholds, maxima, weightings, full-linear routes,
--     AS-only routes, or unrelated evidence.
--   - Strictly atomic & fail-closed: validates the 5-subject June 2026 catalogue, all 20
--     combinations, tokens, and routes BEFORE any lifecycle mutation. Empty, partial, or
--     conflicting catalogues fail closed and roll back atomically without committing partial
--     approved/confirmed state.
--
-- Supported Rollout Sequence:
--   - Test/Preview (at M036 with June 2026 catalogue already seeded): apply 037 -> 038 -> 039.
--   - Production (at M033 with no catalogue): apply ledger-managed 034 -> 039, where Migration 038
--     installs and validates the 2,674-row catalogue before Migration 039 activates the evidence.

BEGIN;

DO $$
DECLARE
  c_doc_id        CONSTANT UUID   := '00000036-0000-4000-8000-000000000001';
  c_doc_sha256    CONSTANT BYTEA  := decode('80f88e04138b06e984c14a5292a0c298e654ca35806d3344043d9ad7de729fda', 'hex');
  c_reviewed_by   CONSTANT TEXT   := 'SWEATChamp';
  c_authorized_by CONSTANT TEXT   := 'SWEATChamp';
  v_now           CONSTANT TIMESTAMPTZ := NOW();

  v_doc_row               public.grade_threshold_carry_forward_evidence_documents%ROWTYPE;
  v_checksum_match_count  INT;
  v_missing_mappings      INT;
  v_unexpected_mappings   INT;
  v_conflicting_mappings  INT;
  v_june_pub_count        INT;
  v_resolved_target_count INT;
  v_conflicting_comb      INT;
  v_conflicting_tok       INT;
  v_conflicting_link      INT;
  v_final_link_count      INT;
  v_final_view_count      INT;
  v_final_comb_count      INT;
BEGIN
  -- ─── 0. Fail-Closed Pre-Check: Five-Subject June 2026 Catalogue Must Exist ───
  SELECT count(*)::INT INTO v_june_pub_count
  FROM public.grade_threshold_publications
  WHERE id IN (
    '00000000-0000-4000-8000-000000000021'::UUID,
    '00000000-0000-4000-8000-000000000022'::UUID,
    '00000000-0000-4000-8000-000000000023'::UUID,
    '00000000-0000-4000-8000-000000000024'::UUID,
    '00000000-0000-4000-8000-000000000025'::UUID
  )
    AND exam_year = 2026
    AND exam_series = 'june'
    AND publication_status = 'published'
    AND is_active = TRUE;

  IF v_june_pub_count <> 5 THEN
    RAISE EXCEPTION 'Migration 039: Five-subject June 2026 catalogue must be seeded before Migration 039 (found %/5 active published publications). Apply M034–M037, seed june_2026_m5_catalogue.sql, M038 seeds catalogue before M039.',
      v_june_pub_count
      USING ERRCODE = 'P0001';
  END IF;
  -- ─── 1. Verify Exact Evidence Document Before Mutation ───────────────────────
  SELECT * INTO v_doc_row
  FROM public.grade_threshold_carry_forward_evidence_documents
  WHERE id = c_doc_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Migration 039: Required Zone 5 evidence document (%) is missing', c_doc_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::INT INTO v_checksum_match_count
  FROM public.grade_threshold_carry_forward_evidence_documents
  WHERE checksum_sha256 = c_doc_sha256;

  IF v_checksum_match_count <> 1 THEN
    RAISE EXCEPTION 'Migration 039: Expected exactly 1 evidence document with checksum, found %', v_checksum_match_count
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    v_doc_row.document_title = 'Cambridge Guide to Making Entries: Including syllabus and option codes for June 2026 series'
    AND v_doc_row.issuer = 'Cambridge University Press & Assessment'
    AND v_doc_row.source_url = 'https://www.cambridgeinternational.org/Images/724211-guide-to-making-entries.pdf'
    AND v_doc_row.checksum_sha256 = c_doc_sha256
    AND v_doc_row.exam_year = 2026
    AND v_doc_row.exam_series = 'june'
    AND v_doc_row.scope_basis = 'administrative_zone'
    AND v_doc_row.declared_administrative_zones = ARRAY['5']::TEXT[]
    AND v_doc_row.declared_territories = ARRAY['CN']::TEXT[]
  ) THEN
    RAISE EXCEPTION 'Migration 039: Evidence document (%) failed integrity/scope verification', c_doc_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    (v_doc_row.review_status = 'unreviewed' AND v_doc_row.is_active = FALSE AND v_doc_row.reviewed_by IS NULL AND v_doc_row.reviewed_at IS NULL)
    OR
    (v_doc_row.review_status = 'approved' AND v_doc_row.is_active = TRUE AND v_doc_row.reviewed_by = c_reviewed_by AND v_doc_row.reviewed_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Migration 039: Evidence document (%) has conflicting lifecycle state (status=%, active=%, reviewed_by=%)',
      c_doc_id, v_doc_row.review_status, v_doc_row.is_active, v_doc_row.reviewed_by
      USING ERRCODE = 'P0001';
  END IF;

  -- ─── 2. Verify Exact 20 Source Mappings & All Material Attributes ───────────
  CREATE TEMP TABLE _m038_expected_mappings (
    id                         UUID PRIMARY KEY,
    syllabus_code              TEXT NOT NULL,
    entry_option_code          TEXT NOT NULL,
    raw_carry_forward_token    TEXT NOT NULL,
    sitting_components         TEXT[] NOT NULL,
    carried_as_components      TEXT[] NOT NULL,
    applicable_paper_variants  TEXT[] NOT NULL,
    sitting_exam_year          SMALLINT NOT NULL,
    sitting_exam_series        TEXT NOT NULL,
    carried_exam_year          SMALLINT NOT NULL,
    carried_exam_series        TEXT NOT NULL,
    scope_basis                TEXT NOT NULL,
    scope_administrative_zones TEXT[] NOT NULL,
    scope_territories          TEXT[] NOT NULL,
    pub_id                     UUID NOT NULL,
    route_key                  TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _m038_expected_mappings VALUES
    ('00000036-9709-4000-8000-000000000001', '9709', 'DC', '82', ARRAY['35','55'], ARRAY['15','45'], ARRAY['15','35','45','55'], 2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000023', 'mech_stats'),
    ('00000036-9709-4000-8000-000000000002', '9709', 'EC', '83', ARRAY['35','45'], ARRAY['15','55'], ARRAY['15','35','45','55'], 2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000023', 'stats_mech'),
    ('00000036-9709-4000-8000-000000000003', '9709', 'GC', '83', ARRAY['35','65'], ARRAY['15','55'], ARRAY['15','35','55','65'], 2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000023', 'stats_double'),
    ('00000036-9709-4000-8000-000000000004', '9709', 'HC', '92', ARRAY['35','55'], ARRAY['15','45'], ARRAY['15','35','45','55'], 2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000023', 'mech_stats'),
    ('00000036-9709-4000-8000-000000000005', '9709', 'IC', '93', ARRAY['35','45'], ARRAY['15','55'], ARRAY['15','35','45','55'], 2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000023', 'stats_mech'),
    ('00000036-9709-4000-8000-000000000006', '9709', 'KC', '93', ARRAY['35','65'], ARRAY['15','55'], ARRAY['15','35','55','65'], 2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000023', 'stats_double'),
    ('00000036-9231-4000-8000-000000000001', '9231', 'BC', '62', ARRAY['24','44'], ARRAY['14','34'], ARRAY['14','24','34','44'], 2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000024', 'fm_fps'),
    ('00000036-9231-4000-8000-000000000002', '9231', 'CC', '63', ARRAY['24','34'], ARRAY['14','44'], ARRAY['14','24','34','44'], 2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000024', 'fps_fm'),
    ('00000036-9231-4000-8000-000000000003', '9231', 'DC', '72', ARRAY['24','44'], ARRAY['14','34'], ARRAY['14','24','34','44'], 2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000024', 'fm_fps'),
    ('00000036-9231-4000-8000-000000000004', '9231', 'EC', '73', ARRAY['24','34'], ARRAY['14','44'], ARRAY['14','24','34','44'], 2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000024', 'fps_fm'),
    ('00000037-9701-4000-8000-000000000001', '9701', 'BC', '62', ARRAY['44','54'], ARRAY['14','24','37'], ARRAY['14','24','37','44','54'], 2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000021', 'standard'),
    ('00000037-9701-4000-8000-000000000002', '9701', 'BC', '63', ARRAY['44','54'], ARRAY['14','24','38'], ARRAY['14','24','38','44','54'], 2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000021', 'standard'),
    ('00000037-9701-4000-8000-000000000003', '9701', 'CC', '72', ARRAY['44','54'], ARRAY['14','24','37'], ARRAY['14','24','37','44','54'], 2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000021', 'standard'),
    ('00000037-9701-4000-8000-000000000004', '9701', 'CC', '73', ARRAY['44','54'], ARRAY['14','24','38'], ARRAY['14','24','38','44','54'], 2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000021', 'standard'),
    ('00000037-9702-4000-8000-000000000001', '9702', 'BC', '62', ARRAY['44','54'], ARRAY['14','24','37'], ARRAY['14','24','37','44','54'], 2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000022', 'standard'),
    ('00000037-9702-4000-8000-000000000002', '9702', 'BC', '63', ARRAY['44','54'], ARRAY['14','24','38'], ARRAY['14','24','38','44','54'], 2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000022', 'standard'),
    ('00000037-9702-4000-8000-000000000003', '9702', 'CC', '72', ARRAY['44','54'], ARRAY['14','24','37'], ARRAY['14','24','37','44','54'], 2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000022', 'standard'),
    ('00000037-9702-4000-8000-000000000004', '9702', 'CC', '73', ARRAY['44','54'], ARRAY['14','24','38'], ARRAY['14','24','38','44','54'], 2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000022', 'standard'),
    ('00000037-9618-4000-8000-000000000001', '9618', 'BZ', '89', ARRAY['33','43'], ARRAY['13','23'],      ARRAY['13','23','33','43'],      2026, 'june', 2025, 'june',     'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000025', 'standard'),
    ('00000037-9618-4000-8000-000000000002', '9618', 'CU', '98', ARRAY['33','43'], ARRAY['12','22'],      ARRAY['12','22','33','43'],      2026, 'june', 2025, 'november', 'administrative_zone', ARRAY['5'], ARRAY['CN'], '00000000-0000-4000-8000-000000000025', 'standard');

  -- Lock all rows associated with c_doc_id
  PERFORM 1
  FROM public.grade_threshold_carry_forward_source_mappings
  WHERE evidence_document_id = c_doc_id
  FOR UPDATE;

  SELECT count(*)::INT INTO v_missing_mappings
  FROM _m038_expected_mappings e
  LEFT JOIN public.grade_threshold_carry_forward_source_mappings a
    ON a.id = e.id
   AND a.evidence_document_id = c_doc_id
   AND a.syllabus_code = e.syllabus_code
   AND a.entry_option_code = e.entry_option_code
   AND a.raw_carry_forward_token = e.raw_carry_forward_token
   AND a.sitting_components = e.sitting_components
   AND a.carried_as_components = e.carried_as_components
   AND a.applicable_paper_variants = e.applicable_paper_variants
   AND a.sitting_exam_year = e.sitting_exam_year
   AND a.sitting_exam_series = e.sitting_exam_series
   AND a.carried_exam_year = e.carried_exam_year
   AND a.carried_exam_series = e.carried_exam_series
   AND a.scope_basis = e.scope_basis
   AND a.scope_administrative_zones = e.scope_administrative_zones
   AND a.scope_territories = e.scope_territories
  WHERE a.id IS NULL;

  SELECT count(*)::INT INTO v_unexpected_mappings
  FROM public.grade_threshold_carry_forward_source_mappings a
  WHERE a.evidence_document_id = c_doc_id
    AND NOT EXISTS (SELECT 1 FROM _m038_expected_mappings e WHERE e.id = a.id);

  SELECT count(*)::INT INTO v_conflicting_mappings
  FROM public.grade_threshold_carry_forward_source_mappings a
  JOIN _m038_expected_mappings e ON e.id = a.id
  WHERE NOT (
    (a.evidence_status = 'unreviewed' AND a.authorized_by IS NULL AND a.authorized_at IS NULL)
    OR
    (a.evidence_status = 'confirmed' AND a.authorized_by = c_authorized_by AND a.authorized_at IS NOT NULL)
  );

  IF v_missing_mappings > 0 OR v_unexpected_mappings > 0 OR v_conflicting_mappings > 0 THEN
    RAISE EXCEPTION 'Migration 039: Zone 5 source mapping verification failed (missing=%, unexpected=%, conflicting=%)',
      v_missing_mappings, v_unexpected_mappings, v_conflicting_mappings
      USING ERRCODE = 'P0001';
  END IF;

  -- ─── 3. Resolve & Validate All 20 Catalogue Targets Before Any Mutation ───────
  CREATE TEMP TABLE _m038_resolved_targets (
    mapping_id     UUID PRIMARY KEY,
    combination_id UUID NOT NULL UNIQUE,
    token_id       UUID NOT NULL UNIQUE,
    route_id       UUID NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _m038_resolved_targets (mapping_id, combination_id, token_id, route_id)
  SELECT
    e.id,
    c.id,
    t.id,
    svr.id
  FROM _m038_expected_mappings e
  JOIN public.grade_threshold_publications p
    ON p.id = e.pub_id
  JOIN public.subjects s
    ON s.id = p.subject_id
   AND s.code = e.syllabus_code
  JOIN public.grade_threshold_combinations c
    ON c.publication_id = p.id
   AND c.route_type = 'staged'
   AND c.qualification_level = 'a_level'
   AND c.canonical_key = array_to_string(e.sitting_components || ARRAY[e.raw_carry_forward_token], ',')
  JOIN public.grade_threshold_combination_tokens t
    ON t.combination_id = c.id
   AND t.token_kind = 'carry_forward'
   AND t.stage = 'as'
   AND t.raw_token = e.raw_carry_forward_token
  JOIN public.subject_valid_routes svr
    ON svr.subject_id = p.subject_id
   AND svr.route = 'staged'
   AND svr.combination_key = e.route_key;

  SELECT count(*)::INT INTO v_resolved_target_count
  FROM _m038_resolved_targets;

  IF v_resolved_target_count <> 20 THEN
    RAISE EXCEPTION 'Migration 039: Expected 20 resolved Zone 5 combination/token/route targets, found %',
      v_resolved_target_count
      USING ERRCODE = 'P0001';
  END IF;

  -- Conflict checks before mutating document, mappings, combinations, tokens, or bridge links
  SELECT count(*)::INT INTO v_conflicting_comb
  FROM _m038_resolved_targets rt
  JOIN public.grade_threshold_combinations c ON c.id = rt.combination_id
  WHERE NOT (
    (c.atlas_route_id IS NULL AND c.planner_eligibility = 'unreviewed')
    OR
    (c.atlas_route_id = rt.route_id AND c.planner_eligibility = 'eligible')
  );

  SELECT count(*)::INT INTO v_conflicting_tok
  FROM _m038_resolved_targets rt
  JOIN public.grade_threshold_combination_tokens t ON t.id = rt.token_id
  WHERE NOT (
    (t.carry_forward_mapping_status = 'unreviewed' AND t.mapping_reviewed_by IS NULL AND t.mapping_reviewed_at IS NULL)
    OR
    (t.carry_forward_mapping_status = 'approved' AND t.mapping_reviewed_by = c_reviewed_by AND t.mapping_reviewed_at IS NOT NULL)
    OR
    (t.id = '00000000-0000-4000-8000-0000000000db'::UUID AND t.carry_forward_mapping_status = 'approved' AND t.mapping_reviewed_by = 'm5-preflight-auditor' AND t.mapping_reviewed_at IS NOT NULL)
  );

  SELECT count(*)::INT INTO v_conflicting_link
  FROM public.grade_threshold_combination_carry_forward_links l
  WHERE (
    l.combination_id IN (SELECT combination_id FROM _m038_resolved_targets)
    OR l.token_id IN (SELECT token_id FROM _m038_resolved_targets)
    OR l.source_mapping_id IN (SELECT mapping_id FROM _m038_resolved_targets)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM _m038_resolved_targets rt
    WHERE rt.mapping_id = l.source_mapping_id
      AND rt.combination_id = l.combination_id
      AND rt.token_id = l.token_id
  );

  IF v_conflicting_comb > 0 OR v_conflicting_tok > 0 OR v_conflicting_link > 0 THEN
    RAISE EXCEPTION 'Migration 039: Conflicting pre-existing staged catalogue state (comb=%, tok=%, link=%)',
      v_conflicting_comb, v_conflicting_tok, v_conflicting_link
      USING ERRCODE = 'P0001';
  END IF;

  -- ─── 4. Atomic Activation: Evidence Doc + 20 Mappings + 20 Comms/Tokens/Links ─
  UPDATE public.grade_threshold_carry_forward_evidence_documents
  SET review_status = 'approved',
      reviewed_by   = c_reviewed_by,
      reviewed_at   = v_now,
      is_active     = TRUE
  WHERE id = c_doc_id
    AND review_status = 'unreviewed';

  UPDATE public.grade_threshold_carry_forward_source_mappings
  SET evidence_status = 'confirmed',
      authorized_by   = c_authorized_by,
      authorized_at   = v_now
  WHERE evidence_document_id = c_doc_id
    AND evidence_status = 'unreviewed';

  UPDATE public.grade_threshold_combinations c
  SET atlas_route_id      = rt.route_id,
      planner_eligibility = 'eligible'
  FROM _m038_resolved_targets rt
  WHERE c.id = rt.combination_id
    AND c.atlas_route_id IS DISTINCT FROM rt.route_id;

  UPDATE public.grade_threshold_combinations c
  SET planner_eligibility = 'eligible'
  FROM _m038_resolved_targets rt
  WHERE c.id = rt.combination_id
    AND c.planner_eligibility <> 'eligible';

  UPDATE public.grade_threshold_combination_tokens t
  SET carry_forward_mapping_status = 'approved',
      mapping_reviewed_by          = c_reviewed_by,
      mapping_reviewed_at          = v_now
  FROM _m038_resolved_targets rt
  WHERE t.id = rt.token_id
    AND (
      t.carry_forward_mapping_status = 'unreviewed'
      OR (t.id = '00000000-0000-4000-8000-0000000000db'::UUID AND t.mapping_reviewed_by = 'm5-preflight-auditor')
    );

  INSERT INTO public.grade_threshold_combination_carry_forward_links (
    source_mapping_id,
    combination_id,
    token_id
  )
  SELECT rt.mapping_id, rt.combination_id, rt.token_id
  FROM _m038_resolved_targets rt
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.grade_threshold_combination_carry_forward_links l
    WHERE l.source_mapping_id = rt.mapping_id
      AND l.combination_id = rt.combination_id
      AND l.token_id = rt.token_id
  );

  -- Post-activation integrity assertions
  SELECT count(*)::INT INTO v_final_link_count
  FROM public.grade_threshold_combination_carry_forward_links l
  JOIN _m038_resolved_targets rt
    ON rt.mapping_id = l.source_mapping_id
   AND rt.combination_id = l.combination_id
   AND rt.token_id = l.token_id;

  SELECT count(*)::INT INTO v_final_view_count
  FROM public.published_grade_threshold_carry_forward_mappings
  WHERE evidence_document_id = c_doc_id;

  SELECT count(*)::INT INTO v_final_comb_count
  FROM public.published_grade_threshold_combinations
  WHERE route_type = 'staged'
    AND per_paper_allocation_eligible = TRUE;

  IF v_final_link_count <> 20 OR v_final_view_count <> 20 OR v_final_comb_count <> 20 THEN
    RAISE EXCEPTION 'Migration 039: Post-activation verification failed (links=%, published_view=%, eligible_staged=%)',
      v_final_link_count, v_final_view_count, v_final_comb_count
      USING ERRCODE = 'P0001';
  END IF;
END $$;

COMMIT;
