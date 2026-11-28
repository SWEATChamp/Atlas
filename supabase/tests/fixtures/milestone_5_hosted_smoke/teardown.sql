-- =============================================================================
-- TEARDOWN: Milestone 5 Reversible Hosted-Smoke Teardown
--
-- File: supabase/tests/fixtures/milestone_5_hosted_smoke/teardown.sql
--
-- Purpose:
--   Completely and safely reverses the Milestone 5 hosted-smoke scenario:
--   - Deletes temporary application rows child-before-parent.
--   - Restores canonical evidence and mapping lifecycle fields exactly.
--   - Restores original subject_paper_selections rows including IDs and timestamps.
--   - Restores all mutable user_subjects fields (target_grade, study_route,
--     current_stage, a2_unlocked_at, a2_unlock_method, is_archived).
--   - Restricts user_subjects updates to rows with actual differences, preventing
--     unnecessary updated_at timestamp drift on untouched enrollments.
--   - Restores daily_missions changed by cancel_inaccessible_missions.
--   - Retains the 2,674-row five-subject durable catalogue under Option A.
--   - Validates post-teardown scoped bidirectional equality for all snapshotted
--     tables across all 12 non-updated_at user_subjects columns before dropping
--     the snapshot schema.
--   - Fails closed and preserves _m5_smoke_snapshot if any difference remains.
--
-- Deferred Execution:
--   Runs immediately upon inclusion unless m5.defer_smoke_teardown = 'true'.
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.apply_m5_smoke_teardown()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_u1 UUID;
  v_u2 UUID;
  v_link_id UUID;
  v_attempt_ids UUID[];
  v_remaining_links INT;
  v_remaining_pub_mappings INT;
  v_remaining_attempts INT;
  v_catalogue_rows INT;
  v_diff_count INT;
BEGIN
  -- ── 1. Validate Snapshot Schema Presence ─────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = '_m5_smoke_snapshot') THEN
    RAISE EXCEPTION 'Teardown failed: snapshot schema _m5_smoke_snapshot does not exist'
      USING ERRCODE = '55000';
  END IF;

  SELECT user_1_id, user_2_id, bridge_link_id, attempt_ids
  INTO v_u1, v_u2, v_link_id, v_attempt_ids
  FROM _m5_smoke_snapshot.smoke_ledger
  ORDER BY bootstrapped_at DESC LIMIT 1;

  IF v_u1 IS NULL OR v_u2 IS NULL THEN
    RAISE EXCEPTION 'Teardown failed: smoke ledger is empty'
      USING ERRCODE = 'P0002';
  END IF;

  -- ── 2. Child-Before-Parent Removal & Exact State Restoration ─────────────────

  -- Step 2a: Delete smoke past paper attempts
  DELETE FROM public.past_papers
  WHERE id = ANY(v_attempt_ids);

  -- Delete any other past paper attempts created during smoke for smoke users
  DELETE FROM public.past_papers
  WHERE user_id IN (v_u1, v_u2)
    AND id NOT IN (SELECT id FROM _m5_smoke_snapshot.snap_past_papers);

  -- Step 2b: Delete carry-forward bridge link
  DELETE FROM public.grade_threshold_combination_carry_forward_links
  WHERE id = v_link_id;

  -- Step 2c: Restore canonical source mapping lifecycle fields
  UPDATE public.grade_threshold_carry_forward_source_mappings m
  SET evidence_status = s.evidence_status,
      authorized_by = s.authorized_by,
      authorized_at = s.authorized_at
  FROM _m5_smoke_snapshot.snap_source_mappings s
  WHERE m.id = s.id;

  -- Step 2d: Restore canonical evidence document lifecycle fields
  UPDATE public.grade_threshold_carry_forward_evidence_documents d
  SET review_status = s.review_status,
      reviewed_by = s.reviewed_by,
      reviewed_at = s.reviewed_at,
      is_active = s.is_active
  FROM _m5_smoke_snapshot.snap_evidence_documents s
  WHERE d.id = s.id;

  -- Step 2e: Remove newly generated subject_paper_selections for smoke users
  DELETE FROM public.subject_paper_selections
  WHERE user_subject_id IN (SELECT id FROM public.user_subjects WHERE user_id IN (v_u1, v_u2))
    AND id NOT IN (SELECT id FROM _m5_smoke_snapshot.snap_subject_paper_selections);

  -- Step 2f: Restore pre-existing user_subjects fields BEFORE re-inserting selections
  -- Restores all mutable fields including is_archived.
  -- Uses null-safe IS DISTINCT FROM to update only rows with actual differences,
  -- ensuring untouched same-user enrollments experience zero updated_at drift.
  UPDATE public.user_subjects u
  SET target_grade = s.target_grade,
      study_route = s.study_route,
      current_stage = s.current_stage,
      a2_unlocked_at = s.a2_unlocked_at,
      a2_unlock_method = s.a2_unlock_method,
      is_archived = s.is_archived
  FROM _m5_smoke_snapshot.snap_user_subjects s
  WHERE u.id = s.id
    AND (
      u.target_grade IS DISTINCT FROM s.target_grade
      OR u.study_route IS DISTINCT FROM s.study_route
      OR u.current_stage IS DISTINCT FROM s.current_stage
      OR u.a2_unlocked_at IS DISTINCT FROM s.a2_unlocked_at
      OR u.a2_unlock_method IS DISTINCT FROM s.a2_unlock_method
      OR u.is_archived IS DISTINCT FROM s.is_archived
    );

  -- Step 2g: Re-insert original subject_paper_selections rows that were replaced by configure_subject_route
  INSERT INTO public.subject_paper_selections (
    id, user_subject_id, component_name, paper_number, stage, created_at, subject_paper_id
  )
  SELECT
    s.id, s.user_subject_id, s.component_name, s.paper_number, s.stage, s.created_at, s.subject_paper_id
  FROM _m5_smoke_snapshot.snap_subject_paper_selections s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.subject_paper_selections sps WHERE sps.id = s.id
  );

  -- Step 2h: Remove smoke-created user_subjects rows (those not present in snapshot)
  DELETE FROM public.user_subjects
  WHERE user_id IN (v_u1, v_u2)
    AND id NOT IN (SELECT id FROM _m5_smoke_snapshot.snap_user_subjects);

  -- Step 2i: Remove smoke-created user_chapters rows (pre-existing rows were not modified)
  DELETE FROM public.user_chapters
  WHERE user_id IN (v_u1, v_u2)
    AND id NOT IN (SELECT id FROM _m5_smoke_snapshot.snap_user_chapters);

  -- Step 2j: Remove smoke-created daily_missions and restore pre-existing daily_missions
  DELETE FROM public.daily_missions
  WHERE user_id IN (v_u1, v_u2)
    AND id NOT IN (SELECT id FROM _m5_smoke_snapshot.snap_daily_missions);

  UPDATE public.daily_missions dm
  SET status = s.status,
      skip_reason = s.skip_reason,
      skipped_at = s.skipped_at,
      completed_at = s.completed_at,
      completion_attempt = s.completion_attempt
  FROM _m5_smoke_snapshot.snap_daily_missions s
  WHERE dm.id = s.id;

  -- ── 3. Post-Teardown Scoped Verification Before Dropping Snapshot ────────────

  -- 3a. Assert 0 bridge links remain
  SELECT count(*) INTO v_remaining_links
  FROM public.grade_threshold_combination_carry_forward_links;

  IF v_remaining_links <> 0 THEN
    RAISE EXCEPTION 'Teardown verification failed: % bridge links remain', v_remaining_links
      USING ERRCODE = 'P0004';
  END IF;

  -- 3b. Assert 0 published carry-forward mappings remain
  SELECT count(*) INTO v_remaining_pub_mappings
  FROM public.published_grade_threshold_carry_forward_mappings;

  IF v_remaining_pub_mappings <> 0 THEN
    RAISE EXCEPTION 'Teardown verification failed: % published carry-forward mappings remain', v_remaining_pub_mappings
      USING ERRCODE = 'P0004';
  END IF;

  -- 3c. Assert 0 smoke past paper attempts remain
  SELECT count(*) INTO v_remaining_attempts
  FROM public.past_papers
  WHERE id = ANY(v_attempt_ids);

  IF v_remaining_attempts <> 0 THEN
    RAISE EXCEPTION 'Teardown verification failed: % smoke attempts remain', v_remaining_attempts
      USING ERRCODE = 'P0004';
  END IF;

  -- 3d. Scoped Bidirectional Equality: snap_evidence_documents
  SELECT count(*) INTO v_diff_count
  FROM (
    (SELECT * FROM _m5_smoke_snapshot.snap_evidence_documents
     EXCEPT
     SELECT * FROM public.grade_threshold_carry_forward_evidence_documents
     WHERE id = '00000036-0000-4000-8000-000000000001')
    UNION ALL
    (SELECT * FROM public.grade_threshold_carry_forward_evidence_documents
     WHERE id = '00000036-0000-4000-8000-000000000001'
     EXCEPT
     SELECT * FROM _m5_smoke_snapshot.snap_evidence_documents)
  ) d;

  IF v_diff_count <> 0 THEN
    RAISE EXCEPTION 'Teardown verification failed: snap_evidence_documents mismatch (delta = %)', v_diff_count
      USING ERRCODE = 'P0004';
  END IF;

  -- 3e. Scoped Bidirectional Equality: snap_source_mappings
  SELECT count(*) INTO v_diff_count
  FROM (
    (SELECT * FROM _m5_smoke_snapshot.snap_source_mappings
     EXCEPT
     SELECT * FROM public.grade_threshold_carry_forward_source_mappings
     WHERE id = '00000036-9709-4000-8000-000000000001')
    UNION ALL
    (SELECT * FROM public.grade_threshold_carry_forward_source_mappings
     WHERE id = '00000036-9709-4000-8000-000000000001'
     EXCEPT
     SELECT * FROM _m5_smoke_snapshot.snap_source_mappings)
  ) d;

  IF v_diff_count <> 0 THEN
    RAISE EXCEPTION 'Teardown verification failed: snap_source_mappings mismatch (delta = %)', v_diff_count
      USING ERRCODE = 'P0004';
  END IF;

  -- 3f. Scoped Bidirectional Equality: snap_subject_paper_selections
  SELECT count(*) INTO v_diff_count
  FROM (
    (SELECT * FROM _m5_smoke_snapshot.snap_subject_paper_selections
     EXCEPT
     SELECT * FROM public.subject_paper_selections
     WHERE user_subject_id IN (SELECT id FROM public.user_subjects WHERE user_id IN (v_u1, v_u2)))
    UNION ALL
    (SELECT * FROM public.subject_paper_selections
     WHERE user_subject_id IN (SELECT id FROM public.user_subjects WHERE user_id IN (v_u1, v_u2))
     EXCEPT
     SELECT * FROM _m5_smoke_snapshot.snap_subject_paper_selections)
  ) d;

  IF v_diff_count <> 0 THEN
    RAISE EXCEPTION 'Teardown verification failed: snap_subject_paper_selections mismatch (delta = %)', v_diff_count
      USING ERRCODE = 'P0004';
  END IF;

  -- 3g. Scoped Bidirectional Equality: snap_user_chapters (full-row equality)
  SELECT count(*) INTO v_diff_count
  FROM (
    (SELECT * FROM _m5_smoke_snapshot.snap_user_chapters
     EXCEPT
     SELECT * FROM public.user_chapters
     WHERE user_id IN (v_u1, v_u2))
    UNION ALL
    (SELECT * FROM public.user_chapters
     WHERE user_id IN (v_u1, v_u2)
     EXCEPT
     SELECT * FROM _m5_smoke_snapshot.snap_user_chapters)
  ) d;

  IF v_diff_count <> 0 THEN
    RAISE EXCEPTION 'Teardown verification failed: snap_user_chapters mismatch (delta = %)', v_diff_count
      USING ERRCODE = 'P0004';
  END IF;

  -- 3h. Scoped Bidirectional Equality: snap_daily_missions (full-row equality including status, skip_reason, skipped_at)
  SELECT count(*) INTO v_diff_count
  FROM (
    (SELECT * FROM _m5_smoke_snapshot.snap_daily_missions
     EXCEPT
     SELECT * FROM public.daily_missions
     WHERE user_id IN (v_u1, v_u2))
    UNION ALL
    (SELECT * FROM public.daily_missions
     WHERE user_id IN (v_u1, v_u2)
     EXCEPT
     SELECT * FROM _m5_smoke_snapshot.snap_daily_missions)
  ) d;

  IF v_diff_count <> 0 THEN
    RAISE EXCEPTION 'Teardown verification failed: snap_daily_missions mismatch (delta = %)', v_diff_count
      USING ERRCODE = 'P0004';
  END IF;

  -- 3i. Scoped Bidirectional Equality: snap_past_papers (full-row equality)
  SELECT count(*) INTO v_diff_count
  FROM (
    (SELECT * FROM _m5_smoke_snapshot.snap_past_papers
     EXCEPT
     SELECT * FROM public.past_papers
     WHERE user_id IN (v_u1, v_u2))
    UNION ALL
    (SELECT * FROM public.past_papers
     WHERE user_id IN (v_u1, v_u2)
     EXCEPT
     SELECT * FROM _m5_smoke_snapshot.snap_past_papers)
  ) d;

  IF v_diff_count <> 0 THEN
    RAISE EXCEPTION 'Teardown verification failed: snap_past_papers mismatch (delta = %)', v_diff_count
      USING ERRCODE = 'P0004';
  END IF;

  -- 3j. Scoped Bidirectional Equality: snap_user_subjects
  -- Exception documented: user_subjects.updated_at is updated by BEFORE UPDATE trigger
  -- set_user_subjects_updated_at(). All other 12 non-trigger columns are strictly verified bidirectionally:
  -- id, user_id, subject_id, exam_date, target_grade, priority, is_archived, created_at,
  -- study_route, current_stage, a2_unlocked_at, a2_unlock_method.
  WITH snap_us AS (
    SELECT id, user_id, subject_id, exam_date, target_grade, priority, is_archived,
           created_at, study_route, current_stage, a2_unlocked_at, a2_unlock_method
    FROM _m5_smoke_snapshot.snap_user_subjects
  ),
  act_us AS (
    SELECT id, user_id, subject_id, exam_date, target_grade, priority, is_archived,
           created_at, study_route, current_stage, a2_unlocked_at, a2_unlock_method
    FROM public.user_subjects
    WHERE user_id IN (v_u1, v_u2)
  )
  SELECT count(*) INTO v_diff_count
  FROM (
    (SELECT * FROM snap_us EXCEPT SELECT * FROM act_us)
    UNION ALL
    (SELECT * FROM act_us EXCEPT SELECT * FROM snap_us)
  ) d;

  IF v_diff_count <> 0 THEN
    RAISE EXCEPTION 'Teardown verification failed: snap_user_subjects content mismatch (delta = %)', v_diff_count
      USING ERRCODE = 'P0004';
  END IF;

  IF (SELECT count(*) FROM public.user_subjects WHERE user_id IN (v_u1, v_u2)) <> (SELECT count(*) FROM _m5_smoke_snapshot.snap_user_subjects) THEN
    RAISE EXCEPTION 'Teardown verification failed: snap_user_subjects row count mismatch'
      USING ERRCODE = 'P0004';
  END IF;

  -- 3k. Assert durable catalogue row count is preserved at 2,674 rows under Option A
  SELECT (
    (SELECT count(*) FROM public.grade_threshold_import_runs) +
    (SELECT count(*) FROM public.grade_threshold_publications) +
    (SELECT count(*) FROM public.grade_threshold_weighting_sources) +
    (SELECT count(*) FROM public.grade_threshold_weighting_entries) +
    (SELECT count(*) FROM public.grade_threshold_component_variants) +
    (SELECT count(*) FROM public.grade_threshold_component_marks) +
    (SELECT count(*) FROM public.grade_threshold_variant_benchmark_groups) +
    (SELECT count(*) FROM public.grade_threshold_variant_benchmark_members) +
    (SELECT count(*) FROM public.grade_threshold_combinations) +
    (SELECT count(*) FROM public.grade_threshold_combination_tokens) +
    (SELECT count(*) FROM public.grade_threshold_combination_marks)
  ) INTO v_catalogue_rows;

  IF v_catalogue_rows <> 2674 THEN
    RAISE EXCEPTION 'Teardown verification failed: expected 2674 durable catalogue rows under Option A, found %', v_catalogue_rows
      USING ERRCODE = 'P0004';
  END IF;

  -- ── 4. Drop Private Snapshot Schema (Only Reached If ALL Checks Pass) ─────────
  DROP SCHEMA _m5_smoke_snapshot CASCADE;

END;
$$;

-- Conditional immediate execution
DO $$
BEGIN
  IF current_setting('m5.defer_smoke_teardown', true) IS DISTINCT FROM 'true' THEN
    PERFORM pg_temp.apply_m5_smoke_teardown();
  END IF;
END;
$$;
