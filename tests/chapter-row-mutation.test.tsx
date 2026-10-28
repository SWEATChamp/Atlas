import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import ChapterRow from '@/components/subjects/chapter-row'
import ChapterGroups from '@/components/subjects/chapter-groups'
import { updateChapterStatus, updateChapterConfidence } from '@/lib/actions/chapters'
import type { Chapter, UserChapter } from '@/types'
import type { ComponentGroup } from '@/lib/subject-chapters'

vi.mock('@/lib/actions/chapters', () => ({
  updateChapterStatus: vi.fn(),
  updateChapterConfidence: vi.fn(),
}))

const mockChapter: Chapter = {
  id: 'ch-test-1',
  subject_id: 'subj-1',
  title: 'Calculus Fundamentals',
  number: 1,
  component: 'Pure Mathematics 1',
  description: null,
  is_global: true,
  is_active: true,
  stage: 'as',
  created_at: '2026-01-01',
}

function mockUserChapter(partial: Partial<UserChapter>): UserChapter {
  return {
    id: 'uc-1',
    user_id: 'user-1',
    chapter_id: 'ch-test-1',
    notes_status: 'none',
    confidence_level: null,
    google_doc_url: null,
    google_doc_id: null,
    last_reviewed_at: null,
    first_completed_at: null,
    revision_count: 0,
    personal_notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

describe('Fix 3: Recoverable Chapter Row Mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('rolls back to last confirmed value and shows accessible feedback on returned server error', async () => {
    const mockUpdateStatus = vi.mocked(updateChapterStatus)
    mockUpdateStatus.mockResolvedValueOnce({ error: 'Server validation failed' })

    const userChapter = mockUserChapter({ notes_status: 'none' })

    render(
      <ChapterRow
        chapter={mockChapter}
        userChapter={userChapter}
        avgScore={null}
        subjectColor="#1E40AF"
        isAccessible={true}
      />
    )

    const statusBtn = screen.getByRole('button', { name: /Notes status: Not started/i })
    expect(statusBtn).toBeDefined()

    // Click to cycle to in_progress
    await act(async () => {
      fireEvent.click(statusBtn)
    })

    // Wait for mutation to fail and roll back
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Server validation failed')
    })

    // Confirmed value is restored
    expect(screen.getByRole('button', { name: /Notes status: Not started/i })).toBeDefined()
  })

  it('rolls back to last confirmed value and shows accessible feedback on rejected promise', async () => {
    const mockUpdateStatus = vi.mocked(updateChapterStatus)
    mockUpdateStatus.mockRejectedValueOnce(new Error('Network connection lost'))

    const userChapter = mockUserChapter({ notes_status: 'in_progress' })

    render(
      <ChapterRow
        chapter={mockChapter}
        userChapter={userChapter}
        avgScore={null}
        subjectColor="#1E40AF"
        isAccessible={true}
      />
    )

    const statusBtn = screen.getByRole('button', { name: /Notes status: In progress/i })
    expect(statusBtn).toBeDefined()

    // Click to cycle in_progress -> complete
    await act(async () => {
      fireEvent.click(statusBtn)
    })

    // Wait for rejection recovery
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Network connection lost')
    })

    // Rolled back to confirmed 'in_progress', not 'none'
    expect(screen.getByRole('button', { name: /Notes status: In progress/i })).toBeDefined()
  })

  it('handles rapid repeated interactions and serializes requests without overwriting newer choices', async () => {
    const mockUpdateStatus = vi.mocked(updateChapterStatus)
    const deferred1 = createDeferred<{ error?: string }>()
    const deferred2 = createDeferred<{ error?: string }>()

    mockUpdateStatus
      .mockImplementationOnce(() => deferred1.promise)
      .mockImplementationOnce(() => deferred2.promise)

    render(
      <ChapterRow
        chapter={mockChapter}
        userChapter={null} // initial 'none'
        avgScore={null}
        subjectColor="#1E40AF"
        isAccessible={true}
      />
    )

    const statusBtn = screen.getByRole('button', { name: /Notes status: Not started/i })

    // Click 1: none -> in_progress
    act(() => {
      fireEvent.click(statusBtn)
    })
    expect(mockUpdateStatus).toHaveBeenCalledTimes(1)
    expect(mockUpdateStatus).toHaveBeenLastCalledWith('ch-test-1', 'in_progress')

    // Click 2 rapidly while first is in-flight: in_progress -> complete
    act(() => {
      fireEvent.click(statusBtn)
    })
    // Second request is queued/coalesced, not fired concurrently
    expect(mockUpdateStatus).toHaveBeenCalledTimes(1)

    // Complete first mutation successfully
    await act(async () => {
      deferred1.resolve({})
    })

    // Now second mutation is dispatched with 'complete'
    expect(mockUpdateStatus).toHaveBeenCalledTimes(2)
    expect(mockUpdateStatus).toHaveBeenLastCalledWith('ch-test-1', 'complete')

    // Complete second mutation successfully
    await act(async () => {
      deferred2.resolve({})
    })

    expect(screen.getByRole('button', { name: /Notes status: Complete/i })).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('prevents an older in-flight failure from rolling back a newer success', async () => {
    const mockUpdateStatus = vi.mocked(updateChapterStatus)
    const deferred1 = createDeferred<{ error?: string }>()
    const deferred2 = createDeferred<{ error?: string }>()

    mockUpdateStatus
      .mockImplementationOnce(() => deferred1.promise)
      .mockImplementationOnce(() => deferred2.promise)

    render(
      <ChapterRow
        chapter={mockChapter}
        userChapter={null} // starts 'none'
        avgScore={null}
        subjectColor="#1E40AF"
        isAccessible={true}
      />
    )

    const statusBtn = screen.getByRole('button', { name: /Notes status: Not started/i })

    // Click 1 (none -> in_progress)
    act(() => {
      fireEvent.click(statusBtn)
    })
    // Click 2 (in_progress -> complete) while 1 is in-flight
    act(() => {
      fireEvent.click(statusBtn)
    })

    // First request fails with server error
    await act(async () => {
      deferred1.resolve({ error: 'First mutation failed' })
    })

    // Because a newer target was queued, the queue immediately dispatches second request ('complete')
    expect(mockUpdateStatus).toHaveBeenCalledTimes(2)
    expect(mockUpdateStatus).toHaveBeenLastCalledWith('ch-test-1', 'complete')

    // Second request succeeds
    await act(async () => {
      deferred2.resolve({})
    })

    // The older failure does NOT roll back the newer success!
    expect(screen.getByRole('button', { name: /Notes status: Complete/i })).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reconciles refreshed props when idle but preserves in-flight optimistic choice', async () => {
    const mockUpdateStatus = vi.mocked(updateChapterStatus)
    const deferred = createDeferred<{ error?: string }>()
    mockUpdateStatus.mockImplementationOnce(() => deferred.promise)

    const initialUserChapter = mockUserChapter({ notes_status: 'none' })

    const { rerender } = render(
      <ChapterRow
        chapter={mockChapter}
        userChapter={initialUserChapter}
        avgScore={null}
        subjectColor="#1E40AF"
        isAccessible={true}
      />
    )

    const statusBtn = screen.getByRole('button', { name: /Notes status: Not started/i })

    // User initiates mutation to in_progress
    act(() => {
      fireEvent.click(statusBtn)
    })
    expect(screen.getByRole('button', { name: /Notes status: In progress/i })).toBeDefined()

    // Stale server revalidation passes old prop while mutation is still in-flight
    rerender(
      <ChapterRow
        chapter={mockChapter}
        userChapter={initialUserChapter}
        avgScore={null}
        subjectColor="#1E40AF"
        isAccessible={true}
      />
    )

    // Optimistic state must NOT be clobbered by stale prop!
    expect(screen.getByRole('button', { name: /Notes status: In progress/i })).toBeDefined()

    // Complete mutation
    await act(async () => {
      deferred.resolve({})
    })

    // Refreshed server prop arrives with confirmed state after success
    const confirmedUserChapter: UserChapter = {
      ...initialUserChapter,
      notes_status: 'in_progress',
    }
    rerender(
      <ChapterRow
        chapter={mockChapter}
        userChapter={confirmedUserChapter}
        avgScore={null}
        subjectColor="#1E40AF"
        isAccessible={true}
      />
    )
    expect(screen.getByRole('button', { name: /Notes status: In progress/i })).toBeDefined()
  })

  it('prevents out-of-order completion from rolling back newer choice', async () => {
    const mockUpdateStatus = vi.mocked(updateChapterStatus)
    const deferred1 = createDeferred<{ error?: string }>()
    const deferred2 = createDeferred<{ error?: string }>()

    mockUpdateStatus
      .mockImplementationOnce(() => deferred1.promise)
      .mockImplementationOnce(() => deferred2.promise)

    render(
      <ChapterRow
        chapter={mockChapter}
        userChapter={mockUserChapter({ notes_status: 'none' })}
        avgScore={null}
        subjectColor="#1E40AF"
        isAccessible={true}
      />
    )

    const statusBtn = screen.getByRole('button', { name: /Notes status: Not started/i })

    // Rapid double click
    act(() => {
      fireEvent.click(statusBtn) // to in_progress
    })
    act(() => {
      fireEvent.click(statusBtn) // to complete
    })

    // Suppose request 1 finishes late
    await act(async () => {
      deferred1.resolve({})
    })
    // UI remains at the newer choice ('complete')
    expect(screen.getByRole('button', { name: /Notes status: Complete/i })).toBeDefined()

    // Request 2 finishes
    await act(async () => {
      deferred2.resolve({})
    })
    expect(screen.getByRole('button', { name: /Notes status: Complete/i })).toBeDefined()
  })

  it('keeps confidence operations independent from status and recovers on confidence failure', async () => {
    const mockUpdateConfidence = vi.mocked(updateChapterConfidence)
    mockUpdateConfidence.mockRejectedValueOnce(new Error('Confidence save rejected'))

    render(
      <ChapterRow
        chapter={mockChapter}
        userChapter={mockUserChapter({
          notes_status: 'complete',
          confidence_level: 2,
        })}
        avgScore={null}
        subjectColor="#1E40AF"
        isAccessible={true}
      />
    )

    // Status is complete
    expect(screen.getByRole('button', { name: /Notes status: Complete/i })).toBeDefined()

    // Click star 5
    const star5 = screen.getByRole('button', { name: /Rate confidence 5 of 5/i })
    await act(async () => {
      fireEvent.click(star5)
    })

    // Error alert appears for confidence
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Confidence save rejected')
    })

    // Status remains untouched ('complete')
    expect(screen.getByRole('button', { name: /Notes status: Complete/i })).toBeDefined()

    // Dismiss error
    const dismissBtn = screen.getByRole('button', { name: /Dismiss error/i })
    act(() => {
      fireEvent.click(dismissBtn)
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ensures locked controls remain non-interactive', () => {
    const mockUpdateStatus = vi.mocked(updateChapterStatus)
    const mockUpdateConfidence = vi.mocked(updateChapterConfidence)

    render(
      <ChapterRow
        chapter={mockChapter}
        userChapter={null}
        avgScore={null}
        subjectColor="#1E40AF"
        isAccessible={false}
      />
    )

    // No interactive status button or confidence star buttons should exist
    expect(screen.queryByRole('button', { name: /Notes status/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Rate confidence/i })).toBeNull()

    // Locked presentation elements should be visible
    expect(screen.getByTitle(/Locked: Unlock A2/i)).toBeDefined()
    expect(screen.getByText('Locked (A2 Stage)')).toBeDefined()

    expect(mockUpdateStatus).not.toHaveBeenCalled()
    expect(mockUpdateConfidence).not.toHaveBeenCalled()
  })

  describe('Regression through real ChapterGroups parent and stable identity', () => {
    it('survives prop refresh caused by first server action through real ChapterGroups parent for status', async () => {
      const def1 = createDeferred<{ success: boolean }>()
      const def2 = createDeferred<{ success: boolean }>()
      const mockUpdateStatus = vi.mocked(updateChapterStatus)
      mockUpdateStatus
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockReturnValueOnce(def1.promise as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockReturnValueOnce(def2.promise as any)

      const initialUserChapter = mockUserChapter({ notes_status: 'none' })
      const group: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: initialUserChapter,
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      const { rerender } = render(
        <ChapterGroups
          hasElectiveComponents={false}
          groups={[group]}
          subjectColor="#1E40AF"
        />
      )

      const statusBtn = screen.getByRole('button', { name: /Notes status: Not started/i })

      // 1. First choice (none -> in_progress)
      await act(async () => {
        fireEvent.click(statusBtn)
      })
      expect(mockUpdateStatus).toHaveBeenCalledTimes(1)
      expect(mockUpdateStatus).toHaveBeenLastCalledWith(mockChapter.id, 'in_progress')

      // 2. Second rapid choice while first is still in flight (in_progress -> complete)
      await act(async () => {
        fireEvent.click(statusBtn)
      })
      // Optimistically displays complete
      expect(screen.getByRole('button', { name: /Notes status: Complete/i })).toBeDefined()
      // Still only 1 call dispatched so far
      expect(mockUpdateStatus).toHaveBeenCalledTimes(1)

      // 3. First action resolves
      await act(async () => {
        def1.resolve({ success: true })
      })

      // 4. Refreshed props arrive from server revalidation of action 1
      const refreshedUserChapter = mockUserChapter({ notes_status: 'in_progress' })
      const refreshedGroup: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: refreshedUserChapter,
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      await act(async () => {
        rerender(
          <ChapterGroups
            hasElectiveComponents={false}
            groups={[refreshedGroup]}
            subjectColor="#1E40AF"
          />
        )
      })

      // 5. Because ChapterRow identity is stable, second queued choice is dispatched!
      await waitFor(() => {
        expect(mockUpdateStatus).toHaveBeenCalledTimes(2)
      })
      expect(mockUpdateStatus).toHaveBeenLastCalledWith(mockChapter.id, 'complete')

      // Optimistic UI still shows Complete
      expect(screen.getByRole('button', { name: /Notes status: Complete/i })).toBeDefined()

      // 6. Second action resolves
      await act(async () => {
        def2.resolve({ success: true })
      })

      // 7. Final refreshed props arrive from action 2 revalidation
      const finalUserChapter = mockUserChapter({ notes_status: 'complete' })
      const finalGroup: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: finalUserChapter,
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      await act(async () => {
        rerender(
          <ChapterGroups
            hasElectiveComponents={false}
            groups={[finalGroup]}
            subjectColor="#1E40AF"
          />
        )
      })

      // Final confirmed state is Complete
      expect(screen.getByRole('button', { name: /Notes status: Complete/i })).toBeDefined()
    })

    it('survives prop refresh caused by first server action through real ChapterGroups parent for confidence', async () => {
      const def1 = createDeferred<{ success: boolean }>()
      const def2 = createDeferred<{ success: boolean }>()
      const mockUpdateConfidence = vi.mocked(updateChapterConfidence)
      mockUpdateConfidence
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockReturnValueOnce(def1.promise as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockReturnValueOnce(def2.promise as any)

      const initialUserChapter = mockUserChapter({ confidence_level: null })
      const group: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: initialUserChapter,
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      const { rerender } = render(
        <ChapterGroups
          hasElectiveComponents={false}
          groups={[group]}
          subjectColor="#1E40AF"
        />
      )

      const star3 = screen.getByRole('button', { name: /Rate confidence 3 of 5/i })
      const star5 = screen.getByRole('button', { name: /Rate confidence 5 of 5/i })

      // 1. First choice (star 3)
      await act(async () => {
        fireEvent.click(star3)
      })
      expect(mockUpdateConfidence).toHaveBeenCalledTimes(1)
      expect(mockUpdateConfidence).toHaveBeenLastCalledWith(mockChapter.id, 3)

      // 2. Second rapid choice (star 5)
      await act(async () => {
        fireEvent.click(star5)
      })
      // Still only 1 call dispatched
      expect(mockUpdateConfidence).toHaveBeenCalledTimes(1)

      // 3. First action resolves
      await act(async () => {
        def1.resolve({ success: true })
      })

      // 4. Refreshed props arrive for confidence 3
      const refreshedUserChapter = mockUserChapter({ confidence_level: 3 })
      const refreshedGroup: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: refreshedUserChapter,
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      await act(async () => {
        rerender(
          <ChapterGroups
            hasElectiveComponents={false}
            groups={[refreshedGroup]}
            subjectColor="#1E40AF"
          />
        )
      })

      // 5. Second choice is dispatched with 5
      await waitFor(() => {
        expect(mockUpdateConfidence).toHaveBeenCalledTimes(2)
      })
      expect(mockUpdateConfidence).toHaveBeenLastCalledWith(mockChapter.id, 5)

      // 6. Second action resolves
      await act(async () => {
        def2.resolve({ success: true })
      })

      // 7. Final refreshed props arrive
      const finalUserChapter = mockUserChapter({ confidence_level: 5 })
      const finalGroup: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: finalUserChapter,
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      await act(async () => {
        rerender(
          <ChapterGroups
            hasElectiveComponents={false}
            groups={[finalGroup]}
            subjectColor="#1E40AF"
          />
        )
      })

      // Final confirmed state is confidence 5
      expect(screen.getByTitle(/Confidence: 5\/5/i)).toBeDefined()
    })

    it('keeps status and confidence operations independent through real ChapterGroups parent', async () => {
      const statusDef = createDeferred<{ success: boolean }>()
      const confDef = createDeferred<{ success: boolean }>()
      const mockUpdateStatus = vi.mocked(updateChapterStatus)
      const mockUpdateConfidence = vi.mocked(updateChapterConfidence)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockUpdateStatus.mockReturnValueOnce(statusDef.promise as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockUpdateConfidence.mockReturnValueOnce(confDef.promise as any)

      const initialUserChapter = mockUserChapter({ notes_status: 'none', confidence_level: null })
      const group: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: initialUserChapter,
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      const { rerender } = render(
        <ChapterGroups
          hasElectiveComponents={false}
          groups={[group]}
          subjectColor="#1E40AF"
        />
      )

      const statusBtn = screen.getByRole('button', { name: /Notes status: Not started/i })
      const star4 = screen.getByRole('button', { name: /Rate confidence 4 of 5/i })

      // Trigger status update
      await act(async () => {
        fireEvent.click(statusBtn)
      })
      expect(mockUpdateStatus).toHaveBeenCalledTimes(1)
      expect(mockUpdateStatus).toHaveBeenLastCalledWith(mockChapter.id, 'in_progress')

      // While status is in flight, trigger confidence update
      await act(async () => {
        fireEvent.click(star4)
      })
      expect(mockUpdateConfidence).toHaveBeenCalledTimes(1)
      expect(mockUpdateConfidence).toHaveBeenLastCalledWith(mockChapter.id, 4)

      // Status resolves and revalidates props
      await act(async () => {
        statusDef.resolve({ success: true })
      })

      const intermediateGroup: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: mockUserChapter({ notes_status: 'in_progress', confidence_level: null }),
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      await act(async () => {
        rerender(
          <ChapterGroups
            hasElectiveComponents={false}
            groups={[intermediateGroup]}
            subjectColor="#1E40AF"
          />
        )
      })

      // Confidence is still in-flight/optimistic 4 and was not clobbered by status revalidation
      expect(screen.getByTitle(/Confidence: 4\/5/i)).toBeDefined()
      expect(screen.getByRole('button', { name: /Notes status: In progress/i })).toBeDefined()

      // Confidence resolves
      await act(async () => {
        confDef.resolve({ success: true })
      })

      const finalGroup: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: mockUserChapter({ notes_status: 'in_progress', confidence_level: 4 }),
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      await act(async () => {
        rerender(
          <ChapterGroups
            hasElectiveComponents={false}
            groups={[finalGroup]}
            subjectColor="#1E40AF"
          />
        )
      })

      expect(screen.getByTitle(/Confidence: 4\/5/i)).toBeDefined()
      expect(screen.getByRole('button', { name: /Notes status: In progress/i })).toBeDefined()
    })

    it('rolls back status to first successful value and ignores late stale prop when second mutation fails', async () => {
      const def1 = createDeferred<{ success: boolean }>()
      const def2 = createDeferred<{ error: string }>()
      const mockUpdateStatus = vi.mocked(updateChapterStatus)
      mockUpdateStatus
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockReturnValueOnce(def1.promise as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockReturnValueOnce(def2.promise as any)

      const initialUserChapter = mockUserChapter({ notes_status: 'none' })
      const group: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: initialUserChapter,
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      const { rerender } = render(
        <ChapterGroups
          hasElectiveComponents={false}
          groups={[group]}
          subjectColor="#1E40AF"
        />
      )

      const statusBtn = screen.getByRole('button', { name: /Notes status: Not started/i })

      // 1. Start mutation 1 for in_progress
      await act(async () => {
        fireEvent.click(statusBtn)
      })
      expect(mockUpdateStatus).toHaveBeenCalledTimes(1)
      expect(mockUpdateStatus).toHaveBeenLastCalledWith(mockChapter.id, 'in_progress')

      // 2. Queue mutation 2 for complete
      await act(async () => {
        fireEvent.click(statusBtn)
      })
      expect(screen.getByRole('button', { name: /Notes status: Complete/i })).toBeDefined()

      // 3. Resolve mutation 1 and wait until mutation 2 is dispatched
      await act(async () => {
        def1.resolve({ success: true })
      })

      await waitFor(() => {
        expect(mockUpdateStatus).toHaveBeenCalledTimes(2)
      })
      expect(mockUpdateStatus).toHaveBeenLastCalledWith(mockChapter.id, 'complete')

      // 4. While mutation 2 remains active, rerender ChapterGroups with notes_status: 'in_progress'
      // (representing mutation 1's successful refresh; changes effect dependency from 'none' to 'in_progress')
      const refreshedUserChapter = mockUserChapter({ notes_status: 'in_progress' })
      const refreshedGroup: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: refreshedUserChapter,
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      await act(async () => {
        rerender(
          <ChapterGroups
            hasElectiveComponents={false}
            groups={[refreshedGroup]}
            subjectColor="#1E40AF"
          />
        )
      })

      // 5. Rerender again with stale notes_status: 'none'
      // (changes effect dependency from 'in_progress' to 'none')
      const staleUserChapter = mockUserChapter({ notes_status: 'none' })
      const staleGroup: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: staleUserChapter,
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      await act(async () => {
        rerender(
          <ChapterGroups
            hasElectiveComponents={false}
            groups={[staleGroup]}
            subjectColor="#1E40AF"
          />
        )
      })

      // 6. Fail mutation 2
      await act(async () => {
        def2.resolve({ error: 'Database transaction aborted' })
      })

      // 7. Assert the UI rolls back to in_progress, not none, and displays the failure alert
      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toContain('Database transaction aborted')
      })
      expect(screen.getByRole('button', { name: /Notes status: In progress/i })).toBeDefined()
    })

    it('rolls back confidence to first successful value and ignores late stale prop when second mutation rejects', async () => {
      const def1 = createDeferred<{ success: boolean }>()
      const def2 = createDeferred<{ success: boolean }>()
      const mockUpdateConfidence = vi.mocked(updateChapterConfidence)
      mockUpdateConfidence
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockReturnValueOnce(def1.promise as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockReturnValueOnce(def2.promise as any)

      const initialUserChapter = mockUserChapter({ confidence_level: null })
      const group: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: initialUserChapter,
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      const { rerender } = render(
        <ChapterGroups
          hasElectiveComponents={false}
          groups={[group]}
          subjectColor="#1E40AF"
        />
      )

      const star2 = screen.getByRole('button', { name: /Rate confidence 2 of 5/i })
      const star5 = screen.getByRole('button', { name: /Rate confidence 5 of 5/i })

      // 1. Start confidence mutation 1 for 2
      await act(async () => {
        fireEvent.click(star2)
      })
      expect(mockUpdateConfidence).toHaveBeenCalledTimes(1)
      expect(mockUpdateConfidence).toHaveBeenLastCalledWith(mockChapter.id, 2)

      // 2. Queue mutation 2 for 5
      await act(async () => {
        fireEvent.click(star5)
      })

      // 3. Resolve mutation 1 and wait until mutation 2 is dispatched
      await act(async () => {
        def1.resolve({ success: true })
      })

      await waitFor(() => {
        expect(mockUpdateConfidence).toHaveBeenCalledTimes(2)
      })
      expect(mockUpdateConfidence).toHaveBeenLastCalledWith(mockChapter.id, 5)

      // 4. While mutation 2 remains active, rerender with confidence_level: 2
      // (representing mutation 1's successful refresh; changes effect dependency from null to 2)
      const refreshedUserChapter = mockUserChapter({ confidence_level: 2 })
      const refreshedGroup: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: refreshedUserChapter,
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      await act(async () => {
        rerender(
          <ChapterGroups
            hasElectiveComponents={false}
            groups={[refreshedGroup]}
            subjectColor="#1E40AF"
          />
        )
      })

      // 5. Rerender again with stale confidence_level: null
      // (changes effect dependency from 2 to null)
      const staleUserChapter = mockUserChapter({ confidence_level: null })
      const staleGroup: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          {
            chapter: mockChapter,
            userChapter: staleUserChapter,
            avgScore: null,
            isAccessible: true,
          },
        ],
      }

      await act(async () => {
        rerender(
          <ChapterGroups
            hasElectiveComponents={false}
            groups={[staleGroup]}
            subjectColor="#1E40AF"
          />
        )
      })

      // 6. Reject mutation 2
      await act(async () => {
        def2.reject(new Error('Network disconnected'))
      })

      // 7. Assert the UI rolls back to confidence 2, not null, and displays the failure alert
      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toContain('Network disconnected')
      })
      expect(screen.getByTitle(/Confidence: 2\/5/i)).toBeDefined()
    })

    it('calculates component completed/total badge using accessible chapters only, excluding historical completed inaccessible chapters', () => {
      const ch1: Chapter = { ...mockChapter, id: 'ch-acc-1', number: 1, title: 'AS Acc 1' }
      const ch2: Chapter = { ...mockChapter, id: 'ch-acc-2', number: 2, title: 'AS Acc 2' }
      const ch3: Chapter = { ...mockChapter, id: 'ch-acc-3', number: 3, title: 'AS Acc 3' }
      const ch4: Chapter = { ...mockChapter, id: 'ch-inacc-4', number: 4, title: 'A2 Locked 4', stage: 'a2' }
      const ch5: Chapter = { ...mockChapter, id: 'ch-inacc-5', number: 5, title: 'RD Locked 5', stage: 'route_dependent' }

      const groupWithInaccessible: ComponentGroup = {
        name: 'Pure Mathematics 1',
        subjectPaperIds: ['sp-1'],
        chapters: [
          // Accessible: 3 total, 1 completed
          { chapter: ch1, userChapter: mockUserChapter({ notes_status: 'complete' }), avgScore: null, isAccessible: true },
          { chapter: ch2, userChapter: mockUserChapter({ notes_status: 'in_progress' }), avgScore: null, isAccessible: true },
          { chapter: ch3, userChapter: mockUserChapter({ notes_status: 'none' }), avgScore: null, isAccessible: undefined as unknown as boolean },
          // Inaccessible: both completed historically, but must affect NEITHER side of badge
          { chapter: ch4, userChapter: mockUserChapter({ notes_status: 'complete' }), avgScore: null, isAccessible: false },
          { chapter: ch5, userChapter: mockUserChapter({ notes_status: 'complete' }), avgScore: null, isAccessible: false },
        ],
      }

      render(
        <ChapterGroups
          hasElectiveComponents={false}
          groups={[groupWithInaccessible]}
          subjectColor="#1E40AF"
        />
      )

      // Exactly 1 completed out of 3 accessible chapters
      expect(screen.getByText('1/3')).toBeDefined()
      // Inaccessible chapters (4 and 5) must not inflate completed count (not 3/3 or 3/5)
      // or total count (not 1/5)
      expect(screen.queryByText('3/5')).toBeNull()
      expect(screen.queryByText('3/3')).toBeNull()
      expect(screen.queryByText('1/5')).toBeNull()
    })
  })
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
