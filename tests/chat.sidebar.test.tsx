import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import ChatConversationList from '@/components/chat/ChatConversationList'
import ChatSidebar from '@/components/chat/ChatSidebar'
import type { ChatConversationSummary } from '@/lib/chat/types'

function makeConversations(count: number): ChatConversationSummary[] {
  // Most recent first, matching the Supabase ordering.
  return Array.from({ length: count }, (_, index) => ({
    id: `c${index + 1}`,
    title: `Conversation ${index + 1}`,
    created_at: new Date(2026, 0, 1, 12, 0 - index).toISOString(),
    updated_at: new Date(2026, 0, 1, 12, 0 - index).toISOString(),
  }))
}

const baseProps = {
  currentId: null,
  onSelect: () => {},
  onDelete: () => {},
}

describe('ChatConversationList', () => {
  it('shows only the 10 most recent conversations with a load-all action', () => {
    const html = renderToStaticMarkup(
      <ChatConversationList {...baseProps} conversations={makeConversations(12)} />
    )

    expect(html).toContain('Conversation 1')
    expect(html).toContain('Conversation 10')
    expect(html).not.toContain('Conversation 11')
    expect(html).not.toContain('Conversation 12')
    expect(html).toContain('Load all 12 chats')
  })

  it('omits the load-all action when everything fits', () => {
    const html = renderToStaticMarkup(
      <ChatConversationList {...baseProps} conversations={makeConversations(8)} />
    )

    expect(html).not.toContain('Load all')
  })

  it('keeps the selected conversation visible even when it is older than the limit', () => {
    const html = renderToStaticMarkup(
      <ChatConversationList
        {...baseProps}
        currentId="c12"
        conversations={makeConversations(12)}
      />
    )

    expect(html).toContain('Conversation 12')
    expect(html).toContain('Show recent')
  })
})

describe('ChatSidebar', () => {
  it('renders the history header and the new chat action', () => {
    const html = renderToStaticMarkup(
      <ChatSidebar
        conversations={makeConversations(3)}
        currentId={null}
        onSelect={() => {}}
        onNew={() => {}}
        onDelete={() => {}}
      />
    )

    expect(html).toContain('Chats')
    expect(html).toContain('New chat')
    expect(html).toContain('Conversation 3')
  })

  it('renders a compact rail when collapsed', () => {
    const html = renderToStaticMarkup(
      <ChatSidebar
        conversations={makeConversations(3)}
        currentId={null}
        collapsed
        onToggleCollapsed={() => {}}
        onSelect={() => {}}
        onNew={() => {}}
        onDelete={() => {}}
      />
    )

    expect(html).toContain('Expand chat history')
    expect(html).toContain('Recent chats')
    // The rail keeps the icon-only action; the labelled button is expanded-only.
    expect(html).not.toContain('>New chat<')
  })
})
