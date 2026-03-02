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
  attachmentId?: string
  storagePath?: string
  mimeType?: string
  sizeBytes?: number
  sourceType?: 'insert' | 'paste' | 'drop' | 'migration'
  uploadedAt?: string
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
    const attachmentId = payload.attachmentId ? escapeHtml(payload.attachmentId) : ''
    const storagePath = payload.storagePath ? escapeHtml(payload.storagePath) : ''
    const mimeType = payload.mimeType ? escapeHtml(payload.mimeType) : ''
    const sourceType = payload.sourceType ? escapeHtml(payload.sourceType) : ''
    const uploadedAt = payload.uploadedAt ? escapeHtml(payload.uploadedAt) : ''
    const sizeBytes = typeof payload.sizeBytes === 'number' && Number.isFinite(payload.sizeBytes)
      ? Math.max(0, Math.round(payload.sizeBytes))
      : undefined
    
    // Sanitize dimensions
    const width = sanitizeDimension(payload.width)
    
    // Store width as a data-attribute (survives DOMPurify ALLOW_DATA_ATTR; rehydrated to style.width at runtime)
    // Also set inline style for immediate render (stripped by sanitiser on save, restored by rehydrateImageWidths)
    const wrapperWidthAttr = width ? ` data-width="${width}" style="width: ${width}px"` : ''
    
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
    const attachmentAttributes = [
      attachmentId ? `data-attachment-id="${attachmentId}"` : '',
      storagePath ? `data-storage-path="${storagePath}"` : '',
      mimeType ? `data-mime-type="${mimeType}"` : '',
      sourceType ? `data-source-type="${sourceType}"` : '',
      uploadedAt ? `data-uploaded-at="${uploadedAt}"` : '',
      sizeBytes !== undefined ? `data-size-bytes="${sizeBytes}"` : '',
    ].filter(Boolean).join(' ')

    return `<div class="${containerClasses}" data-block="true" data-block-type="image" data-alignment="${alignment}" ${attachmentAttributes}>

      <div class="image-block-wrapper relative inline-flex flex-col justify-center items-center max-w-full"${wrapperWidthAttr}>
        <div class="relative inline-block">

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

    // Read width from data-width attribute (sanitizer-safe); fall back to inline style for legacy content
    const wrapper = el.querySelector('.image-block-wrapper') as HTMLElement
    let width: number | undefined = undefined
    
    if (wrapper) {
      const dataWidth = wrapper.getAttribute('data-width')
      if (dataWidth) {
        const parsedWidth = parseInt(dataWidth, 10)
        if (!Number.isNaN(parsedWidth)) width = parsedWidth
      } else if (wrapper.style.width) {
        const parsedWidth = parseInt(wrapper.style.width, 10)
        if (!Number.isNaN(parsedWidth)) width = parsedWidth
      }
    }
    
    // Get alignment from container's data attribute
    const alignment = el.getAttribute('data-alignment') as ImageAlignment | null
    const attachmentId = el.getAttribute('data-attachment-id') || undefined
    const storagePath = el.getAttribute('data-storage-path') || undefined
    const mimeType = el.getAttribute('data-mime-type') || undefined
    const sourceType = (el.getAttribute('data-source-type') as ImagePayload['sourceType']) || undefined
    const uploadedAt = el.getAttribute('data-uploaded-at') || undefined
    const sizeBytesAttr = el.getAttribute('data-size-bytes')
    const parsedSizeBytes = sizeBytesAttr ? parseInt(sizeBytesAttr, 10) : undefined
    const sizeBytes = Number.isFinite(parsedSizeBytes) ? parsedSizeBytes : undefined
    
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
      attachmentId,
      storagePath,
      mimeType,
      sizeBytes,
      sourceType,
      uploadedAt,
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
 * Rehydrate image wrapper widths from data-width attributes.
 * Called after sanitizer passes that strip inline styles.
 */
export function rehydrateImageWidths(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.image-block-wrapper[data-width]').forEach((wrapper) => {
    const dw = wrapper.getAttribute('data-width')
    if (dw) wrapper.style.width = `${dw}px`
  })
}

// ─── Resize-handle overlay ──────────────────────────────────────────────────
// The 8 handles + border outline live in a single fixed-position overlay element
// that is appended to `document.body`, completely outside the contenteditable
// tree. It tracks the bounding rect of the currently-hovered image wrapper.

const HANDLE_DIRECTIONS = ['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'] as const
type HandleDirection = typeof HANDLE_DIRECTIONS[number]

const CURSOR_MAP: Record<HandleDirection, string> = {
  nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize',
  n: 'n-resize', s: 's-resize', w: 'w-resize', e: 'e-resize',
}

function createResizeOverlay(): {
  overlay: HTMLElement
  handles: Map<HandleDirection, HTMLElement>
  border: HTMLElement
} {
  const overlay = document.createElement('div')
  overlay.className = 'image-resize-overlay'
  // Fixed-position wrapper; not inside the editor
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:9999;'

  // Thin border outline shown around the image while the overlay is visible
  const border = document.createElement('div')
  border.className = 'image-resize-border'
  border.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #6366f1;border-radius:6px;z-index:9998;'
  overlay.appendChild(border)

  const handles = new Map<HandleDirection, HTMLElement>()

  for (const dir of HANDLE_DIRECTIONS) {
    const h = document.createElement('div')
    h.className = `image-resize-handle image-resize-${dir}`
    h.setAttribute('data-direction', dir)
    h.style.cssText =
      `position:fixed;width:12px;height:12px;background:#3b82f6;border:2px solid #fff;` +
      `border-radius:50%;cursor:${CURSOR_MAP[dir]};pointer-events:auto;z-index:10000;` +
      `box-shadow:0 1px 3px rgba(0,0,0,0.25);transition:transform 0.1s;`
    overlay.appendChild(h)
    handles.set(dir, h)
  }

  return { overlay, handles, border }
}

/** Position every handle + the border outline around the given viewport rect. */
function positionOverlay(
  rect: DOMRect,
  handles: Map<HandleDirection, HTMLElement>,
  border: HTMLElement,
) {
  const hw = 6 // half handle width
  const { left: l, top: t, right: r, bottom: b, width: w, height: h } = rect
  const cx = l + w / 2
  const cy = t + h / 2

  const pos: Record<HandleDirection, [number, number]> = {
    nw: [l, t], ne: [r, t], sw: [l, b], se: [r, b],
    n: [cx, t], s: [cx, b], w: [l, cy], e: [r, cy],
  }

  for (const dir of HANDLE_DIRECTIONS) {
    const el = handles.get(dir)!
    const [x, y] = pos[dir]
    el.style.left = `${x - hw}px`
    el.style.top = `${y - hw}px`
  }

  border.style.left = `${l - 1}px`
  border.style.top = `${t - 1}px`
  border.style.width = `${w + 2}px`
  border.style.height = `${h + 2}px`
}

/**
 * Initialize image block interactions (resize, delete, alignment, crop, drag-to-reposition).
 *
 * Resize handles now live in a **fixed-position overlay** appended to `document.body`,
 * completely outside the contenteditable tree. They track the bounding rect of the
 * hovered / active image wrapper, so they are never affected by the editor DOM, the
 * DOMPurify sanitiser, or scroll position issues.
 */
export function initializeImageBlockInteractions(editorElement: HTMLElement, onContentChange: () => void) {
  if (!editorElement) return () => {}

  // Restore style.width from data-width on every init
  rehydrateImageWidths(editorElement)

  // ─── Overlay setup ─────────────────────────────────────────────────────────
  const { overlay, handles, border } = createResizeOverlay()
  document.body.appendChild(overlay)

  let activeContainer: HTMLElement | null = null // the .image-block-container currently showing handles

  const showOverlay = (container: HTMLElement) => {
    const wrapper = container.querySelector('.image-block-wrapper') as HTMLElement
    if (!wrapper) return
    activeContainer = container
    overlay.style.display = ''
    const rect = wrapper.getBoundingClientRect()
    positionOverlay(rect, handles, border)
  }

  const hideOverlay = () => {
    if (isResizing) return // don't hide during an active resize drag
    overlay.style.display = 'none'
    activeContainer = null
  }

  /** Refresh overlay position (e.g. during resize or scroll). */
  const refreshOverlay = () => {
    if (!activeContainer) return
    const wrapper = activeContainer.querySelector('.image-block-wrapper') as HTMLElement
    if (!wrapper) { hideOverlay(); return }
    const rect = wrapper.getBoundingClientRect()
    positionOverlay(rect, handles, border)
  }

  // Show / hide on hover over image blocks inside the editor
  const handlePointerEnter = (e: PointerEvent) => {
    if (isResizing || isDraggingImage) return
    const target = e.target as HTMLElement
    const container = target.closest?.('.image-block-container') as HTMLElement | null
    if (container && editorElement.contains(container)) {
      showOverlay(container)
    }
  }

  const handlePointerLeave = (e: PointerEvent) => {
    if (isResizing) return
    const target = e.target as HTMLElement
    const container = target.closest?.('.image-block-container') as HTMLElement | null
    if (!container || container === activeContainer) {
      // Check if related target is still inside the same container OR inside the overlay
      const related = e.relatedTarget as HTMLElement | null
      if (related && (related.closest?.('.image-block-container') === activeContainer || overlay.contains(related))) return
      hideOverlay()
    }
  }

  // Also hide when the pointer leaves the overlay itself (e.g. user moves away from handles)
  const handleOverlayLeave = (e: PointerEvent) => {
    if (isResizing) return
    const related = e.relatedTarget as HTMLElement | null
    if (related && related.closest?.('.image-block-container') === activeContainer) return
    hideOverlay()
  }
  overlay.addEventListener('pointerleave', handleOverlayLeave)

  // Keep overlay tracking the image during scroll
  const handleScroll = () => { refreshOverlay() }

  // ─── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const deleteBtn = target.closest('.image-delete-btn')
    if (!deleteBtn) return

    e.preventDefault()
    e.stopPropagation()

    const container = deleteBtn.closest('.image-block-container')
    if (container) {
      const nextElement = container.nextElementSibling
      hideOverlay()
      container.remove()

      if (!nextElement) {
        const paragraph = document.createElement('p')
        paragraph.appendChild(document.createElement('br'))
        editorElement.appendChild(paragraph)
      }

      onContentChange()
    }
  }

  // ─── Alignment ─────────────────────────────────────────────────────────────
  const handleAlignment = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const alignBtn = target.closest('.image-align-btn') as HTMLElement
    if (!alignBtn) return

    e.preventDefault()
    e.stopPropagation()

    const newAlignment = alignBtn.getAttribute('data-align') as ImageAlignment
    const container = alignBtn.closest('.image-block-container') as HTMLElement

    if (container && newAlignment) {
      container.setAttribute('data-alignment', newAlignment)
      container.classList.remove('mr-auto', 'ml-auto', 'mx-auto', 'w-full')

      if (newAlignment === 'left') {
        container.classList.add('mr-auto')
      } else if (newAlignment === 'right') {
        container.classList.add('ml-auto')
      } else if (newAlignment === 'center') {
        container.classList.add('mx-auto')
      } else if (newAlignment === 'full') {
        container.classList.add('w-full')
        const wrapper = container.querySelector('.image-block-wrapper') as HTMLElement
        if (wrapper) wrapper.style.width = '100%'
      }

      // Re-position the overlay after the layout shift
      requestAnimationFrame(() => refreshOverlay())
      onContentChange()
    }
  }

  // ─── Crop ──────────────────────────────────────────────────────────────────
  const handleCropToggle = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const cropBtn = target.closest('.image-crop-btn')
    if (!cropBtn) return

    e.preventDefault()
    e.stopPropagation()

    const container = cropBtn.closest('.image-block-container') as HTMLElement
    if (container) {
      if (container.classList.contains('cropping')) {
        exitCropMode(container)
      } else {
        hideOverlay()
        enterCropMode(container, onContentChange)
      }
    }
  }

  // ─── Resize (overlay-based) ────────────────────────────────────────────────
  let isResizing = false
  let resizeHandle: HTMLElement | null = null
  let resizeContainer: HTMLElement | null = null
  let resizeWrapper: HTMLElement | null = null
  let startX = 0
  let startY = 0
  let startWidth = 0
  let startHeight = 0
  let aspectRatio = 1
  let resizeTooltip: HTMLElement | null = null

  const removeResizeTooltip = () => {
    resizeTooltip?.remove()
    resizeTooltip = null
  }

  const updateResizeTooltip = (w: number, h: number) => {
    if (!resizeTooltip) {
      resizeTooltip = document.createElement('div')
      resizeTooltip.className = 'image-resize-tooltip'
      document.body.appendChild(resizeTooltip)
    }
    if (!resizeWrapper) return
    const rect = resizeWrapper.getBoundingClientRect()
    resizeTooltip.textContent = `${Math.round(w)} × ${Math.round(h)} px`
    resizeTooltip.style.left = `${rect.left + rect.width / 2}px`
    resizeTooltip.style.top = `${rect.top - 28}px`
  }

  const handleResizePointerMove = (e: PointerEvent) => {
    if (!isResizing || !resizeHandle || !resizeWrapper) return
    e.preventDefault()

    const direction = resizeHandle.getAttribute('data-direction') as HandleDirection
    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY
    const freeResize = e.shiftKey

    let newWidth = startWidth
    let newHeight = startHeight

    switch (direction) {
      case 'se': case 'e':
        newWidth = Math.max(MIN_IMAGE_SIZE, startWidth + deltaX)
        newHeight = freeResize ? startHeight : newWidth / aspectRatio
        break
      case 'sw': case 'w':
        newWidth = Math.max(MIN_IMAGE_SIZE, startWidth - deltaX)
        newHeight = freeResize ? startHeight : newWidth / aspectRatio
        break
      case 'ne':
        newWidth = Math.max(MIN_IMAGE_SIZE, startWidth + deltaX)
        newHeight = freeResize ? startHeight : newWidth / aspectRatio
        break
      case 'nw':
        newWidth = Math.max(MIN_IMAGE_SIZE, startWidth - deltaX)
        newHeight = freeResize ? startHeight : newWidth / aspectRatio
        break
      case 's':
        newHeight = Math.max(MIN_IMAGE_SIZE, startHeight + deltaY)
        newWidth = freeResize ? startWidth : newHeight * aspectRatio
        break
      case 'n':
        newHeight = Math.max(MIN_IMAGE_SIZE, startHeight - deltaY)
        newWidth = freeResize ? startWidth : newHeight * aspectRatio
        break
    }

    newWidth = Math.min(newWidth, MAX_IMAGE_SIZE)
    newHeight = Math.min(newHeight, MAX_IMAGE_SIZE)

    resizeWrapper.style.width = `${newWidth}px`
    refreshOverlay()
    updateResizeTooltip(newWidth, newHeight)
  }

  const handleResizePointerUp = () => {
    if (!isResizing) return
    isResizing = false

    if (resizeContainer && resizeWrapper) {
      resizeContainer.classList.remove('resizing')
      const finalWidth = parseFloat(resizeWrapper.style.width) || startWidth
      resizeWrapper.setAttribute('data-width', String(Math.round(finalWidth)))
      onContentChange()
    }

    document.body.style.cursor = ''
    removeResizeTooltip()

    document.removeEventListener('pointermove', handleResizePointerMove)
    document.removeEventListener('pointerup', handleResizePointerUp)

    resizeHandle = null
    resizeContainer = null
    resizeWrapper = null

    // Re-show overlay at final position
    if (activeContainer) refreshOverlay()
  }

  // Pointer-down on any overlay handle starts a resize
  const handleResizePointerDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement
    if (!target.classList.contains('image-resize-handle')) return
    if (e.button !== 0 || !activeContainer) return

    e.preventDefault()
    e.stopPropagation()

    resizeHandle = target
    resizeContainer = activeContainer
    resizeWrapper = activeContainer.querySelector('.image-block-wrapper') as HTMLElement
    if (!resizeWrapper) return

    const img = resizeWrapper.querySelector('img') as HTMLImageElement
    if (!img) return

    isResizing = true
    const rect = resizeWrapper.getBoundingClientRect()
    startWidth = rect.width
    startHeight = rect.height

    if (img.naturalWidth && img.naturalHeight) {
      aspectRatio = img.naturalWidth / img.naturalHeight
    } else {
      const imgRect = img.getBoundingClientRect()
      aspectRatio = imgRect.width > 0 && imgRect.height > 0 ? imgRect.width / imgRect.height : 1
    }

    startX = e.clientX
    startY = e.clientY

    resizeContainer.classList.add('resizing')
    document.body.style.cursor = target.style.cursor

    document.addEventListener('pointermove', handleResizePointerMove)
    document.addEventListener('pointerup', handleResizePointerUp)

    target.setPointerCapture(e.pointerId)
  }

  // Attach pointerdown to every handle in the overlay
  handles.forEach((h) => {
    h.addEventListener('pointerdown', handleResizePointerDown)
  })

  // ─── Drag-to-reposition ────────────────────────────────────────────────────
  const NON_DRAG_SELECTORS = [
    '.image-resize-handle',
    '.image-delete-btn',
    '.image-align-btn',
    '.image-crop-btn',
    '.image-caption',
    '.crop-overlay',
  ]

  let isDraggingImage = false
  let dragContainer: HTMLElement | null = null
  let dragGhost: HTMLElement | null = null
  let dragCaret: HTMLElement | null = null
  let dragStartX = 0
  let dragStartY = 0
  let dragPointerMoved = false
  const DRAG_THRESHOLD = 6

  const removeImageDragUI = () => {
    dragGhost?.remove()
    dragGhost = null
    dragCaret?.remove()
    dragCaret = null
    dragContainer?.removeAttribute('data-dragging')
    document.documentElement.style.removeProperty('cursor')
  }

  const caretRangeAt = (x: number, y: number): Range | null => {
    if (typeof (document as any).caretRangeFromPoint === 'function') {
      return (document as any).caretRangeFromPoint(x, y) as Range | null
    }
    if (typeof (document as any).caretPositionFromPoint === 'function') {
      const pos = (document as any).caretPositionFromPoint(x, y)
      if (!pos) return null
      const r = document.createRange()
      r.setStart(pos.offsetNode, pos.offset)
      return r
    }
    return null
  }

  const updateDropCaret = (x: number, y: number) => {
    if (!dragCaret) return
    const range = caretRangeAt(x, y)
    if (!range) return
    const rects = range.getClientRects()
    if (rects.length === 0) return
    const rect = rects[0]
    dragCaret.style.left = `${rect.left + window.scrollX}px`
    dragCaret.style.top = `${rect.top + window.scrollY}px`
    dragCaret.style.height = `${Math.max(rect.height, 16)}px`
  }

  const handleImagePointerMove = (e: PointerEvent) => {
    if (!isDraggingImage || !dragContainer) return

    const dx = e.clientX - dragStartX
    const dy = e.clientY - dragStartY
    if (!dragPointerMoved && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return

    dragPointerMoved = true

    if (!dragGhost) {
      dragGhost = document.createElement('div')
      dragGhost.className = 'image-drag-ghost'
      dragGhost.style.cssText =
        'position:fixed;pointer-events:none;z-index:9999;opacity:0.6;' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.25);border-radius:4px;' +
        'transform:rotate(-1deg) scale(0.95);'

      const img = dragContainer.querySelector('.image-block-img') as HTMLImageElement
      if (img) {
        const ghostImg = img.cloneNode() as HTMLImageElement
        ghostImg.style.cssText =
          'display:block;max-width:160px;max-height:120px;object-fit:cover;border-radius:4px;'
        dragGhost.appendChild(ghostImg)
      }
      document.body.appendChild(dragGhost)

      dragCaret = document.createElement('div')
      dragCaret.className = 'image-drop-caret'
      document.body.appendChild(dragCaret)

      dragContainer.setAttribute('data-dragging', 'true')
      document.documentElement.style.cursor = 'grabbing'
      hideOverlay()
    }

    dragGhost.style.left = `${e.clientX + 14}px`
    dragGhost.style.top = `${e.clientY - 20}px`
    updateDropCaret(e.clientX, e.clientY)
  }

  const handleImagePointerUp = (e: PointerEvent) => {
    if (!isDraggingImage) return

    if (dragPointerMoved && dragContainer) {
      const range = caretRangeAt(e.clientX, e.clientY)
      if (range && !dragContainer.contains(range.startContainer)) {
        range.insertNode(dragContainer)

        const next = dragContainer.nextSibling
        if (!next || (next.nodeType === Node.TEXT_NODE && (next as Text).data.trim() === '')) {
          const p = document.createElement('p')
          p.appendChild(document.createElement('br'))
          dragContainer.parentNode?.insertBefore(p, dragContainer.nextSibling)
        }

        onContentChange()
      }
    }

    removeImageDragUI()
    isDraggingImage = false
    dragContainer = null
    dragPointerMoved = false

    document.removeEventListener('pointermove', handleImagePointerMove)
    document.removeEventListener('pointerup', handleImagePointerUp)
  }

  const handleImagePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    if (isResizing) return

    const target = e.target as HTMLElement
    if (!target.closest('.image-block-container')) return
    if (NON_DRAG_SELECTORS.some((sel) => target.closest(sel) !== null)) return

    const container = target.closest('.image-block-container') as HTMLElement
    if (!container) return

    isDraggingImage = true
    dragContainer = container
    dragStartX = e.clientX
    dragStartY = e.clientY
    dragPointerMoved = false

    document.addEventListener('pointermove', handleImagePointerMove)
    document.addEventListener('pointerup', handleImagePointerUp)
  }

  // ─── Attach listeners ─────────────────────────────────────────────────────
  editorElement.addEventListener('click', handleDelete, true)
  editorElement.addEventListener('click', handleAlignment, true)
  editorElement.addEventListener('click', handleCropToggle, true)
  editorElement.addEventListener('pointerenter', handlePointerEnter, true)
  editorElement.addEventListener('pointerleave', handlePointerLeave, true)
  editorElement.addEventListener('pointerdown', handleImagePointerDown, true)
  editorElement.addEventListener('scroll', handleScroll, true)
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', handleScroll)

  // Start hidden
  overlay.style.display = 'none'

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  return () => {
    editorElement.removeEventListener('click', handleDelete, true)
    editorElement.removeEventListener('click', handleAlignment, true)
    editorElement.removeEventListener('click', handleCropToggle, true)
    editorElement.removeEventListener('pointerenter', handlePointerEnter, true)
    editorElement.removeEventListener('pointerleave', handlePointerLeave, true)
    editorElement.removeEventListener('pointerdown', handleImagePointerDown, true)
    editorElement.removeEventListener('scroll', handleScroll, true)
    window.removeEventListener('scroll', handleScroll, true)
    window.removeEventListener('resize', handleScroll)
    overlay.removeEventListener('pointerleave', handleOverlayLeave)

    document.removeEventListener('pointermove', handleResizePointerMove)
    document.removeEventListener('pointerup', handleResizePointerUp)
    document.removeEventListener('pointermove', handleImagePointerMove)
    document.removeEventListener('pointerup', handleImagePointerUp)

    removeImageDragUI()
    removeResizeTooltip()
    overlay.remove()
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
