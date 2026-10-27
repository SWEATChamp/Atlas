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
  version: '1.3.1',
  title: 'Stats Layout & UI Stability',
  releaseDate: '2026-10-25',
  changes: [
    'Improved Stats loading-layout stability.',
    'Improved narrow-screen statistics-card layout.',
    'Full-paper logging defaults to the selected subject.',
    'Corrected single-attempt evidence-disclosure wording.',
  ],
}
