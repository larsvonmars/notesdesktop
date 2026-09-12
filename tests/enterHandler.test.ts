import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { handleParagraphEnter, getClosestBlock } from '@/lib/editor/enterHandler'

function selectIn(node: Node, offset: number) {
  const selection = window.getSelection()
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function firstTextNode(el: Node): Text {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  return walker.nextNode() as Text
}

describe('paragraph Enter handling', () => {
  let editor: HTMLDivElement

  beforeEach(() => {
    editor = document.createElement('div')
    editor.contentEditable = 'true'
    document.body.appendChild(editor)
  })

  afterEach(async () => {
    // Let queued cursor-positioning frames run before the editor disappears
    await new Promise((resolve) => requestAnimationFrame(resolve))
    document.body.removeChild(editor)
  })

  it('creates a new empty paragraph when Enter is pressed at the end of a paragraph', () => {
    editor.innerHTML = '<p>Hello</p>'
    selectIn(firstTextNode(editor), 5)

    expect(handleParagraphEnter(editor)).toBe(true)

    const ps = editor.querySelectorAll(':scope > p')
    expect(ps).toHaveLength(2)
    expect(ps[0].textContent).toBe('Hello')
    expect(ps[1].textContent).toBe('')
    expect(ps[1].querySelector('br')).toBeTruthy()
  })

  it('keeps an empty paragraph line when Enter is pressed in an empty paragraph', () => {
    editor.innerHTML = '<p><br></p>'
    selectIn(editor.children[0], 0)

    expect(handleParagraphEnter(editor)).toBe(true)

    const ps = editor.querySelectorAll(':scope > p')
    expect(ps).toHaveLength(2)
    expect(ps[0].querySelector('br')).toBeTruthy()
    expect(ps[1].querySelector('br')).toBeTruthy()
  })

  it('splits a paragraph at the caret', () => {
    editor.innerHTML = '<p>Hello world</p>'
    selectIn(firstTextNode(editor), 6)

    expect(handleParagraphEnter(editor)).toBe(true)

    const ps = editor.querySelectorAll(':scope > p')
    expect(ps).toHaveLength(2)
    expect(ps[0].textContent).toBe('Hello ')
    expect(ps[1].textContent).toBe('world')
  })

  it('starts a paragraph after a heading instead of cloning the heading', () => {
    editor.innerHTML = '<h2>Title</h2>'
    selectIn(firstTextNode(editor), 5)

    expect(handleParagraphEnter(editor)).toBe(true)

    expect(editor.children).toHaveLength(2)
    const heading = editor.children[0] as HTMLElement
    const paragraph = editor.children[1] as HTMLElement
    expect(heading.tagName).toBe('H2')
    expect(heading.textContent).toBe('Title')
    expect(paragraph.tagName).toBe('P')
    expect(paragraph.querySelector('br')).toBeTruthy()
  })

  it('splits a heading and moves the remainder into a paragraph', () => {
    editor.innerHTML = '<h1>Alpha Beta</h1>'
    selectIn(firstTextNode(editor), 5)

    expect(handleParagraphEnter(editor)).toBe(true)

    expect(editor.children).toHaveLength(2)
    expect(editor.children[0].tagName).toBe('H1')
    expect(editor.children[0].textContent).toBe('Alpha')
    expect(editor.children[1].tagName).toBe('P')
    expect(editor.children[1].textContent).toBe(' Beta')
  })

  it('inserts an empty paragraph above when Enter is pressed at the start of a heading', () => {
    editor.innerHTML = '<h2>Title</h2>'
    selectIn(firstTextNode(editor), 0)

    expect(handleParagraphEnter(editor)).toBe(true)

    expect(editor.children).toHaveLength(2)
    expect(editor.children[0].tagName).toBe('P')
    expect(editor.children[0].querySelector('br')).toBeTruthy()
    expect(editor.children[1].tagName).toBe('H2')
    expect(editor.children[1].textContent).toBe('Title')
  })

  it('converts an empty heading into a paragraph', () => {
    editor.innerHTML = '<h2><br></h2>'
    selectIn(editor.children[0], 0)

    expect(handleParagraphEnter(editor)).toBe(true)

    expect(editor.children).toHaveLength(1)
    expect(editor.children[0].tagName).toBe('P')
    expect(editor.querySelector('h2')).toBeNull()
  })

  it('exits a blockquote into a new paragraph', () => {
    editor.innerHTML = '<blockquote>Quote</blockquote>'
    selectIn(firstTextNode(editor), 5)

    expect(handleParagraphEnter(editor)).toBe(true)

    expect(editor.children).toHaveLength(2)
    expect(editor.children[0].tagName).toBe('BLOCKQUOTE')
    expect(editor.children[0].textContent).toBe('Quote')
    expect(editor.children[1].tagName).toBe('P')
  })

  it('splits a blockquote mid-text and leaves the remainder as a paragraph', () => {
    editor.innerHTML = '<blockquote>Alpha Beta</blockquote>'
    selectIn(firstTextNode(editor), 5)

    expect(handleParagraphEnter(editor)).toBe(true)

    expect(editor.children).toHaveLength(2)
    expect(editor.children[0].tagName).toBe('BLOCKQUOTE')
    expect(editor.children[0].textContent).toBe('Alpha')
    expect(editor.children[1].tagName).toBe('P')
    expect(editor.children[1].textContent).toBe(' Beta')
  })

  it('creates a paragraph from bare text at the editor root', () => {
    editor.innerHTML = 'Hello world'
    selectIn(firstTextNode(editor), 5)

    expect(handleParagraphEnter(editor)).toBe(true)

    const p = editor.querySelector('p')
    expect(p).toBeTruthy()
    expect(p?.textContent).toBe(' world')
  })

  it('lets the list handler own Enter inside a list item', () => {
    editor.innerHTML = '<ul><li>Item</li></ul>'
    selectIn(firstTextNode(editor), 4)

    expect(handleParagraphEnter(editor)).toBe(false)
    expect(editor.querySelectorAll('li')).toHaveLength(1)
  })

  it('leaves Enter inside code blocks (pre) untouched', () => {
    editor.innerHTML = '<pre>const a = 1</pre>'
    selectIn(firstTextNode(editor), 5)

    expect(handleParagraphEnter(editor)).toBe(false)
    expect(editor.children[0].tagName).toBe('PRE')
  })

  it('leaves Enter inside table cells untouched', () => {
    editor.innerHTML = '<table><tbody><tr><td>Cell</td></tr></tbody></table>'
    selectIn(firstTextNode(editor), 2)

    expect(handleParagraphEnter(editor)).toBe(false)
  })

  it('leaves Enter inside custom blocks untouched', () => {
    editor.innerHTML = '<div data-block="true" data-block-type="image">caption</div>'
    selectIn(firstTextNode(editor), 2)

    expect(handleParagraphEnter(editor)).toBe(false)
  })

  it('still splits a paragraph containing an inline note-link span', () => {
    editor.innerHTML = '<p>see <span data-block="true" data-block-type="note-link">Note</span></p>'
    selectIn(firstTextNode(editor), 4)

    expect(handleParagraphEnter(editor)).toBe(true)

    const ps = editor.querySelectorAll(':scope > p')
    expect(ps).toHaveLength(2)
    expect(ps[1].querySelector('[data-block-type="note-link"]')).toBeTruthy()
  })

  it('removes a non-collapsed selection before splitting', () => {
    editor.innerHTML = '<p>Hello world</p>'
    const text = firstTextNode(editor)
    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 6)
    selection?.removeAllRanges()
    selection?.addRange(range)

    expect(handleParagraphEnter(editor)).toBe(true)

    expect(editor.textContent).toBe('world')
  })

  it('finds the closest block ancestor and ignores the editor root', () => {
    editor.innerHTML = '<p><strong>Hi</strong></p>'
    const text = firstTextNode(editor)
    expect(getClosestBlock(text, editor)?.tagName).toBe('P')
    expect(getClosestBlock(editor, editor)).toBeNull()
  })
})
