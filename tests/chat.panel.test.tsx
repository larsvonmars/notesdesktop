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

    expect(html).toContain('List tasks')
    expect(html).toContain('Tool activity')
    expect(html).toContain('<strong>two</strong>')
    expect(html).toContain('Any open tasks?')
  })

  it('gives PDF, mind map, and web tools distinct categories and statuses', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        toolCalls: [
          {
            id: 'pdf',
            name: 'read_pdf_note',
            arguments: '{"title":"Research.pdf"}',
            status: 'done',
          },
          {
            id: 'map',
            name: 'update_mindmap_note',
            arguments: '{"title":"Roadmap"}',
            status: 'running',
          },
          {
            id: 'web',
            name: 'search_web',
            arguments: '{"query":"latest report"}',
            status: 'error',
            error: 'Search unavailable',
          },
        ],
      },
    ]

    const html = renderToStaticMarkup(<ChatPanel {...baseProps} messages={messages} />)

    expect(html).toContain('PDF &amp; OCR')
    expect(html).toContain('Mind maps')
    expect(html).toContain('Web')
    expect(html).toContain('In progress')
    expect(html).toContain('Complete')
    expect(html).toContain('Failed')
    expect(html).toContain('Search the web, Failed: latest report')
  })

  it('shows the error banner when a turn fails', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        error: 'Upstream timeout',
        createdAt: new Date().toISOString(),
      },
    ]

    const html = renderToStaticMarkup(
      <ChatPanel {...baseProps} messages={messages} status="error" error="Upstream timeout" />
    )

    expect(html).toContain('The assistant could not complete this response')
    expect(html).toContain('Upstream timeout')
    expect(html.match(/Upstream timeout/g)).toHaveLength(1)
  })

  it('shows the focused note above the composer', () => {
    const html = renderToStaticMarkup(
      <ChatPanel
        {...baseProps}
        messages={[]}
        focus={{ noteId: 'note-1', noteTitle: 'Weekly plan', noteType: 'rich-text' }}
        onClearFocus={() => {}}
      />
    )

    expect(html).toContain('Weekly plan')
    expect(html).toContain('Stop using this note as context')
  })

  it('omits the focus chip when no note is focused', () => {
    const html = renderToStaticMarkup(<ChatPanel {...baseProps} messages={[]} />)
    expect(html).not.toContain('Stop using this note as context')
  })
})
