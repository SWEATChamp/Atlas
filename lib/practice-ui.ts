import { dateInTimeZone } from '@/lib/date'
import type { PaperSession, PaperStage } from '@/types/database'
import type { AttemptTrendPoint, PracticeChapterContext, PracticeCreateInput, PracticeItemInput, PracticeProvenanceInput, PracticeRouteContext, PracticeSessionRead, PracticeUpdateInput } from '@/types/practice-sessions'

export type TrendMode = 'all' | 'full_paper' | 'practice'
export const trendModes: { id: TrendMode; label: string }[] = [
  { id: 'all', label: 'All practice' }, { id: 'full_paper', label: 'Full papers' }, { id: 'practice', label: 'Question practice' },
]
export const trendPointsForMode = (points: readonly AttemptTrendPoint[], mode: TrendMode) =>
  mode === 'all' ? [...points] : points.filter(point => point.source === mode)

/** Paper/component order first, then the catalogue's numeric syllabus order. */
export function practiceChapterGroups(chapters: PracticeChapterContext[], context: PracticeRouteContext) {
  const groups = new Map<string, PracticeChapterContext[]>()
  for (const chapter of chapters) {
    const name = chapter.component ?? 'General'
    groups.set(name, [...(groups.get(name) ?? []), chapter])
  }
  const paperOrder = (rows: PracticeChapterContext[]) => Math.min(...rows.flatMap(chapter =>
    context.papers.filter(paper => chapter.paperIds.includes(paper.id)).map(paper => paper.paperNumber)), Number.POSITIVE_INFINITY)
  return [...groups].map(([name, rows]) => ({ name, chapters: rows.toSorted((a, b) =>
    (a.number ?? Number.POSITIVE_INFINITY) - (b.number ?? Number.POSITIVE_INFINITY)) }))
    .toSorted((a, b) => paperOrder(a.chapters) - paperOrder(b.chapters))
}

export interface ProvenanceDraft {
  subjectPaperId: string
  examYear: string
  examSeries: '' | PaperSession
  examVariant: string
  sourceLabel: string
}
export interface PracticeItemDraft {
  key: string
  marksObtained: string
  marksAvailable: string
  questionLabel: string
  notes: string
  chapterIds: string[]
  provenanceMode: 'inherit' | 'override' | 'none'
  isModeUntouched?: boolean
  provenance: ProvenanceDraft
}
export interface PracticeDraft {
  subjectId: string
  stage: PaperStage
  sessionDate: string
  title: string
  durationMins: string
  notes: string
  provenance: ProvenanceDraft
  items: PracticeItemDraft[]
}

export function hasSharedProvenance(provenance: ProvenanceDraft): boolean {
  return Boolean(
    provenance.subjectPaperId ||
    provenance.sourceLabel.trim() ||
    provenance.examYear ||
    provenance.examSeries ||
    provenance.examVariant
  )
}

export const blankProvenance = (): ProvenanceDraft => ({ subjectPaperId: '', examYear: '', examSeries: '', examVariant: '', sourceLabel: '' })
export const blankPracticeItem = (key: string, parentProvenance?: ProvenanceDraft): PracticeItemDraft => ({
  key,
  marksObtained: '',
  marksAvailable: '',
  questionLabel: '',
  notes: '',
  chapterIds: [],
  provenanceMode: parentProvenance && hasSharedProvenance(parentProvenance) ? 'inherit' : 'none',
  isModeUntouched: true,
  provenance: blankProvenance(),
})
export function blankPracticeDraft(subjectId: string, timeZone: string): PracticeDraft {
  const provenance = blankProvenance()
  return {
    subjectId,
    stage: 'as',
    sessionDate: dateInTimeZone(new Date(), timeZone),
    title: '',
    durationMins: '',
    notes: '',
    provenance,
    items: [blankPracticeItem('item-1', provenance)],
  }
}

function provenanceFromRead(value: { subject_paper_id: string | null; exam_year: number | null; exam_series: PaperSession | null; exam_variant: number | null; source_label: string | null }): ProvenanceDraft {
  return { subjectPaperId: value.subject_paper_id ?? '', examYear: value.exam_year?.toString() ?? '', examSeries: value.exam_series ?? '',
    examVariant: value.exam_variant?.toString() ?? '', sourceLabel: value.source_label ?? '' }
}
export function draftFromPracticeSession(session: PracticeSessionRead): PracticeDraft {
  return {
    subjectId: session.subject_id, stage: session.stage, sessionDate: session.session_date, title: session.title ?? '',
    durationMins: session.duration_mins?.toString() ?? '', notes: session.notes ?? '', provenance: provenanceFromRead(session),
    items: session.items.map(item => ({
      key: item.id, marksObtained: item.marks_obtained.toString(), marksAvailable: item.marks_available.toString(),
      questionLabel: item.question_label ?? '', notes: item.notes ?? '', chapterIds: [...item.chapter_ids],
      provenanceMode: item.provenance_mode, isModeUntouched: false, provenance: provenanceFromRead(item),
    })),
  }
}

function provenanceInput(draft: ProvenanceDraft): PracticeProvenanceInput {
  return {
    ...(draft.subjectPaperId ? { subjectPaperId: draft.subjectPaperId } : {}),
    ...(draft.examYear ? { examYear: Number(draft.examYear) } : {}),
    ...(draft.examSeries ? { examSeries: draft.examSeries } : {}),
    ...(draft.examVariant ? { examVariant: Number(draft.examVariant) } : {}),
    ...(draft.sourceLabel.trim() ? { sourceLabel: draft.sourceLabel.trim() } : {}),
  }
}
export function toPracticeWriteInput(draft: PracticeDraft, sessionId?: string): PracticeCreateInput | PracticeUpdateInput {
  const items: PracticeItemInput[] = draft.items.map((item, index) => {
    const common = {
      itemOrder: index + 1, marksObtained: item.marksObtained === '' ? Number.NaN : Number(item.marksObtained),
      marksAvailable: item.marksAvailable === '' ? Number.NaN : Number(item.marksAvailable),
      ...(item.questionLabel.trim() ? { questionLabel: item.questionLabel.trim() } : {}),
      ...(item.notes.trim() ? { notes: item.notes.trim() } : {}), chapterIds: item.chapterIds,
    }
    if (item.provenanceMode === 'inherit') return { ...common, provenanceMode: 'inherit' }
    if (item.provenanceMode === 'override') return { ...common, provenanceMode: 'override', provenance: provenanceInput(item.provenance) }
    return { ...common, provenanceMode: 'none', provenance: item.provenance.sourceLabel.trim() ? { sourceLabel: item.provenance.sourceLabel.trim() } : {} }
  })
  const common = {
    sessionDate: draft.sessionDate, ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
    ...(draft.durationMins ? { durationMins: Number(draft.durationMins) } : {}),
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}), provenance: provenanceInput(draft.provenance), items,
  }
  return sessionId ? { ...common, sessionId } : { ...common, subjectId: draft.subjectId, stage: draft.stage }
}
