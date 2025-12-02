import { supabase } from './supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface AIChat {
  id: string
  user_id: string
  note_id: string | null
  title: string
  messages: AIMessage[]
  created_at: string
  updated_at: string
}

export interface CreateAIChatInput {
  note_id?: string | null
  title?: string
  messages?: AIMessage[]
}

export interface UpdateAIChatInput {
  title?: string
  messages?: AIMessage[]
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Get all AI chats for the current user
 */
export async function getAIChats(): Promise<AIChat[]> {
  const { data, error } = await supabase
    .from('ai_chats')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Get AI chats for a specific note
 */
export async function getAIChatsByNote(noteId: string): Promise<AIChat[]> {
  const { data, error } = await supabase
    .from('ai_chats')
    .select('*')
    .eq('note_id', noteId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Get a single AI chat by ID
 */
export async function getAIChat(id: string): Promise<AIChat | null> {
  const { data, error } = await supabase
    .from('ai_chats')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }
  return data
}

/**
 * Create a new AI chat
 */
export async function createAIChat(input: CreateAIChatInput): Promise<AIChat> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('ai_chats')
    .insert({
      user_id: user.id,
      note_id: input.note_id || null,
      title: input.title || 'New Chat',
      messages: input.messages || [],
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Update an existing AI chat
 */
export async function updateAIChat(id: string, input: UpdateAIChatInput): Promise<AIChat> {
  const { data, error } = await supabase
    .from('ai_chats')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Add a message to an existing chat
 */
export async function addMessageToChat(
  chatId: string, 
  message: AIMessage
): Promise<AIChat> {
  // First get the current messages
  const chat = await getAIChat(chatId)
  if (!chat) throw new Error('Chat not found')

  const updatedMessages = [...chat.messages, message]
  
  return updateAIChat(chatId, { messages: updatedMessages })
}

/**
 * Add multiple messages to an existing chat
 */
export async function addMessagesToChat(
  chatId: string, 
  messages: AIMessage[]
): Promise<AIChat> {
  const chat = await getAIChat(chatId)
  if (!chat) throw new Error('Chat not found')

  const updatedMessages = [...chat.messages, ...messages]
  
  return updateAIChat(chatId, { messages: updatedMessages })
}

/**
 * Delete an AI chat
 */
export async function deleteAIChat(id: string): Promise<void> {
  const { error } = await supabase
    .from('ai_chats')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Generate a title for a chat based on the first user message
 */
export function generateChatTitle(messages: AIMessage[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user')
  if (!firstUserMessage) return 'New Chat'
  
  // Truncate to first 50 characters
  const content = firstUserMessage.content.trim()
  if (content.length <= 50) return content
  return content.substring(0, 47) + '...'
}

/**
 * Subscribe to AI chat changes for real-time updates
 */
export function subscribeToAIChats(
  userId: string,
  callback: (payload: any) => void
) {
  const channel = supabase
    .channel('ai_chats_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'ai_chats',
        filter: `user_id=eq.${userId}`,
      },
      callback
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
