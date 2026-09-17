/**
 * Dependency-neutral leaf policy defining approved Cambridge hostnames.
 *
 * This module contains NO server-only, PDF, or persistence dependencies,
 * allowing safe consumption in both server and client contexts as well as
 * lightweight discovery routes.
 */
export const APPROVED_CAMBRIDGE_HOSTS: ReadonlySet<string> = new Set([
  'www.cambridgeinternational.org',
  'cambridgeinternational.org',
])

export function isApprovedCambridgeHost(hostname: string): boolean {
  return APPROVED_CAMBRIDGE_HOSTS.has(hostname.toLowerCase())
}
