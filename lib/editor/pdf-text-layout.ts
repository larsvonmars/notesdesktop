/**
 * Pure text-layout and search helpers for the PDF annotation editor.
 * Kept out of the component so they can be reasoned about (and tested)
 * without canvas/React state.
 */

export interface TextBoxSource {
  text: string
  width: number
  fontSize: number
  bold?: boolean
  italic?: boolean
  fontFamily?: string
}

export interface TextBoxGeometry extends TextBoxSource {
  x: number
  y: number
}

/** Line advance used by the canvas text renderer (baselines are `fontSize * 1.2` apart). */
export const TEXT_LINE_HEIGHT = 1.2
/** Minimum logical width of a text annotation box. */
export const TEXT_MIN_BOX_WIDTH = 40
/** Wrapping is measured at this reference font size (small sizes get rounded to integers). */
const TEXT_WRAP_REF_SIZE = 100

/** Hit slop (CSS px) added to text annotations so fingers can tap them reliably. */
export const TEXT_HIT_SLOP_TOUCH_PX = 10

/** Offscreen 2d context used for text measurement (lazily created). */
let textMeasureCtx: CanvasRenderingContext2D | null | undefined
export function getTextMeasureContext(): CanvasRenderingContext2D | null {
  if (textMeasureCtx === undefined) {
    try {
      textMeasureCtx = document.createElement('canvas').getContext('2d')
    } catch {
      textMeasureCtx = null
    }
  }
  return textMeasureCtx
}

/**
 * Case- and diacritics-insensitive normalization used for searching.
 * Length is preserved (one code unit in → one out), so match offsets can be
 * mapped back onto the original text items.
 */
export function normalizeForSearch(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const lower = ch.toLowerCase()
    // Some characters lower-case to multiple code points (e.g. İ) — keep one unit
    const base = lower.length > 1 ? lower[0] : lower
    const nf: string | undefined = typeof (base as any).normalize === 'function'
      ? (base as any).normalize('NFD')
      : undefined
    const stripped = nf ? nf.replace(/[\u0300-\u036f]/g, '') : ''
    out += stripped || base
  }
  return out
}

/** Index of the text item containing the given offset (binary search over itemOffsets). */
export function findItemIndexAtOffset(offsets: number[], offset: number): number {
  let lo = 0
  let hi = offsets.length - 1
  let result = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid] <= offset) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}

/** Whitespace CSS may break at (NBSP deliberately excluded). */
const WRAP_BREAKABLE_SPACE = /[^\S\u00A0]+/
/** CJK characters provide a break opportunity after every character. */
const WRAP_CJK = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F]/

interface WrapUnit {
  text: string
  /** True when a line break is allowed after this unit. */
  breakAfter: boolean
  /** True for whitespace runs (they stay at the end of a line when wrapping). */
  space?: boolean
}

function tokenizeForWrapping(paragraph: string): WrapUnit[] {
  const units: WrapUnit[] = []
  const chunks = paragraph.match(/[^\S\u00A0]+|[\S\u00A0]+/g) ?? []
  for (const chunk of chunks) {
    if (WRAP_BREAKABLE_SPACE.test(chunk)) {
      units.push({ text: chunk, breakAfter: true, space: true })
      continue
    }
    // Break after hyphens and between CJK characters (mirrors CSS break opportunities)
    let rest = chunk
    while (rest) {
      let segEnd = rest.length
      let breakAfter = false
      for (let i = 0; i < rest.length; i++) {
        const ch = rest[i]
        if (ch === '-' || WRAP_CJK.test(ch)) {
          segEnd = i + 1
          breakAfter = true
          break
        }
      }
      units.push({ text: rest.slice(0, segEnd), breakAfter })
      rest = rest.slice(segEnd)
    }
  }
  return units
}

/** Cache of wrapped lines — line breaks are zoom-independent, so entries stay valid. */
const textWrapCache = new Map<string, string[]>()

/**
 * Greedy word wrap mirroring the editing textarea (`white-space: pre-wrap` +
 * `overflow-wrap: break-word`), so committed text keeps the line breaks the user
 * arranged while editing. Measured at a reference size → identical at any zoom.
 */
export function wrapTextAnnotationLines(ta: TextBoxSource, maxWidth: number): string[] {
  const paragraphs = ta.text.split('\n')
  const ctx = getTextMeasureContext()
  if (!ctx || !(maxWidth > 0)) return paragraphs

  const cacheKey = `${ta.width}|${ta.fontSize}|${ta.bold ? 'b' : ''}${ta.italic ? 'i' : ''}|${ta.fontFamily ?? 'sans-serif'}|${ta.text}`
  const cached = textWrapCache.get(cacheKey)
  if (cached) return cached

  ctx.font = `${ta.italic ? 'italic ' : ''}${ta.bold ? 'bold ' : ''}${TEXT_WRAP_REF_SIZE}px ${ta.fontFamily ?? 'sans-serif'}`
  const fontSizeScale = ta.fontSize / TEXT_WRAP_REF_SIZE
  const widthOf = (s: string) => ctx.measureText(s).width * fontSizeScale

  const lines: string[] = []
  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lines.push('')
      continue
    }
    const units = tokenizeForWrapping(paragraph)
    let i = 0
    while (i < units.length) {
      let line = ''
      let j = i
      while (j < units.length) {
        const unit = units[j]
        if (unit.space) {
          // Whitespace stays on the current line (it hangs past the edge at a wrap point)
          line += unit.text
          j++
          continue
        }
        if (line === '' && widthOf(unit.text) > maxWidth) break
        const candidate = line + unit.text
        if (line !== '' && widthOf(candidate) > maxWidth) break
        line = candidate
        j++
      }
      if (j === i) {
        // A single word wider than the box → break it by characters
        const unit = units[i]
        let best = 1
        let lo = 1
        let hi = unit.text.length
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          if (widthOf(unit.text.slice(0, mid)) <= maxWidth) {
            best = mid
            lo = mid + 1
          } else {
            hi = mid - 1
          }
        }
        lines.push(unit.text.slice(0, best))
        const restText = unit.text.slice(best)
        if (restText) units[i] = { ...unit, text: restText }
        else i++
        continue
      }
      // Hanging breakable spaces at a soft wrap point are invisible in CSS (`pre-wrap`)
      // and must not skew alignment — only keep them on a paragraph's final line
      lines.push(j >= units.length ? line : line.replace(/[^\S\u00A0]+$/, ''))
      i = j
    }
  }

  if (textWrapCache.size > 500) textWrapCache.clear()
  textWrapCache.set(cacheKey, lines)
  return lines
}

/**
 * Measures a text annotation's box in logical page units so that the editing textarea
 * and the committed canvas rendering are pixel-identical:
 * - `width` is the wrap width; the box height covers the wrapped lines
 * - `paddingTop` puts the textarea's first baseline exactly where `fillText` draws it
 *   (canvas: `fontSize` below the box top; CSS line box: half-leading + ascent).
 */
export function measureTextAnnotationBox(
  ta: TextBoxSource,
): { width: number; height: number; paddingTop: number } {
  const width = Math.max(ta.width, TEXT_MIN_BOX_WIDTH)
  const lines = wrapTextAnnotationLines(ta, width)
  let paddingTopRatio = 0
  try {
    const ctx = getTextMeasureContext()
    if (ctx) {
      ctx.font = `${ta.italic ? 'italic ' : ''}${ta.bold ? 'bold ' : ''}${TEXT_WRAP_REF_SIZE}px ${ta.fontFamily ?? 'sans-serif'}`
      const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } = ctx.measureText('Hg')
      if (Number.isFinite(ascent) && Number.isFinite(descent) && ascent > 0) {
        const a = ascent / TEXT_WRAP_REF_SIZE
        const d = descent / TEXT_WRAP_REF_SIZE
        paddingTopRatio = 1 - ((TEXT_LINE_HEIGHT - (a + d)) / 2 + a)
      }
    }
  } catch {
    /* canvas unavailable — render without the baseline correction */
  }
  const paddingTop = ta.fontSize * Math.max(0, paddingTopRatio)
  return {
    width,
    paddingTop,
    height: paddingTop + Math.max(1, lines.length) * ta.fontSize * TEXT_LINE_HEIGHT,
  }
}

/**
 * True if a point (unscaled page coords) lies inside a text annotation's box.
 * `slop` (page units) widens the target — fingers cannot hit a 1px edge.
 */
export function textAnnotationContains(ta: TextBoxGeometry, x: number, y: number, slop = 0): boolean {
  // Use the measured (wrapped) box so the hit area always matches what is drawn —
  // including annotations committed before wrapping was introduced
  const box = measureTextAnnotationBox(ta)
  return (
    x >= ta.x - slop && x <= ta.x + box.width + slop &&
    y >= ta.y - slop && y <= ta.y + box.height + slop
  )
}

/** X position for drawing one wrapped line of a text annotation (honors alignment). */
export function textLineDrawX(
  ctx: CanvasRenderingContext2D,
  ta: { x: number; width: number; textAlign?: 'left' | 'center' | 'right' },
  line: string,
  scale: number,
): number {
  const align = ta.textAlign
  if (!align || align === 'left') return ta.x * scale
  // ctx.font must already be set to the annotation's font when this is called
  const lineWidth = ctx.measureText(line).width
  return align === 'center'
    ? ta.x * scale + (ta.width * scale - lineWidth) / 2
    : ta.x * scale + ta.width * scale - lineWidth
}
