import type {
  CambridgeThresholdSource,
  PdfExtraction,
  PdfTextItem,
} from '../../lib/grade-thresholds/types'
import { CAMBRIDGE_WEIGHTING_SOURCE } from '../../lib/grade-thresholds/weighting-source'

const line = (page: number, y: number, tokens: readonly string[]): PdfTextItem[] =>
  tokens.map((text, index) => ({ page, text, x: 40 + index * 70, y, width: 60, height: 10 }))

export const SYNTHETIC_SOURCE: CambridgeThresholdSource = {
  syllabusCode: '0000',
  syllabusName: 'Synthetic Studies',
  qualificationTitle: 'Cambridge International AS & A Level Synthetic Studies (0000)',
  year: 2026,
  series: 'june',
  indexUrl: 'https://example.invalid/june-2026/',
  pdfUrl: 'https://example.invalid/synthetic.pdf',
  expectedChecksumSha256: 'synthetic-checksum',
  expectedIdentityLines: [
    'Grade thresholds – June 2026',
    'Cambridge International AS & A Level Synthetic Studies (0000)',
    'Component grade thresholds for syllabus 0000 (Synthetic Studies) in the June 2026 exam series.',
  ],
  carryForwardTokens: ['87', '99'],
  carryForwardTokenBasis: 'reviewed-structural-mapping',
  expectedStructure: {
    pageCount: 3,
    rowCounts: { component: 9, 'a-level-linear': 2, 'a-level-staged': 2, 'as-level': 2 },
  },
  goldenFixtures: [
    { kind: 'component', component: '11', maximumMark: 75, thresholds: { A: 60, B: 50, C: 40, D: 30, E: 20 } },
    { kind: 'combination', section: 'a-level-staged', combination: '31, 41, 87', maximumMark: 250, thresholds: { 'A*': 220, A: 200, B: 180, C: 160, D: 140, E: 120 } },
  ],
}

export function validCoordinateExtraction(): PdfExtraction {
  return {
    pageCount: 3,
    items: [
      ...line(1, 780, ['Grade thresholds – June 2026']),
      ...line(1, 760, ['Cambridge International AS & A Level Synthetic Studies (0000)']),
      ...line(1, 740, ['Component grade thresholds']),
      ...line(1, 720, ['Component grade thresholds for syllabus 0000 (Synthetic Studies) in the June 2026 exam series.']),
      ...line(1, 700, ['Component', 'Maximum raw', 'mark A B C D E']),
      ...line(1, 680, ['Component', '11', '75', '60', '50', '40', '30', '20']),
      ...line(1, 660, ['Component', '12', '75', '61', '51', '41', '31', '21']),
      ...line(1, 650, ['Component', '21', '50', '40', '35', '30', '25', '20']),
      ...line(1, 640, ['Component', '22', '50', '41', '36', '31', '26', '21']),
      ...line(1, 630, ['Component', '31', '75', '58', '48', '38', '28', '18']),
      ...line(1, 620, ['Component', '32', '75', '57', '47', '37', '27', '17']),
      ...line(1, 610, ['Component', '41', '50', '40', '34', '28', '22', '16']),
      ...line(1, 600, ['Component', '42', '50', '39', '33', '27', '21', '15']),
      ...line(1, 590, ['Component', '50', '75', '60', '50', '40', '30', '20']),
      ...line(1, 550, ['Cambridge International A Level (linear assessment)']),
      ...line(1, 530, ['Combination of', 'components', 'Maximum weighted', 'mark', 'A* A B C D E']),
      ...line(1, 510, ['11, 21, 31, 41', '250', '220', '200', '180', '160', '140', '120']),
      ...line(1, 490, ['12, 22, 32, 42', '250', '218', '198', '178', '158', '138', '118']),
      ...line(2, 780, ['Grade thresholds continued']),
      ...line(2, 760, ['Cambridge International AS & A Level Synthetic Studies (0000)']),
      ...line(2, 720, ['Cambridge International A Level (staged assessment)']),
      ...line(2, 700, ['Combination of', 'components', 'Maximum weighted', 'mark', 'A* A B C D E']),
      ...line(2, 680, ['31, 41, 87', '250', '220', '200', '180', '160', '140', '120']),
      ...line(2, 660, ['32, 42, 99', '250', '219', '199', '179', '159', '139', '119']),
      ...line(3, 780, ['Grade thresholds continued']),
      ...line(3, 760, ['Cambridge International AS & A Level Synthetic Studies (0000)']),
      ...line(3, 720, ['Cambridge International AS Level']),
      ...line(3, 700, ['Combination of', 'components', 'Maximum weighted', 'mark', 'a b c d e']),
      ...line(3, 680, ['11, 21', '125', '100', '80', '60', '40', '20']),
      ...line(3, 660, ['50', '75', '60', '50', '40', '30', '20']),
      ...line(3, 620, ['Note for regions that receive percentage uniform marks (PUMs):']),
      ...line(3, 600, ['This narrative contains 2026 but is not a threshold row.']),
    ],
  }
}

export function createSyntheticWeightingExtraction(options?: {
  pageCount?: number
  omitIdentity?: boolean
  modifyRow?: (row: string) => string
  extraRow?: string
  alterSyllabusRowCount?: { syllabus: string; count: number }
}): PdfExtraction {
  const pageCount = options?.pageCount ?? CAMBRIDGE_WEIGHTING_SOURCE.expectedPageCount
  const items: PdfTextItem[] = []

  if (!options?.omitIdentity) {
    items.push({
      page: 1,
      y: 820,
      x: 50,
      text: 'Syllabus component weighting factors',
      width: 250,
      height: 12,
    })
    items.push({
      page: 1,
      y: 800,
      x: 50,
      text: 'November 2025, March 2026 and June 2026',
      width: 250,
      height: 12,
    })
  }

  let y = 780
  let page = 1

  for (const [syllabusCode, expectedRows] of Object.entries(CAMBRIDGE_WEIGHTING_SOURCE.june2026ExpectedRows)) {
    const goldens = CAMBRIDGE_WEIGHTING_SOURCE.june2026GoldenFactors.filter((g) => g.syllabusCode === syllabusCode)
    const goldenComps = new Set<string>(goldens.map((g) => g.component))

    let rowsToEmit: number = expectedRows
    if (options?.alterSyllabusRowCount && options.alterSyllabusRowCount.syllabus === syllabusCode) {
      rowsToEmit = options.alterSyllabusRowCount.count
    }

    const components: Array<{ component: string; raw: number; weighted: number; factor: number }> = []
    for (const g of goldens) {
      components.push({
        component: g.component,
        raw: g.maximumRawMark,
        weighted: g.maximumWeightedMark,
        factor: g.factor,
      })
    }

    let compNum = 11
    while (components.length < rowsToEmit) {
      const compStr = String(compNum).padStart(2, '0')
      compNum++
      if (!goldenComps.has(compStr)) {
        components.push({ component: compStr, raw: 100, weighted: 100, factor: 1.0 })
      }
    }

    for (const comp of components) {
      let rowText = `June 2026 ${syllabusCode} ${comp.component} ${comp.raw} ${comp.weighted} ${comp.factor}`
      if (options?.modifyRow) {
        rowText = options.modifyRow(rowText)
      }
      items.push({
        page,
        y,
        x: 50,
        text: rowText,
        width: 300,
        height: 10,
      })
      y -= 12
      if (y < 50) {
        y = 780
        page = Math.min(page + 1, pageCount)
      }
    }
  }

  if (options?.extraRow) {
    items.push({
      page: 1,
      y: y - 12,
      x: 50,
      text: options.extraRow,
      width: 300,
      height: 10,
    })
  }

  return { items, pageCount }
}
