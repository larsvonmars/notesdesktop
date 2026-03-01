/**
 * Markdown Conversion Helpers
 * Centralizes Markdown conversion settings and provides import/export helpers
 */

import { marked } from 'marked'

// Configure marked once on module load
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: false, // Keep standard markdown paragraph/linebreak behavior
})

/**
 * Detect if text looks like markdown.
 *
 * Uses a weighted scoring system so that a single accidental match
 * (e.g. a line starting with "- ") doesn't cause the entire paste to
 * be routed through the markdown converter.  Only strong, unambiguous
 * patterns count.  The threshold is 2 so at least a couple of signals
 * must be present.
 */
export function looksLikeMarkdown(text: string): boolean {
  // If the text is very short (single line, ≤ 80 chars) and has no
  // strong markdown syntax, skip — it's almost certainly not markdown.
  const lines = text.split('\n')
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0)

  // Strong patterns – each match adds 2 points (one hit is enough)
  const strongPatterns: RegExp[] = [
    /^#{1,6}\s+\S/m,          // ATX headings (# Title)
    /^```/m,                   // Fenced code blocks
    /^\[.+\]\(.+\)/m,         // [text](url) links
    /!\[.*\]\(.+\)/m,         // ![alt](url) images
    /\*\*\S.*?\S\*\*/,        // **bold** (non-greedy, requires content)
    /__\S.*?\S__/,             // __bold__
    /^(\s*[-*+]\s\[[ x]\])/m, // Task-list checkboxes (- [x] or - [ ])
    /^\|.+\|$/m,              // Table rows
    /^---+$/m,                // Thematic breaks / horizontal rules
  ]

  // Weak patterns – each match adds 1 point
  const weakPatterns: RegExp[] = [
    /^\s*[-*+]\s/m,           // Unordered list items
    /^\s*\d+\.\s/m,           // Ordered list items
    /^>\s/m,                  // Block-quotes
    /\*\S.*?\S\*/,            // *italic* (single asterisk)
    /`[^`]+`/,                // `inline code`
  ]

  let score = 0

  for (const p of strongPatterns) {
    if (p.test(text)) score += 2
  }
  for (const p of weakPatterns) {
    if (p.test(text)) score += 1
  }

  // Short single-line text needs a strong signal
  if (nonEmptyLines.length <= 1 && score < 2) return false

  // General threshold: need at least 2 points
  return score >= 2
}

/**
 * Post-process HTML produced by `marked` to strip excessive whitespace,
 * empty block elements, and consecutive `<br>` sequences that cause the
 * editor to display huge gaps.
 */
function cleanMarkedHtml(html: string): string {
  // 1. Remove completely empty paragraphs: <p></p>, <p> </p>, <p><br></p>
  let cleaned = html.replace(/<p>\s*(<br\s*\/?>)?\s*<\/p>/gi, '')

  // 2. Collapse runs of 2+ <br> into a single <br>
  cleaned = cleaned.replace(/(<br\s*\/?\s*>){2,}/gi, '<br>')

  // 3. Remove leading/trailing whitespace-only text nodes between block tags
  cleaned = cleaned.replace(/>(\s*\n\s*)+</g, '><')

  // 4. Trim entire output
  cleaned = cleaned.trim()

  return cleaned
}

/**
 * Convert markdown to HTML
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  try {
    let html = await marked.parse(markdown)

    // Convert GFM task lists to our checklist format
    html = html.replace(
      /<li>\s*<input[^>]*type="checkbox"[^>]*(?:checked)?[^>]*>\s*([^<]*(?:<[^\/].*?<\/[^>]+>)*[^<]*)<\/li>/gi,
      (match, content) => {
        const isChecked = /checked/i.test(match)
        return `<li class="checklist-item" data-checklist="true"><input type="checkbox" class="checklist-checkbox align-middle mr-2" data-checked="${isChecked}"${isChecked ? ' checked' : ''}>${content}</li>`
      }
    )

    // Mark lists containing checkboxes as checklist-list
    html = html.replace(
      /(<ul>)([\s\S]*?<li class="checklist-item"[\s\S]*?)(<\/ul>)/gi,
      '$1<ul class="checklist-list" data-checklist="true">$2</ul>$3'
    )

    // Add IDs to headings for TOC
    html = html.replace(
      /<(h[1-3])>([^<]+)<\/h[1-3]>/gi,
      (match, tag, text) => {
        const id = text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
        return `<${tag} id="${id || `heading-${Date.now()}`}">${text}</${tag}>`
      }
    )

    // Clean excessive whitespace from marked output
    html = cleanMarkedHtml(html)

    return html
  } catch (error) {
    console.error('Failed to parse markdown:', error)
    return markdown
  }
}

/**
 * Sanitize pasted HTML to remove excessive whitespace, empty blocks,
 * and extraneous wrapper elements that rich-text sources (Google Docs, Word,
 * web pages) tend to include.
 *
 * This should be called **before** DOMPurify so that we operate on the raw
 * pasted HTML instead of a partially-stripped version.
 */
export function cleanPastedHtml(html: string): string {
  // Use a template to parse the HTML
  const template = document.createElement('template')
  template.innerHTML = html

  const root = template.content

  // 1. Remove style, meta, link, and comment nodes
  root.querySelectorAll('style, meta, link, xml').forEach((el) => el.remove())
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
  const comments: Comment[] = []
  while (walker.nextNode()) comments.push(walker.currentNode as Comment)
  comments.forEach((c) => c.remove())

  // 2. Remove Google Docs / Word wrapper spans with no semantic value
  root.querySelectorAll('span').forEach((span) => {
    // Keep spans with data-* attributes (our custom blocks, etc.)
    const hasDataAttr = Array.from(span.attributes).some((a) => a.name.startsWith('data-'))
    if (hasDataAttr) return

    // Unwrap purely decorative wrapper spans (keep their children)
    const parent = span.parentNode
    if (!parent) return
    while (span.firstChild) parent.insertBefore(span.firstChild, span)
    parent.removeChild(span)
  })

  // 3. Remove empty block elements (<p></p>, <div></div>, etc.)
  const blockTags = ['P', 'DIV', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']
  const removeEmptyBlocks = (container: Node) => {
    const elements = Array.from(container.childNodes)
    for (const node of elements) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        removeEmptyBlocks(el) // depth-first

        if (
          blockTags.includes(el.tagName) &&
          !el.querySelector('img, hr, input, svg, table, [data-block]') &&
          (el.textContent || '').trim() === '' &&
          !el.querySelector('br') // a single <br> placeholder is OK
        ) {
          el.remove()
        }
      }
    }
  }
  removeEmptyBlocks(root)

  // 4. Collapse consecutive <br> elements into at most one
  const brs = Array.from(root.querySelectorAll('br'))
  for (let i = 0; i < brs.length; i++) {
    const br = brs[i]
    // Walk forward past whitespace text nodes and additional <br>
    let next = br.nextSibling
    while (next) {
      if (next.nodeType === Node.TEXT_NODE && (next.textContent || '').trim() === '') {
        const tmp = next.nextSibling
        next.remove()
        next = tmp
        continue
      }
      if (next.nodeType === Node.ELEMENT_NODE && (next as HTMLElement).tagName === 'BR') {
        const tmp = next.nextSibling
        next.remove()
        next = tmp
        continue
      }
      break
    }
  }

  // 5. Strip inline styles (they carry over font-size, line-height, etc.)
  root.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'))

  // Serialize back to HTML string
  const tmp = document.createElement('div')
  tmp.appendChild(root.cloneNode(true))
  return tmp.innerHTML.trim()
}

/**
 * Convert HTML to Markdown (basic implementation for export)
 */
export function htmlToMarkdown(html: string): string {
  // Create a temporary div to parse HTML
  const div = document.createElement('div')
  div.innerHTML = html
  
  return processNodeToMarkdown(div)
}

/**
 * Process a DOM node to Markdown
 */
function processNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || ''
  }
  
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }
  
  const element = node as HTMLElement
  const tagName = element.tagName.toLowerCase()
  const children = Array.from(element.childNodes).map(child => processNodeToMarkdown(child)).join('')
  
  switch (tagName) {
    case 'h1':
      return `# ${children}\n\n`
    case 'h2':
      return `## ${children}\n\n`
    case 'h3':
      return `### ${children}\n\n`
    case 'h4':
      return `#### ${children}\n\n`
    case 'h5':
      return `##### ${children}\n\n`
    case 'h6':
      return `###### ${children}\n\n`
    case 'p':
      return `${children}\n\n`
    case 'strong':
    case 'b':
      return `**${children}**`
    case 'em':
    case 'i':
      return `*${children}*`
    case 'code':
      // Check if parent is pre for code block
      if (element.parentElement?.tagName.toLowerCase() === 'pre') {
        return children
      }
      return `\`${children}\``
    case 'pre':
      return `\`\`\`\n${children}\n\`\`\`\n\n`
    case 'blockquote':
      return children.split('\n').map(line => `> ${line}`).join('\n') + '\n\n'
    case 'ul':
      return processListToMarkdown(element, false) + '\n'
    case 'ol':
      return processListToMarkdown(element, true) + '\n'
    case 'li':
      // Handled by processListToMarkdown
      return children
    case 'a':
      const href = element.getAttribute('href') || ''
      return `[${children}](${href})`
    case 'hr':
      return '---\n\n'
    case 'u':
      return children // Markdown doesn't have underline, keep as plain text
    case 's':
      return `~~${children}~~`
    case 'br':
      return '\n'
    case 'div':
    case 'span':
      return children
    default:
      return children
  }
}

/**
 * Process a list element to Markdown
 */
function processListToMarkdown(listElement: HTMLElement, ordered: boolean): string {
  const items = Array.from(listElement.children).filter(child => child.tagName.toLowerCase() === 'li')
  
  return items.map((item, index) => {
    const li = item as HTMLLIElement
    const checkbox = li.querySelector('input[type="checkbox"]') as HTMLInputElement | null
    
    let prefix = ordered ? `${index + 1}. ` : '- '
    
    // Handle checkboxes
    if (checkbox) {
      const checked = checkbox.checked || checkbox.getAttribute('data-checked') === 'true'
      prefix = `- [${checked ? 'x' : ' '}] `
    }
    
    // Get text content excluding the checkbox
    let content = ''
    Array.from(li.childNodes).forEach(node => {
      if (!(node instanceof HTMLInputElement && node.type === 'checkbox')) {
        content += processNodeToMarkdown(node)
      }
    })
    
    return prefix + content.trim()
  }).join('\n')
}
