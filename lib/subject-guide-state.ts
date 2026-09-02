import { getSafeLocalStorage } from './storage'
import { isReleaseNotificationPending } from './release-state'

export const STORAGE_KEY_SUBJECT_CONTROLS_GUIDE = 'atlas_subject_controls_guide_v1'

// In-memory fallback tracking for the active session when localStorage is unavailable or throws
const inMemorySeenKeys = new Set<string>()

/**
 * Checks whether the user has seen the subject controls guide for a given key.
 * Safely accesses storage, falling back to the in-memory session set.
 */
export function hasSeenSubjectGuide(
  storageKey: string = STORAGE_KEY_SUBJECT_CONTROLS_GUIDE,
  storage?: Storage | null
): boolean {
  if (inMemorySeenKeys.has(storageKey)) {
    return true
  }
  const targetStorage = storage !== undefined ? storage : getSafeLocalStorage()
  if (!targetStorage) return false
  try {
    const val = targetStorage.getItem(storageKey)
    return val === 'true' || val === '1' || val === 'seen'
  } catch {
    return inMemorySeenKeys.has(storageKey)
  }
}

/**
 * Marks the subject controls guide as seen for a given key.
 * Writes to both in-memory session cache and localStorage.
 */
export function markSubjectGuideSeen(
  storageKey: string = STORAGE_KEY_SUBJECT_CONTROLS_GUIDE,
  storage?: Storage | null
): boolean {
  inMemorySeenKeys.add(storageKey)
  const targetStorage = storage !== undefined ? storage : getSafeLocalStorage()
  if (!targetStorage) return false
  try {
    targetStorage.setItem(storageKey, 'true')
    return true
  } catch {
    return false
  }
}

/**
 * Determines whether the guide should auto-open on subject detail visit.
 */
export function shouldAutoOpenSubjectGuide(
  storageKey: string = STORAGE_KEY_SUBJECT_CONTROLS_GUIDE,
  storage?: Storage | null
): boolean {
  return !hasSeenSubjectGuide(storageKey, storage)
}

export type SubjectGuideAutoOpenDecision = 'open' | 'deferred' | 'skip'

/**
 * Shared arbitration logic determining if the subject controls guide should open,
 * be deferred because a release notification is pending, or skipped because it was seen.
 */
export function evaluateSubjectGuideAutoOpen(
  storageKey: string = STORAGE_KEY_SUBJECT_CONTROLS_GUIDE,
  storage?: Storage | null
): SubjectGuideAutoOpenDecision {
  if (isReleaseNotificationPending(storage)) {
    return 'deferred'
  }
  if (shouldAutoOpenSubjectGuide(storageKey, storage)) {
    return 'open'
  }
  return 'skip'
}

/**
 * Resets the in-memory seen state (used for tests and resetting session state).
 */
export function resetInMemorySubjectGuideState(): void {
  inMemorySeenKeys.clear()
}
