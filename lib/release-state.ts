import { getSafeLocalStorage } from './storage'
import { CURRENT_RELEASE } from './version'
import { dialogCoordinator } from './dialog-coordinator'

export const STORAGE_KEY_LAST_SEEN_RELEASE = 'atlas_last_seen_release_version'

// In-memory fallback tracking for the active session when localStorage is unavailable or throws
let inMemoryDismissedRelease: string | null = null

/**
 * Pure helper to determine whether the release notification dialog should be displayed.
 * Returns true if the user has never dismissed any release (lastDismissedVersion is null)
 * or if the last dismissed release version differs from the current release version.
 */
export function shouldShowReleaseNotification(
  currentVersion: string,
  lastDismissedVersion: string | null
): boolean {
  if (!currentVersion) return false
  if (!lastDismissedVersion) return true
  return lastDismissedVersion !== currentVersion
}

/**
 * Safely retrieve the last dismissed release version from a Storage-like object or in-memory fallback.
 */
export function getDismissedReleaseVersion(storage?: Storage | null): string | null {
  if (storage !== undefined && storage !== null) {
    try {
      return storage.getItem(STORAGE_KEY_LAST_SEEN_RELEASE)
    } catch {
      return inMemoryDismissedRelease
    }
  }

  const targetStorage = storage === null ? null : getSafeLocalStorage()
  if (!targetStorage) return inMemoryDismissedRelease
  try {
    const val = targetStorage.getItem(STORAGE_KEY_LAST_SEEN_RELEASE)
    return val ?? inMemoryDismissedRelease
  } catch {
    return inMemoryDismissedRelease
  }
}

/**
 * Checks whether the What's New release notification is currently pending dismissal.
 */
export function isReleaseNotificationPending(storage?: Storage | null): boolean {
  const dismissed = getDismissedReleaseVersion(storage)
  return shouldShowReleaseNotification(CURRENT_RELEASE.version, dismissed)
}

/**
 * Safely record the dismissed release version into a Storage-like object and in-memory cache.
 * Returns true if successfully saved, false if storage threw or is unavailable.
 */
export function setDismissedReleaseVersion(
  version: string,
  storage?: Storage | null
): boolean {
  if (!version) return false
  inMemoryDismissedRelease = version
  const targetStorage = storage !== undefined ? storage : getSafeLocalStorage()
  if (!targetStorage) return false
  try {
    targetStorage.setItem(STORAGE_KEY_LAST_SEEN_RELEASE, version)
    return true
  } catch {
    return false
  }
}

/**
 * Dismiss the release notification: records the dismissed version and notifies listeners
 * via the dialog coordinator so deferred dialogs can open during the same visit.
 */
export function dismissReleaseNotification(
  version: string = CURRENT_RELEASE.version,
  storage?: Storage | null
): boolean {
  const result = setDismissedReleaseVersion(version, storage)
  dialogCoordinator.notifyReleaseDismissed()
  return result
}

/**
 * Resets the in-memory dismissed release state (used for tests).
 */
export function resetInMemoryReleaseState(): void {
  inMemoryDismissedRelease = null
}
