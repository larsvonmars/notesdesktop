'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Upload,
  FolderPlus,
  Trash2,
  Download,
  ChevronRight,
  Home,
  Grid3x3,
  List,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileIcon,
  File,
  Music,
  Video,
  Archive,
  Eye,
  MoreVertical,
  ArrowLeft,
  Search,
  Loader2,
  Check,
  FolderOpen,
  AlertCircle,
  RefreshCw,
  Pencil,
} from 'lucide-react'
import ModalCloseButton from './ModalCloseButton'
import BaseModal, { ModalHeader } from './BaseModal'
import {
  listItems,
  uploadFiles,
  deleteFile,
  deleteFiles,
  deleteStorageFolder,
  createStorageFolder,
  getFileUrl,
  triggerDownload,
  renameFile,
  formatFileSize,
  isPreviewableImage,
  isPreviewablePdf,
  isPreviewableText,
  getFileIconHint,
  type StorageItem,
} from '@/lib/file-storage'
import { useToast } from '@/components/ToastProvider'

// ============================================================================
// TYPES
// ============================================================================

export interface FileExplorerModalProps {
  isOpen: boolean
  onClose: () => void
  /** When set, enables "select" mode — the user can pick files to attach */
  onSelectFiles?: (files: Array<{ name: string; path: string; size: number; type: string }>) => void
  /** Title override */
  title?: string
  /** Initial folder path shown when modal opens */
  initialPath?: string
  /** Optional folder path to always use as upload target */
  uploadPath?: string
  /** Render as a full view (no overlay) */
  asView?: boolean
}

type ViewMode = 'grid' | 'list'

interface PreviewState {
  url: string
  name: string
  type: string
  path: string
}

// ============================================================================
// ICON HELPER
// ============================================================================

function FileTypeIcon({ mimeType, size = 20 }: { mimeType: string; size?: number }) {
  const hint = getFileIconHint(mimeType)
  const props = { size, strokeWidth: 1.5 }
  switch (hint) {
    case 'image':
      return <FileImage {...props} className="text-pink-500" />
    case 'pdf':
      return <FileText {...props} className="text-red-500" />
    case 'text':
      return <FileText {...props} className="text-blue-500" />
    case 'spreadsheet':
      return <FileSpreadsheet {...props} className="text-green-600" />
    case 'presentation':
      return <FileIcon {...props} className="text-orange-500" />
    case 'audio':
      return <Music {...props} className="text-purple-500" />
    case 'video':
      return <Video {...props} className="text-indigo-500" />
    case 'archive':
      return <Archive {...props} className="text-yellow-600" />
    default:
      return <File {...props} className="text-gray-400 dark:text-slate-500" />
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function FileExplorerModal({
  isOpen,
  onClose,
  onSelectFiles,
  title = 'File Explorer',
  initialPath = '',
  uploadPath,
  asView = false,
}: FileExplorerModalProps) {
  const toast = useToast()

  // Navigation
  const [currentPath, setCurrentPath] = useState('')
  const [items, setItems] = useState<StorageItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // View
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')

  // Selection (for multi-select in attach mode)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  // Upload
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Folder creation
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const newFolderInputRef = useRef<HTMLInputElement>(null)

  // Rename
  const [renamingItem, setRenamingItem] = useState<string | null>(null) // path of item being renamed
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Preview
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [previewTextContent, setPreviewTextContent] = useState<string | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: StorageItem } | null>(null)

  // ============================================================================
  // BREADCRUMB
  // ============================================================================

  const breadcrumbs = useMemo(() => {
    if (!currentPath) return []
    return currentPath.split('/').filter(Boolean)
  }, [currentPath])

  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path)
    setSelectedPaths(new Set())
    setSearchQuery('')
    setContextMenu(null)
    setPreview(null)
  }, [])

  const navigateUp = useCallback(() => {
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    navigateTo(parts.join('/'))
  }, [currentPath, navigateTo])

  // ============================================================================
  // LOAD DATA
  // ============================================================================

  const loadItems = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await listItems(currentPath)
      setItems(data)
    } catch (err: any) {
      console.error('Failed to load files:', err)
      setError(err.message || 'Failed to load files')
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [currentPath])

  useEffect(() => {
    if (isOpen) {
      setCurrentPath(initialPath)
      setSelectedPaths(new Set())
      setSearchQuery('')
      setContextMenu(null)
      setPreview(null)
    }
  }, [isOpen, initialPath])

  useEffect(() => {
    if (isOpen) {
      loadItems()
    }
  }, [isOpen, loadItems])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentPath('')
      setSelectedPaths(new Set())
      setSearchQuery('')
      setPreview(null)
      setContextMenu(null)
      setShowNewFolderInput(false)
      setRenamingItem(null)
      setError(null)
    }
  }, [isOpen])

  // ============================================================================
  // FILTERED ITEMS
  // ============================================================================

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase()
    return items.filter((item) => item.name.toLowerCase().includes(q))
  }, [items, searchQuery])

  // ============================================================================
  // UPLOAD HANDLERS
  // ============================================================================

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      if (fileArray.length === 0) return

      setIsUploading(true)
      setUploadProgress({ done: 0, total: fileArray.length })
      try {
        const targetPath = uploadPath ?? currentPath
        await uploadFiles(fileArray, targetPath, (done, total) => {
          setUploadProgress({ done, total })
        })
        toast.push({
          title: 'Upload complete',
          description: `${fileArray.length} file${fileArray.length > 1 ? 's' : ''} uploaded`,
        })
        loadItems()
      } catch (err: any) {
        console.error('Upload failed:', err)
        toast.push({ title: 'Upload failed', description: err.message })
      } finally {
        setIsUploading(false)
        setUploadProgress(null)
      }
    },
    [currentPath, loadItems, toast, uploadPath]
  )

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleUpload(e.target.files)
        e.target.value = '' // Reset so same file can be re-uploaded
      }
    },
    [handleUpload]
  )

  // Drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files)
      }
    },
    [handleUpload]
  )

  // ============================================================================
  // FOLDER CREATION
  // ============================================================================

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim()
    if (!name) return

    // Validate
    if (name.length > 100) {
      toast.push({ title: 'Error', description: 'Folder name is too long (max 100 characters)' })
      return
    }
    if (/[<>:"|?*\\]/.test(name)) {
      toast.push({ title: 'Error', description: 'Folder name contains invalid characters' })
      return
    }
    // Check for duplicates
    if (items.some((i) => i.kind === 'folder' && i.name.toLowerCase() === name.toLowerCase())) {
      toast.push({ title: 'Error', description: 'A folder with this name already exists' })
      return
    }

    try {
      await createStorageFolder(currentPath, name)
      toast.push({ title: 'Folder created', description: name })
      setShowNewFolderInput(false)
      setNewFolderName('')
      loadItems()
    } catch (err: any) {
      console.error('Failed to create folder:', err)
      toast.push({ title: 'Error', description: err.message })
    }
  }, [newFolderName, currentPath, items, loadItems, toast])

  // ============================================================================
  // DELETE
  // ============================================================================

  const handleDeleteItem = useCallback(
    async (item: StorageItem) => {
      const confirmMsg =
        item.kind === 'folder'
          ? `Delete folder "${item.name}" and all its contents?`
          : `Delete "${item.name}"?`
      if (!confirm(confirmMsg)) return

      try {
        if (item.kind === 'folder') {
          await deleteStorageFolder(item.path)
        } else {
          await deleteFile(item.path)
        }
        toast.push({ title: 'Deleted', description: item.name })
        setSelectedPaths((prev) => {
          const next = new Set(prev)
          next.delete(item.path)
          return next
        })
        loadItems()
      } catch (err: any) {
        console.error('Delete failed:', err)
        toast.push({ title: 'Delete failed', description: err.message })
      }
    },
    [loadItems, toast]
  )

  const handleDeleteSelected = useCallback(async () => {
    if (selectedPaths.size === 0) return
    if (!confirm(`Delete ${selectedPaths.size} selected item(s)?`)) return

    try {
      const filePaths = Array.from(selectedPaths).filter((p) => {
        const item = items.find((i) => i.path === p)
        return item?.kind === 'file'
      })
      const folderPaths = Array.from(selectedPaths).filter((p) => {
        const item = items.find((i) => i.path === p)
        return item?.kind === 'folder'
      })

      if (filePaths.length > 0) await deleteFiles(filePaths)
      for (const fp of folderPaths) await deleteStorageFolder(fp)

      toast.push({ title: 'Deleted', description: `${selectedPaths.size} item(s) removed` })
      setSelectedPaths(new Set())
      loadItems()
    } catch (err: any) {
      console.error('Bulk delete failed:', err)
      toast.push({ title: 'Delete failed', description: err.message })
    }
  }, [selectedPaths, items, loadItems, toast])

  // ============================================================================
  // RENAME
  // ============================================================================

  const startRename = useCallback((item: StorageItem) => {
    setRenamingItem(item.path)
    setRenameValue(item.name)
    setContextMenu(null)
    setTimeout(() => renameInputRef.current?.select(), 50)
  }, [])

  const commitRename = useCallback(async () => {
    if (!renamingItem) return
    const newName = renameValue.trim()
    if (!newName || newName === items.find((i) => i.path === renamingItem)?.name) {
      setRenamingItem(null)
      return
    }

    try {
      await renameFile(renamingItem, newName)
      toast.push({ title: 'Renamed', description: newName })
      setRenamingItem(null)
      loadItems()
    } catch (err: any) {
      console.error('Rename failed:', err)
      toast.push({ title: 'Rename failed', description: err.message })
      setRenamingItem(null)
    }
  }, [renamingItem, renameValue, items, loadItems, toast])

  // ============================================================================
  // PREVIEW
  // ============================================================================

  const openPreview = useCallback(async (item: StorageItem) => {
    if (item.kind === 'folder') return
    const mimeType = item.type || ''
    if (!isPreviewableImage(mimeType) && !isPreviewablePdf(mimeType) && !isPreviewableText(mimeType)) {
      // Not previewable — just download
      try {
        await triggerDownload(item.path)
      } catch (err: any) {
        toast.push({ title: 'Download failed', description: err.message })
      }
      return
    }

    try {
      const url = await getFileUrl(item.path)
      setPreview({ url, name: item.name, type: mimeType, path: item.path })

      // For text files, also fetch content
      if (isPreviewableText(mimeType)) {
        const resp = await fetch(url)
        const text = await resp.text()
        setPreviewTextContent(text)
      } else {
        setPreviewTextContent(null)
      }
    } catch (err: any) {
      console.error('Preview failed:', err)
      toast.push({ title: 'Preview failed', description: err.message })
    }
  }, [toast])

  const closePreview = useCallback(() => {
    setPreview(null)
    setPreviewTextContent(null)
  }, [])

  // ============================================================================
  // SELECTION
  // ============================================================================

  const toggleSelection = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleConfirmSelection = useCallback(() => {
    if (!onSelectFiles || selectedPaths.size === 0) return
    const selected = items
      .filter((i) => i.kind === 'file' && selectedPaths.has(i.path))
      .map((i) => ({
        name: i.name,
        path: i.path,
        size: i.size || 0,
        type: i.type || 'application/octet-stream',
      }))
    onSelectFiles(selected)
    onClose()
  }, [onSelectFiles, selectedPaths, items, onClose])

  // ============================================================================
  // ITEM CLICK HANDLER
  // ============================================================================

  const handleItemClick = useCallback(
    (item: StorageItem) => {
      if (item.kind === 'folder') {
        navigateTo(item.path)
      } else if (onSelectFiles) {
        // In select mode, toggle selection
        toggleSelection(item.path)
      } else {
        // In browse mode, open preview
        openPreview(item)
      }
    },
    [navigateTo, onSelectFiles, toggleSelection, openPreview]
  )

  const handleItemDoubleClick = useCallback(
    (item: StorageItem) => {
      if (item.kind === 'folder') {
        navigateTo(item.path)
      } else {
        openPreview(item)
      }
    },
    [navigateTo, openPreview]
  )

  // ============================================================================
  // CONTEXT MENU
  // ============================================================================

  const handleContextMenu = useCallback((e: React.MouseEvent, item: StorageItem) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, item })
  }, [])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  // Focus new folder input
  useEffect(() => {
    if (showNewFolderInput) {
      setTimeout(() => newFolderInputRef.current?.focus(), 50)
    }
  }, [showNewFolderInput])

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!isOpen && !asView) return null

  const isSelectMode = !!onSelectFiles
  const hasSelection = selectedPaths.size > 0
  const uploadPathSegments = (uploadPath ?? '').split('/').filter(Boolean)

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        size="5xl"
        maxHeight="calc(100vh - 3rem)"
        zIndex={100}
        asView={asView}
      >
          {/* ============ HEADER ============ */}
          <ModalHeader onClose={onClose} closeAriaLabel="Close file explorer">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-alpine-100 dark:bg-alpine-900/30">
                <FolderOpen size={18} className="text-alpine-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {isSelectMode ? 'Select files to attach' : 'Manage your uploaded files'}
                </p>
              </div>
            </div>
          </ModalHeader>

          {uploadPathSegments.length > 0 && (
            <div className="border-b border-alpine-100 dark:border-slate-700 bg-alpine-50/60 dark:bg-slate-800/60 px-4 sm:px-5 py-2">
              <div className="flex items-center gap-2 text-xs text-alpine-800 dark:text-alpine-200 overflow-x-auto">
                <span className="font-medium whitespace-nowrap">Folder structure</span>
                <span className="text-alpine-500 dark:text-alpine-300">/</span>
                {uploadPathSegments.map((segment, index) => (
                  <span key={`${segment}-${index}`} className="flex items-center gap-2 whitespace-nowrap">
                    <span className="rounded-md bg-white dark:bg-slate-700 px-2 py-0.5 text-alpine-900 dark:text-alpine-100 border border-alpine-200/70 dark:border-slate-600">
                      {segment}
                    </span>
                    {index < uploadPathSegments.length - 1 && (
                      <span className="text-alpine-500 dark:text-alpine-300">/</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ============ TOOLBAR ============ */}
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-slate-700 px-4 sm:px-5 py-2.5 bg-white dark:bg-slate-900">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-x-auto">
              <button
                onClick={() => navigateTo('')}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-gray-600 dark:text-slate-300 transition hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-100 whitespace-nowrap"
              >
                <Home size={14} />
                <span>Files</span>
              </button>
              {breadcrumbs.map((crumb, idx) => {
                const pathUpToHere = breadcrumbs.slice(0, idx + 1).join('/')
                const isLast = idx === breadcrumbs.length - 1
                return (
                  <span key={pathUpToHere} className="flex items-center gap-1">
                    <ChevronRight size={12} className="text-gray-300 dark:text-slate-600 flex-shrink-0" />
                    <button
                      onClick={() => navigateTo(pathUpToHere)}
                      className={`rounded-md px-2 py-1 transition whitespace-nowrap ${
                        isLast
                          ? 'font-medium text-gray-900 dark:text-slate-100'
                          : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-100'
                      }`}
                      disabled={isLast}
                    >
                      {crumb}
                    </button>
                  </span>
                )
              })}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-1.5 ml-auto">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="h-8 w-32 sm:w-40 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 pl-8 pr-3 text-sm text-gray-700 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 transition focus:border-alpine-400 focus:bg-white dark:focus:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-alpine-400"
                />
              </div>

              <div className="h-5 w-px bg-gray-200 dark:bg-slate-700" />

              {/* View toggle */}
              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className="rounded-lg p-1.5 text-gray-500 dark:text-slate-300 transition hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-100"
                title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
              >
                {viewMode === 'grid' ? <List size={16} /> : <Grid3x3 size={16} />}
              </button>

              <div className="h-5 w-px bg-gray-200 dark:bg-slate-700" />

              {/* New folder */}
              <button
                onClick={() => {
                  setShowNewFolderInput(true)
                  setNewFolderName('')
                }}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-gray-600 dark:text-slate-300 transition hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-800 dark:hover:text-slate-100"
                title="New folder"
              >
                <FolderPlus size={16} />
              </button>

              {/* Upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-1.5 rounded-lg bg-alpine-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-alpine-700 disabled:opacity-50"
                title="Upload files"
              >
                {isUploading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                <span className="hidden sm:inline">Upload</span>
              </button>

              {/* Refresh */}
              <button
                onClick={loadItems}
                className="rounded-lg p-1.5 text-gray-500 dark:text-slate-300 transition hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-100"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {/* New folder input row */}
          {showNewFolderInput && (
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-5 py-2">
              <FolderPlus size={16} className="text-alpine-600 flex-shrink-0" />
              <input
                ref={newFolderInputRef}
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder()
                  if (e.key === 'Escape') {
                    setShowNewFolderInput(false)
                    setNewFolderName('')
                  }
                }}
                placeholder="Folder name..."
                className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-100 px-3 py-1.5 text-sm focus:border-alpine-400 focus:outline-none focus:ring-1 focus:ring-alpine-400"
              />
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="rounded-lg bg-alpine-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-alpine-700 disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowNewFolderInput(false)
                  setNewFolderName('')
                }}
                className="rounded-lg px-2 py-1.5 text-sm text-gray-500 dark:text-slate-300 transition hover:bg-gray-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ============ CONTENT ============ */}
          <div
            className={`flex-1 overflow-y-auto min-h-[300px] ${isDragOver ? 'bg-alpine-50 ring-2 ring-inset ring-alpine-300' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Upload progress */}
            {uploadProgress && (
              <div className="px-5 py-2 bg-alpine-50 border-b border-alpine-100">
                <div className="flex items-center gap-2 text-sm text-alpine-700">
                  <Loader2 size={14} className="animate-spin" />
                  <span>
                    Uploading {uploadProgress.done}/{uploadProgress.total} files...
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-alpine-200">
                  <div
                    className="h-full rounded-full bg-alpine-600 transition-all"
                    style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{error}</span>
                <button onClick={loadItems} className="ml-auto text-red-600 underline hover:no-underline">
                  Retry
                </button>
              </div>
            )}

            {/* Loading */}
            {isLoading && !error && (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-alpine-500" />
              </div>
            )}

            {/* Empty state */}
            {!isLoading && !error && filteredItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center px-5">
                {searchQuery ? (
                  <>
                    <Search size={40} className="text-gray-300 dark:text-slate-600 mb-3" />
                    <p className="text-gray-500 dark:text-slate-400 text-sm">No files matching &ldquo;{searchQuery}&rdquo;</p>
                  </>
                ) : (
                  <>
                    <Upload size={40} className="text-gray-300 dark:text-slate-600 mb-3" />
                    <p className="font-medium text-gray-600 dark:text-slate-300 mb-1">This folder is empty</p>
                    <p className="text-gray-400 dark:text-slate-500 text-sm mb-4">
                      Drag files here or click Upload to add files
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg bg-alpine-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-alpine-700"
                    >
                      Upload Files
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Drag overlay */}
            {isDragOver && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-alpine-50  pointer-events-none">
                <div className="flex flex-col items-center gap-2 text-alpine-700">
                  <Upload size={40} />
                  <p className="font-medium">Drop files to upload</p>
                </div>
              </div>
            )}

            {/* ============ FILE GRID / LIST ============ */}
            {!isLoading && !error && filteredItems.length > 0 && (
              <div className={viewMode === 'grid' ? 'p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3' : 'divide-y divide-gray-100 dark:divide-slate-700'}>
                {/* Back button when inside a folder */}
                {currentPath && viewMode === 'list' && (
                  <button
                    onClick={navigateUp}
                    className="flex items-center gap-3 px-5 py-3 text-sm text-gray-600 dark:text-slate-300 transition hover:bg-gray-50 dark:hover:bg-slate-800 w-full text-left"
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>
                )}
                {currentPath && viewMode === 'grid' && (
                  <button
                    onClick={navigateUp}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 dark:border-slate-700 p-4 text-gray-500 dark:text-slate-400 transition hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-600"
                  >
                    <ArrowLeft size={24} />
                    <span className="text-xs font-medium">Back</span>
                  </button>
                )}

                {filteredItems.map((item) => (
                  viewMode === 'grid' ? (
                    <GridItem
                      key={item.path}
                      item={item}
                      isSelected={selectedPaths.has(item.path)}
                      isSelectMode={isSelectMode}
                      isRenaming={renamingItem === item.path}
                      renameValue={renameValue}
                      renameInputRef={renameInputRef}
                      onRenameChange={setRenameValue}
                      onRenameCommit={commitRename}
                      onRenameCancel={() => setRenamingItem(null)}
                      onClick={() => handleItemClick(item)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      onContextMenu={(e) => handleContextMenu(e, item)}
                      onToggleSelect={() => toggleSelection(item.path)}
                    />
                  ) : (
                    <ListItem
                      key={item.path}
                      item={item}
                      isSelected={selectedPaths.has(item.path)}
                      isSelectMode={isSelectMode}
                      isRenaming={renamingItem === item.path}
                      renameValue={renameValue}
                      renameInputRef={renameInputRef}
                      onRenameChange={setRenameValue}
                      onRenameCommit={commitRename}
                      onRenameCancel={() => setRenamingItem(null)}
                      onClick={() => handleItemClick(item)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      onContextMenu={(e) => handleContextMenu(e, item)}
                      onToggleSelect={() => toggleSelection(item.path)}
                    />
                  )
                ))}
              </div>
            )}
          </div>

          {/* ============ FOOTER ============ */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-4 sm:px-5 py-3">
            <div className="text-xs text-gray-500 dark:text-slate-400">
              {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
              {hasSelection && ` · ${selectedPaths.size} selected`}
            </div>
            <div className="flex items-center gap-2">
              {hasSelection && !isSelectMode && (
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-red-600 dark:text-red-300 transition hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <Trash2 size={14} />
                  <span>Delete Selected</span>
                </button>
              )}
              {isSelectMode && (
                <>
                  <button
                    onClick={onClose}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 dark:text-slate-300 transition hover:bg-gray-200 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmSelection}
                    disabled={selectedPaths.size === 0}
                    className="flex items-center gap-1.5 rounded-lg bg-alpine-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-alpine-700 disabled:opacity-50"
                  >
                    <Check size={14} />
                    <span>Attach {selectedPaths.size > 0 ? `(${selectedPaths.size})` : ''}</span>
                  </button>
                </>
              )}
              {!isSelectMode && (
                <button
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 dark:text-slate-300 transition hover:bg-gray-200 dark:hover:bg-slate-700"
                >
                  Close
                </button>
              )}
            </div>
          </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />
      </BaseModal>

      {/* ============ CONTEXT MENU ============ */}
      {contextMenu && (
        <div
          className="fixed z-[110] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 py-1.5 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.item.kind === 'file' && (
            <>
              <button
                onClick={() => {
                  openPreview(contextMenu.item)
                  setContextMenu(null)
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-slate-200 transition hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                <Eye size={15} />
                <span>Preview</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    await triggerDownload(contextMenu.item.path)
                  } catch (err: any) {
                    toast.push({ title: 'Download failed', description: err.message })
                  }
                  setContextMenu(null)
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-slate-200 transition hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                <Download size={15} />
                <span>Download</span>
              </button>
              <button
                onClick={() => startRename(contextMenu.item)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-slate-200 transition hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                <Pencil size={15} />
                <span>Rename</span>
              </button>
            </>
          )}
          {contextMenu.item.kind === 'folder' && (
            <button
              onClick={() => {
                navigateTo(contextMenu.item.path)
                setContextMenu(null)
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-slate-200 transition hover:bg-gray-50 dark:hover:bg-slate-800"
            >
              <FolderOpen size={15} />
              <span>Open</span>
            </button>
          )}
          <div className="my-1 border-t border-gray-100 dark:border-slate-700" />
          <button
            onClick={() => {
              handleDeleteItem(contextMenu.item)
              setContextMenu(null)
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 transition hover:bg-red-50"
          >
            <Trash2 size={15} />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* ============ PREVIEW OVERLAY ============ */}
      {preview && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 sm:p-8"
          onClick={closePreview}
        >
          <div
            className="relative flex max-h-[90vh] max-w-5xl w-full flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-5 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileTypeIcon mimeType={preview.type} size={18} />
                <span className="truncate font-medium text-gray-900 dark:text-slate-100">{preview.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      await triggerDownload(preview.path)
                    } catch (err: any) {
                      toast.push({ title: 'Download failed', description: err.message })
                    }
                  }}
                  className="rounded-lg p-2 text-gray-500 dark:text-slate-300 transition hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-100"
                  title="Download"
                >
                  <Download size={18} />
                </button>
                <ModalCloseButton
                  onClick={closePreview}
                  ariaLabel="Close file preview"
                  className="text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200"
                  size={18}
                />
              </div>
            </div>
            {/* Preview content */}
            <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-50 dark:bg-slate-800 p-4">
              {isPreviewableImage(preview.type) && (
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-md"
                />
              )}
              {isPreviewablePdf(preview.type) && (
                <iframe
                  src={preview.url}
                  title={preview.name}
                  className="h-[70vh] w-full rounded-lg border border-gray-200 dark:border-slate-700"
                />
              )}
              {isPreviewableText(preview.type) && previewTextContent !== null && (
                <pre className="w-full max-h-[70vh] overflow-auto rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-sm text-gray-800 dark:text-slate-100 font-mono whitespace-pre-wrap">
                  {previewTextContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================================
// GRID ITEM
// ============================================================================

interface ItemProps {
  item: StorageItem
  isSelected: boolean
  isSelectMode: boolean
  isRenaming: boolean
  renameValue: string
  renameInputRef: React.RefObject<HTMLInputElement>
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onClick: () => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onToggleSelect: () => void
}

function GridItem({
  item,
  isSelected,
  isSelectMode,
  isRenaming,
  renameValue,
  renameInputRef,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onClick,
  onDoubleClick,
  onContextMenu,
  onToggleSelect,
}: ItemProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  // Load image thumbnail for grid view
  useEffect(() => {
    if (item.kind === 'file' && isPreviewableImage(item.type || '')) {
      let cancelled = false
      getFileUrl(item.path).then((url) => {
        if (!cancelled) setThumbUrl(url)
      }).catch(() => {})
      return () => { cancelled = true }
    }
  }, [item])

  return (
    <div
      className={`group relative flex flex-col items-center justify-center gap-2 rounded-xl border p-3 cursor-pointer transition-all ${
        isSelected
          ? 'border-alpine-400 bg-alpine-50 ring-1 ring-alpine-300'
          : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800'
      }`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Select checkbox */}
      {isSelectMode && item.kind === 'file' && (
        <button
          className={`absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-md border transition ${
            isSelected
              ? 'border-alpine-500 bg-alpine-600 text-white'
              : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-transparent hover:border-gray-400 dark:hover:border-slate-500'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
        >
          <Check size={12} />
        </button>
      )}

      {/* Thumbnail / Icon */}
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg">
        {item.kind === 'folder' ? (
          <FolderOpen size={32} className="text-amber-500" />
        ) : thumbUrl ? (
          <img src={thumbUrl} alt={item.name} className="h-full w-full rounded-lg object-cover" />
        ) : (
          <FileTypeIcon mimeType={item.type || ''} size={32} />
        )}
      </div>

      {/* Name */}
      {isRenaming ? (
        <input
          ref={renameInputRef}
          type="text"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit()
            if (e.key === 'Escape') onRenameCancel()
          }}
          onBlur={onRenameCommit}
          className="w-full rounded border border-alpine-300 px-1.5 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-alpine-400"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="w-full truncate text-center text-xs font-medium text-gray-700 dark:text-slate-200" title={item.name}>
          {item.name}
        </span>
      )}

      {/* Size for files */}
      {item.kind === 'file' && item.size !== undefined && (
        <span className="text-[10px] text-gray-400 dark:text-slate-500">{formatFileSize(item.size)}</span>
      )}

      {/* Hover actions */}
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition">
        <button
          className="rounded-md p-1 text-gray-400 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-100"
          onClick={(e) => {
            e.stopPropagation()
            onContextMenu(e)
          }}
        >
          <MoreVertical size={14} />
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// LIST ITEM
// ============================================================================

function ListItem({
  item,
  isSelected,
  isSelectMode,
  isRenaming,
  renameValue,
  renameInputRef,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onClick,
  onDoubleClick,
  onContextMenu,
  onToggleSelect,
}: ItemProps) {
  return (
    <div
      className={`group flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors ${
        isSelected ? 'bg-alpine-50 dark:bg-alpine-900/25' : 'hover:bg-gray-50 dark:hover:bg-slate-800'
      }`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Select checkbox */}
      {isSelectMode && item.kind === 'file' && (
        <button
          className={`flex h-5 w-5 items-center justify-center rounded-md border transition flex-shrink-0 ${
            isSelected
              ? 'border-alpine-500 bg-alpine-600 text-white'
              : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-transparent hover:border-gray-400 dark:hover:border-slate-500'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
        >
          <Check size={12} />
        </button>
      )}

      {/* Icon */}
      <div className="flex-shrink-0">
        {item.kind === 'folder' ? (
          <FolderOpen size={20} className="text-amber-500" />
        ) : (
          <FileTypeIcon mimeType={item.type || ''} size={20} />
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit()
              if (e.key === 'Escape') onRenameCancel()
            }}
            onBlur={onRenameCommit}
            className="w-full rounded border border-alpine-300 px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-alpine-400"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate text-sm font-medium text-gray-800 dark:text-slate-100">{item.name}</span>
        )}
      </div>

      {/* Meta */}
      {item.kind === 'file' && (
        <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">
          <span>{formatFileSize(item.size || 0)}</span>
          {item.updated_at && (
            <span className="hidden sm:inline">
              {new Date(item.updated_at).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
      {item.kind === 'folder' && (
        <ChevronRight size={16} className="text-gray-300 dark:text-slate-600 flex-shrink-0" />
      )}

      {/* Hover actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
        <button
          className="rounded-md p-1 text-gray-400 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-100"
          onClick={(e) => {
            e.stopPropagation()
            onContextMenu(e)
          }}
        >
          <MoreVertical size={14} />
        </button>
      </div>
    </div>
  )
}
