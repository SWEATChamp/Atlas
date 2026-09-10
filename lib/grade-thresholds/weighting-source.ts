import type { PdfExtraction, SourceLocation, ValidationState } from './types'
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
  readonly june2026GoldenFactors: readonly {
    readonly syllabusCode: string
    readonly component: string
    readonly maximumRawMark: number
    readonly maximumWeightedMark: number
    readonly factor: number
  }[]
}

export const CAMBRIDGE_WEIGHTING_SOURCE = {
  title: 'Syllabus component weighting factors',
  pdfUrl: 'https://www.cambridgeinternational.org/Images/206341-syllabus-component-weighting-factors.pdf',
  expectedChecksumSha256: 'd96f96e5d8847470fd7291f75aa01184b3c0cff7075b5010968e16d94218ada9',
  expectedPageCount: 91,
  createdOn: '2026-06-29',
  coveredSeries: ['november-2025', 'march-2026', 'june-2026'],
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
  readonly year: 2026
  readonly series: 'june'
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

export async function parseCambridgeWeightingPdf(
  bytes: Uint8Array,
  contentType: string,
  extract: (value: Uint8Array) => Promise<PdfExtraction> = extractPdfTextItems,
  expectedChecksumSha256: string = CAMBRIDGE_WEIGHTING_SOURCE.expectedChecksumSha256,
): Promise<ParsedWeightingPublication> {
  const checksumSha256 = sha256Hex(bytes)
  const earlyIssues = []
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
  return parseCambridgeWeightingItems(await extract(bytes), checksumSha256)
}

export function parseCambridgeWeightingItems(
  extraction: PdfExtraction,
  checksumSha256: string = CAMBRIDGE_WEIGHTING_SOURCE.expectedChecksumSha256,
): ParsedWeightingPublication {
  const issues: Array<{ code: 'wrong-identity' | 'wrong-page-count' | 'malformed-columns' | 'conflicting-duplicate' | 'row-count-mismatch' | 'golden-fixture-mismatch' | 'out-of-range-threshold'; message: string; page?: number; reconstructedRow?: string }> = []
  const reconstructed = reconstructRows(extraction.items)
  const compactText = reconstructed.map((row) => row.text).join(' ').replace(/\s/g, '')
  for (const identity of ['Syllabus component weighting factors', 'November 2025, March 2026 and June 2026']) {
    if (!compactText.includes(identity.replace(/\s/g, ''))) issues.push({ code: 'wrong-identity', message: `Missing weighting identity: ${identity}.` })
  }
  if (extraction.pageCount !== CAMBRIDGE_WEIGHTING_SOURCE.expectedPageCount) {
    issues.push({ code: 'wrong-page-count', message: `Expected 91 pages, received ${extraction.pageCount}.` })
  }

  const supported = new Set(Object.keys(CAMBRIDGE_WEIGHTING_SOURCE.june2026ExpectedRows))
  const rows: WeightingFactorRow[] = []
  for (const row of reconstructed) {
    const targetCode = [...supported].find((code) => row.text.includes(code))
    if (!targetCode || !row.text.includes('June 2026')) continue
    const parsed = parseCambridgeWeightingRow(row)
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
  for (const [code, expected] of Object.entries(CAMBRIDGE_WEIGHTING_SOURCE.june2026ExpectedRows)) {
    const count = rows.filter((row) => row.syllabusCode === code).length
    if (count !== expected) issues.push({ code: 'row-count-mismatch', message: `Expected ${expected} weighting rows for ${code}, parsed ${count}.` })
  }
  for (const golden of CAMBRIDGE_WEIGHTING_SOURCE.june2026GoldenFactors) {
    const found = rows.some((row) => row.syllabusCode === golden.syllabusCode && row.component === golden.component &&
      row.maximumRawMark === golden.maximumRawMark && row.maximumWeightedMark === golden.maximumWeightedMark && row.factor === golden.factor)
    if (!found) issues.push({ code: 'golden-fixture-mismatch', message: `Weighting golden mismatch for ${golden.syllabusCode}/${golden.component}.` })
  }

  return {
    checksumSha256,
    pageCount: extraction.pageCount,
    rows,
    validation: issues.length === 0 ? { status: 'valid', issues: [] } : { status: 'invalid', issues },
  }
}

export function parseCambridgeWeightingRow(row: { readonly page: number; readonly text: string; readonly rawTokens: readonly string[] }): WeightingFactorRow | null {
  const match = row.text.match(/June\s+2026\s+(\d{4})\s+(\d{2})\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)$/)
  if (!match) return null
  return {
    year: 2026,
    series: 'june',
    syllabusCode: match[1],
    component: match[2],
    maximumRawMark: Number(match[3]),
    maximumWeightedMark: Number(match[4]),
    factor: Number(match[5]),
    source: { page: row.page, reconstructedRow: row.text, rawTokens: row.rawTokens },
  }
}
