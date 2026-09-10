import type { PdfExtraction, PdfTextItem, ReconstructedRow } from './types'

const DEFAULT_ROW_TOLERANCE = 2.5

export async function extractPdfTextItems(bytes: Uint8Array): Promise<PdfExtraction> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: bytes.slice() })
  const document = await task.promise
  const items: PdfTextItem[] = []

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent({ disableNormalization: false })

      for (const item of content.items) {
        if (!('str' in item) || item.str.trim().length === 0) continue
        items.push({
          page: pageNumber,
          text: item.str.trim(),
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        })
      }
    }
  } finally {
    await document.destroy()
  }

  return { pageCount: document.numPages, items }
}

export function reconstructRows(
  items: readonly PdfTextItem[],
  yTolerance = DEFAULT_ROW_TOLERANCE,
): ReconstructedRow[] {
  const byPage = new Map<number, PdfTextItem[]>()
  for (const item of items) {
    const pageItems = byPage.get(item.page) ?? []
    pageItems.push(item)
    byPage.set(item.page, pageItems)
  }

  const result: ReconstructedRow[] = []
  for (const [page, pageItems] of [...byPage].sort(([a], [b]) => a - b)) {
    const lines: Array<{ y: number; items: PdfTextItem[] }> = []
    for (const item of [...pageItems].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= yTolerance)
      if (line) {
        line.items.push(item)
        line.y = line.items.reduce((sum, entry) => sum + entry.y, 0) / line.items.length
      } else {
        lines.push({ y: item.y, items: [item] })
      }
    }

    for (const line of lines.sort((a, b) => b.y - a.y)) {
      const rawTokens = line.items.sort((a, b) => a.x - b.x).map((item) => item.text)
      result.push({ page, y: line.y, rawTokens, text: rawTokens.join(' ').replace(/\s+/g, ' ').trim() })
    }
  }
  return result
}
