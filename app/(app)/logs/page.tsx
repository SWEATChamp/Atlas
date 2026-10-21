import type { Metadata } from 'next'
import { getAuthenticatedContext, getCurrentProfile } from '@/lib/supabase/authenticated'
import { getAllPapersWithSubjects, getPapersForSubject, getUntaggedPapers } from '@/lib/actions/papers'
import { getPracticeFormCatalogue, getPracticeHistory } from '@/lib/actions/practice-sessions'
import { PaperStageTaggerSlot, PaperAttemptsListSlot } from '@/components/papers/paper-stage-provider'
import { LogsWorkspace } from '@/components/papers/logs-workspace'
import type { PracticeFormSubjectOption, PracticeHistoryPage } from '@/types/practice-sessions'

export const metadata: Metadata = {
  title: 'Practice Logs',
}

interface RawUserSubject {
  subjects: {
    id: string
    name: string
    color_hex?: string | null
  } | null
}

export default async function LogsPage(props: {
  searchParams?: Promise<{ subject?: string; page?: string }>
}) {
  const searchParamsPromise = props.searchParams ?? Promise.resolve<{ subject?: string; page?: string }>({})
  const [{ supabase, user }, profile, sp] = await Promise.all([
    getAuthenticatedContext(),
    getCurrentProfile(),
    searchParamsPromise,
  ])
  if (!user) return null

  const activeSubjectId = sp.subject || null
  const pageParam = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)
  const pageSize = 50
  const offset = (pageParam - 1) * pageSize

  const papersPromise = activeSubjectId ? getPapersForSubject(activeSubjectId) : getAllPapersWithSubjects()
  const untaggedPapersPromise = activeSubjectId
    ? getUntaggedPapers()
    : papersPromise.then(rows => rows.filter(paper => !paper.stage))

  // Start form catalogue loading concurrently without blocking page or history rendering.
  const cataloguePromise = getPracticeFormCatalogue().catch((err): PracticeFormSubjectOption[] | null => {
    console.error('Failed to load practice form catalogue', err)
    return null
  })

  // Logs independently loads user subjects, papers, and paginated history.
  // Neither blocks catalogue, and history renders without waiting for catalogue.
  const [userSubjectsData, papers, untaggedPapers, historyResult] = await Promise.all([
    supabase
      .from('user_subjects')
      .select('subjects(id, name, color_hex)')
      .eq('user_id', user.id)
      .eq('is_archived', false),
    papersPromise,
    untaggedPapersPromise,
    getPracticeHistory({
      ...(activeSubjectId ? { subjectId: activeSubjectId } : {}),
      offset,
      limit: pageSize,
    }).catch(
      (err): PracticeHistoryPage | null => {
        console.error('Failed to load practice history', err)
        return null
      }
    ),
  ])

  const historyError = historyResult === null ? 'Could not load practice history. Please refresh to retry.' : null
  const history = historyResult ?? { sessions: [], total: 0, offset, limit: pageSize }

  const subjects = ((userSubjectsData.data || []) as unknown as RawUserSubject[])
    .flatMap(row => (row.subjects ? [row.subjects] : []))
    .map(s => ({ id: s.id, name: s.name, color_hex: s.color_hex ?? '#3b82f6' }))

  const timeZone = profile?.timezone ?? 'UTC'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="text-heading-1" style={{ margin: 0 }}>
            Practice Logs
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Record paper attempts and question practice sessions
          </p>
        </div>
      </div>

      <LogsWorkspace
        userId={user.id}
        sessions={history.sessions}
        totalSessions={history.total}
        currentPage={pageParam}
        pageSize={pageSize}
        cataloguePromise={cataloguePromise}
        userSubjects={subjects}
        preferredSubjectId={activeSubjectId}
        timeZone={timeZone}
        historyError={historyError}
        initialPapers={papers}
        initialUntaggedPapers={untaggedPapers}
      >
        <PaperStageTaggerSlot />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h3 className="text-heading-3" style={{ margin: '0 0 var(--space-4) 0' }}>
            Full-paper history
          </h3>
          <PaperAttemptsListSlot
            emptyMessage={
              activeSubjectId
                ? 'No papers logged for this subject yet.'
                : 'No papers logged yet. Select Log Paper to record your first attempt.'
            }
          />
        </div>
      </LogsWorkspace>
    </div>
  )
}
