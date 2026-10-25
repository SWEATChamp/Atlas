import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LogPaperModal } from '@/components/papers/log-paper-modal'

let mockEnrollments: unknown[] = []
let mockEnrollmentsResolver: ((val: { data: unknown[] }) => void) | null = null
let isEnrollmentDelayed = false

const mockClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }),
  },
  from: (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      then: (resolve: (value: { data: unknown[] }) => unknown) => {
        if (table === 'user_subjects') {
          if (isEnrollmentDelayed) {
            return new Promise<{ data: unknown[] }>((res) => {
              mockEnrollmentsResolver = res
            }).then(resolve)
          }
          return Promise.resolve({ data: mockEnrollments }).then(resolve)
        }
        if (table === 'subject_papers') {
          return Promise.resolve({
            data: [
              { id: 'sp-1', name: 'Paper 1', paper_number: 1, stage: 'as' },
              { id: 'sp-2', name: 'Paper 2', paper_number: 2, stage: 'as' },
            ],
          }).then(resolve)
        }
        if (table === 'subject_paper_selections') {
          return Promise.resolve({ data: [{ subject_paper_id: 'sp-1', paper_number: 1, stage: 'as' }] }).then(resolve)
        }
        return Promise.resolve({ data: [] }).then(resolve)
      },
    }
    return query
  },
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockClient,
}))

vi.mock('@/lib/actions/papers', () => ({
  logPaper: vi.fn(),
  updatePaper: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockEnrollments = []
  mockEnrollmentsResolver = null
  isEnrollmentDelayed = false
})

describe('LogPaperModal subject initialization and edit precedence', () => {
  const mathId = '00000000-0000-4000-a000-000000000001'
  const chemId = '00000000-0000-4000-a000-000000000002'
  const physId = '00000000-0000-4000-a000-000000000003'

  const standardEnrollments = [
    {
      id: 'enr-1',
      subject_id: mathId,
      current_stage: 'as',
      study_route: 'staged',
      subjects: { id: mathId, name: 'Mathematics', code: '9709' },
    },
    {
      id: 'enr-2',
      subject_id: chemId,
      current_stage: 'as',
      study_route: 'staged',
      subjects: { id: chemId, name: 'Chemistry', code: '9701' },
    },
    {
      id: 'enr-3',
      subject_id: physId,
      current_stage: 'as',
      study_route: 'staged',
      subjects: { id: physId, name: 'Physics', code: '9702' },
    },
  ]

  it('initializes with preferredSubjectId when it matches an active enrolled subject', async () => {
    mockEnrollments = standardEnrollments

    render(
      <LogPaperModal
        timeZone="UTC"
        onClose={vi.fn()}
        preferredSubjectId={chemId}
      />
    )

    const subjectSelect = (await screen.findByRole('combobox', { name: 'Subject' })) as HTMLSelectElement
    await waitFor(() => {
      expect(subjectSelect.value).toBe(chemId)
    })
  })

  it('falls back to the first enrolled subject when preferredSubjectId is invalid or not enrolled', async () => {
    mockEnrollments = standardEnrollments

    render(
      <LogPaperModal
        timeZone="UTC"
        onClose={vi.fn()}
        preferredSubjectId="non-existent-subject-id"
      />
    )

    const subjectSelect = (await screen.findByRole('combobox', { name: 'Subject' })) as HTMLSelectElement
    await waitFor(() => {
      expect(subjectSelect.value).toBe(mathId)
    })
  })

  it('handles empty enrollments gracefully without throwing errors', async () => {
    mockEnrollments = []

    render(
      <LogPaperModal
        timeZone="UTC"
        onClose={vi.fn()}
        preferredSubjectId={mathId}
      />
    )

    const subjectSelect = (await screen.findByRole('combobox', { name: 'Subject' })) as HTMLSelectElement
    await waitFor(() => {
      expect(subjectSelect.value).toBe('')
    })
  })

  it('strictly preserves existingPaper.subjectId during edit mode regardless of preferredSubjectId', async () => {
    mockEnrollments = standardEnrollments

    render(
      <LogPaperModal
        timeZone="UTC"
        onClose={vi.fn()}
        preferredSubjectId={mathId}
        existingPaperId="paper-edit-1"
        existingPaper={{
          subjectId: physId,
          subjectPaperId: 'sp-1',
          year: 2026,
          session: 'may_jun',
          paperNumber: 1,
          variant: 2,
          stage: 'as',
          attemptedAt: '2026-10-15',
        }}
      />
    )

    const subjectSelect = (await screen.findByRole('combobox', { name: 'Subject' })) as HTMLSelectElement
    await waitFor(() => {
      expect(subjectSelect.value).toBe(physId)
      expect(subjectSelect.disabled).toBe(true)
    })
  })

  it('preserves user manual subject choice when delayed re-fetches or retries resolve', async () => {
    mockEnrollments = standardEnrollments
    isEnrollmentDelayed = false

    const { rerender } = render(
      <LogPaperModal
        timeZone="UTC"
        onClose={vi.fn()}
        preferredSubjectId={mathId}
      />
    )

    const subjectSelect = (await screen.findByRole('combobox', { name: 'Subject' })) as HTMLSelectElement
    await waitFor(() => {
      expect(subjectSelect.value).toBe(mathId)
    })

    // Prepare delayed enrollment so the next request remains pending
    isEnrollmentDelayed = true
    mockEnrollmentsResolver = null

    // Trigger a realistic rerender / prop reload
    rerender(
      <LogPaperModal
        timeZone="UTC"
        onClose={vi.fn()}
        preferredSubjectId={physId}
      />
    )

    // Assert that the request started and its resolver exists
    await waitFor(() => {
      expect(mockEnrollmentsResolver).not.toBeNull()
    })

    // User makes an explicit subject selection while the request is pending
    fireEvent.change(subjectSelect, { target: { value: chemId } })
    expect(subjectSelect.value).toBe(chemId)

    // Resolve the pending response
    mockEnrollmentsResolver!({ data: standardEnrollments })

    // Verify preservation: manual choice strictly wins over delayed resolution and new preferredSubjectId
    await waitFor(() => {
      expect(subjectSelect.value).toBe(chemId)
    })
  })
})
