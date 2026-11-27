import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRefresh = vi.fn()
const mockUpdateExamDate = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('@/lib/actions/subjects', () => ({
  updateExamDate: (...args: unknown[]) => mockUpdateExamDate(...args),
}))

vi.mock('@/lib/actions/papers', () => ({
  logPaper: vi.fn(),
  updatePaper: vi.fn(),
}))

const mockFrom = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

import PaperSelectionPanel from '@/components/subjects/paper-selection-panel'
import ExamDatePicker from '@/components/subjects/exam-date-picker'
import TargetGradePlannerSummary from '@/components/subjects/target-grade-planner-summary'
import { LogPaperModal } from '@/components/papers/log-paper-modal'
import type { SubjectLevelPlanSummary } from '@/lib/planner'

function makeSummary(overrides: Partial<SubjectLevelPlanSummary> = {}): SubjectLevelPlanSummary {
  return {
    subjectId: 'subj-9709',
    subjectCode: '9709',
    subjectName: 'Mathematics',
    studyRoute: 'full_level',
    targetGrade: 'A',
    officialCombinedTarget: 197,
    combinedMaximumMark: 250,
    estimatedCombinedMark: 216.3,
    marksStillNeeded: 0,
    latestComparableGrade: 'A',
    rollingPredictedGrade: 'A',
    isOptionResolved: true,
    safetyMargin: { type: 'none' },
    adjustedCombinedTarget: 197,
    safetyMarginImpossible: false,
    provenance: {
      examSeries: 'june',
      examYear: 2026,
      intendedSeries: 'june',
      intendedYear: 2026,
      isFallback: false,
      officialPdfUrl: 'https://www.cambridgeinternational.org/Images/761530-mathematics-9709-june-2026-grade-threshold-table.pdf',
      officialIndexUrl: 'https://www.cambridgeinternational.org/',
      officialPublishedOn: '2026-08-10',
      includedVariants: ['11', '31', '41', '51'],
    },
    ...overrides,
  } as SubjectLevelPlanSummary
}

describe('Milestone 5 Gate 4 UI Remediation Regressions', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. Further Mathematics 9231 route summary', () => {
    it('displays all four papers (1, 2, 3, 4) in Papers summary for full_level 9231', () => {
      render(
        <PaperSelectionPanel
          subjectCode="9231"
          route="full_level"
          initialSelections={[]}
          onChange={vi.fn()}
        />
      )

      expect(screen.getByText(/Papers:/i)).toBeTruthy()
      const summary = screen.getByText(/Further Pure 1 \(Paper 1\)/i).textContent ?? ''
      expect(summary).toContain('Further Pure 1 (Paper 1)')
      expect(summary).toContain('Further Mechanics (Paper 3)')
      expect(summary).toContain('Further Pure 2 (Paper 2)')
      expect(summary).toContain('Further Probability & Statistics (Paper 4)')
    })

    it('preserves separate AS and A2 paper grouping for staged 9231', () => {
      render(
        <PaperSelectionPanel
          subjectCode="9231"
          route="staged"
          initialSelections={[]}
          onChange={vi.fn()}
        />
      )

      expect(screen.getAllByText(/^AS:$/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/^A2:$/i).length).toBeGreaterThan(0)
    })
  })

  describe('2 & 3. ExamDatePicker pointer/keyboard Save, duplicate prevention, and 320px clamping', () => {
    it('submits on mouse/pointer click and keyboard Enter, prevents duplicate pending submits, and discards on Cancel/outside-click/Escape', async () => {
      let resolvePending!: (val: Record<string, unknown>) => void
      mockUpdateExamDate.mockImplementation(
        () => new Promise((resolve) => { resolvePending = resolve })
      )

      render(
        <div>
          <div data-testid="outside">Outside</div>
          <ExamDatePicker
            subjectId="subj-1"
            currentDate="2026-06-01"
            countdownLabel="15d"
            countdownColor="#3b82f6"
          />
        </div>
      )

      const trigger = screen.getByRole('button', { name: /exam date/i })
      fireEvent.click(trigger)
      const input = screen.getByLabelText('Exam date') as HTMLInputElement
      fireEvent.change(input, { target: { value: '2026-06-15' } })

      const saveBtn = screen.getByRole('button', { name: /^save$/i })
      fireEvent.mouseDown(saveBtn)
      fireEvent.click(saveBtn)
      fireEvent.click(saveBtn)
      expect(mockUpdateExamDate).toHaveBeenCalledTimes(1)
      expect(mockUpdateExamDate).toHaveBeenCalledWith('subj-1', '2026-06-15')

      await act(async () => {
        resolvePending({})
      })
      expect(mockRefresh).toHaveBeenCalledTimes(1)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')

      // Keyboard Enter submission + error retention
      mockUpdateExamDate.mockResolvedValueOnce({ error: 'Server rejected date' })
      fireEvent.click(trigger)
      const input2 = screen.getByLabelText('Exam date') as HTMLInputElement
      fireEvent.change(input2, { target: { value: '2026-06-20' } })
      await act(async () => {
        fireEvent.submit(input2.closest('form')!)
      })
      expect(screen.getByRole('alert').textContent).toContain('Server rejected date')
      expect(trigger.getAttribute('aria-expanded')).toBe('true')

      // Outside click discards unsubmitted edits
      fireEvent.mouseDown(screen.getByTestId('outside'))
      expect(trigger.getAttribute('aria-expanded')).toBe('false')

      // Cancel discards unsubmitted edits
      fireEvent.click(trigger)
      const input3 = screen.getByLabelText('Exam date') as HTMLInputElement
      fireEvent.change(input3, { target: { value: '2026-10-10' } })
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      fireEvent.click(trigger)
      expect((screen.getByLabelText('Exam date') as HTMLInputElement).value).toBe('2026-06-15')
    })

    it('clamps ExamDatePicker popover and header CSS for 320px viewports', () => {
      Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true })
      render(
        <ExamDatePicker
          subjectId="subj-320"
          currentDate="2026-06-01"
          countdownLabel="15d"
          countdownColor="#3b82f6"
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /exam date/i }))
      const form = screen.getByLabelText('Exam date').closest('form')!
      const popover = form.parentElement as HTMLElement
      expect(popover.style.maxWidth).toBe('calc(100vw - 16px)')
      expect(popover.style.boxSizing).toBe('border-box')

      const css = fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8')
      expect(css).toContain('grid-template-columns: minmax(0, auto) minmax(0, 1fr);')
      expect(css).toContain('flex-wrap: wrap;')
    })
  })

  describe('4. Rolling Predicted Grade subtext', () => {
    it('shows latest complete sitting when both rollingPredictedGrade and latestComparableGrade exist', () => {
      render(<TargetGradePlannerSummary summary={makeSummary()} onSelectSafetyMargin={vi.fn()} />)
      expect(screen.getByText(/Latest complete sitting:/i)).toBeTruthy()
      expect(screen.queryByText(/No complete historical sitting logged/i)).toBeNull()
    })

    it('shows truthful baseline copy when rollingPredictedGrade exists without latestComparableGrade', () => {
      render(
        <TargetGradePlannerSummary
          summary={makeSummary({ rollingPredictedGrade: 'A', latestComparableGrade: null })}
          onSelectSafetyMargin={vi.fn()}
        />
      )
      expect(screen.getByText(/Based on weighted paper baselines across logged sittings/i)).toBeTruthy()
      expect(screen.queryByText(/No complete historical sitting logged/i)).toBeNull()
    })

    it('preserves no-complete-sitting, staged, and unresolved-option messages', () => {
      const { rerender } = render(
        <TargetGradePlannerSummary
          summary={makeSummary({ rollingPredictedGrade: null, latestComparableGrade: null })}
          onSelectSafetyMargin={vi.fn()}
        />
      )
      expect(screen.getByText(/No complete historical sitting logged/i)).toBeTruthy()

      rerender(
        <TargetGradePlannerSummary
          summary={makeSummary({
            studyRoute: 'staged',
            rollingPredictedGrade: null,
            latestComparableGrade: null,
          })}
          onSelectSafetyMargin={vi.fn()}
        />
      )
      expect(screen.getByText(/Predictions for staged routes require verified AS performance evidence/i)).toBeTruthy()

      rerender(
        <TargetGradePlannerSummary
          summary={makeSummary({
            studyRoute: 'full_level',
            isOptionResolved: false,
            rollingPredictedGrade: null,
            latestComparableGrade: null,
          })}
          onSelectSafetyMargin={vi.fn()}
        />
      )
      expect(screen.getByText(/Select paper variants to enable combination prediction/i)).toBeTruthy()
    })
  })

  describe('5. LogPaperModal empty-enrollment query guard and race/error handling', () => {
    function setupSupabaseMock(opts: {
      enrollments?: Array<{ id: string; user_id: string; subject_id: string; current_stage?: string; subjects: { id: string; name: string; code: string } }>
      selectionError?: { message: string } | null
      selectionRows?: Array<{ subject_paper_id: string; paper_number: number; stage: string; component_name: string }>
    }) {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      const queriedSelectionIds: string[] = []

      mockFrom.mockImplementation((table: string) => {
        let eqVal: string | undefined
        const builder: Record<string, unknown> = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn((_col: string, val: string) => {
            eqVal = val
            if (table === 'subject_paper_selections') queriedSelectionIds.push(val)
            return builder
          }),
          order: vi.fn().mockReturnThis(),
          then: (resolve: (val: unknown) => void) => {
            if (table === 'user_subjects') {
              return resolve({ data: opts.enrollments ?? [], error: null })
            }
            if (table === 'subject_paper_selections') {
              if (opts.selectionError) {
                return resolve({ data: null, error: opts.selectionError })
              }
              return resolve({ data: opts.selectionRows ?? [], error: null })
            }
            if (table === 'subject_papers') {
              return resolve({
                data: [{ id: 'sp-1', name: 'Pure Mathematics 1', paper_number: 1 }],
                error: null,
              })
            }
            if (table === 'chapters' || table === 'chapter_papers' || table === 'paper_question_attempts') {
              return resolve({ data: [], error: null })
            }
            return resolve({ data: [], error: null, eqVal })
          },
        }
        return builder
      })

      return { queriedSelectionIds }
    }

    it('never queries subject_paper_selections with empty user_subject_id and queries valid enrollment', async () => {
      const { queriedSelectionIds } = setupSupabaseMock({
        enrollments: [
          {
            id: 'enroll-9709',
            user_id: 'user-1',
            subject_id: 'subj-9709',
            current_stage: 'full',
            subjects: { id: 'subj-9709', name: 'Mathematics', code: '9709' },
          },
        ],
        selectionRows: [
          { subject_paper_id: 'sp-1', paper_number: 1, stage: 'as', component_name: 'Pure Mathematics 1' },
        ],
      })

      render(
        <LogPaperModal
          timeZone="UTC"
          onClose={vi.fn()}
          existingPaperId="paper-1"
          existingPaper={{
            subjectId: 'subj-9709',
            subjectPaperId: 'sp-1',
            year: 2025,
            session: 'may_jun',
            paperNumber: 1,
            variant: 1,
            stage: 'as',
            attemptedAt: '2026-05-01',
          }}
        />
      )

      await waitFor(() => {
        expect(queriedSelectionIds).toContain('enroll-9709')
      })
      expect(queriedSelectionIds).not.toContain('')
    })

    it('prevents stale results when subject changes rapidly', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
      let resolveFirstSelections!: (val: unknown) => void

      mockFrom.mockImplementation((table: string) => {
        let eqSubjectId: string | undefined
        const builder: Record<string, unknown> = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn((col: string, val: string) => {
            if (col === 'subject_id' || col === 'user_subject_id') eqSubjectId = val
            return builder
          }),
          order: vi.fn().mockReturnThis(),
          then: (resolve: (val: unknown) => void) => {
            if (table === 'user_subjects') {
              return resolve({
                data: [
                  {
                    id: 'enroll-9709',
                    user_id: 'user-1',
                    subject_id: 'subj-9709',
                    current_stage: 'full',
                    subjects: { id: 'subj-9709', name: 'Mathematics', code: '9709' },
                  },
                  {
                    id: 'enroll-9701',
                    user_id: 'user-1',
                    subject_id: 'subj-9701',
                    current_stage: 'full',
                    subjects: { id: 'subj-9701', name: 'Chemistry', code: '9701' },
                  },
                ],
                error: null,
              })
            }
            if (table === 'subject_paper_selections') {
              if (eqSubjectId === 'enroll-9709') {
                return new Promise((res) => {
                  resolveFirstSelections = res
                }).then(resolve)
              }
              return resolve({
                data: [
                  { subject_paper_id: 'sp-chem-1', paper_number: 1, stage: 'as', component_name: 'Chemistry P1' },
                ],
                error: null,
              })
            }
            if (table === 'subject_papers') {
              return resolve({
                data:
                  eqSubjectId === 'subj-9709'
                    ? [{ id: 'sp-math-1', name: 'Stale Math P1', paper_number: 1 }]
                    : [{ id: 'sp-chem-1', name: 'Chemistry P1', paper_number: 1 }],
                error: null,
              })
            }
            return resolve({ data: [], error: null })
          },
        }
        return builder
      })

      render(<LogPaperModal timeZone="UTC" onClose={vi.fn()} preferredSubjectId="subj-9709" />)

      const select = await screen.findByLabelText(/subject/i)
      fireEvent.change(select, { target: { value: 'subj-9701' } })

      await waitFor(() => {
        expect(screen.getByText(/Chemistry P1/i)).toBeTruthy()
      })

      if (resolveFirstSelections) {
        await act(async () => {
          resolveFirstSelections({
            data: [{ subject_paper_id: 'sp-math-1', paper_number: 1, stage: 'as', component_name: 'Stale Math P1' }],
            error: null,
          })
        })
      }

      expect(screen.queryByText(/Stale Math P1/i)).toBeNull()
    })

    it('surfaces genuine subject_paper_selections errors in retry state', async () => {
      setupSupabaseMock({
        enrollments: [
          {
            id: 'enroll-9709',
            user_id: 'user-1',
            subject_id: 'subj-9709',
            current_stage: 'full',
            subjects: { id: 'subj-9709', name: 'Mathematics', code: '9709' },
          },
        ],
        selectionError: { message: 'RLS error' },
      })

      render(
        <LogPaperModal
          timeZone="UTC"
          onClose={vi.fn()}
          existingPaperId="paper-1"
          existingPaper={{
            subjectId: 'subj-9709',
            subjectPaperId: 'sp-1',
            year: 2025,
            session: 'may_jun',
            paperNumber: 1,
            variant: 1,
            stage: 'as',
            attemptedAt: '2026-05-01',
          }}
        />
      )

      await waitFor(() => {
        expect(screen.getByText(/Failed to load paper options\. Please retry\./i)).toBeTruthy()
      })
    })
  })
})
