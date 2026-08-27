'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, BookOpen, Plus, Trash2, X } from 'lucide-react'
import {
  addSubjectEnrollment,
  archiveSubjectEnrollment,
  type SubjectWithProgress,
} from '@/lib/actions/subjects'
import {
  MAX_ACTIVE_SUBJECTS,
  canAddSubject,
  canRemoveSubject,
  getRemovalImpactMessage,
} from '@/lib/subject-management'
import type { Subject } from '@/types'

interface SubjectManagerProps {
  activeSubjects: SubjectWithProgress[]
  availableSubjects: Subject[]
}

type ManagedEnrollment = Pick<SubjectWithProgress, 'enrollment' | 'subject'>

export default function SubjectManager({
  activeSubjects,
  availableSubjects,
}: SubjectManagerProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [confirmingRemoval, setConfirmingRemoval] = useState<ManagedEnrollment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingSubjectId, setPendingSubjectId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const activeSubjectIds = new Set(activeSubjects.map(({ subject }) => subject.id))
  const addableSubjects = availableSubjects.filter((subject) => !activeSubjectIds.has(subject.id))
  const mayAdd = canAddSubject(activeSubjects.length)
  const mayRemove = canRemoveSubject(activeSubjects.length)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        setConfirmingRemoval(null)
        setError(null)
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isPending])

  const closeManager = () => {
    if (isPending) return
    setConfirmingRemoval(null)
    setError(null)
    setIsOpen(false)
  }

  const handleAdd = (subject: Subject) => {
    setError(null)
    setPendingSubjectId(subject.id)

    startTransition(async () => {
      const result = await addSubjectEnrollment(subject.id)
      if (result.error) {
        setError(result.error)
        setPendingSubjectId(null)
        return
      }

      setPendingSubjectId(null)
      setIsOpen(false)
      router.refresh()
    })
  }

  const handleRemove = () => {
    if (!confirmingRemoval) return

    setError(null)
    setPendingSubjectId(confirmingRemoval.subject.id)

    startTransition(async () => {
      const result = await archiveSubjectEnrollment(confirmingRemoval.enrollment.id)
      if (result.error) {
        setError(result.error)
        setPendingSubjectId(null)
        return
      }

      setPendingSubjectId(null)
      setConfirmingRemoval(null)
      setIsOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          setError(null)
          setIsOpen(true)
        }}
      >
        <Plus size={17} />
        Add or remove
      </button>

      {isOpen && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeManager()
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="subject-manager-title"
            aria-describedby={confirmingRemoval ? 'subject-removal-impact' : undefined}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: 580,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div>
                <h2
                  id="subject-manager-title"
                  style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}
                >
                  {confirmingRemoval ? `Remove ${confirmingRemoval.subject.name}?` : 'Manage subjects'}
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  {confirmingRemoval
                    ? 'This removes it from your active study plan.'
                    : `${activeSubjects.length} of ${MAX_ACTIVE_SUBJECTS} active subjects`}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close subject manager"
                onClick={closeManager}
                disabled={isPending}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  padding: 4,
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <X size={19} />
              </button>
            </div>

            {confirmingRemoval ? (
              <div style={{ padding: 24 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: 16,
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(248, 113, 113, 0.08)',
                    border: '1px solid rgba(248, 113, 113, 0.22)',
                  }}
                >
                  <AlertTriangle size={20} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p
                    id="subject-removal-impact"
                    style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.55 }}
                  >
                    {getRemovalImpactMessage(confirmingRemoval.subject.is_available)}
                  </p>
                </div>

                {error && (
                  <p role="alert" style={{ margin: '14px 0 0', color: 'var(--danger)', fontSize: '0.82rem' }}>
                    {error}
                  </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setError(null)
                      setConfirmingRemoval(null)
                    }}
                    disabled={isPending}
                  >
                    Keep subject
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleRemove}
                    disabled={isPending}
                  >
                    <Trash2 size={16} />
                    {isPending ? 'Removing...' : 'Remove subject'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
                {error && (
                  <p
                    role="alert"
                    style={{
                      margin: 0,
                      padding: '10px 12px',
                      color: 'var(--danger)',
                      background: 'rgba(248, 113, 113, 0.08)',
                      border: '1px solid rgba(248, 113, 113, 0.2)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.82rem',
                    }}
                  >
                    {error}
                  </p>
                )}

                <div>
                  <h3 style={{ margin: '0 0 10px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Active subjects
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {activeSubjects.map(({ enrollment, subject }) => (
                      <div
                        key={enrollment.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '12px 14px',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-elevated)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span
                            aria-hidden="true"
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: subject.color_hex,
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 600 }}>
                              {subject.name}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                              {subject.code ?? 'Custom subject'}
                              {!subject.is_available ? ' · Legacy enrolment' : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ height: 36, paddingInline: 12, color: 'var(--danger)' }}
                          onClick={() => {
                            setError(null)
                            setConfirmingRemoval({ enrollment, subject })
                          }}
                          disabled={!mayRemove || isPending}
                          title={!mayRemove ? 'Keep at least one active subject' : `Remove ${subject.name}`}
                        >
                          <Trash2 size={15} />
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  {!mayRemove && (
                    <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Keep at least one subject in your study plan.
                    </p>
                  )}
                </div>

                <div>
                  <h3 style={{ margin: '0 0 10px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Add a supported subject
                  </h3>
                  {addableSubjects.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {addableSubjects.map((subject) => (
                        <div
                          key={subject.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '12px 14px',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-elevated)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              aria-hidden="true"
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                background: subject.color_hex,
                              }}
                            />
                            <div>
                              <div style={{ color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 600 }}>
                                {subject.name}
                              </div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                {subject.code}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ height: 36, paddingInline: 14 }}
                            onClick={() => handleAdd(subject)}
                            disabled={!mayAdd || isPending}
                          >
                            <Plus size={15} />
                            {isPending && pendingSubjectId === subject.id ? 'Adding...' : 'Add'}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: 16,
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-muted)',
                        fontSize: '0.82rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                      }}
                    >
                      <BookOpen size={17} />
                      All currently supported subjects are already active.
                    </div>
                  )}
                  {!mayAdd && addableSubjects.length > 0 && (
                    <p style={{ margin: '8px 0 0', color: 'var(--warning)', fontSize: '0.75rem' }}>
                      You have reached the {MAX_ACTIVE_SUBJECTS}-subject limit. Remove one before adding another.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}
