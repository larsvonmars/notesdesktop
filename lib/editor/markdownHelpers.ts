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
 * Convert HTML to Markdown
 */
export function htmlToMarkdown(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  
  const raw = processNodeToMarkdown(div, 0)
  // Collapse 3+ consecutive newlines into 2
  return raw.replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * Process a DOM node to Markdown
 */
function processNodeToMarkdown(node: Node, depth: number): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || ''
  }
  
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }
  
  const element = node as HTMLElement
  const tagName = element.tagName.toLowerCase()
  const children = Array.from(element.childNodes).map(child => processNodeToMarkdown(child, depth)).join('')
  
  switch (tagName) {
    case 'h1':
      return `# ${children.trim()}\n\n`
    case 'h2':
      return `## ${children.trim()}\n\n`
    case 'h3':
      return `### ${children.trim()}\n\n`
    case 'h4':
      return `#### ${children.trim()}\n\n`
    case 'h5':
      return `##### ${children.trim()}\n\n`
    case 'h6':
      return `###### ${children.trim()}\n\n`
    case 'p':
      return `${children}\n\n`
    case 'strong':
    case 'b':
      return children.trim() ? `**${children}**` : ''
    case 'em':
    case 'i':
      return children.trim() ? `*${children}*` : ''
    case 'code':
      if (element.parentElement?.tagName.toLowerCase() === 'pre') {
        return children
      }
      return children.trim() ? `\`${children}\`` : ''
    case 'pre': {
      const codeEl = element.querySelector('code')
      const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] || ''
      const codeContent = codeEl ? (codeEl.textContent || '') : children
      return `\`\`\`${lang}\n${codeContent}\n\`\`\`\n\n`
    }
    case 'blockquote': {
      const inner = children.trim().split('\n')
      return inner.map(line => `> ${line}`).join('\n') + '\n\n'
    }
    case 'ul':
      return processListToMarkdown(element, false, depth) + '\n'
    case 'ol':
      return processListToMarkdown(element, true, depth) + '\n'
    case 'li':
      return children
    case 'a': {
      const href = element.getAttribute('href') || ''
      return href ? `[${children}](${href})` : children
    }
    case 'img': {
      const src = element.getAttribute('src') || ''
      const alt = element.getAttribute('alt') || ''
      return src ? `![${alt}](${src})` : ''
    }
    case 'hr':
      return '---\n\n'
    case 'u':
      return children
    case 's':
    case 'del':
    case 'strike':
      return children.trim() ? `~~${children}~~` : ''
    case 'br':
      return '\n'
    case 'sup':
      return `^${children}^`
    case 'sub':
      return `~${children}~`
    case 'mark':
      return `==${children}==`
    case 'table':
      return processTableToMarkdown(element) + '\n'
    case 'div':
    case 'span':
    case 'section':
    case 'article':
    case 'main':
    case 'header':
    case 'footer':
      return children
    default:
      return children
  }
}

/**
 * Process a table element to Markdown
 */
function processTableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll('tr'))
  if (rows.length === 0) return ''

  const result: string[][] = []
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('th, td'))
    result.push(cells.map(cell => (cell.textContent || '').trim().replace(/\|/g, '\\|')))
  }

  // Normalize column count
  const colCount = Math.max(...result.map(r => r.length))
  for (const row of result) {
    while (row.length < colCount) row.push('')
  }

  if (result.length === 0) return ''

  const lines: string[] = []
  // Header row
  lines.push('| ' + result[0].join(' | ') + ' |')
  // Separator
  lines.push('| ' + result[0].map(() => '---').join(' | ') + ' |')
  // Body rows
  for (let i = 1; i < result.length; i++) {
    lines.push('| ' + result[i].join(' | ') + ' |')
  }

  return lines.join('\n') + '\n'
}

/**
 * Process a list element to Markdown with nesting support
 */
function processListToMarkdown(listElement: HTMLElement, ordered: boolean, depth: number): string {
  const items = Array.from(listElement.children).filter(child => child.tagName.toLowerCase() === 'li')
  const indent = '  '.repeat(depth)
  
  return items.map((item, index) => {
    const li = item as HTMLLIElement
    const checkbox = li.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null
    
    let prefix = ordered ? `${index + 1}. ` : '- '
    
    if (checkbox) {
      const checked = checkbox.checked || checkbox.getAttribute('data-checked') === 'true'
      prefix = `- [${checked ? 'x' : ' '}] `
    }
    
    // Separate inline content from nested lists
    let inlineContent = ''
    let nestedContent = ''
    
    Array.from(li.childNodes).forEach(node => {
      if (node instanceof HTMLInputElement && node.type === 'checkbox') return
      
      const el = node as HTMLElement
      if (el.tagName?.toLowerCase() === 'ul') {
        nestedContent += processListToMarkdown(el, false, depth + 1)
      } else if (el.tagName?.toLowerCase() === 'ol') {
        nestedContent += processListToMarkdown(el, true, depth + 1)
      } else {
        inlineContent += processNodeToMarkdown(node, depth)
      }
    })
    
    let line = indent + prefix + inlineContent.trim()
    if (nestedContent) {
      line += '\n' + nestedContent
    }
    return line
  }).join('\n')
}
