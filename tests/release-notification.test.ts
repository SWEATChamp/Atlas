import { describe, it, expect } from 'vitest'
import {
  shouldShowReleaseNotification,
  getDismissedReleaseVersion,
  setDismissedReleaseVersion,
  STORAGE_KEY_LAST_SEEN_RELEASE,
} from '@/lib/release-state'

describe('Release Notification State', () => {
  it('shows notification when user has never dismissed any release (first visit)', () => {
    expect(shouldShowReleaseNotification('1.1.1', null)).toBe(true)
    expect(shouldShowReleaseNotification('1.1.1', '')).toBe(true)
  })

  it('hides notification when current version matches dismissed version', () => {
    expect(shouldShowReleaseNotification('1.1.1', '1.1.1')).toBe(false)
  })

  it('shows notification when current version is newer than dismissed version', () => {
    expect(shouldShowReleaseNotification('1.1.1', '1.0.0')).toBe(true)
    expect(shouldShowReleaseNotification('1.1.1', '1.1.0')).toBe(true)
    expect(shouldShowReleaseNotification('2.0.0', '1.1.1')).toBe(true)
  })

  it('evaluates release-state lifecycle for users upgrading from 1.1.0 to 1.1.1, returning true initially and false after recording dismissal', () => {
    const mockStorageData: Record<string, string> = {
      [STORAGE_KEY_LAST_SEEN_RELEASE]: '1.1.0',
    }
    const mockStorage = {
      getItem: (key: string) => mockStorageData[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorageData[key] = value
      },
    } as Storage

    // Initial check: returning user with 1.1.0 stored
    const priorVersion = getDismissedReleaseVersion(mockStorage)
    expect(priorVersion).toBe('1.1.0')
    expect(shouldShowReleaseNotification('1.1.1', priorVersion)).toBe(true)

    // User dismisses modal
    setDismissedReleaseVersion('1.1.1', mockStorage)
    expect(mockStorageData[STORAGE_KEY_LAST_SEEN_RELEASE]).toBe('1.1.1')

    // Subsequent check: user now has 1.1.1 stored
    const updatedVersion = getDismissedReleaseVersion(mockStorage)
    expect(updatedVersion).toBe('1.1.1')
    expect(shouldShowReleaseNotification('1.1.1', updatedVersion)).toBe(false)
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

      const saveSuccess = setDismissedReleaseVersion('1.1.1', mockStorage)
      expect(saveSuccess).toBe(true)
      expect(mockStorageData[STORAGE_KEY_LAST_SEEN_RELEASE]).toBe('1.1.1')

      expect(getDismissedReleaseVersion(mockStorage)).toBe('1.1.1')
    })

    it('handles null or undefined storage safely without throwing', () => {
      expect(getDismissedReleaseVersion(null)).toBeNull()
      expect(getDismissedReleaseVersion(undefined)).toBeNull()
      expect(setDismissedReleaseVersion('1.1.1', null)).toBe(false)
      expect(setDismissedReleaseVersion('1.1.1', undefined)).toBe(false)
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
      expect(setDismissedReleaseVersion('1.1.1', throwingStorage)).toBe(false)
    })
  })
})
