import { describe, expect, test } from 'vitest'
import {
  CAMBRIDGE_JUNE_2026_SOURCES,
  CAMBRIDGE_WEIGHTING_SOURCE,
  extractPdfTextItems,
  parseCambridgeThresholdPdf,
  parseCambridgeWeightingPdf,
} from '../lib/grade-thresholds'

const liveEnabled = process.env.CAMBRIDGE_LIVE_PDF_TESTS === '1'

describe.skipIf(!liveEnabled)('official Cambridge PDF smoke check (optional)', () => {
  test.each(CAMBRIDGE_JUNE_2026_SOURCES)(
    '$syllabusCode matches its pinned checksum, identity, layout, and golden fixtures',
    async (source) => {
      const response = await fetch(source.pdfUrl)
      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toMatch(/^application\/pdf\b/)

      const bytes = new Uint8Array(await response.arrayBuffer())
      const result = await parseCambridgeThresholdPdf(bytes, source, {
        contentType: response.headers.get('content-type') ?? '',
        extract: extractPdfTextItems,
      })
      expect(result.status).toBe('parsed')
      if (result.status === 'parsed') expect(result.publication.validation).toEqual({ status: 'valid', issues: [] })
    },
    30_000,
  )
})

describe.skipIf(!liveEnabled)('official Cambridge weighting PDF smoke check (optional)', () => {
  test('matches the pinned publication and all five June 2026 factor sets', async () => {
    const response = await fetch(CAMBRIDGE_WEIGHTING_SOURCE.pdfUrl)
    expect(response.ok).toBe(true)
    const bytes = new Uint8Array(await response.arrayBuffer())
    const parsed = await parseCambridgeWeightingPdf(
      bytes,
      response.headers.get('content-type') ?? '',
      extractPdfTextItems,
    )
    expect(parsed.validation).toEqual({ status: 'valid', issues: [] })
  }, 60_000)
})
