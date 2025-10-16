'use client'

import { useState } from 'react'
import { FolderNode } from '@/lib/folders'
import { Folder, FolderOpen, ChevronRight, Plus, Edit2, Trash2, FileStack, FolderPlus } from 'lucide-react'

interface FolderTreeProps {
  folders: FolderNode[]
  selectedFolderId: string | null
  onSelectFolder: (folderId: string | null) => void
  onCreateFolder: (parentId: string | null) => void
  onRenameFolder: (folderId: string, newName: string) => void
  onDeleteFolder: (folderId: string) => void
  onMoveFolder?: (folderId: string, newParentId: string | null) => void
}

export default function FolderTree({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
}: FolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folderId: string } | null>(null)

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId)
    } else {
      newExpanded.add(folderId)
    }
    setExpandedFolders(newExpanded)
  }

  const startEditing = (folder: FolderNode) => {
    setEditingFolderId(folder.id)
    setEditingName(folder.name)
    setContextMenu(null)
  }

  const saveEdit = () => {
    if (editingFolderId && editingName.trim()) {
      onRenameFolder(editingFolderId, editingName.trim())
    }
    setEditingFolderId(null)
    setEditingName('')
  }

  const handleContextMenu = (e: React.MouseEvent, folderId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, folderId })
  }

  const handleDeleteFolder = (folderId: string) => {
    if (confirm('Delete this folder? Notes inside will be moved to root.')) {
      onDeleteFolder(folderId)
    }
    setContextMenu(null)
  }

  const renderFolder = (folder: FolderNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id)
    const isSelected = selectedFolderId === folder.id
    const isEditing = editingFolderId === folder.id
    const hasChildren = folder.children.length > 0

    return (
      <div key={folder.id} className="select-none">
        <div
          className={`
            flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-lg group
            transition-all duration-150
            ${isSelected ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 shadow-sm' : 'text-gray-700 hover:bg-gray-50'}
          `}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => !isEditing && onSelectFolder(folder.id)}
          onContextMenu={(e) => handleContextMenu(e, folder.id)}
        >
          {/* Expand/Collapse icon */}
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleFolder(folder.id)
              }}
              className="p-0.5 hover:bg-white/50 rounded transition-colors"
            >
              <ChevronRight
                size={16}
                className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
              />
            </button>
          )}
          {!hasChildren && <div className="w-5" />}

          {/* Folder icon */}
          {isExpanded ? (
            <FolderOpen size={16} className="flex-shrink-0 text-blue-500" />
          ) : (
            <Folder size={16} className="flex-shrink-0 text-gray-500" />
          )}

          {/* Folder name or input */}
          {isEditing ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') {
                  setEditingFolderId(null)
                  setEditingName('')
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 px-2 py-0.5 text-sm border border-blue-500 rounded-md outline-none focus:ring-2 focus:ring-blue-200"
              autoFocus
            />
          ) : (
            <span className="flex-1 text-sm truncate font-medium">{folder.name}</span>
          )}

          {/* Actions (show on hover) */}
          <div className="hidden group-hover:flex items-center gap-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCreateFolder(folder.id)
              }}
              className="p-1 hover:bg-white rounded transition-colors"
              title="New subfolder"
            >
              <Plus size={14} className="text-gray-600" />
            </button>
          </div>
        </div>

        {/* Child folders */}
        {isExpanded && hasChildren && (
          <div>
            {folder.children.map((child) => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      {/* All Notes (root) */}
      <div
        className={`
          flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-lg mb-1
          transition-all duration-150
          ${selectedFolderId === null ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 shadow-sm' : 'text-gray-700 hover:bg-gray-50'}
        `}
        onClick={() => onSelectFolder(null)}
      >
        <FileStack size={16} className={selectedFolderId === null ? 'text-blue-600' : 'text-gray-500'} />
        <span className="flex-1 text-sm font-semibold">All Notes</span>
      </div>

      {/* Folder tree */}
      <div className="mt-2">
        {folders.map((folder) => renderFolder(folder))}
      </div>

      {/* New folder button */}
      <button
        onClick={() => onCreateFolder(null)}
        className="w-full mt-3 px-2 py-1.5 text-sm text-gray-600 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 rounded-lg transition-all duration-150 flex items-center gap-2 border border-transparent hover:border-gray-200 hover:shadow-sm"
      >
        <FolderPlus size={16} />
        <span className="font-medium">New Folder</span>
      </button>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-20 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                const folder = findFolder(folders, contextMenu.folderId)
                if (folder) startEditing(folder)
              }}
              className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
            >
              <Edit2 size={16} />
              <span className="font-medium">Rename</span>
            </button>
            <button
              onClick={() => onCreateFolder(contextMenu.folderId)}
              className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
            >
              <FolderPlus size={16} />
              <span className="font-medium">New Subfolder</span>
            </button>
            <div className="border-t border-gray-200 my-1" />
            <button
              onClick={() => handleDeleteFolder(contextMenu.folderId)}
              className="w-full px-3 py-2 text-sm text-left hover:bg-red-50 text-red-600 flex items-center gap-2 transition-colors"
            >
              <Trash2 size={16} />
              <span className="font-medium">Delete</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Helper function to find a folder in the tree
function findFolder(folders: FolderNode[], folderId: string): FolderNode | null {
  for (const folder of folders) {
    if (folder.id === folderId) return folder
    if (folder.children.length > 0) {
      const found = findFolder(folder.children, folderId)
      if (found) return found
    }
  }
  return null
}
