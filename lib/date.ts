const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function safeTimeZone(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone) ? timeZone : 'UTC'
}

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false

  try {
    new Intl.DateTimeFormat('en', { timeZone }).format()
    return true
  } catch {
    return false
  }
}

export function dateInTimeZone(date: Date, timeZone: string | null | undefined): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function hourInTimeZone(date: Date, timeZone: string | null | undefined): number {
  const hour = new Intl.DateTimeFormat('en', {
    timeZone: safeTimeZone(timeZone),
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).find(part => part.type === 'hour')?.value

  return Number(hour ?? 0)
}

function dateOnlyToUtcMilliseconds(value: string): number | null {
  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) return null

  const [, year, month, day] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day))
}

export function daysUntilDate(
  date: string | null,
  timeZone: string | null | undefined,
  now = new Date()
): number | null {
  if (!date) return null

  const examDay = dateOnlyToUtcMilliseconds(date)
  const today = dateOnlyToUtcMilliseconds(dateInTimeZone(now, timeZone))
  if (examDay === null || today === null) return null

  return Math.round((examDay - today) / 86_400_000)
}

export function formatDateOnly(
  value: string,
  options: Intl.DateTimeFormatOptions,
  locale = 'en-GB'
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}
