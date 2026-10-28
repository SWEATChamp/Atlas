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
  version: '1.3.2',
  title: 'Progress Reliability & Recovery',
  releaseDate: '2026-10-28',
  changes: [
    'Progress summaries now reflect only chapters available for your current study route.',
    'Subject-loading failures now show clear errors instead of misleading empty progress.',
    'Chapter notes and confidence updates now recover reliably from failed or rapid changes.',
  ],
}
