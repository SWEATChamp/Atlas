import type {
  ChapterStage,
  PaperSession,
  PaperStage,
  PracticeSession,
  PracticeSessionItem,
  StudyRoute,
  SubjectStage,
} from './database'

export interface PracticeProvenanceInput {
  subjectPaperId?: string | null
  paperNumber?: number | null
  examYear?: number | null
  examSeries?: PaperSession | null
  examVariant?: number | null
  sourceLabel?: string | null
}

export type PracticeItemInput = {
  itemOrder: number
  marksObtained: number
  marksAvailable: number
  questionLabel?: string | null
  notes?: string | null
  chapterIds?: string[]
} & (
  | { provenanceMode: 'inherit'; provenance?: never }
  | { provenanceMode: 'override'; provenance: PracticeProvenanceInput }
  | { provenanceMode: 'none'; provenance?: Pick<PracticeProvenanceInput, 'sourceLabel'> }
)

export interface PracticeWriteFields {
  title?: string | null
  sessionDate: string
  durationMins?: number | null
  notes?: string | null
  provenance?: PracticeProvenanceInput
  items: PracticeItemInput[]
}

export interface PracticeCreateInput extends PracticeWriteFields {
  subjectId: string
  stage: PaperStage
}

export interface PracticeUpdateInput extends PracticeWriteFields {
  sessionId: string
}

export interface PracticeEnrollmentContext {
  id: string
  subjectId: string
  subjectCode: string | null
  studyRoute: StudyRoute
  currentStage: SubjectStage | null
  isArchived: boolean
}

export interface PracticeSelectionContext {
  subjectPaperId: string | null
  componentName: string
  stage: PaperStage
}

export interface PracticeChapterContext {
  id: string
  subjectId: string
  title?: string
  stage: ChapterStage | null
  component: string | null
  isActive: boolean
  paperIds: string[]
}

export interface PracticePaperContext {
  id: string
  subjectId: string
  paperNumber: number
  name?: string
}

export interface PracticeFormSubjectOption {
  id: string
  name: string
  code: string
  context: PracticeRouteContext
}

export interface PracticeRouteContext {
  enrollment: PracticeEnrollmentContext | null
  selections: PracticeSelectionContext[]
  chapters: PracticeChapterContext[]
  papers: PracticePaperContext[]
}

export interface PracticeItemRead extends PracticeSessionItem {
  chapter_ids: string[]
  eligible_for_readiness: boolean
  eligibility_reason: 'eligible' | 'inactive_route_or_stage' | 'off_route_paper' | 'inaccessible_chapter'
}

export interface PracticeSessionRead extends PracticeSession {
  items: PracticeItemRead[]
  eligible_score_raw: number
  eligible_score_max: number
  eligible_for_readiness: boolean
  route_status: 'current' | 'historical'
}

export interface PracticeHistoryPage {
  sessions: PracticeSessionRead[]
  total: number
  offset: number
  limit: number
}

export interface AttemptTrendPoint {
  id: string
  source: 'full_paper' | 'practice'
  subjectId: string
  stage: PaperStage | null
  attemptDate: string
  createdAt: string
  subjectPaperId: string | null
  paperNumber: number | null
  raw: number
  max: number
  accuracyPct: number
  eligibleRaw: number
  eligibleMax: number
  eligibleForCurrentRoute: boolean
  itemCount: number
}

export interface EvidenceSummary {
  attempts: number
  raw: number
  max: number
  weightedAccuracyPct: number | null
}

export interface AttemptTrendSummary {
  lifetime: EvidenceSummary
  currentRoute: EvidenceSummary
}

export interface ChapterEvidence {
  chapterId: string
  raw: number
  max: number
  attempts: number
  accuracyPct: number
  weakTopic: boolean
  fullPaperAttempts: number
  practiceItems: number
}
