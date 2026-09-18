import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

export const MINIMUM_CRON_SECRET_LENGTH = 16

export type CronAuthorizationResult =
  | 'authorized'
  | 'unauthorized'
  | 'misconfigured'

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/**
 * Verifies a bearer authorization header against an expected secret without
 * length leaks or timing variations.
 *
 * A missing or too-short server secret (< 16 chars) fails closed as 'misconfigured'
 * rather than accepting an empty or weak credential.
 */
export function verifyCronAuthorization(
  authorizationHeader: string | null,
  cronSecret: string | undefined,
): CronAuthorizationResult {
  if (!cronSecret || cronSecret.length < MINIMUM_CRON_SECRET_LENGTH) {
    return 'misconfigured'
  }

  if (!authorizationHeader) {
    return 'unauthorized'
  }

  const supplied = digest(authorizationHeader)
  const expected = digest(`Bearer ${cronSecret}`)
  return timingSafeEqual(supplied, expected) ? 'authorized' : 'unauthorized'
}
