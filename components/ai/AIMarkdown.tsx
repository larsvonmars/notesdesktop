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

const MARKDOWN_CLASS = [
  'text-[13.5px] leading-[1.7] text-foreground',
  '[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
  '[&_strong]:font-semibold [&_em]:italic [&_del]:text-muted [&_del]:line-through',
  '[&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:font-display [&_h1]:text-[18px] [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:tracking-[-0.02em]',
  '[&_h2]:mb-1.5 [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:tracking-[-0.01em]',
  '[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-display [&_h3]:text-[13.5px] [&_h3]:font-semibold',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-1 [&_li]:leading-[1.65]',
  '[&_li::marker]:text-muted',
  '[&_ul:has(input)]:list-none [&_ul:has(input)]:pl-0',
  '[&_li:has(input)]:list-none [&_li:has(input)]:pl-0',
  '[&_input]:mr-1.5 [&_input]:h-3.5 [&_input]:w-3.5 [&_input]:shrink-0',
  '[&_input]:accent-[var(--accent)] [&_input]:align-[-2px]',
  '[&_a]:text-accent [&_a]:underline [&_a]:decoration-[var(--accent-light)] [&_a]:underline-offset-2 hover:[&_a]:decoration-accent',
  '[&_code]:rounded-md [&_code]:border [&_code]:border-[var(--border)] [&_code]:bg-[var(--glass-bg-subtle)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11.5px] [&_code]:text-foreground [&_code]:backdrop-blur-sm',
  '[&_pre]:my-3 [&_pre]:overflow-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-[var(--border)] [&_pre]:bg-[var(--glass-bg-subtle)] [&_pre]:p-3 [&_pre]:shadow-[inset_0_1px_0_var(--glass-highlight)] [&_pre]:backdrop-blur-sm',
  '[&_pre>code]:border-0 [&_pre>code]:bg-transparent [&_pre>code]:p-0 [&_pre>code]:text-[11.5px] [&_pre>code]:shadow-none',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--accent)] [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_blockquote]:italic',
  '[&_hr]:my-4 [&_hr]:border-[var(--border)]',
  '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[12px]',
  '[&_th]:whitespace-nowrap',
  '[&_th]:border [&_th]:border-[var(--border)] [&_th]:bg-[var(--surface-hover)] [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-[11.5px] [&_th]:font-semibold [&_th]:text-foreground',
  '[&_td]:border [&_td]:border-[var(--border)] [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top [&_td]:text-[12px]',
].join(' ')

/** Theme-aware markdown renderer for assistant output (glass typography). */
export function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  const html = useMemo(() => {
    const raw = renderMarkdown(content)
    return typeof window !== 'undefined' ? DOMPurify.sanitize(raw) : raw
  }, [content])
  return (
    <div
      className={[MARKDOWN_CLASS, className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Collapsible reasoning chain shown for every completed assistant response. */
export function ThinkingSection({ reasoning }: { reasoning: string }) {
  const [open, setOpen] = useState(false)
  const wordCount = Math.round(reasoning.split(/\s+/).filter(Boolean).length)
  return (
    <div
      className="assistant-soft-pop mb-2.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--glass-bg-subtle)] backdrop-blur-sm"
      style={{ animationDelay: '60ms' }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-muted transition-colors duration-150 hover:text-foreground"
        type="button"
      >
        <Cpu size={11} className="shrink-0 text-accent" strokeWidth={1.9} />
        <span className="text-[10px] font-medium uppercase tracking-[0.08em]">Reasoning chain</span>
        <span className="text-[10px] text-muted">({wordCount} words)</span>
        <ChevronDown
          size={11}
          className={
            'ml-auto shrink-0 transition-transform duration-200 ' + (open ? 'rotate-180' : '')
          }
        />
      </button>
      <div
        className={
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out ' +
          (open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')
        }
      >
        <div className="overflow-hidden">
          <div className="border-t border-[var(--border)] px-2.5 pb-2.5 text-[11px] leading-relaxed whitespace-pre-wrap text-muted">
            <div className="pt-2">{reasoning}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Animated accent typing dots */
export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="assistant-typing-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
          style={{
            animation: 'ai-typing 1.4s infinite',
            animationDelay: (i * 0.2) + 's',
          }}
        />
      ))}
      <style>{[
        '@keyframes ai-typing {',
        '  0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }',
        '  30% { opacity: 1; transform: scale(1); }',
        '}',
        '@media (prefers-reduced-motion: reduce) {',
        '  .assistant-typing-dot {',
        '    animation: none !important;',
        '    opacity: 0.7;',
        '    transform: none !important;',
        '  }',
        '}',
      ].join('\n')}</style>
    </span>
  )
}
