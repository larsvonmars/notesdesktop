'use client'

import { Keyboard, Sparkles } from 'lucide-react'
import { AUTOFORMAT_HELP, formatShortcutKeys, getShortcutsByCategory } from '@/lib/editor/keyboardShortcuts'
import BaseModal, { ModalHeader, ModalBody, ModalFooter, ModalTitle } from './BaseModal'

interface KeyboardShortcutsHelpProps {
  isOpen: boolean
  onClose: () => void
}

export default function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  if (!isOpen) return null

  const categories = [
    { id: 'navigation', title: 'Workspace Navigation' },
    { id: 'formatting', title: 'Text Formatting' },
    { id: 'blocks', title: 'Blocks & Structure' },
    { id: 'editing', title: 'Editing' },
  ] as const

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="3xl" maxHeight="80vh">
        <ModalHeader onClose={onClose} closeAriaLabel="Close keyboard shortcuts">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-accent">
            <Keyboard size={18} strokeWidth={1.9} />
          </span>
          <ModalTitle>Keyboard Shortcuts</ModalTitle>
        </ModalHeader>

        <ModalBody className="space-y-7">
          {/* Keyboard Shortcuts */}
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
            {categories.map(({ id, title }) => {
              const shortcuts = getShortcutsByCategory(id as any)
              if (shortcuts.length === 0) return null

              return (
                <div key={id}>
                  <h3 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                    {title}
                  </h3>
                  <div className="space-y-0.5">
                    {shortcuts.map((shortcut, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between gap-3 rounded-lg px-1.5 py-1.5 transition-colors duration-150 hover:bg-[var(--surface-sunken)]"
                      >
                        <span className="min-w-0 text-[13px] leading-5 text-foreground">
                          {shortcut.description}
                        </span>
                        <kbd className="kbd shrink-0">{formatShortcutKeys(shortcut.keys)}</kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Autoformat Patterns */}
          <div>
            <h3 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              Markdown Auto-formatting
            </h3>
            <p className="mb-2.5 px-1 text-[13px] leading-5 text-muted">
              Type these patterns and press <kbd className="kbd">Space</kbd> to auto-format:
            </p>
            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
              {AUTOFORMAT_HELP.map((item, index) => (
                <div
                  key={index}
                  className="glass flex items-center justify-between gap-3 rounded-xl px-2.5 py-2"
                >
                  <span className="min-w-0 text-[13px] leading-5 text-foreground">{item.description}</span>
                  <code className="shrink-0 rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[11px] text-accent">
                    {item.pattern}
                  </code>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Tips */}
          <div className="rounded-2xl bg-[var(--accent-light)] p-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
              <Sparkles size={14} strokeWidth={1.9} className="text-accent" aria-hidden />
              Pro tips
            </h4>
            <ul className="space-y-1.5 text-[13px] leading-5 text-muted">
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                Select text to see the floating toolbar for quick formatting
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                Paste Markdown text and it will be automatically converted
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                Drag and drop images to insert them (if supported)
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                Use the slash command{' '}
                <code className="rounded-md bg-[var(--surface)] px-1 py-0.5 font-mono text-[11px] text-foreground">/</code>{' '}
                for quick access to all features
              </li>
            </ul>
          </div>
        </ModalBody>

        <ModalFooter>
          <button
            onClick={onClose}
            className="glass-btn-primary inline-flex h-10 w-full items-center justify-center rounded-full text-[13px] text-accent-foreground transition-[filter] duration-200 hover:brightness-105"
            type="button"
          >
            Got it!
          </button>
        </ModalFooter>
    </BaseModal>
  )
}