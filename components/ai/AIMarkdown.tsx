'use client'

import { useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ChevronDown, Cpu } from 'lucide-react'

marked.setOptions({ gfm: true, breaks: true })

function renderMarkdown(content: string): string {
  try {
    return marked.parse(content, { async: false }) as string
  } catch {
    return content
  }
}

/** Theme-aware markdown renderer using CSS-variable utilities */
export function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  const html = useMemo(() => {
    const raw = renderMarkdown(content)
    return typeof window !== 'undefined' ? DOMPurify.sanitize(raw) : raw
  }, [content])
  return (
    <div
      className={`text-[13px] leading-[1.7] text-foreground
        [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
        [&_strong]:font-semibold [&_em]:italic
        [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
        [&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5
        [&_h3]:text-[13px] [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2
        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2
        [&_li]:my-1 [&_li]:leading-relaxed
        [&_code]:bg-surface-active/60 [&_code]:text-foreground [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:text-xs [&_code]:font-mono
        [&_pre]:bg-surface-active/60 [&_pre]:rounded-xl [&_pre]:p-3.5 [&_pre]:overflow-auto [&_pre]:my-3 [&_pre]:border [&_pre]:border-border/50
        [&_pre>code]:bg-transparent [&_pre>code]:p-0
        [&_blockquote]:border-l-2 [&_blockquote]:border-alpine-400/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_blockquote]:my-2 [&_blockquote]:italic
        [&_a]:text-alpine-500 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-alpine-400
        [&_hr]:border-border/50 [&_hr]:my-4
        [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_table]:my-3
        [&_th]:bg-surface-hover [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium
        [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5
        ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Collapsible reasoning chain shown for every assistant response */
export function ThinkingSection({ reasoning }: { reasoning: string }) {
  const [open, setOpen] = useState(false)
  const wordCount = Math.round(reasoning.split(/\s+/).filter(Boolean).length)
  return (
    <div className="assistant-soft-pop mb-3 overflow-hidden rounded-2xl border border-border/40 bg-surface-hover/50" style={{ animationDelay: '60ms' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted transition-colors hover:text-foreground"
      >
        <Cpu size={12} className={`text-alpine-500/70 transition-transform duration-300 ${open ? 'scale-110' : ''}`} />
        <span className="font-medium">Reasoning chain</span>
        <span className="text-[10px] opacity-50">({wordCount} words)</span>
        <ChevronDown size={12} className={`ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="border-t border-border/30 px-3 pb-3 pt-0 text-xs leading-relaxed whitespace-pre-wrap text-muted/80">
            <div className="pt-3">{reasoning}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Animated typing dots */
export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="assistant-typing-dot w-1.5 h-1.5 rounded-full bg-muted/60"
          style={{
            animation: 'ai-typing 1.4s infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes ai-typing {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .assistant-typing-dot {
            animation: none !important;
            opacity: 0.7;
            transform: none !important;
          }
        }
      `}</style>
    </span>
  )
}
