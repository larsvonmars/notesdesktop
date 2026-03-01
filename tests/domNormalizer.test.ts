import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  normalizeEditorContent,
  normalizeInlineNodes,
  sanitizeInlineNodes,
} from '@/lib/editor/domNormalizer'

describe('DOM Normalizer', () => {
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

  // ---------- Tag Equivalences ----------
  describe('Tag equivalences', () => {
    it('should merge adjacent <b> and <strong> elements', () => {
      editor.innerHTML = '<p><b>Hello </b><strong>World</strong></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      const p = editor.querySelector('p')!
      // Should be merged into a single inline element
      const inlines = p.querySelectorAll('b, strong')
      expect(inlines.length).toBeLessThanOrEqual(1)
      expect(p.textContent).toBe('Hello World')
    })

    it('should merge adjacent <i> and <em> elements', () => {
      editor.innerHTML = '<p><i>foo </i><em>bar</em></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      const p = editor.querySelector('p')!
      const inlines = p.querySelectorAll('i, em')
      expect(inlines.length).toBeLessThanOrEqual(1)
      expect(p.textContent).toBe('foo bar')
    })

    it('should unwrap redundant <b> inside <strong>', () => {
      editor.innerHTML = '<p><strong><b>nested</b></strong></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      const p = editor.querySelector('p')!
      expect(p.textContent).toBe('nested')
      // No double-nesting
      expect(p.querySelectorAll('b').length + p.querySelectorAll('strong').length).toBeLessThanOrEqual(1)
    })

    it('should unwrap redundant <i> inside <em>', () => {
      editor.innerHTML = '<p><em><i>nested</i></em></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      const p = editor.querySelector('p')!
      expect(p.textContent).toBe('nested')
      expect(p.querySelectorAll('i').length + p.querySelectorAll('em').length).toBeLessThanOrEqual(1)
    })
  })

  // ---------- BR Preservation ----------
  describe('BR preservation', () => {
    it('should NOT remove an empty <strong> that contains a <br>', () => {
      editor.innerHTML = '<p><strong><br></strong></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      const br = editor.querySelector('br')
      expect(br).toBeTruthy()
      // The br's parent should still be the strong (not removed)
      expect(br!.parentElement!.tagName).toBe('STRONG')
    })

    it('should remove a truly empty <strong> with no content', () => {
      editor.innerHTML = '<p><strong></strong></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      expect(editor.querySelector('strong')).toBeNull()
    })

    it('should NOT remove an empty <em> containing a <br>', () => {
      editor.innerHTML = '<p><em><br></em></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      expect(editor.querySelector('em')).toBeTruthy()
    })
  })

  // ---------- Merge MARK & SPAN ----------
  describe('MARK and SPAN merging', () => {
    it('should merge adjacent <mark> elements with same class and style', () => {
      editor.innerHTML = '<p><mark class="hl" style="background:yellow">a</mark><mark class="hl" style="background:yellow">b</mark></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      expect(editor.querySelectorAll('mark').length).toBe(1)
      expect(editor.querySelector('mark')!.textContent).toBe('ab')
    })

    it('should NOT merge <mark> elements with different classes', () => {
      editor.innerHTML = '<p><mark class="hl">a</mark><mark class="other">b</mark></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      expect(editor.querySelectorAll('mark').length).toBe(2)
    })

    it('should merge adjacent identical <span> elements', () => {
      editor.innerHTML = '<p><span class="x">a</span><span class="x">b</span></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      expect(editor.querySelectorAll('span').length).toBe(1)
      expect(editor.querySelector('span')!.textContent).toBe('ab')
    })

    it('should NOT merge <span> elements with different styles', () => {
      editor.innerHTML = '<p><span style="color:red">a</span><span style="color:blue">b</span></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      expect(editor.querySelectorAll('span').length).toBe(2)
    })
  })

  // ---------- Adjacent text node merging ----------
  describe('Text node merging', () => {
    it('should merge adjacent text nodes', () => {
      const p = document.createElement('p')
      p.appendChild(document.createTextNode('hello '))
      p.appendChild(document.createTextNode('world'))
      editor.appendChild(p)
      normalizeInlineNodes(p)
      expect(p.childNodes.length).toBe(1)
      expect(p.textContent).toBe('hello world')
    })
  })

  // ---------- Empty inline removal ----------
  describe('Empty inline removal', () => {
    it('should remove empty <code> element', () => {
      editor.innerHTML = '<p><code></code>text</p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      expect(editor.querySelector('code')).toBeNull()
      expect(editor.querySelector('p')!.textContent).toBe('text')
    })

    it('should remove empty <u> element', () => {
      editor.innerHTML = '<p><u></u>text</p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      expect(editor.querySelector('u')).toBeNull()
    })

    it('should remove empty <s> element', () => {
      editor.innerHTML = '<p><s></s></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      expect(editor.querySelector('s')).toBeNull()
    })
  })

  // ---------- Bottom-up processing ----------
  describe('Bottom-up normalization', () => {
    it('should normalize deeply nested structures correctly', () => {
      editor.innerHTML = '<p><strong><strong><b>deep</b></strong></strong></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      const p = editor.querySelector('p')!
      expect(p.textContent).toBe('deep')
      // Redundant inner tags are unwrapped; at most 2 remain after single pass
      const inlines = p.querySelectorAll('strong, b')
      expect(inlines.length).toBeLessThanOrEqual(2)
    })

    it('should fully unwrap simple double-nested same-tag', () => {
      editor.innerHTML = '<p><strong><strong>text</strong></strong></p>'
      normalizeInlineNodes(editor.querySelector('p')!)
      const p = editor.querySelector('p')!
      expect(p.textContent).toBe('text')
      expect(p.querySelectorAll('strong').length).toBeLessThanOrEqual(1)
    })
  })

  // ---------- normalizeEditorContent ----------
  describe('normalizeEditorContent', () => {
    it('should add a <p><br> block to an empty editor', () => {
      editor.innerHTML = ''
      normalizeEditorContent(editor)
      expect(editor.querySelector('p')).toBeTruthy()
      expect(editor.querySelector('p br')).toBeTruthy()
    })

    it('should preserve existing content', () => {
      editor.innerHTML = '<p>Keep me</p>'
      normalizeEditorContent(editor)
      expect(editor.querySelector('p')!.textContent).toBe('Keep me')
    })

    it('should merge adjacent identical elements during full normalize', () => {
      editor.innerHTML = '<p><strong>a</strong><strong>b</strong></p>'
      normalizeEditorContent(editor)
      expect(editor.querySelectorAll('strong').length).toBe(1)
      expect(editor.querySelector('strong')!.textContent).toBe('ab')
    })
  })

  // ---------- sanitizeInlineNodes ----------
  describe('sanitizeInlineNodes', () => {
    it('should normalize within a given range', () => {
      editor.innerHTML = '<p><b>A</b><b>B</b></p>'
      const p = editor.querySelector('p')!
      const range = document.createRange()
      range.selectNodeContents(p)
      sanitizeInlineNodes(range)
      // After sanitization b elements should be merged
      expect(p.querySelectorAll('b, strong').length).toBeLessThanOrEqual(1)
      expect(p.textContent).toBe('AB')
    })
  })
})
