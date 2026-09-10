'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, FolderPlus, Loader2 } from 'lucide-react'
import BaseModal, { ModalBody, ModalFooter, ModalHeader } from './BaseModal'
import { DEFAULT_PROJECT_COLOR, PROJECT_COLOR_PRESETS } from '@/lib/projects'

export interface NewProjectInput {
  name: string
  color: string
}

interface NewProjectModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Persists the new project. Reject the returned promise to keep the modal
   * open (e.g. when the caller already surfaced an error toast).
   */
  onCreate: (input: NewProjectInput) => Promise<void>
}

export default function NewProjectModal({ isOpen, onClose, onCreate }: NewProjectModalProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(DEFAULT_PROJECT_COLOR)
  const [submitting, setSubmitting] = useState(false)
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  // Reset the form every time the modal opens and focus the name field.
  useEffect(() => {
    if (!isOpen) return
    setName('')
    setColor(DEFAULT_PROJECT_COLOR)
    setSubmitting(false)
    const focusTimer = setTimeout(() => nameInputRef.current?.focus(), 50)
    return () => clearTimeout(focusTimer)
  }, [isOpen])

  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0 && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onCreate({ name: trimmedName, color })
      onClose()
    } catch {
      // The caller surfaces the error; keep the modal open so input isn't lost.
      setSubmitting(false)
    }
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      zIndex={60}
      closeOnBackdropClick={!submitting}
      closeOnEscape={!submitting}
    >
      <ModalHeader onClose={submitting ? undefined : onClose}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <FolderPlus size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">New project</h2>
          <p className="text-xs text-muted">Name it and choose a color. You can change both later.</p>
        </div>
      </ModalHeader>

      <ModalBody>
        <label
          htmlFor="new-project-name"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
        >
          Name
        </label>
        <input
          id="new-project-name"
          ref={nameInputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Research, Client work, Travel plans"
          className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void handleSubmit()
            }
          }}
        />

        <div className="mt-5" role="group" aria-label="Project color">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">
            Color
          </span>
          <div className="grid grid-cols-6 gap-2.5 sm:grid-cols-9">
            {PROJECT_COLOR_PRESETS.map((preset) => {
              const isSelected = color === preset
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setColor(preset)}
                  aria-label={`Project color ${preset}`}
                  aria-pressed={isSelected}
                  className={`flex h-8 w-8 items-center justify-center justify-self-center rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    isSelected ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''
                  }`}
                  style={{ backgroundColor: preset }}
                >
                  {isSelected && <Check size={14} className="text-white drop-shadow" strokeWidth={3} />}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-surface-hover/40 px-3.5 py-2.5">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className={`truncate text-sm font-medium ${trimmedName ? 'text-foreground' : 'text-muted/60'}`}>
            {trimmedName || 'Untitled project'}
          </span>
        </div>
      </ModalBody>

      <ModalFooter className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {submitting ? 'Creating…' : 'Create project'}
        </button>
      </ModalFooter>
    </BaseModal>
  )
}
