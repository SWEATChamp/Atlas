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

export type UsernameInput = z.infer<typeof UsernameSchema>
export type SubjectEnrollInput = z.infer<typeof SubjectEnrollSchema>
export type ExamDateInput = z.infer<typeof ExamDateSchema>
