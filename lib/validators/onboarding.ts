import { z } from 'zod'

/**
 * Zod v4 schemas for onboarding form validation.
 * Server Actions validate with these before touching the database.
 */

export const UsernameSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be 30 characters or fewer')
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username can only contain letters, numbers, and underscores'
    ),
})

export const SubjectEnrollSchema = z.object({
  subjectIds: z
    .array(z.string().uuid())
    .min(1, 'Select at least one subject')
    .max(10, 'Maximum 10 subjects allowed'),
})

export const ExamDateSchema = z.object({
  enrollments: z.array(
    z.object({
      subjectId: z.string().uuid(),
      examDate: z.string().date('Please enter a valid exam date'),
      targetGrade: z.enum(['A*', 'A', 'B', 'C', 'D', 'E']),
    })
  ),
})

export const StudyRouteStepSchema = z.object({
  routes: z.array(
    z.object({
      subjectId: z.string().uuid(),
      route: z.enum(['as_only', 'staged', 'full_level']),
      paperSelections: z.array(
        z.object({
          component_name: z.string().min(1),
          paper_number: z.number().int().min(1).max(9).nullable().optional(),
          stage: z.enum(['as', 'a2']),
        })
      ).optional().default([]),
    })
  ).min(1, 'Please configure study route for your subjects'),
})

export type UsernameInput = z.infer<typeof UsernameSchema>
export type SubjectEnrollInput = z.infer<typeof SubjectEnrollSchema>
export type ExamDateInput = z.infer<typeof ExamDateSchema>
export type StudyRouteStepInput = z.infer<typeof StudyRouteStepSchema>

