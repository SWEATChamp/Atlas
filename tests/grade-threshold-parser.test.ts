import { describe, expect, test, vi } from 'vitest'
import {
  CAMBRIDGE_JUNE_2026_SOURCES,
  parseCambridgeThresholdItems,
  parseCambridgeThresholdPdf,
  parseCambridgeWeightingItems,
  parseCambridgeWeightingRow,
  reconstructRows,
  sha256Hex,
} from '../lib/grade-thresholds'
import type { PdfExtraction, PdfTextItem } from '../lib/grade-thresholds'
import {
  SYNTHETIC_SOURCE,
  createSyntheticWeightingExtraction,
  validCoordinateExtraction,
} from './fixtures/grade-threshold-coordinates'

describe('Cambridge grade-threshold source manifest', () => {
  test('pins five official June 2026 publications and strict structural metadata', () => {
    expect(CAMBRIDGE_JUNE_2026_SOURCES.map((source) => source.syllabusCode)).toEqual([
      '9709', '9231', '9702', '9701', '9618',
    ])
    expect(CAMBRIDGE_JUNE_2026_SOURCES.map((source) => source.expectedStructure.pageCount)).toEqual([4, 4, 3, 3, 2])
    expect(CAMBRIDGE_JUNE_2026_SOURCES.every((source) =>
      source.indexUrl.startsWith('https://www.cambridgeinternational.org/') &&
      source.pdfUrl.startsWith('https://www.cambridgeinternational.org/Images/') &&
      /^[a-f0-9]{64}$/.test(source.expectedChecksumSha256),
    )).toBe(true)
  })

  test('does not invent 2026 component weighting provenance', () => {
    const parsed = parseCambridgeThresholdItems(validCoordinateExtraction(), SYNTHETIC_SOURCE)
    expect(parsed.rows.every((row) => row.officialWeighting === null)).toBe(true)
  })

  test('pins reviewed carry-forward mappings per official source without digit heuristics', () => {
    const mappings = Object.fromEntries(
      CAMBRIDGE_JUNE_2026_SOURCES.map((source) => [source.syllabusCode, source.carryForwardTokens]),
    )
    expect(mappings).toEqual({
      '9709': ['80', '81', '82', '83', '84', '85', '86', '87', '88', '89', '92', '93', '94', '95', '96', '97', '98', '99'],
      '9231': ['62', '63', '72', '73', '80', '81', '84', '85', '86', '87', '88', '89', '91', '92', '94', '95', '96', '97', '98', '99'],
      '9702': ['62', '63', '72', '73', '80', '84', '85', '86', '87', '88', '94', '95', '96', '98', '99'],
      '9701': ['62', '63', '72', '73', '80', '84', '85', '86', '87', '88', '94', '95', '96', '98', '99'],
      '9618': ['80', '87', '88', '89', '95', '97', '98', '99'],
    })
  })
})

describe('official weighting enrichment row parser', () => {
  test('parses a coordinate-reconstructed June 2026 factor without enriching threshold rows', () => {
    const row = parseCambridgeWeightingRow({
      page: 86,
      text: 'June 2026 9702 31 40 30 0.75',
      rawTokens: ['June 2026', '9702', '31', '40', '30', '0.75'],
    })
    expect(row).toMatchObject({ syllabusCode: '9702', component: '31', maximumRawMark: 40, maximumWeightedMark: 30, factor: 0.75 })
    expect(row?.source.rawTokens).toEqual(['June 2026', '9702', '31', '40', '30', '0.75'])
    expect(parseCambridgeWeightingRow({ page: 1, text: 'June 2026 9702 malformed', rawTokens: [] })).toBeNull()
  })
})

describe('geometric row reconstruction', () => {
  test('groups nearby y coordinates, preserves ordered raw tokens, and separates pages', () => {
    const items: PdfTextItem[] = [
      { page: 2, text: 'page-two', x: 10, y: 700, width: 20, height: 10 },
      { page: 1, text: '84/87/99', x: 90, y: 699.2, width: 30, height: 10 },
      { page: 1, text: 'tokens', x: 10, y: 700, width: 30, height: 10 },
    ]
    const rows = reconstructRows(items)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ page: 1, rawTokens: ['tokens', '84/87/99'], text: 'tokens 84/87/99' })
    expect(rows[1]).toMatchObject({ page: 2, rawTokens: ['page-two'] })
  })
})

describe('deterministic Cambridge threshold state machine', () => {
  test('handles repeated page furniture and preserves opaque tokens without heuristic classification', () => {
    const parsed = parseCambridgeThresholdItems(validCoordinateExtraction(), SYNTHETIC_SOURCE)
    expect(parsed.validation).toEqual({ status: 'valid', issues: [] })
    const staged = parsed.rows.find((row) => row.kind === 'combination' && row.combination === '31, 41, 87')
    expect(staged).toMatchObject({
      kind: 'combination',
      section: 'a-level-staged',
      components: [
        { raw: '31', kind: 'component_variant' },
        { raw: '41', kind: 'component_variant' },
        { raw: '87', kind: 'carry_forward' },
      ],
      source: { page: 2, rawTokens: ['31, 41, 87', '250', '220', '200', '180', '160', '140', '120'] },
    })
  })

  test('does not classify tokens by digits or suffixes and blocks unresolved tokens', () => {
    const source = { ...SYNTHETIC_SOURCE, carryForwardTokens: ['87'] }
    const parsed = parseCambridgeThresholdItems(validCoordinateExtraction(), source)
    const row = parsed.rows.find((candidate) => candidate.kind === 'combination' && candidate.combination === '32, 42, 99')
    expect(row?.kind).toBe('combination')
    if (!row || row.kind !== 'combination') throw new Error('Expected combination fixture')
    expect(row.components).toEqual([
      { raw: '32', kind: 'component_variant' },
      { raw: '42', kind: 'component_variant' },
      { raw: '99', kind: 'unresolved' },
    ])
    expect(parsed.validation.issues.some((issue) => issue.code === 'unresolved-combination-token')).toBe(true)
  })

  test('never creates a component-level A* threshold', () => {
    const parsed = parseCambridgeThresholdItems(validCoordinateExtraction(), SYNTHETIC_SOURCE)
    const component = parsed.rows.find((row) => row.kind === 'component')
    expect(component?.thresholds).toEqual({ A: 60, B: 50, C: 40, D: 30, E: 20 })
    expect(component && 'A*' in component.thresholds).toBe(false)
  })
})

describe('hash-first input gate', () => {
  const bytes = new TextEncoder().encode('%PDF-synthetic')

  test('returns a repeated checksum as a no-op before extraction', async () => {
    const checksum = sha256Hex(bytes)
    const extract = vi.fn<() => Promise<PdfExtraction>>()
    const result = await parseCambridgeThresholdPdf(
      bytes,
      { ...SYNTHETIC_SOURCE, expectedChecksumSha256: checksum },
      {
        alreadyImportedPublications: [{ syllabusCode: '0000', year: 2026, series: 'june', checksumSha256: checksum }],
        contentType: 'application/pdf',
        extract,
      },
    )
    expect(result).toEqual({ status: 'duplicate', checksumSha256: checksum })
    expect(extract).not.toHaveBeenCalled()
  })

  test('does not treat another syllabus with a known checksum as a duplicate', async () => {
    const checksum = sha256Hex(bytes)
    const extract = vi.fn(async () => validCoordinateExtraction())
    const result = await parseCambridgeThresholdPdf(
      bytes,
      { ...SYNTHETIC_SOURCE, expectedChecksumSha256: checksum },
      {
        alreadyImportedPublications: [{ syllabusCode: '9999', year: 2026, series: 'june', checksumSha256: checksum }],
        contentType: 'application/pdf',
        extract,
      },
    )
    expect(result.status).toBe('parsed')
    expect(extract).toHaveBeenCalledOnce()
  })

  test('aborts checksum and non-PDF failures before extraction', async () => {
    const extract = vi.fn<() => Promise<PdfExtraction>>()
    const result = await parseCambridgeThresholdPdf(
      new TextEncoder().encode('not a pdf'),
      SYNTHETIC_SOURCE,
      { contentType: 'text/html', extract },
    )
    expect(result.status).toBe('parsed')
    if (result.status === 'parsed') {
      expect(result.publication.validation.issues.map((issue) => issue.code)).toEqual([
        'non-pdf-metadata', 'not-pdf', 'checksum-mismatch',
      ])
    }
    expect(extract).not.toHaveBeenCalled()
  })
})

describe('strict parser validation', () => {
  test.each([
    ['wrong-grade-count', 'Component 11 75 60 50 40 30'],
    ['out-of-range-threshold', 'Component 11 75 80 50 40 30 20'],
    ['non-monotonic-thresholds', 'Component 11 75 60 65 40 30 20'],
  ])('rejects %s', (expectedCode, malformedText) => {
    const extraction = replaceRow(validCoordinateExtraction(), 'Component 11 75 60 50 40 30 20', malformedText)
    const parsed = parseCambridgeThresholdItems(extraction, SYNTHETIC_SOURCE)
    expect(parsed.validation.status).toBe('invalid')
    expect(parsed.validation.issues.some((issue) => issue.code === expectedCode)).toBe(true)
  })

  test('rejects conflicting duplicates, row-count drift, wrong identity, and golden drift', () => {
    const base = replaceRow(
      validCoordinateExtraction(),
      'Component 11 75 60 50 40 30 20',
      'Component 11 75 59 49 39 29 19',
    )
    const conflicting = fullRow(1, 670, 'Component 11 75 58 48 38 28 18')
    const extraction = {
      ...base,
      items: base.items
        .filter((item) => item.text !== 'Cambridge International AS & A Level Synthetic Studies (0000)')
        .concat(conflicting),
    }
    const parsed = parseCambridgeThresholdItems(extraction, SYNTHETIC_SOURCE)
    const codes = parsed.validation.issues.map((issue) => issue.code)
    expect(codes).toEqual(expect.arrayContaining([
      'wrong-identity', 'conflicting-duplicate', 'row-count-mismatch', 'golden-fixture-mismatch',
    ]))
  })

  test('rejects unexpected numerical layouts outside recognized tables', () => {
    const base = validCoordinateExtraction()
    const extraction = { ...base, items: base.items.concat(fullRow(3, 640, 'Unexpected totals 300 200 100')) }
    const parsed = parseCambridgeThresholdItems(extraction, SYNTHETIC_SOURCE)
    expect(parsed.validation.issues.some((issue) => issue.code === 'unexpected-numerical-row')).toBe(true)
  })
})

describe('complete weighting publication parser', () => {
  test('valid report parses all supported June 2026 syllabuses and validates successfully', () => {
    const extraction = createSyntheticWeightingExtraction()
    const parsed = parseCambridgeWeightingItems(extraction)
    expect(parsed.validation).toEqual({ status: 'valid', issues: [] })
    expect(parsed.pageCount).toBe(91)
    expect(parsed.rows).toHaveLength(48 + 40 + 40 + 40 + 22)
  })

  test('rejects identity or page count failure', () => {
    const noIdentity = parseCambridgeWeightingItems(createSyntheticWeightingExtraction({ omitIdentity: true }))
    expect(noIdentity.validation.status).toBe('invalid')
    expect(noIdentity.validation.issues.some((issue) => issue.code === 'wrong-identity')).toBe(true)

    const wrongPage = parseCambridgeWeightingItems(createSyntheticWeightingExtraction({ pageCount: 90 }))
    expect(wrongPage.validation.status).toBe('invalid')
    expect(wrongPage.validation.issues.some((issue) => issue.code === 'wrong-page-count')).toBe(true)
  })

  test('rejects row-count drift per syllabus', () => {
    const drift = parseCambridgeWeightingItems(
      createSyntheticWeightingExtraction({ alterSyllabusRowCount: { syllabus: '9709', count: 47 } }),
    )
    expect(drift.validation.status).toBe('invalid')
    expect(drift.validation.issues.some((issue) => issue.code === 'row-count-mismatch')).toBe(true)
  })

  test('rejects malformed supported rows', () => {
    const malformed = parseCambridgeWeightingItems(
      createSyntheticWeightingExtraction({ extraRow: 'June 2026 9709 malformed-row-text' }),
    )
    expect(malformed.validation.status).toBe('invalid')
    expect(malformed.validation.issues.some((issue) => issue.code === 'malformed-columns')).toBe(true)
  })

  test('rejects conflicting duplicate weighting rows', () => {
    const duplicate = parseCambridgeWeightingItems(
      createSyntheticWeightingExtraction({ extraRow: 'June 2026 9709 80 100 80 0.8' }),
    )
    expect(duplicate.validation.status).toBe('invalid')
    expect(duplicate.validation.issues.some((issue) => issue.code === 'conflicting-duplicate')).toBe(true)
  })

  test('rejects golden fixture mismatch', () => {
    const mismatch = parseCambridgeWeightingItems(
      createSyntheticWeightingExtraction({
        modifyRow: (text) => (text === 'June 2026 9709 80 100 75 0.75' ? 'June 2026 9709 80 100 80 0.8' : text),
      }),
    )
    expect(mismatch.validation.status).toBe('invalid')
    expect(mismatch.validation.issues.some((issue) => issue.code === 'golden-fixture-mismatch')).toBe(true)
  })

  test('rejects invalid maximum and factor relationship', () => {
    const invalidRel = parseCambridgeWeightingItems(
      createSyntheticWeightingExtraction({
        modifyRow: (text) => (text.includes('9709 11') ? 'June 2026 9709 11 100 70 0.75' : text),
      }),
    )
    expect(invalidRel.validation.status).toBe('invalid')
    expect(invalidRel.validation.issues.some((issue) => issue.code === 'out-of-range-threshold')).toBe(true)
  })
})

function replaceRow(extraction: PdfExtraction, oldText: string, newText: string): PdfExtraction {
  const oldTokens = oldText.split(' ')
  const toRemove = new Set(oldTokens)
  const first = extraction.items.find((item) => item.page === 1 && item.y === 680)
  return {
    ...extraction,
    items: extraction.items
      .filter((item) => !(item.page === 1 && item.y === 680 && toRemove.has(item.text)))
      .concat(fullRow(1, 680, newText, first?.x ?? 40)),
  }
}

function fullRow(page: number, y: number, text: string, x = 40): PdfTextItem[] {
  return [{ page, y, x, text, width: 300, height: 10 }]
}
