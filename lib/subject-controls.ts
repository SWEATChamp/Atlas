import type { NotesStatus } from '@/types'

export const STATUS_CYCLE: readonly NotesStatus[] = ['none', 'in_progress', 'complete'] as const

export const STATUS_CONFIG: Record<
  NotesStatus,
  {
    label: string
    color: string
    description: string
  }
> = {
  none: {
    label: 'Not started',
    color: 'var(--text-disabled)',
    description: 'Chapter notes have not been started.',
  },
  in_progress: {
    label: 'In progress',
    color: 'var(--warning)',
    description: 'Records that you have begun.',
  },
  complete: {
    label: 'Complete',
    color: 'var(--success)',
    description: 'Adds this chapter to the Notes part of readiness, and completed chapters are no longer suggested for notes missions.',
  },
}

export const CONFIDENCE_LEVELS = [
  { level: 1, text: '1 — I need to relearn it', description: 'I need to relearn it' },
  { level: 2, text: '2 — I need more guided practice', description: 'I need more guided practice' },
  { level: 3, text: '3 — I understand the basics', description: 'I understand the basics' },
  { level: 4, text: '4 — I can answer most questions', description: 'I can answer most questions' },
  { level: 5, text: '5 — I can apply it independently', description: 'I can apply it independently' },
] as const

export const GUIDE_COPY = {
  step1: {
    title: 'Rate your confidence',
    stepLabel: 'Step 1 of 2',
    intro: 'Choose how independently you can answer questions from this chapter:',
    items: [
      '1 — I need to relearn it',
      '2 — I need more guided practice',
      '3 — I understand the basics',
      '4 — I can answer most questions',
      '5 — I can apply it independently',
    ],
    footer:
      'Your rating contributes to the Confidence part of readiness and helps Atlas prioritise future missions. Select the same star again to clear your rating.',
  },
  step2: {
    title: 'Track your notes',
    stepLabel: 'Step 2 of 2',
    body:
      'Select the status control to cycle through Not started, In progress, and Complete. In progress records that you have begun. Complete is the only state that adds this chapter to the Notes part of readiness, and completed chapters are no longer suggested for notes missions.\n\nYou can update either control at any time. Reopen this explanation from Guide beside Chapters.',
  },
} as const
