import { describe, expect, test } from 'vitest'
import { SubjectEnrollSchema, ExamDateSchema } from '../lib/validators/onboarding'

describe('MVP Five-Subject Scope & Validation', () => {
  test('SubjectEnrollSchema validates 1 to 5 subject UUIDs', () => {
    const validIds = [
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
    ]

    const result = SubjectEnrollSchema.safeParse({ subjectIds: validIds })
    expect(result.success).toBe(true)

    // Rejects empty array
    const emptyResult = SubjectEnrollSchema.safeParse({ subjectIds: [] })
    expect(emptyResult.success).toBe(false)

    // Rejects more than 5 subjects
    const sixIds = [
      ...validIds,
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04',
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05',
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06',
    ]
    const tooManyResult = SubjectEnrollSchema.safeParse({ subjectIds: sixIds })
    expect(tooManyResult.success).toBe(false)
  })

  test('ExamDateSchema validates enrollment dates and target grades', () => {
    const enrollments = [
      {
        subjectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
        examDate: '2026-06-01',
        targetGrade: 'A*',
      },
      {
        subjectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
        examDate: '2026-06-15',
        targetGrade: 'A',
      },
    ]

    const result = ExamDateSchema.safeParse({ enrollments })
    expect(result.success).toBe(true)
  })
})
