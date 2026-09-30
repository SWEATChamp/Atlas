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
  version: '1.2.1',
  title: 'Bug Fix: Subject Route Display',
  releaseDate: '2026-09-30',
  changes: [
    'Selected Mathematics papers now map to the correct Subject Route chapter groups.',
    'Statistics 1 remains available during staged AS study, while Pure 3 and Mechanics stay locked until A2.',
    'Selected papers now appear before unselected components, with AS papers listed ahead of A2 papers.',
  ],
}
