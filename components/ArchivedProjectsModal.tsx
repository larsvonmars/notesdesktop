'use client'

import { useState } from 'react'
import BaseModal, { ModalHeader } from '@/components/BaseModal'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import type { Project } from '@/lib/projects'

interface ArchivedProjectsModalProps {
  isOpen: boolean
  onClose: () => void
  projects: Project[]
  onRestore: (projectId: string) => void | Promise<void>
  onDelete: (projectId: string) => void | Promise<void>
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

export default function ArchivedProjectsModal({
  isOpen,
  onClose,
  projects,
  onRestore,
  onDelete,
}: ArchivedProjectsModalProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const runAction = async (id: string, action: () => void | Promise<void>) => {
    if (busyId) return
    setBusyId(id)
    try {
      await action()
    } finally {
      setBusyId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader onClose={onClose} closeAriaLabel="Close archived projects">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-hover text-muted">
            <Archive size={18} />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Archived projects</h2>
            <p className="text-xs text-muted">
              {projects.length > 0
                ? `${projects.length} archived project${projects.length !== 1 ? 's' : ''}`
                : 'Nothing archived yet'}
            </p>
          </div>
        </div>
      </ModalHeader>

      <div className="scroll-thin min-h-[240px] flex-1 space-y-2 overflow-y-auto p-3">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Archive size={28} className="mb-2 text-muted/40" />
            <div className="text-sm font-medium text-foreground/80">No archived projects</div>
            <p className="mt-0.5 max-w-[260px] text-xs text-muted/70">
              Archive projects you don&apos;t need anymore. They&apos;re hidden from your
              workspace but never deleted — restore them anytime.
            </p>
          </div>
        ) : (
          projects.map((project) => {
            const confirming = confirmDeleteId === project.id
            const busy = busyId === project.id
            return (
              <div
                key={project.id}
                className="rounded-xl border border-border bg-surface p-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                    style={{ backgroundColor: project.color || '#737373' }}
                  >
                    {project.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{project.name}</div>
                    <div className="truncate text-xs text-muted">
                      {project.description || `Archived ${formatDate(project.archived_at)}`}
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center justify-end gap-2">
                  {confirming ? (
                    <>
                      <span className="mr-auto text-[11px] text-muted">
                        Folders &amp; notes become Unfiled.
                      </span>
                      <button
                        onClick={() => runAction(project.id, () => onDelete(project.id))}
                        disabled={busy}
                        className="rounded-md bg-danger px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-md border border-border px-3 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-surface-hover"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => runAction(project.id, () => onRestore(project.id))}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        <ArchiveRestore size={14} />
                        Restore
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(project.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[13px] font-medium text-danger transition-colors hover:bg-danger-light"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </BaseModal>
  )
}
