import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import ChatPanel from '@/components/chat/ChatPanel'
import { CHAT_STARTERS } from '@/lib/chat/prompts'
import type { ChatAttachment, ChatMessage } from '@/lib/chat/types'

const baseProps = {
  title: 'New conversation',
  modelLabel: 'DeepSeek V4.1 Flash',
  status: 'ready' as const,
  error: null,
  agentMode: false,
  onToggleAgentMode: () => {},
  input: '',
  onInputChange: () => {},
  onSend: () => {},
  onStop: () => {},
  onNewChat: () => {},
  starters: CHAT_STARTERS,
  onStarterClick: () => {},
  copiedId: null,
  onCopy: () => {},
  attachments: [] as ChatAttachment[],
  onAttachmentsChange: () => {},
  attachmentError: null,
  onAttachmentError: () => {},
  forcedTool: null,
  onForcedToolChange: () => {},
}

describe('ChatPanel', () => {
  it('renders the empty state with starter prompts', () => {
    const html = renderToStaticMarkup(<ChatPanel {...baseProps} messages={[]} />)

    expect(html).toContain('How can I help?')
    expect(html).toContain('Find my notes about a project')
    expect(html).toContain('DeepSeek V4.1 Flash')
  })

  it('renders agent mode copy when enabled', () => {
    const html = renderToStaticMarkup(
      <ChatPanel {...baseProps} messages={[]} agentMode />
    )

    expect(html).toContain('Autonomous agent')
  })

  it('renders a user message with its attachment label', () => {
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'Summarise this',
        createdAt: new Date().toISOString(),
        attachments: [
          {
            id: 'doc',
            kind: 'document',
            name: 'brief.pdf',
            mediaType: 'application/pdf',
            size: 1200,
          },
        ],
      },
    ]

    const html = renderToStaticMarkup(<ChatPanel {...baseProps} messages={messages} />)
    expect(html).toContain('Summarise this')
    expect(html).toContain('brief.pdf')
  })

  it('renders assistant tool calls and markdown answers', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'Any open tasks?', createdAt: new Date().toISOString() },
      {
        id: 'a1',
        role: 'assistant',
        content: 'You have **two** open tasks.',
        createdAt: new Date().toISOString(),
        reasoning: 'Checking the planner.',
        toolCalls: [
          {
            id: 'call-1',
            name: 'list_tasks',
            arguments: '{}',
            status: 'done',
            result: '2 tasks',
          },
        ],
      },
    ]

    const html = renderToStaticMarkup(<ChatPanel {...baseProps} messages={messages} />)

    expect(html).toContain('Scanning tasks')
    expect(html).toContain('<strong>two</strong>')
    expect(html).toContain('Any open tasks?')
  })

  it('shows the error banner when a turn fails', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() },
    ]

    const html = renderToStaticMarkup(
      <ChatPanel {...baseProps} messages={messages} status="error" error="Upstream timeout" />
    )

    expect(html).toContain('no answer was generated')
    expect(html).toContain('Upstream timeout')
  })
})
