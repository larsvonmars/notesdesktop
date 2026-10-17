import DOMPurify, { type Config } from 'dompurify'

export const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: [
    'a', 'b', 'strong', 'i', 'em', 'u', 's', 'code', 'pre', 'p', 'br',
    'div', 'span', 'blockquote', 'ul', 'ol', 'li', 'hr', 'input',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'mark', 'img', 'button', 'svg', 'path', 'table',
    'thead', 'tbody', 'tr', 'td', 'th', 'colgroup', 'col',
    // SVG shape elements used by file-block / annotation-embed icons
    'line', 'polyline', 'polygon', 'circle', 'rect', 'ellipse', 'g'
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'type', 'checked', 'data-checked',
    'id', 'class', 'data-block', 'data-block-type', 'data-block-payload',
    'data-note-id', 'data-note-title', 'data-folder-id',
    'data-file-path', 'data-file-name', 'src', 'alt', 'width', 'height',
    'data-direction', 'aria-label', 'title', 'draggable',
    'contenteditable', 'xmlns', 'viewBox', 'fill', 'stroke',
    'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd',
    'colspan', 'rowspan', 'data-checklist', 'style',
    // SVG geometry attributes used by block icons
    'points', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'x', 'y'
  ],
  ALLOW_DATA_ATTR: true
}

// Restrict inline styles to safe CSS properties only
const ALLOWED_CSS_PROPERTIES = new Set(['text-align', 'font-size'])

if (typeof window !== 'undefined' && typeof DOMPurify.addHook === 'function') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.hasAttribute('style')) {
      const style = (node as HTMLElement).style
      const allowed: string[] = []
      for (let i = 0; i < style.length; i++) {
        const prop = style[i]
        if (ALLOWED_CSS_PROPERTIES.has(prop)) {
          allowed.push(`${prop}: ${style.getPropertyValue(prop)}`)
        }
      }
      if (allowed.length > 0) {
        node.setAttribute('style', allowed.join('; '))
      } else {
        node.removeAttribute('style')
      }
    }
  })
}
