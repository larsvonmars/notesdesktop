import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  applyReplacementAtOffsets,
  collectLintUnits,
  collectUnitText,
  offsetForNodePosition,
  rangeForOffsets,
  resolveDirtyTarget,
} from '@/lib/editor/grammar/units'
import { clearGrammarHighlights, supportsGrammarHighlights } from '@/lib/editor/grammar/highlight'

/** Find the text node containing `needle`, plus the offset of `needle` in it. */
function findText(root: HTMLElement, needle: string): { node: Text; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const index = (node.textContent || '').indexOf(needle)
    if (index >= 0) return { node: node as Text, offset: index }
    node = walker.nextNode()
  }
  throw new Error(`text not found: ${needle}`)
}

describe('grammar lint units', () => {
  let editor: HTMLDivElement

  beforeEach(() => {
    editor = document.createElement('div')
    editor.contentEditable = 'true'
    document.body.appendChild(editor)
  })

  afterEach(() => {
    document.body.removeChild(editor)
  })

  describe('collectLintUnits', () => {
    it('treats every top-level block as a unit', () => {
      editor.innerHTML = '<h1>Title</h1><p>Body text</p><blockquote>Quote</blockquote>'

      const units = collectLintUnits(editor)

      expect(units.map((unit) => unit.tagName)).toEqual(['H1', 'P', 'BLOCKQUOTE'])
    })

    it('uses list items as units instead of the list', () => {
      editor.innerHTML = '<ul><li>Milk and honey</li><li>Bread</li></ul><p>After</p>'

      const units = collectLintUnits(editor)

      expect(units.map((unit) => unit.textContent)).toEqual(['Milk and honey', 'Bread', 'After'])
    })

    it('collects nested list items as their own units', () => {
      editor.innerHTML =
        '<ul><li>Shopping list here<ul><li>Nested item text</li></ul></li></ul>'

      const units = collectLintUnits(editor)

      expect(units).toHaveLength(2)
      expect(units[0].textContent).toContain('Shopping list here')
      expect(units[1].textContent).toBe('Nested item text')
    })

    it('skips code, tables, custom blocks and non-editable islands', () => {
      editor.innerHTML = [
        '<p>A normal paragraph</p>',
        '<pre><code>const answer = 42</code></pre>',
        '<table><tbody><tr><td>Cell text</td></tr></tbody></table>',
        '<p>Intro paragraph</p><div data-block="true" data-block-type="image">image</div>',
        '<p contenteditable="false">read only</p>',
      ].join('')

      const units = collectLintUnits(editor)

      expect(units.map((unit) => unit.textContent)).toEqual([
        'A normal paragraph',
        'Intro paragraph',
      ])
    })

    it('ignores blocks without real text', () => {
      editor.innerHTML = '<p><br></p><p>a</p><p>Real sentence</p>'

      const units = collectLintUnits(editor)

      expect(units.map((unit) => unit.textContent)).toEqual(['Real sentence'])
    })
  })

  describe('collectUnitText', () => {
    it('flattens inline formatting into one text with node offsets', () => {
      editor.innerHTML = '<p>hello <strong>world</strong></p>'
      const unit = editor.firstElementChild as HTMLElement

      const info = collectUnitText(unit)

      expect(info.text).toBe('hello world')
      expect(info.segments).toHaveLength(2)
      expect(info.segments[0]).toMatchObject({ start: 0, end: 6 })
      expect(info.segments[1]).toMatchObject({ start: 6, end: 11 })
    })

    it('leaves custom-block islands out of the text', () => {
      editor.innerHTML =
        '<p>Open <span data-block="true" data-block-type="note-link">📝 My note</span> today</p>'
      const unit = editor.firstElementChild as HTMLElement

      const info = collectUnitText(unit)

      expect(info.text).toBe('Open  today')
      expect(info.segments).toHaveLength(2)
      expect(info.segments[1]).toMatchObject({ start: 5, end: 11 })
    })

    it('separates nested blocks with a newline', () => {
      editor.innerHTML = '<blockquote><p>First line</p><p>Second line</p></blockquote>'
      const unit = editor.firstElementChild as HTMLElement

      const info = collectUnitText(unit)

      expect(info.text).toBe('First line\nSecond line')
      expect(info.segments).toHaveLength(2)
      expect(info.segments[1].start).toBe(11)
    })

    it('excludes text of nested lists from the parent item', () => {
      editor.innerHTML =
        '<ul><li>Shopping list here<ul><li>Nested item text</li></ul></li></ul>'
      const parentItem = editor.querySelector('li') as HTMLElement

      expect(collectUnitText(parentItem).text).toBe('Shopping list here')
    })
  })

  describe('resolveDirtyTarget', () => {
    it('maps a position inside a paragraph to that paragraph', () => {
      editor.innerHTML = '<p>Hello</p>'
      const { node } = findText(editor, 'Hello')

      expect(resolveDirtyTarget(editor, node)).toEqual({
        kind: 'unit',
        unit: editor.firstElementChild,
      })
    })

    it('maps a position inside a nested list item to the item', () => {
      editor.innerHTML = '<ul><li>Outer text<ul><li>Inner text</li></ul></li></ul>'
      const { node } = findText(editor, 'Inner')

      const target = resolveDirtyTarget(editor, node)
      expect(target.kind).toBe('unit')
      if (target.kind === 'unit') expect(target.unit.textContent).toBe('Inner text')
    })

    it('reports skipped areas', () => {
      editor.innerHTML = '<pre><code>const x = 1</code></pre>'
      const { node } = findText(editor, 'const')

      expect(resolveDirtyTarget(editor, node)).toEqual({ kind: 'skip' })
    })

    it('reports document-level changes for the editor root', () => {
      editor.innerHTML = '<p>Hello</p>'

      expect(resolveDirtyTarget(editor, editor)).toEqual({ kind: 'document' })
    })
  })

  describe('offset mapping', () => {
    it('maps a DOM position to a flat offset', () => {
      editor.innerHTML = '<p>hello <strong>world</strong></p>'
      const unit = editor.firstElementChild as HTMLElement
      const info = collectUnitText(unit)
      const { node, offset } = findText(unit, 'world')

      expect(offsetForNodePosition(info, node, offset + 2)).toBe(8)
    })

    it('maps an element position to the next text position', () => {
      editor.innerHTML = '<p>hello <strong>world</strong></p>'
      const unit = editor.firstElementChild as HTMLElement
      const info = collectUnitText(unit)

      // Caret reported on the paragraph itself, in front of the <strong>.
      expect(offsetForNodePosition(info, unit, 1)).toBe(6)
    })

    it('builds a range for a span inside one text node', () => {
      editor.innerHTML = '<p>hello <strong>world</strong></p>'
      const unit = editor.firstElementChild as HTMLElement
      const info = collectUnitText(unit)

      const range = rangeForOffsets(info, 6, 11)

      expect(range?.toString()).toBe('world')
    })

    it('builds a range spanning inline elements', () => {
      editor.innerHTML = '<p>hello <strong>world</strong></p>'
      const unit = editor.firstElementChild as HTMLElement
      const info = collectUnitText(unit)

      const range = rangeForOffsets(info, 4, 9)

      expect(range?.toString()).toBe('o wor')
    })
  })

  describe('applyReplacementAtOffsets', () => {
    it('replaces a word inside its inline formatting', () => {
      editor.innerHTML = '<p>hello <strong>world</strong></p>'
      const unit = editor.firstElementChild as HTMLElement
      const info = collectUnitText(unit)

      expect(applyReplacementAtOffsets(info, 6, 11, 'earth')).toBe(true)

      expect((unit as HTMLElement).innerHTML).toBe('hello <strong>earth</strong>')
    })

    it('splices spans that cross inline elements', () => {
      editor.innerHTML = '<p>hello <strong>world</strong></p>'
      const unit = editor.firstElementChild as HTMLElement
      const info = collectUnitText(unit)

      expect(applyReplacementAtOffsets(info, 4, 9, 'X')).toBe(true)

      expect(unit.textContent).toBe('hellXld')
    })

    it('inserts text at the end of a unit', () => {
      editor.innerHTML = '<p>hello world</p>'
      const unit = editor.firstElementChild as HTMLElement
      const info = collectUnitText(unit)

      expect(applyReplacementAtOffsets(info, 11, 11, '!')).toBe(true)

      expect(unit.textContent).toBe('hello world!')
    })

    it('inserts at a separator gap inside nested blocks', () => {
      editor.innerHTML = '<blockquote><p>One</p><p>Two</p></blockquote>'
      const unit = editor.firstElementChild as HTMLElement
      const info = collectUnitText(unit)
      expect(info.text).toBe('One\nTwo')

      expect(applyReplacementAtOffsets(info, 3, 3, '!')).toBe(true)

      expect(unit.textContent).toBe('One!Two')
    })

    it('removes a span', () => {
      editor.innerHTML = '<p>hello world</p>'
      const unit = editor.firstElementChild as HTMLElement
      const info = collectUnitText(unit)

      expect(applyReplacementAtOffsets(info, 5, 11, '')).toBe(true)

      expect(unit.textContent).toBe('hello')
    })
  })

  describe('highlight layer', () => {
    it('degrades to a no-op when the Highlight API is missing', () => {
      expect(supportsGrammarHighlights()).toBe(false)
      expect(() => clearGrammarHighlights()).not.toThrow()
    })
  })
})
