'use client'

import { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue, useLayoutEffect } from 'react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  CheckSquare,
  Undo,
  Redo,
  Save,
  Trash2,
  X,
  Heading1,
  Heading2,
  Heading3,
  ListTree,
  Link as LinkIcon,
  Search,
  PenTool,
  Check,
  Loader2,
  FolderOpen,
  Target,
  Edit2,
  Network
} from 'lucide-react'
import RichTextEditor, {
  type RichTextCommand,
  type RichTextEditorHandle
} from './RichTextEditor'
import DrawingEditor, {
  type DrawingEditorHandle,
  type DrawingData
} from './DrawingEditor'
import MindmapEditor, {
  type MindmapEditorHandle,
  type MindmapData
} from './MindmapEditor'
import UnifiedPanel from './UnifiedPanel'
import ProjectsWorkspaceModal from './ProjectsWorkspaceModal'
import { useToast } from './ToastProvider'
import { Note as LibNote } from '../lib/notes'
import NoteLinkDialog from './NoteLinkDialog'
import KnowledgeGraphModal from './KnowledgeGraphModal'
import { noteLinkBlock, registerNoteLinkCommand } from '../lib/editor/noteLinkBlock'
import { FileText } from 'lucide-react'

export type { Note } from '../lib/notes'

interface NoteEditorProps {
  note?: LibNote | null
  // `isAuto` will be passed when the editor triggers an autosave so parents can handle it differently
  onSave: (
    note: { title: string; content: string; note_type?: 'rich-text' | 'drawing' | 'mindmap' },
    isAuto?: boolean
  ) => Promise<void>
  onCancel?: () => void
  onDelete?: (id: string) => Promise<void>
  initialNoteType?: 'rich-text' | 'drawing' | 'mindmap'
}

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim()

const commandShortcuts: Record<RichTextCommand, string> = {
  bold: '⌘/Ctrl+B',
  italic: '⌘/Ctrl+I',
  underline: '⌘/Ctrl+U',
  strike: '⌘/Ctrl+⇧+X',
  code: '⌘/Ctrl+`',
  'unordered-list': '⌘/Ctrl+⇧+L',
  'ordered-list': '⌘/Ctrl+⇧+O',
  blockquote: '⌘/Ctrl+⇧+B',
  checklist: '⌘/Ctrl+⇧+C',
  heading1: '⌘/Ctrl+Alt+1',
  heading2: '⌘/Ctrl+Alt+2',
  heading3: '⌘/Ctrl+Alt+3',
  link: '⌘/Ctrl+K',
  'horizontal-rule': '',
  undo: '⌘/Ctrl+Z',
  redo: '⌘/Ctrl+⇧+Z'
}

interface NoteEditorWithPanelProps extends NoteEditorProps {
  folders?: any[]
  selectedFolderId?: string | null
  onSelectFolder?: (folderId: string | null) => void
  onCreateFolder?: (parentId: string | null) => void
  onRenameFolder?: (folderId: string, newName: string) => void
  onDeleteFolder?: (folderId: string) => void
  onMoveFolder?: (folderId: string, newParentId: string | null) => void
  notes?: LibNote[]
  onSelectNote?: (note: LibNote) => void
  onNewNote?: (noteType?: 'rich-text' | 'drawing' | 'mindmap', folderId?: string | null, projectId?: string | null) => void
  onDuplicateNote?: (note: LibNote) => void
  onMoveNote?: (noteId: string, newFolderId: string | null) => Promise<void>
  isLoadingNotes?: boolean
  currentFolderName?: string
  userEmail?: string
  onSignOut?: () => void
  autoOpenPanelKey?: string | number
}

export default function NoteEditor({ 
  note, 
  onSave, 
  onCancel, 
  onDelete,
  initialNoteType = 'rich-text',
  folders = [],
  selectedFolderId = null,
  onSelectFolder = () => {},
  onCreateFolder = () => {},
  onRenameFolder = () => {},
  onDeleteFolder = () => {},
  onMoveFolder,
  notes = [],
  onSelectNote = () => {},
  onNewNote = () => {},
  onDuplicateNote,
  onMoveNote,
  isLoadingNotes = false,
  currentFolderName,
  userEmail,
  onSignOut,
  autoOpenPanelKey,
}: NoteEditorWithPanelProps) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [drawingData, setDrawingData] = useState<DrawingData | null>(null)
  const [mindmapData, setMindmapData] = useState<MindmapData | null>(null)
  const [noteType, setNoteType] = useState<'rich-text' | 'drawing' | 'mindmap'>('rich-text')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showTOC, setShowTOC] = useState(false)
  const [headings, setHeadings] = useState<Array<{ id: string; level: number; text: string }>>([])
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const editorRef = useRef<RichTextEditorHandle | null>(null)
  const drawingEditorRef = useRef<DrawingEditorHandle | null>(null)
  const mindmapEditorRef = useRef<MindmapEditorHandle | null>(null)
  const headingUpdateTimeoutRef = useRef<number | null>(null)
  const autosaveTimeoutRef = useRef<number | null>(null)
  const isAutosavingRef = useRef(false)
  const activeFormatsFrameRef = useRef<number | null>(null)
  const floatingToolbarRef = useRef<HTMLDivElement | null>(null)
  const floatingToolbarSizeRef = useRef({ width: 0, height: 0 })
  const [floatingToolbar, setFloatingToolbar] = useState({ visible: false, top: 0, left: 0 })
  const deferredContent = useDeferredValue(content)
  const plainContent = useMemo(() => stripHtml(deferredContent), [deferredContent])
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null)
  const [wordGoal, setWordGoal] = useState<number | null>(null)
  const [showWordGoalInput, setShowWordGoalInput] = useState(false)
  const wordGoalInputRef = useRef<HTMLInputElement>(null)
  const [showNoteLinkDialog, setShowNoteLinkDialog] = useState(false)
  const savedNoteLinkSelection = useRef<Range | null>(null)
  const [showKnowledgeGraph, setShowKnowledgeGraph] = useState(false)
  const [showProjectsModal, setShowProjectsModal] = useState(false)

  const scheduleHeadingsUpdate = useCallback(() => {
    if (headingUpdateTimeoutRef.current !== null) {
      window.clearTimeout(headingUpdateTimeoutRef.current)
    }

    headingUpdateTimeoutRef.current = window.setTimeout(() => {
      const newHeadings = editorRef.current?.getHeadings() ?? []
      setHeadings((previous) => {
        if (
          previous.length === newHeadings.length &&
          previous.every((item, index) => {
            const next = newHeadings[index]
            return (
              next && item.id === next.id && item.level === next.level && item.text === next.text
            )
          })
        ) {
          return previous
        }
        return newHeadings
      })
    }, 150)
  }, [])

  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setNoteType(note.note_type || 'rich-text')
      
      if (note.note_type === 'drawing') {
        // Parse drawing data from content
        try {
          const data = JSON.parse(note.content || '{}')
          // Migrate old format to new multi-page format
          if (data.strokes && !data.pages) {
            const migratedData = {
              pages: [{ strokes: data.strokes, background: data.background || 'none' }],
              width: data.width || 800,
              height: data.height || 600,
              currentPage: 0
            }
            setDrawingData(migratedData)
          } else {
            setDrawingData(data)
          }
          setContent('')
          setMindmapData(null)
        } catch {
          setDrawingData({ pages: [{ strokes: [], background: 'none' }], width: 800, height: 600, currentPage: 0 })
          setContent('')
          setMindmapData(null)
        }
      } else if (note.note_type === 'mindmap') {
        // Parse mindmap data from content
        try {
          const data = JSON.parse(note.content || '{}')
          setMindmapData(data)
          setContent('')
          setDrawingData(null)
        } catch {
          // Create default mindmap if parsing fails
          const rootId = 'root'
          setMindmapData({
            rootId,
            nodes: {
              [rootId]: {
                id: rootId,
                text: 'Central Idea',
                x: 400,
                y: 300,
                parentId: null,
                children: [],
                collapsed: false,
                color: '#3B82F6',
                description: '',
                attachments: [],
              },
            },
          })
          setContent('')
          setDrawingData(null)
        }
      } else {
        setContent(note.content || '')
        setDrawingData(null)
        setMindmapData(null)
      }
      
      setHasChanges(false)
      scheduleHeadingsUpdate()
      
      // Load word goal from localStorage for this note
      if (note.id) {
        const savedGoal = localStorage.getItem(`wordGoal_${note.id}`)
        setWordGoal(savedGoal ? parseInt(savedGoal, 10) : null)
      }
    } else {
      setTitle('')
      setContent('')
      setDrawingData(initialNoteType === 'drawing' ? { pages: [{ strokes: [], background: 'none' }], width: 800, height: 600, currentPage: 0 } : null)
      setMindmapData(initialNoteType === 'mindmap' ? {
        rootId: 'root',
        nodes: {
          root: {
            id: 'root',
            text: 'Central Idea',
            x: 400,
            y: 300,
            parentId: null,
            children: [],
            collapsed: false,
            color: '#3B82F6',
            description: '',
            attachments: [],
          },
        },
      } : null)
      setNoteType(initialNoteType)
      setHasChanges(false)
      setHeadings([])
      setWordGoal(null)
    }
    setActiveFormats(new Set())
  }, [note, initialNoteType, scheduleHeadingsUpdate])

  useEffect(() => {
    if (note) {
      if (noteType === 'drawing') {
        const currentDrawingStr = JSON.stringify(drawingData)
        const noteDrawingStr = note.content || '{}'
        setHasChanges(title !== note.title || currentDrawingStr !== noteDrawingStr)
      } else if (noteType === 'mindmap') {
        const currentMindmapStr = JSON.stringify(mindmapData)
        const noteMindmapStr = note.content || '{}'
        setHasChanges(title !== note.title || currentMindmapStr !== noteMindmapStr)
      } else {
        setHasChanges(title !== note.title || content !== (note.content || ''))
      }
    } else {
      if (noteType === 'drawing') {
        const totalStrokes = drawingData?.pages.reduce((sum, page) => sum + page.strokes.length, 0) || 0
        setHasChanges(title.trim() !== '' || totalStrokes > 0)
      } else if (noteType === 'mindmap') {
        const nodeCount = mindmapData ? Object.keys(mindmapData.nodes).length : 0
        setHasChanges(title.trim() !== '' || nodeCount > 1)
      } else {
        setHasChanges(title.trim() !== '' || plainContent !== '')
      }
    }
  }, [title, content, drawingData, mindmapData, note, plainContent, noteType])

  useEffect(() => {
    return () => {
      if (headingUpdateTimeoutRef.current !== null) {
        window.clearTimeout(headingUpdateTimeoutRef.current)
      }
      if (activeFormatsFrameRef.current !== null) {
        window.cancelAnimationFrame(activeFormatsFrameRef.current)
      }
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
    }
  }, [])

  const updateActiveFormats = useCallback(() => {
    if (!editorRef.current) return
    
    const formats = new Set<string>()
    
    // Check standard formatting commands
    if (editorRef.current.queryCommandState('bold')) formats.add('bold')
    if (editorRef.current.queryCommandState('italic')) formats.add('italic')
    if (editorRef.current.queryCommandState('underline')) formats.add('underline')
    if (editorRef.current.queryCommandState('strikeThrough')) formats.add('strike')
    if (editorRef.current.queryCommandState('insertUnorderedList')) formats.add('unordered-list')
    if (editorRef.current.queryCommandState('insertOrderedList')) formats.add('ordered-list')
    
    setActiveFormats(formats)
  }, [])

  const scheduleActiveFormatsUpdate = useCallback(() => {
    if (activeFormatsFrameRef.current !== null) {
      window.cancelAnimationFrame(activeFormatsFrameRef.current)
    }

    activeFormatsFrameRef.current = window.requestAnimationFrame(() => {
      updateActiveFormats()
      activeFormatsFrameRef.current = null
    })
  }, [updateActiveFormats])

  const hideFloatingToolbar = useCallback(() => {
    floatingToolbarSizeRef.current = { width: 0, height: 0 }
    setFloatingToolbar((previous) =>
      previous.visible ? { ...previous, visible: false } : previous
    )
  }, [])

  const updateFloatingToolbar = useCallback(() => {
    const selection = window.getSelection()
    const editorElement = editorRef.current?.getRootElement()

    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !editorElement) {
      hideFloatingToolbar()
      return
    }

    const anchorNode = selection.anchorNode
    const focusNode = selection.focusNode

    if (
      !anchorNode ||
      !focusNode ||
      !editorElement.contains(anchorNode) ||
      !editorElement.contains(focusNode)
    ) {
      hideFloatingToolbar()
      return
    }

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    if ((rect.width === 0 && rect.height === 0) || Number.isNaN(rect.top) || Number.isNaN(rect.left)) {
      hideFloatingToolbar()
      return
    }

    const MIN_MARGIN = 16
    const SELECTION_GAP = 12
    const selectionTop = rect.top + window.scrollY
    const selectionBottom = rect.bottom + window.scrollY
    const selectionCenterX = rect.left + window.scrollX + rect.width / 2

    const { width, height } = floatingToolbarSizeRef.current
    const availableWidth = Math.max(window.innerWidth - MIN_MARGIN * 2, 0)
    const fallbackWidth = Math.min(availableWidth, 280)
    const measuredWidth = width > 0 ? width : fallbackWidth
    const effectiveWidth = Math.min(measuredWidth, availableWidth)
    const halfWidth = effectiveWidth / 2

    let left = selectionCenterX - halfWidth
    const minLeft = window.scrollX + MIN_MARGIN
    const maxLeft = window.scrollX + window.innerWidth - MIN_MARGIN - effectiveWidth
    left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft))

    const measuredHeight = height > 0 ? height : 44
    let top = selectionTop - measuredHeight - SELECTION_GAP
    const minTop = window.scrollY + MIN_MARGIN

    if (top < minTop) {
      top = selectionBottom + SELECTION_GAP
      const maxTop = window.scrollY + window.innerHeight - MIN_MARGIN - measuredHeight
      top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop))
    }

    setFloatingToolbar((previous) => {
      const next = { visible: true, top, left }
      if (
        previous.visible === next.visible &&
        Math.abs(previous.top - next.top) < 0.5 &&
        Math.abs(previous.left - next.left) < 0.5
      ) {
        return previous
      }
      return next
    })
  }, [hideFloatingToolbar])

  const handleContentChange = useCallback(
    (html: string) => {
      setContent(html)
      scheduleHeadingsUpdate()
      scheduleActiveFormatsUpdate()
      updateFloatingToolbar()
    },
    [scheduleHeadingsUpdate, scheduleActiveFormatsUpdate, updateFloatingToolbar]
  )

  const handleCommand = useCallback(
    (command: RichTextCommand) => {
      editorRef.current?.focus()
      editorRef.current?.exec(command)
      scheduleActiveFormatsUpdate()
      updateFloatingToolbar()
    },
    [scheduleActiveFormatsUpdate, updateFloatingToolbar]
  )

  // Save current selection before opening note link dialog
  const saveNoteLinkSelection = useCallback(() => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      savedNoteLinkSelection.current = selection.getRangeAt(0).cloneRange()
    }
  }, [])

  // Restore selection and insert note link
  const handleNoteLinkSelect = useCallback(
    (noteId: string, noteTitle: string, folderId?: string | null) => {
      // Restore the saved selection first
      if (savedNoteLinkSelection.current) {
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(savedNoteLinkSelection.current)
        }
      }

      // Focus the editor
      editorRef.current?.focus()

      // Small delay to ensure focus is set before inserting
      setTimeout(() => {
        if (editorRef.current && editorRef.current.insertCustomBlock) {
          editorRef.current.insertCustomBlock('note-link', {
            noteId,
            noteTitle,
            folderId
          })
          setHasChanges(true)
        }
        // Clear the saved selection
        savedNoteLinkSelection.current = null
      }, 10)
    },
    []
  )

  // Handle clicking on note links
  useEffect(() => {
    const handleNoteLinkClick = async (event: Event) => {
      const customEvent = event as CustomEvent<{ noteId: string }>
      const noteId = customEvent.detail?.noteId
      
      if (noteId && onSelectNote) {
        // First check if the note is in the current notes array (already loaded)
        if (notes) {
          const targetNote = notes.find(n => n.id === noteId)
          if (targetNote) {
            onSelectNote(targetNote)
            return
          }
        }
        
        // If not found in current notes, fetch it directly from Supabase
        // This handles notes in other folders
        try {
          const { getNote } = await import('../lib/notes')
          const targetNote = await getNote(noteId)
          if (targetNote) {
            onSelectNote(targetNote)
          } else {
            toast.push({ title: 'Note not found', description: 'The linked note could not be found.' })
          }
        } catch (error) {
          console.error('Failed to load note:', error)
          toast.push({ title: 'Error loading note', description: 'Failed to load the linked note.' })
        }
      }
    }

    window.addEventListener('note-link-click', handleNoteLinkClick)
    return () => window.removeEventListener('note-link-click', handleNoteLinkClick)
  }, [notes, onSelectNote, toast])

  const handleSave = useCallback(async (opts?: { isAuto?: boolean }) => {
    const isAuto = !!opts?.isAuto

    // If this is a manual save, cancel pending autosave
    if (!isAuto && autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    if (!title.trim()) {
      if (!isAuto) alert('Please enter a title')
      return
    }

    if (isAuto) {
      // mark autosave in-flight to avoid concurrent autosaves; use ref to avoid rerenders
      isAutosavingRef.current = true
    } else {
      setIsSaving(true)
    }

    try {
      if (noteType === 'drawing') {
        const drawingContent = JSON.stringify(drawingData)
        await onSave({
          title: title.trim(),
          content: drawingContent,
          note_type: 'drawing',
        }, isAuto)
      } else if (noteType === 'mindmap') {
        const mindmapContent = JSON.stringify(mindmapData)
        await onSave({
          title: title.trim(),
          content: mindmapContent,
          note_type: 'mindmap',
        }, isAuto)
      } else {
        await onSave({
          title: title.trim(),
          content,
          note_type: 'rich-text',
        }, isAuto)
      }
      setHasChanges(false)
      setLastSaveTime(new Date())
    } catch (error: any) {
      if (!isAuto) {
        alert('Failed to save note: ' + error.message)
      } else {
        // for autosave failures, log but don't interrupt the UI
        console.error('Autosave failed:', error)
      }
    } finally {
      if (isAuto) {
        isAutosavingRef.current = false
      } else {
        setIsSaving(false)
      }
    }
  }, [content, drawingData, mindmapData, onSave, title, noteType])

  // Autosave: debounce saves after a short period of inactivity.
  useEffect(() => {
    const AUTOSAVE_DELAY = 2000 // ms

    // clear any existing autosave
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current)
      autosaveTimeoutRef.current = null
    }

    // Only schedule autosave when there are unsaved changes, not currently saving/deleting,
    // and the note has a non-empty title (avoid creating unnamed notes)
    if (!hasChanges || isSaving || isDeleting || !title.trim()) {
      return
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      // safety guards before saving
      if (!hasChanges || isSaving || isDeleting || !title.trim()) {
        autosaveTimeoutRef.current = null
        return
      }
      ;(async () => {
        try {
          // avoid scheduling a new autosave while one is running
          if (isAutosavingRef.current) return
          await handleSave({ isAuto: true })
        } finally {
          autosaveTimeoutRef.current = null
        }
      })()
    }, AUTOSAVE_DELAY)

    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
    }
  }, [title, content, drawingData, mindmapData, noteType, hasChanges, isSaving, isDeleting, handleSave])

  const handleDelete = async () => {
    if (!note || !onDelete) return

    if (!confirm('Are you sure you want to delete this note?')) return

    setIsDeleting(true)
    try {
      await onDelete(note.id)
    } catch (error: any) {
      alert('Failed to delete note: ' + error.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCancel = () => {
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        return
      }
    }
    onCancel?.()
  }

  const handleSetWordGoal = (goal: number | null) => {
    setWordGoal(goal)
    if (note?.id) {
      if (goal === null) {
        localStorage.removeItem(`wordGoal_${note.id}`)
      } else {
        localStorage.setItem(`wordGoal_${note.id}`, goal.toString())
      }
    }
    setShowWordGoalInput(false)
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()

      if (key === 's') {
        event.preventDefault()
        if (hasChanges && !isSaving) {
          handleSave()
        }
        return
      }

      if (key === 'enter') {
        event.preventDefault()
        if (!isSaving) {
          handleSave()
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, hasChanges, isSaving])

  // Listen for selection changes to update active format states
  useEffect(() => {
    const handleSelectionChange = () => {
      scheduleActiveFormatsUpdate()
      updateFloatingToolbar()
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [scheduleActiveFormatsUpdate, updateFloatingToolbar])

  useEffect(() => {
    const handleWindowChange = () => updateFloatingToolbar()

    window.addEventListener('scroll', handleWindowChange, true)
    window.addEventListener('resize', handleWindowChange)
    return () => {
      window.removeEventListener('scroll', handleWindowChange, true)
      window.removeEventListener('resize', handleWindowChange)
    }
  }, [updateFloatingToolbar])

  useLayoutEffect(() => {
    if (!floatingToolbar.visible || !floatingToolbarRef.current) {
      return
    }

    const { offsetWidth, offsetHeight } = floatingToolbarRef.current
    const previous = floatingToolbarSizeRef.current
    if (
      Math.abs(previous.width - offsetWidth) > 0.5 ||
      Math.abs(previous.height - offsetHeight) > 0.5
    ) {
      floatingToolbarSizeRef.current = { width: offsetWidth, height: offsetHeight }
      updateFloatingToolbar()
    }
  }, [floatingToolbar.visible, floatingToolbar.left, floatingToolbar.top, updateFloatingToolbar])

  useEffect(() => {
    if (isSaving || isDeleting) {
      hideFloatingToolbar()
    }
  }, [hideFloatingToolbar, isDeleting, isSaving])

  useEffect(() => {
    hideFloatingToolbar()
  }, [hideFloatingToolbar, note])

  useEffect(() => {
    if (showTOC) {
      scheduleHeadingsUpdate()
    }
  }, [showTOC, scheduleHeadingsUpdate])

  useEffect(() => {
    scheduleActiveFormatsUpdate()
  }, [note, scheduleActiveFormatsUpdate])

  // Register note link slash command
  useEffect(() => {
    registerNoteLinkCommand(<FileText size={16} />)
  }, [])

  // Update last save display every 10 seconds
  useEffect(() => {
    if (!lastSaveTime) return
    
    const interval = setInterval(() => {
      // Force re-render by updating a dummy state (the memo will recalculate)
      setLastSaveTime(new Date(lastSaveTime))
    }, 10000)
    
    return () => clearInterval(interval)
  }, [lastSaveTime])

  const stats = useMemo(() => {
    const words = plainContent ? plainContent.split(/\s+/).filter(Boolean).length : 0
    return { characters: plainContent.length, words }
  }, [plainContent])

  const wordGoalProgress = useMemo(() => {
    if (!wordGoal) return null
    const percentage = Math.min((stats.words / wordGoal) * 100, 100)
    const isComplete = stats.words >= wordGoal
    return { percentage, isComplete }
  }, [wordGoal, stats.words])

  // Get folder path for display
  const folderPath = useMemo(() => {
    if (!note?.folder_id) return 'All Notes'
    
    const findFolderPath = (folderId: string, nodes: any[], path: string[] = []): string[] | null => {
      for (const node of nodes) {
        if (node.id === folderId) {
          return [...path, node.name]
        }
        if (node.children && node.children.length > 0) {
          const result = findFolderPath(folderId, node.children, [...path, node.name])
          if (result) return result
        }
      }
      return null
    }
    
    const path = findFolderPath(note.folder_id, folders)
    return path ? path.join(' / ') : 'All Notes'
  }, [note?.folder_id, folders])

  // Format last save time
  const lastSaveDisplay = useMemo(() => {
    if (!lastSaveTime) return null
    
    const now = new Date()
    const diffMs = now.getTime() - lastSaveTime.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    
    if (diffSecs < 10) return 'Just now'
    if (diffSecs < 60) return `${diffSecs}s ago`
    
    const diffMins = Math.floor(diffSecs / 60)
    if (diffMins < 60) return `${diffMins}m ago`
    
    const diffHours = Math.floor(diffMins / 60)
    return `${diffHours}h ago`
  }, [lastSaveTime])

  const toolbar: Array<{
    label: string
    command: RichTextCommand
    icon: React.ReactNode
  }> = [
    { label: 'H1', command: 'heading1', icon: <Heading1 size={16} /> },
    { label: 'H2', command: 'heading2', icon: <Heading2 size={16} /> },
    { label: 'H3', command: 'heading3', icon: <Heading3 size={16} /> },
    { label: 'Bold', command: 'bold', icon: <Bold size={16} /> },
    { label: 'Italic', command: 'italic', icon: <Italic size={16} /> },
    { label: 'Underline', command: 'underline', icon: <Underline size={16} /> },
    { label: 'Strike', command: 'strike', icon: <Strikethrough size={16} /> },
    { label: 'Code', command: 'code', icon: <Code size={16} /> },
    { label: 'Link', command: 'link', icon: <LinkIcon size={16} /> },
    { label: 'Bullets', command: 'unordered-list', icon: <List size={16} /> },
    { label: 'Numbered', command: 'ordered-list', icon: <ListOrdered size={16} /> },
    { label: 'Quote', command: 'blockquote', icon: <Quote size={16} /> },
    { label: 'Checklist', command: 'checklist', icon: <CheckSquare size={16} /> }
  ]

  const secondaryToolbar: Array<{
    label: string
    command?: RichTextCommand
    icon: React.ReactNode
    onClick?: () => void
  }> = [
    { label: 'Undo', command: 'undo', icon: <Undo size={16} /> },
    { label: 'Redo', command: 'redo', icon: <Redo size={16} /> }
  ]

  return (
    <>
      {/* Unified Control Panel */}
      <UnifiedPanel
        note={note}
        title={title}
        onTitleChange={setTitle}
        onSave={handleSave}
        onDelete={note && onDelete ? handleDelete : undefined}
        onCancel={handleCancel}
        isSaving={isSaving}
        isDeleting={isDeleting}
        hasChanges={hasChanges}
        headings={headings}
        showTOC={showTOC}
        onToggleTOC={() => setShowTOC(!showTOC)}
        onScrollToHeading={(headingId) => editorRef.current?.scrollToHeading(headingId)}
        onSearch={() => editorRef.current?.showSearchDialog()}
        onOpenKnowledgeGraph={() => setShowKnowledgeGraph(true)}
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={onSelectFolder}
        onCreateFolder={onCreateFolder}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onMoveFolder={onMoveFolder}
        notes={notes}
        selectedNoteId={note?.id}
        onSelectNote={onSelectNote}
        onNewNote={onNewNote}
        onDuplicateNote={onDuplicateNote}
        onMoveNote={onMoveNote}
        isLoadingNotes={isLoadingNotes}
        currentFolderName={currentFolderName}
        stats={stats}
        userEmail={userEmail}
        onSignOut={onSignOut}
          autoOpenKey={autoOpenPanelKey}
      />

      {/* Clean Editor Area */}
      <div className="flex flex-col h-screen bg-white pb-10">
        <div className="flex-1 px-3 py-2 sm:px-4 sm:py-3 overflow-hidden">
          <div className="h-full w-full">
            <div className="relative h-full overflow-hidden flex flex-col bg-white">
              {noteType === 'drawing' ? (
                <DrawingEditor
                  ref={drawingEditorRef}
                  value={drawingData}
                  onChange={setDrawingData}
                  disabled={isSaving || isDeleting}
                />
              ) : noteType === 'mindmap' ? (
                <MindmapEditor
                  ref={mindmapEditorRef}
                  initialData={mindmapData || undefined}
                  onChange={setMindmapData}
                  readOnly={isSaving || isDeleting}
                />
              ) : (
                <RichTextEditor
                    ref={editorRef}
                    value={content}
                    onChange={handleContentChange}
                    disabled={isSaving || isDeleting}
                    placeholder="Start writing your note..."
                    onCustomSlashCommand={(commandId) => {
                      if (commandId === 'note-link') {
                        saveNoteLinkSelection()
                        setShowNoteLinkDialog(true)
                      }
                    }}
                    customBlocks={[
                      noteLinkBlock,
                      {
                        type: 'table',
                        render: (payload?: any) => {
                          const rows = (payload && payload.rows) || 3
                          const cols = (payload && payload.cols) || 3
                          let html = '<div class="overflow-auto my-2"><table class="min-w-full table-fixed border-collapse">'
                          for (let r = 0; r < rows; r++) {
                            html += '<tr>'
                            for (let c = 0; c < cols; c++) {
                              html += '<td class="border px-2 py-1 align-top">' + (r === 0 ? '<strong>Header</strong>' : '&nbsp;') + '</td>'
                            }
                            html += '</tr>'
                          }
                          html += '</table></div>'
                          return html
                        },
                        parse: (el: HTMLElement) => {
                          // naive parse: count rows/cols
                          const table = el.querySelector('table')
                          if (!table) return { rows: 0, cols: 0 }
                          const rows = table.querySelectorAll('tr').length
                          const firstRow = table.querySelector('tr')
                          const cols = firstRow ? firstRow.querySelectorAll('td,th').length : 0
                          return { rows, cols }
                        }
                      }
                    ]}
                  />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Toolbar - Only show for rich text notes */}
      {noteType === 'rich-text' && floatingToolbar.visible && (
        <div
          ref={floatingToolbarRef}
          className="fixed z-50 flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur"
          style={{
            top: floatingToolbar.top,
            left: floatingToolbar.left,
            maxWidth: 'calc(100vw - 32px)'
          }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {toolbar.map(({ label, command, icon }) => {
            const isActive = activeFormats.has(command)
            return (
              <button
                key={command}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleCommand(command)}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isActive
                    ? 'border-blue-300 bg-blue-100 text-blue-700'
                    : 'border-transparent hover:border-gray-300 hover:text-gray-900'
                }`}
                title={`${label} (${commandShortcuts[command]})`}
              >
                {icon}
              </button>
            )
          })}

          {secondaryToolbar.length > 0 && (
            <span className="mx-1 h-6 w-px bg-gray-200" aria-hidden="true" />
          )}

          {secondaryToolbar.map(({ label, command, icon, onClick }) => (
            <button
              key={label}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (onClick) {
                  onClick()
                } else if (command) {
                  handleCommand(command)
                }
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              title={command ? `${label} (${commandShortcuts[command]})` : label}
            >
              {icon}
            </button>
          ))}
        </div>
      )}

      {/* Status Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center gap-4">
            {/* Save Status */}
            <div className="flex items-center gap-1.5">
              {isSaving ? (
                <>
                  <Loader2 size={12} className="animate-spin text-blue-500" />
                  <span className="text-blue-600 font-medium">Saving...</span>
                </>
              ) : hasChanges ? (
                <>
                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                  <span className="text-amber-600 font-medium">Unsaved changes</span>
                </>
              ) : lastSaveDisplay ? (
                <>
                  <Check size={12} className="text-green-500" />
                  <span className="text-green-600 font-medium">Saved {lastSaveDisplay}</span>
                </>
              ) : null}
            </div>

            {/* Folder Path */}
            {note && (
              <div className="flex items-center gap-1.5 text-gray-500">
                <FolderOpen size={12} />
                <span>{folderPath}</span>
              </div>
            )}

            {/* Note Type */}
            {note && (
              <div className="flex items-center gap-1.5 text-gray-500">
                <span className="px-1.5 py-0.5 bg-gray-200 rounded text-[10px] font-medium uppercase">
                  {noteType === 'rich-text' ? 'Text' : noteType === 'drawing' ? 'Drawing' : 'Mindmap'}
                </span>
              </div>
            )}

            {/* Project Manager Button */}
            <button
              onClick={() => setShowProjectsModal(true)}
              className="flex items-center gap-1.5 px-2 py-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors font-medium"
              title="Open Project Manager"
            >
              <Target size={14} className="text-blue-500" />
              <span>Projects</span>
            </button>
          </div>

          {/* Stats - Only for rich text notes */}
          {noteType === 'rich-text' && (
            <div className="flex items-center gap-4 text-gray-500">
              {/* Word Goal Progress */}
              {wordGoal && wordGoalProgress ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Target size={12} className={wordGoalProgress.isComplete ? 'text-green-500' : 'text-blue-500'} />
                    <span className={wordGoalProgress.isComplete ? 'text-green-600 font-medium' : 'text-gray-700'}>
                      {stats.words}/{wordGoal} words
                    </span>
                  </div>
                  <div className="relative w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`absolute left-0 top-0 h-full transition-all duration-300 rounded-full ${
                        wordGoalProgress.isComplete 
                          ? 'bg-gradient-to-r from-green-400 to-green-500' 
                          : 'bg-gradient-to-r from-blue-400 to-blue-500'
                      }`}
                      style={{ width: `${wordGoalProgress.percentage}%` }}
                    />
                  </div>
                  <button
                    onClick={() => setShowWordGoalInput(true)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title="Edit goal"
                  >
                    <Edit2 size={10} />
                  </button>
                </div>
              ) : (
                <>
                  <span>{stats.words} {stats.words === 1 ? 'word' : 'words'}</span>
                  {note && (
                    <button
                      onClick={() => setShowWordGoalInput(true)}
                      className="flex items-center gap-1 text-blue-500 hover:text-blue-600 transition-colors font-medium"
                      title="Set word goal"
                    >
                      <Target size={12} />
                      <span>Set goal</span>
                    </button>
                  )}
                </>
              )}
              
              <span>{stats.characters} {stats.characters === 1 ? 'char' : 'chars'}</span>
              {headings.length > 0 && (
                <span>{headings.length} {headings.length === 1 ? 'heading' : 'headings'}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Word Goal Input Modal */}
      {showWordGoalInput && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Target size={24} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Set Word Goal</h3>
                <p className="text-sm text-gray-500">Set a target word count for this note</p>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target word count
              </label>
              <input
                ref={wordGoalInputRef}
                type="number"
                min="1"
                defaultValue={wordGoal || ''}
                placeholder="e.g., 1000"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const value = parseInt(e.currentTarget.value, 10)
                    if (value > 0) {
                      handleSetWordGoal(value)
                    }
                  } else if (e.key === 'Escape') {
                    setShowWordGoalInput(false)
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">Current: {stats.words} words</p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => handleSetWordGoal(null)}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Clear Goal
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowWordGoalInput(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (wordGoalInputRef.current) {
                      const value = parseInt(wordGoalInputRef.current.value, 10)
                      if (!isNaN(value) && value > 0) {
                        handleSetWordGoal(value)
                      }
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Set Goal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Note Link Dialog */}
      <NoteLinkDialog
        isOpen={showNoteLinkDialog}
        onClose={() => setShowNoteLinkDialog(false)}
        onSelect={handleNoteLinkSelect}
        currentNoteId={note?.id}
      />

      {/* Knowledge Graph Modal */}
      <KnowledgeGraphModal
        isOpen={showKnowledgeGraph}
        onClose={() => setShowKnowledgeGraph(false)}
        currentNoteId={note?.id}
        onSelectNote={onSelectNote}
        folders={folders}
        selectedFolderId={selectedFolderId}
      />

      {/* Project Manager Modal */}
      <ProjectsWorkspaceModal
        isOpen={showProjectsModal}
        onClose={() => setShowProjectsModal(false)}
        onSelectNote={onSelectNote}
        onSelectFolder={onSelectFolder}
        onNewNote={onNewNote}
        onDuplicateNote={onDuplicateNote}
      />
    </>
  )
}
