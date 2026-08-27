'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Check, Loader2, Search,
  Calculator, Sigma, Zap, FlaskConical, Leaf, Code2, TrendingUp,
  BookOpen, Globe, Type, BookMarked, Brain, Users, Briefcase,
  Receipt, Scale, Film, Waves,
  type LucideIcon,
} from 'lucide-react'
import { enrollSubjects } from '@/lib/actions/onboarding'
import { createClient } from '@/lib/supabase/client'
import type { Subject } from '@/types'

/** Maps the icon string stored in the DB to a Lucide component */
const ICON_MAP: Record<string, LucideIcon> = {
  Calculator, Sigma, Zap, FlaskConical, Leaf, Code2, TrendingUp,
  BookOpen, Globe, Type, BookMarked, Brain, Users, Briefcase,
  Receipt, Scale, Film, Waves,
}

function SubjectIcon({ name, color }: { name: string; color: string }) {
  const Icon = ICON_MAP[name]
  if (!Icon) return <span style={{ fontSize: '1rem' }}>📚</span>
  return <Icon size={18} color={color} strokeWidth={2} />
}

interface Props { onNext: (subjectIds: string[]) => void }

export function filterSubjectsByQuery(subjects: Subject[], query: string): Subject[] {
  const q = query.toLowerCase().trim()
  if (!q) return subjects
  return subjects.filter((s) => {
    if (s.name.toLowerCase().includes(q)) return true
    if (s.code && s.code.toLowerCase().includes(q)) return true
    if ((q.includes('additional') || q.includes('add math')) && s.code === '9231') return true
    return false
  })
}

export default function SubjectsStep({ onNext }: Props) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('subjects').select('*').eq('is_global', true).eq('is_available', true).order('name'),
      supabase.from('user_subjects').select('subject_id').eq('is_archived', false),
    ]).then(([subjectsRes, userSubjectsRes]) => {
      const availableSubjects = subjectsRes.data ?? []
      setSubjects(availableSubjects)
      if (userSubjectsRes.data && userSubjectsRes.data.length > 0) {
        const availableSubjectIds = new Set(availableSubjects.map((s) => s.id))
        const preselectedMvpIds = userSubjectsRes.data
          .map((us) => us.subject_id)
          .filter((id) => availableSubjectIds.has(id))
        setSelected(preselectedMvpIds)
      }
      setLoading(false)
    })
  }, [])

  const filtered = filterSubjectsByQuery(subjects, query)

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleSubmit = async () => {
    if (selected.length === 0 || submitting) return
    setSubmitting(true)
    const result = await enrollSubjects(selected)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onNext(selected)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center' }}>
        Select the subjects you&apos;re sitting for A-Level. You can add more later.
      </p>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }}
        />
        <input
          className="input"
          type="text"
          placeholder="Search subjects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ paddingLeft: 40 }}
        />
      </div>

      {/* Subject grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 10,
            maxHeight: 320,
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {filtered.map((subject) => {
            const isSelected = selected.includes(subject.id)
            return (
              <motion.button
                key={subject.id}
                type="button"
                onClick={() => toggle(subject.id)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${isSelected ? subject.color_hex : 'var(--border-subtle)'}`,
                  background: isSelected
                    ? `${subject.color_hex}18`
                    : 'var(--bg-overlay)',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  textAlign: 'left',
                  position: 'relative',
                }}
              >
                <SubjectIcon name={subject.icon} color={isSelected ? subject.color_hex : 'var(--text-muted)'} />
                <span
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: isSelected ? subject.color_hex : 'var(--text-secondary)',
                    flex: 1,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {subject.name}
                </span>
                {isSelected && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{ color: subject.color_hex }}
                  >
                    <Check size={14} />
                  </motion.span>
                )}
              </motion.button>
            )
          })}
        </div>
      )}

      {/* Selection count */}
      {selected.length > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ fontSize: '0.8125rem', color: 'var(--accent-secondary)', textAlign: 'center' }}
        >
          {selected.length} subject{selected.length !== 1 ? 's' : ''} selected
        </motion.p>
      )}

      {error && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--danger)', textAlign: 'center' }}>
          {error}
        </p>
      )}

      <motion.button
        type="button"
        onClick={handleSubmit}
        disabled={selected.length === 0 || submitting}
        className="btn btn-primary"
        whileHover={selected.length > 0 ? { scale: 1.02, y: -1 } : {}}
        whileTap={selected.length > 0 ? { scale: 0.97 } : {}}
        style={{ width: '100%', height: 52, fontSize: '1rem' }}
      >
        {submitting ? (
          <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
        ) : (
          `Continue with ${selected.length || 0} subject${selected.length !== 1 ? 's' : ''}`
        )}
      </motion.button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
