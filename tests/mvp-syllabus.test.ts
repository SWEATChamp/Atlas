import { describe, expect, test } from 'vitest'
import { SubjectEnrollSchema, ExamDateSchema } from '../lib/validators/onboarding'

describe('MVP Five-Subject Scope & Validation', () => {
  const MVP_SUBJECT_CODES = ['9709', '9231', '9702', '9701', '9618']

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

  test('5 MVP subjects have exact official paper requirements', () => {
    const expectedPapersPerSubject: Record<string, number> = {
      '9709': 6, // Mathematics (P1, P2, P3, P4, P5, P6)
      '9231': 4, // Further Mathematics (FP1, FP2, FM, FPS)
      '9702': 5, // Physics (P1, P2, P3, P4, P5)
      '9701': 5, // Chemistry (P1, P2, P3, P4, P5)
      '9618': 4, // Computer Science (P1, P2, P3, P4)
    }

    expect(Object.keys(expectedPapersPerSubject).sort()).toEqual([...MVP_SUBJECT_CODES].sort())
    expect(expectedPapersPerSubject['9709']).toBe(6)
    expect(expectedPapersPerSubject['9231']).toBe(4)
    expect(expectedPapersPerSubject['9702']).toBe(5)
    expect(expectedPapersPerSubject['9701']).toBe(5)
    expect(expectedPapersPerSubject['9618']).toBe(4)
  })

  test('Official chapter models count per subject', () => {
    const expectedActiveChapters: Record<string, number> = {
      '9709': 38, // Mathematics (excluding 1 deprecated Pure 1 Vectors row)
      '9231': 24, // Further Mathematics (7 FP1 + 6 FP2 + 6 FM + 5 FPS)
      '9702': 25, // Physics (11 AS + 14 A2; Waves & Superposition split, Temp & Ideal Gases split)
      '9701': 37, // Chemistry (22 AS + 15 A2)
      '9618': 20, // Computer Science (8 P1 + 4 P2 + 8 P3/P4)
    }

    expect(expectedActiveChapters['9709']).toBe(38)
    expect(expectedActiveChapters['9231']).toBe(24)
    expect(expectedActiveChapters['9702']).toBe(25)
    expect(expectedActiveChapters['9701']).toBe(37)
    expect(expectedActiveChapters['9618']).toBe(20)
  })
})
