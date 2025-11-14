/**
 * History Manager - Custom undo/redo stack
 * Replaces native browser undo/redo with snapshot-based history
 */

import { saveSelection, restoreSelection, type SelectionSnapshot } from './commandDispatcher'
import { CURSOR_TIMING } from './cursorPosition'

interface HistorySnapshot {
  content: string
  selection: SelectionSnapshot | null
  timestamp: number
}

export class HistoryManager {
  private stack: HistorySnapshot[] = []
  private currentIndex = -1
  private maxSize = 100
  private editorElement: HTMLElement
  private lastSnapshotTime = 0
  private debounceDelay = 500 // ms
  private isCapturing = true
  
  constructor(editorElement: HTMLElement) {
    this.editorElement = editorElement
  }
  
  /**
   * Push a new snapshot to the history stack
   */
  push(forceCapture = false): void {
    if (!this.isCapturing) return
    
    // Debounce rapid changes
    const now = Date.now()
    if (!forceCapture && now - this.lastSnapshotTime < this.debounceDelay) {
      return
    }
    
    this.lastSnapshotTime = now
    
    const snapshot: HistorySnapshot = {
      content: this.editorElement.innerHTML,
      selection: saveSelection(),
      timestamp: now
    }
    
    // Remove any snapshots after current index (new branch)
    if (this.currentIndex < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.currentIndex + 1)
    }
    
    // Add new snapshot
    this.stack.push(snapshot)
    this.currentIndex++
    
    // Limit stack size
    if (this.stack.length > this.maxSize) {
      this.stack.shift()
      this.currentIndex--
    }
  }
  
  /**
   * Undo to previous snapshot
   */
  undo(): boolean {
    if (!this.canUndo()) return false
    
    // Capture current state before undoing
    if (this.currentIndex === this.stack.length - 1) {
      this.push(true)
      this.currentIndex-- // Move back one more since we just pushed
    }
    
    this.currentIndex--
    this.restore(this.stack[this.currentIndex])
    return true
  }
  
  /**
   * Redo to next snapshot
   */
  redo(): boolean {
    if (!this.canRedo()) return false
    
    this.currentIndex++
    this.restore(this.stack[this.currentIndex])
    return true
  }
  
  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.currentIndex > 0
  }
  
  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.currentIndex < this.stack.length - 1
  }
  
  /**
   * Restore a snapshot
   * Improved with better timing for cursor restoration
   */
  private restore(snapshot: HistorySnapshot): void {
    // Disable capturing during restore
    this.isCapturing = false
    
    try {
      // Restore content
      this.editorElement.innerHTML = snapshot.content
      
      // Ensure editor has focus
      this.editorElement.focus()
      
      // Restore selection with improved timing
      if (snapshot.selection) {
        // Use medium delay to ensure DOM is updated and ready
        setTimeout(() => {
          try {
            restoreSelection(snapshot.selection!)
            // Ensure focus is maintained
            this.editorElement.focus()
          } catch (error) {
            console.warn('Failed to restore selection:', error)
          }
        }, CURSOR_TIMING.MEDIUM)
      }
    } finally {
      // Re-enable capturing with longer delay to prevent immediate re-capture
      setTimeout(() => {
        this.isCapturing = true
      }, CURSOR_TIMING.EXTRA_LONG)
    }
  }
  
  /**
   * Clear history
   */
  clear(): void {
    this.stack = []
    this.currentIndex = -1
    this.lastSnapshotTime = 0
  }
  
  /**
   * Initialize with current state
   */
  initialize(): void {
    this.clear()
    this.push(true)
  }
  
  /**
   * Get debounce delay
   */
  getDebounceDelay(): number {
    return this.debounceDelay
  }
  
  /**
   * Set debounce delay
   */
  setDebounceDelay(delay: number): void {
    this.debounceDelay = delay
  }
  
  /**
   * Force capture current state
   */
  capture(): void {
    this.push(true)
  }
}

/**
 * Create a debounced function for history capture
 */
export function createDebouncedCapture(
  historyManager: HistoryManager,
  delay?: number
): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const actualDelay = delay ?? historyManager.getDebounceDelay()
  
  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    
    timeoutId = setTimeout(() => {
      historyManager.push()
      timeoutId = null
    }, actualDelay)
  }
}
