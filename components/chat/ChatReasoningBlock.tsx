'use client'

import { useState } from 'react'
import { Brain, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/components/shell/utils'

export interface ChatReasoningBlockProps {
  text: string
  streaming?: boolean
}

/** Collapsible chain-of-thought block; stays open while the model is thinking. */
export default function ChatReasoningBlock({ text, streaming = false }: ChatReasoningBlockProps) {
  // `null` follows the streaming state; any click pins the user's choice.
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null)
  const expanded = expandedOverride ?? streaming

  if (!text.trim()) return null

  return (
    <div className="mb-2 rounded-xl border border-border bg-surface/60">
      <button
        type="button"
        onClick={() => setExpandedOverride(!expanded)}
        className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-[11px] font-medium text-muted transition-colors hover:text-foreground"
        aria-expanded={expanded}
      >
        {streaming ? (
          <Loader2 className="h-3 w-3 animate-spin text-accent" aria-hidden="true" />
        ) : (
          <Brain className="h-3 w-3 text-accent" aria-hidden="true" />
        )}
        <span>{streaming ? 'Thinking…' : 'Thought process'}</span>
        <span className="ml-auto text-muted">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>
      {expanded && (
        <div
          className={cn(
            'max-h-56 overflow-y-auto whitespace-pre-wrap border-t border-border px-3 py-2 text-[12px] leading-relaxed text-muted',
            streaming && 'animate-pulse-soft'
          )}
        >
          {text}
        </div>
      )}
    </div>
  )
}
