import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  blockKind,
  blockLabel,
  canMoveBlockBefore,
  convertBlockToCode,
  duplicateBlock,
  findDropReference,
  getElementChildren,
  getTopLevelBlock,
  isStructuralBlock,
  moveBlock,
  moveBlockBefore,
  removeBlock,
} from '../lib/editor/blockTools'

describe('blockTools', () => {
  let editor: HTMLDivElement

  beforeEach(() => {
    editor = document.createElement('div')
    editor.contentEditable = 'true'
    document.body.appendChild(editor)
  })

  afterEach(() => {
    editor.remove()
  })

  /** Give an element a fake box so layout-dependent helpers can be tested. */
  const withRect = (element: HTMLElement, top: number, height: number) => {
    element.getBoundingClientRect = () =>
      ({
        top,
        bottom: top + height,
        left: 0,
        right: 100,
        width: 100,
        height,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect
    return element
  }

  describe('getTopLevelBlock', () => {
    it('resolves nested inline content to its top-level block', () => {
      editor.innerHTML = '<p>a <strong><em>b</em></strong></p><h2>c</h2>'
      const emText = editor.querySelector('em')!.firstChild!

      expect(getTopLevelBlock(emText, editor)?.tagName).toBe('P')
      expect(getTopLevelBlock(editor.querySelector('h2')!.firstChild, editor)?.tagName).toBe('H2')
    })

    it('returns null for the editor itself and for detached nodes', () => {
      editor.innerHTML = '<p>text</p>'
      expect(getTopLevelBlock(editor, editor)).toBeNull()

      const orphan = document.createTextNode('x')
      expect(getTopLevelBlock(orphan, editor)).toBeNull()
    })
  })

  describe('blockKind / blockLabel', () => {
    it('classifies the standard block types', () => {
      editor.innerHTML =
        '<p>p</p><h1>h1</h1><h6>h6</h6><blockquote>q</blockquote><pre><code>c</code></pre>' +
        '<ul><li>a</li></ul><ol><li>b</li></ol><hr>' +
        '<ul data-checklist="true"><li>x</li></ul>' +
        '<div data-block="true"></div>'

      const kinds = getElementChildren(editor).map((block) => blockKind(block))
      expect(kinds).toEqual([
        'paragraph',
        'h1',
        'h6',
        'quote',
        'code',
        'ul',
        'ol',
        'divider',
        'checklist',
        'block',
      ])
    })

    it('labels blocks for the hover handle', () => {
      expect(blockLabel('paragraph')).toBe('P')
      expect(blockLabel('h2')).toBe('H2')
      expect(blockLabel('checklist')).toBe('\u2611')
      expect(blockLabel('other')).toBe('\u00B6')
    })

    it('knows which blocks cannot be re-typed', () => {
      expect(isStructuralBlock('block')).toBe(true)
      expect(isStructuralBlock('divider')).toBe(true)
      expect(isStructuralBlock('table')).toBe(true)
      expect(isStructuralBlock('paragraph')).toBe(false)
    })
  })

  describe('moveBlock', () => {
    it('swaps with siblings in both directions', () => {
      editor.innerHTML = '<p>one</p><p>two</p><p>three</p>'
      const [first, second, third] = getElementChildren(editor)

      expect(moveBlock(editor, second, 'up')).toBe(true)
      expect(getElementChildren(editor).map((el) => el.textContent)).toEqual(['two', 'one', 'three'])

      expect(moveBlock(editor, second, 'down')).toBe(true)
      expect(getElementChildren(editor).map((el) => el.textContent)).toEqual(['one', 'two', 'three'])

      expect(moveBlock(editor, first, 'up')).toBe(false)
      expect(moveBlock(editor, third, 'down')).toBe(false)
    })
  })

  describe('moveBlockBefore / canMoveBlockBefore', () => {
    it('moves a block in front of a reference block', () => {
      editor.innerHTML = '<p>one</p><p>two</p><p>three</p>'
      const [first, , third] = getElementChildren(editor)

      expect(canMoveBlockBefore(editor, third, first)).toBe(true)
      expect(moveBlockBefore(editor, third, first)).toBe(true)
      expect(getElementChildren(editor).map((el) => el.textContent)).toEqual(['three', 'one', 'two'])
    })

    it('appends when the reference is null, but ignores no-ops', () => {
      editor.innerHTML = '<p>one</p><p>two</p>'
      const [first, second] = getElementChildren(editor)

      expect(moveBlockBefore(editor, first, null)).toBe(true)
      expect(getElementChildren(editor).map((el) => el.textContent)).toEqual(['two', 'one'])

      // Already last — nothing to do.
      expect(canMoveBlockBefore(editor, first, null)).toBe(false)
      expect(moveBlockBefore(editor, first, null)).toBe(false)

      // Already directly above the reference.
      expect(canMoveBlockBefore(editor, second, first)).toBe(false)
    })
  })

  describe('findDropReference / drop math', () => {
    it('returns the block whose midpoint is below the drop position', () => {
      editor.innerHTML = '<p>one</p><p>two</p><p>three</p>'
      const [first, second, third] = getElementChildren(editor)
      withRect(first, 0, 40) // mid 20
      withRect(second, 40, 40) // mid 60
      withRect(third, 80, 40) // mid 100

      expect(findDropReference(editor, 10, null)).toBe(first)
      expect(findDropReference(editor, 30, null)).toBe(second)
      expect(findDropReference(editor, 70, null)).toBe(third)
      expect(findDropReference(editor, 300, null)).toBeNull()

      // The dragged block is ignored so the calculation stays stable.
      expect(findDropReference(editor, 30, first)).toBe(second)
    })
  })

  describe('duplicateBlock', () => {
    it('inserts a deep copy right below the original', () => {
      editor.innerHTML = '<p>hello <strong>world</strong></p>'
      const block = getElementChildren(editor)[0]

      const clone = duplicateBlock(editor, block)

      expect(clone).not.toBeNull()
      expect(getElementChildren(editor)).toHaveLength(2)
      expect(clone!.innerHTML).toBe('hello <strong>world</strong>')
      expect(clone).not.toBe(block)
    })

    it('regenerates heading ids and drops other ids', () => {
      editor.innerHTML = '<h2 id="intro">Intro</h2><div id="widget"><span id="inner">x</span></div>'
      const [heading, widget] = getElementChildren(editor)

      const headingClone = duplicateBlock(editor, heading)!
      expect(headingClone.id).toBe('intro-2')
      expect(editor.querySelectorAll('#intro')).toHaveLength(1)

      const widgetClone = duplicateBlock(editor, widget)!
      expect(widgetClone.hasAttribute('id')).toBe(false)
      expect(widgetClone.querySelector('[id]')).toBeNull()
    })
  })

  describe('removeBlock', () => {
    it('removes a block and keeps the caret usable', () => {
      editor.innerHTML = '<p>one</p><p>two</p>'
      const [first, second] = getElementChildren(editor)

      expect(removeBlock(editor, first)).toBe(true)
      expect(getElementChildren(editor)).toEqual([second])
    })

    it('replaces the last remaining block with an empty paragraph', () => {
      editor.innerHTML = '<p>only</p>'
      const block = getElementChildren(editor)[0]

      expect(removeBlock(editor, block)).toBe(true)

      const remaining = getElementChildren(editor)
      expect(remaining).toHaveLength(1)
      expect(remaining[0].tagName).toBe('P')
      expect(remaining[0].textContent).toBe('')
    })
  })

  describe('convertBlockToCode', () => {
    it('turns a paragraph into a code block, keeping its content', () => {
      editor.innerHTML = '<p>const x = 1</p>'
      const block = getElementChildren(editor)[0]

      const pre = convertBlockToCode(editor, block)

      expect(pre?.tagName).toBe('PRE')
      expect(pre?.querySelector('code')?.textContent).toBe('const x = 1')
      expect(getElementChildren(editor)[0].tagName).toBe('PRE')
    })

    it('refuses lists and structural blocks', () => {
      editor.innerHTML = '<ul><li>a</li></ul><hr><p id="x">t</p>'
      const [list, divider, paragraph] = getElementChildren(editor)

      expect(convertBlockToCode(editor, list)).toBeNull()
      expect(convertBlockToCode(editor, divider)).toBeNull()
      expect(convertBlockToCode(editor, paragraph)).not.toBeNull()
    })
  })
})
