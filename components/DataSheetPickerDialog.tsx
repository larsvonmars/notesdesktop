'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Search, Table2, Folder } from 'lucide-react'
import { getNotesWithContentByType } from '@/lib/notes'
import { getFolders } from '@/lib/folders'
import type { Note } from '@/lib/notes'
import type { Folder as FolderType } from '@/lib/folders'
import type { DataSheetData } from './DataSheetEditor'
import type { DataSheetTablePayload } from '@/lib/editor/dataSheetTableBlock'
import { buildDataSheetTablePayload, resolveSheetData } from '@/lib/editor/dataSheetSnapshot'
import BaseModal, { ModalHeader, ModalFooter, ModalTitle } from './BaseModal'

interface DataSheetPickerDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (payload: DataSheetTablePayload) => void
  currentNoteId?: string
}

export default function DataSheetPickerDialog({
  isOpen,
  onClose,
  onSelect,
  currentNoteId,
}: DataSheetPickerDialogProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<FolderType[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedSheet, setSelectedSheet] = useState<Note | null>(null)
  const [previewData, setPreviewData] = useState<{ columns: string[]; rows: string[][]; headerRows?: number[] } | null>(null)

  // Load data sheet notes
  useEffect(() => {
    if (!isOpen) return

    const loadData = async () => {
      setLoading(true)
      try {
        const [notesData, foldersData] = await Promise.all([
          getNotesWithContentByType('data-sheet'),
          getFolders(),
        ])
        setNotes(notesData)
        setFolders(foldersData)
      } catch (error) {
        console.error('Failed to load data sheets:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
    setSelectedSheet(null)
    setPreviewData(null)
  }, [isOpen])

  // Filter notes
  const filteredNotes = useMemo(() => {
    let filtered = notes.filter(n => n.id !== currentNoteId)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(n => n.title.toLowerCase().includes(q))
    }
    return filtered.sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
  }, [notes, searchQuery, currentNoteId])

  const getFolderName = (folderId: string | null) => {
    if (!folderId) return null
    const folder = folders.find(f => f.id === folderId)
    return folder?.name || null
  }

  // When a sheet is selected, parse and preview its content
  const handleSelectSheet = (note: Note) => {
    setSelectedSheet(note)
    try {
      const sheetData: DataSheetData = JSON.parse(note.content || '{}')
      if (sheetData.columns && sheetData.rows) {
        setPreviewData(resolveSheetData(sheetData))
      } else {
        setPreviewData(null)
      }
    } catch {
      setPreviewData(null)
    }
  }

  const handleInsert = () => {
    if (!selectedSheet || !previewData) return

    // Same builder the block inserter's inline step uses — one payload shape.
    const payload = buildDataSheetTablePayload(selectedSheet)
    if (!payload) return

    onSelect(payload)
    setSearchQuery('')
    setSelectedSheet(null)
    setPreviewData(null)
    onClose()
  }

  const handleClose = () => {
    setSearchQuery('')
    setSelectedSheet(null)
    setPreviewData(null)
    onClose()
  }

  if (!isOpen) return null

  // Max rows to show in preview
  const PREVIEW_MAX_ROWS = 10

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="4xl" maxHeight="85vh">
        <ModalHeader onClose={handleClose} closeAriaLabel="Close data sheet picker" gradient={false}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-accent">
            <Table2 size={17} strokeWidth={1.9} aria-hidden />
          </span>
          <div className="min-w-0">
            <ModalTitle>Insert Data Sheet Table</ModalTitle>
            <p className="mt-0.5 truncate text-xs leading-5 text-muted">Pick a table to embed as a static snapshot</p>
          </div>
        </ModalHeader>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Left: sheet list */}
          <div className="flex max-h-[45%] w-full shrink-0 flex-col border-b border-border bg-[var(--surface-sunken)] sm:max-h-none sm:w-72 sm:border-b-0 sm:border-r">
            {/* Search */}
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="text"
                  placeholder="Search data sheets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="glass-input h-9 w-full pl-9 pr-3 text-sm"
                  autoFocus
                />
              </div>
            </div>

            {/* Sheet list */}
            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted">
                  Loading data sheets…
                </div>
              ) : filteredNotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted">
                  <Table2 size={32} className="mb-2 opacity-40" />
                  <p className="text-sm">
                    {searchQuery.trim() ? 'No data sheets found' : 'No data sheets available'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredNotes.map(note => {
                    const isSelected = selectedSheet?.id === note.id
                    const folderName = getFolderName(note.folder_id)
                    return (
                      <button
                        key={note.id}
                        onClick={() => handleSelectSheet(note)}
                        className={`glass-row p-2.5 ${isSelected ? 'is-active' : ''}`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <Table2
                            size={16}
                            className={`shrink-0 ${isSelected ? 'text-accent' : 'text-muted'}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">
                              {note.title || 'Untitled Data Sheet'}
                            </div>
                            {folderName && (
                              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                                <Folder size={10} />
                                <span className="truncate">{folderName}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: preview */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedSheet ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted">
                <Table2 size={44} className="mb-3 opacity-30" />
                <p className="text-sm font-medium text-foreground">Select a data sheet</p>
                <p className="mt-1 text-xs">A preview of the table will appear here</p>
              </div>
            ) : !previewData ? (
              <div className="flex flex-1 items-center justify-center p-8 text-muted">
                <p className="text-sm">Could not parse data sheet content</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Preview header */}
                <div className="flex items-center justify-between border-b border-border bg-[var(--surface-sunken)] px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {selectedSheet.title || 'Untitled Data Sheet'}
                    </h3>
                    <p className="mt-0.5 text-xs tabular-nums text-muted">
                      {previewData.columns.length} columns × {previewData.rows.length} rows
                    </p>
                  </div>
                </div>

                {/* Table preview */}
                <div className="flex-1 overflow-auto p-4">
                  <div className="overflow-hidden rounded-xl border border-border">
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-[var(--surface-sunken)]">
                          {previewData.columns.map((col, ci) => (
                            <th
                              key={ci}
                              className="border-r border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted last:border-r-0"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.rows.slice(0, PREVIEW_MAX_ROWS).map((row, ri) => {
                          const isHeaderRow = previewData.headerRows && previewData.headerRows.includes(ri)
                          return (
                            <tr
                              key={ri}
                              className={`border-b border-border last:border-b-0 ${
                                isHeaderRow
                                  ? 'bg-[var(--accent-light)] font-semibold'
                                  : ri % 2 === 0
                                    ? 'bg-transparent'
                                    : 'bg-[var(--surface-sunken)]'
                              }`}
                            >
                              {previewData.columns.map((_, ci) => (
                                <td
                                  key={ci}
                                  className="whitespace-nowrap border-r border-border px-3 py-1.5 text-foreground last:border-r-0"
                                >
                                  {row[ci] ?? ''}
                                </td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {previewData.rows.length > PREVIEW_MAX_ROWS && (
                      <div className="border-t border-border bg-[var(--surface-sunken)] px-3 py-2 text-center text-xs text-muted">
                        Showing first {PREVIEW_MAX_ROWS} of {previewData.rows.length} rows. All rows will be inserted.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <ModalFooter className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            The table will be inserted as a static snapshot
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="glass-btn h-9 px-4 text-[13px]"
            >
              Cancel
            </button>
            <button
              onClick={handleInsert}
              disabled={!selectedSheet || !previewData}
              className="glass-btn-primary h-9 px-4 text-[13px]"
            >
              Insert Table
            </button>
          </div>
        </ModalFooter>
    </BaseModal>
  )
}
