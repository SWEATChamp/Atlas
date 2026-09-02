'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, BookOpen, Plus, Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
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
        className="btn btn-primary touch-target-btn"
        style={{ minHeight: 44, padding: '0 16px' }}
        onClick={() => {
          setError(null)
          setIsOpen(true)
        }}
      >
        <Plus size={17} />
        <span>Add or remove</span>
      </button>

      <Dialog
        isOpen={isOpen}
        onClose={closeManager}
        titleId="subject-manager-title"
        descriptionId={confirmingRemoval ? 'subject-removal-impact' : undefined}
        maxWidth={580}
        showCloseButton
        closeButtonAriaLabel="Close subject manager"
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div
            style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              paddingRight: 48,
            }}
          >
            <h2
              id="subject-manager-title"
              style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}
            >
              {confirmingRemoval ? `Remove ${confirmingRemoval.subject.name}?` : 'Manage subjects'}
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {confirmingRemoval
                ? 'This removes it from your active study plan.'
                : `${activeSubjects.length} of ${MAX_ACTIVE_SUBJECTS} active subjects`}
            </p>
          </div>

          {confirmingRemoval ? (
            <div style={{ padding: 20 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 14,
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(199, 123, 123, 0.1)',
                  border: '1px solid rgba(199, 123, 123, 0.25)',
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-ghost touch-target-btn"
                  style={{ minHeight: 44, padding: '0 16px' }}
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
                  className="btn btn-danger touch-target-btn"
                  style={{ minHeight: 44, padding: '0 18px' }}
                  onClick={handleRemove}
                  disabled={isPending}
                >
                  <Trash2 size={16} />
                  <span>{isPending ? 'Removing...' : 'Remove subject'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {error && (
                <p
                  role="alert"
                  style={{
                    margin: 0,
                    padding: '10px 12px',
                    color: 'var(--danger)',
                    background: 'rgba(199, 123, 123, 0.1)',
                    border: '1px solid rgba(199, 123, 123, 0.25)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.82rem',
                  }}
                >
                  {error}
                </p>
              )}

              <div>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
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
                          <div style={{ color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: 600 }}>
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
                        className="btn btn-ghost touch-target-btn"
                        style={{ minHeight: 44, padding: '0 12px', color: 'var(--danger)' }}
                        onClick={() => {
                          setError(null)
                          setConfirmingRemoval({ enrollment, subject })
                        }}
                        disabled={!mayRemove || isPending}
                        title={!mayRemove ? 'Keep at least one active subject' : `Remove ${subject.name}`}
                      >
                        <Trash2 size={15} />
                        <span>Remove</span>
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
                <h3 style={{ margin: '0 0 10px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
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
                            <div style={{ color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: 600 }}>
                              {subject.name}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                              {subject.code}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary touch-target-btn"
                          style={{ minHeight: 44, padding: '0 16px' }}
                          onClick={() => handleAdd(subject)}
                          disabled={!mayAdd || isPending}
                        >
                          <Plus size={15} />
                          <span>{isPending && pendingSubjectId === subject.id ? 'Adding...' : 'Add'}</span>
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
                      fontSize: '0.8125rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                    }}
                  >
                    <BookOpen size={17} />
                    <span>All currently supported subjects are already active.</span>
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
        </div>
      </Dialog>
    </>
  )
}
