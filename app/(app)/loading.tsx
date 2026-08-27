function SkeletonBlock({
  height,
  width = '100%',
}: {
  height: number
  width?: string | number
}) {
  return (
    <div
      className="skeleton"
      style={{ height, width, borderRadius: 'var(--radius-md)' }}
    />
  )
}

export default function AppLoading() {
  return (
    <div
      aria-label="Loading page"
      role="status"
      style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 920 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SkeletonBlock height={30} width={220} />
        <SkeletonBlock height={14} width={300} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 280px',
          gap: 20,
          alignItems: 'start',
        }}
      >
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonBlock height={22} width={180} />
          <SkeletonBlock height={68} />
          <SkeletonBlock height={68} />
          <SkeletonBlock height={68} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <SkeletonBlock height={18} width={120} />
            <div style={{ height: 16 }} />
            <SkeletonBlock height={64} />
          </div>
          <div className="card">
            <SkeletonBlock height={18} width={110} />
            <div style={{ height: 16 }} />
            <SkeletonBlock height={48} />
          </div>
        </div>
      </div>
    </div>
  )
}
