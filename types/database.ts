/**
 * Atlas Database Types
 * Hand-authored TypeScript types that mirror the Supabase schema.
 * Keep in sync with migrations whenever schema changes.
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type NotesStatus = 'none' | 'in_progress' | 'complete'
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
  created_at: string
  updated_at: string
}

export interface UserSubjectWithSubject extends UserSubject {
  subjects: Subject
}

export interface Chapter {
  id: string
  subject_id: string
  title: string
  number: number
  component: string | null
  description: string | null
  is_global: boolean
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
  xp_awarded: number
  achievement_xp: number
  new_total_xp: number
  new_level: number
  level_title: string
  streak_days: number
  achievements_unlocked: Array<{ key: string; xp: number }>
}

export interface DashboardStats {
  profile: {
    full_name: string
    avatar_url: string | null
    total_xp: number
    current_level: number
    level_title: string
  }
  streak: {
    current: number
    longest: number
    last_date: string | null
  }
  overall_readiness: number
  today_missions: DailyMission[]
  subject_readiness: Array<{
    subject_id: string
    subject_name: string
    color_hex: string
    exam_date: string | null
    days_until: number | null
    readiness: number
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
