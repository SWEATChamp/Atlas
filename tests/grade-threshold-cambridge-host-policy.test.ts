import { describe, expect, test } from 'vitest'
import {
  APPROVED_CAMBRIDGE_HOSTS,
  isApprovedCambridgeHost,
} from '../lib/grade-thresholds/cambridge-host-policy'
import * as clientExports from '../lib/grade-thresholds'
import * as serverExports from '../lib/grade-thresholds/server'

describe('Cambridge host policy leaf module', () => {
  test('defines approved hostnames as a readonly set', () => {
    expect(APPROVED_CAMBRIDGE_HOSTS).toBeInstanceOf(Set)
    expect(APPROVED_CAMBRIDGE_HOSTS.has('www.cambridgeinternational.org')).toBe(true)
    expect(APPROVED_CAMBRIDGE_HOSTS.has('cambridgeinternational.org')).toBe(true)
    expect(APPROVED_CAMBRIDGE_HOSTS.has('malicious-site.com')).toBe(false)
  })

  test('isApprovedCambridgeHost normalizes hostname check', () => {
    expect(isApprovedCambridgeHost('WWW.CAMBRIDGEINTERNATIONAL.ORG')).toBe(true)
    expect(isApprovedCambridgeHost('cambridgeinternational.org')).toBe(true)
    expect(isApprovedCambridgeHost('evil.com')).toBe(false)
  })

  test('re-exports APPROVED_CAMBRIDGE_HOSTS from client and server entrypoints for backward compatibility', () => {
    expect(clientExports.APPROVED_CAMBRIDGE_HOSTS).toBe(APPROVED_CAMBRIDGE_HOSTS)
    expect(serverExports.APPROVED_CAMBRIDGE_HOSTS).toBe(APPROVED_CAMBRIDGE_HOSTS)
  })
})
