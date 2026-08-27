export const MAX_ACTIVE_SUBJECTS = 5
export const MIN_ACTIVE_SUBJECTS = 1

export function canAddSubject(activeCount: number): boolean {
  return Number.isInteger(activeCount) && activeCount < MAX_ACTIVE_SUBJECTS
}

export function canRemoveSubject(activeCount: number): boolean {
  return Number.isInteger(activeCount) && activeCount > MIN_ACTIVE_SUBJECTS
}

export function getRemovalImpactMessage(subjectIsAvailable: boolean): string {
  const restoreCopy = subjectIsAvailable
    ? 'You can add it again later.'
    : 'You can add it again when this subject becomes supported.'

  return `You will stop receiving new missions for it. Your progress, past papers, completed missions, and XP will be preserved. ${restoreCopy}`
}
