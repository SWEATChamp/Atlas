/**
 * Safely accesses window.localStorage without throwing SecurityError in restricted environments
 * (e.g. sandboxed iframes, disabled storage, Safari private mode, or strict browser policies).
 */
export function getSafeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}
