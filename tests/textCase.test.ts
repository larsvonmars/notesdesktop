import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { applyTextCase, transformTextCase } from '../lib/editor/textCase'

/** Select a character range inside a text node. */
function selectRange(startNode: Text, start: number, endNode: Text, end: number): Range {
  const range = document.createRange()
  range.setStart(startNode, start)
  range.setEnd(endNode, end)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}

/** Select everything inside `node`. */
function selectContents(node: Node): Range {
  const range = document.createRange()
  range.selectNodeContents(node)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}

describe('transformTextCase', () => {
  it('upper- and lowercases', () => {
    expect(transformTextCase('Hello World', 'upper')).toBe('HELLO WORLD')
    expect(transformTextCase('Hello World', 'lower')).toBe('hello world')
  })

  it('title-cases each word and lowercases the rest', () => {
    expect(transformTextCase('hello wORLD', 'title')).toBe('Hello World')
    expect(transformTextCase('  spaced   words  ', 'title')).toBe('  Spaced   Words  ')
  })

  it('keeps punctuation and digits intact', () => {
    expect(transformTextCase('a-b c.d 42x', 'title')).toBe('A-b C.d 42x')
  })
})

describe('applyTextCase', () => {
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

  it('transforms a selection spanning inline markup as one string', () => {
    editor.innerHTML = '<p>hello <strong>world</strong></p>'
    const paragraph = editor.querySelector('p')!
    const firstText = paragraph.firstChild as Text
    const strongText = paragraph.querySelector('strong')!.firstChild as Text

    selectRange(firstText, 0, strongText, strongText.data.length)
    expect(applyTextCase(editor, 'title')).toBe(true)

    expect(paragraph.textContent).toBe('Hello World')
    // Markup preserved, only the text changed.
    expect(paragraph.querySelector('strong')?.textContent).toBe('World')
  })

  it('only transforms the selected part of a text node', () => {
    editor.innerHTML = '<p>hello world</p>'
    const text = editor.querySelector('p')!.firstChild as Text

    selectRange(text, 0, text, 5)
    expect(applyTextCase(editor, 'upper')).toBe(true)

    expect(editor.textContent).toBe('HELLO world')
  })

  it('does not merge words across blocks', () => {
    editor.innerHTML = '<p>end</p><p>start</p>'
    selectContents(editor)

    expect(applyTextCase(editor, 'title')).toBe(true)

    expect(Array.from(editor.querySelectorAll('p')).map((p) => p.textContent)).toEqual([
      'End',
      'Start',
    ])
  })

  it('transforms the whole block when the caret is collapsed', () => {
    editor.innerHTML = '<p>hello world</p>'
    const text = editor.querySelector('p')!.firstChild as Text

    selectRange(text, 3, text, 3) // collapsed inside the paragraph
    expect(applyTextCase(editor, 'title')).toBe(true)

    expect(editor.textContent).toBe('Hello World')
  })

  it('handles characters whose case change alters the length', () => {
    editor.innerHTML = '<p>straße</p>'
    selectContents(editor)

    expect(applyTextCase(editor, 'upper')).toBe(true)
    expect(editor.textContent).toBe('STRASSE')
  })

  it('returns false when nothing would change', () => {
    editor.innerHTML = '<p>already lower</p>'
    selectContents(editor)

    expect(applyTextCase(editor, 'lower')).toBe(false)
  })

  it('ignores selections outside the editor', () => {
    editor.innerHTML = '<p>inside</p>'
    const outside = document.createElement('p')
    outside.textContent = 'outside'
    document.body.appendChild(outside)

    selectContents(outside)
    expect(applyTextCase(editor, 'upper')).toBe(false)
    expect(outside.textContent).toBe('outside')

    outside.remove()
  })
})
