export function formatExamCountdown(daysUntil: number | null | undefined): string | null {
  if (typeof daysUntil !== 'number' || !Number.isFinite(daysUntil)) return null
  if (daysUntil < 0) return 'Exam passed'
  if (daysUntil === 0) return 'Today!'
  return `${daysUntil}d`
}

export type ExamDateCoverage = 'all' | 'some' | 'none'

export function getExamDateCoverage(
  examDates: Array<string | null | undefined>
): ExamDateCoverage {
  if (examDates.length === 0 || examDates.every((date) => !date)) return 'none'
  if (examDates.every(Boolean)) return 'all'
  return 'some'
}
