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
  version: '1.2.0',
  title: 'Accessible UI Foundation & Subject Controls Guide',
  releaseDate: '2026-09-02',
  changes: [
    'A calmer, more consistent interface now spans Dashboard, Subjects, Past Papers, onboarding, and sign-in.',
    'A new Subject Guide explains confidence stars and notes-status controls and can be reopened beside Chapters.',
    'Keyboard navigation, focus handling, screen-reader semantics, and reduced-motion support have been improved.',
    'Mobile and tablet layouts now remain readable with larger touch targets and no horizontal overflow.',
  ],
}
