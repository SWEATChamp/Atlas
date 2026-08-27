export function formatExamCountdown(daysUntil: number | null | undefined): string | null {
  if (typeof daysUntil !== 'number' || !Number.isFinite(daysUntil)) return null
  if (daysUntil < 0) return 'Exam passed'
  if (daysUntil === 0) return 'Today!'
  return `${daysUntil}d`
}
