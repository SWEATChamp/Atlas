import { getAuthenticatedContext } from '@/lib/supabase/authenticated'
import { getPracticeRouteContext } from '@/lib/actions/practice-sessions'
import { computePredictedExamMark } from '@/lib/practice-analytics'
import { StudyIndicators, type IndicatorItem } from './study-indicators'
import type { PaperWithSubject } from '@/types'
import type { PaperStage } from '@/types/database'
import type { PracticeSessionRead } from '@/types/practice-sessions'

export interface RawEnrollment {
  id: string
  subject_id: string
  current_stage: string
  study_route: string
  is_archived: boolean
  subjects: {
    id: string
    name: string
    code?: string | null
    color_hex?: string | null
  } | null
}

export function StudyIndicatorsSkeleton({ activeSubjectName }: { activeSubjectName?: string | null }) {
  return (
    <section aria-labelledby="study-indicators-title" style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2 id="study-indicators-title" className="text-heading-3" style={{ margin: 0 }}>
          Study Indicators {activeSubjectName ? `· ${activeSubjectName}` : ''}
        </h2>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Practice-informed performance &amp; readiness
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        <div className="skeleton" role="status" aria-label="Loading study indicators" style={{ height: '180px', borderRadius: 'var(--radius-lg)' }} />
      </div>
    </section>
  )
}

export async function AsyncStudyIndicators({
  userId,
  targetEnrollments,
  papers,
  practiceSessions,
  activeSubjectName,
}: {
  userId: string
  targetEnrollments: RawEnrollment[]
  papers: PaperWithSubject[]
  practiceSessions: PracticeSessionRead[]
  activeSubjectName?: string | null
}) {
  const { supabase } = await getAuthenticatedContext()

  const indicatorItems: IndicatorItem[] = (
    await Promise.all(
      targetEnrollments.map(async enrollment => {
        if (enrollment.study_route === 'unconfirmed') return []
        const sId = enrollment.subject_id
        const sName = enrollment.subjects?.name ?? 'Subject'
        const sCode = enrollment.subjects?.code ?? undefined
        const route = enrollment.study_route

        const context = await getPracticeRouteContext(sId)
        if (!context) return []

        const stages: PaperStage[] = route === 'as_only' ? ['as'] : ['as', 'a2']

        const itemsForEnrollment = await Promise.all(
          stages.map(async stage => {
            const isCurrent =
              enrollment.current_stage === 'full'
                ? true
                : enrollment.current_stage === stage
            const isLockedA2 = stage === 'a2' && enrollment.current_stage === 'as'

            const predicted = computePredictedExamMark(sId, stage, papers, practiceSessions, context)

            const hasRecordedHistory =
              practiceSessions.some(s => s.subject_id === sId && s.stage === stage) ||
              papers.some(p => p.subject_id === sId && p.stage === stage)

            let readinessScore: number | null = null
            if (!isLockedA2) {
              const rpcRes = await supabase.rpc('compute_readiness_score', {
                p_user_id: userId,
                p_subject_id: sId,
                p_stage: stage,
              })
              readinessScore = typeof rpcRes.data === 'number' ? rpcRes.data : null
            }

            return {
              subjectId: sId,
              subjectName: sName,
              subjectCode: sCode,
              stage,
              isCurrentStage: isCurrent,
              isLockedA2,
              predicted,
              readinessScore,
              hasRecordedHistory,
            }
          })
        )

        return itemsForEnrollment
      })
    )
  ).flat()

  return <StudyIndicators indicators={indicatorItems} activeSubjectName={activeSubjectName} />
}
