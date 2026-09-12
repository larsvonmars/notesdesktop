import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { clearInlineFormatting } from '../lib/editor/commandDispatcher'

function selectContents(node: Node): Range {
  const range = document.createRange()
  range.selectNodeContents(node)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}

function selectText(node: Text, start: number, end: number): Range {
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}

describe('clearInlineFormatting', () => {
  let editor: HTMLDivElement

  beforeEach(() => {
    editor = document.createElement('div')
    editor.contentEditable = 'true'
    document.body.appendChild(editor)
  })

  afterEach(() => {
    editor.remove()
    window.getSelection()?.removeAllRanges()
  })

  it('removes bold from a fully selected word', () => {
    editor.innerHTML = '<p>a <strong>bold</strong> c</p>'
    selectContents(editor.querySelector('strong')!)

    expect(clearInlineFormatting(editor)).toBe(true)
    expect(editor.textContent).toBe('a bold c')
    expect(editor.querySelector('strong')).toBeNull()
  })

  it('splits a partially selected wrapper and keeps the rest formatted', () => {
    editor.innerHTML = '<p><strong>bold</strong></p>'
    const text = editor.querySelector('strong')!.firstChild as Text

    selectText(text, 1, 3) // "ol"
    expect(clearInlineFormatting(editor)).toBe(true)

    expect(editor.textContent).toBe('bold')
    const strongParts = Array.from(editor.querySelectorAll('strong')).map((el) => el.textContent)
    expect(strongParts.join('')).toBe('bd')
    expect(strongParts.some((part) => part.includes('ol'))).toBe(false)
  })

  it('removes highlight and text-colour spans', () => {
    editor.innerHTML =
      '<p>x <span data-highlight="yellow">hi</span> y <span data-color="red">red</span></p>'
    selectContents(editor.querySelector('p')!)

    expect(clearInlineFormatting(editor)).toBe(true)
    expect(editor.querySelector('[data-highlight]')).toBeNull()
    expect(editor.querySelector('[data-color]')).toBeNull()
    expect(editor.textContent).toBe('x hi y red')
  })

  it('keeps code blocks intact', () => {
    editor.innerHTML = '<pre><code>const x = 1</code></pre>'
    selectContents(editor.querySelector('pre')!)

    expect(clearInlineFormatting(editor)).toBe(false)
    expect(editor.querySelector('pre code')?.textContent).toBe('const x = 1')
  })

  it('keeps links (formatting only)', () => {
    editor.innerHTML = '<p><a href="https://example.com" target="_blank">link</a></p>'
    selectContents(editor.querySelector('a')!)

    expect(clearInlineFormatting(editor)).toBe(false)
    expect(editor.querySelector('a')).not.toBeNull()
  })

  it('clears the whole block when the caret is collapsed', () => {
    editor.innerHTML = '<p>plain <strong>bold</strong> <em>italic</em></p>'
    const text = editor.querySelector('p')!.firstChild as Text

    selectText(text, 2, 2) // collapsed caret
    expect(clearInlineFormatting(editor)).toBe(true)

    expect(editor.querySelector('strong')).toBeNull()
    expect(editor.querySelector('em')).toBeNull()
    expect(editor.textContent).toBe('plain bold italic')
  })

  it('reports false and leaves the DOM alone when nothing is formatted', () => {
    editor.innerHTML = '<p>just text</p>'
    const before = editor.innerHTML
    selectContents(editor.querySelector('p')!)

    expect(clearInlineFormatting(editor)).toBe(false)
    expect(editor.innerHTML).toBe(before)
  })

  it('ignores selections outside the editor', () => {
    editor.innerHTML = '<p><strong>inside</strong></p>'
    const outside = document.createElement('p')
    outside.innerHTML = '<strong>outside</strong>'
    document.body.appendChild(outside)

    selectContents(outside)
    expect(clearInlineFormatting(editor)).toBe(false)
    expect(outside.querySelector('strong')).not.toBeNull()

    outside.remove()
  })
})
