export * from './database'

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

export interface PastPaper {
  id: string
  user_id: string
  subject_id: string
  paper_code: string
  year: number
  session: 'feb_mar' | 'may_jun' | 'oct_nov'
  paper_number: number
  attempted_at: string
  score_raw: number
  score_max: number
  accuracy_pct: number
  time_taken_mins: number | null
  notes: string | null
  created_at: string
}

export interface PaperQuestion {
  id: string
  paper_id: string
  chapter_id: string | null
  question_number: string
  marks_available: number
  marks_obtained: number
}

export interface PaperWithSubject extends PastPaper {
  subjects: { name: string; color_hex: string; code: string }
}

export interface PaperWithQuestions extends PastPaper {
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
