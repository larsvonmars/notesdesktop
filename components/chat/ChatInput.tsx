'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, ImagePlus, Paperclip, Send, Square, Wrench, X } from 'lucide-react'
import { cn } from '@/components/shell/utils'
import { CHAT_TOOL_MENU, getToolMenuEntry } from '@/lib/chat/tool-menu'
import {
  MAX_DOCUMENT_ATTACHMENTS,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_ATTACHMENTS,
  MAX_IMAGE_BYTES,
  formatFileSize,
  getDocumentMediaType,
  readDocumentAttachment,
  readImageAttachment,
} from '@/lib/chat/attachments'
import type { ChatAttachment } from '@/lib/chat/types'

export interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  streaming: boolean
  agentMode: boolean
  attachments: ChatAttachment[]
  onAttachmentsChange: (attachments: ChatAttachment[]) => void
  attachmentError: string | null
  onAttachmentError: (message: string | null) => void
  forcedTool: string | null
  onForcedToolChange: (tool: string | null) => void
}

const MAX_HEIGHT = 200

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  agentMode,
  attachments,
  onAttachmentsChange,
  attachmentError,
  onAttachmentError,
  forcedTool,
  onForcedToolChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const images = attachments.filter((attachment) => attachment.kind === 'image')
  const documents = attachments.filter((attachment) => attachment.kind === 'document')
  const activeTool = getToolMenuEntry(forcedTool)
  const hasContent = value.trim().length > 0 || attachments.length > 0

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      onAttachmentError(null)
      const queue = Array.from(files)
      const next = [...attachments]
      let imageCount = images.length
      let documentCount = documents.length
      const errors: string[] = []

      for (const file of queue) {
        const mediaType = getDocumentMediaType(file)
        if (mediaType) {
          if (documentCount >= MAX_DOCUMENT_ATTACHMENTS) {
            errors.push(`You can attach up to ${MAX_DOCUMENT_ATTACHMENTS} documents.`)
            continue
          }
          if (file.size > MAX_DOCUMENT_BYTES) {
            errors.push(`“${file.name}” is larger than ${formatFileSize(MAX_DOCUMENT_BYTES)}.`)
            continue
          }
          try {
            next.push(await readDocumentAttachment(file))
            documentCount += 1
          } catch {
            errors.push(`“${file.name}” could not be read.`)
          }
          continue
        }

        if (file.type.startsWith('image/')) {
          if (imageCount >= MAX_IMAGE_ATTACHMENTS) {
            errors.push(`You can attach up to ${MAX_IMAGE_ATTACHMENTS} images.`)
            continue
          }
          if (file.size > MAX_IMAGE_BYTES) {
            errors.push(`“${file.name}” is larger than ${formatFileSize(MAX_IMAGE_BYTES)}.`)
            continue
          }
          try {
            next.push(await readImageAttachment(file))
            imageCount += 1
          } catch {
            errors.push(`“${file.name}” could not be read.`)
          }
          continue
        }

        errors.push(`“${file.name}” is not supported. Attach images, PDFs or DOCX files.`)
      }

      onAttachmentsChange(next)
      if (errors.length > 0) onAttachmentError(errors[0])
    },
    [attachments, documents.length, images.length, onAttachmentError, onAttachmentsChange]
  )

  const removeAttachment = useCallback(
    (id: string) => {
      onAttachmentsChange(attachments.filter((attachment) => attachment.id !== id))
    },
    [attachments, onAttachmentsChange]
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (!streaming && hasContent) onSubmit()
    }
  }

  return (
    // Drag & drop has no keyboard equivalent; the attach buttons cover that.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={cn('relative', dragActive && 'rounded-2xl ring-2 ring-accent/40')}
      onDragOver={(event) => {
        event.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        setDragActive(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragActive(false)
        if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files)
      }}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-accent-light/80 text-accent backdrop-blur-sm">
          <ImagePlus className="h-7 w-7" aria-hidden="true" />
          <span className="text-xs font-medium">Drop files to attach</span>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-2.5 pt-2.5">
          {images.map((image) => (
            <div key={image.id} className="group/image relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.dataUrl}
                alt={image.name}
                className="h-14 w-14 rounded-lg border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => removeAttachment(image.id)}
                className="focus-ring absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-danger text-white group-hover/image:flex"
                aria-label={`Remove ${image.name}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
          {documents.map((document) => (
            <div
              key={document.id}
              className="group/doc flex max-w-[220px] shrink-0 items-center gap-2 rounded-lg border border-border bg-surface/70 px-2.5 py-1.5"
            >
              <FileText className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-medium text-foreground">{document.name}</p>
                <p className="text-[10px] text-muted">{formatFileSize(document.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => removeAttachment(document.id)}
                className="focus-ring hidden shrink-0 rounded-full p-0.5 text-muted transition-colors hover:text-danger group-hover/doc:block"
                aria-label={`Remove ${document.name}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {attachmentError && (
        <p className="px-3 pt-2 text-[11.5px] text-danger" role="alert">
          {attachmentError}
        </p>
      )}

      <div className="flex items-end gap-1.5 px-2.5 py-2">
        {agentMode && (
          <span className="mb-0.5 flex shrink-0 items-center gap-1 rounded-full border border-accent/25 bg-accent-light px-2 py-0.5 text-[10px] font-medium text-accent">
            Agent
          </span>
        )}

        {activeTool && (
          <span className="mb-0.5 flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">
            <span aria-hidden="true">{activeTool.emoji}</span>
            <span className="hidden sm:inline">{activeTool.label}</span>
            <button
              type="button"
              onClick={() => onForcedToolChange(null)}
              className="focus-ring rounded-full hover:text-danger"
              aria-label="Clear selected tool"
            >
              <X className="h-2.5 w-2.5" aria-hidden="true" />
            </button>
          </span>
        )}

        <div className="relative mb-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setToolMenuOpen((prev) => !prev)}
            className={cn(
              'focus-ring rounded-lg p-1 transition-colors',
              toolMenuOpen || forcedTool
                ? 'bg-accent-light text-accent'
                : 'text-muted hover:bg-surface-hover hover:text-foreground'
            )}
            aria-label="Use a specific tool"
            title="Use a specific tool"
            aria-expanded={toolMenuOpen}
          >
            <Wrench className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          {toolMenuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setToolMenuOpen(false)}
                aria-label="Close tool menu"
                tabIndex={-1}
              />
              <div className="glass-popover absolute bottom-full left-0 z-40 mb-2 w-64 rounded-2xl py-1 animate-rise-in">
                <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Use a specific tool
                </p>
                {CHAT_TOOL_MENU.map((entry) => (
                  <button
                    key={entry.toolName}
                    type="button"
                    onClick={() => {
                      onForcedToolChange(forcedTool === entry.toolName ? null : entry.toolName)
                      setToolMenuOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors',
                      forcedTool === entry.toolName ? 'bg-accent-light' : 'hover:bg-surface-hover'
                    )}
                  >
                    <span className="text-sm leading-5" aria-hidden="true">
                      {entry.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12px] font-medium text-foreground">{entry.label}</span>
                      <span className="block text-[10.5px] leading-snug text-muted">{entry.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {images.length < MAX_IMAGE_ATTACHMENTS && (
          <label className="mb-0.5 shrink-0 cursor-pointer rounded-lg p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
            <ImagePlus className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="sr-only">Attach images</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files)
                event.target.value = ''
              }}
            />
          </label>
        )}

        {documents.length < MAX_DOCUMENT_ATTACHMENTS && (
          <label className="mb-0.5 shrink-0 cursor-pointer rounded-lg p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
            <Paperclip className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="sr-only">Attach documents</span>
            <input
              type="file"
              accept=".pdf,.docx"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files)
                event.target.value = ''
              }}
            />
          </label>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData?.items ?? [])
              .map((item) => item.getAsFile())
              .filter((file): file is File => Boolean(file))
            if (files.length > 0) {
              event.preventDefault()
              void addFiles(files)
            }
          }}
          rows={1}
          placeholder={agentMode ? 'Tell your agent what to do…' : 'Message MindViz…'}
          className="max-h-[200px] min-h-6 flex-1 resize-none bg-transparent py-1 text-[13.5px] leading-relaxed text-foreground placeholder:text-muted focus:outline-none"
          aria-label="Chat message"
        />

        <div className="mb-0.5 flex shrink-0 items-center gap-1">
          {hasContent && !streaming && (
            <span className="hidden text-[10px] tabular-nums text-muted sm:inline">{value.length}</span>
          )}
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-full bg-danger text-white transition-transform hover:bg-danger/90 active:scale-95"
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!hasContent}
              className={cn(
                'focus-ring flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white transition-transform',
                'hover:bg-accent-strong active:scale-95 disabled:cursor-not-allowed disabled:opacity-35'
              )}
              aria-label="Send message"
              title="Send message"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
