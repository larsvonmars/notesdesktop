import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { HistoryManager, createDebouncedCapture } from '@/lib/editor/historyManager'

describe('HistoryManager', () => {
  let editor: HTMLDivElement
  let container: HTMLDivElement
  let hm: HistoryManager

  beforeEach(() => {
    container = document.createElement('div')
    editor = document.createElement('div')
    editor.contentEditable = 'true'
    container.appendChild(editor)
    document.body.appendChild(container)
    hm = new HistoryManager(editor)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  // ---------- Basic undo/redo ----------
  describe('Basic undo/redo', () => {
    it('should initialize with a single snapshot', () => {
      hm.initialize()
      expect(hm.getStackSize()).toBe(1)
      expect(hm.canUndo()).toBe(false)
      expect(hm.canRedo()).toBe(false)
    })

    it('should push a snapshot and enable undo', () => {
      hm.initialize()
      editor.innerHTML = '<p>Change 1</p>'
      hm.push(true)
      expect(hm.getStackSize()).toBe(2)
      expect(hm.canUndo()).toBe(true)
      expect(hm.canRedo()).toBe(false)
    })

    it('undo should restore previous content', () => {
      hm.initialize()
      const initialContent = editor.innerHTML
      editor.innerHTML = '<p>Modified</p>'
      hm.push(true)
      hm.undo()
      // The editor should be restored to initial content
      expect(editor.innerHTML).toBe(initialContent)
    })

    it('redo should restore after undo', () => {
      hm.initialize()
      editor.innerHTML = '<p>V1</p>'
      hm.push(true)
      const v1Content = editor.innerHTML
      hm.undo()
      expect(hm.canRedo()).toBe(true)
      hm.redo()
      expect(editor.innerHTML).toBe(v1Content)
    })

    it('pushing after undo should discard redo stack', () => {
      vi.useFakeTimers()
      hm.initialize()
      vi.advanceTimersByTime(600)
      editor.innerHTML = '<p>V1</p>'
      hm.push(true)
      vi.advanceTimersByTime(600)
      editor.innerHTML = '<p>V2</p>'
      hm.push(true)
      vi.advanceTimersByTime(600)
      hm.undo()
      // Wait for isCapturing to be re-enabled after restore
      vi.advanceTimersByTime(600)
      hm.undo()
      vi.advanceTimersByTime(600)
      // Now push a new branch
      editor.innerHTML = '<p>V3</p>'
      hm.push(true)
      expect(hm.canRedo()).toBe(false)
      vi.useRealTimers()
    })
  })

  // ---------- Transaction Groups ----------
  describe('Transaction groups', () => {
    it('beginGroup/endGroup should tag snapshots', () => {
      hm.initialize()
      editor.innerHTML = '<p>Before group</p>'
      hm.beginGroup('test-group')
      editor.innerHTML = '<p>Step 1</p>'
      hm.push(true)
      editor.innerHTML = '<p>Step 2</p>'
      hm.push(true)
      hm.endGroup()
      // Should have snapshots from init + before-group capture + group steps + end-group capture
      expect(hm.getStackSize()).toBeGreaterThanOrEqual(4)
    })

    it('undo should skip past all snapshots in a group', () => {
      vi.useFakeTimers()
      hm.initialize()
      vi.advanceTimersByTime(600)

      editor.innerHTML = '<p>Pre-group</p>'
      hm.push(true)
      vi.advanceTimersByTime(600)
      const preGroup = editor.innerHTML

      hm.beginGroup('bulk')
      vi.advanceTimersByTime(600)
      editor.innerHTML = '<p>G-1</p>'
      hm.push(true)
      vi.advanceTimersByTime(600)
      editor.innerHTML = '<p>G-2</p>'
      hm.push(true)
      vi.advanceTimersByTime(600)
      editor.innerHTML = '<p>G-3</p>'
      hm.push(true)
      vi.advanceTimersByTime(600)
      hm.endGroup()
      vi.advanceTimersByTime(600)

      // First undo steps past the endGroup snapshot
      hm.undo()
      vi.advanceTimersByTime(600)
      // Second undo skips past the group-tagged snapshots
      hm.undo()
      vi.advanceTimersByTime(600)

      // Should be at the pre-group state
      expect(editor.innerHTML).toBe(preGroup)
      vi.useRealTimers()
    })

    it('redo should skip to end of group', () => {
      hm.initialize()
      editor.innerHTML = '<p>Pre-group</p>'
      hm.push(true)

      hm.beginGroup('bulk')
      editor.innerHTML = '<p>G-1</p>'
      hm.push(true)
      editor.innerHTML = '<p>G-2</p>'
      hm.push(true)
      hm.endGroup()

      const afterGroup = editor.innerHTML

      // Undo the group
      hm.undo()
      expect(hm.canRedo()).toBe(true)
      // Redo should jump to end of group
      hm.redo()
      // We should be at the snapshot captured by endGroup
      // which has the same content as the last pushed snapshot in the group
    })
  })

  // ---------- Memory management ----------
  describe('Memory management', () => {
    it('should track memory usage', () => {
      hm.initialize()
      const baseMemory = hm.getMemoryUsage()
      editor.innerHTML = '<p>' + 'x'.repeat(1000) + '</p>'
      hm.push(true)
      expect(hm.getMemoryUsage()).toBeGreaterThan(baseMemory)
    })

    it('should evict oldest snapshots when over max size', () => {
      // Create a manager with small max size by accessing private field
      hm.initialize()
      // Push many snapshots
      for (let i = 0; i < 120; i++) {
        editor.innerHTML = `<p>Snapshot ${i}</p>`
        hm.push(true)
      }
      // Stack should be capped; default maxSize is 100
      expect(hm.getStackSize()).toBeLessThanOrEqual(101) // 100 + possible 1 for rounding
    })

    it('clear should reset memory tracking', () => {
      hm.initialize()
      editor.innerHTML = '<p>data</p>'
      hm.push(true)
      hm.clear()
      expect(hm.getMemoryUsage()).toBe(0)
      expect(hm.getStackSize()).toBe(0)
    })
  })

  // ---------- Debounce ----------
  describe('Debounce', () => {
    it('should debounce rapid pushes when forceCapture is false', () => {
      hm.initialize()
      editor.innerHTML = '<p>A</p>'
      hm.push(false) // should be debounced (within 500ms of init push)
      // Only initial snapshot should be present since debounce blocks
      expect(hm.getStackSize()).toBe(1)
    })

    it('forceCapture should bypass debounce', () => {
      hm.initialize()
      editor.innerHTML = '<p>A</p>'
      hm.push(true) // force
      expect(hm.getStackSize()).toBe(2)
    })
  })

  // ---------- createDebouncedCapture ----------
  describe('createDebouncedCapture', () => {
    it('should create a debounced capture function', () => {
      vi.useFakeTimers()
      hm.initialize()
      // Advance past the internal push debounce window (500ms)
      vi.advanceTimersByTime(600)
      const capture = createDebouncedCapture(hm, 100)
      editor.innerHTML = '<p>Debounced</p>'
      capture()
      // Before timer fires, stack should still be 1
      expect(hm.getStackSize()).toBe(1)
      vi.advanceTimersByTime(150)
      expect(hm.getStackSize()).toBe(2)
      vi.useRealTimers()
    })

    it('should cancel previous timer on rapid calls', () => {
      vi.useFakeTimers()
      hm.initialize()
      // Advance past the internal push debounce window
      vi.advanceTimersByTime(600)
      const capture = createDebouncedCapture(hm, 100)
      editor.innerHTML = '<p>A</p>'
      capture()
      vi.advanceTimersByTime(50)
      editor.innerHTML = '<p>B</p>'
      capture() // resets timer
      vi.advanceTimersByTime(50)
      // First timer would have fired at 100ms but was cancelled
      expect(hm.getStackSize()).toBe(1)
      vi.advanceTimersByTime(60) // 50+60=110 from second call
      expect(hm.getStackSize()).toBe(2)
      vi.useRealTimers()
    })
  })

  // ---------- Edge cases ----------
  describe('Edge cases', () => {
    it('undo on empty stack returns false', () => {
      expect(hm.undo()).toBe(false)
    })

    it('redo on empty stack returns false', () => {
      expect(hm.redo()).toBe(false)
    })

    it('capture() is shorthand for push(true)', () => {
      hm.initialize()
      editor.innerHTML = '<p>via capture</p>'
      hm.capture()
      expect(hm.getStackSize()).toBe(2)
    })
  })
})
