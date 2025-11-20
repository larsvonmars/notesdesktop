/**
 * Image Custom Block
 * Allows users to insert images into their notes
 */

import type { CustomBlockDescriptor } from '../../components/RichTextEditor'

export interface ImagePayload {
  src: string
  alt?: string
  width?: number
  height?: number
}

/**
 * Escape HTML entities to prevent XSS
 */
function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

/**
 * Custom block descriptor for images
 */
export const imageBlock: CustomBlockDescriptor = {
  type: 'image',
  
  render: (payload?: ImagePayload) => {
    if (!payload || !payload.src) {
      return '<div class="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-400 rounded border border-gray-300">🖼️ Invalid Image</div>'
    }

    const src = escapeHtml(payload.src)
    const alt = escapeHtml(payload.alt || 'Image')
    const width = payload.width ? ` width="${payload.width}"` : ''
    const height = payload.height ? ` height="${payload.height}"` : ''

    // Create an image block with custom styling
    return `<div class="my-4 rounded-lg border border-gray-200 overflow-hidden" data-block="true" data-block-type="image"><img src="${src}" alt="${alt}"${width}${height} class="w-full h-auto" /></div>`
  },
  
  parse: (el: HTMLElement): ImagePayload | undefined => {
    const img = el.querySelector('img')
    if (!img) {
      return undefined
    }

    const src = img.getAttribute('src')
    if (!src) {
      return undefined
    }

    const widthAttr = img.getAttribute('width')
    const heightAttr = img.getAttribute('height')
    
    const width = widthAttr ? parseInt(widthAttr, 10) : undefined
    const height = heightAttr ? parseInt(heightAttr, 10) : undefined

    return {
      src,
      alt: img.getAttribute('alt') || undefined,
      width: width !== undefined && !Number.isNaN(width) ? width : undefined,
      height: height !== undefined && !Number.isNaN(height) ? height : undefined
    }
  }
}

/**
 * Helper function to create image HTML
 */
export function createImageHTML(src: string, alt?: string, width?: number, height?: number): string {
  const payload: ImagePayload = {
    src,
    alt,
    width,
    height
  }
  
  return imageBlock.render(payload)
}
