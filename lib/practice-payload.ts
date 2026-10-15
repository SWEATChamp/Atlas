import type { PracticeCreateInput, PracticeItemInput, PracticeProvenanceInput, PracticeUpdateInput } from '@/types/practice-sessions'

export function toRpcProvenance(bundle: PracticeProvenanceInput | undefined): Record<string, string | number | null> {
  if (!bundle) return {}
  const result: Record<string, string | number | null> = {}
  if (bundle.subjectPaperId !== undefined) result.subject_paper_id = bundle.subjectPaperId
  if (bundle.paperNumber !== undefined) result.paper_number = bundle.paperNumber
  if (bundle.examYear !== undefined) result.exam_year = bundle.examYear
  if (bundle.examSeries !== undefined) result.exam_series = bundle.examSeries
  if (bundle.examVariant !== undefined) result.exam_variant = bundle.examVariant
  if (bundle.sourceLabel !== undefined) result.source_label = bundle.sourceLabel
  return result
}

export function toRpcItem(item: PracticeItemInput) {
  const base = {
    item_order: item.itemOrder,
    marks_obtained: item.marksObtained,
    marks_available: item.marksAvailable,
    provenance_mode: item.provenanceMode,
    question_label: item.questionLabel ?? null,
    notes: item.notes ?? null,
    chapter_ids: item.chapterIds ?? [],
  }
  return item.provenanceMode === 'inherit'
    ? base
    : { ...base, provenance: toRpcProvenance(item.provenance) }
}

function writeArgs(input: PracticeCreateInput | PracticeUpdateInput) {
  return {
    p_title: input.title ?? null,
    p_session_date: input.sessionDate,
    p_duration_mins: input.durationMins ?? null,
    p_session_provenance: toRpcProvenance(input.provenance),
    p_items: input.items.map(toRpcItem),
    p_notes: input.notes ?? null,
  }
}

export function toCreateRpcArgs(userId: string, input: PracticeCreateInput) {
  return { p_user_id: userId, p_subject_id: input.subjectId, p_stage: input.stage, ...writeArgs(input) }
}

export function toUpdateRpcArgs(userId: string, input: PracticeUpdateInput) {
  return { p_user_id: userId, p_session_id: input.sessionId, ...writeArgs(input) }
}
