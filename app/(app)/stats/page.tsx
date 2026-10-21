import type { Metadata } from 'next'
import { getAuthenticatedContext } from '@/lib/supabase/authenticated'
import { getStatsOverviewData } from '@/lib/actions/practice-sessions'
import { StatsWorkspace } from '@/components/papers/stats-workspace'
import type { RawEnrollment } from '@/components/papers/async-study-indicators'

export const metadata: Metadata = {
  title: 'Stats & Analytics',
}

export default async function StatsPage(props: {
  searchParams?: Promise<{ subject?: string }>
}) {
  const searchParamsPromise: Promise<{ subject?: string }> =
    props.searchParams ?? Promise.resolve({})
  const [{ supabase, user }, sp] = await Promise.all([
    getAuthenticatedContext(),
    searchParamsPromise,
  ])
  if (!user) return null

  const activeSubjectId = sp.subject || null

  // Progressive server rendering: load top-level overview quickly without
  // blocking initial SSR on slower chapter evidence or readiness RPC calculations.
  const [userSubjectsData, overview] = await Promise.all([
    supabase
      .from('user_subjects')
      .select('id, subject_id, current_stage, study_route, is_archived, subjects(id, name, code, color_hex)')
      .eq('user_id', user.id)
      .eq('is_archived', false),
    getStatsOverviewData(activeSubjectId),
  ])

  const enrollments = (userSubjectsData.data || []) as unknown as RawEnrollment[]
  const subjects = enrollments
    .map(e => e.subjects)
    .filter((s): s is { id: string; name: string; color_hex: string; code?: string | null } => Boolean(s))
    .map(s => ({ id: s.id, name: s.name, color_hex: s.color_hex ?? '#3b82f6', code: s.code }))

  return (
    <StatsWorkspace
      userId={user.id}
      subjects={subjects}
      initialSubjectId={activeSubjectId}
      initialOverview={overview}
      initialChapterAccuracy={null}
      initialStudyIndicators={null}
      initialData={{
        ...overview,
        chapterAccuracy: [],
        studyIndicators: [],
      }}
    />
  )
}
