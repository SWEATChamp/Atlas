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
  version: '1.1.1',
  title: 'Singapore Infrastructure Migration',
  releaseDate: '2026-09-01',
  changes: [
    'Atlas services have moved to Singapore, closer to most users.',
    'Accounts, subjects, progress, missions, past papers and XP were preserved during migration.',
    'Authentication and data services now use the Singapore infrastructure.',
    'Returning users may need to sign in again after the move.',
  ],
}
