import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  Calculator, Sigma, Zap, FlaskConical, Leaf, Code2, TrendingUp,
  BookOpen, Globe, Type, BookMarked, Brain, Users, Briefcase,
  Receipt, Scale, Film, Waves, GraduationCap, ArrowLeft,
  CheckCircle2, Clock, Circle,
  type LucideIcon,
} from 'lucide-react'
import { getSubjectDetail } from '@/lib/actions/subjects'
import ChapterGroups from '@/components/subjects/chapter-groups'
import ReadinessBar from '@/components/subjects/readiness-bar'
import TargetGradePicker from '@/components/subjects/target-grade-picker'
import ExamDatePicker from '@/components/subjects/exam-date-picker'

const ICON_MAP: Record<string, LucideIcon> = {
  Calculator, Sigma, Zap, FlaskConical, Leaf, Code2, TrendingUp,
  BookOpen, Globe, Type, BookMarked, Brain, Users, Briefcase,
  Receipt, Scale, Film, Waves,
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subjectId: string }>
}): Promise<Metadata> {
  const { subjectId } = await params
  const data = await getSubjectDetail(subjectId)
  return { title: data?.subject.name ?? 'Subject' }
}

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ subjectId: string }>
}) {
  const { subjectId } = await params
  const data = await getSubjectDetail(subjectId)
  if (!data) notFound()

  const { subject, enrollment, groups, totalChapters, completedChapters, inProgressChapters, avgConfidence, readiness, daysUntilExam } = data
  const Icon = ICON_MAP[subject.icon] ?? GraduationCap

  const examLabel = daysUntilExam !== null
    ? daysUntilExam < 0
      ? 'Exam passed'
      : daysUntilExam === 0
      ? 'Exam today!'
      : `${daysUntilExam} days until exam`
    : null

  const examColor = daysUntilExam !== null && daysUntilExam <= 14
    ? 'var(--danger)'
    : daysUntilExam !== null && daysUntilExam <= 60
    ? 'var(--warning)'
    : 'var(--text-muted)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 780 }}>

      {/* Back link */}
      <Link
        href="/subjects"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--text-muted)',
          fontSize: '0.875rem',
          textDecoration: 'none',
          fontWeight: 500,
        }}
      >
        <ArrowLeft size={15} />
        All subjects
      </Link>

      {/* Subject header card */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: `1px solid ${subject.color_hex}25`,
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        <div style={{ height: 5, background: `linear-gradient(90deg, ${subject.color_hex}, ${subject.color_hex}60)` }} />
        <div style={{ padding: '24px 28px' }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 'var(--radius-md)',
                background: `${subject.color_hex}18`,
                border: `1px solid ${subject.color_hex}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={24} color={subject.color_hex} strokeWidth={2} />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>
                {subject.name}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                {subject.code && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{subject.code}</span>}
                <TargetGradePicker
                  subjectId={subject.id}
                  currentGrade={enrollment.target_grade}
                  color={subject.color_hex}
                />
                <ExamDatePicker
                  subjectId={subject.id}
                  currentDate={enrollment.exam_date}
                  countdownLabel={examLabel}
                  countdownColor={examColor}
                />
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { icon: <CheckCircle2 size={14} color="var(--success)" />, label: `${completedChapters} complete`, color: 'var(--success)' },
              { icon: <Clock size={14} color="var(--warning)" />, label: `${inProgressChapters} in progress`, color: 'var(--warning)' },
              { icon: <Circle size={14} color="var(--text-muted)" />, label: `${totalChapters - completedChapters - inProgressChapters} not started`, color: 'var(--text-muted)' },
              ...(avgConfidence !== null
                ? [{ icon: <span style={{ fontSize: '0.8rem' }}>⭐</span>, label: `${avgConfidence.toFixed(1)}/5 confidence`, color: 'var(--text-secondary)' }]
                : []),
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {s.icon}
                <span style={{ fontSize: '0.8rem', color: s.color, fontWeight: 500 }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Readiness bar */}
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
              Readiness score
            </div>
            <ReadinessBar value={readiness} height={8} />
          </div>
        </div>
      </div>

      {/* Chapter groups — ChapterGroups handles Maths combination picker */}
      <ChapterGroups
        subjectId={subject.id}
        isMaths={subject.code === '9709'}
        groups={groups}
        subjectColor={subject.color_hex}
      />
    </div>
  )
}
