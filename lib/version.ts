export interface ReleaseInfo {
  version: string
  title: string
  releaseDate: string
  changes: string[]
}

/**
 * Authoritative user-facing application release metadata.
 * releaseDate records the intended merge/release date, while deployment
 * and smoke-verification evidence are tracked separately.
 */
export const CURRENT_RELEASE: ReleaseInfo = {
  version: '1.3.4',
  title: 'Database Availability Safeguard',
  releaseDate: '2026-11-11',
  changes: [
    'Atlas now runs lightweight scheduled database checks during quiet periods.',
    'Keep-alive checks use read-only access and never modify student data.',
    'Operational failures now return clear, safely logged status information.',
  ],
}
