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
    // We don't use height for styling to ensure aspect ratio is maintained by the image itself
    // and to prevent layout issues where the wrapper is taller than the image
    
    const widthStyle = width ? ` style="width: ${width}px;"` : ''

    // Create an image block with custom UI elements (resize handlers and delete button)
    // The structure includes:
    // - A container div that is a proper block-level element
    // - The inner wrapper contains the image and UI controls
    // - The actual image element with contenteditable="false" to prevent editing
    // - Resize handles on all corners and edges (8 total)
    // - A delete button that appears on hover
    // 
    // Key design decisions:
    // - Container is block-level (div with display:block) for proper flow
    // - Only the image itself has contenteditable="false", not the container
    // - Wrapper uses inline-flex to tightly wrap image
    // - All interactive elements have pointer-events CSS to not interfere with text editing
    return `<div class="image-block-container my-4 relative group" data-block="true" data-block-type="image">
      <div class="image-block-wrapper relative inline-flex justify-center items-center max-w-full"${widthStyle}>
        <img src="${src}" alt="${alt}" class="image-block-img block w-full h-auto rounded-lg border border-gray-200" draggable="false" contenteditable="false" />
        
        <!-- Delete button (top-right corner) -->
        <button type="button" class="image-delete-btn absolute top-2 right-2 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg flex items-center justify-center z-20" aria-label="Delete image" title="Delete image" contenteditable="false">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V6" />
            <path d="M8 6V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
        
        <!-- Resize handles -->
        <!-- Corner handles (centered on corners: -top-1.5 -left-1.5 for w-3) -->
        <div class="image-resize-handle image-resize-nw absolute -top-1.5 -left-1.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-nw-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="nw" contenteditable="false"></div>
        <div class="image-resize-handle image-resize-ne absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-ne-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="ne" contenteditable="false"></div>
        <div class="image-resize-handle image-resize-sw absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-sw-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="sw" contenteditable="false"></div>
        <div class="image-resize-handle image-resize-se absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="se" contenteditable="false"></div>
        
        <!-- Edge handles (centered on edges) -->
        <div class="image-resize-handle image-resize-n absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-n-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="n" contenteditable="false"></div>
        <div class="image-resize-handle image-resize-s absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-s-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="s" contenteditable="false"></div>
        <div class="image-resize-handle image-resize-w absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-w-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="w" contenteditable="false"></div>
        <div class="image-resize-handle image-resize-e absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-e-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="e" contenteditable="false"></div>
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
    
    if (wrapper && wrapper.style.width) {
      const parsedWidth = parseInt(wrapper.style.width, 10)
      if (!Number.isNaN(parsedWidth)) {
        width = parsedWidth
      }
    }
    
    // We intentionally don't parse height anymore to enforce aspect ratio

    return {
      src,
      alt: img.getAttribute('alt') || undefined,
      width,
      // height is undefined
    }
  }
}

/**
 * Initialize image block interactions (resize and delete)
 * This should be called after the editor content is rendered
 */
export function initializeImageBlockInteractions(editorElement: HTMLElement, onContentChange: () => void) {
  if (!editorElement) return () => {}

  // --- Delete Handler ---
  const handleDelete = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    // Check for delete button or its children
    const deleteBtn = target.closest('.image-delete-btn')
    
    if (deleteBtn) {
      e.preventDefault()
      e.stopPropagation()
      
      const container = deleteBtn.closest('.image-block-container')
      if (container) {
        // Create a paragraph after removing image to ensure cursor has somewhere to go
        const nextElement = container.nextElementSibling
        const prevElement = container.previousElementSibling
        
        // Remove the container
        container.remove()
        
        // If there's no next element and no previous element, create a paragraph
        if (!nextElement && !prevElement) {
          const paragraph = document.createElement('p')
          paragraph.appendChild(document.createElement('br'))
          editorElement.appendChild(paragraph)
        }
        
        onContentChange()
      }
    }
  }

  // --- Resize Handler ---
  // State for the current resize operation
  let isResizing = false
  let currentHandle: HTMLElement | null = null
  let currentContainer: HTMLElement | null = null
  let currentWrapper: HTMLElement | null = null
  let startX = 0
  let startY = 0
  let startWidth = 0
  let startHeight = 0
  let aspectRatio = 1

  const handlePointerMove = (e: PointerEvent) => {
    if (!isResizing || !currentHandle || !currentWrapper) return
    
    e.preventDefault()
    
    const direction = currentHandle.getAttribute('data-direction')
    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY
    
    let newWidth = startWidth
    let newHeight = startHeight
    
    // Calculate new dimensions based on resize direction
    // We maintain aspect ratio for all resize operations to prevent distortion
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
    // We only set width, and let height be auto to maintain aspect ratio and prevent layout issues
    currentWrapper.style.width = `${newWidth}px`
    // currentWrapper.style.height = `${newHeight}px` // Removed to allow auto height
  }

  const handlePointerUp = (e: PointerEvent) => {
    if (isResizing) {
      isResizing = false
      
      if (currentContainer) {
        currentContainer.classList.remove('resizing')
        onContentChange() // Save changes
      }
      
      document.body.style.cursor = ''
      
      // Clean up global listeners
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      
      // Reset state
      currentHandle = null
      currentContainer = null
      currentWrapper = null
    }
  }

  const handlePointerDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('image-resize-handle')) {
      e.preventDefault()
      e.stopPropagation()
      
      // Only left click (button 0)
      if (e.button !== 0) return

      currentHandle = target
      currentContainer = target.closest('.image-block-container') as HTMLElement
      currentWrapper = currentContainer?.querySelector('.image-block-wrapper') as HTMLElement
      
      if (currentWrapper) {
        const img = currentWrapper.querySelector('img')
        // If image is missing, we can't resize properly
        if (!img) return

        isResizing = true
        const rect = currentWrapper.getBoundingClientRect()
        const imgRect = img.getBoundingClientRect()
        
        startWidth = rect.width
        startHeight = rect.height
        
        // Use image aspect ratio for correctness, as wrapper might be distorted or have extra space
        aspectRatio = imgRect.width / imgRect.height
        
        startX = e.clientX
        startY = e.clientY
        
        // Add resizing class for visual feedback
        currentContainer?.classList.add('resizing')
        document.body.style.cursor = window.getComputedStyle(target).cursor
        
        // Attach global listeners for drag operation
        document.addEventListener('pointermove', handlePointerMove)
        document.addEventListener('pointerup', handlePointerUp)
        
        // Capture pointer to ensure we get events even if cursor leaves window
        target.setPointerCapture(e.pointerId)
      }
    }
  }

  // Attach initial listeners to the editor element
  // Use capturing phase to ensure we get events before they bubble
  editorElement.addEventListener('click', handleDelete, true)
  editorElement.addEventListener('pointerdown', handlePointerDown, true)

  // Return cleanup function
  return () => {
    editorElement.removeEventListener('click', handleDelete, true)
    editorElement.removeEventListener('pointerdown', handlePointerDown, true)
    
    // Ensure we clean up any active resize operation
    document.removeEventListener('pointermove', handlePointerMove)
    document.removeEventListener('pointerup', handlePointerUp)
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
