import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LogQuestionsModal } from '@/components/papers/log-questions-modal'
import { PracticeTrend, PracticeWorkspace } from '@/components/papers/practice-workspace'
import { blankPracticeDraft, draftFromPracticeSession, toPracticeWriteInput, trendPointsForMode } from '@/lib/practice-ui'
import { PracticeCreateSchema, PracticeUpdateSchema } from '@/lib/validations/practice-sessions'
import type { AttemptTrendPoint, PracticeFormSubjectOption, PracticeSessionRead } from '@/types/practice-sessions'

const uid = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`
const subjectId = uid(1)
const paperId = uid(2)
const chapterId = uid(3)
const { mockCreate, mockUpdate, mockDelete, mockRefresh } = vi.hoisted(() => ({
  mockCreate: vi.fn(), mockUpdate: vi.fn(), mockDelete: vi.fn(), mockRefresh: vi.fn(),
}))
vi.mock('@/lib/actions/practice-sessions', () => ({ createPracticeSession: mockCreate, updatePracticeSession: mockUpdate, deletePracticeSession: mockDelete }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const subjects: PracticeFormSubjectOption[] = [{
  id: subjectId, name: 'Mathematics', code: '9709', context: {
    enrollment: { id: uid(4), subjectId, subjectCode: '9709', studyRoute: 'staged', currentStage: 'as', isArchived: false },
    selections: [{ subjectPaperId: paperId, componentName: 'Pure 1', stage: 'as' }],
    chapters: [{ id: chapterId, subjectId, title: 'Algebra', stage: 'as', component: 'Pure 1', isActive: true, paperIds: [paperId] }],
    papers: [{ id: paperId, subjectId, paperNumber: 1, name: 'Pure Mathematics 1' }],
  },
}]
const points: AttemptTrendPoint[] = [
  { id: uid(10), source: 'full_paper', subjectId, stage: 'as', attemptDate: '2026-10-13', createdAt: '2026-10-13T10:00:00Z', subjectPaperId: paperId, paperNumber: 12, raw: 40, max: 50, accuracyPct: 80, eligibleRaw: 40, eligibleMax: 50, eligibleForCurrentRoute: true, itemCount: 0 },
  { id: uid(11), source: 'practice', subjectId, stage: 'as', attemptDate: '2026-10-13', createdAt: '2026-10-13T11:00:00Z', subjectPaperId: null, paperNumber: null, raw: 1, max: 10, accuracyPct: 10, eligibleRaw: 1, eligibleMax: 5, eligibleForCurrentRoute: true, itemCount: 2 },
]
const session: PracticeSessionRead = {
  id: uid(11), user_id: uid(20), subject_id: subjectId, stage: 'as', session_date: '2026-10-13', title: 'Mixed drill', duration_mins: 20,
  notes: null, total_score_raw: 1, total_score_max: 10, accuracy_pct: 10, subject_paper_id: null, paper_number: null,
  exam_year: null, exam_series: null, exam_variant: null, source_label: null, created_at: '2026-10-13T11:00:00Z', updated_at: '2026-10-13T11:00:00Z',
  items: [
    { id: uid(30), session_id: uid(11), item_order: 1, question_label: null, marks_obtained: 1, marks_available: 5, provenance_mode: 'none', subject_paper_id: null, paper_number: null, exam_year: null, exam_series: null, exam_variant: null, source_label: 'Worksheet', notes: null, created_at: '2026-10-13T11:00:00Z', chapter_ids: [chapterId], eligible_for_readiness: true, eligibility_reason: 'eligible' },
    { id: uid(31), session_id: uid(11), item_order: 2, question_label: '2(a)', marks_obtained: 0, marks_available: 5, provenance_mode: 'override', subject_paper_id: paperId, paper_number: 1, exam_year: 2025, exam_series: 'may_jun', exam_variant: 2, source_label: null, notes: null, created_at: '2026-10-13T11:00:00Z', chapter_ids: [], eligible_for_readiness: false, eligibility_reason: 'off_route_paper' },
  ],
  eligible_score_raw: 1, eligible_score_max: 5, eligible_for_readiness: true, route_status: 'current',
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('practice UI evidence', () => {
  it('switches all/full-paper/question modes, keeps same-day attempts, and displays mark-weighted volume', () => {
    expect(trendPointsForMode(points, 'all')).toHaveLength(2)
    render(<PracticeTrend points={points} />)
    expect(screen.getByRole('img', { name: /2 attempts in date order/ })).toBeTruthy()
    expect(screen.getByText(/41\/60 marks · 2 attempts/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Full papers' }))
    expect(screen.getByText(/40\/50 marks · 1 attempt/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Question practice' }))
    expect(screen.getByText(/1\/10 marks · 1 attempt · 2 question items/)).toBeTruthy()
    expect(screen.getAllByText(/1\/5 eligible marks/)).toHaveLength(2)
  })

  it('shows per-mode empty state and honest partial-session history labels', () => {
    const view = render(<PracticeTrend points={[]} />)
    expect(screen.getByRole('status').textContent).toMatch(/No practice attempts/)
    view.unmount()
    render(<PracticeWorkspace sessions={[session]} trend={points} subjects={subjects} preferredSubjectId={subjectId} timeZone="UTC" />)
    expect(screen.getByText(/Partial current-route evidence: 1\/5 eligible marks/)).toBeTruthy()
    expect(screen.getByText(/Separate from full-paper results and paper achievements/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Log Questions/ })).toBeTruthy()
  })
})

describe('question form provenance and accessibility', () => {
  it('maps topical, inherited, and override sources without field fallback or invented exam details', () => {
    const draft = blankPracticeDraft(subjectId, 'UTC')
    draft.sessionDate = '2026-10-13'
    draft.items[0].marksObtained = '0'; draft.items[0].marksAvailable = '5'; draft.items[0].provenance.sourceLabel = 'Topical worksheet'
    const topical = PracticeCreateSchema.parse(toPracticeWriteInput(draft))
    expect(topical.items[0]).toMatchObject({ provenanceMode: 'none', provenance: { sourceLabel: 'Topical worksheet' } })
    expect(topical.provenance).toEqual({})
    draft.provenance.subjectPaperId = paperId
    draft.items[0].provenanceMode = 'inherit'
    expect(PracticeCreateSchema.parse(toPracticeWriteInput(draft)).items[0]).not.toHaveProperty('provenance')
    draft.items[0].provenanceMode = 'override'
    draft.items[0].provenance = { subjectPaperId: '', examYear: '2025', examSeries: '', examVariant: '', sourceLabel: '' }
    expect(PracticeCreateSchema.parse(toPracticeWriteInput(draft)).items[0]).toMatchObject({ provenance: { examYear: 2025 } })
    expect(PracticeCreateSchema.safeParse(toPracticeWriteInput({ ...draft, items: [{ ...draft.items[0], marksObtained: '' }] })).success).toBe(false)
  })

  it('reconstructs full-replacement edit payload from recorded items', () => {
    const draft = draftFromPracticeSession(session)
    expect(draft.items).toHaveLength(2)
    const parsed = PracticeUpdateSchema.parse(toPracticeWriteInput(draft, session.id))
    expect(parsed.items.map(item => item.provenanceMode)).toEqual(['none', 'override'])
    expect(parsed.items[1]).toMatchObject({ questionLabel: '2(a)', provenance: { subjectPaperId: paperId, examYear: 2025, examVariant: 2 } })
  })

  it.each(['route change', 'route stage change'] as const)('allows removal but no re-selection of a historical mapping after a %s', async change => {
    const previousSubjects: PracticeFormSubjectOption[] = [{ ...subjects[0], context: {
      ...subjects[0].context,
      chapters: [{ ...subjects[0].context.chapters[0], stage: 'route_dependent' }],
    } }]
    const currentSubjects: PracticeFormSubjectOption[] = [{ ...previousSubjects[0], context: {
      ...previousSubjects[0].context,
      ...(change === 'route change' ? { selections: [] } : {
        enrollment: { ...previousSubjects[0].context.enrollment!, currentStage: 'a2' as const },
        selections: [{ subjectPaperId: paperId, componentName: 'Pure 1', stage: 'a2' as const }],
      }),
    } }]
    const recorded: PracticeSessionRead = { ...session, items: [session.items[0]] }
    const success = vi.fn()
    mockUpdate.mockResolvedValue({ sessionId: recorded.id })
    const props = { timeZone: 'UTC', existing: recorded, onClose: vi.fn(), onSuccess: success }
    const view = render(<LogQuestionsModal {...props} subjects={previousSubjects} />)
    fireEvent.click(screen.getByText(/Chapter mappings/))
    expect(screen.getByRole('checkbox', { name: 'Algebra' })).toHaveProperty('checked', true)

    view.rerender(<LogQuestionsModal {...props} subjects={currentSubjects} />)
    const staleMapping = screen.getByRole('checkbox', { name: 'Algebra · no longer eligible' }) as HTMLInputElement
    expect(staleMapping.checked).toBe(true)
    expect(staleMapping.disabled).toBe(false)
    staleMapping.focus()
    expect(document.activeElement).toBe(staleMapping)
    expect(screen.getByText(/Deselect chapters that are no longer eligible before saving/)).toBeTruthy()
    fireEvent.click(staleMapping)
    expect(staleMapping.checked).toBe(false)
    expect(staleMapping.disabled).toBe(true)
    // Native checkbox activation must not re-add an inaccessible mapping.
    staleMapping.click()
    expect(staleMapping.checked).toBe(false)
    expect(screen.getByText(/Chapter mappings.*0 selected/)).toBeTruthy()

    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    const payload = PracticeUpdateSchema.parse(mockUpdate.mock.calls[0][0])
    expect(payload.sessionId).toBe(recorded.id)
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0]).toMatchObject({ chapterIds: [], provenanceMode: 'none', provenance: { sourceLabel: 'Worksheet' } })
    await waitFor(() => expect(success).toHaveBeenCalledTimes(1))
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('provides labelled dialog, grouped-question controls, Escape close, and visible validation errors', async () => {
    const close = vi.fn()
    render(<LogQuestionsModal subjects={subjects} timeZone="UTC" onClose={close} onSuccess={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Log Questions' }).getAttribute('aria-modal')).toBe('true')
    expect(screen.getByLabelText('Marks obtained')).toBeTruthy()
    expect(screen.getByLabelText('Actual stage')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Add question/ }))
    expect(screen.getAllByLabelText('Marks obtained')).toHaveLength(2)
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(mockCreate).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(close).toHaveBeenCalled())
  })

  it('submits a valid source-only question through the atomic server action and acknowledges success', async () => {
    const success = vi.fn()
    mockCreate.mockResolvedValue({ sessionId: uid(50) })
    render(<LogQuestionsModal subjects={subjects} timeZone="UTC" onClose={vi.fn()} onSuccess={success} />)
    fireEvent.change(screen.getByLabelText('Marks obtained'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Marks available'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Source label (optional)'), { target: { value: 'Topical worksheet' } })
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      subjectId, stage: 'as', items: [expect.objectContaining({ marksObtained: 3, marksAvailable: 5, provenanceMode: 'none', provenance: { sourceLabel: 'Topical worksheet' } })],
    })))
    await waitFor(() => expect(success).toHaveBeenCalled())
  })

  it('requires explicit delete confirmation and leaves the dialog open on failure', async () => {
    mockDelete.mockResolvedValueOnce({ error: 'Could not save the practice session.' }).mockResolvedValueOnce({ deleted: true })
    render(<PracticeWorkspace sessions={[session]} trend={points} subjects={subjects} preferredSubjectId={subjectId} timeZone="UTC" />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(mockDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Delete question session?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete session' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not save the practice session.')
    expect(screen.getByRole('dialog', { name: 'Delete question session?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete session' }))
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(mockDelete).toHaveBeenCalledWith({ sessionId: session.id })
  })
})
