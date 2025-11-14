/**
 * Touch and Mobile Support Utilities
 * Enhances editor behavior on touch devices
 */

export interface TouchState {
  startX: number
  startY: number
  startTime: number
  target: HTMLElement | null
}

/**
 * Detect if device has touch support
 */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && 
    ('ontouchstart' in window || navigator.maxTouchPoints > 0)
}

/**
 * Get touch coordinates from event
 */
export function getTouchCoordinates(event: TouchEvent): { x: number; y: number } {
  const touch = event.touches[0] || event.changedTouches[0]
  return {
    x: touch.clientX,
    y: touch.clientY
  }
}

/**
 * Calculate distance between two points
 */
export function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Detect if touch was a tap (not a drag)
 */
export function isTap(
  touchState: TouchState,
  currentX: number,
  currentY: number,
  currentTime: number,
  maxDistance: number = 10,
  maxDuration: number = 300
): boolean {
  const distance = getDistance(touchState.startX, touchState.startY, currentX, currentY)
  const duration = currentTime - touchState.startTime
  
  return distance < maxDistance && duration < maxDuration
}

/**
 * Detect if touch was a long press
 */
export function isLongPress(
  touchState: TouchState,
  currentTime: number,
  minDuration: number = 500
): boolean {
  const duration = currentTime - touchState.startTime
  return duration >= minDuration
}

/**
 * Handle selection on touch devices
 * Touch devices need special handling for text selection
 */
export function handleTouchSelection(element: HTMLElement): void {
  // On touch devices, double-tap to select word
  let lastTapTime = 0
  
  element.addEventListener('touchend', (event) => {
    const currentTime = Date.now()
    const timeDiff = currentTime - lastTapTime
    
    if (timeDiff < 300 && timeDiff > 0) {
      // Double tap detected - select word at tap position
      const touch = event.changedTouches[0]
      const range = document.caretRangeFromPoint(touch.clientX, touch.clientY)
      
      if (range) {
        selectWordAtRange(range)
      }
    }
    
    lastTapTime = currentTime
  })
}

/**
 * Select word at the given range
 */
function selectWordAtRange(range: Range): void {
  const selection = window.getSelection()
  if (!selection) return
  
  // Expand to word boundaries
  const textNode = range.startContainer
  if (textNode.nodeType === Node.TEXT_NODE) {
    const text = textNode.textContent || ''
    let start = range.startOffset
    let end = range.startOffset
    
    // Find word start
    while (start > 0 && /\w/.test(text[start - 1])) {
      start--
    }
    
    // Find word end
    while (end < text.length && /\w/.test(text[end])) {
      end++
    }
    
    if (start < end) {
      const wordRange = document.createRange()
      wordRange.setStart(textNode, start)
      wordRange.setEnd(textNode, end)
      selection.removeAllRanges()
      selection.addRange(wordRange)
    }
  }
}

/**
 * Add touch-friendly padding to interactive elements
 */
export function makeTouchFriendly(element: HTMLElement): void {
  // Ensure minimum touch target size (44x44px recommended)
  const style = element.style
  const currentPadding = parseInt(getComputedStyle(element).padding) || 0
  
  if (currentPadding < 11) {
    style.padding = '11px'
  }
  
  // Add visual feedback on touch
  element.classList.add('touch-target')
}

/**
 * Prevent zooming on double-tap while allowing text selection
 */
export function preventDoubleTapZoom(element: HTMLElement): void {
  let lastTouchEnd = 0
  
  element.addEventListener('touchend', (event) => {
    const now = Date.now()
    if (now - lastTouchEnd <= 300) {
      event.preventDefault()
    }
    lastTouchEnd = now
  }, { passive: false })
}

/**
 * Create a touch-friendly toolbar button
 */
export function createTouchButton(
  icon: string,
  label: string,
  onClick: () => void
): HTMLButtonElement {
  const button = document.createElement('button')
  button.innerHTML = icon
  button.setAttribute('aria-label', label)
  button.className = 'touch-button'
  button.style.minWidth = '44px'
  button.style.minHeight = '44px'
  button.style.padding = '12px'
  button.addEventListener('click', onClick)
  
  return button
}
