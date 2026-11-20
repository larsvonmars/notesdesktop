import { downloadFile } from '@/lib/file-storage'
import { AI_MODEL } from '@/lib/ai-model'
import { requestChatCompletion } from './transport'

const MAX_OCR_PAGES = 6
const MAX_EXTRACTED_TEXT_CHARS = 30_000
const MAX_OCR_IMAGE_DIMENSION = 1280

interface PdfAnnotationData {
  pdfStoragePath?: unknown
}

interface PdfPageText {
  page: number
  text: string
}

interface PdfOcrResult {
  text: string
  totalPages: number
  ocrPages: number[]
  skippedOcrPages: number[]
  extractedTextTruncated: boolean
}

function getPdfStoragePath(content: string): string {
  let data: PdfAnnotationData
  try {
    data = JSON.parse(content) as PdfAnnotationData
  } catch {
    throw new Error('The PDF note contains invalid document data.')
  }
  if (typeof data.pdfStoragePath !== 'string' || !data.pdfStoragePath.trim()) {
    throw new Error('The PDF note does not have a PDF file attached.')
  }
  return data.pdfStoragePath
}

function normalizeText(value: string): string {
  return value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

async function renderPageForOcr(
  pdf: import('pdfjs-dist').PDFDocumentProxy,
  pageNumber: number,
): Promise<string> {
  const page = await pdf.getPage(pageNumber)
  const originalViewport = page.getViewport({ scale: 1.5 })
  const scale = Math.min(1, MAX_OCR_IMAGE_DIMENSION / Math.max(originalViewport.width, originalViewport.height))
  const viewport = page.getViewport({ scale: 1.5 * scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(viewport.width))
  canvas.height = Math.max(1, Math.ceil(viewport.height))
  const context = canvas.getContext('2d')
  if (!context) throw new Error(`Could not render PDF page ${pageNumber} for OCR.`)

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: context, viewport }).promise
  for (const quality of [0.82, 0.68, 0.55]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length <= 650_000) return dataUrl
  }
  throw new Error(`PDF page ${pageNumber} is too large to send for OCR.`)
}

async function ocrPages(
  pages: Array<{ page: number; dataUrl: string }>,
  signal?: AbortSignal,
): Promise<string> {
  const content = [
    {
      type: 'text',
      text: [
        'Transcribe the text visible in each attached PDF page image. This is OCR, not a summary.',
        'Keep the original language, reading order, headings, paragraphs, and table structure.',
        'Prefix each page with its supplied page number. Mark genuinely unreadable words as [unclear].',
        ...pages.map((page, index) => `Image ${index + 1} is PDF page ${page.page}.`),
      ].join('\n'),
    },
    ...pages.map((page) => ({
      type: 'image_url',
      image_url: { url: page.dataUrl },
    })),
  ]

  const result = await requestChatCompletion(
    {
      model: AI_MODEL,
      max_tokens: 8192,
      messages: [
        {
          role: 'system',
          content: 'You are a careful OCR reader. Transcribe the supplied pages faithfully and do not infer missing text.',
        },
        { role: 'user', content },
      ],
    },
    {},
    signal,
  )
  if (!result.content.trim()) throw new Error('DeepSeek Vision did not return OCR text.')
  return result.content.trim()
}

/** Extract selectable PDF text and OCR up to six scanned pages using DeepSeek Vision. */
export async function readPdfNote(
  content: string,
  requestedPages: number[] = [],
  signal?: AbortSignal,
): Promise<PdfOcrResult> {
  if (
    requestedPages.length > MAX_OCR_PAGES ||
    requestedPages.some((page) => !Number.isInteger(page) || page < 1)
  ) {
    throw new Error(`OCR accepts up to ${MAX_OCR_PAGES} positive integer page numbers per request.`)
  }
  const path = getPdfStoragePath(content)
  const blob = await downloadFile(path)
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const pdf = await getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise
  if (requestedPages.some((page) => page > pdf.numPages)) {
    throw new Error(`PDF page numbers must be between 1 and ${pdf.numPages}.`)
  }
  const pageTexts: PdfPageText[] = []
  const scannedPages: number[] = []
  let extractedChars = 0
  let extractedTextTruncated = false

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const page = await pdf.getPage(pageNumber)
    const pageContent = await page.getTextContent()
    const text = normalizeText(
      pageContent.items
        .map((item) => {
          const textItem = item as { str?: string; hasEOL?: boolean }
          return `${textItem.str ?? ''}${textItem.hasEOL ? '\n' : ' '}`
        })
        .join(''),
    )

    if (text) {
      const remaining = MAX_EXTRACTED_TEXT_CHARS - extractedChars
      if (remaining > 0) {
        const limitedText = text.slice(0, remaining)
        pageTexts.push({ page: pageNumber, text: limitedText })
        extractedChars += limitedText.length
      }
      if (text.length > remaining) extractedTextTruncated = true
    } else {
      scannedPages.push(pageNumber)
    }
  }

  const selectedPages = requestedPages.length > 0
    ? [...new Set(requestedPages)]
    : scannedPages.slice(0, MAX_OCR_PAGES)

  const renderedPages: Array<{ page: number; dataUrl: string }> = []
  for (const pageNumber of selectedPages.slice(0, MAX_OCR_PAGES)) {
    renderedPages.push({
      page: pageNumber,
      dataUrl: await renderPageForOcr(pdf, pageNumber),
    })
  }

  const ocrText = renderedPages.length > 0 ? await ocrPages(renderedPages, signal) : ''
  const skippedOcrPages = scannedPages.filter((page) => !renderedPages.some((rendered) => rendered.page === page))
  const extractedText = pageTexts.map(({ page, text }) => `Page ${page}:\n${text}`).join('\n\n')

  return {
    text: [extractedText, ocrText].filter(Boolean).join('\n\n'),
    totalPages: pdf.numPages,
    ocrPages: renderedPages.map(({ page }) => page),
    skippedOcrPages,
    extractedTextTruncated,
  }
}
