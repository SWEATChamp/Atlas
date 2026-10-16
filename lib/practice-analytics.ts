import type { PaperQuestionAttempt, PaperStage, PastPaper } from '@/types/database'
import type {
  AttemptTrendPoint, AttemptTrendSummary, ChapterEvidence, EvidenceSummary,
  PracticeChapterContext, PracticeItemRead, PracticeRouteContext, PracticeSessionRead,
} from '@/types/practice-sessions'

export type PaperEvidence = Pick<PastPaper, 'id' | 'subject_id' | 'stage' | 'attempted_at' | 'created_at' | 'subject_paper_id' | 'paper_number' | 'score_raw' | 'score_max' | 'accuracy_pct'>
export type PaperQuestionEvidence = Pick<PaperQuestionAttempt, 'id' | 'marks_available' | 'marks_obtained' | 'chapter_id' | 'chapter_ids'>

const percent = (raw: number, max: number) => max > 0 ? (raw / max) * 100 : null
const validPaper = (paper: Pick<PaperEvidence, 'score_raw' | 'score_max'>) =>
  Number.isFinite(paper.score_raw) && Number.isFinite(paper.score_max) &&
  paper.score_max > 0 && paper.score_raw >= 0 && paper.score_raw <= paper.score_max
export const fullPaperHistory = (papers: readonly PaperEvidence[]) => papers.filter(validPaper).slice().sort((a, b) =>
  b.attempted_at.localeCompare(a.attempted_at) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
export const fullPaperCount = (papers: readonly PaperEvidence[]) => papers.filter(validPaper).length
export function markWeightedScores(rows: readonly { score_raw: number; score_max: number }[]): number | null {
  const valid = rows.filter(validPaper)
  return percent(valid.reduce((sum, row) => sum + row.score_raw, 0), valid.reduce((sum, row) => sum + row.score_max, 0))
}
export function markWeightedPaperAverage(papers: readonly PaperEvidence[]): number | null {
  return markWeightedScores(papers)
}
export const latestFullPaper = (papers: readonly PaperEvidence[]) => fullPaperHistory(papers)[0] ?? null
export const bestFullPaper = (papers: readonly PaperEvidence[]) => papers.filter(validPaper).slice().sort((a, b) =>
  b.score_raw / b.score_max - a.score_raw / a.score_max || b.score_raw - a.score_raw ||
  b.attempted_at.localeCompare(a.attempted_at) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0] ?? null

export const basePaperNumber = (number: number | null) => number === null ? null :
  number >= 11 && number <= 99 ? Math.floor(number / 10) : number

export function comparableFullPapers(papers: readonly PaperEvidence[], reference: Pick<PaperEvidence, 'subject_id' | 'stage' | 'subject_paper_id' | 'paper_number'>) {
  const component = basePaperNumber(reference.paper_number)
  return fullPaperHistory(papers).filter(paper => paper.subject_id === reference.subject_id && paper.stage === reference.stage &&
    (reference.subject_paper_id && paper.subject_paper_id
      ? paper.subject_paper_id === reference.subject_paper_id
      : component !== null && basePaperNumber(paper.paper_number) === component))
}

export function comparableComponentAnalytics(papers: readonly PaperEvidence[], reference: Pick<PaperEvidence, 'subject_id' | 'stage' | 'subject_paper_id' | 'paper_number'>) {
  const comparable = comparableFullPapers(papers, reference)
  return { count: comparable.length, markWeightedAccuracyPct: markWeightedPaperAverage(comparable),
    averageRaw: comparable.length ? comparable.reduce((sum, paper) => sum + paper.score_raw, 0) / comparable.length : null,
    averageMax: comparable.length ? comparable.reduce((sum, paper) => sum + paper.score_max, 0) / comparable.length : null,
    latest: latestFullPaper(comparable), best: bestFullPaper(comparable) }
}

export type ComponentRank = 'weakest' | 'strongest' | 'tied' | null
type ComponentRankingEvidence = { count: number; markWeightedAccuracyPct: number | null }

// Compare only components with at least two valid attempts, and only when two
// components qualify. Equal scores are neutral; display order never breaks ties.
export function rankComponentEvidence<T extends ComponentRankingEvidence>(components: readonly T[]): (T & { ranking: ComponentRank })[] {
  const isEligible = (component: T): component is T & { markWeightedAccuracyPct: number } =>
    Number.isInteger(component.count) && component.count >= 2 &&
    typeof component.markWeightedAccuracyPct === 'number' && Number.isFinite(component.markWeightedAccuracyPct) &&
    component.markWeightedAccuracyPct >= 0 && component.markWeightedAccuracyPct <= 100
  const eligible = components.filter(isEligible)
  const scores = eligible.map(component => component.markWeightedAccuracyPct)
  const lowest = Math.min(...scores)
  const highest = Math.max(...scores)
  return components.map(component => {
    let ranking: ComponentRank = null
    if (eligible.length >= 2 && isEligible(component)) {
      const score = component.markWeightedAccuracyPct
      if (scores.filter(value => value === score).length > 1) ranking = 'tied'
      else if (score === lowest) ranking = 'weakest'
      else if (score === highest) ranking = 'strongest'
    }
    return { ...component, ranking }
  })
}

// Both predicted grades and official-threshold comparisons consume only measured full-paper rows.
export const predictionPaperInputs = (papers: readonly PaperEvidence[], subjectId: string, stage?: PaperStage) =>
  fullPaperHistory(papers).filter(paper => paper.subject_id === subjectId && (!stage || paper.stage === stage))
export const officialThresholdPaperInputs = predictionPaperInputs

function selectedPaper(paperId: string, stage: PaperStage, context: PracticeRouteContext) {
  return context.selections.some(selection => selection.subjectPaperId === paperId && selection.stage === stage)
}
function stageOpen(stage: PaperStage, context: PracticeRouteContext) {
  const enrollment = context.enrollment
  return !!enrollment && !enrollment.isArchived && enrollment.studyRoute !== 'unconfirmed' &&
    (stage === 'as' || enrollment.currentStage === 'a2' || enrollment.currentStage === 'full')
}
function chapterEligible(chapter: PracticeChapterContext | undefined, stage: PaperStage, paperId: string | null, context: PracticeRouteContext) {
  if (!chapter || !chapter.isActive || chapter.subjectId !== context.enrollment?.subjectId || !stageOpen(stage, context)) return false
  const paper = paperId ? context.papers.find(candidate => candidate.id === paperId && candidate.subjectId === chapter.subjectId) : null
  const science = context.enrollment?.subjectCode === '9701' || context.enrollment?.subjectCode === '9702'
  const stageValid = chapter.stage === stage || chapter.stage === 'shared' ||
    (chapter.stage === 'route_dependent' && context.selections.some(selection => selection.stage === stage &&
      ((selection.subjectPaperId !== null && chapter.paperIds.includes(selection.subjectPaperId)) || selection.componentName === chapter.component))) ||
    (science && paper?.paperNumber === 5 && stage === 'a2' && chapter.stage === 'as')
  if (!stageValid) return false
  if (!paperId) return true
  if (!paper) return false
  if (science && paper.paperNumber === 3 && stage === 'as' && (chapter.stage === 'as' || chapter.stage === 'shared')) return true
  if (science && paper.paperNumber === 5 && stage === 'a2') return true
  return chapter.paperIds.includes(paperId)
}

export function eligiblePracticeChapterIds(context: PracticeRouteContext, stage: PaperStage, paperId: string | null): string[] {
  return context.chapters.filter(chapter => chapterEligible(chapter, stage, paperId, context)).map(chapter => chapter.id)
}

// A known catalogue chapter may be valid historical topical practice while its
// assessed component is absent from the current route. Keep logging/denominators
// unchanged and apply this stricter check only to scored practice evidence.
function assessmentChapterEligible(chapter: PracticeChapterContext | undefined, stage: PaperStage, paperId: string | null, context: PracticeRouteContext) {
  return chapterEligible(chapter, stage, paperId, context) && !!chapter &&
    (paperId !== null || chapter.paperIds.length === 0 || context.selections.some(selection =>
      selection.stage === stage && ((selection.subjectPaperId !== null && chapter.paperIds.includes(selection.subjectPaperId)) ||
        selection.componentName === chapter.component)))
}

/** Explicit off-route paper sources may be logged as history; this does not grant readiness eligibility. */
export function eligiblePracticeLoggingChapterIds(context: PracticeRouteContext, stage: PaperStage, paperId: string | null): string[] {
  if (!paperId) return eligiblePracticeChapterIds(context, stage, null)
  if (!stageOpen(stage, context)) return []
  const paper = context.papers.find(candidate => candidate.id === paperId && candidate.subjectId === context.enrollment?.subjectId)
  if (!paper) return []
  const selection = context.selections.find(candidate => candidate.subjectPaperId === paperId)
  if (selection) return selection.stage === stage ? eligiblePracticeChapterIds(context, stage, paperId) : []
  const catalogStage = paper.stageBehavior === 'fixed_as' ? 'as' : paper.stageBehavior === 'fixed_a2' ? 'a2' : paper.defaultStage
  if (catalogStage !== stage) return []
  const science = context.enrollment?.subjectCode === '9701' || context.enrollment?.subjectCode === '9702'
  return context.chapters.filter(chapter => {
    if (!chapter.isActive || chapter.subjectId !== paper.subjectId) return false
    const mapped = chapter.paperIds.includes(paperId)
    const stageValid = chapter.stage === stage || chapter.stage === 'shared' ||
      (chapter.stage === 'route_dependent' && mapped) ||
      (science && paper.paperNumber === 5 && stage === 'a2' && chapter.stage === 'as')
    const sourceValid = mapped || (science && paper.paperNumber === 3 && stage === 'as' && (chapter.stage === 'as' || chapter.stage === 'shared')) ||
      (science && paper.paperNumber === 5 && stage === 'a2')
    return stageValid && sourceValid
  }).map(chapter => chapter.id)
}

export function withPracticeEligibility(session: Omit<PracticeSessionRead, 'eligible_score_raw' | 'eligible_score_max' | 'eligible_for_readiness' | 'route_status'>, context: PracticeRouteContext): PracticeSessionRead {
  const open = context.enrollment?.subjectId === session.subject_id && stageOpen(session.stage, context)
  const items: PracticeItemRead[] = session.items.map(item => {
    let reason: PracticeItemRead['eligibility_reason'] = 'eligible'
    if (!open) reason = 'inactive_route_or_stage'
    else if (item.subject_paper_id && !selectedPaper(item.subject_paper_id, session.stage, context)) reason = 'off_route_paper'
    else if (item.chapter_ids.some(id => !assessmentChapterEligible(context.chapters.find(chapter => chapter.id === id), session.stage, item.subject_paper_id, context))) reason = 'inaccessible_chapter'
    return { ...item, eligible_for_readiness: reason === 'eligible', eligibility_reason: reason }
  })
  return {
    ...session, items,
    eligible_score_raw: items.reduce((sum, item) => sum + (item.eligible_for_readiness ? item.marks_obtained : 0), 0),
    eligible_score_max: items.reduce((sum, item) => sum + (item.eligible_for_readiness ? item.marks_available : 0), 0),
    eligible_for_readiness: items.some(item => item.eligible_for_readiness),
    route_status: items.some(item => item.eligible_for_readiness) ? 'current' : 'historical',
  }
}

function paperEligible(paper: PaperEvidence, context: PracticeRouteContext | undefined) {
  if (!context || !paper.stage || context.enrollment?.subjectId !== paper.subject_id || !stageOpen(paper.stage, context)) return false
  const number = paper.paper_number
  if (number === null || !(number >= 1 && number <= 9 || number >= 11 && number <= 99 && number % 10 >= 1 && number % 10 <= 9)) return false
  const component = basePaperNumber(number)
  return context.papers.some(candidate => candidate.subjectId === paper.subject_id && candidate.paperNumber === component &&
    (!paper.subject_paper_id || paper.subject_paper_id === candidate.id) && selectedPaper(candidate.id, paper.stage!, context))
}

export function attemptTrend(papers: readonly PaperEvidence[], sessions: readonly PracticeSessionRead[], contexts: ReadonlyMap<string, PracticeRouteContext>): AttemptTrendPoint[] {
  const points: AttemptTrendPoint[] = [
    ...fullPaperHistory(papers).map(paper => ({
      id: paper.id, source: 'full_paper' as const, subjectId: paper.subject_id, stage: paper.stage,
      attemptDate: paper.attempted_at, createdAt: paper.created_at, subjectPaperId: paper.subject_paper_id,
      paperNumber: paper.paper_number, raw: paper.score_raw, max: paper.score_max, accuracyPct: paper.accuracy_pct,
      eligibleRaw: paperEligible(paper, contexts.get(paper.subject_id)) ? paper.score_raw : 0,
      eligibleMax: paperEligible(paper, contexts.get(paper.subject_id)) ? paper.score_max : 0,
      eligibleForCurrentRoute: paperEligible(paper, contexts.get(paper.subject_id)), itemCount: 0,
    })),
    ...sessions.map(session => ({
      id: session.id, source: 'practice' as const, subjectId: session.subject_id, stage: session.stage,
      attemptDate: session.session_date, createdAt: session.created_at, subjectPaperId: session.subject_paper_id,
      paperNumber: session.paper_number, raw: session.total_score_raw, max: session.total_score_max,
      accuracyPct: session.accuracy_pct, eligibleRaw: session.eligible_score_raw,
      eligibleMax: session.eligible_score_max, eligibleForCurrentRoute: session.eligible_for_readiness,
      itemCount: session.items.length,
    })),
  ]
  return points.sort((a, b) => a.attemptDate.localeCompare(b.attemptDate) || a.createdAt.localeCompare(b.createdAt) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id))
}

export function summarizeEvidence(points: readonly AttemptTrendPoint[]): AttemptTrendSummary {
  const sum = (rows: readonly AttemptTrendPoint[], current: boolean): EvidenceSummary => {
    const raw = rows.reduce((total, point) => total + (current ? point.eligibleRaw : point.raw), 0)
    const max = rows.reduce((total, point) => total + (current ? point.eligibleMax : point.max), 0)
    return { attempts: rows.length, raw, max, weightedAccuracyPct: percent(raw, max) }
  }
  return { lifetime: sum(points, false), currentRoute: sum(points.filter(point => point.eligibleForCurrentRoute), true) }
}

export function combinedChapterEvidence(questions: readonly PaperQuestionEvidence[], sessions: readonly PracticeSessionRead[], weakBelowPct = 60): ChapterEvidence[] {
  const evidence = new Map<string, ChapterEvidence>()
  const add = (chapterId: string, raw: number, max: number, source: 'fullPaperAttempts' | 'practiceItems') => {
    const current = evidence.get(chapterId) ?? { chapterId, raw: 0, max: 0, attempts: 0, accuracyPct: 0, weakTopic: false, fullPaperAttempts: 0, practiceItems: 0 }
    current.raw += raw; current.max += max; current.attempts += 1; current[source] += 1
    evidence.set(chapterId, current)
  }
  for (const question of questions) {
    for (const id of new Set(question.chapter_ids.length ? question.chapter_ids : question.chapter_id ? [question.chapter_id] : [])) add(id, question.marks_obtained, question.marks_available, 'fullPaperAttempts')
  }
  for (const session of sessions) for (const item of session.items) if (item.eligible_for_readiness) {
    for (const id of new Set(item.chapter_ids)) add(id, item.marks_obtained, item.marks_available, 'practiceItems')
  }
  return [...evidence.values()].map(row => ({ ...row, accuracyPct: percent(row.raw, row.max) ?? 0, weakTopic: (percent(row.raw, row.max) ?? 0) < weakBelowPct }))
    .sort((a, b) => a.accuracyPct - b.accuracyPct || a.chapterId.localeCompare(b.chapterId))
}
