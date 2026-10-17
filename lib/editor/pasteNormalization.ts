/**
 * Paste normalization heuristics for the rich-text editor.
 *
 * Browsers hand over wildly different clipboard payloads (Google Docs,
 * Gemini, plain textareas…). These helpers decide when the plain-text
 * representation is a better source than the pasted HTML and clean up
 * invisible characters / soft-wrapped lines before insertion.
 */

// Regex patterns
const ZERO_WIDTH_CHARS_PATTERN = /[\u200B-\u200D\uFEFF]/g
const GEMINI_CITATION_TAG_PATTERN = /\[cite_start\]|\[cite:\s*\d+(?:\s*,\s*\d+)*\s*\]/gi

const BASIC_PASTE_WRAPPER_TAGS = new Set(['DIV', 'P', 'SPAN', 'BR'])
const SEMANTIC_PASTE_SELECTOR =
  'a,ul,ol,li,pre,code,blockquote,table,thead,tbody,tr,td,th,h1,h2,h3,h4,h5,h6,img,hr,strong,b,em,i,u,s,mark,[data-block],[data-block-type]'

export const splitLinesToFragment = (text: string): DocumentFragment => {
  const fragment = document.createDocumentFragment()
  const lines = text.split(/\r?\n|\r/g)

  lines.forEach((line, index) => {
    fragment.appendChild(document.createTextNode(line))
    if (index < lines.length - 1) {
      fragment.appendChild(document.createElement('br'))
    }
  })

  return fragment
}

export const stripGeminiCitationTags = (text: string): string =>
  text.replace(GEMINI_CITATION_TAG_PATTERN, '')

export const stripGeminiCitationTagsFromHtml = (html: string): string => {
  try {
    const template = document.createElement('template')
    template.innerHTML = html

    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()

    while (node) {
      const textNode = node as Text
      const updatedText = stripGeminiCitationTags(textNode.textContent || '')
      if (updatedText !== textNode.textContent) {
        textNode.textContent = updatedText
      }
      node = walker.nextNode()
    }

    return template.innerHTML
  } catch (error) {
    console.warn('Unable to strip Gemini citation tags from pasted HTML:', error)
    return stripGeminiCitationTags(html)
  }
}

export const normalizePastedText = (text: string): string => {
  const normalizedLineEndings = text.replace(/\r\n?|\u2028|\u2029/g, '\n')
  const withoutInvisible = normalizedLineEndings
    .replace(/\u00A0/g, ' ')
    .replace(ZERO_WIDTH_CHARS_PATTERN, '')

  const lines = withoutInvisible
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))

  // Strip leading and trailing blank lines
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift()
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }

  // Collapse 3+ consecutive blank lines down to a single blank line
  const result: string[] = []
  let consecutiveBlank = 0
  for (const line of lines) {
    if (line.trim() === '') {
      consecutiveBlank++
      if (consecutiveBlank <= 1) result.push(line)
    } else {
      consecutiveBlank = 0
      result.push(line)
    }
  }

  return result.join('\n')
}

const STRUCTURED_LINE_PATTERN = /^(\s*([-*+]\s|\d+\.\s|>\s|#{1,6}\s|```|~~~|\|))/

export const collapseSoftWrappedLines = (text: string): string => {
  if (!text.includes('\n')) {
    return text
  }

  const paragraphs = text.split(/\n{2,}/)

  const normalizedParagraphs = paragraphs.map((paragraph) => {
    const lines = paragraph.split('\n')
    if (lines.length <= 1) {
      return paragraph
    }

    const hasStructuredLines = lines.some((line) => STRUCTURED_LINE_PATTERN.test(line.trimStart()))
    const hasIndentedCode = lines.some((line) => /^\s{4,}\S/.test(line))
    if (hasStructuredLines || hasIndentedCode) {
      return paragraph
    }

    const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
    if (nonEmptyLines.length <= 1) {
      return paragraph
    }

    const shortLineCount = nonEmptyLines.filter((line) => line.trim().length <= 35).length
    const mostlyShortLines = shortLineCount / nonEmptyLines.length >= 0.7
    if (mostlyShortLines) {
      return paragraph
    }

    return nonEmptyLines.map((line) => line.trim()).join(' ')
  })

  return normalizedParagraphs.join('\n\n')
}

export const shouldPreferPlainTextOverHtml = (html: string, plainText: string): boolean => {
  if (!plainText.trim()) return false

  try {
    const template = document.createElement('template')
    template.innerHTML = html

    if (template.content.querySelector(SEMANTIC_PASTE_SELECTOR)) {
      return false
    }

    const elements = Array.from(template.content.querySelectorAll('*'))
    const hasOnlyBasicWrappers =
      elements.length > 0 && elements.every((el) => BASIC_PASTE_WRAPPER_TAGS.has(el.tagName))

    const htmlText = normalizePastedText(template.content.textContent || '')
    if (!htmlText) {
      return true
    }

    const compact = (value: string) => value.replace(/\s+/g, ' ').trim()
    if (compact(htmlText) === compact(plainText)) {
      return true
    }

    return hasOnlyBasicWrappers
  } catch (error) {
    console.warn('Unable to inspect pasted HTML, defaulting to plain text heuristic:', error)
    return false
  }
}

/**
 * Ensure the editor has at least one paragraph for writing.
 */
export const ensureEditorHasContent = (editor: HTMLDivElement) => {
  if (editor.childNodes.length === 0 || (editor.textContent || '').trim() === '') {
    if (!editor.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, hr, table, div[data-block]')) {
      const p = document.createElement('p')
      p.appendChild(document.createElement('br'))
      editor.appendChild(p)
    }
  }
}
