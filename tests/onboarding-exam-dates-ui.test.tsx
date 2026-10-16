import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ExamDatesStep from '@/app/(auth)/onboarding/steps/exam-dates-step'

const { rows, client, setExamDates, completeOnboarding } = vi.hoisted(() => {
  const rows = [
    { subject_id: 'maths', exam_date: '2027-06-01', target_grade: 'A', subjects: { name: 'Mathematics', code: '9709', color_hex: '#3b82f6' } },
    { subject_id: 'further', exam_date: '2027-11-01', target_grade: 'B', subjects: { name: 'Further Mathematics', code: '9231', color_hex: '#8b5cf6' } },
    { subject_id: 'physics', exam_date: null, target_grade: 'A', subjects: { name: 'Physics', code: '9702', color_hex: '#06b6d4' } },
    { subject_id: 'chemistry', exam_date: '2026-11-01', target_grade: 'C', subjects: { name: 'Chemistry', code: '9701', color_hex: '#10b981' } },
  ]
  const query = {
    select: () => query, eq: () => query, in: () => query,
    then: (resolve: (result: { data: typeof rows }) => unknown) => Promise.resolve({ data: rows }).then(resolve),
  }
  return {
    rows,
    client: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'preview-user' } } }) }, from: () => query },
    setExamDates: vi.fn().mockResolvedValue({}),
    completeOnboarding: vi.fn(),
  }
})

vi.mock('@/lib/supabase/client', () => ({ createClient: () => client }))
vi.mock('@/lib/actions/onboarding', () => ({ setExamDates, completeOnboarding }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('onboarding exam session and grade choices', () => {
  it('keeps every choice available and exposes saved selections for all four subjects', async () => {
    render(<ExamDatesStep subjectIds={rows.map(row => row.subject_id)} onNext={vi.fn()} />)
    for (const row of rows) {
      const sessions = await screen.findByRole('group', { name: `${row.subjects.name} exam session` })
      expect(within(sessions).getAllByRole('button')).toHaveLength(3)
      expect(within(sessions).getByRole('button', { name: 'Oct / Nov 2027' })).toBeTruthy()
      const selected = within(sessions).queryAllByRole('button', { pressed: true })
      expect(selected).toHaveLength(row.exam_date ? 1 : 0)
      const grades = screen.getByRole('group', { name: `${row.subjects.name} target grade` })
      expect(within(grades).getAllByRole('button')).toHaveLength(6)
      expect(within(grades).getByRole('button', { name: row.target_grade, pressed: true })).toBeTruthy()
    }
    expect((screen.getByRole('button', { name: 'Next → Study Routes' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('changes the last session and grade independently without losing other subject choices', async () => {
    const onNext = vi.fn()
    render(<ExamDatesStep subjectIds={rows.map(row => row.subject_id)} onNext={onNext} />)
    const maths = await screen.findByRole('group', { name: 'Mathematics exam session' })
    fireEvent.click(within(maths).getByRole('button', { name: 'Oct / Nov 2027' }))
    const mathsGrades = screen.getByRole('group', { name: 'Mathematics target grade' })
    fireEvent.click(within(mathsGrades).getByRole('button', { name: 'A*' }))
    expect(within(maths).getByRole('button', { name: 'Oct / Nov 2027', pressed: true })).toBeTruthy()
    expect(within(mathsGrades).getByRole('button', { name: 'A*', pressed: true })).toBeTruthy()
    const physics = screen.getByRole('group', { name: 'Physics exam session' })
    fireEvent.click(within(physics).getByRole('button', { name: 'May / Jun 2027' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next → Study Routes' }))
    await waitFor(() => expect(setExamDates).toHaveBeenCalledWith([
      { subjectId: 'maths', examDate: '2027-11-01', targetGrade: 'A*' },
      { subjectId: 'further', examDate: '2027-11-01', targetGrade: 'B' },
      { subjectId: 'physics', examDate: '2027-06-01', targetGrade: 'A' },
      { subjectId: 'chemistry', examDate: '2026-11-01', targetGrade: 'C' },
    ]))
    expect(onNext).toHaveBeenCalledOnce()
    expect(completeOnboarding).not.toHaveBeenCalled()
  })
})
