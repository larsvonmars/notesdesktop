/**
 * Image Custom Block
 * Allows users to insert images into their notes with resize handlers and delete button
 */

import type { CustomBlockDescriptor } from '../../components/RichTextEditor'

export interface ImagePayload {
  src: string
  alt?: string
  width?: number
  height?: number
}

// Minimum image dimensions in pixels
const MIN_IMAGE_SIZE = 100
// Maximum image dimensions in pixels to prevent performance issues
const MAX_IMAGE_SIZE = 4000

/**
 * Escape HTML entities to prevent XSS
 */
function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

/**
 * Validate and sanitize dimension values
 */
function sanitizeDimension(value: number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value < MIN_IMAGE_SIZE) return MIN_IMAGE_SIZE
  if (value > MAX_IMAGE_SIZE) return MAX_IMAGE_SIZE
  return Math.round(value)
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
    
    // Sanitize dimensions
    const width = sanitizeDimension(payload.width)
    const height = sanitizeDimension(payload.height)
    
    const widthStyle = width ? ` style="width: ${width}px;"` : ''
    const heightStyle = height ? ` style="height: ${height}px;"` : ''
    const dimensionsStyle = width || height ? widthStyle + heightStyle : ''

    // Create an image block with custom UI elements (resize handlers and delete button)
    // The structure includes:
    // - A container div with image-block class for styling and interaction
    // - The actual image element
    // - Resize handles on all corners and edges (8 total)
    // - A delete button that appears on hover
    return `<div class="image-block-container my-4 relative group" data-block="true" data-block-type="image" contenteditable="false">
      <div class="image-block-wrapper relative inline-block max-w-full"${dimensionsStyle}>
        <img src="${src}" alt="${alt}" class="image-block-img block w-full h-auto rounded-lg border border-gray-200" draggable="false" />
        
        <!-- Delete button (top-right corner) -->
        <button class="image-delete-btn absolute top-2 right-2 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg flex items-center justify-center z-10" aria-label="Delete image" title="Delete image">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
        
        <!-- Resize handles -->
        <!-- Corner handles -->
        <div class="image-resize-handle image-resize-nw absolute -top-1 -left-1 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-nw-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md" data-direction="nw"></div>
        <div class="image-resize-handle image-resize-ne absolute -top-1 -right-1 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-ne-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md" data-direction="ne"></div>
        <div class="image-resize-handle image-resize-sw absolute -bottom-1 -left-1 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-sw-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md" data-direction="sw"></div>
        <div class="image-resize-handle image-resize-se absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md" data-direction="se"></div>
        
        <!-- Edge handles -->
        <div class="image-resize-handle image-resize-n absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-n-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md" data-direction="n"></div>
        <div class="image-resize-handle image-resize-s absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-s-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md" data-direction="s"></div>
        <div class="image-resize-handle image-resize-w absolute top-1/2 -translate-y-1/2 -left-1 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-w-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md" data-direction="w"></div>
        <div class="image-resize-handle image-resize-e absolute top-1/2 -translate-y-1/2 -right-1 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-e-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md" data-direction="e"></div>
      </div>
    </div>`
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

    // Try to get dimensions from the wrapper's inline style first
    const wrapper = el.querySelector('.image-block-wrapper') as HTMLElement
    let width: number | undefined = undefined
    let height: number | undefined = undefined
    
    if (wrapper && wrapper.style.width) {
      const parsedWidth = parseInt(wrapper.style.width, 10)
      if (!Number.isNaN(parsedWidth)) {
        width = parsedWidth
      }
    }
    
    if (wrapper && wrapper.style.height) {
      const parsedHeight = parseInt(wrapper.style.height, 10)
      if (!Number.isNaN(parsedHeight)) {
        height = parsedHeight
      }
    }

    return {
      src,
      alt: img.getAttribute('alt') || undefined,
      width,
      height
    }
  }
}

/**
 * Initialize image block interactions (resize and delete)
 * This should be called after the editor content is rendered
 */
export function initializeImageBlockInteractions(editorElement: HTMLElement, onContentChange: () => void) {
  if (!editorElement) return

  // Handle delete button clicks
  editorElement.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('image-delete-btn') || target.closest('.image-delete-btn')) {
      e.preventDefault()
      e.stopPropagation()
      
      const container = target.closest('.image-block-container')
      if (container) {
        container.remove()
        onContentChange()
      }
    }
  })

  // Handle resize
  let resizing = false
  let currentHandle: HTMLElement | null = null
  let currentContainer: HTMLElement | null = null
  let currentWrapper: HTMLElement | null = null
  let startX = 0
  let startY = 0
  let startWidth = 0
  let startHeight = 0
  let aspectRatio = 1

  const handleMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('image-resize-handle')) {
      e.preventDefault()
      e.stopPropagation()
      
      resizing = true
      currentHandle = target
      currentContainer = target.closest('.image-block-container') as HTMLElement
      currentWrapper = currentContainer?.querySelector('.image-block-wrapper') as HTMLElement
      
      if (currentWrapper) {
        const rect = currentWrapper.getBoundingClientRect()
        startWidth = rect.width
        startHeight = rect.height
        aspectRatio = startWidth / startHeight
        startX = e.clientX
        startY = e.clientY
        
        // Add resizing class for visual feedback
        currentContainer?.classList.add('resizing')
        document.body.style.cursor = window.getComputedStyle(target).cursor
      }
    }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizing || !currentHandle || !currentWrapper) return
    
    e.preventDefault()
    
    const direction = currentHandle.getAttribute('data-direction')
    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY
    
    let newWidth = startWidth
    let newHeight = startHeight
    
    // Calculate new dimensions based on resize direction
    switch (direction) {
      case 'se': // Southeast (bottom-right)
      case 'e':  // East (right)
        newWidth = Math.max(MIN_IMAGE_SIZE, startWidth + deltaX)
        newHeight = newWidth / aspectRatio
        break
      case 'sw': // Southwest (bottom-left)
      case 'w':  // West (left)
        newWidth = Math.max(MIN_IMAGE_SIZE, startWidth - deltaX)
        newHeight = newWidth / aspectRatio
        break
      case 'ne': // Northeast (top-right)
        newWidth = Math.max(MIN_IMAGE_SIZE, startWidth + deltaX)
        newHeight = newWidth / aspectRatio
        break
      case 'nw': // Northwest (top-left)
        newWidth = Math.max(MIN_IMAGE_SIZE, startWidth - deltaX)
        newHeight = newWidth / aspectRatio
        break
      case 's':  // South (bottom)
        newHeight = Math.max(MIN_IMAGE_SIZE, startHeight + deltaY)
        newWidth = newHeight * aspectRatio
        break
      case 'n':  // North (top)
        newHeight = Math.max(MIN_IMAGE_SIZE, startHeight - deltaY)
        newWidth = newHeight * aspectRatio
        break
    }
    
    // Apply new dimensions
    currentWrapper.style.width = `${newWidth}px`
    currentWrapper.style.height = `${newHeight}px`
  }

  const handleMouseUp = () => {
    if (resizing) {
      resizing = false
      currentContainer?.classList.remove('resizing')
      document.body.style.cursor = ''
      
      // Trigger content change to save the new dimensions
      if (currentContainer) {
        onContentChange()
      }
      
      currentHandle = null
      currentContainer = null
      currentWrapper = null
    }
  }

  editorElement.addEventListener('mousedown', handleMouseDown)
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)

  // Return cleanup function
  return () => {
    editorElement.removeEventListener('mousedown', handleMouseDown)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
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
