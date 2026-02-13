'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { X, Search, Table2, Folder } from 'lucide-react'
import { getNotes } from '@/lib/notes'
import { getFolders } from '@/lib/folders'
import type { Note } from '@/lib/notes'
import type { Folder as FolderType } from '@/lib/folders'
import type { DataSheetData } from './DataSheetEditor'
import type { DataSheetTablePayload } from '@/lib/editor/dataSheetTableBlock'

interface DataSheetPickerDialogProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (payload: DataSheetTablePayload) => void
  currentNoteId?: string
}

/** Column letter helper (same as DataSheetEditor) */
function columnIndexToLetter(index: number): string {
  let result = ''
  let n = index
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

/** Simple formula resolver for snapshot — evaluates formulas to display values */
function resolveCell(raw: string, rows: string[][], visited = new Set<string>()): string {
  if (!raw || !raw.startsWith('=')) return raw
  try {
    const expr = raw.slice(1).trim()
    // Very simple: resolve cell references and do basic math
    const resolved = expr.replace(/([A-Z]+)(\d+)/gi, (_, letters, rowNumStr) => {
      const colNum = letters.toUpperCase().split('').reduce((acc: number, ch: string) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1
      const rowNum = parseInt(rowNumStr, 10) - 1
      const key = `${rowNum},${colNum}`
      if (visited.has(key)) return '0'
      if (rowNum < 0 || rowNum >= rows.length || colNum < 0 || colNum >= (rows[0]?.length ?? 0)) return '0'
      const v = rows[rowNum][colNum]
      if (v.startsWith('=')) {
        const next = new Set(visited)
        next.add(key)
        return resolveCell(v, rows, next)
      }
      return v || '0'
    })
    // Try basic arithmetic eval via Function (safe enough for number-only expressions)
    const num = Number(resolved)
    if (!isNaN(num)) return String(num)
    return raw // Can't resolve, show raw
  } catch {
    return raw
  }
}

/** Parse a DataSheetData JSON and produce resolved display rows */
function resolveSheetData(sheetData: DataSheetData): { columns: string[]; rows: string[][]; headerRows?: number[] } {
  const columns = sheetData.columns.map(c => c.name)
  const resolvedRows = sheetData.rows.map(row =>
    row.map((cell, ci) => resolveCell(cell, sheetData.rows))
  )
  return { columns, rows: resolvedRows, headerRows: sheetData.headerRows }
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
          getNotes(),
          getFolders(),
        ])
        // Only show data-sheet notes
        setNotes(notesData.filter(n => n.note_type === 'data-sheet'))
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

    const payload: DataSheetTablePayload = {
      sourceNoteId: selectedSheet.id,
      sourceNoteTitle: selectedSheet.title || 'Data Sheet',
      columns: previewData.columns,
      rows: previewData.rows,
      headerRows: previewData.headerRows,
      snapshotAt: new Date().toISOString(),
    }

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Table2 size={20} className="text-alpine-600" />
            <h2 className="text-lg font-semibold">Insert Data Sheet Table</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: sheet list */}
          <div className="w-72 border-r border-gray-200 flex flex-col">
            {/* Search */}
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder="Search data sheets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-alpine-500"
                  autoFocus
                />
              </div>
            </div>

            {/* Sheet list */}
            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
                  Loading data sheets...
                </div>
              ) : filteredNotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                  <Table2 size={36} className="mb-2 text-gray-300" />
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
                        className={`w-full text-left p-2.5 rounded-lg transition-colors ${
                          isSelected
                            ? 'bg-alpine-50 border border-alpine-300'
                            : 'border border-transparent hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Table2
                            size={16}
                            className={`flex-shrink-0 ${isSelected ? 'text-alpine-600' : 'text-gray-400'}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 text-sm truncate">
                              {note.title || 'Untitled Data Sheet'}
                            </div>
                            {folderName && (
                              <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
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
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
                <Table2 size={48} className="mb-3 text-gray-200" />
                <p className="text-sm font-medium">Select a data sheet</p>
                <p className="text-xs mt-1">A preview of the table will appear here</p>
              </div>
            ) : !previewData ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 p-8">
                <p className="text-sm">Could not parse data sheet content</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Preview header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">
                      {selectedSheet.title || 'Untitled Data Sheet'}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {previewData.columns.length} columns × {previewData.rows.length} rows
                    </p>
                  </div>
                </div>

                {/* Table preview */}
                <div className="flex-1 overflow-auto p-4">
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {previewData.columns.map((col, ci) => (
                            <th
                              key={ci}
                              className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-100 last:border-r-0"
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
                              className={`border-b border-gray-100 last:border-b-0 ${
                                isHeaderRow
                                  ? 'bg-blue-50 font-semibold'
                                  : ri % 2 === 0
                                    ? 'bg-white'
                                    : 'bg-gray-50/50'
                              }`}
                            >
                              {previewData.columns.map((_, ci) => (
                                <td
                                  key={ci}
                                  className="px-3 py-1.5 text-gray-700 border-r border-gray-100 last:border-r-0 whitespace-nowrap"
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
                      <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 text-center">
                        Showing first {PREVIEW_MAX_ROWS} of {previewData.rows.length} rows. All rows will be inserted.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500">
            The table will be inserted as a static snapshot
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInsert}
              disabled={!selectedSheet || !previewData}
              className="px-4 py-2 text-sm font-medium text-white bg-alpine-600 rounded-lg hover:bg-alpine-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Insert Table
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
