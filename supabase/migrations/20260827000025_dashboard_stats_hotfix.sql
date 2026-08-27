-- ============================================================
-- Migration 025: Dashboard statistics hotfix
--
-- Restores the days_until field omitted from Migration 024's
-- get_user_dashboard_stats payload and prevents an expired stored
-- streak from being displayed as active after a user becomes idle.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_dashboard_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  public.profiles%ROWTYPE;
  v_streak   public.streaks%ROWTYPE;
  v_today    DATE;
  v_timezone TEXT;
BEGIN
  IF NOT (
    (auth.uid() IS NOT NULL AND auth.uid() = p_user_id)
    OR (COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '') = 'service_role')
  ) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  SELECT * INTO v_streak  FROM public.streaks  WHERE user_id = p_user_id;
  v_timezone := public.get_user_timezone(p_user_id);
  v_today    := public.get_user_local_date(p_user_id);

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'username',      v_profile.username,
      'full_name',     v_profile.full_name,
      'avatar_url',    v_profile.avatar_url,
      'total_xp',      v_profile.total_xp,
      'current_level', v_profile.current_level,
      'level_title',   public.compute_level_title(v_profile.current_level),
      'timezone',      v_timezone
    ),
    'streak', jsonb_build_object(
      'current', CASE
        WHEN v_streak.last_activity_date BETWEEN v_today - 1 AND v_today
          THEN COALESCE(v_streak.current_streak, 0)
        ELSE 0
      END,
      'longest',      COALESCE(v_streak.longest_streak, 0),
      'last_date',    v_streak.last_activity_date,
      'active_today', COALESCE(v_streak.last_activity_date = v_today, FALSE)
    ),
    'today_missions', (
      SELECT json_agg(row_to_json(dm.*) ORDER BY dm.generated_at)
      FROM   public.daily_missions dm
      WHERE  dm.user_id      = p_user_id
        AND  dm.mission_date = v_today
        AND  dm.status      != 'skipped'
    ),
    'subject_readiness', (
      SELECT json_agg(
        json_build_object(
          'user_subject_id', us.id,
          'subject_id',      s.id,
          'subject_name',    s.name,
          'color_hex',       s.color_hex,
          'exam_date',       us.exam_date,
          'days_until',      CASE
            WHEN us.exam_date IS NULL THEN NULL
            ELSE us.exam_date - v_today
          END,
          'study_route',     us.study_route,
          'current_stage',   us.current_stage,
          'as_readiness',    CASE WHEN us.study_route = 'unconfirmed' THEN NULL ELSE public.compute_readiness_score(p_user_id, s.id, 'as') END,
          'a2_readiness',    CASE WHEN us.study_route = 'unconfirmed' OR (us.study_route = 'staged' AND us.current_stage::TEXT != 'a2') THEN NULL ELSE public.compute_readiness_score(p_user_id, s.id, 'a2') END,
          'readiness',       CASE WHEN us.study_route IN ('unconfirmed', 'full_level') THEN NULL ELSE public.compute_readiness_score(p_user_id, s.id, 'as') END
        )
        ORDER BY us.priority ASC
      )
      FROM   public.user_subjects us
      JOIN   public.subjects s ON s.id = us.subject_id
      WHERE  us.user_id     = p_user_id
        AND  us.is_archived = FALSE
    ),
    'recent_xp_events', (
      SELECT json_agg(row_to_json(xe.*) ORDER BY xe.created_at DESC)
      FROM   (
        SELECT * FROM public.xp_events
        WHERE  user_id = p_user_id
        ORDER  BY created_at DESC
        LIMIT  5
      ) xe
    ),
    'has_exam_dates', (
      SELECT bool_and(us.exam_date IS NOT NULL)
      FROM   public.user_subjects us
      WHERE  us.user_id = p_user_id AND us.is_archived = FALSE
    ),
    'has_chapter_data', (
      SELECT EXISTS (
        SELECT 1 FROM public.user_chapters uc
        WHERE  uc.user_id = p_user_id
      )
    ),
    'has_unconfirmed_routes', (
      SELECT EXISTS (
        SELECT 1 FROM public.user_subjects us
        WHERE  us.user_id = p_user_id AND us.is_archived = FALSE AND us.study_route = 'unconfirmed'
      )
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_user_dashboard_stats(UUID) IS
  'Returns dashboard data with user-local exam countdowns and an effective current streak that expires after a missed day.';

REVOKE ALL ON FUNCTION public.get_user_dashboard_stats(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_dashboard_stats(UUID) TO authenticated, service_role;
