import { createHash } from 'node:crypto'
import { reconstructRows } from './pdf-extraction'
import type {
  ALevelGrade,
  ASLevelGrade,
  CambridgeThresholdSource,
  CombinationThreshold,
  ComponentGrade,
  ComponentThreshold,
  GoldenFixture,
  ParsedThresholdPublication,
  ParsedThresholdRow,
  ParserIssue,
  PdfExtraction,
  ReconstructedRow,
  ThresholdGrade,
  ThresholdParseOptions,
  ThresholdParseResult,
  ThresholdSection,
} from './types'

const COMPONENT_GRADES: readonly ComponentGrade[] = ['A', 'B', 'C', 'D', 'E']
const A_LEVEL_GRADES: readonly ALevelGrade[] = ['A*', 'A', 'B', 'C', 'D', 'E']
const AS_LEVEL_GRADES: readonly ASLevelGrade[] = ['a', 'b', 'c', 'd', 'e']

const SECTION_HEADINGS: ReadonlyArray<readonly [RegExp, ThresholdSection]> = [
  [/^Component grade thresholds$/, 'component'],
  [/^Cambridge International A Level \(linear assessment\)$/, 'a-level-linear'],
  [/^Cambridge International A Level \(staged assessment\)$/, 'a-level-staged'],
  [/^Cambridge International AS Level$/, 'as-level'],
]

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function parseCambridgeThresholdPdf(
  bytes: Uint8Array,
  source: CambridgeThresholdSource,
  options: ThresholdParseOptions,
): Promise<ThresholdParseResult> {
  // This is intentionally the first operation. No extractor sees bytes until their identity is known.
  const checksumSha256 = sha256Hex(bytes)
  if (options.alreadyImportedPublications?.some((publication) =>
    publication.syllabusCode === source.syllabusCode &&
    publication.year === source.year &&
    publication.series === source.series &&
    publication.checksumSha256 === checksumSha256,
  )) {
    return { status: 'duplicate', checksumSha256 }
  }

  const earlyIssues: ParserIssue[] = []
  if (options.contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/pdf') {
    earlyIssues.push({ code: 'non-pdf-metadata', message: `Expected application/pdf metadata, received ${options.contentType}.` })
  }
  if (!hasPdfMagic(bytes)) {
    earlyIssues.push({ code: 'not-pdf', message: 'Source bytes do not begin with the PDF signature.' })
  }
  if (checksumSha256 !== source.expectedChecksumSha256) {
    earlyIssues.push({
      code: 'checksum-mismatch',
      message: `Expected SHA-256 ${source.expectedChecksumSha256}, received ${checksumSha256}.`,
    })
  }
  if (earlyIssues.length > 0) {
    return { status: 'parsed', publication: invalidPublication(source, checksumSha256, 0, earlyIssues) }
  }

  const extraction = await options.extract(bytes)
  return {
    status: 'parsed',
    publication: parseCambridgeThresholdItems(extraction, source, checksumSha256),
  }
}

export function parseCambridgeThresholdItems(
  extraction: PdfExtraction,
  source: CambridgeThresholdSource,
  checksumSha256 = source.expectedChecksumSha256,
): ParsedThresholdPublication {
  const issues: ParserIssue[] = []
  const reconstructed = reconstructRows(extraction.items)
  const documentText = reconstructed.map((row) => row.text).join('\n')

  if (extraction.pageCount !== source.expectedStructure.pageCount) {
    issues.push({
      code: 'wrong-page-count',
      message: `Expected ${source.expectedStructure.pageCount} pages, received ${extraction.pageCount}.`,
    })
  }
  for (const identity of source.expectedIdentityLines) {
    if (!documentText.includes(identity)) {
      issues.push({ code: 'wrong-identity', message: `Missing expected identity text: ${identity}` })
    }
  }

  const rows = classifyCombinationTokens(parseRows(reconstructed, issues), source)
  validateTokenClassifications(rows, issues)
  validateDuplicates(rows, issues)
  validateStructure(rows, source, issues)
  validateGoldenFixtures(rows, source.goldenFixtures, issues)

  return {
    syllabusCode: source.syllabusCode,
    syllabusName: source.syllabusName,
    year: source.year,
    series: source.series,
    checksumSha256,
    pageCount: extraction.pageCount,
    rows,
    validation: issues.length === 0 ? { status: 'valid', issues: [] } : { status: 'invalid', issues },
  }
}

function invalidPublication(
  source: CambridgeThresholdSource,
  checksumSha256: string,
  pageCount: number,
  issues: readonly ParserIssue[],
): ParsedThresholdPublication {
  return {
    syllabusCode: source.syllabusCode,
    syllabusName: source.syllabusName,
    year: source.year,
    series: source.series,
    checksumSha256,
    pageCount,
    rows: [],
    validation: { status: 'invalid', issues },
  }
}

function hasPdfMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
}

function parseRows(reconstructed: readonly ReconstructedRow[], issues: ParserIssue[]): ParsedThresholdRow[] {
  const parsed: ParsedThresholdRow[] = []
  let section: ThresholdSection | 'preamble' | 'footnote' = 'preamble'
  let hasColumns = false

  for (const row of reconstructed) {
    const heading = SECTION_HEADINGS.find(([pattern]) => pattern.test(row.text))
    if (heading) {
      section = heading[1]
      hasColumns = false
      continue
    }
    if (row.text.startsWith('Note for regions that receive percentage uniform marks')) {
      section = 'footnote'
      continue
    }
    if (section === 'footnote') continue
    if (section === 'preamble') {
      flagUnexpectedNumericalRow(row, issues)
      continue
    }
    if (isGradeHeader(row.text, section)) {
      hasColumns = true
      continue
    }
    if (isHeaderOrRepeatedPageFurniture(row.text)) {
      continue
    }

    const numeric = section === 'component'
      ? parseComponentRow(row, hasColumns, issues)
      : parseCombinationRow(row, section, hasColumns, issues)
    if (numeric) parsed.push(numeric)
    else flagUnexpectedNumericalRow(row, issues)
  }

  return parsed
}

function isHeaderOrRepeatedPageFurniture(text: string): boolean {
  return /^(Grade thresholds continued|Cambridge International AS & A Level|© Cambridge|Syllabus grade thresholds|Syllabus grade thresholds for|Minimum raw mark required|Component Maximum raw|Component A B C D E|mark A B C D E|Combination of|components$|Maximum$|weighted(?: A\* A B C D E| a b c d e)?$|mark$|A\* A B C D E$|a b c d e$|Grade A\* does not exist|Your candidates|report \(CMR\)|Some Cambridge|candidates are|taken\.|Learn more!|Services on)/.test(text)
}

function isGradeHeader(text: string, section: ThresholdSection): boolean {
  if (section === 'component') return text === 'mark A B C D E' || text.endsWith(' A B C D E')
  if (section === 'as-level') return text === 'a b c d e' || text.endsWith(' a b c d e')
  return text === 'A* A B C D E' || text.endsWith(' A* A B C D E')
}

function parseComponentRow(
  row: ReconstructedRow,
  hasColumns: boolean,
  issues: ParserIssue[],
): ComponentThreshold | null {
  if (!/^Component\s+\d{2}\b/.test(row.text)) return null
  if (!hasColumns) addRowIssue(issues, 'malformed-columns', 'Component row appeared before its grade columns.', row)
  const values = row.text.match(/^Component\s+(\d{2})\s+(-?\d+)\s+(.+)$/)
  if (!values) {
    addRowIssue(issues, 'malformed-columns', 'Malformed component row.', row)
    return null
  }
  const grades = parseIntegerTail(values[3])
  if (!grades || grades.length !== COMPONENT_GRADES.length) {
    addRowIssue(issues, 'wrong-grade-count', 'Component rows require exactly five A–E thresholds.', row)
    return null
  }
  const maximumRawMark = Number(values[2])
  validateThresholdValues(maximumRawMark, grades, row, issues)
  return {
    kind: 'component',
    component: values[1],
    maximumRawMark,
    thresholds: recordThresholds(COMPONENT_GRADES, grades),
    officialWeighting: null,
    source: sourceLocation(row),
  }
}

function parseCombinationRow(
  row: ReconstructedRow,
  section: Exclude<ThresholdSection, 'component'>,
  hasColumns: boolean,
  issues: ParserIssue[],
): CombinationThreshold | null {
  if (!/^\d{2}(?:\s*,\s*\d{2})*\s+-?\d+\b/.test(row.text)) return null
  if (!hasColumns) addRowIssue(issues, 'malformed-columns', 'Combination row appeared before its grade columns.', row)
  const values = row.text.match(/^(\d{2}(?:\s*,\s*\d{2})*)\s+(-?\d+)\s+(.+)$/)
  if (!values) {
    addRowIssue(issues, 'malformed-columns', 'Malformed combination row.', row)
    return null
  }
  const gradeOrder = section === 'as-level' ? AS_LEVEL_GRADES : A_LEVEL_GRADES
  const grades = parseIntegerTail(values[3])
  if (!grades || grades.length !== gradeOrder.length) {
    addRowIssue(issues, 'wrong-grade-count', `Section ${section} requires exactly ${gradeOrder.length} thresholds.`, row)
    return null
  }
  const maximumMark = Number(values[2])
  validateThresholdValues(maximumMark, grades, row, issues)
  const rawCombinationTokens = values[1].split(',').map((token) => token.trim())
  return {
    kind: 'combination',
    section,
    combination: rawCombinationTokens.join(', '),
    components: rawCombinationTokens.map((raw) => ({
      raw,
      kind: 'unresolved',
    })),
    maximumMark,
    maximumMarkBasis: 'weighted',
    thresholds: recordThresholds(gradeOrder, grades),
    // A combined maximum does not prove token-level weighting factors.
    officialWeighting: null,
    source: sourceLocation(row),
  }
}

function parseIntegerTail(value: string): number[] | null {
  const tokens = value.trim().split(/\s+/)
  if (!tokens.every((token) => /^-?\d+$/.test(token))) return null
  return tokens.map(Number)
}

function recordThresholds<G extends ThresholdGrade>(grades: readonly G[], values: readonly number[]): Record<G, number> {
  return Object.fromEntries(grades.map((grade, index) => [grade, values[index]])) as Record<G, number>
}

function validateThresholdValues(
  maximum: number,
  values: readonly number[],
  row: ReconstructedRow,
  issues: ParserIssue[],
): void {
  if (maximum <= 0 || values.some((value) => value < 0 || value > maximum)) {
    addRowIssue(issues, 'out-of-range-threshold', 'Maximum and thresholds must be non-negative and thresholds cannot exceed the maximum.', row)
  }
  if (values.some((value, index) => index > 0 && values[index - 1] < value)) {
    addRowIssue(issues, 'non-monotonic-thresholds', 'Thresholds must not increase from higher to lower grades.', row)
  }
}

function flagUnexpectedNumericalRow(row: ReconstructedRow, issues: ParserIssue[]): void {
  if (/\b\d{2,}\b/.test(row.text) && !isExpectedNarrative(row.text)) {
    addRowIssue(issues, 'unexpected-numerical-row', 'Unexpected numerical row or layout.', row)
  }
}

function isExpectedNarrative(text: string): boolean {
  return /^(Grade thresholds –|Cambridge International AS & A Level|Component grade thresholds for syllabus|Syllabus .*rade thresholds for .*yllabus|©|Learn more!|Services on|Statements of Results|AS & A Level subjects|See our guide)/.test(text)
}

function validateDuplicates(rows: readonly ParsedThresholdRow[], issues: ParserIssue[]): void {
  const seen = new Map<string, string>()
  for (const row of rows) {
    const key = row.kind === 'component' ? `component:${row.component}` : `${row.section}:${row.combination}`
    const value = row.kind === 'component'
      ? JSON.stringify([row.maximumRawMark, row.thresholds])
      : JSON.stringify([row.maximumMark, row.thresholds])
    const previous = seen.get(key)
    if (previous && previous !== value) {
      issues.push({ code: 'conflicting-duplicate', message: `Conflicting duplicate threshold row: ${key}.` })
    }
    seen.set(key, value)
  }
}

function classifyCombinationTokens(
  rows: readonly ParsedThresholdRow[],
  source: CambridgeThresholdSource,
): ParsedThresholdRow[] {
  const componentVariants = new Set(
    rows.filter((row): row is ComponentThreshold => row.kind === 'component').map((row) => row.component),
  )
  const carryForwardTokens = new Set(source.carryForwardTokens)
  return rows.map((row) => row.kind === 'component' ? row : {
    ...row,
    components: row.components.map((token) => ({
      ...token,
      kind: componentVariants.has(token.raw)
        ? 'component_variant'
        : carryForwardTokens.has(token.raw)
          ? 'carry_forward'
          : 'unresolved',
    })),
  })
}

function validateTokenClassifications(rows: readonly ParsedThresholdRow[], issues: ParserIssue[]): void {
  for (const row of rows) {
    if (row.kind !== 'combination') continue
    const unresolved = row.components.filter((token) => token.kind === 'unresolved')
    if (unresolved.length > 0) {
      issues.push({
        code: 'unresolved-combination-token',
        message: `Combination ${row.combination} has unresolved token(s): ${unresolved.map((token) => token.raw).join(', ')}.`,
        page: row.source.page,
        reconstructedRow: row.source.reconstructedRow,
      })
    }
  }
}

function validateStructure(
  rows: readonly ParsedThresholdRow[],
  source: CambridgeThresholdSource,
  issues: ParserIssue[],
): void {
  for (const section of Object.keys(source.expectedStructure.rowCounts) as ThresholdSection[]) {
    const count = rows.filter((row) => row.kind === 'component' ? section === 'component' : row.section === section).length
    const expected = source.expectedStructure.rowCounts[section]
    if (count === 0) issues.push({ code: 'missing-section', message: `No rows parsed for ${section}.` })
    if (count !== expected) {
      issues.push({ code: 'row-count-mismatch', message: `Expected ${expected} ${section} rows, parsed ${count}.` })
    }
  }
}

function validateGoldenFixtures(
  rows: readonly ParsedThresholdRow[],
  fixtures: readonly GoldenFixture[],
  issues: ParserIssue[],
): void {
  for (const fixture of fixtures) {
    const match = rows.find((row) => fixture.kind === 'component'
      ? row.kind === 'component' && row.component === fixture.component
      : row.kind === 'combination' && row.section === fixture.section && row.combination === fixture.combination)
    const matches = match && fixture.kind === 'component' && match.kind === 'component'
      ? match.maximumRawMark === fixture.maximumMark && equalThresholds(match.thresholds, fixture.thresholds)
      : match && fixture.kind === 'combination' && match.kind === 'combination'
        ? match.maximumMark === fixture.maximumMark && equalThresholds(match.thresholds, fixture.thresholds)
        : false
    if (!matches) {
      issues.push({ code: 'golden-fixture-mismatch', message: `Golden fixture did not match: ${describeFixture(fixture)}.` })
    }
  }
}

function equalThresholds(
  actual: Readonly<Partial<Record<ThresholdGrade, number>>>,
  expected: Readonly<Partial<Record<ThresholdGrade, number>>>,
): boolean {
  return Object.entries(expected).every(([grade, value]) => actual[grade as ThresholdGrade] === value)
}

function describeFixture(fixture: GoldenFixture): string {
  return fixture.kind === 'component' ? `component ${fixture.component}` : `${fixture.section} ${fixture.combination}`
}

function sourceLocation(row: ReconstructedRow) {
  return { page: row.page, reconstructedRow: row.text, rawTokens: row.rawTokens }
}

function addRowIssue(
  issues: ParserIssue[],
  code: ParserIssue['code'],
  message: string,
  row: ReconstructedRow,
): void {
  issues.push({ code, message, page: row.page, reconstructedRow: row.text })
}
