import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  captureSelectionSnapshot,
  findSelectionBlock,
  restoreSelectionSnapshot,
} from '../lib/editor/selectionSnapshot'

/** Select a text range inside `node` using character offsets. */
function selectText(node: Text, start: number, end: number): Range {
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}

describe('selectionSnapshot', () => {
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

  it('captures a selection inside the editor and restores it by node identity', () => {
    editor.innerHTML = '<p>Hello world</p>'
    const text = editor.querySelector('p')!.firstChild as Text
    const range = selectText(text, 0, 5)

    const snapshot = captureSelectionSnapshot(range, editor)
    expect(snapshot).not.toBeNull()
    expect(snapshot!.blockIndex).toBe(0)

    // Selection lost (focus moved away / WebView quirk)
    window.getSelection()!.removeAllRanges()

    expect(restoreSelectionSnapshot(snapshot, editor)).toBe(true)
    expect(window.getSelection()!.toString()).toBe('Hello')
  })

  it('restores across a module-level wrapper change that keeps the text nodes (bold/italic wrapping)', () => {
    editor.innerHTML = '<p>Hello world</p>'
    const paragraph = editor.querySelector('p')!
    const text = paragraph.firstChild as Text
    const range = selectText(text, 6, 11) // "world"

    const snapshot = captureSelectionSnapshot(range, editor)

    // Simulate applyInlineStyle('strong'): extract + wrap, nodes are moved.
    const strong = document.createElement('strong')
    const live = window.getSelection()!.getRangeAt(0)
    strong.appendChild(live.extractContents())
    live.insertNode(strong)

    expect(restoreSelectionSnapshot(snapshot, editor)).toBe(true)
    expect(window.getSelection()!.toString()).toBe('world')
  })

  it('falls back to block index + text offsets when the block was rebuilt', () => {
    editor.innerHTML = '<p>Hello world</p>'
    const paragraph = editor.querySelector('p')!
    const text = paragraph.firstChild as Text
    const range = selectText(text, 0, 5) // "Hello"

    const snapshot = captureSelectionSnapshot(range, editor)
    expect(snapshot).not.toBeNull()

    // Simulate a block conversion that recreates the nodes (heading swap).
    const heading = document.createElement('h2')
    heading.innerHTML = paragraph.innerHTML
    paragraph.replaceWith(heading)

    // The original text node is gone — node identity cannot work any more.
    expect(snapshot!.range.startContainer.isConnected).toBe(false)

    expect(restoreSelectionSnapshot(snapshot, editor)).toBe(true)
    expect(window.getSelection()!.toString()).toBe('Hello')
  })

  it('returns null for selections outside the editor', () => {
    const outside = document.createElement('p')
    outside.textContent = 'outside'
    document.body.appendChild(outside)
    const range = selectText(outside.firstChild as Text, 0, 4)

    expect(captureSelectionSnapshot(range, editor)).toBeNull()
    outside.remove()
  })

  it('refuses to restore when the snapshot is empty', () => {
    expect(restoreSelectionSnapshot(null, editor)).toBe(false)
  })

  it('finds the top-level block through inline wrappers', () => {
    editor.innerHTML = '<p>a <em>b <strong>c</strong></em></p>'
    const strongText = editor.querySelector('strong')!.firstChild as Text

    const block = findSelectionBlock(strongText, editor)
    expect(block?.tagName).toBe('P')
    expect(findSelectionBlock(editor, editor)).toBeNull()
  })

  it('focuses the editor while restoring (needed before running a command)', () => {
    editor.innerHTML = '<p>Hello world</p>'
    const text = editor.querySelector('p')!.firstChild as Text
    const range = selectText(text, 0, 5)
    const snapshot = captureSelectionSnapshot(range, editor)

    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    expect(document.activeElement).toBe(button)

    expect(restoreSelectionSnapshot(snapshot, editor)).toBe(true)
    expect(document.activeElement).toBe(editor)

    button.remove()
  })
})
