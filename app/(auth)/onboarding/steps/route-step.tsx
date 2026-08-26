'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Loader2, BookOpen, Layers, Award } from 'lucide-react'
import { setStudyRoutes, completeOnboarding } from '@/lib/actions/onboarding'
import { createClient } from '@/lib/supabase/client'
import PaperSelectionPanel, { getMathsCombinations } from '@/components/subjects/paper-selection-panel'
import type { UserSubjectWithSubject, StudyRoute, PaperSelectionInput } from '@/types'

interface SubjectRouteEntry {
  subjectId: string
  route: StudyRoute
  paperSelections: PaperSelectionInput[]
}

const ROUTE_OPTIONS: Array<{
  id: StudyRoute
  title: string
  subtitle: string
  description: string
  icon: typeof BookOpen
}> = [
  {
    id: 'as_only',
    title: 'AS Level Only',
    subtitle: '1-Year Standalone',
    description: 'Studying AS qualification only. A2 content will stay hidden.',
    icon: BookOpen,
  },
  {
    id: 'staged',
    title: 'Staged A Level',
    subtitle: 'AS in Year 1, A2 in Year 2',
    description: 'AS chapters first. You will unlock A2 with your AS results.',
    icon: Layers,
  },
  {
    id: 'full_level',
    title: 'Full A Level (Linear)',
    subtitle: 'All papers in one series',
    description: 'Both AS and A2 chapters are unlocked immediately.',
    icon: Award,
  },
]

export default function RouteStep({ subjectIds }: { subjectIds: string[] }) {
  const [userSubjects, setUserSubjects] = useState<UserSubjectWithSubject[]>([])
  const [entries, setEntries]           = useState<Record<string, SubjectRouteEntry>>({})
  const [loading, setLoading]           = useState(true)
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return

      let query = supabase
        .from('user_subjects')
        .select('*, subjects(*)')
        .eq('user_id', user.id)

      if (subjectIds.length > 0) {
        query = query.in('subject_id', subjectIds)
      }

      query.then(({ data }) => {
        const rows = (data as UserSubjectWithSubject[]) ?? []
        setUserSubjects(rows)

        const initial: Record<string, SubjectRouteEntry> = {}
        rows.forEach((r) => {
          const defaultRoute: StudyRoute =
            r.study_route && r.study_route !== 'unconfirmed'
              ? r.study_route
              : 'staged'

          const isMaths = r.subjects.code === '9709'
          const defaultMathsSelections = isMaths
            ? getMathsCombinations(defaultRoute)[0]?.selections ?? []
            : []

          initial[r.subject_id] = {
            subjectId: r.subject_id,
            route: defaultRoute,
            paperSelections: defaultMathsSelections,
          }
        })
        setEntries(initial)
        setLoading(false)
      })
    })
  }, [subjectIds])

  const handleRouteChange = (subjectId: string, route: StudyRoute, subjectCode?: string | null) => {
    const isMaths = subjectCode === '9709'
    const defaultSelections = isMaths ? getMathsCombinations(route)[0]?.selections ?? [] : []

    setEntries((prev) => ({
      ...prev,
      [subjectId]: {
        ...prev[subjectId],
        route,
        paperSelections: defaultSelections,
      },
    }))
  }

  const handlePaperSelectionsChange = (subjectId: string, selections: PaperSelectionInput[]) => {
    setEntries((prev) => ({
      ...prev,
      [subjectId]: {
        ...prev[subjectId],
        paperSelections: selections,
      },
    }))
  }

  const handleSubmit = async () => {
    setError('')
    const routesToSet = Object.values(entries).map((e) => ({
      subjectId: e.subjectId,
      route: (e.route === 'unconfirmed' ? 'staged' : e.route) as 'as_only' | 'staged' | 'full_level',
      paperSelections: e.paperSelections,
    }))

    setSubmitting(true)
    const result = await setStudyRoutes(routesToSet)
    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      return
    }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    await completeOnboarding(timeZone) // redirects internally to /dashboard
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Loader2 size={24} style={{ color: 'var(--accent-primary)', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center' }}>
        Select your study route for each subject. You can change this anytime.
      </p>

      {/* Subject rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {userSubjects.map((us, i) => {
          const subject = us.subjects
          const entry = entries[us.subject_id] ?? {
            subjectId: us.subject_id,
            route: 'staged',
            paperSelections: [],
          }
          const isMaths = subject.code === '9709'

          return (
            <motion.div
              key={us.subject_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                padding: '16px 18px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-overlay)',
                border: `1px solid ${subject.color_hex}30`,
              }}
            >
              {/* Subject Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: subject.color_hex,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {subject.name} {subject.code ? `(${subject.code})` : ''}
                </span>
              </div>

              {/* Route options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ROUTE_OPTIONS.map((opt) => {
                  const isSelected = entry.route === opt.id
                  const Icon = opt.icon
                  return (
                    <div
                      key={opt.id}
                      onClick={() => handleRouteChange(us.subject_id, opt.id, subject.code)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: `1.5px solid ${isSelected ? subject.color_hex : 'var(--border-subtle)'}`,
                        background: isSelected ? `${subject.color_hex}15` : 'var(--bg-base)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        transition: 'all 150ms ease',
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 'var(--radius-sm)',
                          background: isSelected ? `${subject.color_hex}25` : 'var(--bg-overlay)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isSelected ? subject.color_hex : 'var(--text-muted)',
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={15} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {opt.title}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {opt.subtitle}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Paper Selection (Maths) */}
              {isMaths && (
                <PaperSelectionPanel
                  subjectCode={subject.code}
                  route={entry.route}
                  initialSelections={entry.paperSelections}
                  onChange={(sels) => handlePaperSelectionsChange(us.subject_id, sels)}
                />
              )}
            </motion.div>
          )
        })}
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ fontSize: '0.8125rem', color: 'var(--danger)', textAlign: 'center' }}
        >
          {error}
        </motion.p>
      )}

      <motion.button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="btn btn-primary"
        whileHover={{ scale: 1.02, y: -1 }}
        whileTap={{ scale: 0.97 }}
        style={{ width: '100%', height: 52, fontSize: '1rem', marginTop: 4 }}
      >
        {submitting ? (
          <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
        ) : (
          '🚀  Launch Atlas'
        )}
      </motion.button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
