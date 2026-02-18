import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { handleListEnter, handleListBackspace } from '@/lib/editor/listHandler'

describe('listHandler enter/backspace edge cases', () => {
  let editor: HTMLDivElement

  beforeEach(() => {
    editor = document.createElement('div')
    editor.contentEditable = 'true'
    document.body.appendChild(editor)
  })

  afterEach(() => {
    document.body.removeChild(editor)
  })

  it('keeps list order when Enter exits an empty middle item', () => {
    const list = document.createElement('ul')

    const first = document.createElement('li')
    first.textContent = 'First'

    const empty = document.createElement('li')
    empty.appendChild(document.createElement('br'))

    const third = document.createElement('li')
    third.textContent = 'Third'

    list.appendChild(first)
    list.appendChild(empty)
    list.appendChild(third)
    editor.appendChild(list)

    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(empty, 0)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)

    const handled = handleListEnter(editor)
    expect(handled).toBe(true)

    const topChildren = Array.from(editor.children)
    expect(topChildren).toHaveLength(3)

    expect(topChildren[0].tagName).toBe('UL')
    expect(topChildren[1].tagName).toBe('P')
    expect(topChildren[2].tagName).toBe('UL')

    const firstListItems = topChildren[0].querySelectorAll(':scope > li')
    const secondListItems = topChildren[2].querySelectorAll(':scope > li')

    expect(firstListItems).toHaveLength(1)
    expect(firstListItems[0].textContent).toContain('First')

    expect(secondListItems).toHaveLength(1)
    expect(secondListItems[0].textContent).toContain('Third')
  })

  it('handles Backspace at checklist start when cursor is on LI offset after checkbox', () => {
    const list = document.createElement('ul')
    list.setAttribute('data-checklist', 'true')

    const li = document.createElement('li')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    li.appendChild(checkbox)
    li.appendChild(document.createTextNode('Task item'))
    list.appendChild(li)
    editor.appendChild(list)

    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(li, 1)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)

    const handled = handleListBackspace(editor)
    expect(handled).toBe(true)

    const paragraph = editor.querySelector('p')
    expect(paragraph).toBeTruthy()
    expect(paragraph?.textContent).toContain('Task item')
    expect(editor.querySelector('ul')).toBeNull()
  })

  it('keeps nested child list on original item when Enter is pressed at end of parent text', () => {
    const list = document.createElement('ul')

    const parent = document.createElement('li')
    const parentText = document.createTextNode('Parent')
    parent.appendChild(parentText)

    const nested = document.createElement('ul')
    const nestedItem = document.createElement('li')
    nestedItem.textContent = 'Child'
    nested.appendChild(nestedItem)
    parent.appendChild(nested)

    list.appendChild(parent)
    editor.appendChild(list)

    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(parentText, parentText.textContent?.length ?? 0)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)

    const handled = handleListEnter(editor)
    expect(handled).toBe(true)

    const rootItems = list.querySelectorAll(':scope > li')
    expect(rootItems).toHaveLength(2)

    const firstItem = rootItems[0] as HTMLLIElement
    const secondItem = rootItems[1] as HTMLLIElement

    expect(firstItem.querySelector(':scope > ul')).toBeTruthy()
    expect(firstItem.textContent).toContain('Parent')
    expect(firstItem.textContent).toContain('Child')

    expect(secondItem.querySelector(':scope > ul')).toBeFalsy()
  })

  it('moves nested child list to new item when Enter is pressed at start of parent text', () => {
    const list = document.createElement('ul')

    const parent = document.createElement('li')
    const parentText = document.createTextNode('Parent')
    parent.appendChild(parentText)

    const nested = document.createElement('ul')
    const nestedItem = document.createElement('li')
    nestedItem.textContent = 'Child'
    nested.appendChild(nestedItem)
    parent.appendChild(nested)

    list.appendChild(parent)
    editor.appendChild(list)

    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(parentText, 0)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)

    const handled = handleListEnter(editor)
    expect(handled).toBe(true)

    const rootItems = list.querySelectorAll(':scope > li')
    expect(rootItems).toHaveLength(2)

    const firstItem = rootItems[0] as HTMLLIElement
    const secondItem = rootItems[1] as HTMLLIElement

    expect(firstItem.querySelector(':scope > ul')).toBeFalsy()
    expect(secondItem.querySelector(':scope > ul')).toBeTruthy()
    expect(secondItem.textContent).toContain('Parent')
    expect(secondItem.textContent).toContain('Child')
  })
})
