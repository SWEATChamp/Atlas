import { z } from 'zod'

export const AssignPaperStageSchema = z.object({
  paperId: z.string().uuid({ message: 'Invalid paper ID format' }),
  stage: z.enum(['as', 'a2'], { message: 'Stage must be either "as" or "a2"' }),
})

export function validateAssignPaperStageInput(paperId: unknown, stage: unknown) {
  return AssignPaperStageSchema.safeParse({ paperId, stage })
}
