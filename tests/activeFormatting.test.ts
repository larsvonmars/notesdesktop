import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Active Formatting Detection', () => {
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

  /**
   * Helper function to simulate queryCommandState logic from RichTextEditor
   */
  const simulateQueryCommandState = (command: string): boolean => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return false
    
    const range = selection.getRangeAt(0)
    const node = range.commonAncestorContainer
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
    
    switch (command) {
      case 'bold':
        return !!element?.closest('strong, b')
      case 'italic':
        return !!element?.closest('em, i')
      case 'underline':
        return !!element?.closest('u')
      case 'strikeThrough':
        return !!element?.closest('s, strike')
      case 'code':
        return !!element?.closest('code')
      case 'insertUnorderedList':
        return !!element?.closest('ul')
      case 'insertOrderedList':
        return !!element?.closest('ol')
      case 'heading1':
        return !!element?.closest('h1')
      case 'heading2':
        return !!element?.closest('h2')
      case 'heading3':
        return !!element?.closest('h3')
      case 'blockquote':
        return !!element?.closest('blockquote')
      default:
        return false
    }
  }

  describe('Heading Detection', () => {
    it('should detect H1 heading', () => {
      const h1 = document.createElement('h1')
      h1.textContent = 'Test H1 Heading'
      editor.appendChild(h1)
      
      // Position cursor in h1
      const range = document.createRange()
      range.setStart(h1.firstChild!, 5)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      expect(simulateQueryCommandState('heading1')).toBe(true)
      expect(simulateQueryCommandState('heading2')).toBe(false)
      expect(simulateQueryCommandState('heading3')).toBe(false)
    })

    it('should detect H2 heading', () => {
      const h2 = document.createElement('h2')
      h2.textContent = 'Test H2 Heading'
      editor.appendChild(h2)
      
      const range = document.createRange()
      range.setStart(h2.firstChild!, 5)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      expect(simulateQueryCommandState('heading1')).toBe(false)
      expect(simulateQueryCommandState('heading2')).toBe(true)
      expect(simulateQueryCommandState('heading3')).toBe(false)
    })

    it('should detect H3 heading', () => {
      const h3 = document.createElement('h3')
      h3.textContent = 'Test H3 Heading'
      editor.appendChild(h3)
      
      const range = document.createRange()
      range.setStart(h3.firstChild!, 5)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      expect(simulateQueryCommandState('heading1')).toBe(false)
      expect(simulateQueryCommandState('heading2')).toBe(false)
      expect(simulateQueryCommandState('heading3')).toBe(true)
    })
  })

  describe('Blockquote Detection', () => {
    it('should detect blockquote', () => {
      const blockquote = document.createElement('blockquote')
      const p = document.createElement('p')
      p.textContent = 'This is a quote'
      blockquote.appendChild(p)
      editor.appendChild(blockquote)
      
      const range = document.createRange()
      range.setStart(p.firstChild!, 5)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      expect(simulateQueryCommandState('blockquote')).toBe(true)
    })

    it('should not detect blockquote in regular paragraph', () => {
      const p = document.createElement('p')
      p.textContent = 'Regular paragraph'
      editor.appendChild(p)
      
      const range = document.createRange()
      range.setStart(p.firstChild!, 5)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      expect(simulateQueryCommandState('blockquote')).toBe(false)
    })
  })

  describe('Inline Formatting Detection', () => {
    it('should detect bold within heading', () => {
      const h1 = document.createElement('h1')
      const strong = document.createElement('strong')
      strong.textContent = 'Bold heading'
      h1.appendChild(strong)
      editor.appendChild(h1)
      
      const range = document.createRange()
      range.setStart(strong.firstChild!, 5)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      expect(simulateQueryCommandState('heading1')).toBe(true)
      expect(simulateQueryCommandState('bold')).toBe(true)
    })

    it('should detect italic within blockquote', () => {
      const blockquote = document.createElement('blockquote')
      const p = document.createElement('p')
      const em = document.createElement('em')
      em.textContent = 'Italic quote'
      p.appendChild(em)
      blockquote.appendChild(p)
      editor.appendChild(blockquote)
      
      const range = document.createRange()
      range.setStart(em.firstChild!, 5)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      expect(simulateQueryCommandState('blockquote')).toBe(true)
      expect(simulateQueryCommandState('italic')).toBe(true)
    })
  })

  describe('List Detection', () => {
    it('should detect unordered list', () => {
      const ul = document.createElement('ul')
      const li = document.createElement('li')
      li.textContent = 'List item'
      ul.appendChild(li)
      editor.appendChild(ul)
      
      const range = document.createRange()
      range.setStart(li.firstChild!, 5)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      expect(simulateQueryCommandState('insertUnorderedList')).toBe(true)
      expect(simulateQueryCommandState('insertOrderedList')).toBe(false)
    })

    it('should detect ordered list', () => {
      const ol = document.createElement('ol')
      const li = document.createElement('li')
      li.textContent = 'Numbered item'
      ol.appendChild(li)
      editor.appendChild(ol)
      
      const range = document.createRange()
      range.setStart(li.firstChild!, 5)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      expect(simulateQueryCommandState('insertUnorderedList')).toBe(false)
      expect(simulateQueryCommandState('insertOrderedList')).toBe(true)
    })
  })
})
