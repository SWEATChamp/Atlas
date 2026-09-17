import 'server-only'

import { APPROVED_CAMBRIDGE_HOSTS } from './cambridge-host-policy'
import type { CambridgeSeries } from './types'

export type DiscoverySeries = CambridgeSeries

export interface ExamSession {
  year: number
  series: DiscoverySeries
}

export type DiscoveryStatus =
  | 'available'
  | 'unavailable'
  | 'ambiguous'
  | 'index_unavailable'
  | 'invalid_link'
  | 'check_failed'

export type DiscoveryIssueCode =
  | 'not_found'
  | 'gone'
  | 'timeout'
  | 'network_error'
  | 'unapproved_host'
  | 'insecure_protocol'
  | 'too_many_redirects'
  | 'invalid_content_type'
  | 'oversized_content'
  | 'malformed_content_length'
  | 'mismatched_session'
  | 'mismatched_subject'
  | 'ambiguous_links'
  | 'unexpected_index_structure'
  | 'check_failed'

export interface DiscoveredPublicationCandidate {
  syllabusCode: string
  syllabusName: string
  year: number
  series: DiscoverySeries
  indexUrl: string
  pdfUrl: string
}

export interface SessionDiscoveryItem {
  year: number
  series: DiscoverySeries
  indexUrl: string
  status: DiscoveryStatus
  pdfUrl?: string
  issueCode?: DiscoveryIssueCode
}

export interface SubjectDiscoveryResult {
  syllabusCode: string
  syllabusName: string
  status: DiscoveryStatus
  latestPublication?: DiscoveredPublicationCandidate
  checkedSessions: SessionDiscoveryItem[]
  issueCode?: DiscoveryIssueCode
}

export interface PublicationDiscoveryReport {
  checkedAt: string
  sessionsChecked: ExamSession[]
  subjects: SubjectDiscoveryResult[]
  hasDiscoveryFailure: boolean
}

export interface SupportedDiscoverySubject {
  syllabusCode: string
  syllabusName: string
}

export const SUPPORTED_DISCOVERY_SUBJECTS: readonly SupportedDiscoverySubject[] = [
  { syllabusCode: '9709', syllabusName: 'Mathematics' },
  { syllabusCode: '9231', syllabusName: 'Further Mathematics' },
  { syllabusCode: '9702', syllabusName: 'Physics' },
  { syllabusCode: '9701', syllabusName: 'Chemistry' },
  { syllabusCode: '9618', syllabusName: 'Computer Science' },
] as const

export const DEFAULT_MAX_INDEX_HTML_BYTES = 5 * 1024 * 1024 // 5 MB
export const DEFAULT_MAX_REDIRECTS = 3
export const DEFAULT_INDEX_FETCH_TIMEOUT_MS = 10000 // 10 seconds

export interface FetchIndexHtmlOptions {
  maxBytes?: number
  maxRedirects?: number
  timeoutMs?: number
  fetchFn?: typeof fetch
}

export interface RollingDiscoveryOptions {
  pastSessions?: number
  futureSessions?: number
  minSession?: ExamSession
}

export interface DiscoverPublicationsOptions {
  sessions?: readonly ExamSession[]
  rollingOptions?: RollingDiscoveryOptions
  subjects?: readonly SupportedDiscoverySubject[]
  fetchIndexHtml?: (
    url: string,
    options?: FetchIndexHtmlOptions,
  ) => Promise<{ html: string; finalUrl: string }>
  fetchFn?: typeof fetch
  now?: () => Date
}

const SERIES_CHRONOLOGY: Record<DiscoverySeries, number> = {
  march: 1,
  june: 2,
  november: 3,
}

/**
 * Compares two exam sessions chronologically.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareSessions(a: ExamSession, b: ExamSession): number {
  if (a.year !== b.year) {
    return a.year - b.year
  }
  return SERIES_CHRONOLOGY[a.series] - SERIES_CHRONOLOGY[b.series]
}

/**
 * Returns the next examination session in chronological sequence.
 */
export function nextSession(session: ExamSession): ExamSession {
  if (session.series === 'march') return { year: session.year, series: 'june' }
  if (session.series === 'june') return { year: session.year, series: 'november' }
  return { year: session.year + 1, series: 'march' }
}

/**
 * Returns the previous examination session in chronological sequence.
 */
export function previousSession(session: ExamSession): ExamSession {
  if (session.series === 'november') return { year: session.year, series: 'june' }
  if (session.series === 'june') return { year: session.year, series: 'march' }
  return { year: session.year - 1, series: 'november' }
}

/**
 * Determines the current focal calendar session based on month of year.
 * Jan - Apr: march session
 * May - Aug: june session
 * Sep - Dec: november session
 */
export function getCurrentCalendarSession(now: Date): ExamSession {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  if (month <= 4) {
    return { year, series: 'march' }
  } else if (month <= 8) {
    return { year, series: 'june' }
  } else {
    return { year, series: 'november' }
  }
}

/**
 * Generates a deterministic, bounded rolling candidate session list based on the
 * injected clock time and the Cambridge March, June, and November calendar.
 */
export function generateRollingDiscoverySessions(
  now: Date,
  options?: RollingDiscoveryOptions,
): ExamSession[] {
  const pastCount = options?.pastSessions ?? 3
  const futureCount = options?.futureSessions ?? 1
  const minSession = options?.minSession

  const current = getCurrentCalendarSession(now)

  const sessions: ExamSession[] = []
  let s: ExamSession = current
  for (let i = 0; i < pastCount; i++) {
    s = previousSession(s)
    sessions.unshift(s)
  }

  sessions.push(current)

  s = current
  for (let i = 0; i < futureCount; i++) {
    s = nextSession(s)
    sessions.push(s)
  }

  let result = sessions
  if (minSession) {
    result = result.filter((item) => compareSessions(item, minSession) >= 0)
  }

  return result.sort(compareSessions)
}

/**
 * Generates the official series index URL for Cambridge International AS & A Level.
 */
export function buildSeriesIndexUrl(session: ExamSession): string {
  return `https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/grade-threshold-tables/${session.series}-${session.year}/`
}

/**
 * Structured error class containing safe issue codes without raw internal details.
 */
export class CambridgeFetchError extends Error {
  readonly issueCode: DiscoveryIssueCode
  readonly httpStatus?: number

  constructor(message: string, issueCode: DiscoveryIssueCode, httpStatus?: number) {
    super(message)
    this.name = 'CambridgeFetchError'
    this.issueCode = issueCode
    this.httpStatus = httpStatus
  }
}

function validateCambridgeUrl(urlString: string): URL {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    throw new CambridgeFetchError(`Malformed URL "${urlString}"`, 'check_failed')
  }

  if (parsed.protocol !== 'https:') {
    throw new CambridgeFetchError(
      `Insecure protocol "${parsed.protocol}" not allowed; must be https:`,
      'insecure_protocol',
    )
  }
  if (!APPROVED_CAMBRIDGE_HOSTS.has(parsed.hostname)) {
    throw new CambridgeFetchError(
      `Unapproved host "${parsed.hostname}"; only Cambridge hosts are permitted`,
      'unapproved_host',
    )
  }
  return parsed
}

/**
 * Securely fetches an official Cambridge index HTML page with protocol enforcement,
 * host allowlisting, redirect limits and re-validation, content-type checks,
 * streamed byte-level counting, and active abort timeouts.
 */
export async function fetchCambridgeIndexHtml(
  url: string,
  options?: FetchIndexHtmlOptions,
): Promise<{ html: string; finalUrl: string }> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_INDEX_HTML_BYTES
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const timeoutMs = options?.timeoutMs ?? DEFAULT_INDEX_FETCH_TIMEOUT_MS
  const fetchFn = options?.fetchFn ?? fetch

  let currentUrl = url
  let redirects = 0

  while (true) {
    validateCambridgeUrl(currentUrl)

    const controller = new AbortController()
    let isTimeout = false
    const timeoutId = setTimeout(() => {
      isTimeout = true
      controller.abort()
    }, timeoutMs)

    let response: Response
    try {
      response = await fetchFn(currentUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'AtlasGradeThresholdDiscovery/1.0',
        },
        redirect: 'manual',
        signal: controller.signal,
      })
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      if (isTimeout || controller.signal.aborted) {
        throw new CambridgeFetchError(
          `Index fetch timed out after ${timeoutMs}ms for "${currentUrl}"`,
          'timeout',
        )
      }
      throw new CambridgeFetchError(
        `Network error fetching "${currentUrl}": ${err instanceof Error ? err.message : String(err)}`,
        'network_error',
      )
    }

    if (response.status >= 300 && response.status < 400) {
      clearTimeout(timeoutId)
      const location = response.headers.get('location')
      if (!location) {
        throw new CambridgeFetchError(
          `Redirect missing Location header from "${currentUrl}"`,
          'check_failed',
        )
      }
      redirects++
      if (redirects > maxRedirects) {
        throw new CambridgeFetchError(
          `Too many redirects (limit ${maxRedirects}) from "${url}"`,
          'too_many_redirects',
        )
      }
      const nextUrl = new URL(location, currentUrl).toString()
      validateCambridgeUrl(nextUrl)
      currentUrl = nextUrl
      continue
    }

    if (response.status === 404) {
      clearTimeout(timeoutId)
      throw new CambridgeFetchError(`HTTP status 404: Not Found`, 'not_found', 404)
    }
    if (response.status === 410) {
      clearTimeout(timeoutId)
      throw new CambridgeFetchError(`HTTP status 410: Gone`, 'gone', 410)
    }
    if (!response.ok) {
      clearTimeout(timeoutId)
      throw new CambridgeFetchError(
        `HTTP status ${response.status}`,
        'check_failed',
        response.status,
      )
    }

    const contentType = response.headers.get('content-type') ?? ''
    const mimeType = contentType.split(';', 1)[0].trim().toLowerCase()
    if (mimeType !== 'text/html') {
      clearTimeout(timeoutId)
      throw new CambridgeFetchError(
        `Invalid content-type "${contentType}"; expected text/html`,
        'invalid_content_type',
      )
    }

    const contentLengthHeader = response.headers.get('content-length')
    if (contentLengthHeader !== null) {
      const trimmed = contentLengthHeader.trim()
      if (!/^\d+$/.test(trimmed)) {
        clearTimeout(timeoutId)
        throw new CambridgeFetchError(
          `Malformed Content-Length "${contentLengthHeader}"`,
          'malformed_content_length',
        )
      }
      const declaredLength = parseInt(trimmed, 10)
      if (declaredLength > maxBytes) {
        clearTimeout(timeoutId)
        throw new CambridgeFetchError(
          `Content length ${declaredLength} exceeds maximum limit of ${maxBytes} bytes`,
          'oversized_content',
        )
      }
    }

    try {
      if (!response.body) {
        const text = await response.text()
        const byteLength = Buffer.byteLength(text, 'utf-8')
        if (byteLength > maxBytes) {
          throw new CambridgeFetchError(
            `HTML byte length ${byteLength} exceeds maximum limit of ${maxBytes} bytes`,
            'oversized_content',
          )
        }
        clearTimeout(timeoutId)
        return { html: text, finalUrl: currentUrl }
      }

      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let totalBytes = 0

      const onAbort = () => {
        try {
          reader.cancel().catch(() => {
            // safely swallow async cancellation rejection
          })
        } catch {
          // safely swallow sync throw
        }
      }
      controller.signal.addEventListener('abort', onAbort)

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            totalBytes += value.byteLength
            if (totalBytes > maxBytes) {
              await reader.cancel().catch(() => {})
              throw new CambridgeFetchError(
                `Streamed byte length ${totalBytes} exceeds maximum limit of ${maxBytes} bytes`,
                'oversized_content',
              )
            }
            chunks.push(value)
          }
        }
      } catch (err) {
        if (isTimeout || controller.signal.aborted) {
          throw new CambridgeFetchError(
            `Index fetch timed out during body streaming after ${timeoutMs}ms for "${currentUrl}"`,
            'timeout',
          )
        }
        throw err
      } finally {
        controller.signal.removeEventListener('abort', onAbort)
      }

      if (isTimeout || controller.signal.aborted) {
        throw new CambridgeFetchError(
          `Index fetch timed out during body streaming after ${timeoutMs}ms for "${currentUrl}"`,
          'timeout',
        )
      }

      clearTimeout(timeoutId)

      const totalBuffer = new Uint8Array(totalBytes)
      let offset = 0
      for (const chunk of chunks) {
        totalBuffer.set(chunk, offset)
        offset += chunk.byteLength
      }

      const decoder = new TextDecoder('utf-8', { fatal: false })
      const html = decoder.decode(totalBuffer)
      return { html, finalUrl: currentUrl }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

export interface ParsedIndexLink {
  rawHref: string
  resolvedUrl: string
  anchorText: string
  isValidCandidate: boolean
  invalidReason?: DiscoveryIssueCode
}

export type DiscoveredLink = ParsedIndexLink

/**
 * Extracts all anchor links targeting PDF files from the index HTML.
 * Resolves relative URLs safely and validates against Cambridge host requirements.
 */
export function parseCambridgeIndexLinks(
  html: string,
  baseUrl: string,
): ParsedIndexLink[] {
  const links: ParsedIndexLink[] = []
  const seenUrls = new Set<string>()

  const anchorRegex = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi

  let match: RegExpExecArray | null
  while ((match = anchorRegex.exec(html)) !== null) {
    const rawHref = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    const rawAnchor = match[4] ?? ''
    const anchorText = rawAnchor.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

    if (!rawHref) continue

    const cleanHref = rawHref.split(/[?#]/, 1)[0]
    if (!cleanHref.toLowerCase().endsWith('.pdf')) {
      continue
    }

    let resolved: URL
    try {
      resolved = new URL(rawHref, baseUrl)
    } catch {
      links.push({
        rawHref,
        resolvedUrl: rawHref,
        anchorText,
        isValidCandidate: false,
        invalidReason: 'check_failed',
      })
      continue
    }

    const canonicalKey = `${resolved.origin}${resolved.pathname}`.toLowerCase()
    if (seenUrls.has(canonicalKey)) {
      continue
    }
    seenUrls.add(canonicalKey)

    if (resolved.protocol !== 'https:') {
      links.push({
        rawHref,
        resolvedUrl: resolved.toString(),
        anchorText,
        isValidCandidate: false,
        invalidReason: 'insecure_protocol',
      })
      continue
    }

    if (!APPROVED_CAMBRIDGE_HOSTS.has(resolved.hostname)) {
      links.push({
        rawHref,
        resolvedUrl: resolved.toString(),
        anchorText,
        isValidCandidate: false,
        invalidReason: 'unapproved_host',
      })
      continue
    }

    links.push({
      rawHref,
      resolvedUrl: resolved.toString(),
      anchorText,
      isValidCandidate: true,
    })
  }

  return links
}

export interface LinkValidationResult {
  matches: boolean
  isTargetClaim: boolean
  mismatchReason?: DiscoveryIssueCode
}

/**
 * Normalizes and extracts subject title from text without substring confusion.
 * Distinguishes "Further Mathematics" from "Mathematics".
 */
function extractIdentifiedSubject(text: string): string | null {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  if (/\bfurther\s+mathematics\b/.test(normalized)) {
    return 'further mathematics'
  }
  if (/\bmathematics\b/.test(normalized)) {
    return 'mathematics'
  }
  if (/\bphysics\b/.test(normalized)) {
    return 'physics'
  }
  if (/\bchemistry\b/.test(normalized)) {
    return 'chemistry'
  }
  if (/\bcomputer\s+science\b/.test(normalized)) {
    return 'computer science'
  }
  if (/\benvironmental\s+management\b/.test(normalized)) {
    return 'environmental management'
  }
  if (/\beconomics\b/.test(normalized)) {
    return 'economics'
  }
  if (/\bbiology\b/.test(normalized)) {
    return 'biology'
  }
  return null
}

/**
 * Validates publication identity using independently consistent evidence:
 * - requested session year & series
 * - PDF link year and series (from slug and anchor text independently)
 * - syllabus code
 * - exact subject identity (distinguishing Mathematics vs Further Mathematics)
 */
export function validateLinkSubjectIdentity(
  link: ParsedIndexLink,
  subject: SupportedDiscoverySubject,
  session: ExamSession,
): LinkValidationResult {
  const syllabusCode = subject.syllabusCode
  const expectedSubject = subject.syllabusName.toLowerCase()

  const pathname = (() => {
    try {
      return new URL(link.resolvedUrl).pathname.toLowerCase()
    } catch {
      return link.resolvedUrl.toLowerCase()
    }
  })()
  const filename = pathname.split('/').pop() ?? ''
  const slug = filename.replace(/^\d+-/, '')

  // Determine whether this link claims the target subject (by syllabus code or subject title)
  const codeInParens = new RegExp(`\\(${syllabusCode}\\)`).test(link.anchorText)
  const codeWordInAnchor = new RegExp(`\\b${syllabusCode}\\b`).test(link.anchorText)
  const codeInSlug = new RegExp(`(^|[-_])${syllabusCode}([-_]|\\.pdf$)`, 'i').test(slug)
  const hasTargetCodeClaim = codeInParens || codeWordInAnchor || codeInSlug

  const anchorSubject = extractIdentifiedSubject(link.anchorText)
  const slugSubject = extractIdentifiedSubject(slug)
  const hasTargetTitleClaim =
    (anchorSubject !== null && anchorSubject === expectedSubject) ||
    (slugSubject !== null && slugSubject === expectedSubject)

  if (!hasTargetCodeClaim && !hasTargetTitleClaim) {
    // Unrelated PDF link: does not claim the target syllabus code or subject title.
    // Must be ignored and must not poison omitted subjects.
    return { matches: false, isTargetClaim: false }
  }

  // The link claims the target syllabus code or subject title.
  // Evaluate whether it contains contradictory subject or session evidence:

  // 1. Contradictory subject title:
  // e.g. code is 9709, but title is Further Mathematics, Physics, etc.
  if (anchorSubject && anchorSubject !== expectedSubject) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_subject' }
  }
  if (slugSubject && slugSubject !== expectedSubject) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_subject' }
  }

  // 2. Contradictory syllabus code:
  // e.g. title is Mathematics, but code in parens is (9231) or slug code is 9231
  const otherCodeInParens = link.anchorText.match(/\((\d{4})\)/)
  if (otherCodeInParens && otherCodeInParens[1] !== syllabusCode) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_subject' }
  }

  const otherCodeInSlug = slug.match(/(?:^|[-_])(\d{4})(?:[-_]|\.pdf$)/i)
  if (otherCodeInSlug && otherCodeInSlug[1] !== syllabusCode) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_subject' }
  }

  if (!hasTargetCodeClaim) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_subject' }
  }

  // 3. Contradictory session evidence (year & series):
  const slugYears = Array.from(slug.matchAll(/\b(20\d{2})\b/g)).map((m) => parseInt(m[1], 10))
  const slugSeries = Array.from(slug.matchAll(/\b(march|june|november)\b/gi)).map((m) =>
    m[1].toLowerCase(),
  )

  const anchorYears = Array.from(link.anchorText.matchAll(/\b(20\d{2})\b/g)).map((m) =>
    parseInt(m[1], 10),
  )
  const anchorSeries = Array.from(link.anchorText.matchAll(/\b(march|june|november)\b/gi)).map((m) =>
    m[1].toLowerCase(),
  )

  // Conflicting multiple years or series within either source
  if (new Set(slugYears).size > 1 || new Set(anchorYears).size > 1) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_session' }
  }
  if (new Set(slugSeries).size > 1 || new Set(anchorSeries).size > 1) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_session' }
  }

  // Contradiction between slug and anchor
  if (slugYears.length > 0 && anchorYears.length > 0 && slugYears[0] !== anchorYears[0]) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_session' }
  }
  if (slugSeries.length > 0 && anchorSeries.length > 0 && slugSeries[0] !== anchorSeries[0]) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_session' }
  }

  // Validate against requested session
  if (slugYears.length > 0 && slugYears[0] !== session.year) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_session' }
  }
  if (anchorYears.length > 0 && anchorYears[0] !== session.year) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_session' }
  }
  if (slugSeries.length > 0 && slugSeries[0] !== session.series) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_session' }
  }
  if (anchorSeries.length > 0 && anchorSeries[0] !== session.series) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_session' }
  }

  // Require positive year and series evidence (reject complete absence)
  const hasYearEvidence = slugYears.length > 0 || anchorYears.length > 0
  const hasSeriesEvidence = slugSeries.length > 0 || anchorSeries.length > 0
  if (!hasYearEvidence || !hasSeriesEvidence) {
    return { matches: false, isTargetClaim: true, mismatchReason: 'mismatched_session' }
  }

  return { matches: true, isTargetClaim: true }
}

/**
 * Backwards-compatible alias for linkMatchesSubject.
 */
export function linkMatchesSubject(
  link: ParsedIndexLink,
  syllabusCode: string,
  session?: ExamSession,
): boolean {
  const dummySubject = SUPPORTED_DISCOVERY_SUBJECTS.find((s) => s.syllabusCode === syllabusCode) ?? {
    syllabusCode,
    syllabusName: '',
  }
  const effectiveSession = session ?? { year: 2026, series: 'june' }
  return validateLinkSubjectIdentity(link, dummySubject, effectiveSession).matches
}

/**
 * Inspects official Cambridge index pages across candidate sessions and determines
 * the latest available official publication for each supported subject.
 */
export async function discoverCambridgePublications(
  options?: DiscoverPublicationsOptions,
): Promise<PublicationDiscoveryReport> {
  const subjects = options?.subjects ?? SUPPORTED_DISCOVERY_SUBJECTS
  const now = (options?.now ?? (() => new Date()))()
  const sessions = [
    ...(options?.sessions ??
      generateRollingDiscoverySessions(now, options?.rollingOptions)),
  ].sort(compareSessions)

  const fetchHtml =
    options?.fetchIndexHtml ??
    ((url, opts) =>
      fetchCambridgeIndexHtml(url, { ...opts, fetchFn: options?.fetchFn }))
  const checkedAt = now.toISOString()

  let hasDiscoveryFailure = false

  const sessionPageCache = new Map<
    string,
    Promise<
      | { ok: true; links: ParsedIndexLink[]; finalUrl: string }
      | {
          ok: false
          status: 'index_unavailable' | 'check_failed'
          issueCode: DiscoveryIssueCode
          indexUrl: string
        }
    >
  >()

  const getSessionPage = (session: ExamSession) => {
    const indexUrl = buildSeriesIndexUrl(session)
    let pending = sessionPageCache.get(indexUrl)
    if (!pending) {
      pending = (async () => {
        try {
          const { html, finalUrl } = await fetchHtml(indexUrl)

          // Verify finalUrl has canonical path matching expected canonical grade-threshold index URL
          let parsedFinal: URL
          try {
            parsedFinal = new URL(finalUrl)
          } catch {
            hasDiscoveryFailure = true
            return {
              ok: false,
              status: 'check_failed' as const,
              issueCode: 'check_failed' as const,
              indexUrl: finalUrl,
            }
          }

          if (!APPROVED_CAMBRIDGE_HOSTS.has(parsedFinal.hostname.toLowerCase())) {
            hasDiscoveryFailure = true
            return {
              ok: false,
              status: 'check_failed' as const,
              issueCode: 'unapproved_host' as const,
              indexUrl: finalUrl,
            }
          }

          if (parsedFinal.protocol !== 'https:') {
            hasDiscoveryFailure = true
            return {
              ok: false,
              status: 'check_failed' as const,
              issueCode: 'insecure_protocol' as const,
              indexUrl: finalUrl,
            }
          }

          const expectedUrl = new URL(buildSeriesIndexUrl(session))
          const normalizePath = (p: string) => p.toLowerCase().replace(/\/+$/, '') + '/'
          if (normalizePath(parsedFinal.pathname) !== normalizePath(expectedUrl.pathname)) {
            hasDiscoveryFailure = true
            return {
              ok: false,
              status: 'check_failed' as const,
              issueCode: 'mismatched_session' as const,
              indexUrl: finalUrl,
            }
          }

          const links = parseCambridgeIndexLinks(html, finalUrl)

          // A successfully fetched index page with 0 PDF links indicates unexpected index structure
          if (links.length === 0) {
            hasDiscoveryFailure = true
            return {
              ok: false,
              status: 'check_failed' as const,
              issueCode: 'unexpected_index_structure' as const,
              indexUrl: finalUrl,
            }
          }

          return { ok: true, links, finalUrl }
        } catch (err: unknown) {
          if (err instanceof CambridgeFetchError) {
            if (err.issueCode === 'not_found' || err.issueCode === 'gone') {
              return {
                ok: false,
                status: 'index_unavailable' as const,
                issueCode: err.issueCode,
                indexUrl,
              }
            }
            hasDiscoveryFailure = true
            return {
              ok: false,
              status: 'check_failed' as const,
              issueCode: err.issueCode,
              indexUrl,
            }
          }

          hasDiscoveryFailure = true
          return {
            ok: false,
            status: 'check_failed' as const,
            issueCode: 'check_failed' as const,
            indexUrl,
          }
        }
      })()
      sessionPageCache.set(indexUrl, pending)
    }
    return pending
  }

  const subjectResults: SubjectDiscoveryResult[] = []

  for (const subject of subjects) {
    const checkedSessions: SessionDiscoveryItem[] = []
    let latestCandidate: DiscoveredPublicationCandidate | undefined
    let latestCandidateSession: ExamSession | undefined
    let latestIssueSession: ExamSession | undefined
    let latestIssueStatus: DiscoveryStatus | undefined
    let latestIssueCode: DiscoveryIssueCode | undefined

    for (const session of sessions) {
      const pageResult = await getSessionPage(session)

      if (!pageResult.ok) {
        checkedSessions.push({
          year: session.year,
          series: session.series,
          indexUrl: pageResult.indexUrl,
          status: pageResult.status,
          issueCode: pageResult.issueCode,
        })

        if (pageResult.status === 'check_failed') {
          if (!latestIssueSession || compareSessions(session, latestIssueSession) >= 0) {
            latestIssueSession = session
            latestIssueStatus = 'check_failed'
            latestIssueCode = pageResult.issueCode
          }
        }
        continue
      }

      // Filter links matching this subject with independent evidence validation
      const validMatchingLinks: ParsedIndexLink[] = []
      const invalidLinks: ParsedIndexLink[] = []
      const contradictoryLinks: Array<{ link: ParsedIndexLink; reason: DiscoveryIssueCode }> = []

      for (const link of pageResult.links) {
        const validation = validateLinkSubjectIdentity(link, subject, session)
        if (!validation.isTargetClaim) {
          // Unrelated link - ignore completely and never poison omitted subjects
          continue
        }

        if (validation.matches) {
          if (!link.isValidCandidate) {
            invalidLinks.push(link)
          } else {
            validMatchingLinks.push(link)
          }
        } else if (validation.mismatchReason) {
          contradictoryLinks.push({ link, reason: validation.mismatchReason })
        }
      }

      // Fail-closed: Contradictory target-claiming links ALWAYS produce a check_failed status,
      // even if a valid target link also appeared on the same page.
      if (contradictoryLinks.length > 0) {
        const primary = contradictoryLinks[0]
        checkedSessions.push({
          year: session.year,
          series: session.series,
          indexUrl: pageResult.finalUrl,
          status: 'check_failed',
          pdfUrl: primary.link.resolvedUrl,
          issueCode: primary.reason,
        })
        hasDiscoveryFailure = true
        if (!latestIssueSession || compareSessions(session, latestIssueSession) >= 0) {
          latestIssueSession = session
          latestIssueStatus = 'check_failed'
          latestIssueCode = primary.reason
        }
        continue
      }

      if (invalidLinks.length > 0) {
        const primary = invalidLinks[0]
        checkedSessions.push({
          year: session.year,
          series: session.series,
          indexUrl: pageResult.finalUrl,
          status: 'invalid_link',
          pdfUrl: primary.resolvedUrl,
          issueCode: primary.invalidReason ?? 'check_failed',
        })
        hasDiscoveryFailure = true
        if (!latestIssueSession || compareSessions(session, latestIssueSession) >= 0) {
          latestIssueSession = session
          latestIssueStatus = 'invalid_link'
          latestIssueCode = primary.invalidReason ?? 'check_failed'
        }
        continue
      }

      if (validMatchingLinks.length === 0) {
        checkedSessions.push({
          year: session.year,
          series: session.series,
          indexUrl: pageResult.finalUrl,
          status: 'unavailable',
        })
        continue
      }

      const validUrls = Array.from(new Set(validMatchingLinks.map((l) => l.resolvedUrl)))

      if (validUrls.length > 1) {
        checkedSessions.push({
          year: session.year,
          series: session.series,
          indexUrl: pageResult.finalUrl,
          status: 'ambiguous',
          issueCode: 'ambiguous_links',
        })
        if (!latestIssueSession || compareSessions(session, latestIssueSession) >= 0) {
          latestIssueSession = session
          latestIssueStatus = 'ambiguous'
          latestIssueCode = 'ambiguous_links'
        }
        continue
      }

      const pdfUrl = validUrls[0]
      checkedSessions.push({
        year: session.year,
        series: session.series,
        indexUrl: pageResult.finalUrl,
        status: 'available',
        pdfUrl,
      })

      if (!latestCandidateSession || compareSessions(session, latestCandidateSession) > 0) {
        latestCandidate = {
          syllabusCode: subject.syllabusCode,
          syllabusName: subject.syllabusName,
          year: session.year,
          series: session.series,
          indexUrl: pageResult.finalUrl,
          pdfUrl,
        }
        latestCandidateSession = session
      }
    }

    // Determine overall subject status:
    // A newer ambiguous, invalid, or failed session CANNOT be hidden by an older available candidate.
    let subjectStatus: DiscoveryStatus = 'unavailable'
    let subjectIssueCode: DiscoveryIssueCode | undefined
    let reportedCandidate: DiscoveredPublicationCandidate | undefined

    if (
      latestIssueSession &&
      (!latestCandidateSession || compareSessions(latestIssueSession, latestCandidateSession) > 0)
    ) {
      subjectStatus = latestIssueStatus!
      subjectIssueCode = latestIssueCode
      reportedCandidate = undefined
    } else if (latestCandidate) {
      subjectStatus = 'available'
      reportedCandidate = latestCandidate
    } else {
      const allIndexUnavailable =
        checkedSessions.length > 0 &&
        checkedSessions.every((s) => s.status === 'index_unavailable')
      if (latestIssueSession) {
        subjectStatus = latestIssueStatus!
        subjectIssueCode = latestIssueCode
      } else if (allIndexUnavailable) {
        subjectStatus = 'index_unavailable'
        subjectIssueCode = 'not_found'
      } else {
        subjectStatus = 'unavailable'
      }
    }

    subjectResults.push({
      syllabusCode: subject.syllabusCode,
      syllabusName: subject.syllabusName,
      status: subjectStatus,
      latestPublication: reportedCandidate,
      checkedSessions,
      issueCode: subjectIssueCode,
    })
  }

  return {
    checkedAt,
    sessionsChecked: sessions,
    subjects: subjectResults,
    hasDiscoveryFailure,
  }
}
