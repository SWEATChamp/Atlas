import type { CambridgeSeries, PdfExtraction, SourceLocation, ValidationState } from './types'
import { extractPdfTextItems, reconstructRows } from './pdf-extraction'
import { sha256Hex } from './parser'

export interface CambridgeWeightingSourceManifest {
  readonly title: string
  readonly pdfUrl: string
  readonly expectedChecksumSha256: string
  readonly expectedPageCount: number
  readonly createdOn: string
  readonly coveredSeries: readonly string[]
  readonly june2026ExpectedRows: Readonly<Record<string, number>>
  readonly expectedRowsBySession?: Readonly<Record<string, Readonly<Record<string, number>>>>
  readonly expectedIdentityLines?: readonly string[]
  readonly june2026GoldenFactors: readonly {
    readonly syllabusCode: string
    readonly component: string
    readonly maximumRawMark: number
    readonly maximumWeightedMark: number
    readonly factor: number
  }[]
}

export interface WeightingSessionTarget {
  readonly year: number
  readonly series: CambridgeSeries
}

export function formatWeightingSeriesKey(year: number, series: CambridgeSeries): string {
  return `${series}-${year}`
}

export function formatWeightingSeriesLabel(year: number, series: CambridgeSeries): string {
  const cap = series.charAt(0).toUpperCase() + series.slice(1)
  return `${cap} ${year}`
}

function hasNonEmptyExpectedRows(expectedRows: Readonly<Record<string, number>>): boolean {
  const entries = Object.entries(expectedRows)
  return entries.length > 0 && entries.some(([, count]) => Number.isInteger(count) && count > 0)
}

export function isWeightingManifestCoveringSession(
  manifest: Pick<CambridgeWeightingSourceManifest, 'coveredSeries' | 'expectedRowsBySession' | 'june2026ExpectedRows'>,
  year: number,
  series: CambridgeSeries,
): boolean {
  const sessionKey = formatWeightingSeriesKey(year, series)
  if (!manifest.coveredSeries.includes(sessionKey)) {
    return false
  }
  const expectedRows = getExpectedWeightingRowsForSession(manifest, year, series)
  return Object.keys(expectedRows).length > 0
}

export function getExpectedWeightingRowsForSession(
  manifest: Pick<CambridgeWeightingSourceManifest, 'expectedRowsBySession' | 'june2026ExpectedRows'>,
  year: number,
  series: CambridgeSeries,
): Readonly<Record<string, number>> {
  const sessionKey = formatWeightingSeriesKey(year, series)
  if (manifest.expectedRowsBySession?.[sessionKey]) {
    return manifest.expectedRowsBySession[sessionKey]
  }
  if (year === 2026 && series === 'june') {
    return manifest.june2026ExpectedRows
  }
  return {}
}

export function validateWeightingManifest(
  manifest: CambridgeWeightingSourceManifest,
  targetSession: WeightingSessionTarget = { year: 2026, series: 'june' },
): Array<{ code: 'wrong-identity' | 'row-count-mismatch'; message: string }> {
  const issues: Array<{ code: 'wrong-identity' | 'row-count-mismatch'; message: string }> = []

  if (!Array.isArray(manifest.coveredSeries) || manifest.coveredSeries.length === 0) {
    issues.push({
      code: 'wrong-identity',
      message: 'Weighting manifest must declare at least one covered session.',
    })
  } else {
    for (const sessionKey of manifest.coveredSeries) {
      const match = sessionKey.match(/^(march|june|november)-(\d{4})$/)
      if (!match) {
        issues.push({
          code: 'wrong-identity',
          message: `Malformed weighting coveredSeries key "${sessionKey}".`,
        })
        continue
      }
      const series = match[1] as CambridgeSeries
      const year = Number(match[2])
      const expected = getExpectedWeightingRowsForSession(manifest, year, series)
      if (!hasNonEmptyExpectedRows(expected) || Object.values(expected).some((n) => !Number.isInteger(n) || n <= 0)) {
        issues.push({
          code: 'row-count-mismatch',
          message: `Weighting manifest covers ${sessionKey} without non-empty positive expected subject-row counts.`,
        })
      }
    }
  }

  if (manifest.expectedIdentityLines !== undefined) {
    if (
      manifest.expectedIdentityLines.length === 0 ||
      manifest.expectedIdentityLines.some((line) => line.trim().length === 0)
    ) {
      issues.push({
        code: 'wrong-identity',
        message: 'Weighting manifest expectedIdentityLines must contain non-empty identity strings.',
      })
    }
  }

  const targetKey = formatWeightingSeriesKey(targetSession.year, targetSession.series)
  if (!manifest.coveredSeries.includes(targetKey)) {
    issues.push({
      code: 'wrong-identity',
      message: `Weighting manifest does not cover session ${formatWeightingSeriesLabel(targetSession.year, targetSession.series)}.`,
    })
  }

  return issues
}

export const CAMBRIDGE_WEIGHTING_SOURCE = {
  title: 'Syllabus component weighting factors',
  pdfUrl: 'https://www.cambridgeinternational.org/Images/206341-syllabus-component-weighting-factors.pdf',
  expectedChecksumSha256: 'd96f96e5d8847470fd7291f75aa01184b3c0cff7075b5010968e16d94218ada9',
  expectedPageCount: 91,
  createdOn: '2026-06-29',
  coveredSeries: ['june-2026'],
  expectedRowsBySession: {
    'june-2026': { '9709': 48, '9231': 40, '9702': 40, '9701': 40, '9618': 22 },
  },
  june2026ExpectedRows: { '9709': 48, '9231': 40, '9702': 40, '9701': 40, '9618': 22 },
  june2026GoldenFactors: [
    { syllabusCode: '9709', component: '80', maximumRawMark: 100, maximumWeightedMark: 75, factor: 0.75 },
    { syllabusCode: '9231', component: '81', maximumRawMark: 100, maximumWeightedMark: 75, factor: 0.75 },
    { syllabusCode: '9702', component: '31', maximumRawMark: 40, maximumWeightedMark: 30, factor: 0.75 },
    { syllabusCode: '9702', component: '80', maximumRawMark: 100, maximumWeightedMark: 75, factor: 0.75 },
    { syllabusCode: '9701', component: '38', maximumRawMark: 40, maximumWeightedMark: 30, factor: 0.75 },
    { syllabusCode: '9701', component: '80', maximumRawMark: 100, maximumWeightedMark: 75, factor: 0.75 },
    { syllabusCode: '9618', component: '80', maximumRawMark: 100, maximumWeightedMark: 75, factor: 0.75 },
  ],
} as const satisfies CambridgeWeightingSourceManifest

export interface WeightingFactorRow {
  readonly year: number
  readonly series: CambridgeSeries
  readonly syllabusCode: string
  readonly component: string
  readonly maximumRawMark: number
  readonly maximumWeightedMark: number
  readonly factor: number
  readonly source: SourceLocation
}

export interface ParsedWeightingPublication {
  readonly checksumSha256: string
  readonly pageCount: number
  readonly rows: readonly WeightingFactorRow[]
  readonly validation: ValidationState
}

export interface ParseWeightingOptions {
  readonly manifest?: CambridgeWeightingSourceManifest
  readonly targetSession?: WeightingSessionTarget
}

export async function parseCambridgeWeightingPdf(
  bytes: Uint8Array,
  contentType: string,
  extract: (value: Uint8Array) => Promise<PdfExtraction> = extractPdfTextItems,
  expectedChecksumSha256: string = CAMBRIDGE_WEIGHTING_SOURCE.expectedChecksumSha256,
  options?: ParseWeightingOptions,
): Promise<ParsedWeightingPublication> {
  const checksumSha256 = sha256Hex(bytes)
  const manifest: CambridgeWeightingSourceManifest = options?.manifest ?? CAMBRIDGE_WEIGHTING_SOURCE
  const targetSession = options?.targetSession ?? { year: 2026, series: 'june' as const }
  const earlyIssues: Array<{ code: 'non-pdf-metadata' | 'not-pdf' | 'checksum-mismatch' | 'wrong-identity' | 'row-count-mismatch'; message: string }> = [
    ...validateWeightingManifest(manifest, targetSession),
  ]
  if (contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/pdf') {
    earlyIssues.push({ code: 'non-pdf-metadata' as const, message: `Expected application/pdf metadata, received ${contentType}.` })
  }
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
    earlyIssues.push({ code: 'not-pdf' as const, message: 'Source bytes do not begin with the PDF signature.' })
  }
  if (checksumSha256 !== expectedChecksumSha256) {
    earlyIssues.push({ code: 'checksum-mismatch' as const, message: 'Weighting source checksum mismatch.' })
  }
  if (earlyIssues.length > 0) {
    return { checksumSha256, pageCount: 0, rows: [], validation: { status: 'invalid', issues: earlyIssues } }
  }
  return parseCambridgeWeightingItems(await extract(bytes), checksumSha256, options)
}

export function parseCambridgeWeightingItems(
  extraction: PdfExtraction,
  checksumSha256: string = CAMBRIDGE_WEIGHTING_SOURCE.expectedChecksumSha256,
  options?: ParseWeightingOptions,
): ParsedWeightingPublication {
  const manifest: CambridgeWeightingSourceManifest = options?.manifest ?? CAMBRIDGE_WEIGHTING_SOURCE
  const targetSession = options?.targetSession ?? { year: 2026, series: 'june' as const }
  const seriesLabel = formatWeightingSeriesLabel(targetSession.year, targetSession.series)
  const expectedRowsMap = getExpectedWeightingRowsForSession(
    manifest,
    targetSession.year,
    targetSession.series,
  )

  const issues: Array<{ code: 'wrong-identity' | 'wrong-page-count' | 'malformed-columns' | 'conflicting-duplicate' | 'row-count-mismatch' | 'golden-fixture-mismatch' | 'out-of-range-threshold'; message: string; page?: number; reconstructedRow?: string }> = [
    ...validateWeightingManifest(manifest, targetSession),
  ]
  const reconstructed = reconstructRows(extraction.items)
  const headerCompactText = reconstructed
    .filter((row) => !/^(?:November|March|June)\s+\d{4}\s+\d{4}\s+\d{2}\s+\d+/.test(row.text))
    .map((row) => row.text)
    .join(' ')
    .replace(/\s/g, '')
  const identityLines =
    manifest.expectedIdentityLines && manifest.expectedIdentityLines.length > 0
      ? manifest.expectedIdentityLines
      : ['Syllabus component weighting factors']
  for (const identity of identityLines) {
    if (identity.trim().length > 0 && !headerCompactText.includes(identity.replace(/\s/g, ''))) {
      issues.push({ code: 'wrong-identity', message: `Missing weighting identity: ${identity}.` })
    }
  }
  if (!headerCompactText.includes(seriesLabel.replace(/\s/g, ''))) {
    issues.push({
      code: 'wrong-identity',
      message: `Weighting document header/identity does not declare session ${seriesLabel}.`,
    })
  }
  if (extraction.pageCount !== manifest.expectedPageCount) {
    issues.push({
      code: 'wrong-page-count',
      message: `Expected ${manifest.expectedPageCount} pages, received ${extraction.pageCount}.`,
    })
  }

  const supported = new Set(Object.keys(expectedRowsMap))
  const rows: WeightingFactorRow[] = []
  for (const row of reconstructed) {
    const targetCode = [...supported].find((code) => row.text.includes(code))
    if (!targetCode || !row.text.includes(seriesLabel)) continue
    const parsed = parseCambridgeWeightingRow(row, targetSession)
    if (!parsed) {
      issues.push({ code: 'malformed-columns', message: 'Malformed supported weighting row.', page: row.page, reconstructedRow: row.text })
      continue
    }
    if (parsed.maximumRawMark <= 0 || parsed.maximumWeightedMark < 0 || parsed.factor < 0 ||
      Math.round(parsed.maximumRawMark * parsed.factor) !== parsed.maximumWeightedMark) {
      issues.push({ code: 'out-of-range-threshold', message: 'Invalid weighting maxima or factor.', page: row.page, reconstructedRow: row.text })
    }
    rows.push(parsed)
  }

  const seen = new Map<string, string>()
  for (const row of rows) {
    const key = `${row.syllabusCode}:${row.component}`
    const value = JSON.stringify([row.maximumRawMark, row.maximumWeightedMark, row.factor])
    if (seen.has(key) && seen.get(key) !== value) issues.push({ code: 'conflicting-duplicate', message: `Conflicting weighting row ${key}.` })
    seen.set(key, value)
  }
  for (const [code, expected] of Object.entries(expectedRowsMap)) {
    const count = rows.filter((row) => row.syllabusCode === code).length
    if (count !== expected) issues.push({ code: 'row-count-mismatch', message: `Expected ${expected} weighting rows for ${code}, parsed ${count}.` })
  }
  if (targetSession.year === 2026 && targetSession.series === 'june') {
    for (const golden of manifest.june2026GoldenFactors) {
      const found = rows.some((row) => row.syllabusCode === golden.syllabusCode && row.component === golden.component &&
        row.maximumRawMark === golden.maximumRawMark && row.maximumWeightedMark === golden.maximumWeightedMark && row.factor === golden.factor)
      if (!found) issues.push({ code: 'golden-fixture-mismatch', message: `Weighting golden mismatch for ${golden.syllabusCode}/${golden.component}.` })
    }
  }

  return {
    checksumSha256,
    pageCount: extraction.pageCount,
    rows,
    validation: issues.length === 0 ? { status: 'valid', issues: [] } : { status: 'invalid', issues },
  }
}

export function parseCambridgeWeightingRow(
  row: { readonly page: number; readonly text: string; readonly rawTokens: readonly string[] },
  targetSession: WeightingSessionTarget = { year: 2026, series: 'june' },
): WeightingFactorRow | null {
  const cap = targetSession.series.charAt(0).toUpperCase() + targetSession.series.slice(1)
  const pattern = new RegExp(`${cap}\\s+${targetSession.year}\\s+(\\d{4})\\s+(\\d{2})\\s+(\\d+)\\s+(\\d+)\\s+(\\d+(?:\\.\\d+)?)$`)
  const match = row.text.match(pattern)
  if (!match) return null
  return {
    year: targetSession.year,
    series: targetSession.series,
    syllabusCode: match[1],
    component: match[2],
    maximumRawMark: Number(match[3]),
    maximumWeightedMark: Number(match[4]),
    factor: Number(match[5]),
    source: { page: row.page, reconstructedRow: row.text, rawTokens: row.rawTokens },
  }
}
