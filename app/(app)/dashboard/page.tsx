import type { Metadata } from 'next'
import { getDashboardData } from '@/lib/actions/dashboard'
import DashboardView from '@/components/dashboard/dashboard-view'
import type { Subject, UserSubject } from '@/types'

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--text-muted)' }}>
        Failed to load dashboard. Please refresh.
      </div>
    )
  }

  const { subject_readiness } = data

  const unconfirmedSubjects = subject_readiness
    .filter((s) => s.study_route === 'unconfirmed')
    .map((s) => ({
      enrollment: {
        id: s.user_subject_id || s.subject_id,
        user_id: '',
        subject_id: s.subject_id,
        exam_date: s.exam_date,
        target_grade: null,
        priority: 1,
        is_archived: false,
        study_route: s.study_route,
        current_stage: s.current_stage,
        a2_unlocked_at: null,
        a2_unlock_method: null,
        created_at: '',
        updated_at: '',
      } as UserSubject,
      subject: {
        id: s.subject_id,
        name: s.subject_name,
        code: null,
        color_hex: s.color_hex,
        icon: 'BookOpen',
        is_global: true,
        created_by: null,
        created_at: '',
      } as Subject,
    }))

  return (
    <DashboardView
      initialData={data}
      unconfirmedSubjects={unconfirmedSubjects}
    />
  )
}
