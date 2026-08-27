export const STORAGE_KEY_LAST_SEEN_RELEASE = 'atlas_last_seen_release_version'

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
 * Safely retrieve the last dismissed release version from a Storage-like object.
 * Returns null if storage is unavailable, null, or throws (e.g. Safari private mode).
 */
export function getDismissedReleaseVersion(storage?: Storage | null): string | null {
  if (!storage) return null
  try {
    return storage.getItem(STORAGE_KEY_LAST_SEEN_RELEASE)
  } catch {
    return null
  }
}

/**
 * Safely record the dismissed release version into a Storage-like object.
 * Returns true if successfully saved, false if storage threw or is unavailable.
 */
export function setDismissedReleaseVersion(
  version: string,
  storage?: Storage | null
): boolean {
  if (!storage || !version) return false
  try {
    storage.setItem(STORAGE_KEY_LAST_SEEN_RELEASE, version)
    return true
  } catch {
    return false
  }
}
