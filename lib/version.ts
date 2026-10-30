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
  version: '1.3.3',
  title: 'Accessible Setup & Controls',
  releaseDate: '2026-10-30',
  changes: [
    'Paper combinations can now be selected entirely with the keyboard.',
    'Dialogs now keep keyboard focus inside as you move between steps.',
    'Target-grade choices now remain visible and usable on narrow screens.',
    'Confidence ratings now announce the selected value to assistive technology.',
  ],
}
