import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyInlineStyle } from '@/lib/editor/commandDispatcher'

describe('commandDispatcher applyInlineStyle range behavior', () => {
  let editor: HTMLDivElement

  beforeEach(() => {
    editor = document.createElement('div')
    editor.contentEditable = 'true'
    document.body.appendChild(editor)
  })

  afterEach(() => {
    document.body.removeChild(editor)
  })

  it('applies style only to selected part of a single line', () => {
    const textNode = document.createTextNode('Hello world')
    editor.appendChild(textNode)

    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(textNode, 3) // Hel|lo world
    range.setEnd(textNode, 8)   // Hello wo|rld

    selection?.removeAllRanges()
    selection?.addRange(range)

    applyInlineStyle('strong')

    const strongNodes = editor.querySelectorAll('strong')
    expect(strongNodes).toHaveLength(1)
    expect(strongNodes[0].textContent).toBe('lo wo')
    expect(editor.textContent).toBe('Hello world')
  })

  it('removes style only from selected part when line is already styled', () => {
    const strong = document.createElement('strong')
    const textNode = document.createTextNode('Hello world')
    strong.appendChild(textNode)
    editor.appendChild(strong)

    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(textNode, 3)
    range.setEnd(textNode, 8)

    selection?.removeAllRanges()
    selection?.addRange(range)

    applyInlineStyle('strong')

    const strongNodes = editor.querySelectorAll('strong')
    expect(strongNodes.length).toBeGreaterThanOrEqual(2)
    expect(Array.from(strongNodes).some((node) => node.textContent === 'Hel')).toBe(true)
    expect(Array.from(strongNodes).some((node) => node.textContent === 'rld')).toBe(true)

    const plainMiddle = Array.from(editor.childNodes).some((node) => {
      if (node.nodeType !== Node.TEXT_NODE) return false
      return (node.textContent || '').includes('lo wo')
    })

    expect(plainMiddle).toBe(true)
    expect(editor.textContent).toBe('Hello world')
  })

  it('removes full style when the full styled text is selected', () => {
    const strong = document.createElement('strong')
    const textNode = document.createTextNode('Hello world')
    strong.appendChild(textNode)
    editor.appendChild(strong)

    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, textNode.length)

    selection?.removeAllRanges()
    selection?.addRange(range)

    applyInlineStyle('strong')

    const remainingStyledText = Array.from(editor.querySelectorAll('strong')).some(
      (node) => (node.textContent || '').length > 0,
    )
    expect(remainingStyledText).toBe(false)
    expect(editor.textContent).toBe('Hello world')
  })
})
