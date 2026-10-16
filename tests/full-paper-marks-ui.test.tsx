import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LogPaperModal } from '@/components/papers/log-paper-modal'

const { logPaper, updatePaper, client } = vi.hoisted(() => {
  const rows: Record<string, unknown[]> = {
    user_subjects: [{ id: 'enrollment', subject_id: 'subject', current_stage: 'as', study_route: 'staged', subjects: { id: 'subject', name: 'Mathematics', code: '9709' } }],
    subject_papers: [{ id: 'paper', name: 'Pure Mathematics 1', paper_number: 1 }],
    subject_paper_selections: [{ subject_paper_id: 'paper', paper_number: 1, stage: 'as' }],
    chapters: [], chapter_papers: [],
    paper_question_attempts: [{ question_number: '1', chapter_id: null, marks_obtained: 0, marks_available: 1 }],
  }
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user' } } }) },
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, order: () => query,
        then: (resolve: (value: { data: unknown[] }) => unknown) => Promise.resolve({ data: rows[table] ?? [] }).then(resolve),
      }
      return query
    },
  }
  return { logPaper: vi.fn(), updatePaper: vi.fn(), client }
})

vi.mock('@/lib/supabase/client', () => ({ createClient: () => client }))
vi.mock('@/lib/actions/papers', () => ({ logPaper, updatePaper }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const existingPaper = {
  subjectId: 'subject', subjectPaperId: 'paper', year: 2025,
  session: 'may_jun' as const, paperNumber: 1, variant: 1,
  stage: 'as' as const, attemptedAt: '2025-06-01',
}

async function openQuestions(editing: boolean) {
  render(<LogPaperModal timeZone="UTC" onClose={vi.fn()}
    {...(editing ? { existingPaperId: 'attempt', existingPaper } : {})} />)
  const next = await screen.findByRole('button', { name: 'Next → Add Questions' })
  await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(next)
  return screen.getByLabelText('Question 1 marks available') as HTMLInputElement
}

describe.each([false, true])('full-paper question marks (%s = editing)', editing => {
  it('allows 1 → blank → 25, retains focus, and saves numeric maximum with zero obtained', async () => {
    const action = editing ? updatePaper : logPaper
    action.mockResolvedValue({ error: 'Test completed without a database write' })
    const maximum = await openQuestions(editing)
    expect(maximum.value).toBe('1')
    maximum.focus()
    fireEvent.change(maximum, { target: { value: '' } })
    expect(maximum.value).toBe('')
    expect(document.activeElement).toBe(maximum)
    expect(maximum.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/enter a whole-number maximum of at least 1/)).toBeTruthy()
    fireEvent.blur(maximum)
    expect(maximum.value).toBe('')

    maximum.focus()
    fireEvent.change(maximum, { target: { value: '2' } })
    fireEvent.change(maximum, { target: { value: '25' } })
    expect(maximum.value).toBe('25')
    expect(document.activeElement).toBe(maximum)
    expect(maximum.getAttribute('aria-invalid')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: editing ? 'Save Changes' : 'Save Paper' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const payload = action.mock.calls[0][editing ? 1 : 0]
    expect(payload.questions).toEqual([{ questionNumber: '1', chapterId: null, marksObtained: 0, marksAvailable: 25 }])
  })

  it.each(['', '0', '-1', '2.5'])('rejects maximum %j without coercing or saving it', async invalid => {
    const maximum = await openQuestions(editing)
    fireEvent.change(maximum, { target: { value: invalid } })
    fireEvent.blur(maximum)
    expect(maximum.value).toBe(invalid)
    expect(maximum.getAttribute('aria-invalid')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: editing ? 'Save Changes' : 'Save Paper' }))
    expect((await screen.findByRole('alert')).textContent?.trim()).toBe('Q1: max marks must be a whole number of at least 1')
    expect(logPaper).not.toHaveBeenCalled()
    expect(updatePaper).not.toHaveBeenCalled()
  })

  it('applies the same draft behavior to added questions and preserves the obtained/max guardrail', async () => {
    await openQuestions(editing)
    fireEvent.click(screen.getByRole('button', { name: 'Add Question' }))
    const maximum = screen.getByLabelText('Question 2 marks available') as HTMLInputElement
    fireEvent.change(maximum, { target: { value: '' } })
    expect(maximum.value).toBe('')
    fireEvent.change(maximum, { target: { value: '25' } })
    fireEvent.change(screen.getByLabelText('Question 2 marks obtained'), { target: { value: '20' } })
    fireEvent.change(maximum, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: editing ? 'Save Changes' : 'Save Paper' }))
    expect((await screen.findByRole('alert')).textContent?.trim()).toBe('Q2: marks obtained exceeds max marks')
    expect(logPaper).not.toHaveBeenCalled()
    expect(updatePaper).not.toHaveBeenCalled()
  })
})
