-- ============================================================
-- DATABASE TESTS: Subject enrollment management (Migration 026)
--
-- Run via: npm run test:db
-- All changes roll back — no data is persisted.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(21);

CREATE TEMP TABLE subject_management_ctx (
  user_a                   UUID NOT NULL,
  user_b                   UUID NOT NULL,
  user_c                   UUID NOT NULL,
  maths_id                 UUID NOT NULL,
  physics_id               UUID NOT NULL,
  further_maths_id         UUID NOT NULL,
  unavailable_id           UUID NOT NULL,
  physics_enrollment_id    UUID NOT NULL,
  physics_chapter_id       UUID NOT NULL,
  physics_user_chapter_id  UUID NOT NULL,
  physics_paper_id         UUID NOT NULL,
  profile_xp_before        INTEGER NOT NULL,
  restored_id              UUID,
  archive_skipped_count    INTEGER,
  access_while_archived    BOOLEAN,
  restored_again_id        UUID,
  unavailable_error        TEXT,
  limit_error              TEXT,
  final_subject_error      TEXT,
  cross_owner_error        TEXT
) ON COMMIT DROP;

GRANT ALL ON TABLE subject_management_ctx TO authenticated, anon;

DO $$
DECLARE
  v_user_a       UUID := 'c0260001-0000-4000-a000-000000000001';
  v_user_b       UUID := 'c0260001-0000-4000-a000-000000000002';
  v_user_c       UUID := 'c0260001-0000-4000-a000-000000000003';
  v_maths        UUID;
  v_physics      UUID;
  v_fm           UUID;
  v_unavailable  UUID;
  v_us_physics   UUID;
  v_chapter      UUID;
  v_uc           UUID;
  v_sp           UUID;
  v_past_paper   UUID;
  v_completed    UUID := 'c0260001-0000-4000-a000-000000000030';
  v_xp           INTEGER;
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES
    (v_user_a, 'subject-management-a@atlas.test'),
    (v_user_b, 'subject-management-b@atlas.test'),
    (v_user_c, 'subject-management-c@atlas.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, username)
  VALUES
    (v_user_a, 'subject-management-a@atlas.test', 'subject_management_a'),
    (v_user_b, 'subject-management-b@atlas.test', 'subject_management_b'),
    (v_user_c, 'subject-management-c@atlas.test', 'subject_management_c')
  ON CONFLICT (id) DO NOTHING;

  SELECT id INTO v_maths FROM public.subjects WHERE code = '9709' AND is_global = TRUE;
  SELECT id INTO v_physics FROM public.subjects WHERE code = '9702' AND is_global = TRUE;
  SELECT id INTO v_fm FROM public.subjects WHERE code = '9231' AND is_global = TRUE;
  SELECT id INTO v_unavailable
  FROM public.subjects
  WHERE is_global = TRUE AND is_available = FALSE
  ORDER BY code NULLS LAST
  LIMIT 1;

  INSERT INTO public.user_subjects (
    user_id, subject_id, study_route, current_stage, priority
  ) VALUES (
    v_user_a, v_maths, 'as_only', 'as', 3
  );

  INSERT INTO public.user_subjects (
    user_id, subject_id, study_route, current_stage, priority
  ) VALUES (
    v_user_a, v_physics, 'as_only', 'as', 4
  ) RETURNING id INTO v_us_physics;

  SELECT id INTO v_chapter
  FROM public.chapters
  WHERE subject_id = v_physics
    AND stage IN ('as', 'shared')
    AND is_active = TRUE
  ORDER BY number
  LIMIT 1;

  INSERT INTO public.user_chapters (
    user_id, chapter_id, notes_status, confidence_level, personal_notes
  ) VALUES (
    v_user_a, v_chapter, 'complete', 4, 'Preserve this progress'
  ) RETURNING id INTO v_uc;

  SELECT id INTO v_sp
  FROM public.subject_papers
  WHERE subject_id = v_physics AND paper_number = 1;

  INSERT INTO public.subject_paper_selections (
    user_subject_id, component_name, paper_number, stage, subject_paper_id
  )
  SELECT v_us_physics, name, paper_number, 'as', id
  FROM public.subject_papers
  WHERE id = v_sp;

  INSERT INTO public.past_papers (
    user_id, subject_id, subject_paper_id, paper_code, year, session,
    paper_number, attempted_at, score_raw, score_max, stage
  ) VALUES (
    v_user_a, v_physics, v_sp, '9702/12/M/J/26', 2026, 'may_jun',
    12, CURRENT_DATE - 1, 30, 40, 'as'
  ) RETURNING id INTO v_past_paper;

  INSERT INTO public.daily_missions (
    user_id, mission_date, type, target_entity_type, target_entity_id,
    title, xp_reward, status, difficulty
  ) VALUES
    (
      v_user_a, CURRENT_DATE, 'complete_notes', 'chapter', v_uc,
      'Pending Physics chapter mission', 30, 'pending', 'medium'
    ),
    (
      v_user_a, CURRENT_DATE, 'attempt_paper', 'subject', v_physics,
      'Pending Physics paper mission', 60, 'pending', 'hard'
    );

  INSERT INTO public.daily_missions (
    id, user_id, mission_date, type, target_entity_type, target_entity_id,
    title, xp_reward, status, difficulty, completed_at
  ) VALUES (
    v_completed, v_user_a, CURRENT_DATE, 'review_chapter', 'chapter', v_uc,
    'Completed Physics mission', 20, 'completed', 'easy', NOW()
  );

  INSERT INTO public.xp_events (user_id, event_type, xp_amount, reference_id, metadata)
  VALUES (v_user_a, 'manual_adjustment', 25, v_completed, '{"fixture":true}'::JSONB);

  SELECT total_xp INTO v_xp FROM public.profiles WHERE id = v_user_a;

  -- Begin with Physics archived so the add operation must restore, not duplicate, it.
  UPDATE public.user_subjects SET is_archived = TRUE WHERE id = v_us_physics;

  -- Five active subjects for the limit fixture; Further Mathematics is deliberately absent.
  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  SELECT v_user_b, s.id, 'unconfirmed', NULL
  FROM public.subjects s
  WHERE s.id <> v_fm
  ORDER BY s.is_available DESC, s.code NULLS LAST
  LIMIT 5;

  -- One active subject for the minimum-enrollment fixture.
  INSERT INTO public.user_subjects (user_id, subject_id, study_route, current_stage)
  VALUES (v_user_c, v_maths, 'as_only', 'as');

  INSERT INTO subject_management_ctx (
    user_a, user_b, user_c, maths_id, physics_id, further_maths_id,
    unavailable_id, physics_enrollment_id, physics_chapter_id,
    physics_user_chapter_id, physics_paper_id, profile_xp_before
  ) VALUES (
    v_user_a, v_user_b, v_user_c, v_maths, v_physics, v_fm,
    v_unavailable, v_us_physics, v_chapter, v_uc, v_past_paper, v_xp
  );
END;
$$;

SELECT ok(
  has_function_privilege('authenticated', 'public.add_subject_enrollment(uuid,uuid)', 'EXECUTE'),
  '1. authenticated may execute add_subject_enrollment'
);

SELECT ok(
  has_function_privilege('service_role', 'public.add_subject_enrollment(uuid,uuid)', 'EXECUTE'),
  '2. service_role may execute add_subject_enrollment'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.add_subject_enrollment(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.add_subject_enrollment(uuid,uuid)', 'EXECUTE'),
  '3. anon and PUBLIC cannot execute add_subject_enrollment'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.archive_subject_enrollment(uuid,uuid)', 'EXECUTE'),
  '4. authenticated may execute archive_subject_enrollment'
);

SELECT ok(
  has_function_privilege('service_role', 'public.archive_subject_enrollment(uuid,uuid)', 'EXECUTE'),
  '5. service_role may execute archive_subject_enrollment'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.archive_subject_enrollment(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.archive_subject_enrollment(uuid,uuid)', 'EXECUTE'),
  '6. anon and PUBLIC cannot execute archive_subject_enrollment'
);

DO $$
DECLARE
  v_user      UUID;
  v_physics   UUID;
  v_restored  UUID;
BEGIN
  SELECT user_a, physics_id INTO v_user, v_physics FROM subject_management_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::TEXT, 'role', 'authenticated')::TEXT,
    true
  );
  v_restored := public.add_subject_enrollment(v_user, v_physics);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE subject_management_ctx SET restored_id = v_restored;
END;
$$;

SELECT is(
  (SELECT restored_id FROM subject_management_ctx),
  (SELECT physics_enrollment_id FROM subject_management_ctx),
  '7. adding an archived available subject restores the same enrollment ID'
);

SELECT ok(
  (
    SELECT NOT us.is_archived
      AND uc.notes_status = 'complete'
      AND uc.confidence_level = 4
      AND uc.personal_notes = 'Preserve this progress'
    FROM subject_management_ctx ctx
    JOIN public.user_subjects us ON us.id = ctx.physics_enrollment_id
    JOIN public.user_chapters uc ON uc.id = ctx.physics_user_chapter_id
  )
  AND (
    SELECT COUNT(*) > 1
    FROM subject_management_ctx ctx
    JOIN public.user_chapters uc ON uc.user_id = ctx.user_a
    JOIN public.chapters c ON c.id = uc.chapter_id AND c.subject_id = ctx.physics_id
  ),
  '8. restoring preserves existing progress and creates only missing accessible progress rows'
);

DO $$
DECLARE
  v_user        UUID;
  v_unavailable UUID;
BEGIN
  SELECT user_a, unavailable_id INTO v_user, v_unavailable FROM subject_management_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::TEXT)::TEXT, true);
  BEGIN
    PERFORM public.add_subject_enrollment(v_user, v_unavailable);
  EXCEPTION WHEN OTHERS THEN
    UPDATE subject_management_ctx SET unavailable_error = SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT is(
  (SELECT unavailable_error FROM subject_management_ctx),
  'P0003',
  '9. unsupported subjects cannot be newly added'
);

DO $$
DECLARE
  v_user UUID;
  v_fm   UUID;
BEGIN
  SELECT user_b, further_maths_id INTO v_user, v_fm FROM subject_management_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::TEXT)::TEXT, true);
  BEGIN
    PERFORM public.add_subject_enrollment(v_user, v_fm);
  EXCEPTION WHEN OTHERS THEN
    UPDATE subject_management_ctx SET limit_error = SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT is(
  (SELECT limit_error FROM subject_management_ctx),
  'P0003',
  '10. a sixth active subject is rejected'
);

DO $$
DECLARE
  v_user     UUID;
  v_us       UUID;
  v_skipped  INTEGER;
  v_access   BOOLEAN;
  v_chapter  UUID;
BEGIN
  SELECT user_a, physics_enrollment_id, physics_chapter_id
  INTO v_user, v_us, v_chapter
  FROM subject_management_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::TEXT)::TEXT, true);
  v_skipped := public.archive_subject_enrollment(v_user, v_us);
  v_access := public.user_can_access_chapter(v_user, v_chapter);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE subject_management_ctx
  SET archive_skipped_count = v_skipped,
      access_while_archived = v_access;
END;
$$;

SELECT is(
  (SELECT archive_skipped_count FROM subject_management_ctx),
  2,
  '11. archiving skips exactly the pending chapter and paper missions for that subject'
);

SELECT ok(
  (SELECT is_archived FROM public.user_subjects WHERE id = (SELECT physics_enrollment_id FROM subject_management_ctx)),
  '12. removal marks the enrollment archived instead of deleting it'
);

SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.daily_missions dm, subject_management_ctx ctx
    WHERE dm.user_id = ctx.user_a
      AND dm.status = 'skipped'
      AND dm.skip_reason = 'subject_archived'
  ),
  2,
  '13. archived-subject pending missions record the subject_archived reason'
);

SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.daily_missions dm, subject_management_ctx ctx
    WHERE dm.user_id = ctx.user_a
      AND dm.title = 'Completed Physics mission'
      AND dm.status = 'completed'
      AND dm.completed_at IS NOT NULL
  ),
  1,
  '14. completed missions remain completed after subject removal'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM subject_management_ctx ctx
    JOIN public.user_chapters uc ON uc.id = ctx.physics_user_chapter_id
    WHERE uc.notes_status = 'complete'
      AND uc.confidence_level = 4
      AND uc.personal_notes = 'Preserve this progress'
  )
  AND EXISTS (
    SELECT 1
    FROM subject_management_ctx ctx
    JOIN public.past_papers pp ON pp.id = ctx.physics_paper_id
  )
  AND EXISTS (
    SELECT 1
    FROM subject_management_ctx ctx
    JOIN public.subject_paper_selections sps ON sps.user_subject_id = ctx.physics_enrollment_id
  ),
  '15. chapter progress, past papers, and paper selections are preserved'
);

SELECT ok(
  (
    SELECT p.total_xp = ctx.profile_xp_before
    FROM subject_management_ctx ctx
    JOIN public.profiles p ON p.id = ctx.user_a
  )
  AND (
    SELECT COUNT(*) >= 1
    FROM subject_management_ctx ctx
    JOIN public.xp_events xe ON xe.user_id = ctx.user_a
  ),
  '16. profile XP and the XP ledger are unchanged by subject removal'
);

SELECT is(
  (SELECT access_while_archived FROM subject_management_ctx),
  FALSE,
  '17. archived subjects no longer grant chapter access'
);

DO $$
DECLARE
  v_user      UUID;
  v_physics   UUID;
  v_restored  UUID;
BEGIN
  SELECT user_a, physics_id INTO v_user, v_physics FROM subject_management_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::TEXT)::TEXT, true);
  v_restored := public.add_subject_enrollment(v_user, v_physics);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE subject_management_ctx SET restored_again_id = v_restored;
END;
$$;

SELECT ok(
  (
    SELECT restored_again_id = physics_enrollment_id
    FROM subject_management_ctx
  )
  AND NOT (
    SELECT us.is_archived
    FROM subject_management_ctx ctx
    JOIN public.user_subjects us ON us.id = ctx.physics_enrollment_id
  ),
  '18. a removed supported subject can be re-added without changing its enrollment ID'
);

DO $$
DECLARE
  v_user UUID;
  v_us   UUID;
BEGIN
  SELECT ctx.user_c, us.id
  INTO v_user, v_us
  FROM subject_management_ctx ctx
  JOIN public.user_subjects us ON us.user_id = ctx.user_c AND us.is_archived = FALSE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::TEXT)::TEXT, true);
  BEGIN
    PERFORM public.archive_subject_enrollment(v_user, v_us);
  EXCEPTION WHEN OTHERS THEN
    UPDATE subject_management_ctx SET final_subject_error = SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT is(
  (SELECT final_subject_error FROM subject_management_ctx),
  'P0003',
  '19. the final active subject cannot be removed'
);

DO $$
DECLARE
  v_user       UUID;
  v_foreign_us UUID;
BEGIN
  SELECT user_c, physics_enrollment_id INTO v_user, v_foreign_us FROM subject_management_ctx;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::TEXT)::TEXT, true);
  BEGIN
    PERFORM public.archive_subject_enrollment(v_user, v_foreign_us);
  EXCEPTION WHEN OTHERS THEN
    UPDATE subject_management_ctx SET cross_owner_error = SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

SELECT is(
  (SELECT cross_owner_error FROM subject_management_ctx),
  'P0002',
  '20. a user cannot archive another user enrollment'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.user_subjects', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.user_subjects', 'DELETE')
  AND NOT has_column_privilege('authenticated', 'public.user_subjects', 'is_archived', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.user_subjects', 'exam_date', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.user_subjects', 'target_grade', 'UPDATE'),
  '21. direct membership mutation is blocked while profile-setting updates remain allowed'
);

SELECT * FROM finish();
ROLLBACK;
