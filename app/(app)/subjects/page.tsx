import type { Metadata } from 'next'
import { getSubjectsWithProgress } from '@/lib/actions/subjects'
import SubjectCard from '@/components/subjects/subject-card'
import RouteSelectionBanner from '@/components/subjects/route-selection-banner'
import { BookOpen } from 'lucide-react'

export const metadata: Metadata = { title: 'Subjects' }

export default async function SubjectsPage() {
  const subjects = await getSubjectsWithProgress()
  const unconfirmed = subjects.filter((s) => s.enrollment.study_route === 'unconfirmed')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Route selection prompt banner if any subject is unconfirmed */}
      {unconfirmed.length > 0 && (
        <RouteSelectionBanner
          unconfirmedSubjects={unconfirmed.map((s) => ({
            enrollment: s.enrollment,
            subject: s.subject,
          }))}
        />
      )}

      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>
          My Subjects
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {subjects.length} subject{subjects.length !== 1 ? 's' : ''} enrolled
        </p>
      </div>

      {subjects.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '64px 32px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <BookOpen size={40} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            No subjects enrolled. Complete onboarding to get started.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}
        >
          {subjects.map((s) => (
            <SubjectCard key={s.subject.id} data={s} />
          ))}
        </div>
      )}
    </div>
  )
}
