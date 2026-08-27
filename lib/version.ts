export interface ReleaseInfo {
  version: string
  title: string
  releaseDate: string
  changes: string[]
}

/**
 * Authoritative user-facing application release metadata.
 * releaseDate is finalized only after the release passes production smoke testing.
 */
export const CURRENT_RELEASE: ReleaseInfo = {
  version: '1.1.0',
  title: 'Dashboard Mobile Compatibility & Update Notifications',
  releaseDate: '2026-08-28',
  changes: [
    'Made Dashboard daily missions flex with their available width across desktop, split-screen, tablet, and mobile layouts',
    'Enforced 44×44px touch targets on navigation logo, route configuration, and mission controls',
    'Added visible semantic release versioning and update notifications',
  ],
}
