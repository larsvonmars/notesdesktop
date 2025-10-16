/**
 * Markdown Conversion Helpers
 * Centralizes Markdown conversion settings and provides import/export helpers
 */

import { marked } from 'marked'

// Configure marked once on module load
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert \n to <br>
})

/**
 * Detect if text looks like markdown
 */
export function looksLikeMarkdown(text: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s/m, // Headers
    /^\* |\*\*|__/, // Bold/italic
    /^\- |\+ |\* /m, // Lists
    /^\d+\. /m, // Numbered lists
    /^\[.+\]\(.+\)/, // Links
    /^```/m, // Code blocks
    /^> /m, // Blockquotes
    /^\[[ x]\]/m, // Checkboxes
    /!\[.+\]\(.+\)/, // Images
  ]
  
  return markdownPatterns.some(pattern => pattern.test(text))
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
    
    return html
  } catch (error) {
    console.error('Failed to parse markdown:', error)
    return markdown
  }
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
