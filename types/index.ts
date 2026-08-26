export * from './database'
// Re-export PastPaper under an alias so interfaces below can extend it.
// (import() expressions are not valid in extends clauses.)
import type { PastPaper as _PastPaper } from './database'

// App-level types not tied to DB rows

export interface SelectableSubject {
  id: string
  name: string
  code: string | null
  color_hex: string
  icon: string
}

export interface OnboardingSubjectSelection {
  subjectId: string
  examDate: string
  targetGrade: import('./database').TargetGrade
}

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'info' | 'achievement'
  title: string
  body?: string
  durationMs?: number
}

// PastPaper is re-exported from database.ts via export * above.
// The canonical definition includes stage: PaperStage | null and
// paper_number: number | null, matching the actual database schema.

export interface PaperQuestion {
  id: string
  paper_id: string
  chapter_id: string | null
  question_number: string
  marks_available: number
  marks_obtained: number
}

export interface PaperWithSubject extends _PastPaper {
  subjects: { name: string; color_hex: string; code: string }
}

export interface PaperWithQuestions extends _PastPaper {
  subjects: { name: string; color_hex: string; code: string }
  paper_question_attempts: (PaperQuestion & { chapters: { title: string; component: string | null } | null })[]
}

export interface ChapterAccuracy {
  chapter_id: string
  title: string
  component: string | null
  total_obtained: number
  total_available: number
  accuracy_pct: number
  attempt_count: number
}

// ─── AS/A2 App-Level Types ───────────────────────────────────────────────────

export interface PaperSelectionInput {
  component_name: string
  paper_number?: number | null
  stage: 'as' | 'a2'
}

export interface SubjectRouteConfigInput {
  userSubjectId: string
  route: import('./database').StudyRoute
  paperSelections?: PaperSelectionInput[]
}

export interface A2TransitionInput {
  userSubjectId: string
  unlockMethod: import('./database').A2UnlockMethod
  resultType?: import('./database').ResultType
  scoreObtained?: number
  scoreMaximum?: number
  examSeries?: import('./database').PaperSession
  examYear?: number
  carryForward?: boolean
}

export interface SubjectWithStageReadiness {
  user_subject_id?: string
  subject_id: string
  subject_name: string
  color_hex: string
  exam_date: string | null
  days_until: number | null
  study_route: import('./database').StudyRoute
  current_stage: import('./database').SubjectStage | null
  as_readiness: number | null
  a2_readiness: number | null
  readiness: number | null
}

