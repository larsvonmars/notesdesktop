/**
 * Client-side PDF text extraction using pdfjs-dist.
 *
 * The desktop app has no server runtime for PDF parsing, so the same browser
 * build that renders PDF annotations also extracts text for AI deck creation.
 */

const MAX_CHUNK_SIZE = 4000
const MAX_PAGES = 30

let pdfjsLib: typeof import('pdfjs-dist') | null = null

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib
  const lib = await import('pdfjs-dist')
  lib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  pdfjsLib = lib
  return lib
}

export interface PdfContent {
  text: string
  numPages: number
  totalPages: number
  truncated: boolean
}

export async function extractPdfText(data: ArrayBuffer): Promise<PdfContent> {
  const lib = await loadPdfJs()
  const document = await lib.getDocument({ data: new Uint8Array(data) }).promise

  try {
    const totalPages = document.numPages
    const pagesToRead = Math.min(totalPages, MAX_PAGES)
    const pageTexts: string[] = []

    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item) => {
          if (!('str' in item)) return ''
          const textItem = item as { str: string; hasEOL?: boolean }
          return `${textItem.str}${textItem.hasEOL ? '\n' : ' '}`
        })
        .join('')
      pageTexts.push(pageText)
      page.cleanup()
    }

    const text = pageTexts
      .join('\n\n')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    return {
      text,
      numPages: pagesToRead,
      totalPages,
      truncated: totalPages > pagesToRead,
    }
  } finally {
    await document.destroy()
  }
}

/** Split text into LLM-sized chunks on paragraph/sentence boundaries. */
export function chunkText(text: string, maxChunkSize = MAX_CHUNK_SIZE): string[] {
  if (text.length <= maxChunkSize) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkSize) {
      chunks.push(remaining.trim())
      break
    }

    let cutPoint = remaining.lastIndexOf('\n\n', maxChunkSize)

    if (cutPoint === -1 || cutPoint < maxChunkSize / 2) {
      const sentenceBreaks = ['. ', '! ', '? ', '.\n', '!\n', '?\n']
      for (const separator of sentenceBreaks) {
        const index = remaining.lastIndexOf(separator, maxChunkSize)
        if (index > maxChunkSize / 2) {
          cutPoint = index + separator.length
          break
        }
      }
    }

    if (cutPoint === -1 || cutPoint < 100) cutPoint = maxChunkSize

    chunks.push(remaining.slice(0, cutPoint).trim())
    remaining = remaining.slice(cutPoint).trim()
  }

  return chunks.filter(Boolean)
}

/** Human-readable warning for PDFs with little/no extractable text. */
export function checkTextQuality(text: string): string | null {
  if (text.length < 100) {
    return 'The PDF contains very little extractable text (< 100 characters). It may be a scanned document or image-based PDF. Try a text-based PDF instead.'
  }
  if (text.length < 500) {
    return 'The PDF contains limited text (~500 characters). The generated flashcards may have low coverage.'
  }
  return null
}
