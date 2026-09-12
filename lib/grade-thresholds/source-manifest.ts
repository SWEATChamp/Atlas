import type { CambridgeThresholdSource } from './types'

export const JUNE_2026_THRESHOLD_INDEX_URL =
  'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/grade-threshold-tables/june-2026/'

export const CAMBRIDGE_JUNE_2026_SOURCES = [
  {
    syllabusCode: '9709',
    syllabusName: 'Mathematics',
    qualificationTitle: 'Cambridge International AS & A Level Mathematics (9709)',
    year: 2026,
    series: 'june',
    indexUrl: JUNE_2026_THRESHOLD_INDEX_URL,
    pdfUrl:
      'https://www.cambridgeinternational.org/Images/761530-mathematics-9709-june-2026-grade-threshold-table.pdf',
    expectedChecksumSha256: '1b277a4090965f8d3a7d1f80973952f87521d17b398754f26f695bcfdf46ddab',
    expectedIdentityLines: [
      'Grade thresholds – June 2026',
      'Cambridge International AS & A Level Mathematics (9709)',
      'Component grade thresholds for syllabus 9709 (Mathematics) in the June 2026 exam series.',
    ],
    carryForwardTokens: ['80', '81', '82', '83', '84', '85', '86', '87', '88', '89', '92', '93', '94', '95', '96', '97', '98', '99'],
    carryForwardTokenBasis: 'reviewed-structural-mapping',
    expectedStructure: {
      pageCount: 4,
      rowCounts: { component: 30, 'a-level-linear': 10, 'a-level-staged': 27, 'as-level': 15 },
    },
    goldenFixtures: [
      { kind: 'component', component: '12', maximumMark: 75, thresholds: { A: 61, B: 51, C: 37, D: 23, E: 10 } },
      { kind: 'combination', section: 'a-level-staged', combination: '33, 43, 99', maximumMark: 250, thresholds: { 'A*': 230, A: 211, B: 186, C: 152, D: 118, E: 84 } },
      { kind: 'combination', section: 'as-level', combination: '12, 22', maximumMark: 125, thresholds: { a: 101, b: 87, c: 67, d: 47, e: 27 } },
    ],
  },
  {
    syllabusCode: '9231',
    syllabusName: 'Further Mathematics',
    qualificationTitle: 'Cambridge International AS & A Level Further Mathematics (9231)',
    year: 2026,
    series: 'june',
    indexUrl: JUNE_2026_THRESHOLD_INDEX_URL,
    pdfUrl:
      'https://www.cambridgeinternational.org/Images/761495-further-mathematics-a-level-9231-june-2026-grade-threshold-table.pdf',
    expectedChecksumSha256: '987ccee47b348f8ae0d3a2f398790616a9fc6aa5851d6c279482aed220eaf0af',
    expectedIdentityLines: [
      'Grade thresholds – June 2026',
      'Cambridge International AS & A Level Further Mathematics (9231)',
      'Component grade thresholds for syllabus 9231 (Further Mathematics) in the June 2026 exam series.',
    ],
    carryForwardTokens: ['62', '63', '72', '73', '80', '81', '84', '85', '86', '87', '88', '89', '91', '92', '94', '95', '96', '97', '98', '99'],
    carryForwardTokenBasis: 'reviewed-structural-mapping',
    expectedStructure: {
      pageCount: 4,
      rowCounts: { component: 20, 'a-level-linear': 5, 'a-level-staged': 26, 'as-level': 10 },
    },
    goldenFixtures: [
      { kind: 'component', component: '43', maximumMark: 50, thresholds: { A: 41, B: 34, C: 30, D: 25, E: 19 } },
      { kind: 'combination', section: 'a-level-linear', combination: '14, 24, 34, 44', maximumMark: 250, thresholds: { 'A*': 217, A: 185, B: 151, C: 128, D: 106, E: 84 } },
    ],
  },
  {
    syllabusCode: '9702',
    syllabusName: 'Physics',
    qualificationTitle: 'Cambridge International AS & A Level Physics (9702)',
    year: 2026,
    series: 'june',
    indexUrl: JUNE_2026_THRESHOLD_INDEX_URL,
    pdfUrl:
      'https://www.cambridgeinternational.org/Images/761526-physics-9702-june-2026-grade-threshold-table.pdf',
    expectedChecksumSha256: '211cfe1b7997bd6ff44e2e221e6d21f0188b3a0ff3615cd902e5692eaf7c8feb',
    expectedIdentityLines: [
      'Grade thresholds – June 2026',
      'Cambridge International AS & A Level Physics (9702)',
      'Component grade thresholds for syllabus 9702 (Physics) in the June 2026 exam series.',
    ],
    carryForwardTokens: ['62', '63', '72', '73', '80', '84', '85', '86', '87', '88', '94', '95', '96', '98', '99'],
    carryForwardTokenBasis: 'reviewed-structural-mapping',
    expectedStructure: {
      pageCount: 3,
      rowCounts: { component: 25, 'a-level-linear': 8, 'a-level-staged': 20, 'as-level': 8 },
    },
    goldenFixtures: [
      { kind: 'component', component: '42', maximumMark: 100, thresholds: { A: 62, B: 51, C: 41, D: 31, E: 21 } },
      { kind: 'combination', section: 'a-level-linear', combination: '12, 22, 33, 42, 52', maximumMark: 260, thresholds: { 'A*': 203, A: 177, B: 151, C: 126, D: 101, E: 76 } },
    ],
  },
  {
    syllabusCode: '9701',
    syllabusName: 'Chemistry',
    qualificationTitle: 'Cambridge International AS & A Level Chemistry (9701)',
    year: 2026,
    series: 'june',
    indexUrl: JUNE_2026_THRESHOLD_INDEX_URL,
    pdfUrl:
      'https://www.cambridgeinternational.org/Images/761525-chemistry-9701-june-2026-grade-threshold-table.pdf',
    expectedChecksumSha256: '3ecf1e2e1f8adc21efdf0146293d9aecdf741bf80285d4d8cf80ac0882e1104a',
    expectedIdentityLines: [
      'Grade thresholds – June 2026',
      'Cambridge International AS & A Level Chemistry (9701)',
      'Component grade thresholds for syllabus 9701 (Chemistry) in the June 2026 exam series.',
    ],
    carryForwardTokens: ['62', '63', '72', '73', '80', '84', '85', '86', '87', '88', '94', '95', '96', '98', '99'],
    carryForwardTokenBasis: 'reviewed-structural-mapping',
    expectedStructure: {
      pageCount: 3,
      rowCounts: { component: 25, 'a-level-linear': 8, 'a-level-staged': 20, 'as-level': 8 },
    },
    goldenFixtures: [
      { kind: 'component', component: '12', maximumMark: 40, thresholds: { A: 25, B: 22, C: 18, D: 14, E: 11 } },
      { kind: 'combination', section: 'a-level-staged', combination: '42, 52, 99', maximumMark: 260, thresholds: { 'A*': 208, A: 176, B: 144, C: 120, D: 96, E: 73 } },
    ],
  },
  {
    syllabusCode: '9618',
    syllabusName: 'Computer Science',
    qualificationTitle: 'Cambridge International AS & A Level Computer Science (9618)',
    year: 2026,
    series: 'june',
    indexUrl: JUNE_2026_THRESHOLD_INDEX_URL,
    pdfUrl:
      'https://www.cambridgeinternational.org/Images/761508-computer-science-9618-june-2026-grade-threshold-table.pdf',
    expectedChecksumSha256: '6140b3b0b508ce28ac32c7f1522094c267d18ac60a1ac41f82f485db34527f6c',
    expectedIdentityLines: [
      'Grade thresholds – June 2026',
      'Cambridge International AS & A Level Computer Science (9618)',
      'Component grade thresholds for syllabus 9618 (Computer Science) in the June 2026 exam series.',
    ],
    carryForwardTokens: ['80', '87', '88', '89', '95', '97', '98', '99'],
    carryForwardTokenBasis: 'reviewed-structural-mapping',
    expectedStructure: {
      pageCount: 2,
      rowCounts: { component: 14, 'a-level-linear': 4, 'a-level-staged': 11, 'as-level': 4 },
    },
    goldenFixtures: [
      { kind: 'component', component: '13', maximumMark: 75, thresholds: { A: 53, B: 47, C: 40, D: 33, E: 26 } },
      { kind: 'combination', section: 'a-level-linear', combination: '13, 23, 33, 43', maximumMark: 300, thresholds: { 'A*': 250, A: 216, B: 182, C: 153, D: 124, E: 96 } },
    ],
  },
] as const satisfies readonly CambridgeThresholdSource[]

export function getCambridgeThresholdSource(syllabusCode: string): CambridgeThresholdSource | undefined {
  return CAMBRIDGE_JUNE_2026_SOURCES.find((source) => source.syllabusCode === syllabusCode)
}
