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
  version: '1.3.0',
  title: 'Question Practice, Stats & Logs',
  releaseDate: 'Pending Deployment',
  changes: [
    'Separate full-paper and standalone question-practice logging with distinct history tracking.',
    'Required multi-chapter mapping per question with optional exam provenance (year, series, paper, variant).',
    'Dedicated Stats and Logs workspaces featuring subject-specific performance analytics, score trends, and pagination.',
    'Separate practice-informed predicted exam mark estimates (explicitly non-official) and syllabus readiness indicators.',
    'Smoother repeated subject switching and warm tab revisits powered by client-session caching.',
  ],
}
