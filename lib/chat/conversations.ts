/** Conversation persistence for the Chat view (shared Supabase `chat_*` tables). */

import { supabase } from '@/lib/supabase'
import { AI_MODEL } from '@/lib/ai-model'
import { AUTO_TITLE_PROMPT } from './prompts'
import { requestChatCompletion } from './transport'
import type { ChatConversationSummary, ChatMessage } from './types'

const CONVERSATION_COLUMNS = 'id, title, created_at, updated_at'
const DEFAULT_TITLE = 'New conversation'
const MAX_STORED_MESSAGE_CHARS = 20000

function toSummary(row: Record<string, unknown>): ChatConversationSummary {
  return {
    id: String(row.id),
    title: String(row.title ?? DEFAULT_TITLE),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export async function listConversations(): Promise<ChatConversationSummary[]> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select(CONVERSATION_COLUMNS)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => toSummary(row as Record<string, unknown>))
}

export async function createConversation(
  userId: string,
  title: string,
): Promise<ChatConversationSummary | null> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({ user_id: userId, title: title.slice(0, 60) || DEFAULT_TITLE })
    .select(CONVERSATION_COLUMNS)
    .single()

  if (error) {
    console.error('Could not create chat conversation:', error.message)
    return null
  }
  return toSummary(data as Record<string, unknown>)
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from('chat_conversations').delete().eq('id', id)
  if (error) throw error
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('chat_conversations')
    .update({ title: title.slice(0, 60) || DEFAULT_TITLE })
    .eq('id', id)
  if (error) throw error
}

/** Load a stored conversation as chat messages (text and attachment labels only). */
export async function loadConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>
    return {
      id: String(record.id),
      role: record.role === 'assistant' ? 'assistant' : 'user',
      content: String(record.content ?? ''),
      createdAt: String(record.created_at ?? new Date().toISOString()),
    } satisfies ChatMessage
  })
}

/** Persist one message. Attachment payloads stay local; only labels are stored. */
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  const trimmed = content.trim()
  if (!trimmed) return

  const { error } = await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    role,
    content: trimmed.slice(0, MAX_STORED_MESSAGE_CHARS),
  })

  if (error) {
    console.error('Could not store chat message:', error.message)
  }
}

/** Ask the model for a short conversation title, falling back to a truncation. */
export async function generateConversationTitle(firstUserMessage: string): Promise<string> {
  const fallback = firstUserMessage.replace(/\s+/g, ' ').trim().slice(0, 60) || DEFAULT_TITLE

  try {
    const result = await requestChatCompletion({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: AUTO_TITLE_PROMPT },
        { role: 'user', content: firstUserMessage.slice(0, 2000) },
      ],
      max_tokens: 40,
    })
    const title = result.content.replace(/^["'`]+|["'`]+$/g, '').trim().slice(0, 60)
    return title || fallback
  } catch {
    return fallback
  }
}
