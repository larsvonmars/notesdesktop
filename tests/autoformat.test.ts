import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { 
  applyAutoformat, 
  checkListPrefixPattern,
  AUTOFORMAT_PATTERNS,
  LIST_PREFIX_PATTERNS 
} from '@/lib/editor/autoformat'

describe('Autoformatting', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  describe('Inline autoformatting', () => {
    it('should convert **text** to bold', () => {
      const textNode = document.createTextNode('This is **bold**')
      container.appendChild(textNode)
      
      // Text node must be in the document and have proper parent context
      const result = applyAutoformat(textNode, textNode.textContent!.length)
      expect(result).toBe(true)
      
      const strong = container.querySelector('strong')
      expect(strong).toBeTruthy()
      expect(strong?.textContent).toBe('bold')
    })

    it('should convert *text* to italic', () => {
      const textNode = document.createTextNode('This is *italic*')
      container.appendChild(textNode)
      
      const result = applyAutoformat(textNode, textNode.textContent!.length)
      expect(result).toBe(true)
      
      const em = container.querySelector('em')
      expect(em).toBeTruthy()
      expect(em?.textContent).toBe('italic')
    })

    it('should convert ~~text~~ to strikethrough', () => {
      const textNode = document.createTextNode('This is ~~strike~~')
      container.appendChild(textNode)
      
      const result = applyAutoformat(textNode, textNode.textContent!.length)
      expect(result).toBe(true)
      
      const s = container.querySelector('s')
      expect(s).toBeTruthy()
      expect(s?.textContent).toBe('strike')
    })

    it('should convert `text` to code', () => {
      const textNode = document.createTextNode('This is `code`')
      container.appendChild(textNode)
      
      const result = applyAutoformat(textNode, textNode.textContent!.length)
      expect(result).toBe(true)
      
      const code = container.querySelector('code')
      expect(code).toBeTruthy()
      expect(code?.textContent).toBe('code')
    })

    it('should convert __text__ to underline', () => {
      const textNode = document.createTextNode('This is __underline__')
      container.appendChild(textNode)
      
      const result = applyAutoformat(textNode, textNode.textContent!.length)
      expect(result).toBe(true)
      
      const u = container.querySelector('u')
      expect(u).toBeTruthy()
      expect(u?.textContent).toBe('underline')
    })

    it('should not format incomplete patterns', () => {
      const textNode = document.createTextNode('This is **bold')
      container.appendChild(textNode)
      
      const result = applyAutoformat(textNode, textNode.textContent!.length)
      expect(result).toBe(false)
    })
  })

  describe('List prefix patterns', () => {
    it('should detect unordered list pattern with -', () => {
      const result = checkListPrefixPattern('- ')
      expect(result).toBe('unordered-list')
    })

    it('should detect unordered list pattern with *', () => {
      const result = checkListPrefixPattern('* ')
      expect(result).toBe('unordered-list')
    })

    it('should detect ordered list pattern', () => {
      const result = checkListPrefixPattern('1. ')
      expect(result).toBe('ordered-list')
    })

    it('should detect checklist pattern with [ ]', () => {
      const result = checkListPrefixPattern('[ ] ')
      expect(result).toBe('checklist')
    })

    it('should detect checklist pattern with [x]', () => {
      const result = checkListPrefixPattern('[x] ')
      expect(result).toBe('checklist')
    })

    it('should detect heading 1 pattern', () => {
      const result = checkListPrefixPattern('# ')
      expect(result).toBe('heading1')
    })

    it('should detect heading 2 pattern', () => {
      const result = checkListPrefixPattern('## ')
      expect(result).toBe('heading2')
    })

    it('should detect heading 3 pattern', () => {
      const result = checkListPrefixPattern('### ')
      expect(result).toBe('heading3')
    })

    it('should detect blockquote pattern', () => {
      const result = checkListPrefixPattern('> ')
      expect(result).toBe('blockquote')
    })

    it('should detect horizontal rule pattern', () => {
      const result = checkListPrefixPattern('---')
      expect(result).toBe('horizontal-rule')
    })

    it('should return null for non-matching patterns', () => {
      const result = checkListPrefixPattern('normal text')
      expect(result).toBe(null)
    })
  })

  describe('Pattern configuration', () => {
    it('should have all inline patterns defined', () => {
      expect(AUTOFORMAT_PATTERNS.length).toBeGreaterThan(0)
      AUTOFORMAT_PATTERNS.forEach(pattern => {
        expect(pattern.pattern).toBeInstanceOf(RegExp)
        expect(typeof pattern.replacement).toBe('function')
      })
    })

    it('should have all list prefix patterns defined', () => {
      expect(LIST_PREFIX_PATTERNS.length).toBeGreaterThan(0)
      LIST_PREFIX_PATTERNS.forEach(pattern => {
        expect(pattern.pattern).toBeInstanceOf(RegExp)
        expect(typeof pattern.action).toBe('string')
      })
    })
  })
})
