/**
 * ReadinessBar — reusable progress bar for readiness scores.
 * Colour shifts: red < 40%, amber 40–69%, green 70%+
 */
export default function ReadinessBar({
  value,
  showLabel = true,
  height = 6,
}: {
  value: number
  showLabel?: boolean
  height?: number
}) {
  const pct = Math.min(100, Math.max(0, value))

  const color =
    pct >= 70
      ? 'var(--success)'
      : pct >= 40
      ? 'var(--warning)'
      : pct > 0
      ? 'var(--danger)'
      : 'var(--border-muted)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          flex: 1,
          height,
          background: 'var(--bg-active)',
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: 999,
            transition: 'width 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            boxShadow: pct > 0 ? `0 0 8px ${color}60` : 'none',
          }}
        />
      </div>
      {showLabel && (
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color,
            minWidth: 34,
            textAlign: 'right',
          }}
        >
          {pct}%
        </span>
      )}
    </div>
  )
}
