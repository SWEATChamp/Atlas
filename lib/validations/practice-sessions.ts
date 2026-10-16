import { z } from 'zod'

const uuid = z.string().uuid()
const nullableText = (max: number) => z.string().max(max).nullable().optional()
const nullableInteger = (min: number, max: number) =>
  z.number().int().min(min).max(max).nullable().optional()

export const PracticeProvenanceSchema = z.strictObject({
  subjectPaperId: uuid.nullable().optional(),
  paperNumber: nullableInteger(1, 9),
  examYear: nullableInteger(1990, 2100),
  examSeries: z.enum(['feb_mar', 'may_jun', 'oct_nov']).nullable().optional(),
  examVariant: nullableInteger(1, 9),
  sourceLabel: z.string().trim().max(120).nullable().optional(),
})

const noneProvenance = z.strictObject({
  sourceLabel: z.string().trim().max(120).nullable().optional(),
})

const itemFields = {
  itemOrder: z.number().int().min(1).max(200),
  marksObtained: z.number().int().min(0).max(1000),
  marksAvailable: z.number().int().min(1).max(1000),
  questionLabel: nullableText(50),
  notes: nullableText(1000),
  chapterIds: z.array(uuid).min(1, 'Select at least one chapter for each question').max(200)
    .refine(ids => new Set(ids).size === ids.length, 'Duplicate chapter mapping'),
}

export const PracticeItemSchema = z.discriminatedUnion('provenanceMode', [
  z.strictObject({ ...itemFields, provenanceMode: z.literal('inherit') }),
  z.strictObject({ ...itemFields, provenanceMode: z.literal('override'), provenance: PracticeProvenanceSchema }),
  z.strictObject({ ...itemFields, provenanceMode: z.literal('none'), provenance: noneProvenance.optional() }),
])

const writeFields = {
  title: nullableText(100),
  sessionDate: z.iso.date().refine(value => value >= '1990-01-01', 'Date is before 1990'),
  durationMins: nullableInteger(1, 1440),
  notes: nullableText(2000),
  provenance: PracticeProvenanceSchema.optional(),
  items: z.array(PracticeItemSchema).min(1).max(200),
}

function hasProvenanceValue(bundle: z.infer<typeof PracticeProvenanceSchema> | undefined): boolean {
  return !!bundle && Object.values(bundle).some(value => value !== null && value !== undefined && value !== '')
}

function checkWriteFields(
  value: { provenance?: z.infer<typeof PracticeProvenanceSchema>; items: z.infer<typeof PracticeItemSchema>[] },
  context: z.RefinementCtx
) {
  let totalMax = 0
  value.items.forEach((item, index) => {
    if (item.itemOrder !== index + 1) {
      context.addIssue({ code: 'custom', path: ['items', index, 'itemOrder'], message: 'Item orders must be consecutive from 1' })
    }
    if (item.marksObtained > item.marksAvailable) {
      context.addIssue({ code: 'custom', path: ['items', index, 'marksObtained'], message: 'Obtained marks exceed available marks' })
    }
    totalMax += item.marksAvailable
    if (item.provenanceMode === 'inherit' && !hasProvenanceValue(value.provenance)) {
      context.addIssue({ code: 'custom', path: ['items', index, 'provenanceMode'], message: 'Inheritance requires parent provenance' })
    }
    if (item.provenanceMode === 'override' && !hasProvenanceValue(item.provenance)) {
      context.addIssue({ code: 'custom', path: ['items', index, 'provenance'], message: 'Override requires provenance' })
    }
  })
  if (totalMax > 10000) {
    context.addIssue({ code: 'custom', path: ['items'], message: 'Session total marks exceed 10000' })
  }
}

export const PracticeCreateSchema = z.strictObject({
  ...writeFields,
  subjectId: uuid,
  stage: z.enum(['as', 'a2']),
}).superRefine(checkWriteFields)

export const PracticeUpdateSchema = z.strictObject({
  ...writeFields,
  sessionId: uuid,
}).superRefine(checkWriteFields)

export const PracticeDeleteSchema = z.strictObject({ sessionId: uuid })

export const PracticeHistoryQuerySchema = z.strictObject({
  subjectId: uuid.optional(),
  stage: z.enum(['as', 'a2', 'all']).optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

export function dateWithinUserToday(sessionDate: string, userToday: string): boolean {
  return sessionDate <= userToday
}

const rowProvenance = {
  subject_paper_id: uuid.nullable(), paper_number: z.number().int().nullable(),
  exam_year: z.number().int().nullable(), exam_series: z.enum(['feb_mar', 'may_jun', 'oct_nov']).nullable(),
  exam_variant: z.number().int().nullable(), source_label: z.string().nullable(),
}
const practiceItemRow = z.object({
  id: uuid, session_id: uuid, item_order: z.number().int(), question_label: z.string().nullable(),
  marks_obtained: z.number().int(), marks_available: z.number().int(),
  provenance_mode: z.enum(['inherit', 'override', 'none']), ...rowProvenance,
  notes: z.string().nullable(), created_at: z.string(),
  practice_session_chapters: z.array(z.object({ chapter_id: uuid })),
})
export const PracticeSessionRowSchema = z.object({
  id: uuid, user_id: uuid, subject_id: uuid, stage: z.enum(['as', 'a2']), session_date: z.iso.date(),
  title: z.string().nullable(), duration_mins: z.number().int().nullable(), notes: z.string().nullable(),
  total_score_raw: z.number().int(), total_score_max: z.number().int(), accuracy_pct: z.number(),
  ...rowProvenance, created_at: z.string(), updated_at: z.string(),
  practice_session_items: z.array(practiceItemRow),
})
