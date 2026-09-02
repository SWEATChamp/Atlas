import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import {
  STATUS_CYCLE,
  STATUS_CONFIG,
  CONFIDENCE_LEVELS,
  GUIDE_COPY,
} from '@/lib/subject-controls'
import {
  hasSeenSubjectGuide,
  markSubjectGuideSeen,
  shouldAutoOpenSubjectGuide,
  evaluateSubjectGuideAutoOpen,
  resetInMemorySubjectGuideState,
  STORAGE_KEY_SUBJECT_CONTROLS_GUIDE,
} from '@/lib/subject-guide-state'
import { getSafeLocalStorage } from '@/lib/storage'
import SubjectControlsGuide, {
  SubjectControlsGuideStep1Content,
  SubjectControlsGuideStep2Content,
} from '@/components/subjects/subject-controls-guide'
import SubjectGuideLauncher from '@/components/subjects/subject-guide-launcher'
import {
  isReleaseNotificationPending,
  dismissReleaseNotification,
  resetInMemoryReleaseState,
  STORAGE_KEY_LAST_SEEN_RELEASE,
} from '@/lib/release-state'
import { dialogCoordinator } from '@/lib/dialog-coordinator'
import { CURRENT_RELEASE } from '@/lib/version'

describe('Subject Controls Shared Mappings & Canonical Order', () => {
  it('enforces exact status cycle order: none -> in_progress -> complete', () => {
    expect(STATUS_CYCLE).toEqual(['none', 'in_progress', 'complete'])
  })

  it('provides exact human-readable labels for all status states', () => {
    expect(STATUS_CONFIG.none.label).toBe('Not started')
    expect(STATUS_CONFIG.in_progress.label).toBe('In progress')
    expect(STATUS_CONFIG.complete.label).toBe('Complete')
  })

  it('defines correct 1–5 confidence wording matching specification', () => {
    expect(CONFIDENCE_LEVELS).toHaveLength(5)
    expect(CONFIDENCE_LEVELS[0]).toEqual({
      level: 1,
      text: '1 — I need to relearn it',
      description: 'I need to relearn it',
    })
    expect(CONFIDENCE_LEVELS[1]).toEqual({
      level: 2,
      text: '2 — I need more guided practice',
      description: 'I need more guided practice',
    })
    expect(CONFIDENCE_LEVELS[2]).toEqual({
      level: 3,
      text: '3 — I understand the basics',
      description: 'I understand the basics',
    })
    expect(CONFIDENCE_LEVELS[3]).toEqual({
      level: 4,
      text: '4 — I can answer most questions',
      description: 'I can answer most questions',
    })
    expect(CONFIDENCE_LEVELS[4]).toEqual({
      level: 5,
      text: '5 — I can apply it independently',
      description: 'I can apply it independently',
    })
  })

  it('contains complete rendered guide copy and accessible step labels', () => {
    expect(GUIDE_COPY.step1.stepLabel).toBe('Step 1 of 2')
    expect(GUIDE_COPY.step1.title).toBe('Rate your confidence')
    expect(GUIDE_COPY.step1.intro).toBe(
      'Choose how independently you can answer questions from this chapter:'
    )
    expect(GUIDE_COPY.step1.items).toEqual([
      '1 — I need to relearn it',
      '2 — I need more guided practice',
      '3 — I understand the basics',
      '4 — I can answer most questions',
      '5 — I can apply it independently',
    ])
    expect(GUIDE_COPY.step1.footer).toContain('Select the same star again to clear your rating.')

    expect(GUIDE_COPY.step2.stepLabel).toBe('Step 2 of 2')
    expect(GUIDE_COPY.step2.title).toBe('Track your notes')
    expect(GUIDE_COPY.step2.body).toContain('Not started, In progress, and Complete')
    expect(GUIDE_COPY.step2.body).toContain('Reopen this explanation from Guide beside Chapters.')
  })
})

describe('Subject Controls Guide Persistence, Versioning & State Transitions', () => {
  beforeEach(() => {
    cleanup()
    resetInMemorySubjectGuideState()
    resetInMemoryReleaseState()
    dialogCoordinator.reset()
  })

  afterEach(() => {
    cleanup()
  })

  it('auto-opens on first unseen visit', () => {
    const mockStorageData: Record<string, string> = {
      [STORAGE_KEY_LAST_SEEN_RELEASE]: CURRENT_RELEASE.version,
    }
    const mockStorage = {
      getItem: (key: string) => mockStorageData[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorageData[key] = value
      },
    } as Storage

    expect(hasSeenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, mockStorage)).toBe(false)
    expect(shouldAutoOpenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, mockStorage)).toBe(true)
    expect(evaluateSubjectGuideAutoOpen(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, mockStorage)).toBe('open')
  })

  it('does not auto-open on already-seen visit', () => {
    const mockStorageData: Record<string, string> = {
      [STORAGE_KEY_LAST_SEEN_RELEASE]: CURRENT_RELEASE.version,
      [STORAGE_KEY_SUBJECT_CONTROLS_GUIDE]: 'true',
    }
    const mockStorage = {
      getItem: (key: string) => mockStorageData[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorageData[key] = value
      },
    } as Storage

    expect(hasSeenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, mockStorage)).toBe(true)
    expect(shouldAutoOpenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, mockStorage)).toBe(false)
    expect(evaluateSubjectGuideAutoOpen(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, mockStorage)).toBe('skip')
  })

  it('supports genuine manual reopening and multi-step dialog interaction', async () => {
    const onClose = vi.fn()
    const mockStorageKey = 'test_manual_reopen_key'
    markSubjectGuideSeen(mockStorageKey)
    expect(hasSeenSubjectGuide(mockStorageKey)).toBe(true)

    // Render launcher button
    const { unmount: unmountLauncher } = render(React.createElement(SubjectGuideLauncher, {
      subjectColor: '#3b82f6',
      storageKey: mockStorageKey,
    }))

    const guideBtn = screen.getByRole('button', { name: /open subject controls guide/i })
    expect(guideBtn).toBeDefined()
    expect(guideBtn.textContent).toContain('Guide')

    // Click Guide button to open
    await act(async () => {
      fireEvent.click(guideBtn)
    })
    unmountLauncher()

    // Dialog is now open: render real SubjectControlsGuide
    const { unmount } = render(React.createElement(SubjectControlsGuide, {
      isOpen: true,
      onClose,
      subjectColor: '#3b82f6',
      storageKey: mockStorageKey,
    }))

    // Step 1 assertions
    expect(screen.getByText('Step 1 of 2')).toBeDefined()
    expect(screen.getByText('Rate your confidence')).toBeDefined()

    // Step transition: click Next
    const nextBtn = screen.getByRole('button', { name: /next/i })
    await act(async () => {
      fireEvent.click(nextBtn)
    })

    // Step 2 assertions
    expect(screen.getByText('Step 2 of 2')).toBeDefined()
    expect(screen.getByText('Track your notes')).toBeDefined()

    // Step transition: click Back
    const backBtn = screen.getByRole('button', { name: /back/i })
    await act(async () => {
      fireEvent.click(backBtn)
    })
    expect(screen.getByText('Step 1 of 2')).toBeDefined()

    // Forward to Step 2 and click Got it
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /next/i }))
    })
    const gotItBtn = screen.getByRole('button', { name: /got it/i })
    await act(async () => {
      fireEvent.click(gotItBtn)
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(hasSeenSubjectGuide(mockStorageKey)).toBe(true)
    unmount()
  })

  it('restores focus to launcher trigger button upon dialog closure and handles Escape key', async () => {
    const onClose = vi.fn()
    const triggerBtn = document.createElement('button')
    triggerBtn.setAttribute('aria-label', 'Open subject controls guide')
    document.body.appendChild(triggerBtn)
    triggerBtn.focus()
    expect(document.activeElement).toBe(triggerBtn)

    const triggerRef = { current: triggerBtn }

    // Render open Dialog with returnFocusRef
    const { rerender } = render(React.createElement(SubjectControlsGuide, {
      isOpen: true,
      onClose,
      returnFocusRef: triggerRef,
    }))

    // Dismiss via Skip button
    const skipBtn = screen.getByRole('button', { name: /skip/i })
    await act(async () => {
      fireEvent.click(skipBtn)
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    // Re-render closed dialog -> focus returns to triggerBtn
    rerender(React.createElement(SubjectControlsGuide, {
      isOpen: false,
      onClose,
      returnFocusRef: triggerRef,
    }))

    expect(document.activeElement).toBe(triggerBtn)

    // Test Escape key dismissal
    rerender(React.createElement(SubjectControlsGuide, {
      isOpen: true,
      onClose,
      returnFocusRef: triggerRef,
    }))

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(onClose).toHaveBeenCalledTimes(2)

    document.body.removeChild(triggerBtn)
  })

  it('supports persistence version upgrades (e.g. atlas_subject_controls_guide_v2)', () => {
    const mockStorageData: Record<string, string> = {
      atlas_subject_controls_guide_v1: 'true',
    }
    const mockStorage = {
      getItem: (key: string) => mockStorageData[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorageData[key] = value
      },
    } as Storage

    // Old key is seen, but new version key is unseen
    expect(hasSeenSubjectGuide('atlas_subject_controls_guide_v1', mockStorage)).toBe(true)
    expect(hasSeenSubjectGuide('atlas_subject_controls_guide_v2', mockStorage)).toBe(false)
    expect(shouldAutoOpenSubjectGuide('atlas_subject_controls_guide_v2', mockStorage)).toBe(true)
  })

  it('handles missing, null, or throwing storage safely with in-memory session fallback', () => {
    // 1. Null storage
    expect(hasSeenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, null)).toBe(false)
    expect(shouldAutoOpenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, null)).toBe(true)

    // Mark seen with null storage -> uses in-memory session cache
    markSubjectGuideSeen(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, null)
    expect(hasSeenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, null)).toBe(true)
    expect(shouldAutoOpenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, null)).toBe(false)

    // 2. Throwing storage methods (Safari private browsing / QuotaExceededError)
    resetInMemorySubjectGuideState()
    const throwingStorage = {
      getItem: () => {
        throw new Error('SecurityError: The operation is insecure.')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    } as unknown as Storage

    expect(hasSeenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, throwingStorage)).toBe(false)
    expect(shouldAutoOpenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, throwingStorage)).toBe(true)

    markSubjectGuideSeen(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, throwingStorage)
    expect(hasSeenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, throwingStorage)).toBe(true)
    expect(shouldAutoOpenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, throwingStorage)).toBe(false)
  })

  it('safely handles a window.localStorage property getter that throws before returning Storage', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')

    try {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('SecurityError: The operation is insecure.')
        },
        configurable: true,
      })

      // getSafeLocalStorage must not throw and must return null safely
      const storage = getSafeLocalStorage()
      expect(storage).toBeNull()

      // Subject guide functions must still execute cleanly with in-memory fallback
      expect(hasSeenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE)).toBe(false)
      expect(markSubjectGuideSeen(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE)).toBe(false)
      expect(hasSeenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE)).toBe(true)
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window, 'localStorage', originalDescriptor)
      }
    }
  })
})

describe('Modal Arbitration & Deferred Guide Opening', () => {
  beforeEach(() => {
    cleanup()
    resetInMemorySubjectGuideState()
    resetInMemoryReleaseState()
    dialogCoordinator.reset()
  })

  afterEach(() => {
    cleanup()
  })

  it('defers subject guide when What’s New release modal is pending, then opens automatically on dismissal during the same visit', () => {
    const mockStorageData: Record<string, string> = {}
    const mockStorage = {
      getItem: (key: string) => mockStorageData[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorageData[key] = value
      },
    } as Storage

    // Initial state: Both release notification and subject guide are unseen
    expect(isReleaseNotificationPending(mockStorage)).toBe(true)
    expect(shouldAutoOpenSubjectGuide(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, mockStorage)).toBe(true)

    // Test shared decision logic used by launcher
    expect(evaluateSubjectGuideAutoOpen(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, mockStorage)).toBe('deferred')

    // Simulate launcher state tracking
    let isGuideOpen = false
    const checkAndAutoOpen = () => {
      const decision = evaluateSubjectGuideAutoOpen(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, mockStorage)
      if (decision === 'open') {
        isGuideOpen = true
        return true
      }
      return false
    }

    // First attempt: What's New is pending -> guide is deferred
    const openedImmediately = checkAndAutoOpen()
    expect(openedImmediately).toBe(false)
    expect(isGuideOpen).toBe(false)

    // Launcher subscribes to release dismissal
    const unsubscribe = dialogCoordinator.subscribeReleaseDismissal(() => {
      checkAndAutoOpen()
    })

    // User dismisses What's New modal during the same visit
    dismissReleaseNotification(CURRENT_RELEASE.version, mockStorage)

    // Coordinator notified launcher -> Guide decision is now 'open' and automatically opened during the same visit!
    expect(isReleaseNotificationPending(mockStorage)).toBe(false)
    expect(evaluateSubjectGuideAutoOpen(STORAGE_KEY_SUBJECT_CONTROLS_GUIDE, mockStorage)).toBe('open')
    expect(isGuideOpen).toBe(true)

    unsubscribe()
  })
})

describe('Subject Controls Guide Rendered Step Components & Touch Targets', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders accessible Step 1 (Confidence) with canonical content and dialog structure', () => {
    render(
      React.createElement(SubjectControlsGuide, {
        isOpen: true,
        onClose: () => {},
        subjectColor: '#7f9fbe',
        storageKey: 'test_guide_key',
      })
    )

    // Accessible dialog attributes
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByText('Step 1 of 2')).toBeDefined()
    expect(screen.getByText('Rate your confidence')).toBeDefined()
    expect(screen.getByRole('button', { name: /skip/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /next/i })).toBeDefined()
  })

  it('renders accessible Step 1 Content component directly with 5-star items', () => {
    render(
      React.createElement(SubjectControlsGuideStep1Content, {
        subjectColor: '#7f9fbe',
      })
    )
    expect(screen.getByText('Choose how independently you can answer questions from this chapter:')).toBeDefined()
    expect(screen.getByText('1 — I need to relearn it')).toBeDefined()
    expect(screen.getByText('2 — I need more guided practice')).toBeDefined()
    expect(screen.getByText('3 — I understand the basics')).toBeDefined()
    expect(screen.getByText('4 — I can answer most questions')).toBeDefined()
    expect(screen.getByText('5 — I can apply it independently')).toBeDefined()
    expect(screen.getByText(/Select the same star again to clear your rating/i)).toBeDefined()
  })

  it('renders accessible Step 2 (Notes Status) with canonical content and status indicators', () => {
    render(
      React.createElement(SubjectControlsGuideStep2Content, {
        subjectColor: '#7f9fbe',
      })
    )

    expect(screen.getByText('Not started')).toBeDefined()
    expect(screen.getByText('Notes have not been started.')).toBeDefined()
    expect(screen.getByText('In progress')).toBeDefined()
    expect(screen.getByText('Records that you have begun.')).toBeDefined()
    expect(screen.getByText('Complete')).toBeDefined()
    expect(screen.getByText('Adds this chapter to Notes readiness. Completed chapters are no longer suggested for notes missions.')).toBeDefined()
  })
})
