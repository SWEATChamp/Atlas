/**
 * Atlas Database Types
 * Hand-authored TypeScript types that mirror the Supabase schema.
 * Keep in sync with migrations whenever schema changes.
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type NotesStatus = 'none' | 'in_progress' | 'complete'

// ─── AS/A2 enums (Migration 020) ─────────────────────────────────────────────

/** Per-subject study path. 'unconfirmed' means the student has not yet chosen;
 *  the UI must prompt before stage-sensitive features activate. */
export type StudyRoute = 'unconfirmed' | 'as_only' | 'staged' | 'full_level'

/** Active stage for a subject enrolment. NULL is used for 'unconfirmed' rows.
 *  'full' is only valid on user_subjects — not on per-paper or per-result tables. */
export type SubjectStage = 'as' | 'a2' | 'full'

/** Stage value accepted by past_papers, subject_paper_selections, and
 *  subject_stage_results. 'full' is intentionally excluded. */
export type PaperStage = 'as' | 'a2'

/** Chapter content classification. null means not yet classified (custom/unseeded only).
 *  route_dependent = effective stage resolved at query time from subject_paper_selections. */
export type ChapterStage = 'as' | 'a2' | 'shared' | 'route_dependent'

/** Certainty of a stage result. Only 'actual' may be treated as measured performance. */
export type ResultType = 'expected' | 'forecast' | 'actual'

/** How A2 was unlocked for a staged enrolment.
 *  'manual' unlock of an as_only subject must also update study_route to 'staged'. */
export type A2UnlockMethod = 'normal_transition' | 'manual'
export type MissionType =
  | 'complete_notes'
  | 'review_chapter'
  | 'attempt_paper'
  | 'revisit_weak_topic'
  | 'confidence_check'
export type MissionStatus = 'pending' | 'completed' | 'skipped'
export type MissionDifficulty = 'easy' | 'medium' | 'hard'
export type PaperSession = 'feb_mar' | 'may_jun' | 'oct_nov'
export type XpEventType =
  | 'mission_complete'
  | 'mission_undo'
  | 'notes_complete'
  | 'notes_in_progress'
  | 'paper_attempt'
  | 'streak_bonus_7'
  | 'streak_bonus_30'
  | 'streak_bonus_100'
  | 'achievement_unlock'
  | 'confidence_update'
  | 'friend_challenge_win'
  | 'manual_adjustment'

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked'
export type ChallengeStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'expired'
export type NotificationType =
  | 'mission_reminder'
  | 'streak_warning'
  | 'achievement_unlock'
  | 'friend_request'
  | 'challenge_invite'
  | 'challenge_result'
  | 'level_up'
  | 'system'
export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type TargetGrade = 'A*' | 'A' | 'B' | 'C' | 'D' | 'E'

// ─── Core Tables ──────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  username: string | null
  username_lower: string | null
  school: string | null
  exam_session: string | null
  timezone: string
  onboarding_completed: boolean
  total_xp: number
  current_level: number
  total_coins: number
  created_at: string
  updated_at: string
}

export interface ProfilePublic {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  current_level: number
  total_xp: number
  level_title: string
  current_streak: number
  longest_streak: number
  created_at: string
}

export interface Subject {
  id: string
  name: string
  code: string | null
  color_hex: string
  icon: string
  is_global: boolean
  created_by: string | null
  created_at: string
}

export interface UserSubject {
  id: string
  user_id: string
  subject_id: string
  exam_date: string | null
  target_grade: TargetGrade | null
  priority: number
  is_archived: boolean
  // AS/A2 fields (Migration 020)
  study_route: StudyRoute                   // NOT NULL DEFAULT 'unconfirmed'
  current_stage: SubjectStage | null        // NULL when study_route = 'unconfirmed'
  a2_unlocked_at: string | null             // TIMESTAMPTZ — both or neither with a2_unlock_method
  a2_unlock_method: A2UnlockMethod | null   // NULL until A2 is unlocked
  created_at: string
  updated_at: string
}

export interface UserSubjectWithSubject extends UserSubject {
  subjects: Subject
  subject_paper_selections?: SubjectPaperSelection[]
}

export interface Chapter {
  id: string
  subject_id: string
  title: string
  number: number
  component: string | null
  description: string | null
  is_global: boolean
  stage: ChapterStage | null  // null = not yet classified (Migration 020)
  created_at: string
}

export interface UserChapter {
  id: string
  user_id: string
  chapter_id: string
  notes_status: NotesStatus
  google_doc_url: string | null
  google_doc_id: string | null
  confidence_level: number | null
  last_reviewed_at: string | null
  first_completed_at: string | null
  revision_count: number
  personal_notes: string | null
  created_at: string
  updated_at: string
}

export interface PastPaper {
  id: string
  user_id: string
  subject_id: string
  paper_code: string
  year: number
  session: PaperSession
  paper_number: number | null
  attempted_at: string
  score_raw: number
  score_max: number
  accuracy_pct: number
  time_taken_mins: number | null
  notes: string | null
  stage: PaperStage | null  // null = not yet tagged (Migration 020)
  created_at: string
}

export interface PaperQuestionAttempt {
  id: string
  paper_id: string
  chapter_id: string | null
  chapter_ids: string[]
  question_number: string
  marks_available: number
  marks_obtained: number
  created_at: string
}

// ─── Gamification Tables ──────────────────────────────────────────────────────

export interface AchievementDefinition {
  key: string
  name: string
  description: string
  icon: string
  color_hex: string
  xp_reward: number
  is_active: boolean
  is_secret: boolean
  rarity: AchievementRarity
  sort_order: number
  created_at: string
}

export interface DailyMission {
  id: string
  user_id: string
  mission_date: string
  type: MissionType
  target_entity_type: string
  target_entity_id: string | null
  title: string
  description: string | null
  xp_reward: number
  status: MissionStatus
  difficulty: MissionDifficulty
  skip_reason: string | null
  skipped_at: string | null
  completed_at: string | null
  generated_at: string
}

export interface XpEvent {
  id: string
  user_id: string
  event_type: XpEventType
  xp_amount: number
  reference_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface Streak {
  id: string
  user_id: string
  current_streak: number
  longest_streak: number
  last_activity_date: string | null
  freeze_count: number
  updated_at: string
}

export interface UserAchievement {
  id: string
  user_id: string
  achievement_key: string
  unlocked_at: string
  notified: boolean
}

// ─── Integration Tables ───────────────────────────────────────────────────────

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  data: Record<string, unknown>
  is_read: boolean
  is_sent_push: boolean
  read_at: string | null
  created_at: string
}

export interface UserSettings {
  id: string
  user_id: string
  notif_mission_reminder: boolean
  notif_streak_warning: boolean
  notif_achievement: boolean
  notif_friend_request: boolean
  notif_challenge: boolean
  reminder_time: string | null
  sidebar_collapsed: boolean
  theme: string
  max_missions_per_day: number
  missions_last_generated_date: string | null
  updated_at: string
}

// ─── RPC Return Types ─────────────────────────────────────────────────────────

export interface CompleteMissionResult {
  mission_xp: number
  daily_bonus_xp: number
  achievement_xp: number
  streak_bonus_xp?: number
  total_xp_awarded: number
  xp_awarded: number
  new_total_xp: number
  new_level: number
  level_title: string
  streak_days: number
  achievements_unlocked: Array<{ key: string; xp: number }>
}

export interface UndoMissionResult {
  xp_reversed: number
  mission_xp_reversed?: number
  daily_bonus_xp_reversed?: number
  achievement_xp_reversed?: number
  streak_bonus_xp_reversed?: number
  new_total_xp: number
  new_level: number
  level_title: string
  streak_days: number
  mission_status: 'pending'
}


export interface DashboardStats {
  profile: {
    username?: string | null
    full_name: string
    avatar_url: string | null
    total_xp: number
    current_level: number
    level_title: string
    timezone: string
  }
  streak: {
    current: number
    longest: number
    last_date: string | null
    active_today: boolean
  }
  // overall_readiness removed: no combined score across stages.
  // Consumers must use as_readiness / a2_readiness per subject.
  has_exam_dates: boolean
  has_chapter_data: boolean
  has_unconfirmed_routes: boolean
  today_missions: DailyMission[]
  subject_readiness: Array<{
    user_subject_id?: string
    subject_id: string
    subject_name: string
    color_hex: string
    exam_date: string | null
    days_until: number | null
    study_route: import('./database').StudyRoute
    current_stage: import('./database').SubjectStage | null
    /** AS readiness (0–100). null when study_route='unconfirmed'. */
    as_readiness: number | null
    /** A2 readiness (0–100). null when A2 is not accessible for this subject. */
    a2_readiness: number | null
    /** Legacy readiness field for backward compat. null for unconfirmed and full_level. */
    readiness: number | null
  }>
  recent_xp_events: XpEvent[]
}


export interface LeaderboardEntry {
  rank: number
  user_id: string
  full_name: string | null
  avatar_url: string | null
  current_level: number
  level_title: string
  xp_value: number
  streak_days: number
}

// ─── AS/A2 Tables (Migration 020) ────────────────────────────────────────────

/**
 * One row per selected paper/component per enrolled subject.
 * No user_id — ownership is always derived via user_subjects.
 * Directly queryable by readiness calculations without string parsing.
 */
export interface SubjectPaperSelection {
  id: string
  user_subject_id: string  // FK → user_subjects.id (no user_id column)
  component_name: string
  paper_number: number | null
  stage: PaperStage        // 'as' | 'a2' — 'full' is not valid
  created_at: string
}

/**
 * AS or A2 result (expected, forecast, or actual) for an enrolled subject.
 * No user_id — ownership is always derived via user_subjects.
 * exam_series and exam_year are required (NOT NULL in DB).
 */
export interface SubjectStageResult {
  id: string
  user_subject_id: string  // FK → user_subjects.id (no user_id column)
  stage: PaperStage        // 'as' | 'a2' — 'full' is not valid
  result_type: ResultType
  score_obtained: number
  score_maximum: number
  exam_series: PaperSession  // NOT NULL — required
  exam_year: number          // NOT NULL — required
  carry_forward: boolean
  created_at: string
  updated_at: string
}
