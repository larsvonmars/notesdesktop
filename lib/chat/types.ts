/** Shared, client-safe types for the Chat view. */

export type ChatRole = 'user' | 'assistant'

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

/** A tool invocation surfaced inside an assistant message. */
export interface ChatToolCall {
  id: string
  name: string
  /** Raw JSON arguments as received from the model. */
  arguments: string
  status: 'running' | 'done' | 'error'
  result?: string
  error?: string
}

/** A file the user attached to a user message. */
export interface ChatAttachment {
  id: string
  kind: 'image' | 'document'
  name: string
  mediaType: string
  size: number
  /** Image data URL used for vision requests (images only). */
  dataUrl?: string
  /** Preview URL for image thumbnails (images only). */
  previewUrl?: string
  /** Plain text extracted from a document (documents only). */
  text?: string
  /** True when the extracted document text hit the size cap. */
  truncated?: boolean
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  reasoning?: string
  attachments?: ChatAttachment[]
  toolCalls?: ChatToolCall[]
  createdAt: string
  error?: string
}

export interface ChatConversationSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
}

/** Callbacks emitted while a chat turn streams. */
export interface ChatTurnCallbacks {
  onReasoning?: (delta: string) => void
  onText?: (delta: string) => void
  onToolStart?: (call: { id: string; name: string; arguments: string }) => void
  onToolFinish?: (call: { id: string; result?: string; error?: string }) => void
}

export interface ChatTurnResult {
  text: string
  reasoning: string
  toolCalls: ChatToolCall[]
}
