import { describe, it, expect, beforeEach } from 'vitest'
import {
  shouldShowReleaseNotification,
  getDismissedReleaseVersion,
  setDismissedReleaseVersion,
  resetInMemoryReleaseState,
  STORAGE_KEY_LAST_SEEN_RELEASE,
} from '@/lib/release-state'

describe('Release Notification State', () => {
  beforeEach(() => {
    resetInMemoryReleaseState()
  })

  it('shows notification when user has never dismissed any release (first visit)', () => {
    expect(shouldShowReleaseNotification('1.1.0', null)).toBe(true)
    expect(shouldShowReleaseNotification('1.1.0', '')).toBe(true)
  })

  it('hides notification when current version matches dismissed version', () => {
    expect(shouldShowReleaseNotification('1.1.0', '1.1.0')).toBe(false)
  })

  it('shows notification when current version is newer than dismissed version', () => {
    expect(shouldShowReleaseNotification('1.1.0', '1.0.0')).toBe(true)
    expect(shouldShowReleaseNotification('2.0.0', '1.1.0')).toBe(true)
  })

  it('handles empty or missing current version gracefully', () => {
    expect(shouldShowReleaseNotification('', '1.0.0')).toBe(false)
  })

  describe('Storage Safe Access Helpers', () => {
    it('reads and writes dismissed release version successfully', () => {
      const mockStorageData: Record<string, string> = {}
      const mockStorage = {
        getItem: (key: string) => mockStorageData[key] ?? null,
        setItem: (key: string, value: string) => {
          mockStorageData[key] = value
        },
      } as Storage

      expect(getDismissedReleaseVersion(mockStorage)).toBeNull()

      const saveSuccess = setDismissedReleaseVersion('1.1.0', mockStorage)
      expect(saveSuccess).toBe(true)
      expect(mockStorageData[STORAGE_KEY_LAST_SEEN_RELEASE]).toBe('1.1.0')

      expect(getDismissedReleaseVersion(mockStorage)).toBe('1.1.0')
    })

    it('handles null or undefined storage safely without throwing', () => {
      expect(getDismissedReleaseVersion(null)).toBeNull()
      expect(getDismissedReleaseVersion(undefined)).toBeNull()
      expect(setDismissedReleaseVersion('1.1.0', null)).toBe(false)
      expect(setDismissedReleaseVersion('1.1.0', undefined)).toBe(false)
    })

    it('catches and recovers from storage exceptions (e.g. quota exceeded / Safari private mode)', () => {
      const throwingStorage = {
        getItem: () => {
          throw new Error('SecurityError: Access is denied')
        },
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
      } as unknown as Storage

      expect(getDismissedReleaseVersion(throwingStorage)).toBeNull()
      expect(setDismissedReleaseVersion('1.1.0', throwingStorage)).toBe(false)
    })
  })
})
