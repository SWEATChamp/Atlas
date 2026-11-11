import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent, waitFor, cleanup } from '@testing-library/react'
import WhatsNewModal from '@/components/whats-new-modal'
import {
  STORAGE_KEY_LAST_SEEN_RELEASE,
  resetInMemoryReleaseState,
} from '@/lib/release-state'
import { CURRENT_RELEASE } from '@/lib/version'

const store = new Map<string, string>()
const mockLocalStorage: Storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, String(value))
  },
  removeItem: (key: string) => {
    store.delete(key)
  },
  clear: () => {
    store.clear()
  },
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  get length() {
    return store.size
  },
}

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
})

describe('Release Notification UI Component', () => {
  beforeEach(() => {
    vi.useRealTimers()
    resetInMemoryReleaseState()
    store.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    resetInMemoryReleaseState()
    store.clear()
  })

  it('renders v1.3.4 notice for user upgrading from v1.3.3 and records dismissal', async () => {
    // 1. Set atlas_last_seen_release_version to 1.3.3
    window.localStorage.setItem(STORAGE_KEY_LAST_SEEN_RELEASE, '1.3.3')
    expect(window.localStorage.getItem(STORAGE_KEY_LAST_SEEN_RELEASE)).toBe('1.3.3')

    // 2. Render WhatsNewModal
    render(<WhatsNewModal />)

    // 3. Wait for the dialog to open (opened via setTimeout 0 in useEffect)
    const dialog = await waitFor(() => {
      const el = screen.getByRole('dialog')
      expect(el).toBeDefined()
      return el
    })
    expect(dialog).toBeDefined()

    // 4. Verify Badge v1.3.4
    const badge = screen.getByText(`v${CURRENT_RELEASE.version}`)
    expect(badge).toBeDefined()
    expect(badge.textContent).toBe('v1.3.4')

    // 5. Verify Title Database Availability Safeguard
    const title = screen.getByText(CURRENT_RELEASE.title)
    expect(title).toBeDefined()
    expect(title.textContent).toBe('Database Availability Safeguard')

    // 6. Verify all three exact highlights
    const expectedHighlights = [
      'Atlas now runs lightweight scheduled database checks during quiet periods.',
      'Keep-alive checks use read-only access and never modify student data.',
      'Operational failures now return clear, safely logged status information.',
    ]

    for (const highlight of expectedHighlights) {
      expect(screen.getByText(highlight)).toBeDefined()
    }

    // 7. Dismiss the notice
    const dismissButton = screen.getByRole('button', { name: /got it/i })
    await act(async () => {
      fireEvent.click(dismissButton)
    })

    // 8. Confirm that 1.3.4 is stored as the last-seen release
    expect(window.localStorage.getItem(STORAGE_KEY_LAST_SEEN_RELEASE)).toBe('1.3.4')

    // 9. Confirm dialog is dismissed
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('does not open dialog when user has already dismissed v1.3.4', async () => {
    window.localStorage.setItem(STORAGE_KEY_LAST_SEEN_RELEASE, '1.3.4')
    render(<WhatsNewModal />)

    // Wait short period to ensure setTimeout(0) resolves
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
