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
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" animation="zoom">
      <ModalHeader onClose={onClose} closeAriaLabel="Close archived projects">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-muted">
            <Archive size={17} strokeWidth={1.9} />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold leading-tight tracking-[-0.01em] text-foreground">
              Archived projects
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-muted">
              {projects.length > 0
                ? `${projects.length} archived project${projects.length !== 1 ? 's' : ''}`
                : 'Nothing archived yet'}
            </p>
          </div>
        </div>
      </ModalHeader>

      <div className="scroll-thin min-h-[240px] flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="glass mb-3 flex h-11 w-11 items-center justify-center rounded-2xl text-muted">
              <Archive size={20} strokeWidth={1.7} />
            </div>
            <div className="text-sm font-medium text-foreground">No archived projects</div>
            <p className="mt-1 max-w-[260px] text-xs leading-5 text-muted">
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
                className="glass rounded-2xl p-3 transition-colors duration-150"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                    style={{ backgroundColor: project.color || '#737373' }}
                  >
                    {project.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-foreground">{project.name}</div>
                    <div className="truncate text-xs leading-5 text-muted">
                      {project.description || `Archived ${formatDate(project.archived_at)}`}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  {confirming ? (
                    <>
                      <span className="mr-auto text-[11px] leading-4 text-muted">
                        Folders &amp; notes become Unfiled.
                      </span>
                      <button
                        onClick={() => runAction(project.id, () => onDelete(project.id))}
                        disabled={busy}
                        className="inline-flex h-8 items-center justify-center rounded-full bg-danger px-3 text-xs font-semibold text-accent-foreground transition-[filter] duration-150 hover:brightness-105 disabled:opacity-50"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="glass-btn inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium text-foreground"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => runAction(project.id, () => onRestore(project.id))}
                        disabled={busy}
                        className="glass-btn-primary inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-xs text-accent-foreground transition-[filter] duration-150 hover:brightness-105 disabled:opacity-50"
                      >
                        <ArchiveRestore size={13} strokeWidth={1.9} />
                        Restore
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(project.id)}
                        className="focus-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs font-medium text-danger transition-colors duration-150 hover:bg-[var(--danger-light)]"
                      >
                        <Trash2 size={13} strokeWidth={1.9} />
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