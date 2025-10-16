'use client'

import { Note } from './NoteEditor'
import { FileText, Plus, Clock, Pencil, PenTool, Network } from 'lucide-react'

interface NotesListProps {
  notes: Note[]
  selectedNoteId?: string | null
  onSelectNote: (note: Note) => void
  onNewNote: () => void
  isLoading?: boolean
  currentFolderName?: string
}

export default function NotesList({
  notes,
  selectedNoteId,
  onSelectNote,
  onNewNote,
  isLoading = false,
  currentFolderName,
}: NotesListProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInHours = diffInMs / (1000 * 60 * 60)

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })
    } else if (diffInHours < 48) {
      return 'Yesterday'
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString('en-US', { weekday: 'long' })
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      })
    }
  }

  const truncateText = (text: string, maxLength: number = 60) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength).trim() + '...'
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FileText size={20} className="text-blue-600" />
            {currentFolderName || 'All Notes'}
          </h2>
          <button
            onClick={onNewNote}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all duration-150 shadow-sm hover:shadow active:scale-95"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">New Note</span>
          </button>
        </div>
        
        <div className="text-sm text-gray-600 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 flex items-center gap-2">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-blue-600"></div>
              Loading notes...
            </div>
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-blue-100 rounded-full blur-xl opacity-50"></div>
              <FileText size={64} className="relative text-gray-300" strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No notes yet</h3>
            <p className="text-gray-500 mb-4 max-w-xs">Create your first note to get started with your collection</p>
            <button
              onClick={onNewNote}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all duration-150 shadow-sm hover:shadow active:scale-95"
            >
              <Plus size={18} />
              Create Note
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {notes.map((note) => (
              <li
                key={note.id}
                onClick={() => onSelectNote(note)}
                className={`
                  p-4 cursor-pointer transition-all duration-150 group
                  ${selectedNoteId === note.id 
                    ? 'bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-600 shadow-sm' 
                    : 'border-l-4 border-transparent hover:bg-gray-50 hover:border-gray-200'}
                `}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {note.note_type === 'drawing' ? (
                        <PenTool size={16} className="text-purple-600 flex-shrink-0" />
                      ) : note.note_type === 'mindmap' ? (
                        <Network size={16} className="text-green-600 flex-shrink-0" />
                      ) : (
                        <FileText size={16} className="text-blue-600 flex-shrink-0" />
                      )}
                      <h3 className="font-semibold text-gray-900 line-clamp-1">
                        {note.title || 'Untitled Note'}
                      </h3>
                    </div>
                    {selectedNoteId === note.id && (
                      <Pencil size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                  
                  {note.content && note.note_type !== 'drawing' && note.note_type !== 'mindmap' && (
                    <p className="text-sm text-gray-600 line-clamp-2 pl-6">
                      {truncateText(note.content.replace(/<[^>]*>/g, ''), 100)}
                    </p>
                  )}
                  {note.note_type === 'drawing' && (
                    <p className="text-sm text-gray-500 italic pl-6">
                      Drawing note
                    </p>
                  )}
                  {note.note_type === 'mindmap' && (
                    <p className="text-sm text-gray-500 italic pl-6">
                      Mindmap
                    </p>
                  )}
                  
                  <div className="flex items-center gap-2 mt-1 pl-6">
                    <Clock size={12} className="text-gray-400" />
                    <span className="text-xs text-gray-500">
                      {formatDate(note.updated_at)}
                    </span>
                    {note.created_at !== note.updated_at && (
                      <span className="text-xs text-gray-400">· edited</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
