import type { PaperWithSubject } from '@/types'

export interface PaperStageState {
  papers: PaperWithSubject[]
  untaggedPapers: PaperWithSubject[]
  pendingAssignments: Record<string, 'as' | 'a2'>
  errorNotice: string | null
}

/**
 * Optimistically assign a stage ('as' | 'a2') to a paper:
 * 1. Sets pendingAssignments[paperId] = stage
 * 2. Immediately updates the stage of matching paper in papers list to stage
 * 3. Does not remove from untaggedPapers yet (transitions row to pending saving state)
 * 4. Clears any previous error notice
 */
export function applyOptimisticPaperStage(
  state: PaperStageState,
  paperId: string,
  stage: 'as' | 'a2'
): PaperStageState {
  // Prevent conflicting or duplicate assignment if already pending for this paper
  if (state.pendingAssignments[paperId]) {
    return state
  }

  const updatedPapers = state.papers.map((p) =>
    p.id === paperId ? { ...p, stage } : p
  )

  return {
    ...state,
    papers: updatedPapers,
    pendingAssignments: {
      ...state.pendingAssignments,
      [paperId]: stage,
    },
    errorNotice: null,
  }
}

/**
 * Confirm successful server assignment:
 * 1. Removes the paper from untaggedPapers
 * 2. Clears pendingAssignments[paperId]
 * 3. Ensures paper in papers list retains the confirmed stage
 */
export function applyConfirmedPaperStage(
  state: PaperStageState,
  paperId: string,
  stage: 'as' | 'a2'
): PaperStageState {
  const nextPending = { ...state.pendingAssignments }
  delete nextPending[paperId]

  const updatedUntagged = state.untaggedPapers.filter((p) => p.id !== paperId)
  const updatedPapers = state.papers.map((p) =>
    p.id === paperId ? { ...p, stage } : p
  )

  return {
    ...state,
    papers: updatedPapers,
    untaggedPapers: updatedUntagged,
    pendingAssignments: nextPending,
    errorNotice: null,
  }
}

/**
 * Roll back optimistic stage assignment on Server Action failure:
 * 1. Clears pendingAssignments[paperId]
 * 2. Reverts matching paper in papers list back to null stage (or previous stage)
 * 3. Restores error notice for accessible user notification
 */
export function applyRollbackPaperStage(
  state: PaperStageState,
  paperId: string,
  errorMsg: string
): PaperStageState {
  const nextPending = { ...state.pendingAssignments }
  delete nextPending[paperId]

  const updatedPapers = state.papers.map((p) =>
    p.id === paperId ? { ...p, stage: null } : p
  )

  return {
    ...state,
    papers: updatedPapers,
    pendingAssignments: nextPending,
    errorNotice: errorMsg,
  }
}

/**
 * In-flight action guard to synchronously prevent double-clicks, conflicting
 * stage dispatches, and multi-action launches for the same paper.
 */
export function createInFlightGuard() {
  const inFlight = new Set<string>()

  return {
    acquire(paperId: string): boolean {
      if (inFlight.has(paperId)) {
        return false
      }
      inFlight.add(paperId)
      return true
    },
    release(paperId: string): void {
      inFlight.delete(paperId)
    },
    isInFlight(paperId: string): boolean {
      return inFlight.has(paperId)
    },
    size(): number {
      return inFlight.size
    },
  }
}

/**
 * Card interaction policies during paper saving / deleting states.
 */
export function canNavigatePaper(isSavingStage: boolean, isDeleting: boolean): boolean {
  return !isSavingStage && !isDeleting
}

export function canEditPaper(isSavingStage: boolean, hasPaperNumber: boolean): boolean {
  return !isSavingStage && hasPaperNumber
}

export function canDeletePaper(isSavingStage: boolean, isDeleting: boolean): boolean {
  return !isSavingStage && !isDeleting
}

export function computeEffectiveStage(
  pendingStage?: 'as' | 'a2',
  currentStage?: 'as' | 'a2' | null
): 'as' | 'a2' | null {
  return pendingStage ?? currentStage ?? null
}

export function computeModalStage(effectiveStage?: 'as' | 'a2' | null): 'as' | 'a2' {
  return effectiveStage ?? 'as'
}
