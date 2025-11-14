import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setCursorAtEnd,
  setCursorAtStart,
  positionCursorInElement,
  saveCursorPosition,
  restoreCursorPosition,
  getTextOffsetInBlock,
  restoreTextOffsetInBlock,
  createCursorMarker,
  restoreCursorToMarker
} from '@/lib/editor/cursorPosition'

describe('Cursor Position Utilities', () => {
  let container: HTMLDivElement
  let editor: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    editor = document.createElement('div')
    editor.contentEditable = 'true'
    container.appendChild(editor)
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  describe('setCursorAtEnd', () => {
    it('should position cursor at end of text node', () => {
      const textNode = document.createTextNode('Hello world')
      editor.appendChild(textNode)

      const result = setCursorAtEnd(editor)
      expect(result).toBe(true)

      const selection = window.getSelection()
      expect(selection).toBeTruthy()
      expect(selection?.rangeCount).toBe(1)

      const range = selection!.getRangeAt(0)
      expect(range.collapsed).toBe(true)
      expect(range.startContainer).toBe(textNode)
      expect(range.startOffset).toBe(11)
    })

    it('should position cursor at end of empty element', () => {
      const result = setCursorAtEnd(editor)
      expect(result).toBe(true)

      const selection = window.getSelection()
      expect(selection?.rangeCount).toBe(1)
    })

    it('should handle element with multiple child nodes', () => {
      const p = document.createElement('p')
      p.textContent = 'First paragraph'
      editor.appendChild(p)

      const result = setCursorAtEnd(editor)
      expect(result).toBe(true)

      const selection = window.getSelection()
      expect(selection?.rangeCount).toBe(1)
    })
  })

  describe('setCursorAtStart', () => {
    it('should position cursor at start of text node', () => {
      const textNode = document.createTextNode('Hello world')
      editor.appendChild(textNode)

      const result = setCursorAtStart(editor)
      expect(result).toBe(true)

      const selection = window.getSelection()
      const range = selection!.getRangeAt(0)
      expect(range.collapsed).toBe(true)
      expect(range.startContainer).toBe(textNode)
      expect(range.startOffset).toBe(0)
    })

    it('should position cursor at start of empty element', () => {
      const result = setCursorAtStart(editor)
      expect(result).toBe(true)

      const selection = window.getSelection()
      expect(selection?.rangeCount).toBe(1)
    })
  })

  describe('positionCursorInElement', () => {
    it('should position cursor at end by default', async () => {
      const p = document.createElement('p')
      p.textContent = 'Test paragraph'
      editor.appendChild(p)

      positionCursorInElement(p, 'end', editor)

      // Wait for requestAnimationFrame
      await new Promise(resolve => requestAnimationFrame(resolve))
      const selection = window.getSelection()
      expect(selection?.rangeCount).toBe(1)
    })

    it('should position cursor at start when specified', async () => {
      const p = document.createElement('p')
      p.textContent = 'Test paragraph'
      editor.appendChild(p)

      positionCursorInElement(p, 'start', editor)

      await new Promise(resolve => requestAnimationFrame(resolve))
      const selection = window.getSelection()
      expect(selection?.rangeCount).toBe(1)
    })
  })

  describe('saveCursorPosition and restoreCursorPosition', () => {
    it('should save and restore cursor position', () => {
      const p = document.createElement('p')
      const textNode = document.createTextNode('Test paragraph')
      p.appendChild(textNode)
      editor.appendChild(p)

      // Set cursor in the middle
      const selection = window.getSelection()!
      const range = document.createRange()
      range.setStart(textNode, 5)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)

      // Save position
      const snapshot = saveCursorPosition()
      expect(snapshot).toBeTruthy()

      // Move cursor elsewhere
      range.setStart(textNode, 0)
      selection.removeAllRanges()
      selection.addRange(range)

      // Restore position
      const restored = restoreCursorPosition(snapshot, editor)
      expect(restored).toBe(true)

      const newRange = selection.getRangeAt(0)
      expect(newRange.startOffset).toBe(5)
    })

    it('should return null when no selection exists', () => {
      const selection = window.getSelection()!
      selection.removeAllRanges()

      const snapshot = saveCursorPosition()
      expect(snapshot).toBeNull()
    })

    it('should return false when restoring null snapshot', () => {
      const result = restoreCursorPosition(null, editor)
      expect(result).toBe(false)
    })
  })

  describe('getTextOffsetInBlock and restoreTextOffsetInBlock', () => {
    it('should get and restore text offset correctly', () => {
      const p = document.createElement('p')
      const textNode = document.createTextNode('Hello world')
      p.appendChild(textNode)
      editor.appendChild(p)

      // Set cursor at offset 5
      const selection = window.getSelection()!
      const range = document.createRange()
      range.setStart(textNode, 5)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)

      // Get offset
      const offset = getTextOffsetInBlock(p)
      expect(offset).toBe(5)

      // Move cursor elsewhere
      range.setStart(textNode, 0)
      selection.removeAllRanges()
      selection.addRange(range)

      // Restore offset
      const restored = restoreTextOffsetInBlock(p, offset)
      expect(restored).toBe(true)

      const newRange = selection.getRangeAt(0)
      expect(newRange.startOffset).toBe(5)
    })

    it('should handle offset beyond text length', () => {
      const p = document.createElement('p')
      const textNode = document.createTextNode('Short')
      p.appendChild(textNode)
      editor.appendChild(p)

      const restored = restoreTextOffsetInBlock(p, 100)
      expect(restored).toBe(true)

      // Should position at end
      const selection = window.getSelection()!
      const range = selection.getRangeAt(0)
      expect(range.startOffset).toBeLessThanOrEqual(5)
    })
  })

  describe('createCursorMarker and restoreCursorToMarker', () => {
    it('should create marker and restore cursor to it', () => {
      const p = document.createElement('p')
      const textNode = document.createTextNode('Test text')
      p.appendChild(textNode)
      editor.appendChild(p)

      // Set cursor in middle
      const selection = window.getSelection()!
      const range = document.createRange()
      range.setStart(textNode, 5)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)

      // Create marker
      const marker = createCursorMarker()
      expect(marker).toBeTruthy()
      expect(marker?.id).toContain('cursor-marker-')

      // Move cursor elsewhere
      range.setStart(textNode, 0)
      selection.removeAllRanges()
      selection.addRange(range)

      // Restore to marker
      const restored = restoreCursorToMarker(marker!)
      expect(restored).toBe(true)

      // Marker should be removed
      expect(marker!.isConnected).toBe(false)
    })

    it('should return null when no selection exists', () => {
      const selection = window.getSelection()!
      selection.removeAllRanges()

      const marker = createCursorMarker()
      expect(marker).toBeNull()
    })
  })

  describe('Edge cases', () => {
    it('should handle elements removed from DOM', () => {
      const p = document.createElement('p')
      p.textContent = 'Test'
      editor.appendChild(p)

      const snapshot = saveCursorPosition()

      // Remove element
      editor.removeChild(p)

      // Try to restore - should fail gracefully
      const restored = restoreCursorPosition(snapshot, editor)
      expect(restored).toBe(false)
    })

    it('should handle nested elements', () => {
      const p = document.createElement('p')
      const strong = document.createElement('strong')
      const textNode = document.createTextNode('Bold text')
      strong.appendChild(textNode)
      p.appendChild(strong)
      editor.appendChild(p)

      // Set cursor in nested element
      const selection = window.getSelection()!
      const range = document.createRange()
      range.setStart(textNode, 3)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)

      const offset = getTextOffsetInBlock(p)
      expect(offset).toBe(3)

      const restored = restoreTextOffsetInBlock(p, offset)
      expect(restored).toBe(true)
    })
  })
})
