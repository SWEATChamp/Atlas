-- ============================================================
-- MIGRATION 026: Subject enrollment management
--
-- Adds guarded, reversible add/remove operations for the Subjects page.
-- Removing a subject archives the enrollment and skips its pending missions;
-- it never deletes progress, past papers, completed missions, or XP.
-- ============================================================

-- Keep enrollment membership changes behind the guarded RPCs. Clients retain
-- the narrow profile-setting updates used for exam dates, target grades, and
-- priority, while route changes continue through their existing RPC.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_subjects FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_subjects TO authenticated;
GRANT UPDATE (exam_date, target_grade, priority) ON TABLE public.user_subjects TO authenticated;

CREATE OR REPLACE FUNCTION public.add_subject_enrollment(
  p_user_id    UUID,
  p_subject_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_profile_id       UUID;
  v_enrollment_id    UUID;
  v_is_archived      BOOLEAN;
  v_active_count     INTEGER;
BEGIN
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Serialize enrollment-count changes for this user.
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.subjects
    WHERE id = p_subject_id
      AND is_global = TRUE
      AND is_available = TRUE
  ) THEN
    RAISE EXCEPTION 'This subject is not currently available to add'
      USING ERRCODE = 'P0003';
  END IF;

  SELECT id, is_archived
  INTO v_enrollment_id, v_is_archived
  FROM public.user_subjects
  WHERE user_id = p_user_id
    AND subject_id = p_subject_id
  FOR UPDATE;

  -- Idempotent when the requested subject is already active.
  IF FOUND AND v_is_archived = FALSE THEN
    RETURN v_enrollment_id;
  END IF;

  SELECT COUNT(*)
  INTO v_active_count
  FROM public.user_subjects
  WHERE user_id = p_user_id
    AND is_archived = FALSE;

  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'You can study up to 5 active subjects. Remove one before adding another.'
      USING ERRCODE = 'P0003';
  END IF;

  IF v_enrollment_id IS NOT NULL THEN
    UPDATE public.user_subjects
    SET is_archived = FALSE,
        updated_at = NOW()
    WHERE id = v_enrollment_id;
  ELSE
    INSERT INTO public.user_subjects (
      user_id,
      subject_id,
      priority,
      is_archived,
      study_route,
      current_stage
    )
    VALUES (
      p_user_id,
      p_subject_id,
      3,
      FALSE,
      'unconfirmed',
      NULL
    )
    RETURNING id INTO v_enrollment_id;
  END IF;

  -- A restored configured enrollment may already have accessible chapters.
  -- Insert only missing progress rows; existing progress remains unchanged.
  INSERT INTO public.user_chapters (user_id, chapter_id, notes_status)
  SELECT p_user_id, c.id, 'none'
  FROM public.chapters c
  WHERE c.subject_id = p_subject_id
    AND c.is_active = TRUE
    AND public.user_can_access_chapter(p_user_id, c.id)
  ON CONFLICT (user_id, chapter_id) DO NOTHING;

  RETURN v_enrollment_id;
END;
$$;

COMMENT ON FUNCTION public.add_subject_enrollment(UUID, UUID) IS
  'Adds an available MVP subject or restores its archived enrollment. Enforces the five-active-subject limit and preserves existing data.';

REVOKE ALL ON FUNCTION public.add_subject_enrollment(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_subject_enrollment(UUID, UUID) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.archive_subject_enrollment(
  p_user_id         UUID,
  p_user_subject_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_profile_id      UUID;
  v_subject_id      UUID;
  v_active_count    INTEGER;
  v_skipped_count   INTEGER;
BEGIN
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Serialize enrollment-count changes for this user.
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT subject_id
  INTO v_subject_id
  FROM public.user_subjects
  WHERE id = p_user_subject_id
    AND user_id = p_user_id
    AND is_archived = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active subject enrollment not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*)
  INTO v_active_count
  FROM public.user_subjects
  WHERE user_id = p_user_id
    AND is_archived = FALSE;

  IF v_active_count <= 1 THEN
    RAISE EXCEPTION 'Keep at least one active subject in your study plan.'
      USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.user_subjects
  SET is_archived = TRUE,
      updated_at = NOW()
  WHERE id = p_user_subject_id;

  WITH skipped AS (
    UPDATE public.daily_missions dm
    SET status = 'skipped',
        skip_reason = 'subject_archived',
        skipped_at = NOW()
    WHERE dm.user_id = p_user_id
      AND dm.status = 'pending'
      AND (
        (
          dm.target_entity_type = 'subject'
          AND dm.target_entity_id = v_subject_id
        )
        OR (
          dm.target_entity_type = 'chapter'
          AND EXISTS (
            SELECT 1
            FROM public.user_chapters uc
            JOIN public.chapters c ON c.id = uc.chapter_id
            WHERE uc.id = dm.target_entity_id
              AND uc.user_id = p_user_id
              AND c.subject_id = v_subject_id
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.subject_papers sp
          WHERE sp.id = dm.subject_paper_id
            AND sp.subject_id = v_subject_id
        )
      )
    RETURNING dm.id
  )
  SELECT COUNT(*) INTO v_skipped_count FROM skipped;

  RETURN COALESCE(v_skipped_count, 0);
END;
$$;

COMMENT ON FUNCTION public.archive_subject_enrollment(UUID, UUID) IS
  'Archives one owned active subject while preserving all history. Pending missions for that subject are skipped; the final active subject cannot be archived.';

REVOKE ALL ON FUNCTION public.archive_subject_enrollment(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_subject_enrollment(UUID, UUID) TO authenticated, service_role;
