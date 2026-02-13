import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  applyBlockFormat,
  generateHeadingId
} from '@/lib/editor/commandDispatcher'

describe('Paragraph to Header 1 Conversion', () => {
  let container: HTMLDivElement
  let editor: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    editor = document.createElement('div')
    editor.contentEditable = 'true'
    container.appendChild(editor)
    document.body.appendChild(container)
    
    // Mock console methods to suppress expected warnings in tests
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    document.body.removeChild(container)
    vi.restoreAllMocks()
  })

  describe('Basic paragraph to H1 conversion', () => {
    it('should convert a simple paragraph to H1', async () => {
      const p = document.createElement('p')
      p.textContent = 'Convert me to heading'
      editor.appendChild(p)
      
      // Position cursor in paragraph
      const range = document.createRange()
      range.setStart(p.firstChild!, 0)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      applyBlockFormat('h1', editor)

      // Wait for async operations to complete (LONG timing = 80ms)
      await new Promise(resolve => setTimeout(resolve, 150))
      const h1 = editor.querySelector('h1')
      expect(h1, 'H1 element should exist').toBeTruthy()
      expect(h1?.textContent, 'Text content should be preserved').toBe('Convert me to heading')
      expect(editor.querySelector('p'), 'Original paragraph should be removed').toBeFalsy()
    })

    it('should preserve inline formatting when converting to H1', async () => {
      const p = document.createElement('p')
      const strong = document.createElement('strong')
      strong.textContent = 'Bold'
      const text = document.createTextNode(' text')
      p.appendChild(strong)
      p.appendChild(text)
      editor.appendChild(p)
      
      // Position cursor
      const range = document.createRange()
      range.setStart(text, 0)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      applyBlockFormat('h1', editor)

      await new Promise(resolve => setTimeout(resolve, 150))
      const h1 = editor.querySelector('h1')
      expect(h1).toBeTruthy()
      expect(h1?.textContent).toBe('Bold text')
      expect(h1?.querySelector('strong')).toBeTruthy()
      expect(h1?.querySelector('strong')?.textContent).toBe('Bold')
    })

    it('should handle empty paragraph conversion', async () => {
      const p = document.createElement('p')
      p.appendChild(document.createElement('br'))
      editor.appendChild(p)
      
      // Position cursor
      const range = document.createRange()
      range.setStart(p, 0)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      applyBlockFormat('h1', editor)

      await new Promise(resolve => setTimeout(resolve, 150))
      const h1 = editor.querySelector('h1')
      expect(h1).toBeTruthy()
      expect(h1?.textContent).toBe('')
    })
  })

  describe('Toggle behavior', () => {
    it('should convert H1 back to paragraph when applying H1 to H1', async () => {
      const h1 = document.createElement('h1')
      h1.textContent = 'Already a heading'
      editor.appendChild(h1)
      
      // Position cursor
      const range = document.createRange()
      range.setStart(h1.firstChild!, 0)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      applyBlockFormat('h1', editor)

      await new Promise(resolve => setTimeout(resolve, 150))
      const p = editor.querySelector('p')
      expect(p, 'Should convert to paragraph').toBeTruthy()
      expect(p?.textContent).toBe('Already a heading')
      expect(editor.querySelector('h1'), 'H1 should be removed').toBeFalsy()
    })

    it('should not toggle when explicitly converting to paragraph', async () => {
      const p = document.createElement('p')
      p.textContent = 'Stay as paragraph'
      editor.appendChild(p)
      
      // Position cursor
      const range = document.createRange()
      range.setStart(p.firstChild!, 0)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      applyBlockFormat('p', editor)

      await new Promise(resolve => setTimeout(resolve, 150))
      const pElement = editor.querySelector('p')
      expect(pElement).toBeTruthy()
      expect(pElement?.textContent).toBe('Stay as paragraph')
      // Should early return without changes since already a paragraph
    })
  })

  describe('Edge cases', () => {
    it('should handle missing selection gracefully', () => {
      const p = document.createElement('p')
      p.textContent = 'No selection'
      editor.appendChild(p)
      
      // Clear selection
      const selection = window.getSelection()!
      selection.removeAllRanges()

      // Should not throw
      expect(() => applyBlockFormat('h1', editor)).not.toThrow()
      
      // Paragraph should remain unchanged
      expect(editor.querySelector('p')).toBeTruthy()
      expect(editor.querySelector('h1')).toBeFalsy()
    })

    it('should not convert list items to headings', async () => {
      const ul = document.createElement('ul')
      const li = document.createElement('li')
      li.textContent = 'List item'
      ul.appendChild(li)
      editor.appendChild(ul)
      
      // Position cursor in list item
      const range = document.createRange()
      range.setStart(li.firstChild!, 0)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      applyBlockFormat('h1', editor)

      await new Promise(resolve => setTimeout(resolve, 150))
      // List structure should remain intact
      expect(editor.querySelector('ul')).toBeTruthy()
      expect(editor.querySelector('li')).toBeTruthy()
      expect(editor.querySelector('h1')).toBeFalsy()
      expect(console.warn).toHaveBeenCalledWith(
        'Cannot convert list items to headings directly. Exit the list first.'
      )
    })

    it('should handle rapid consecutive conversions', () => {
      const p = document.createElement('p')
      p.textContent = 'Rapid changes'
      editor.appendChild(p)
      
      // Position cursor
      const range = document.createRange()
      range.setStart(p.firstChild!, 0)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      // Apply multiple format changes rapidly - should not throw
      expect(() => {
        applyBlockFormat('h1', editor)
        applyBlockFormat('h2', editor)
        applyBlockFormat('h3', editor)
      }).not.toThrow()
    })
  })

  describe('Heading ID generation', () => {
    it('should generate consistent IDs', () => {
      const id1 = generateHeadingId('Test Heading')
      const id2 = generateHeadingId('Test Heading')
      expect(id1).toBe('test-heading')
      expect(id2).toBe('test-heading')
    })

    it('should handle special characters', () => {
      expect(generateHeadingId('Hello! World?')).toBe('hello-world')
      expect(generateHeadingId('Test@#$%')).toBe('test')
      expect(generateHeadingId('  Spaces  ')).toBe('spaces')
    })

    it('should handle empty strings', () => {
      const id = generateHeadingId('')
      expect(id).toMatch(/^heading-\d+$/)
    })

    it('should handle unicode characters', () => {
      const id = generateHeadingId('Café ☕')
      expect(id).toMatch(/^caf/)
    })
  })
})
