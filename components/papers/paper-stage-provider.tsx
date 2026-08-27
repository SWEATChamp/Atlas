'use client'

import React, { createContext, useContext, useState, useRef, useTransition } from 'react'
import type { PaperWithSubject } from '@/types'
import { assignPaperStage } from '@/lib/actions/papers'
import {
  applyOptimisticPaperStage,
  applyConfirmedPaperStage,
  applyRollbackPaperStage,
  createInFlightGuard,
  type PaperStageState,
} from '@/lib/papers-state'
import PaperStageTagger from './paper-stage-tagger'
import { PaperCard } from './paper-card'

interface PaperStageContextType {
  state: PaperStageState
  handleTag: (paperId: string, stage: 'as' | 'a2') => void
  timeZone: string
}

const PaperStageContext = createContext<PaperStageContextType | null>(null)

export function PaperStageProvider({
  initialPapers,
  initialUntaggedPapers,
  timeZone,
  children,
}: {
  initialPapers: PaperWithSubject[]
  initialUntaggedPapers: PaperWithSubject[]
  timeZone: string
  children: React.ReactNode
}) {
  const guardRef = useRef(createInFlightGuard())
  const [state, setState] = useState<PaperStageState>({
    papers: initialPapers,
    untaggedPapers: initialUntaggedPapers,
    pendingAssignments: {},
    errorNotice: null,
  })

  // Synchronise if initial props change during navigation (reconcile on render)
  const [prevInitialPapers, setPrevInitialPapers] = useState(initialPapers)
  const [prevInitialUntagged, setPrevInitialUntagged] = useState(initialUntaggedPapers)
  if (prevInitialPapers !== initialPapers || prevInitialUntagged !== initialUntaggedPapers) {
    setPrevInitialPapers(initialPapers)
    setPrevInitialUntagged(initialUntaggedPapers)
    setState({
      papers: initialPapers,
      untaggedPapers: initialUntaggedPapers,
      pendingAssignments: {},
      errorNotice: null,
    })
  }

  const [, startTransition] = useTransition()

  const handleTag = (paperId: string, stage: 'as' | 'a2') => {
    // Synchronous guard: prevent double-clicks, conflicting AS/A2 clicks, and concurrent actions
    if (!guardRef.current.acquire(paperId)) {
      return
    }

    // 1. Immediate optimistic state update
    setState((prev) => applyOptimisticPaperStage(prev, paperId, stage))

    // 2. Launch Server Action (which performs server revalidation in single roundtrip)
    startTransition(async () => {
      try {
        const res = await assignPaperStage(paperId, stage)
        if (res.error || !res.success) {
          setState((prev) =>
            applyRollbackPaperStage(
              prev,
              paperId,
              res.error || 'Failed to assign paper stage. Please try again.'
            )
          )
        } else {
          setState((prev) => applyConfirmedPaperStage(prev, paperId, stage))
        }
      } catch (err: unknown) {
        console.error('Failed to assign paper stage:', err)
        setState((prev) =>
          applyRollbackPaperStage(
            prev,
            paperId,
            'An unexpected error occurred while assigning the paper stage. Please try again.'
          )
        )
      } finally {
        guardRef.current.release(paperId)
      }
    })
  }

  return (
    <PaperStageContext.Provider value={{ state, handleTag, timeZone }}>
      {children}
    </PaperStageContext.Provider>
  )
}

export function PaperStageTaggerSlot() {
  const ctx = useContext(PaperStageContext)
  if (!ctx) return null
  return (
    <PaperStageTagger
      untaggedPapers={ctx.state.untaggedPapers}
      pendingAssignments={ctx.state.pendingAssignments}
      onTag={ctx.handleTag}
      errorMessage={ctx.state.errorNotice}
    />
  )
}

export function PaperAttemptsListSlot({ emptyMessage }: { emptyMessage?: string }) {
  const ctx = useContext(PaperStageContext)
  if (!ctx) return null
  const { papers, pendingAssignments } = ctx.state

  if (papers.length === 0) {
    return (
      <div
        className="card"
        style={{
          padding: 'var(--space-8)',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}
      >
        {emptyMessage ?? 'No papers logged yet.'}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {papers.map((p) => (
        <PaperCard
          key={p.id}
          paper={p}
          timeZone={ctx.timeZone}
          pendingStage={pendingAssignments[p.id]}
        />
      ))}
    </div>
  )
}
