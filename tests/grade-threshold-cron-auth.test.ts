import { describe, expect, test } from 'vitest'
import {
  MINIMUM_CRON_SECRET_LENGTH,
  verifyCronAuthorization,
} from '../lib/grade-thresholds/cron-auth'
import * as serverExports from '../lib/grade-thresholds/server'

describe('narrow cron-auth module', () => {
  const VALID_SECRET = 'a'.repeat(MINIMUM_CRON_SECRET_LENGTH)
  const SHORT_SECRET = 'a'.repeat(MINIMUM_CRON_SECRET_LENGTH - 1)

  test('minimum secret length is 16', () => {
    expect(MINIMUM_CRON_SECRET_LENGTH).toBe(16)
  })

  test('returns misconfigured when server secret is missing, empty, or too short', () => {
    expect(verifyCronAuthorization(null, undefined)).toBe('misconfigured')
    expect(verifyCronAuthorization('Bearer something', undefined)).toBe('misconfigured')
    expect(verifyCronAuthorization('Bearer something', '')).toBe('misconfigured')
    expect(verifyCronAuthorization('Bearer something', SHORT_SECRET)).toBe('misconfigured')
  })

  test('returns unauthorized when authorization header is missing or invalid', () => {
    expect(verifyCronAuthorization(null, VALID_SECRET)).toBe('unauthorized')
    expect(verifyCronAuthorization('', VALID_SECRET)).toBe('unauthorized')
    expect(verifyCronAuthorization('Basic dXNlcjpwYXNz', VALID_SECRET)).toBe('unauthorized')
    expect(verifyCronAuthorization(`Bearer wrong-token`, VALID_SECRET)).toBe('unauthorized')
  })

  test('returns authorized when bearer token exactly matches secret', () => {
    expect(verifyCronAuthorization(`Bearer ${VALID_SECRET}`, VALID_SECRET)).toBe('authorized')
  })

  test('enforces credential isolation between different secrets', () => {
    const SECRET_A = 'secret-a-123456789012'
    const SECRET_B = 'secret-b-123456789012'

    expect(verifyCronAuthorization(`Bearer ${SECRET_A}`, SECRET_B)).toBe('unauthorized')
    expect(verifyCronAuthorization(`Bearer ${SECRET_B}`, SECRET_A)).toBe('unauthorized')
    expect(verifyCronAuthorization(`Bearer ${SECRET_A}`, SECRET_A)).toBe('authorized')
  })

  test('server.ts re-exports verifyCronAuthorization for backward compatibility', () => {
    expect(serverExports.verifyCronAuthorization).toBe(verifyCronAuthorization)
  })
})
