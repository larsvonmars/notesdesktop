/**
 * History Manager - Custom undo/redo stack
 * Replaces native browser undo/redo with snapshot-based history.
 * Supports transaction grouping for multi-step operations.
 */

import { saveSelection, restoreSelection, type SelectionSnapshot } from './commandDispatcher'
import { CURSOR_TIMING } from './cursorPosition'

interface HistorySnapshot {
  content: string
  selection: SelectionSnapshot | null
  timestamp: number
  /** If set, this snapshot is part of a named transaction group */
  group?: string
}

export class HistoryManager {
  private stack: HistorySnapshot[] = []
  private currentIndex = -1
  private maxSize = 100
  private editorElement: HTMLElement
  private lastSnapshotTime = 0
  private debounceDelay = 500 // ms
  private isCapturing = true
  /** Estimated total memory usage of snapshots in bytes */
  private memoryUsage = 0
  /** Maximum memory budget for history in bytes (5MB) */
  private maxMemoryBytes = 5 * 1024 * 1024
  /** Active transaction group name, or null if not in a transaction */
  private activeGroup: string | null = null
  
  constructor(editorElement: HTMLElement) {
    this.editorElement = editorElement
  }
  
  /**
   * Begin a transaction group. All snapshots pushed while a group is active
   * will be tagged with the group name, allowing them to be undone/redone
   * as a single unit.
   */
  beginGroup(name: string): void {
    // Capture current state before the group starts
    this.push(true)
    this.activeGroup = name
  }
  
  /**
   * End the current transaction group and capture final state.
   */
  endGroup(): void {
    if (this.activeGroup) {
      this.activeGroup = null
      this.push(true)
    }
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
    
    const content = this.editorElement.innerHTML
    const snapshot: HistorySnapshot = {
      content,
      selection: saveSelection(),
      timestamp: now,
      group: this.activeGroup || undefined,
    }
    
    // Remove any snapshots after current index (new branch)
    if (this.currentIndex < this.stack.length - 1) {
      const removed = this.stack.splice(this.currentIndex + 1)
      for (const s of removed) {
        this.memoryUsage -= s.content.length * 2 // rough estimate: 2 bytes per char
      }
    }
    
    // Add new snapshot
    const snapshotSize = content.length * 2
    this.stack.push(snapshot)
    this.currentIndex++
    this.memoryUsage += snapshotSize
    
    // Evict oldest snapshots if over memory budget or max size
    while (
      this.stack.length > 1 &&
      (this.stack.length > this.maxSize || this.memoryUsage > this.maxMemoryBytes)
    ) {
      const evicted = this.stack.shift()!
      this.memoryUsage -= evicted.content.length * 2
      this.currentIndex--
    }
  }
  
  /**
   * Undo to previous snapshot. If the current snapshot is part of a group,
   * undo all snapshots in that group.
   */
  undo(): boolean {
    if (!this.canUndo()) return false
    
    // Capture current state before undoing
    if (this.currentIndex === this.stack.length - 1) {
      this.push(true)
      this.currentIndex-- // Move back one more since we just pushed
    }
    
    // Check if current snapshot is part of a group — skip past all group members
    const currentGroup = this.stack[this.currentIndex]?.group
    if (currentGroup) {
      while (this.currentIndex > 0 && this.stack[this.currentIndex - 1]?.group === currentGroup) {
        this.currentIndex--
      }
      // Move one more to get to the snapshot before the group
      if (this.currentIndex > 0) {
        this.currentIndex--
      }
    } else {
      this.currentIndex--
    }
    
    this.restore(this.stack[this.currentIndex])
    return true
  }
  
  /**
   * Redo to next snapshot. If the next snapshot is part of a group,
   * redo all snapshots in that group.
   */
  redo(): boolean {
    if (!this.canRedo()) return false
    
    this.currentIndex++
    
    // If entering a group, skip to the end of the group
    const nextGroup = this.stack[this.currentIndex]?.group
    if (nextGroup) {
      while (this.currentIndex < this.stack.length - 1 && this.stack[this.currentIndex + 1]?.group === nextGroup) {
        this.currentIndex++
      }
    }
    
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
    this.memoryUsage = 0
    this.activeGroup = null
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

  /**
   * Get approximate memory usage of history stack in bytes
   */
  getMemoryUsage(): number {
    return this.memoryUsage
  }

  /**
   * Get current stack size
   */
  getStackSize(): number {
    return this.stack.length
  }
}

/**
 * Debounced history capture function with a cancel() method to drop
 * any pending capture (e.g. on unmount).
 */
export interface DebouncedCapture {
  (): void
  cancel: () => void
}

/**
 * Create a debounced function for history capture
 */
export function createDebouncedCapture(
  historyManager: HistoryManager,
  delay?: number
): DebouncedCapture {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const actualDelay = delay ?? historyManager.getDebounceDelay()

  const capture = (() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      historyManager.push()
      timeoutId = null
    }, actualDelay)
  }) as DebouncedCapture

  capture.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  return capture
}
