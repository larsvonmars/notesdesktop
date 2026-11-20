import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  downloadFile: vi.fn(),
  requestChatCompletion: vi.fn(),
  getDocument: vi.fn(),
}))

vi.mock('@/lib/file-storage', () => ({ downloadFile: mocks.downloadFile }))
vi.mock('@/lib/chat/transport', () => ({ requestChatCompletion: mocks.requestChatCompletion }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: mocks.getDocument,
}))

describe('PDF note OCR', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.downloadFile.mockReset().mockResolvedValue(new Blob(['pdf data']))
    mocks.requestChatCompletion.mockReset().mockResolvedValue({
      content: '## Page 2\nScanned text',
      reasoning: '',
      toolCalls: [],
    })
    mocks.getDocument.mockReset().mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn(async (pageNumber: number) => ({
          getTextContent: async () => ({
            items: pageNumber === 1 ? [{ str: 'Selectable text', hasEOL: true }] : [],
          }),
          getViewport: ({ scale }: { scale: number }) => ({
            width: 800 * scale,
            height: 1000 * scale,
          }),
          render: () => ({ promise: Promise.resolve() }),
        })),
      }),
    })
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ fillStyle: '', fillRect: vi.fn() }),
        toDataURL: () => 'data:image/jpeg;base64,PDFPAGE',
      }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('extracts selectable text and OCRs scanned pages with DeepSeek Vision', async () => {
    const { readPdfNote } = await import('@/lib/chat/pdf-ocr')
    const result = await readPdfNote(JSON.stringify({ pdfStoragePath: 'notes/scan.pdf' }))

    expect(result.text).toContain('Page 1:\nSelectable text')
    expect(result.text).toContain('Scanned text')
    expect(result.ocrPages).toEqual([2])
    expect(mocks.downloadFile).toHaveBeenCalledWith('notes/scan.pdf')
    expect(mocks.requestChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'image_url' }),
            ]),
          }),
        ]),
      }),
      {},
      undefined,
    )
  })
})
