export interface ReleaseInfo {
  version: string
  title: string
  releaseDate: string
  changes: string[]
}

/**
 * Authoritative user-facing application release metadata.
 * Note: releaseDate represents the scheduled release version metadata,
 * finalized upon production deployment.
 */
export const CURRENT_RELEASE: ReleaseInfo = {
  version: '1.1.0',
  title: 'Dashboard Mobile Compatibility & Update Notifications',
  releaseDate: 'Pending Deployment',
  changes: [
    'Fixed mobile responsiveness and horizontal overflow on Dashboard daily missions',
    'Enforced 44×44px touch targets on navigation logo, route configuration, and mission controls',
    'Added visible semantic release versioning and update notifications',
  ],
}
