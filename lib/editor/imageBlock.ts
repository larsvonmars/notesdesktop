/**
 * Image Custom Block
 * Allows users to insert images into their notes with resize handlers and delete button
 */

import type { CustomBlockDescriptor } from '../../components/RichTextEditor'

export type ImageAlignment = 'left' | 'center' | 'right' | 'full'

export interface CropData {
  x: number // X position as percentage (0-100)
  y: number // Y position as percentage (0-100)
  width: number // Width as percentage (0-100)
  height: number // Height as percentage (0-100)
}

export interface ImagePayload {
  src: string
  alt?: string
  width?: number
  height?: number
  alignment?: ImageAlignment
  crop?: CropData
  caption?: string
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
    const caption = payload.caption ? escapeHtml(payload.caption) : ''
    const alignment = payload.alignment || 'center'
    
    // Sanitize dimensions
    const width = sanitizeDimension(payload.width)
    
    // Build styles for wrapper based on alignment and width
    const wrapperStyles: string[] = []
    if (width) {
      wrapperStyles.push(`width: ${width}px`)
    }
    
    const wrapperStyleAttr = wrapperStyles.length > 0 ? ` style="${wrapperStyles.join('; ')}"` : ''
    
    // Container alignment classes
    let containerClasses = 'image-block-container my-4 relative group'
    if (alignment === 'left') {
      containerClasses += ' mr-auto'
    } else if (alignment === 'right') {
      containerClasses += ' ml-auto'
    } else if (alignment === 'center') {
      containerClasses += ' mx-auto'
    } else if (alignment === 'full') {
      containerClasses += ' w-full'
    }
    
    // Apply crop if present
    let imgStyles = 'display: block; width: 100%; height: auto;'
    let imgClasses = 'image-block-img rounded-lg border border-gray-200'
    
    if (payload.crop) {
      // Use object-fit and object-position for cropping
      const { x, y, width: cropWidth, height: cropHeight } = payload.crop
      imgStyles = `
        display: block;
        width: 100%;
        height: 0;
        padding-bottom: ${cropHeight}%;
        object-fit: cover;
        object-position: ${x}% ${y}%;
      `.trim().replace(/\s+/g, ' ')
    }

    // Create an image block with custom UI elements
    return `<div class="${containerClasses}" data-block="true" data-block-type="image" data-alignment="${alignment}">

      <div class="image-block-wrapper relative inline-flex flex-col justify-center items-center max-w-full"${wrapperStyleAttr}>
        <div class="relative w-full">

          <img src="${src}" alt="${alt}" class="${imgClasses}" style="${imgStyles}" draggable="false" contenteditable="false" />
          
          <!-- Toolbar (top-left corner, shows on hover) -->
          <div class="image-toolbar absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20" contenteditable="false">
            <!-- Alignment buttons -->
            <button type="button" class="image-align-btn w-8 h-8 bg-white hover:bg-gray-100 text-gray-700 rounded shadow-lg flex items-center justify-center" data-align="left" aria-label="Align left" title="Align left" contenteditable="false">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="17" y1="10" x2="3" y2="10" />
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="21" y1="14" x2="3" y2="14" />
                <line x1="17" y1="18" x2="3" y2="18" />
              </svg>
            </button>
            <button type="button" class="image-align-btn w-8 h-8 bg-white hover:bg-gray-100 text-gray-700 rounded shadow-lg flex items-center justify-center" data-align="center" aria-label="Align center" title="Align center" contenteditable="false">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="10" x2="6" y2="10" />
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="21" y1="14" x2="3" y2="14" />
                <line x1="18" y1="18" x2="6" y2="18" />
              </svg>
            </button>
            <button type="button" class="image-align-btn w-8 h-8 bg-white hover:bg-gray-100 text-gray-700 rounded shadow-lg flex items-center justify-center" data-align="right" aria-label="Align right" title="Align right" contenteditable="false">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="21" y1="10" x2="7" y2="10" />
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="21" y1="14" x2="3" y2="14" />
                <line x1="21" y1="18" x2="7" y2="18" />
              </svg>
            </button>
            <button type="button" class="image-align-btn w-8 h-8 bg-white hover:bg-gray-100 text-gray-700 rounded shadow-lg flex items-center justify-center" data-align="full" aria-label="Full width" title="Full width" contenteditable="false">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
            <!-- Crop button -->
            <button type="button" class="image-crop-btn w-8 h-8 bg-white hover:bg-gray-100 text-gray-700 rounded shadow-lg flex items-center justify-center" aria-label="Crop image" title="Crop image" contenteditable="false">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15" />
                <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15" />
              </svg>
            </button>
          </div>
          
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
          <div class="image-resize-handle image-resize-nw absolute -top-1.5 -left-1.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-nw-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="nw" contenteditable="false"></div>
          <div class="image-resize-handle image-resize-ne absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-ne-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="ne" contenteditable="false"></div>
          <div class="image-resize-handle image-resize-sw absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-sw-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="sw" contenteditable="false"></div>
          <div class="image-resize-handle image-resize-se absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="se" contenteditable="false"></div>
          <div class="image-resize-handle image-resize-n absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-n-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="n" contenteditable="false"></div>
          <div class="image-resize-handle image-resize-s absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-s-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="s" contenteditable="false"></div>
          <div class="image-resize-handle image-resize-w absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-w-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="w" contenteditable="false"></div>
          <div class="image-resize-handle image-resize-e absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-e-resize opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10" data-direction="e" contenteditable="false"></div>
        </div>
        ${caption ? `<div class="image-caption text-sm text-gray-600 italic mt-2 px-2 text-center" contenteditable="true">${caption}</div>` : ''}
        <!-- Note: Caption is escaped during render and further sanitized by DOMPurify in RichTextEditor.
             The contenteditable="true" allows editing, and content is sanitized on save. -->
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
    
    // Get alignment from container's data attribute
    const alignment = el.getAttribute('data-alignment') as ImageAlignment | null
    
    // Get caption if present
    const captionEl = el.querySelector('.image-caption') as HTMLElement
    const caption = captionEl?.textContent || undefined
    
    // Parse crop data from image styles if present
    let crop: CropData | undefined = undefined
    const imgStyle = img.getAttribute('style') || ''
    if (imgStyle.includes('object-position')) {
      const posMatch = imgStyle.match(/object-position:\s*([0-9.]+)%\s+([0-9.]+)%/)
      const paddingMatch = imgStyle.match(/padding-bottom:\s*([0-9.]+)%/)
      
      if (posMatch && paddingMatch) {
        // These are the crop position values; we need to reconstruct the crop dimensions
        // For now, store basic crop info (full implementation would need more data)
        crop = {
          x: parseFloat(posMatch[1]),
          y: parseFloat(posMatch[2]),
          width: 100, // Default to full width
          height: parseFloat(paddingMatch[1])
        }
      }
    }

    return {
      src,
      alt: img.getAttribute('alt') || undefined,
      width,
      alignment: alignment || undefined,
      caption,
      crop

    }
  }
}

/**
 * Enter crop mode for an image
 */
function enterCropMode(container: HTMLElement, onContentChange: () => void) {
  container.classList.add('cropping')
  
  const img = container.querySelector('.image-block-img') as HTMLImageElement
  const wrapper = container.querySelector('.image-block-wrapper') as HTMLElement
  
  if (!img || !wrapper) return
  
  // Create crop overlay
  const overlay = document.createElement('div')
  overlay.className = 'crop-overlay absolute inset-0 bg-black bg-opacity-50 z-30'
  overlay.contentEditable = 'false'
  
  // Create crop area (initially covers the whole image)
  const cropArea = document.createElement('div')
  cropArea.className = 'crop-area absolute border-2 border-white shadow-lg cursor-move'
  cropArea.style.cssText = 'top: 10%; left: 10%; width: 80%; height: 80%;'
  cropArea.contentEditable = 'false'
  
  // Add crop handles
  const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w']
  handles.forEach(dir => {
    const handle = document.createElement('div')
    handle.className = `crop-handle crop-handle-${dir} absolute w-3 h-3 bg-white border-2 border-blue-500 rounded-full`
    handle.setAttribute('data-direction', dir)
    handle.contentEditable = 'false'
    
    // Position handles
    if (dir === 'nw') handle.style.cssText = 'top: -6px; left: -6px; cursor: nw-resize;'
    if (dir === 'ne') handle.style.cssText = 'top: -6px; right: -6px; cursor: ne-resize;'
    if (dir === 'sw') handle.style.cssText = 'bottom: -6px; left: -6px; cursor: sw-resize;'
    if (dir === 'se') handle.style.cssText = 'bottom: -6px; right: -6px; cursor: se-resize;'
    if (dir === 'n') handle.style.cssText = 'top: -6px; left: 50%; transform: translateX(-50%); cursor: n-resize;'
    if (dir === 's') handle.style.cssText = 'bottom: -6px; left: 50%; transform: translateX(-50%); cursor: s-resize;'
    if (dir === 'w') handle.style.cssText = 'top: 50%; left: -6px; transform: translateY(-50%); cursor: w-resize;'
    if (dir === 'e') handle.style.cssText = 'top: 50%; right: -6px; transform: translateY(-50%); cursor: e-resize;'
    
    cropArea.appendChild(handle)
  })
  
  // Add action buttons
  const actions = document.createElement('div')
  actions.className = 'crop-actions absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2 z-40'
  actions.contentEditable = 'false'
  
  const applyBtn = document.createElement('button')
  applyBtn.type = 'button'
  applyBtn.className = 'px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded shadow-lg'
  applyBtn.textContent = 'Apply'
  applyBtn.contentEditable = 'false'
  
  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded shadow-lg'
  cancelBtn.textContent = 'Cancel'
  cancelBtn.contentEditable = 'false'
  
  actions.appendChild(applyBtn)
  actions.appendChild(cancelBtn)
  
  overlay.appendChild(cropArea)
  overlay.appendChild(actions)
  
  const imageContainer = img.parentElement
  if (imageContainer) {
    imageContainer.appendChild(overlay)
  }
  
  // Setup crop area dragging and resizing
  let isDragging = false
  let isResizing = false
  let currentHandle: HTMLElement | null = null
  let startX = 0
  let startY = 0
  let startTop = 0
  let startLeft = 0
  let startWidth = 0
  let startHeight = 0
  
  const handleCropPointerDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement
    
    if (target.classList.contains('crop-handle')) {
      // Resizing
      isResizing = true
      currentHandle = target
      e.stopPropagation()
    } else if (target === cropArea) {
      // Dragging
      isDragging = true
    } else {
      return
    }
    
    e.preventDefault()
    startX = e.clientX
    startY = e.clientY
    
    const rect = cropArea.getBoundingClientRect()
    const parentRect = cropArea.parentElement!.getBoundingClientRect()
    
    startTop = ((rect.top - parentRect.top) / parentRect.height) * 100
    startLeft = ((rect.left - parentRect.left) / parentRect.width) * 100
    startWidth = (rect.width / parentRect.width) * 100
    startHeight = (rect.height / parentRect.height) * 100
  }
  
  const handleCropPointerMove = (e: PointerEvent) => {
    if (!isDragging && !isResizing) return
    
    e.preventDefault()
    
    const parentRect = cropArea.parentElement!.getBoundingClientRect()
    const deltaX = ((e.clientX - startX) / parentRect.width) * 100
    const deltaY = ((e.clientY - startY) / parentRect.height) * 100
    
    if (isDragging) {
      let newLeft = startLeft + deltaX
      let newTop = startTop + deltaY
      
      // Constrain to parent
      newLeft = Math.max(0, Math.min(100 - startWidth, newLeft))
      newTop = Math.max(0, Math.min(100 - startHeight, newTop))
      
      cropArea.style.left = `${newLeft}%`
      cropArea.style.top = `${newTop}%`
    } else if (isResizing && currentHandle) {
      const direction = currentHandle.getAttribute('data-direction')
      let newLeft = startLeft
      let newTop = startTop
      let newWidth = startWidth
      let newHeight = startHeight
      
      // Handle resizing based on direction
      if (direction?.includes('e')) {
        newWidth = Math.max(10, Math.min(100 - startLeft, startWidth + deltaX))
      }
      if (direction?.includes('w')) {
        const maxDelta = startLeft
        const constrainedDelta = Math.max(-maxDelta, Math.min(startWidth - 10, deltaX))
        newLeft = startLeft + constrainedDelta
        newWidth = startWidth - constrainedDelta
      }
      if (direction?.includes('s')) {
        newHeight = Math.max(10, Math.min(100 - startTop, startHeight + deltaY))
      }
      if (direction?.includes('n')) {
        const maxDelta = startTop
        const constrainedDelta = Math.max(-maxDelta, Math.min(startHeight - 10, deltaY))
        newTop = startTop + constrainedDelta
        newHeight = startHeight - constrainedDelta
      }
      
      cropArea.style.left = `${newLeft}%`
      cropArea.style.top = `${newTop}%`
      cropArea.style.width = `${newWidth}%`
      cropArea.style.height = `${newHeight}%`

    }
  }
  
  const handleCropPointerUp = () => {
    isDragging = false
    isResizing = false
    currentHandle = null
  }
  
  cropArea.addEventListener('pointerdown', handleCropPointerDown)
  document.addEventListener('pointermove', handleCropPointerMove)
  document.addEventListener('pointerup', handleCropPointerUp)
  
  // Apply crop
  applyBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Get crop coordinates as percentages
    const rect = cropArea.getBoundingClientRect()
    const parentRect = cropArea.parentElement!.getBoundingClientRect()
    
    const cropData: CropData = {
      x: ((rect.left - parentRect.left) / parentRect.width) * 100,
      y: ((rect.top - parentRect.top) / parentRect.height) * 100,
      width: (rect.width / parentRect.width) * 100,
      height: (rect.height / parentRect.height) * 100
    }
    
    // Apply crop to image using object-fit
    img.style.objectFit = 'cover'
    img.style.objectPosition = `${cropData.x}% ${cropData.y}%`
    img.style.height = '0'
    img.style.paddingBottom = `${cropData.height}%`
    
    // Store crop data in a data attribute for persistence
    container.setAttribute('data-crop', JSON.stringify(cropData))
    
    exitCropMode(container)
    onContentChange()
    
    // Cleanup
    document.removeEventListener('pointermove', handleCropPointerMove)
    document.removeEventListener('pointerup', handleCropPointerUp)
  })
  
  // Cancel crop
  cancelBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    exitCropMode(container)
    
    // Cleanup
    document.removeEventListener('pointermove', handleCropPointerMove)
    document.removeEventListener('pointerup', handleCropPointerUp)
  })
}
/**
 * Exit crop mode for an image
 */
function exitCropMode(container: HTMLElement) {
  container.classList.remove('cropping')
  
  const overlay = container.querySelector('.crop-overlay')
  if (overlay) {
    overlay.remove()
  }
}

/**
 * Initialize image block interactions (resize, delete, alignment, crop)
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
        const nextElement = container.nextElementSibling
        
        // Remove the container
        container.remove()
        
        // If there's no next element, create a paragraph so user can continue typing
        if (!nextElement) {
          const paragraph = document.createElement('p')
          paragraph.appendChild(document.createElement('br'))
          
          // Insert after where the image was (which might be at the end)
          if (container.parentNode) {
            container.parentNode.appendChild(paragraph)
          } else {
            editorElement.appendChild(paragraph)
          }
        }
        
        onContentChange()
      }
    }
  }

  // --- Alignment Handler ---
  const handleAlignment = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const alignBtn = target.closest('.image-align-btn') as HTMLElement
    
    if (alignBtn) {
      e.preventDefault()
      e.stopPropagation()
      
      const newAlignment = alignBtn.getAttribute('data-align') as ImageAlignment
      const container = alignBtn.closest('.image-block-container') as HTMLElement
      
      if (container && newAlignment) {
        // Update data attribute
        container.setAttribute('data-alignment', newAlignment)
        
        // Update container classes
        container.classList.remove('mr-auto', 'ml-auto', 'mx-auto', 'w-full')
        
        if (newAlignment === 'left') {
          container.classList.add('mr-auto')
        } else if (newAlignment === 'right') {
          container.classList.add('ml-auto')
        } else if (newAlignment === 'center') {
          container.classList.add('mx-auto')
        } else if (newAlignment === 'full') {
          container.classList.add('w-full')
          // For full width, also update wrapper
          const wrapper = container.querySelector('.image-block-wrapper') as HTMLElement
          if (wrapper) {
            wrapper.style.width = '100%'
          }
        }
        
        onContentChange()
      }
    }
  }

  // --- Crop Handler ---
  const handleCropToggle = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const cropBtn = target.closest('.image-crop-btn')
    
    if (cropBtn) {
      e.preventDefault()
      e.stopPropagation()
      
      const container = cropBtn.closest('.image-block-container') as HTMLElement
      if (container) {
        // Toggle crop mode
        const isCropping = container.classList.contains('cropping')
        
        if (isCropping) {
          // Exit crop mode
          exitCropMode(container)
        } else {
          // Enter crop mode
          enterCropMode(container, onContentChange)
        }
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
  editorElement.addEventListener('click', handleAlignment, true)
  editorElement.addEventListener('click', handleCropToggle, true)
  editorElement.addEventListener('pointerdown', handlePointerDown, true)

  // Return cleanup function
  return () => {
    editorElement.removeEventListener('click', handleDelete, true)
    editorElement.removeEventListener('click', handleAlignment, true)
    editorElement.removeEventListener('click', handleCropToggle, true)
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
