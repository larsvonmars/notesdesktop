import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SelectionToolbar from '@/components/SelectionToolbar'
import { SELECTION_AI_ACTIONS, type SelectionAIActionId } from '@/lib/chat/selection-actions'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const baseProps = {
  top: 0,
  left: 0,
  visible: true,
  activeFormats: new Set<string>(),
  onCommand: () => {},
}

function selectPassage(text: string): HTMLDivElement {
  const source = document.createElement('div')
  source.textContent = text
  document.body.appendChild(source)

  const range = document.createRange()
  range.selectNodeContents(source)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)

  return source
}

describe('SelectionToolbar AI actions', () => {
  it('renders the AI trigger when a handler is provided', () => {
    const html = renderToStaticMarkup(<SelectionToolbar {...baseProps} onAskAI={() => {}} />)
    expect(html).toContain('Ask AI about the selection')
  })

  it('hides the AI trigger when no handler is provided', () => {
    const html = renderToStaticMarkup(<SelectionToolbar {...baseProps} />)
    expect(html).not.toContain('Ask AI about the selection')
  })

  it('renders nothing while hidden', () => {
    const html = renderToStaticMarkup(
      <SelectionToolbar {...baseProps} visible={false} onAskAI={() => {}} />
    )
    expect(html).toBe('')
  })
})

describe('SelectionToolbar AI menu', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    window.getSelection()?.removeAllRanges()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
  })

  async function renderToolbar(onAskAI: (actionId: SelectionAIActionId, text: string) => void) {
    await act(async () => {
      root = createRoot(container)
      root.render(<SelectionToolbar {...baseProps} onAskAI={onAskAI} />)
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[title="Ask AI about the selection"]'
    )
    expect(trigger).toBeTruthy()
    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
  }

  it('captures the selection and dispatches the chosen action', async () => {
    const onAskAI = vi.fn()
    selectPassage('The selected passage')

    const items = await renderToolbar(onAskAI)
    expect(items).toHaveLength(SELECTION_AI_ACTIONS.length)

    const summarise = items.find((item) => item.textContent?.includes('Summarise'))
    expect(summarise).toBeTruthy()

    await act(async () => {
      summarise?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onAskAI).toHaveBeenCalledWith('summarise', 'The selected passage')
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })

  it('does nothing when there is no selection to send', async () => {
    const onAskAI = vi.fn()

    const items = await renderToolbar(onAskAI)
    await act(async () => {
      items[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onAskAI).not.toHaveBeenCalled()
  })
})
