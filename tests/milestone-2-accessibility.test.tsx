import React, { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import PaperSelectionPanel from '@/components/subjects/paper-selection-panel'
import { Dialog } from '@/components/ui/dialog'
import TargetGradePicker from '@/components/subjects/target-grade-picker'
import ChapterRow from '@/components/subjects/chapter-row'
import { updateTargetGrade } from '@/lib/actions/subjects'
import { updateChapterConfidence } from '@/lib/actions/chapters'
import type { Chapter, UserChapter } from '@/types'

vi.mock('@/lib/actions/subjects', () => ({
  updateTargetGrade: vi.fn(),
}))

vi.mock('@/lib/actions/chapters', () => ({
  updateChapterStatus: vi.fn(),
  updateChapterConfidence: vi.fn(),
}))

const mockChapter: Chapter = {
  id: 'ch-accessibility-1',
  subject_id: 'subj-1',
  title: 'Integration Techniques',
  number: 5,
  component: 'Pure Mathematics 1',
  description: null,
  is_global: true,
  is_active: true,
  stage: 'as',
  created_at: '2026-01-01',
}

function mockUserChapter(confidenceLevel: number | null = null): UserChapter {
  return {
    id: 'uc-1',
    user_id: 'user-1',
    chapter_id: 'ch-accessibility-1',
    notes_status: 'none',
    confidence_level: confidenceLevel,
    google_doc_url: null,
    google_doc_id: null,
    last_reviewed_at: null,
    first_completed_at: null,
    revision_count: 0,
    personal_notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('Milestone 2 Accessibility Defect Regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  describe('Defect 1: Native keyboard-accessible paper-combination controls', () => {
    it('renders elective combinations as native radios under an accessible group', async () => {
      const onChange = vi.fn()
      render(
        <PaperSelectionPanel
          subjectCode="9709"
          route="as_only"
          onChange={onChange}
        />
      )

      // 1. Accessible group name (fieldset + legend)
      const group = screen.getByRole('group', { name: /paper combination \(mathematics 9709\)/i })
      expect(group).toBeDefined()

      // 2. Discoverable radios under the group
      const radios = within(group).getAllByRole('radio') as HTMLInputElement[]
      expect(radios).toHaveLength(3)

      // 3. All radios share the same unique group name
      const groupName = radios[0].name
      expect(groupName).toBeTruthy()
      expect(groupName).toContain('paper-combination-9709')
      radios.forEach((r) => {
        expect(r.name).toBe(groupName)
      })

      // 4. Initially none checked
      radios.forEach((r) => {
        expect(r.checked).toBe(false)
      })

      // 5. Select Pure 1 + Mechanics via click/keyboard change
      const p1m1Radio = screen.getByRole('radio', { name: /pure 1 \+ mechanics/i }) as HTMLInputElement
      await act(async () => {
        fireEvent.click(p1m1Radio)
      })

      expect(p1m1Radio.checked).toBe(true)
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith([
        { component_name: 'Pure 1', paper_number: 1, stage: 'as' },
        { component_name: 'Mechanics', paper_number: 4, stage: 'as' },
      ])

      // 6. Exactly only the selected choice is checked
      const checkedRadios = radios.filter((r) => r.checked)
      expect(checkedRadios).toHaveLength(1)
      expect(checkedRadios[0]).toBe(p1m1Radio)

      // 7. Select another choice (Pure 1 + Statistics 1)
      const p1s1Radio = screen.getByRole('radio', { name: /pure 1 \+ statistics 1/i }) as HTMLInputElement
      await act(async () => {
        fireEvent.click(p1s1Radio)
      })

      expect(p1s1Radio.checked).toBe(true)
      expect(p1m1Radio.checked).toBe(false)
      expect(radios.filter((r) => r.checked)).toHaveLength(1)
      expect(onChange).toHaveBeenCalledTimes(2)
    })

    it('does not render elective radio inputs for fixed subjects', () => {
      const onChange = vi.fn()
      render(
        <PaperSelectionPanel
          subjectCode="9702"
          route="staged"
          onChange={onChange}
        />
      )

      expect(screen.queryByRole('radiogroup')).toBeNull()
      expect(screen.queryAllByRole('radio')).toHaveLength(0)
      expect(screen.getByText(/canonical exam papers/i)).toBeDefined()
    })
  })

  describe('Defect 2: Keep focus inside dialogs after step changes', () => {
    function MultiStepDialogTestComponent() {
      const [step, setStep] = useState(1)

      return (
        <div>
          {/* Background navigation */}
          <nav aria-label="Background navigation">
            <button id="bg-nav-dashboard" type="button">Dashboard</button>
            <button id="bg-nav-settings" type="button">Settings</button>
          </nav>

          <Dialog isOpen={true} onClose={() => {}} ariaLabel="Multi-step test dialog">
            <div>
              {step === 1 && (
                <div>
                  <button id="dialog-step1-cancel" type="button">Cancel</button>
                  <button
                    id="dialog-step1-next"
                    type="button"
                    onClick={() => setStep(2)}
                  >
                    Next Step
                  </button>
                </div>
              )}
              {step === 2 && (
                <div>
                  <button id="dialog-step2-back" type="button">Back</button>
                  <button id="dialog-step2-finish" type="button">Finish</button>
                </div>
              )}
            </div>
          </Dialog>
        </div>
      )
    }

    it('recovers focus when focused element is removed on step change and keeps focus in dialog', async () => {
      render(<MultiStepDialogTestComponent />)

      const bgNavDashboard = document.getElementById('bg-nav-dashboard') as HTMLButtonElement
      const step1NextBtn = document.getElementById('dialog-step1-next') as HTMLButtonElement

      // 1. Focus the Next Step button in Dialog
      step1NextBtn.focus()
      expect(document.activeElement).toBe(step1NextBtn)

      // 2. Click Next Step to advance to step 2, removing step1NextBtn from DOM
      await act(async () => {
        fireEvent.click(step1NextBtn)
      })

      // 3. Confirm focus fell to BODY (outside dialog remaining controls)
      expect(document.activeElement).toBe(document.body)

      // 4. Press Tab while focus is on BODY: redirect to the first available dialog control
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Tab' })
      })

      const step2BackBtn = document.getElementById('dialog-step2-back') as HTMLButtonElement
      const step2FinishBtn = document.getElementById('dialog-step2-finish') as HTMLButtonElement

      expect(document.activeElement).toBe(step2BackBtn)
      expect(document.activeElement).not.toBe(bgNavDashboard)

      // 5. Test Shift+Tab recovery from BODY: redirect to last available dialog control
      step2BackBtn.blur()
      expect(document.activeElement).toBe(document.body)

      await act(async () => {
        fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
      })
      expect(document.activeElement).toBe(step2FinishBtn)
      expect(document.activeElement).not.toBe(bgNavDashboard)

      // 6. Test ordinary first/last wrapping
      // Tab on last element wraps to first
      step2FinishBtn.focus()
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Tab' })
      })
      expect(document.activeElement).toBe(step2BackBtn)

      // Shift+Tab on first element wraps to last
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
      })
      expect(document.activeElement).toBe(step2FinishBtn)
    })
  })

  describe('Defect 3: Target-grade menu responsive constraints & visibility', () => {
    it('renders all six grades with 44px touch targets and responsive flex-wrap container', async () => {
      render(
        <div style={{ maxWidth: 320, overflow: 'hidden' }}>
          <TargetGradePicker
            subjectId="subj-1"
            currentGrade="B"
            color="#3b82f6"
          />
        </div>
      )

      const trigger = screen.getByRole('button', { name: /target grade: b/i })
      expect(trigger).toBeDefined()
      expect(trigger.getAttribute('aria-expanded')).toBe('false')

      // Open the picker
      await act(async () => {
        fireEvent.click(trigger)
      })

      expect(trigger.getAttribute('aria-expanded')).toBe('true')

      // All 6 grade buttons exist
      const gradeButtons = screen.getAllByRole('button', { name: /select grade/i })
      expect(gradeButtons).toHaveLength(6)

      const gradeNames = ['A*', 'A', 'B', 'C', 'D', 'E']
      gradeButtons.forEach((btn, idx) => {
        expect(btn.textContent).toBe(gradeNames[idx])
        expect(btn.classList.contains('touch-target-btn')).toBe(true)
        expect(btn.style.width).toBe('44px')
        expect(btn.style.height).toBe('44px')
        expect(btn.style.minWidth).toBe('44px')
        expect(btn.style.minHeight).toBe('44px')
      })

      // Currently selected grade has aria-pressed="true", others have "false"
      const gradeB = screen.getByRole('button', { name: 'Select grade B' })
      expect(gradeB.getAttribute('aria-pressed')).toBe('true')

      const gradeA = screen.getByRole('button', { name: 'Select grade A' })
      expect(gradeA.getAttribute('aria-pressed')).toBe('false')

      const gradeAStar = screen.getByRole('button', { name: 'Select grade A*' })
      expect(gradeAStar.getAttribute('aria-pressed')).toBe('false')

      // Selecting grade A updates state and invokes server action
      await act(async () => {
        fireEvent.click(gradeA)
      })

      expect(updateTargetGrade).toHaveBeenCalledWith('subj-1', 'A')
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })

    it('applies 308px maximum width for wide single-row placement preventing grade button wrap', async () => {
      const originalInnerWidth = window.innerWidth
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })

      render(
        <div style={{ width: 1024 }}>
          <TargetGradePicker
            subjectId="subj-1"
            currentGrade="A"
            color="#3b82f6"
          />
        </div>
      )

      const trigger = screen.getByRole('button', { name: /target grade: a\./i })
      await act(async () => {
        fireEvent.click(trigger)
      })

      const gradeButtons = screen.getAllByRole('button', { name: /select grade/i })
      const menu = gradeButtons[0].parentElement as HTMLDivElement
      expect(menu).not.toBeNull()
      // Full row maximum width must be 308px (264px buttons + 30px gaps + 12px padding + 2px borders)
      expect(menu.style.maxWidth).toBe('308px')
      expect(menu.style.maxWidth).not.toBe('306px')

      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalInnerWidth })
    })

    it('applies wrapped layout constraints when horizontal space is restricted', async () => {
      const originalInnerWidth = window.innerWidth
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 320 })

      render(
        <div style={{ width: 320, overflow: 'hidden' }}>
          <TargetGradePicker
            subjectId="subj-1"
            currentGrade="A"
            color="#3b82f6"
          />
        </div>
      )

      const trigger = screen.getByRole('button', { name: /target grade: a\./i })
      const triggerContainer = trigger.parentElement as HTMLElement
      vi.spyOn(triggerContainer, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        bottom: 144,
        left: 150,
        right: 250,
        width: 100,
        height: 44,
        x: 150,
        y: 100,
        toJSON: () => {},
      })

      await act(async () => {
        fireEvent.click(trigger)
      })

      const gradeButtons = screen.getAllByRole('button', { name: /select grade/i })
      const menu = gradeButtons[0].parentElement as HTMLDivElement
      expect(menu).not.toBeNull()
      // On constrained space (spaceToRight = 312 - 150 = 162 >= 158), maxWidth is clamped to wrapped max (160px)
      expect(menu.style.maxWidth).toBe('160px')

      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalInnerWidth })
    })
  })

  describe('Defect 4: Expose selected confidence rating', () => {
    it('exposes confidence rating group and reflects initial, changed, and cleared states', async () => {
      const { rerender } = render(
        <ChapterRow
          chapter={mockChapter}
          userChapter={mockUserChapter(3)}
          avgScore={null}
          subjectColor="#3b82f6"
          isAccessible={true}
        />
      )

      // 1. Group container has accessible name "Confidence rating"
      const group = screen.getByRole('group', { name: 'Confidence rating' })
      expect(group).toBeDefined()

      // 2. Exactly star 3 has aria-pressed="true", stars 1, 2, 4, 5 have false
      const star1 = screen.getByRole('button', { name: /rate confidence 1 of 5/i })
      const star2 = screen.getByRole('button', { name: /rate confidence 2 of 5/i })
      const star3 = screen.getByRole('button', { name: /rate confidence 3 of 5/i })
      const star4 = screen.getByRole('button', { name: /rate confidence 4 of 5/i })
      const star5 = screen.getByRole('button', { name: /rate confidence 5 of 5/i })

      expect(star1.getAttribute('aria-pressed')).toBe('false')
      expect(star2.getAttribute('aria-pressed')).toBe('false')
      expect(star3.getAttribute('aria-pressed')).toBe('true')
      expect(star4.getAttribute('aria-pressed')).toBe('false')
      expect(star5.getAttribute('aria-pressed')).toBe('false')

      // 3. Hovering star 5 does NOT change aria-pressed
      fireEvent.mouseEnter(star5)
      expect(star3.getAttribute('aria-pressed')).toBe('true')
      expect(star5.getAttribute('aria-pressed')).toBe('false')
      fireEvent.mouseLeave(star5)

      // 4. Click star 5 to update rating to 5
      await act(async () => {
        fireEvent.click(star5)
      })

      expect(star5.getAttribute('aria-pressed')).toBe('true')
      expect(star3.getAttribute('aria-pressed')).toBe('false')
      expect(updateChapterConfidence).toHaveBeenCalledWith('ch-accessibility-1', 5)

      // 5. Click star 5 again to clear rating
      await act(async () => {
        fireEvent.click(star5)
      })

      expect(star1.getAttribute('aria-pressed')).toBe('false')
      expect(star2.getAttribute('aria-pressed')).toBe('false')
      expect(star3.getAttribute('aria-pressed')).toBe('false')
      expect(star4.getAttribute('aria-pressed')).toBe('false')
      expect(star5.getAttribute('aria-pressed')).toBe('false')
      expect(updateChapterConfidence).toHaveBeenCalledWith('ch-accessibility-1', null)

      // 6. Rerender as locked chapter (isAccessible = false)
      rerender(
        <ChapterRow
          chapter={mockChapter}
          userChapter={mockUserChapter(3)}
          avgScore={null}
          subjectColor="#3b82f6"
          isAccessible={false}
        />
      )

      expect(screen.queryByRole('group', { name: 'Confidence rating' })).toBeNull()
      expect(screen.queryAllByRole('button', { name: /rate confidence/i })).toHaveLength(0)
    })
  })
})
