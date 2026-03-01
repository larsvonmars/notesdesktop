/**
 * Tests for text alignment (commandDispatcher: applyTextAlignment, getTextAlignment)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { applyTextAlignment, getTextAlignment, getBlockAncestor } from '@/lib/editor/commandDispatcher'

describe('Text Alignment', () => {
  let editor: HTMLDivElement

  beforeEach(() => {
    editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    document.body.innerHTML = ''
    document.body.appendChild(editor)
  })

  function selectInsideParagraph(p: HTMLElement) {
    const range = document.createRange()
    if (p.firstChild) {
      range.setStart(p.firstChild, 0)
      range.setEnd(p.firstChild, (p.firstChild as Text).length ?? 0)
    } else {
      range.setStart(p, 0)
      range.setEnd(p, 0)
    }
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
  }

  describe('applyTextAlignment', () => {
    it('should set text-align center on a paragraph', () => {
      editor.innerHTML = '<p>Hello world</p>'
      const p = editor.querySelector('p')!
      selectInsideParagraph(p)
      applyTextAlignment('center', editor)
      expect(p.style.textAlign).toBe('center')
    })

    it('should set text-align right on a paragraph', () => {
      editor.innerHTML = '<p>Hello world</p>'
      const p = editor.querySelector('p')!
      selectInsideParagraph(p)
      applyTextAlignment('right', editor)
      expect(p.style.textAlign).toBe('right')
    })

    it('should remove text-align when applying left (default)', () => {
      editor.innerHTML = '<p style="text-align: center">Hello world</p>'
      const p = editor.querySelector('p')!
      selectInsideParagraph(p)
      applyTextAlignment('left', editor)
      expect(p.style.textAlign).toBe('')
    })

    it('should toggle off center when already centered', () => {
      editor.innerHTML = '<p style="text-align: center">Hello world</p>'
      const p = editor.querySelector('p')!
      selectInsideParagraph(p)
      applyTextAlignment('center', editor)
      // Should toggle back to default (left)
      expect(p.style.textAlign).toBe('')
    })

    it('should work on headings', () => {
      editor.innerHTML = '<h1>Title</h1>'
      const h1 = editor.querySelector('h1')!
      selectInsideParagraph(h1)
      applyTextAlignment('center', editor)
      expect(h1.style.textAlign).toBe('center')
    })

    it('should work on blockquotes', () => {
      editor.innerHTML = '<blockquote>A quote</blockquote>'
      const bq = editor.querySelector('blockquote')!
      selectInsideParagraph(bq)
      applyTextAlignment('right', editor)
      expect(bq.style.textAlign).toBe('right')
    })

    it('should not crash with no selection', () => {
      window.getSelection()?.removeAllRanges()
      expect(() => applyTextAlignment('center', editor)).not.toThrow()
    })
  })

  describe('getTextAlignment', () => {
    it('should return "left" when no explicit alignment', () => {
      editor.innerHTML = '<p>Hello</p>'
      const p = editor.querySelector('p')!
      selectInsideParagraph(p)
      expect(getTextAlignment(editor)).toBe('left')
    })

    it('should return "center" when text-align is center', () => {
      editor.innerHTML = '<p style="text-align: center">Hello</p>'
      const p = editor.querySelector('p')!
      selectInsideParagraph(p)
      expect(getTextAlignment(editor)).toBe('center')
    })

    it('should return "right" when text-align is right', () => {
      editor.innerHTML = '<p style="text-align: right">Hello</p>'
      const p = editor.querySelector('p')!
      selectInsideParagraph(p)
      expect(getTextAlignment(editor)).toBe('right')
    })

    it('should return "left" with no selection', () => {
      window.getSelection()?.removeAllRanges()
      expect(getTextAlignment(editor)).toBe('left')
    })
  })

  describe('getBlockAncestor', () => {
    it('should find paragraph ancestor', () => {
      editor.innerHTML = '<p>Hello <strong>world</strong></p>'
      const strong = editor.querySelector('strong')!
      const block = getBlockAncestor(strong)
      expect(block?.tagName).toBe('P')
    })

    it('should find heading ancestor', () => {
      editor.innerHTML = '<h2>Title</h2>'
      const text = editor.querySelector('h2')!.firstChild!
      const block = getBlockAncestor(text)
      expect(block?.tagName).toBe('H2')
    })

    it('should return null for orphan nodes', () => {
      const orphan = document.createTextNode('orphan')
      expect(getBlockAncestor(orphan)).toBeNull()
    })

    it('should return null for null input', () => {
      expect(getBlockAncestor(null)).toBeNull()
    })
  })
})
