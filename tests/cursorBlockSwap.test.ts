import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  applyBlockFormat
} from '@/lib/editor/commandDispatcher'
import {
  captureBlockSelection,
  captureBlockCursorPath,
  restoreBlockSelection,
  restoreBlockCursorPath,
  isCaretAnchoredToEditorRoot,
  setCursorAtEnd
} from '@/lib/editor/cursorPosition'

/**
 * Regression tests for the "cursor jumps to the top" bug.
 *
 * Replacing a block (e.g. <p> → <h3>) removes the node that contained the
 * selection. Browsers react by snapping the caret to the editor root — which
 * renders at the top of the note — until something restores it. The old
 * implementation only restored the caret after an 80ms timeout, so users saw
 * the caret flash at the top and fast typing landed outside the new heading.
 */
describe('Block swap cursor restoration', () => {
  let container: HTMLDivElement
  let editor: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    editor = document.createElement('div')
    editor.contentEditable = 'true'
    container.appendChild(editor)
    document.body.appendChild(container)

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    document.body.removeChild(container)
    vi.restoreAllMocks()
  })

  describe('captureBlockSelection / restoreBlockSelection', () => {
    it('captures a collapsed caret inside a block', () => {
      const p = document.createElement('p')
      p.textContent = 'Hello world'
      editor.appendChild(p)

      const range = document.createRange()
      range.setStart(p.firstChild!, 5)
      range.collapse(true)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      const snapshot = captureBlockSelection(p)
      expect(snapshot).not.toBeNull()
      expect(snapshot!.collapsed).toBe(true)
      expect(snapshot!.startTextOffset).toBe(5)
    })

    it('returns null when the caret is outside the block', () => {
      const p = document.createElement('p')
      p.textContent = 'Hello'
      editor.appendChild(p)

      const other = document.createElement('p')
      other.textContent = 'Other'
      editor.appendChild(other)

      const range = document.createRange()
      range.setStart(other.firstChild!, 1)
      range.collapse(true)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      expect(captureBlockSelection(p)).toBeNull()
    })

    it('restores the caret after the block children move to a new parent', () => {
      const p = document.createElement('p')
      p.textContent = 'Hello world'
      editor.appendChild(p)

      const range = document.createRange()
      range.setStart(p.firstChild!, 7)
      range.collapse(true)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      const snapshot = captureBlockSelection(p)

      // Simulate the block swap: move children into the replacement element
      const h3 = document.createElement('h3')
      while (p.firstChild) h3.appendChild(p.firstChild)
      p.parentNode!.replaceChild(h3, p)

      expect(restoreBlockSelection(snapshot, h3)).toBe(true)

      const selection = window.getSelection()!
      const restored = selection.getRangeAt(0)
      expect(restored.collapsed).toBe(true)
      expect(h3.contains(restored.startContainer)).toBe(true)
      expect(restored.startOffset).toBe(7)
    })

    it('keeps a non-collapsed selection instead of collapsing it', () => {
      const p = document.createElement('p')
      p.textContent = 'Select these words'
      editor.appendChild(p)

      const range = document.createRange()
      range.setStart(p.firstChild!, 0)
      range.setEnd(p.firstChild!, 6)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      const h3 = document.createElement('h3')
      const snapshot = captureBlockSelection(p)

      while (p.firstChild) h3.appendChild(p.firstChild)
      p.parentNode!.replaceChild(h3, p)

      restoreBlockSelection(snapshot, h3)

      const restored = window.getSelection()!.getRangeAt(0)
      expect(restored.collapsed).toBe(false)
      expect(restored.toString()).toBe('Select')
    })

    it('falls back to text offsets when the original nodes were replaced', () => {
      const p = document.createElement('p')
      p.textContent = 'Hello world'
      editor.appendChild(p)

      const range = document.createRange()
      range.setStart(p.firstChild!, 5)
      range.collapse(true)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      const snapshot = captureBlockSelection(p)

      // Replacement that clones instead of moving (nodes become detached)
      const h3 = document.createElement('h3')
      h3.textContent = 'Hello world'
      p.parentNode!.replaceChild(h3, p)

      expect(restoreBlockSelection(snapshot, h3)).toBe(true)

      const restored = window.getSelection()!.getRangeAt(0)
      expect(h3.contains(restored.startContainer)).toBe(true)
      expect(restored.startOffset).toBe(5)
    })
  })

  describe('applyBlockFormat caret behaviour', () => {
    it('restores the caret synchronously when converting a paragraph to h3', () => {
      const p = document.createElement('p')
      p.textContent = 'Convert me to a heading'
      editor.appendChild(p)

      const range = document.createRange()
      range.setStart(p.firstChild!, 9)
      range.collapse(true)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      applyBlockFormat('h3', editor)

      // No timers awaited on purpose: the caret must be re-applied in the same
      // task, otherwise it is detached to the editor root for at least a frame.
      const h3 = editor.querySelector('h3')
      expect(h3).toBeTruthy()

      const selection = window.getSelection()!
      const restored = selection.getRangeAt(0)
      expect(restored.collapsed).toBe(true)
      expect(editor.contains(restored.startContainer)).toBe(true)
      expect(isCaretAnchoredToEditorRoot(editor)).toBe(false)
      expect(h3!.contains(restored.startContainer)).toBe(true)
      expect(restored.startOffset).toBe(9)
    })

    it('keeps a text selection when applying a heading', () => {
      const p = document.createElement('p')
      p.textContent = 'Keep this selected'
      editor.appendChild(p)

      const range = document.createRange()
      range.setStart(p.firstChild!, 0)
      range.setEnd(p.firstChild!, 4)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      applyBlockFormat('h3', editor)

      const restored = window.getSelection()!.getRangeAt(0)
      expect(restored.collapsed).toBe(false)
      expect(restored.toString()).toBe('Keep')
    })

    it('places the caret inside an empty paragraph converted to h3', () => {
      const p = document.createElement('p')
      p.appendChild(document.createElement('br'))
      editor.appendChild(p)

      const range = document.createRange()
      range.setStart(p, 0)
      range.collapse(true)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      applyBlockFormat('h3', editor)

      const h3 = editor.querySelector('h3')
      expect(h3).toBeTruthy()

      const restored = window.getSelection()!.getRangeAt(0)
      expect(h3!.contains(restored.startContainer)).toBe(true)
      expect(isCaretAnchoredToEditorRoot(editor)).toBe(false)
    })

    it('does not move the caret when the tag already matches', () => {
      const p = document.createElement('p')
      p.textContent = 'Already a paragraph'
      editor.appendChild(p)

      const range = document.createRange()
      range.setStart(p.firstChild!, 3)
      range.collapse(true)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      applyBlockFormat('p', editor)

      const restored = window.getSelection()!.getRangeAt(0)
      expect(restored.startContainer).toBe(p.firstChild)
      expect(restored.startOffset).toBe(3)
    })

    it('keeps the caret position when toggling a heading back to a paragraph', () => {
      const h3 = document.createElement('h3')
      h3.textContent = 'Toggle me'
      editor.appendChild(h3)

      const range = document.createRange()
      range.setStart(h3.firstChild!, 4)
      range.collapse(true)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      applyBlockFormat('h3', editor)

      const p = editor.querySelector('p')
      expect(p).toBeTruthy()

      const restored = window.getSelection()!.getRangeAt(0)
      expect(p!.contains(restored.startContainer)).toBe(true)
      expect(restored.startOffset).toBe(4)
    })
  })

  describe('setCursorAtEnd placeholder handling', () => {
    it('places the caret before the placeholder <br> of an empty block', () => {
      const h3 = document.createElement('h3')
      h3.appendChild(document.createElement('br'))
      editor.appendChild(h3)

      expect(setCursorAtEnd(h3)).toBe(true)

      const restored = window.getSelection()!.getRangeAt(0)
      expect(restored.collapsed).toBe(true)
      // Caret sits before the <br>, so typing fills the block instead of
      // adding a second line after the placeholder.
      expect(restored.startOffset).toBe(0)
    })
  })

  describe('structural cursor path (undo/redo)', () => {
    it('restores the caret after the whole document is replaced', () => {
      editor.innerHTML = '<p>First</p><p>Second</p><p>Third</p>'
      const third = editor.querySelectorAll('p')[2] as HTMLParagraphElement
      third.firstChild!.textContent = 'Third paragraph'

      const range = document.createRange()
      range.setStart(third.firstChild!, 7)
      range.collapse(true)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      const path = captureBlockCursorPath(editor)
      expect(path).not.toBeNull()
      expect(path!.blockIndex).toBe(2)
      expect(path!.textOffset).toBe(7)
      expect(path!.collapsed).toBe(true)

      // Simulate undo: the entire document (and every node in it) is recreated
      editor.innerHTML = '<p>First</p><p>Second</p><p>Third paragraph</p>'

      expect(restoreBlockCursorPath(editor, path)).toBe(true)

      const restored = window.getSelection()!.getRangeAt(0)
      const blocks = Array.from(editor.children)
      expect(blocks[2].contains(restored.startContainer)).toBe(true)
      expect(restored.collapsed).toBe(true)
      expect(restored.startOffset).toBe(7)
      expect(isCaretAnchoredToEditorRoot(editor)).toBe(false)
    })

    it('keeps a selection inside its block after a document replace', () => {
      editor.innerHTML = '<p>First</p><p>Select these words</p>'
      const p = editor.querySelectorAll('p')[1] as HTMLParagraphElement

      const range = document.createRange()
      range.setStart(p.firstChild!, 0)
      range.setEnd(p.firstChild!, 6)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      const path = captureBlockCursorPath(editor)
      editor.innerHTML = '<p>First</p><p>Select these words</p>'

      expect(restoreBlockCursorPath(editor, path)).toBe(true)

      const restored = window.getSelection()!.getRangeAt(0)
      expect(restored.collapsed).toBe(false)
      expect(restored.toString()).toBe('Select')
    })

    it('returns null when the caret is not inside the editor', () => {
      editor.innerHTML = '<p>Content</p>'
      const outside = document.createElement('p')
      outside.textContent = 'Outside'
      document.body.appendChild(outside)

      const range = document.createRange()
      range.setStart(outside.firstChild!, 0)
      range.collapse(true)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      expect(captureBlockCursorPath(editor)).toBeNull()
      document.body.removeChild(outside)
    })

    it('clamps to the last block when the document shrank', () => {
      editor.innerHTML = '<p>One</p><p>Two</p><p>Three</p>'
      const third = editor.querySelectorAll('p')[2]
      const range = document.createRange()
      range.setStart(third.firstChild!, 3)
      range.collapse(true)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)

      const path = captureBlockCursorPath(editor)

      editor.innerHTML = '<p>One</p><p>Two</p>'
      expect(restoreBlockCursorPath(editor, path)).toBe(true)

      const restored = window.getSelection()!.getRangeAt(0)
      expect(editor.children[1].contains(restored.startContainer)).toBe(true)
    })
  })
})
