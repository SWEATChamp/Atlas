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
  version: '1.5.0',
  title: 'Target-Grade Marks Planner',
  releaseDate: '2026-11-23',
  changes: [
    'Paper-by-paper target marks derived from verified official Cambridge threshold and weighting evidence.',
    'Exact-variant targets for known papers, alongside clearly disclosed Atlas variant estimates.',
    'Full-paper performance comparisons, recency-weighted planning, safety margins, and staged A* contribution handling.',
    'Fail-closed reliability: unavailable routes, unweighted combinations, or missing threshold data fail safe without guessing.',
    'Predicted grades isolate verified full-paper attempts and strictly exclude standalone question practice.',
  ],
}
