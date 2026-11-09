import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

vi.mock('@/lib/chat/transport', () => ({
  requestChatCompletion: vi.fn(async () => ({
    content: 'Note ideas',
    reasoning: '',
    toolCalls: [],
  })),
}))

import {
  createConversation,
  deleteConversation,
  generateConversationTitle,
  listConversations,
  loadConversationMessages,
  renameConversation,
  saveMessage,
} from '@/lib/chat/conversations'

const mockState = (globalThis as { __supabase_mock?: { __resetMockState: () => void } })
  .__supabase_mock

describe('chat conversations', () => {
  beforeEach(() => {
    mockState?.__resetMockState()
  })

  it('creates, lists and renames a conversation', async () => {
    const created = await createConversation('user-1', 'Planning my week')
    expect(created).not.toBeNull()
    expect(created?.title).toBe('Planning my week')

    const listed = await listConversations()
    expect(listed.map((conversation) => conversation.id)).toContain(created?.id)

    await renameConversation(created!.id, 'Week plan')
    const renamed = await listConversations()
    expect(renamed.find((conversation) => conversation.id === created!.id)?.title).toBe('Week plan')
  })

  it('stores and reloads messages in order', async () => {
    const conversation = await createConversation('user-1', 'Chat')
    await saveMessage(conversation!.id, 'user', 'Hello there')
    await saveMessage(conversation!.id, 'assistant', 'Hi! How can I help?')

    const messages = await loadConversationMessages(conversation!.id)
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(messages[0].content).toBe('Hello there')
  })

  it('skips blank messages', async () => {
    const conversation = await createConversation('user-1', 'Chat')
    await saveMessage(conversation!.id, 'assistant', '   ')
    const messages = await loadConversationMessages(conversation!.id)
    expect(messages).toHaveLength(0)
  })

  it('deletes conversations', async () => {
    const conversation = await createConversation('user-1', 'Chat')
    await deleteConversation(conversation!.id)
    const listed = await listConversations()
    expect(listed.find((entry) => entry.id === conversation!.id)).toBeUndefined()
  })

  it('generates a short title from the first message', async () => {
    const title = await generateConversationTitle('Plan my week around the product launch deadline')
    expect(title).toBe('Note ideas')
  })
})
