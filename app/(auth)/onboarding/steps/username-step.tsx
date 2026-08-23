'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { setUsername, checkUsernameAvailability } from '@/lib/actions/onboarding'

interface Props { onNext: () => void }

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

export default function UsernameStep({ onNext }: Props) {
  const [value, setValue] = useState('')
  const [availability, setAvailability] = useState<Availability>('idle')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced availability check
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setError('')

    if (value.length < 3) {
      setAvailability('idle')
      return
    }

    const valid = /^[a-zA-Z0-9_]+$/.test(value) && value.length <= 30
    if (!valid) {
      setAvailability('invalid')
      return
    }

    setAvailability('checking')
    debounceRef.current = setTimeout(async () => {
      const ok = await checkUsernameAvailability(value)
      setAvailability(ok ? 'available' : 'taken')
    }, 500)
  }, [value])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (availability !== 'available' || loading) return

    setLoading(true)
    const result = await setUsername(value)
    setLoading(false)

    if (result.error) {
      setError(result.error)
      setAvailability('taken')
      return
    }

    onNext()
  }

  const inputClass = `input ${
    availability === 'invalid' || availability === 'taken' || error
      ? 'input--error'
      : availability === 'available'
      ? 'input--success'
      : ''
  }`

  const statusIcon = () => {
    if (availability === 'checking')
      return <Loader2 size={16} style={{ color: 'var(--text-muted)', animation: 'spin 0.8s linear infinite' }} />
    if (availability === 'available')
      return <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
    if (availability === 'taken' || availability === 'invalid')
      return <XCircle size={16} style={{ color: 'var(--danger)' }} />
    return null
  }

  const statusText = () => {
    if (error) return error
    if (availability === 'checking') return 'Checking availability…'
    if (availability === 'available') return `@${value} is available!`
    if (availability === 'taken') return 'Username is already taken'
    if (availability === 'invalid')
      return 'Letters, numbers, and underscores only (3–30 chars)'
    return 'This is your public handle — choose wisely.'
  }

  const statusColor =
    availability === 'available'
      ? 'var(--success)'
      : availability === 'taken' || availability === 'invalid' || error
      ? 'var(--danger)'
      : 'var(--text-muted)'

  const canSubmit = availability === 'available' && !loading

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ position: 'relative' }}>
          <input
            id="username"
            className={inputClass}
            type="text"
            placeholder="e.g. sweatchamp"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={30}
            autoComplete="off"
            autoFocus
            style={{ paddingRight: 44 }}
          />
          {value.length > 0 && (
            <div
              style={{
                position: 'absolute',
                right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              {statusIcon()}
            </div>
          )}
        </div>

        <motion.p
          key={availability + error}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginTop: 8,
            fontSize: '0.8125rem',
            color: statusColor,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {statusText()}
        </motion.p>
      </div>

      <motion.button
        type="submit"
        disabled={!canSubmit}
        className="btn btn-primary"
        whileHover={canSubmit ? { scale: 1.02, y: -1 } : {}}
        whileTap={canSubmit ? { scale: 0.97 } : {}}
        style={{ width: '100%', height: 52, fontSize: '1rem' }}
      >
        {loading ? (
          <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
        ) : (
          'Continue'
        )}
      </motion.button>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </form>
  )
}
