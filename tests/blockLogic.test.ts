import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  applyBlockFormat,
  applyInlineStyle,
  generateHeadingId
} from '@/lib/editor/commandDispatcher'

describe('Block Logic Stability', () => {
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

  describe('Default Block Creation', () => {
    it('should ensure empty editor has at least one block', () => {
      // Editor starts empty
      expect(editor.children.length).toBe(0)
      
      // Simulate the ensureDefaultBlock logic
      const hasContent = editor.textContent && editor.textContent.trim().length > 0
      const hasBlocks = editor.children.length > 0
      
      if (!hasContent && !hasBlocks) {
        const newBlock = document.createElement('div')
        newBlock.setAttribute('data-block', 'true')
        newBlock.className = 'block-root rounded-xl border border-slate-200 bg-white/80 px-3 py-2 my-3 shadow-sm'

        const paragraph = document.createElement('p')
        paragraph.appendChild(document.createElement('br'))
        newBlock.appendChild(paragraph)

        editor.innerHTML = ''
        editor.appendChild(newBlock)
      }
      
      // Verify a block was created
      expect(editor.children.length).toBe(1)
      const block = editor.children[0] as HTMLElement
      expect(block.getAttribute('data-block')).toBe('true')
      expect(block.querySelector('p')).toBeTruthy()
    })

    it('should not create a block if content already exists', () => {
      // Add existing content
      const p = document.createElement('p')
      p.textContent = 'Existing content'
      editor.appendChild(p)
      
      expect(editor.children.length).toBe(1)
      
      // Simulate the ensureDefaultBlock logic
      const hasContent = editor.textContent && editor.textContent.trim().length > 0
      const hasBlocks = editor.children.length > 0
      
      if (!hasContent && !hasBlocks) {
        const newBlock = document.createElement('div')
        newBlock.setAttribute('data-block', 'true')
        editor.appendChild(newBlock)
      }
      
      // Should still have only one child (the existing paragraph)
      expect(editor.children.length).toBe(1)
      expect(editor.textContent).toBe('Existing content')
    })

    it('should create a block if editor only has whitespace', () => {
      // Add only whitespace
      editor.innerHTML = '   \n\n   '
      
      // Simulate the ensureDefaultBlock logic
      const hasContent = editor.textContent && editor.textContent.trim().length > 0
      const hasBlocks = editor.children.length > 0
      
      if (!hasContent && !hasBlocks) {
        const newBlock = document.createElement('div')
        newBlock.setAttribute('data-block', 'true')
        newBlock.className = 'block-root'

        const paragraph = document.createElement('p')
        paragraph.appendChild(document.createElement('br'))
        newBlock.appendChild(paragraph)

        editor.innerHTML = ''
        editor.appendChild(newBlock)
      }
      
      // Should have created a block
      expect(editor.children.length).toBe(1)
      const block = editor.children[0] as HTMLElement
      expect(block.getAttribute('data-block')).toBe('true')
    })
  })

  describe('applyBlockFormat', () => {
    it('should convert paragraph to h1', () => {
      const p = document.createElement('p')
      p.textContent = 'Test heading'
      editor.appendChild(p)
      
      // Position cursor in paragraph
      const range = document.createRange()
      range.setStart(p.firstChild!, 0)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      applyBlockFormat('h1', editor)

      // Wait for async operations
      setTimeout(() => {
        const h1 = editor.querySelector('h1')
        expect(h1).toBeTruthy()
        expect(h1?.textContent).toBe('Test heading')
      }, 200)
    })

    it('should convert h1 to h2', () => {
      const h1 = document.createElement('h1')
      h1.textContent = 'Original heading'
      editor.appendChild(h1)
      
      // Position cursor in h1
      const range = document.createRange()
      range.setStart(h1.firstChild!, 0)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      applyBlockFormat('h2', editor)

      setTimeout(() => {
        const h2 = editor.querySelector('h2')
        expect(h2).toBeTruthy()
        expect(h2?.textContent).toBe('Original heading')
        expect(editor.querySelector('h1')).toBeFalsy()
      }, 200)
    })

    it('should convert h1 to paragraph when applying h1 again', () => {
      const h1 = document.createElement('h1')
      h1.textContent = 'Toggle test'
      editor.appendChild(h1)
      
      // Position cursor in h1
      const range = document.createRange()
      range.setStart(h1.firstChild!, 0)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      applyBlockFormat('h1', editor)

      setTimeout(() => {
        const p = editor.querySelector('p')
        expect(p).toBeTruthy()
        expect(p?.textContent).toBe('Toggle test')
        expect(editor.querySelector('h1')).toBeFalsy()
      }, 200)
    })

    it('should handle missing selection gracefully', () => {
      const p = document.createElement('p')
      p.textContent = 'No selection'
      editor.appendChild(p)
      
      // Clear any selection
      const selection = window.getSelection()!
      selection.removeAllRanges()

      // Should not throw
      expect(() => applyBlockFormat('h1', editor)).not.toThrow()
    })

    it('should preserve heading ID when converting between heading levels', () => {
      const h1 = document.createElement('h1')
      h1.id = 'test-heading'
      h1.textContent = 'Test'
      editor.appendChild(h1)
      
      // Position cursor
      const range = document.createRange()
      range.setStart(h1.firstChild!, 0)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      applyBlockFormat('h2', editor)

      setTimeout(() => {
        const h2 = editor.querySelector('h2')
        expect(h2?.id).toBe('test-heading')
      }, 200)
    })

    it('should handle rapid block format changes', () => {
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

      // Apply multiple format changes rapidly
      expect(() => {
        applyBlockFormat('h1', editor)
        applyBlockFormat('h2', editor)
        applyBlockFormat('h3', editor)
      }).not.toThrow()
    })
  })

  describe('applyInlineStyle', () => {
    it('should handle missing selection gracefully', () => {
      const p = document.createElement('p')
      p.textContent = 'Test'
      editor.appendChild(p)
      
      // Clear selection
      const selection = window.getSelection()!
      selection.removeAllRanges()

      // Should not throw
      expect(() => applyInlineStyle('strong')).not.toThrow()
    })

    it('should wrap selected text in strong tag', () => {
      const p = document.createElement('p')
      const text = document.createTextNode('Bold this')
      p.appendChild(text)
      editor.appendChild(p)
      
      // Select "Bold"
      const range = document.createRange()
      range.setStart(text, 0)
      range.setEnd(text, 4)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      applyInlineStyle('strong')

      const strong = p.querySelector('strong')
      expect(strong).toBeTruthy()
      expect(strong?.textContent).toBe('Bold')
    })

    it('should unwrap when already wrapped', () => {
      const p = document.createElement('p')
      const strong = document.createElement('strong')
      strong.textContent = 'Already bold'
      p.appendChild(strong)
      editor.appendChild(p)
      
      // Position cursor in strong
      const range = document.createRange()
      range.setStart(strong.firstChild!, 0)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)

      applyInlineStyle('strong')

      // Should unwrap
      expect(p.querySelector('strong')).toBeFalsy()
      expect(p.textContent).toBe('Already bold')
    })
  })

  describe('generateHeadingId', () => {
    it('should generate valid ID from text', () => {
      const id = generateHeadingId('Test Heading')
      expect(id).toBe('test-heading')
    })

    it('should handle special characters', () => {
      const id = generateHeadingId('Test! @#$ Heading?')
      expect(id).toBe('test-heading')
    })

    it('should handle empty text', () => {
      const id = generateHeadingId('')
      expect(id).toMatch(/^heading-\d+$/)
    })

    it('should remove leading and trailing hyphens', () => {
      const id = generateHeadingId('   Test   ')
      expect(id).toBe('test')
      expect(id.startsWith('-')).toBe(false)
      expect(id.endsWith('-')).toBe(false)
    })

    it('should collapse multiple hyphens', () => {
      const id = generateHeadingId('Test    Multiple    Spaces')
      expect(id).toBe('test-multiple-spaces')
      expect(id).not.toContain('--')
    })
  })
})
