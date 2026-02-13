'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent
} from 'react'
import DOMPurify from 'dompurify'
import type { Config } from 'dompurify'
import {
  X
} from 'lucide-react'
import EditorToolbar from './EditorToolbar'
import LinkDialog from './editor/LinkDialog'
import LinkPopover from './editor/LinkPopover'
import SearchReplaceDialog from './editor/SearchReplaceDialog'
import TableInsertDialog from './editor/TableInsertDialog'
import TableToolbar from './editor/TableToolbar'
import {
  applyInlineStyle,
  applyBlockFormat,
  generateHeadingId,
  saveSelection as saveSelectionUtil,
  restoreSelection as restoreSelectionUtil
} from '@/lib/editor/commandDispatcher'
import {
  saveCursorPosition,
  restoreCursorPosition,
  positionCursorInElement,
  applyCursorOperation,
  CURSOR_TIMING
} from '@/lib/editor/cursorPosition'
import {
  normalizeInlineNodes,
  normalizeEditorContent,
  sanitizeInlineNodes
} from '@/lib/editor/domNormalizer'
import {
  toggleListType,
  toggleChecklistState,
  addCheckboxToListItem,
  removeCheckboxFromListItem,
  getClosestListItem,
  mergeAdjacentLists,
  indentListItems,
  outdentListItems,
  handleListEnter,
  handleListBackspace,
  normalizeAllLists,
  updateChecklistProgress,
  getClosestList,
  initListDragReorder,
} from '@/lib/editor/listHandler'
import { HistoryManager, createDebouncedCapture } from '@/lib/editor/historyManager'
import {
  looksLikeMarkdown,
  markdownToHtml,
  htmlToMarkdown
} from '@/lib/editor/markdownHelpers'
import {
  getSelectionContext,
  getClosestFromSelection,
  isSelectionInsideRoot,
  saveSelectionRange,
  restoreSelectionRange,
} from '@/lib/editor/selectionUtils'
import { useLinkPopover } from '@/lib/editor/useLinkPopover'
import { useTableToolbar } from '@/lib/editor/useTableToolbar'
import {
  applyAutoformat,
  shouldApplyAutoformat,
  checkListPrefixPattern
} from '@/lib/editor/autoformat'
import {
  useLinkDialogState,
  useSearchDialogState,
  useTableDialogState,
  type SearchMatch,
} from '@/lib/editor/useEditorDialogState'


// Re-export RichTextCommand type for external use
export type RichTextCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'unordered-list'
  | 'ordered-list'
  | 'blockquote'
  | 'checklist'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'undo'
  | 'redo'
  | 'link'
  | 'horizontal-rule'

export interface RichTextEditorHandle {
  focus: () => void
  exec: (command: RichTextCommand) => void
  insertCustomBlock?: (type: string, payload?: any) => void
  getHTML: () => string
  getMarkdown: () => string
  getHeadings: () => Array<{ id: string; level: number; text: string }>
  queryCommandState: (command: string) => boolean
  showLinkDialog: () => void
  showSearchDialog: () => void
  showTableDialog: () => void
  requestNoteLink: () => void
  getRootElement: () => HTMLDivElement | null
  scrollToHeading: (headingId: string) => void
}

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
  // Optional custom block descriptors that allow rendering and parsing of blocks
  customBlocks?: CustomBlockDescriptor[]
  // Optional callback for handling custom commands that need UI interaction (e.g., table insertion, note links)
  onCustomCommand?: (commandId: string) => void
}

const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: [
    'a',
    'b',
    'strong',
    'i',
    'em',
    'u',
    's',
    'code',
    'pre',
    'p',
    'br',
    'div',
    'span',
    'blockquote',
    'ul',
    'ol',
    'li',
    'hr',
    'input',
    'h1',
    'h2',
    'h3',
    'mark',
    'img',
    'button',
    'svg',
    'path'
  ],
  // allow data-block attributes and stored payload attribute
  // (data-block-payload stores URI-encoded JSON)
  ALLOWED_ATTR: [
    'href',
    'target',
    'rel',
    'class',
    'type',
    'checked',
    'data-checked',
    'id',
    'data-block',
    'data-block-type',
    'data-block-payload',
    'data-note-id',
    'data-note-title',
    'data-folder-id',
    'src',
    'alt',
    'width',
    'height',
    'style',
    'data-direction',
    'aria-label',
    'title',
    'draggable',
    'contenteditable',
    'xmlns',
    'viewBox',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'd'
  ],
  ALLOW_DATA_ATTR: true
}

// Type describing a custom block renderer/parser that callers can register
export interface CustomBlockDescriptor {
  // unique type identifier used in data-block-type
  type: string
  // render block given an optional payload; should return an HTML string
  render: (payload?: any) => string
  // optional function to parse the block element back into a payload for serialization
  parse?: (el: HTMLElement) => any
}

interface BlockMetadata {
  id: string
  type: string
  textPreview: string
  index: number
}

// Performance limits
const MAX_SEARCH_MATCHES = 1000
const MAX_REPLACE_MATCHES = 1000

// Regex patterns
const REGEX_ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g

const BLOCK_ROOT_CLASS =
  'block-root rounded-xl border border-slate-200 bg-white/80 px-3 py-2 my-3 shadow-sm'

// Prevent overlapping block normalizations that can cause visual rubberbanding
const blockNormalizationGuard = { active: false }

const splitLinesToFragment = (text: string): DocumentFragment => {
  const fragment = document.createDocumentFragment()
  const lines = text.split(/\r?\n|\r/g)

  lines.forEach((line, index) => {
    fragment.appendChild(document.createTextNode(line))
    if (index < lines.length - 1) {
      fragment.appendChild(document.createElement('br'))
    }
  })

  return fragment
}

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  ({ value, onChange, disabled, placeholder, customBlocks, onCustomCommand }, ref) => {
    // local ref to hold passed customBlocks (avoid re-creating callbacks when prop changes)
    const customBlocksRef = useRef<CustomBlockDescriptor[] | undefined>(undefined)
  const editorRef = useRef<HTMLDivElement | null>(null)
    const historyManagerRef = useRef<HistoryManager | null>(null)
    const debouncedCaptureRef = useRef<(() => void) | null>(null)
  const lastSyncedValueRef = useRef<string>('')
    const mutationObserverRef = useRef<MutationObserver | null>(null)
    const checklistNormalizationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isProcessingCommandRef = useRef<boolean>(false)
    const {
      showLinkDialog,
      setShowLinkDialog,
      linkUrl,
      setLinkUrl,
      linkText,
      setLinkText,
      linkUrlError,
      setLinkUrlError,
      recentLinks,
      addToRecentLinks,
      resetLinkDialog,
    } = useLinkDialogState()
    const {
      showLinkPopover,
      linkPopoverPos,
      hoveredLinkElement,
      copiedLink,
      hideLinkPopover,
      hideLinkPopoverNow,
      keepPopoverOpen,
      copyLinkUrl,
    } = useLinkPopover({
      editorRef,
      ignoreSelector: '[data-block-type="note-link"]',
    })
    const {
      showSearchDialog,
      setShowSearchDialog,
      searchQuery,
      setSearchQuery,
      replaceQuery,
      setReplaceQuery,
      searchMatches,
      setSearchMatches,
      currentMatchIndex,
      setCurrentMatchIndex,
      caseSensitive,
      setCaseSensitive,
      resetSearchDialog,
    } = useSearchDialogState()
    const {
      showTableDialog,
      tableRows,
      setTableRows,
      tableCols,
      setTableCols,
      hoverRows,
      setHoverRows,
      hoverCols,
      setHoverCols,
      openTableDialog,
      closeTableDialog,
    } = useTableDialogState()
    const savedSelectionRef = useRef<Range | null>(null)
    const [autoformatEnabled, setAutoformatEnabled] = useState(true)
    const [blockMetadata, setBlockMetadata] = useState<BlockMetadata[]>([])
    const [blockPanelOpen, setBlockPanelOpen] = useState(false)
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
    const [showBlockOutlines, setShowBlockOutlines] = useState(false)
    const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
    const blockIdCounterRef = useRef(0)
    const activeFormatsFrameRef = useRef<number | null>(null)

    const isSelectionInsideEditor = useCallback(() => {
      return isSelectionInsideRoot(editorRef.current)
    }, [])

    const createEmptyBlock = useCallback(() => {
      const block = document.createElement('div')
      block.setAttribute('data-block', 'true')
      block.className = BLOCK_ROOT_CLASS

      const paragraph = document.createElement('p')
      paragraph.appendChild(document.createElement('br'))
      block.appendChild(paragraph)

      return block
    }, [])

    const ensureBlockHasContent = useCallback((block: HTMLElement) => {
      const hasContent = Array.from(block.childNodes).some((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) return true
        if (node.nodeType === Node.TEXT_NODE) {
          return (node.textContent || '').trim().length > 0
        }
        return false
      })

      if (!hasContent) {
        const paragraph = document.createElement('p')
        paragraph.appendChild(document.createElement('br'))
        block.appendChild(paragraph)
      }
    }, [])

    const ensureBlockId = useCallback((node: HTMLElement | null) => {
      if (!node) return ''
      try {
        let id = node.getAttribute('data-block-id')
        if (!id) {
          blockIdCounterRef.current += 1
          id = `block-${blockIdCounterRef.current}`
          node.setAttribute('data-block-id', id)
        }
        return id
      } catch (error) {
        console.error('Error ensuring block ID:', error)
        return ''
      }
    }, [])

    const wrapNodeInBlock = useCallback(
      (node: Node) => {
        if (!editorRef.current || !editorRef.current.isConnected) return null

        const block = document.createElement('div')
        block.setAttribute('data-block', 'true')
        block.className = BLOCK_ROOT_CLASS

        // Insert wrapper before moving the node to preserve order
        try {
          editorRef.current.insertBefore(block, node)
          block.appendChild(node)
          ensureBlockId(block)
          ensureBlockHasContent(block)
          return block
        } catch (error) {
          console.error('Error wrapping node in block:', error)
          return null
        }
      },
      [ensureBlockHasContent, ensureBlockId]
    )

    const enforceBlockStructure = useCallback(
      (options?: { preserveSelection?: boolean; forceCursorInside?: boolean }) => {
        if (!editorRef.current || !editorRef.current.isConnected) return
        if (blockNormalizationGuard.active) return

        blockNormalizationGuard.active = true

        try {
          const preserveSelection = options?.preserveSelection ?? true
          const forceCursorInside = options?.forceCursorInside ?? true

          const editor = editorRef.current
          const savedCursor = preserveSelection ? saveCursorPosition() : null

          let blockCount = 0
          const nodes = Array.from(editor.childNodes)

          nodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement
              if (el.getAttribute('data-block') === 'true') {
                ensureBlockId(el)
                ensureBlockHasContent(el)
                blockCount += 1
                return
              }
            }

            const wrapped = wrapNodeInBlock(node)
            if (wrapped) {
              blockCount += 1
            }
          })

          if (blockCount === 0) {
            const block = createEmptyBlock()
            editor.appendChild(block)
            ensureBlockId(block)
            blockCount = 1
          }

          let anchorBlock: HTMLElement | null = null
          if (forceCursorInside) {
            const selection = window.getSelection()
            if (selection && selection.rangeCount > 0) {
              const anchor = selection.getRangeAt(0).startContainer
              anchorBlock = (anchor instanceof HTMLElement ? anchor : anchor.parentElement)?.closest(
                '[data-block-id]'
              ) as HTMLElement | null
            }

            if (!anchorBlock && editor.firstElementChild instanceof HTMLElement) {
              const targetBlock = editor.firstElementChild
              ensureBlockId(targetBlock)
              const focusTarget =
                (targetBlock.querySelector('p, div, span, li, blockquote') as HTMLElement | null) ??
                targetBlock
              try {
                positionCursorInElement(focusTarget, 'start', editor)
              } catch (error) {
                console.warn('Error positioning cursor in normalized block:', error)
              }
              setActiveBlockId(targetBlock.getAttribute('data-block-id'))
              anchorBlock = targetBlock
            }
          }

          if (preserveSelection && savedCursor && savedCursor.range.startContainer?.isConnected && savedCursor.range.endContainer?.isConnected) {
            try {
              restoreCursorPosition(savedCursor, editor)
            } catch (error) {
              console.warn('Could not restore cursor after block normalization:', error)
            }
          }
        } finally {
          blockNormalizationGuard.active = false
        }
      },
      [createEmptyBlock, ensureBlockHasContent, ensureBlockId, wrapNodeInBlock]
    )

    const ensureSelectionWithinBlock = useCallback(() => {
      enforceBlockStructure({ preserveSelection: true, forceCursorInside: false })

      if (!editorRef.current || !editorRef.current.isConnected) return null

      const editor = editorRef.current
      const block = getClosestFromSelection('[data-block-id]', editor)

      if (block && block.isConnected) {
        ensureBlockId(block)
        return block
      }

      const newBlock = createEmptyBlock()
      editor.appendChild(newBlock)
      ensureBlockId(newBlock)
      const focusTarget = (newBlock.querySelector('p, div, span') as HTMLElement | null) ?? newBlock
      try {
        positionCursorInElement(focusTarget, 'start', editor)
      } catch (error) {
        console.warn('Error positioning cursor in new block:', error)
      }
      setActiveBlockId(newBlock.getAttribute('data-block-id'))
      return newBlock
    }, [createEmptyBlock, enforceBlockStructure, ensureBlockId])

    const updateBlockMetadata = useCallback(() => {
      if (!editorRef.current) return
      try {
        const blockNodes = Array.from(editorRef.current.children) as HTMLElement[]
        const metadata = blockNodes.map((node, idx) => {
          const id = ensureBlockId(node)
          const type = node.getAttribute('data-block-type') ?? node.tagName.toLowerCase()
          const textPreview = (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
          return {
            id,
            type,
            textPreview: textPreview || '(empty)',
            index: idx + 1
          }
        })
        setBlockMetadata(metadata)
      } catch (error) {
        console.error('Error updating block metadata:', error)
      }
    }, [ensureBlockId])

    const refreshActiveBlock = useCallback(() => {
      try {
        const editor = editorRef.current
        if (!editor) {
          setActiveBlockId(null)
          return
        }

        const blockElement = getClosestFromSelection('[data-block-id], [data-block="true"]', editor)
        if (blockElement instanceof HTMLElement) {
          const id = ensureBlockId(blockElement)
          setActiveBlockId(id)
        } else {
          setActiveBlockId(null)
        }
      } catch (error) {
        console.error('Error refreshing active block:', error)
        setActiveBlockId(null)
      }
    }, [ensureBlockId])

    const updateActiveFormats = useCallback(() => {
      try {
        const editor = editorRef.current
        if (!editor) {
          setActiveFormats(new Set())
          return
        }

        const context = getSelectionContext(editor)
        const element = context?.element

        if (!element) {
          setActiveFormats(new Set())
          return
        }
        
        const formats = new Set<string>()
        
        // Check inline formatting
        if (element.closest('strong, b')) formats.add('bold')
        if (element.closest('em, i')) formats.add('italic')
        if (element.closest('u')) formats.add('underline')
        if (element.closest('s, strike')) formats.add('strike')
        if (element.closest('code')) formats.add('code')
        
        // Check lists
        if (element.closest('ul')) formats.add('unordered-list')
        if (element.closest('ol')) formats.add('ordered-list')
        
        // Check block-level formatting
        if (element.closest('h1')) formats.add('heading1')
        if (element.closest('h2')) formats.add('heading2')
        if (element.closest('h3')) formats.add('heading3')
        if (element.closest('blockquote')) formats.add('blockquote')
        
        setActiveFormats(formats)
      } catch (error) {
        console.error('Error updating active formats:', error)
        setActiveFormats(new Set())
      }
    }, []) // Empty deps: only uses DOM APIs and setState

    const scheduleActiveFormatsUpdate = useCallback(() => {
      if (activeFormatsFrameRef.current !== null) {
        window.cancelAnimationFrame(activeFormatsFrameRef.current)
      }

      activeFormatsFrameRef.current = window.requestAnimationFrame(() => {
        updateActiveFormats()
        activeFormatsFrameRef.current = null
      })
    }, [updateActiveFormats])

    const focusBlockById = useCallback(
      (blockId: string) => {
        if (!editorRef.current || !blockId) return
        const escapeSelector = (value: string) => {
          if (typeof CSS !== 'undefined' && CSS.escape) {
            return CSS.escape(value)
          }
          return value.replace(/(["#.;?+*~':!^$\[\]()=>|/@])/g, '\\$1')
        }
        const selectorId = escapeSelector(blockId)
        const block = editorRef.current.querySelector(
          `[data-block-id="${selectorId}"]`
        ) as HTMLElement | null
        if (!block) return

        const focusTarget = (block.querySelector('p, div, span, li, blockquote') as HTMLElement | null) ?? block
        positionCursorInElement(focusTarget, 'start', editorRef.current)
        block.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setActiveBlockId(blockId)
      },
      []
    )
    

    const insertFragmentAtSelection = useCallback(
        (fragment: DocumentFragment) => {
          if (!editorRef.current) return false

          ensureSelectionWithinBlock()

          try {
            let selection = window.getSelection()
            if (!selection || selection.rangeCount === 0) {
              editorRef.current.focus()
              selection = window.getSelection()
            }

            if (!selection || selection.rangeCount === 0) {
              console.warn('Unable to get selection for fragment insertion')
              return false
            }

            const range = selection.getRangeAt(0)

            // Validate range is within editor
            if (!editorRef.current.contains(range.commonAncestorContainer)) {
              console.warn('Selection range is outside editor')
              return false
            }

            range.deleteContents()

            const nodes = Array.from(fragment.childNodes)

            if (nodes.length === 0) {
              range.collapse(true)
              selection.removeAllRanges()
              selection.addRange(range)
              return true
            }

            range.insertNode(fragment)

            const lastNode = nodes[nodes.length - 1]
            const newRange = document.createRange()

            if (lastNode.nodeType === Node.TEXT_NODE) {
              newRange.setStart(lastNode, lastNode.textContent?.length ?? 0)
            } else if (lastNode.childNodes.length > 0) {
              newRange.setStart(lastNode, lastNode.childNodes.length)
            } else {
              newRange.setStartAfter(lastNode)
            }

            newRange.collapse(true)
            selection.removeAllRanges()
            selection.addRange(newRange)
            return true
          } catch (error) {
            console.error('Error inserting fragment at selection:', error)
            return false
          }
        },
        [editorRef, ensureSelectionWithinBlock]
      )

        const insertCustomBlockAtSelection = useCallback(
          (html: string) => {
            // Parse the HTML to check if it's already marked as a block
            const temp = document.createElement('div')
            temp.innerHTML = html
            const firstChild = temp.firstChild as HTMLElement
            
            // If the content already has data-block attribute (inline blocks like note-link),
            // insert it directly without wrapping
            if (firstChild && firstChild.getAttribute && firstChild.getAttribute('data-block') === 'true') {
              return insertFragmentAtSelection(document.createRange().createContextualFragment(html))
            }
            
            // Otherwise, wrap block in a container with data-block-type so it survives sanitization
            const wrapper = document.createElement('div')
            wrapper.setAttribute('data-block', 'true')
            wrapper.innerHTML = html

            return insertFragmentAtSelection(document.createRange().createContextualFragment(wrapper.outerHTML))
          },
          [insertFragmentAtSelection]
        )

    const insertHTMLAtSelection = useCallback(
        (html: string) => {
          const fragment = document.createDocumentFragment()

          if (html) {
            const template = document.createElement('template')
            template.innerHTML = html

            while (template.content.firstChild) {
              fragment.appendChild(template.content.firstChild)
            }
          }

          return insertFragmentAtSelection(fragment)
        },
        [insertFragmentAtSelection]
      )

    const insertPlainTextAtSelection = useCallback(
        (text: string) => {
          const fragment = splitLinesToFragment(text)
          return insertFragmentAtSelection(fragment)
        },
        [insertFragmentAtSelection]
      )

    // keep customBlocksRef in sync with prop
    useEffect(() => {
      customBlocksRef.current = customBlocks
    }, [customBlocks])

    useEffect(() => {
      updateBlockMetadata()
    }, [updateBlockMetadata])

    useEffect(() => {
      const handleSelection = () => {
        if (!isSelectionInsideEditor()) {
          setActiveBlockId(null)
          setActiveFormats(new Set())
          return
        }

        refreshActiveBlock()
        scheduleActiveFormatsUpdate()
      }

      document.addEventListener('selectionchange', handleSelection)
      return () => document.removeEventListener('selectionchange', handleSelection)
    }, [isSelectionInsideEditor, refreshActiveBlock, scheduleActiveFormatsUpdate])

    useEffect(() => {
      if (!editorRef.current) return
      const nodes = editorRef.current.querySelectorAll('[data-block-id]')
      nodes.forEach((node) => {
        if (showBlockOutlines) {
          node.setAttribute('data-block-outline', 'true')
        } else {
          node.removeAttribute('data-block-outline')
        }
      })
    }, [showBlockOutlines, blockMetadata])

    const sanitize = useCallback(
      (html: string) => {
        if (typeof window === 'undefined') return html
        return DOMPurify.sanitize(html, SANITIZE_CONFIG) as string
      },
      []
    )

    // WebView-specific focus helper
    const forceWebViewFocus = useCallback(() => {
      if (!editorRef.current) return;
      
      // WebView sometimes needs extra focus handling
      editorRef.current.blur();
      setTimeout(() => {
        editorRef.current?.focus();
      }, 50);
    }, []);

    // Debounced checklist normalization
    const normalizeChecklistItemsInline = useCallback(() => {
      if (!editorRef.current) return

      normalizeAllLists(editorRef.current)
    }, [])

    const scheduleChecklistNormalization = useCallback(() => {
      if (checklistNormalizationTimerRef.current) {
        clearTimeout(checklistNormalizationTimerRef.current)
      }
      
      checklistNormalizationTimerRef.current = setTimeout(() => {
        normalizeChecklistItemsInline()
      }, 150)
    }, [normalizeChecklistItemsInline])

    const emitChange = useCallback(() => {
      if (!editorRef.current) return
      
      try {
        // Validate editor is still connected
        if (!editorRef.current.isConnected) {
          console.warn('Editor disconnected, skipping change emission')
          return
        }
        
        const sanitized = sanitize(editorRef.current.innerHTML)
        
        // Compare against what we last synced, not the (potentially stale) value prop
        if (sanitized !== lastSyncedValueRef.current) {
          lastSyncedValueRef.current = sanitized
          onChange(sanitized)
          if (debouncedCaptureRef.current) {
            debouncedCaptureRef.current()
          }
        }
        
        updateBlockMetadata()
        scheduleActiveFormatsUpdate()
      } catch (error) {
        console.error('Error emitting change:', error)
      }
    }, [onChange, sanitize, updateBlockMetadata, scheduleActiveFormatsUpdate])

    // Public API: insert a custom block by type and optional payload
    const insertCustomBlock = useCallback(
      (type: string, payload?: any) => {
        const descriptors = customBlocksRef.current || []
        const desc = descriptors.find((d) => d.type === type)
        if (!desc) {
          console.warn(`No custom block registered for type: ${type}`)
          return false
        }

        try {
          const html = desc.render(payload)
          const ok = insertCustomBlockAtSelection(html)
          if (ok) {
            // mark the inserted block's top-level element with data-block-type
            // and, if a payload was provided, attach it as data-block-payload
            // we do this after a short timeout to allow DOM insertion
            setTimeout(() => {
              if (!editorRef.current) return
              const blocks = editorRef.current.querySelectorAll('[data-block]')
              blocks.forEach((b) => {
                if (!b.getAttribute('data-block-type')) {
                  b.setAttribute('data-block-type', type)
                }
                if (payload !== undefined && !b.getAttribute('data-block-payload')) {
                  try {
                    b.setAttribute('data-block-payload', encodeURIComponent(JSON.stringify(payload)))
                  } catch (e) {
                    // ignore serialization errors
                  }
                }
              })
              
              // For block-level custom blocks (like images), ensure there's a paragraph after
              // for continued editing if the block is at the end
              const selection = window.getSelection()
              if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0)
                const container = range.commonAncestorContainer
                
                // Find the custom block that was just inserted
                let blockElement: HTMLElement | null = null
                if (container.nodeType === Node.ELEMENT_NODE) {
                  blockElement = (container as HTMLElement).querySelector('[data-block="true"]')
                  if (!blockElement && (container as HTMLElement).hasAttribute('data-block')) {
                    blockElement = container as HTMLElement
                  }
                } else if (container.parentElement) {
                  blockElement = container.parentElement.closest('[data-block="true"]') as HTMLElement
                }
                
                // Check if this is a block-level element (like image) and needs a trailing paragraph
                // We check the block type directly rather than getComputedStyle for better performance
                if (blockElement && blockElement.getAttribute('data-block-type') === type) {
                  // Known block-level custom block types
                  const blockLevelTypes = ['image', 'table']
                  const isBlockLevel = blockLevelTypes.includes(type)
                  const hasNextSibling = blockElement.nextElementSibling
                  
                  if (isBlockLevel && !hasNextSibling) {
                    // Create a paragraph after the block for continued editing
                    const paragraph = document.createElement('p')
                    paragraph.appendChild(document.createElement('br'))
                    blockElement.parentNode?.insertBefore(paragraph, blockElement.nextSibling)
                    
                    // Position cursor in the new paragraph
                    const newRange = document.createRange()
                    newRange.setStart(paragraph, 0)
                    newRange.collapse(true)
                    selection.removeAllRanges()
                    selection.addRange(newRange)
                  }
                }
              }
            }, 20)
          }
          emitChange()
          return ok
        } catch (err) {
          console.error('Failed to render custom block', err)
          return false
        }
      },
      [insertCustomBlockAtSelection, emitChange]
    )

    // Rehydrate existing custom blocks in the editor by running descriptor.parse
    const rehydrateExistingBlocks = useCallback(() => {
      if (!editorRef.current) return
      const descriptors = customBlocksRef.current || []
      const nodes = Array.from(editorRef.current.querySelectorAll('[data-block][data-block-type]'))
      nodes.forEach((node) => {
        const type = node.getAttribute('data-block-type') || ''
        const desc = descriptors.find((d) => d.type === type)
        if (desc && typeof desc.parse === 'function') {
          try {
            const parsed = desc.parse(node as HTMLElement)
            if (parsed !== undefined) {
              try {
                node.setAttribute('data-block-payload', encodeURIComponent(JSON.stringify(parsed)))
              } catch {}
            }
          } catch (e) {
            // parsing failed - ignore
          }
        } else {
          // if there is already a payload attribute, leave it as-is; otherwise clear
        }
      })
    }, [])

    const {
      tableToolbarVisible,
      tableToolbarPos,
      addTableRow,
      deleteTableRow,
      addTableCol,
      deleteTableCol,
      deleteTable,
      getTableDimensionsLabel,
    } = useTableToolbar({ editorRef, onEmitChange: emitChange })

    // Editor click handler to detect note link clicks
    useEffect(() => {
      const handleClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null
        
        // Check for note link clicks
        if (target) {
          const noteLinkElement = target.closest('[data-block-type="note-link"]') as HTMLElement | null
          if (noteLinkElement) {
            event.preventDefault()
            const noteId = noteLinkElement.getAttribute('data-note-id')
            if (noteId) {
              // Dispatch custom event that parent can listen to
              window.dispatchEvent(new CustomEvent('note-link-click', { 
                detail: { noteId } 
              }))
            }
            return
          }
        }
      }
      
      document.addEventListener('click', handleClick)
      
      return () => {
        document.removeEventListener('click', handleClick)
      }
    }, [])

    const createChecklistCheckbox = useCallback(() => {
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.className = 'align-middle mr-2 checklist-checkbox'
      checkbox.setAttribute('data-checked', 'false')
      checkbox.addEventListener('change', () => {
        checkbox.setAttribute('data-checked', checkbox.checked ? 'true' : 'false')
        if (checkbox.checked) {
          checkbox.setAttribute('checked', 'true')
        } else {
          checkbox.removeAttribute('checked')
        }
        emitChange()
      })
      return checkbox
    }, [emitChange])

    const markChecklistList = useCallback(
      (list: HTMLUListElement | HTMLOListElement | null | undefined, isChecklist: boolean) => {
        if (!list) return
        if (isChecklist) {
          list.classList.add('checklist-list')
          list.setAttribute('data-checklist', 'true')
        } else {
          list.classList.remove('checklist-list')
          list.removeAttribute('data-checklist')
        }
      },
      []
    )

    const markChecklistItem = useCallback((listItem: HTMLLIElement, isChecklist: boolean) => {
      if (isChecklist) {
        listItem.classList.add('checklist-item')
        listItem.setAttribute('data-checklist', 'true')
      } else {
        listItem.classList.remove('checklist-item')
        listItem.removeAttribute('data-checklist')
      }
      markChecklistList(listItem.parentElement as HTMLUListElement | HTMLOListElement | null, isChecklist)
    }, [markChecklistList])

    const ensureTextNode = useCallback((element: HTMLElement): Text => {
      const existingTextNode = Array.from(element.childNodes).find(
        (node): node is Text => node.nodeType === Node.TEXT_NODE
      )
      if (existingTextNode) {
        return existingTextNode
      }
      const textNode = document.createTextNode('')
      element.appendChild(textNode)
      return textNode
    }, [])

    const getChecklistItemText = useCallback((listItem: HTMLLIElement) => {
      return Array.from(listItem.childNodes)
        .filter((node) => {
          return !(node instanceof HTMLInputElement && node.type === 'checkbox')
        })
        .map((node) => node.textContent ?? '')
        .join('')
        .trim()
    }, [])

    const addCheckboxToListItem = useCallback(
      (listItem: HTMLLIElement) => {
        const existingCheckbox = listItem.querySelector('input[type="checkbox"]') as
          | HTMLInputElement
          | null

        if (existingCheckbox) {
          existingCheckbox.classList.add('checklist-checkbox', 'align-middle', 'mr-2')
          markChecklistItem(listItem, true)
          ensureTextNode(listItem)
          return existingCheckbox
        }

        const checkbox = createChecklistCheckbox()
        listItem.insertBefore(checkbox, listItem.firstChild)
        markChecklistItem(listItem, true)
        ensureTextNode(listItem)
        return checkbox
      },
      [createChecklistCheckbox, ensureTextNode, markChecklistItem]
    )

    const removeCheckboxFromListItem = useCallback(
      (listItem: HTMLLIElement) => {
        const checkbox = listItem.querySelector('input[type="checkbox"]')
        if (checkbox) {
          checkbox.remove()
        }
        markChecklistItem(listItem, false)
      },
      [markChecklistItem]
    )

    const convertListToChecklist = useCallback(
      (list: HTMLUListElement | HTMLOListElement) => {
        Array.from(list.children).forEach((child) => {
          if (child instanceof HTMLLIElement) {
            addCheckboxToListItem(child)
          }
        })
        markChecklistList(list, true)
      },
      [addCheckboxToListItem, markChecklistList]
    )

    const convertListToRegular = useCallback(
      (list: HTMLUListElement | HTMLOListElement) => {
        Array.from(list.children).forEach((child) => {
          if (child instanceof HTMLLIElement) {
            removeCheckboxFromListItem(child)
          }
        })
        markChecklistList(list, false)
      },
      [markChecklistList, removeCheckboxFromListItem]
    )

    const normalizeChecklistItems = useCallback(() => {
      if (!editorRef.current) return
      normalizeAllLists(editorRef.current)
    }, [])

    // Setup mutation observer for checklist normalization
    useEffect(() => {
      if (!editorRef.current) return
      
      const observer = new MutationObserver((mutations) => {
        const hasRelevantChanges = mutations.some(mutation => {
          if (mutation.target instanceof HTMLElement) {
            const target = mutation.target
            if (target.tagName === 'LI' || target.closest('li') || target.querySelector('li')) {
              return true
            }
          }
          
          for (const node of Array.from(mutation.addedNodes)) {
            if (node instanceof HTMLElement) {
              if (node.tagName === 'LI' || node.querySelector('li') || node.querySelector('input[type="checkbox"]')) {
                return true
              }
            }
          }
          
          return false
        })
        
        if (hasRelevantChanges) {
          scheduleChecklistNormalization()
        }
      })
      
      observer.observe(editorRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['checked', 'data-checked']
      })
      
      mutationObserverRef.current = observer
      
      return () => {
        observer.disconnect()
        if (checklistNormalizationTimerRef.current) {
          clearTimeout(checklistNormalizationTimerRef.current)
        }
        if (activeFormatsFrameRef.current !== null) {
          window.cancelAnimationFrame(activeFormatsFrameRef.current)
        }
      }
    }, [scheduleChecklistNormalization])

    const execCommand = useCallback(
      (command: string, valueArg?: string) => {
        if (disabled || !editorRef.current || !editorRef.current.isConnected) return
        
        // Prevent concurrent command execution to avoid race conditions
        if (isProcessingCommandRef.current) {
          console.warn('Command execution already in progress, skipping:', command)
          return
        }

        if (!ensureSelectionWithinBlock()) return
        
        isProcessingCommandRef.current = true
        
        try {
          const editor = editorRef.current
          const selection = window.getSelection()
          
          if (selection && selection.rangeCount > 0) {
            try {
              const range = selection.getRangeAt(0)
              if (range.startContainer.isConnected) {
                sanitizeInlineNodes(range)
              }
            } catch (e) {
              console.warn('Error sanitizing inline nodes:', e)
            }
          }
          
          switch (command) {
            case 'bold':
              applyInlineStyle('strong')
              break
            case 'italic':
              applyInlineStyle('em')
              break
            case 'underline':
              applyInlineStyle('u')
              break
            case 'strikeThrough':
              applyInlineStyle('s')
              break
            case 'formatBlock':
              if (valueArg) {
                const tag = valueArg.toLowerCase().replace(/[<>]/g, '')
                if (['p', 'h1', 'h2', 'h3', 'blockquote'].includes(tag)) {
                  applyBlockFormat(tag as 'p' | 'h1' | 'h2' | 'h3' | 'blockquote', editor)
                }
              }
              break
            case 'insertUnorderedList':
              if (editor.isConnected) {
                toggleListType('ul', editor)
              }
              break
            case 'insertOrderedList':
              if (editor.isConnected) {
                toggleListType('ol', editor)
              }
              break
            default:
              console.warn(`Unsupported rich text command: ${command}`)
          }
          
          if (editor.isConnected) {
            try {
              normalizeEditorContent(editor)
              mergeAdjacentLists(editor)
            } catch (e) {
              console.warn('Error normalizing content after command:', e)
            }
          }
          
          emitChange()
        } catch (error) {
          console.error('Error in execCommand:', error);
          // Try to recover gracefully
          try {
            if (editorRef.current && editorRef.current.isConnected) {
              normalizeEditorContent(editorRef.current);
            }
          } catch (e) {
            console.error('Failed to recover from execCommand error:', e);
          }
        } finally {
          // Reset the processing flag synchronously
          isProcessingCommandRef.current = false
        }
      },
      [disabled, emitChange, ensureSelectionWithinBlock]
    )

    const applyCode = useCallback(() => {
      if (disabled || !editorRef.current || !editorRef.current.isConnected) return
      
      if (!ensureSelectionWithinBlock()) return
      
      try {
        applyInlineStyle('code')
        
        if (editorRef.current && editorRef.current.isConnected) {
          try {
            normalizeEditorContent(editorRef.current)
          } catch (e) {
            console.warn('Error normalizing after code application:', e)
          }
        }
        
        emitChange()
      } catch (error) {
        console.error('Error in applyCode:', error);
      }
    }, [disabled, emitChange, ensureSelectionWithinBlock])

    const toggleChecklist = useCallback(() => {
      if (disabled || !editorRef.current || !editorRef.current.isConnected) return
      
      if (!ensureSelectionWithinBlock()) return
      
      const editor = editorRef.current
      
      try {
        toggleChecklistState(editor)
        
        if (editor.isConnected) {
          try {
            normalizeEditorContent(editor)
            mergeAdjacentLists(editor)
          } catch (e) {
            console.warn('Error normalizing after checklist toggle:', e)
          }
        }
        
        emitChange()
      } catch (error) {
        console.error('Error in toggleChecklist:', error);
      }
    }, [disabled, emitChange, ensureSelectionWithinBlock])

    /**
     * Apply heading format - improved with better cursor positioning
     * Uses applyBlockFormat from commandDispatcher with enhanced cursor management
     */
    const applyHeading = useCallback(
      (level: 1 | 2 | 3) => {
        if (disabled || !editorRef.current || !editorRef.current.isConnected) return
        
        if (!ensureSelectionWithinBlock()) return
        
        const editor = editorRef.current
        
        // Ensure focus before any operations (critical for WebView)
        try {
          editor.focus()
        } catch (e) {
          console.warn('Error focusing editor:', e)
          return
        }
        
        try {
          // Use the commandDispatcher's applyBlockFormat function
          // This already handles cursor positioning internally
          applyBlockFormat(`h${level}` as 'h1' | 'h2' | 'h3', editor)
          
          // Add heading ID after block format completes
          // Use EXTRA_LONG timing to ensure applyBlockFormat's cursor positioning (LONG=80ms) completes first
          // This prevents race conditions where we try to find the heading before cursor is properly restored
          setTimeout(() => {
            try {
              // Verify editor is still valid
              if (!editor.isConnected) {
                console.warn('Editor removed from DOM during heading operation')
                return
              }
              
              // Try to find the heading at the current cursor position first
              const selection = window.getSelection()
              let targetHeading: HTMLElement | null = null
              
              if (selection && selection.rangeCount > 0) {
                try {
                  const range = selection.getRangeAt(0)
                  if (!range.startContainer.isConnected) {
                    console.warn('Selection not connected during heading ID assignment')
                    return
                  }
                  
                  let node: Node | null = range.startContainer
                  
                  // Find the heading element containing the cursor
                  while (node && node !== editor) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                      const element = node as HTMLElement
                      const tagName = element.tagName?.toLowerCase()
                      if (tagName === `h${level}`) {
                        targetHeading = element
                        break
                      }
                    }
                    node = node.parentElement
                  }
                } catch (e) {
                  console.warn('Error finding heading element:', e)
                }
              }
              
              // If we found a heading at cursor position, assign ID to it
              // Only assign if the heading doesn't already have an ID
              if (targetHeading && targetHeading.isConnected && !targetHeading.id) {
                try {
                  targetHeading.id = generateHeadingId(targetHeading.textContent || '')
                } catch (e) {
                  console.warn('Error generating heading ID:', e)
                }
              }
              
              // Normalize and emit change once
              if (editor.isConnected) {
                try {
                  normalizeEditorContent(editor)
                } catch (e) {
                  console.warn('Error normalizing after heading:', e)
                }
              }
              emitChange()
            } catch (error) {
              console.error('Error in heading ID assignment:', error)
            }
          }, CURSOR_TIMING.EXTRA_LONG)
        } catch (error) {
          console.error('Error in applyHeading:', error)
          // Try to recover by normalizing
          try {
            if (editor.isConnected) {
              normalizeEditorContent(editor)
            }
          } catch (e) {
            console.error('Failed to recover from applyHeading error:', e)
          }
        }
      },
      [disabled, emitChange, ensureSelectionWithinBlock]
    )

    const getHeadings = useCallback(() => {
      if (!editorRef.current) return []
      const headings = editorRef.current.querySelectorAll('h1, h2, h3')
      return Array.from(headings).map((heading) => ({
        id: heading.id || '',
        level: parseInt(heading.tagName.substring(1)),
        text: heading.textContent || ''
      }))
    }, [])

    // Save current selection
    const saveSelection = useCallback(() => {
      savedSelectionRef.current = saveSelectionRange(editorRef.current)
    }, [])

    // Restore saved selection
    const restoreSelection = useCallback(() => {
      restoreSelectionRange(savedSelectionRef.current, editorRef.current)
    }, [])

    // Validate URL
    const validateUrl = useCallback((url: string): { valid: boolean; error: string } => {
      if (!url.trim()) {
        return { valid: false, error: 'URL is required' }
      }

      try {
        const trimmed = url.trim()
        const lowerTrimmed = trimmed.toLowerCase()
        
        // Check for common XSS patterns
        if (lowerTrimmed.startsWith('javascript:') || 
            lowerTrimmed.startsWith('data:') ||
            lowerTrimmed.startsWith('vbscript:')) {
          return { valid: false, error: 'Invalid or dangerous protocol' }
        }
        
        // Add protocol if missing
        let testUrl = trimmed
        if (!testUrl.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:/)) {
          testUrl = 'https://' + testUrl
        }
        
        const urlObj = new URL(testUrl)
        
        // Check for valid protocols only
        if (!['http:', 'https:', 'mailto:', 'tel:'].includes(urlObj.protocol)) {
          return { valid: false, error: 'Invalid protocol. Use http, https, mailto, or tel' }
        }
        
        // Additional validation for http/https
        if (['http:', 'https:'].includes(urlObj.protocol)) {
          if (!urlObj.hostname || urlObj.hostname.length < 2) {
            return { valid: false, error: 'Invalid hostname' }
          }
        }
        
        return { valid: true, error: '' }
      } catch (error) {
        console.error('URL validation error:', error)
        return { valid: false, error: 'Invalid URL format' }
      }
    }, [])

    // Normalize URL (add https:// if missing)
    const normalizeUrl = useCallback((url: string): string => {
      const trimmed = url.trim()
      if (!trimmed) return trimmed
      
      const lowerTrimmed = trimmed.toLowerCase()
      
      // Prevent XSS through URL
      if (lowerTrimmed.startsWith('javascript:') || 
          lowerTrimmed.startsWith('data:') ||
          lowerTrimmed.startsWith('vbscript:')) {
        return ''
      }
      
      if (!trimmed.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:/)) {
        return 'https://' + trimmed
      }
      
      return trimmed
    }, [])

    // Link functionality
    const insertLink = useCallback(() => {
      if (disabled) return

      const context = getSelectionContext(editorRef.current)
      if (!context) return

      const selectedText = context.range.toString()
      const existingLink = context.element.closest('a')

      if (existingLink) {
        setLinkUrl(existingLink.getAttribute('href') || '')
        setLinkText(existingLink.textContent || '')
      } else {
        setLinkUrl('')
        setLinkText(selectedText)
      }

      setLinkUrlError('')
      saveSelection()
      setShowLinkDialog(true)
    }, [disabled, saveSelection])

    const applyLink = useCallback(() => {
      try {
        // Validate URL
        const validation = validateUrl(linkUrl)
        if (!validation.valid) {
          setLinkUrlError(validation.error)
          return
        }

        const normalizedUrl = normalizeUrl(linkUrl)
        
        // Additional safety check
        if (!normalizedUrl) {
          setLinkUrlError('Invalid URL')
          return
        }
        
        restoreSelection()

        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
          console.warn('No selection available for link insertion')
          return
        }

        const range = selection.getRangeAt(0)
        const existingLink = getClosestFromSelection('a', editorRef.current)
        
        const parsedUrl = new URL(normalizedUrl)
        const shouldOpenInNewTab = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'

        if (existingLink) {
          existingLink.setAttribute('href', normalizedUrl)
          existingLink.textContent = linkText || normalizedUrl
          if (shouldOpenInNewTab) {
            existingLink.setAttribute('target', '_blank')
            existingLink.setAttribute('rel', 'noopener noreferrer')
          } else {
            existingLink.removeAttribute('target')
            existingLink.removeAttribute('rel')
          }
          existingLink.className = 'text-alpine-600 hover:text-alpine-800 underline decoration-alpine-400 decoration-2 underline-offset-2 transition-colors cursor-pointer inline-flex items-center gap-1'
        } else {
          const link = document.createElement('a')
          link.href = normalizedUrl
          if (shouldOpenInNewTab) {
            link.target = '_blank'
            link.rel = 'noopener noreferrer'
          }
          link.className = 'text-alpine-600 hover:text-alpine-800 underline decoration-alpine-400 decoration-2 underline-offset-2 transition-colors cursor-pointer inline-flex items-center gap-1'
          link.textContent = linkText || normalizedUrl

          if (range.collapsed) {
            range.insertNode(link)
          } else {
            range.deleteContents()
            range.insertNode(link)
          }
          
          // Position cursor after the link for better UX
          applyCursorOperation(() => {
            try {
              const newRange = document.createRange()
              newRange.setStartAfter(link)
              newRange.collapse(true)
              selection.removeAllRanges()
              selection.addRange(newRange)
            } catch (error) {
              console.warn('Error positioning cursor after link:', error)
            }
          }, CURSOR_TIMING.SHORT)
        }

        // Add to recent links
        addToRecentLinks(normalizedUrl, linkText || normalizedUrl)

        resetLinkDialog()
        emitChange()
        
        // Ensure focus returns to editor
        applyCursorOperation(() => {
          editorRef.current?.focus()
        }, CURSOR_TIMING.MEDIUM)
      } catch (error) {
        console.error('Error applying link:', error)
        setLinkUrlError('Failed to create link')
      }
    }, [linkUrl, linkText, restoreSelection, emitChange, validateUrl, normalizeUrl, addToRecentLinks, resetLinkDialog])

    // Edit link
    const editLink = useCallback((linkElement: HTMLAnchorElement) => {
      setLinkUrl(linkElement.getAttribute('href') || '')
      setLinkText(linkElement.textContent || '')
      setLinkUrlError('')
      hideLinkPopoverNow()
      
      // Select the link element
      const range = document.createRange()
      range.selectNodeContents(linkElement)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      
      saveSelection()
      setShowLinkDialog(true)
    }, [saveSelection, hideLinkPopoverNow])

    // Remove link
    const removeLink = useCallback((linkElement: HTMLAnchorElement) => {
      const text = linkElement.textContent || ''
      const textNode = document.createTextNode(text)
      linkElement.parentNode?.replaceChild(textNode, linkElement)
      hideLinkPopoverNow()
      emitChange()
    }, [emitChange, hideLinkPopoverNow])

    // Open link in new tab
    const openLink = useCallback((url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    }, [])

    // Search functionality
    const highlightMatch = useCallback((matchIndex: number) => {
      if (!editorRef.current || matchIndex < 0 || matchIndex >= searchMatches.length) return

      try {
        const match = searchMatches[matchIndex]
        const range = document.createRange()
        const selection = window.getSelection()
        
        if (!selection) {
          console.warn('No selection available for highlighting match')
          return
        }
        
        const walker = document.createTreeWalker(
          editorRef.current,
          NodeFilter.SHOW_TEXT,
          null
        )

        let currentPos = 0
        let node = walker.nextNode()

        while (node) {
          const nodeLength = node.textContent?.length || 0
          if (currentPos + nodeLength > match.index) {
            const rawOffset = match.index - currentPos
            const offset = Math.max(0, Math.min(rawOffset, nodeLength))
            const endOffset = Math.min(offset + match.length, nodeLength)
            
            // Set range with clamped offsets
            range.setStart(node, offset)
            range.setEnd(node, endOffset)
            break
          }
          currentPos += nodeLength
          node = walker.nextNode()
        }

        selection.removeAllRanges()
        selection.addRange(range)
        
        // Safely scroll into view
        const containerElement = range.startContainer.parentElement
        if (containerElement && containerElement.scrollIntoView) {
          containerElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          })
        }
      } catch (error) {
        console.error('Error highlighting match:', error)
      }
    }, [searchMatches])

    const performSearch = useCallback(() => {
      try {
        if (!editorRef.current || !searchQuery) {
          setSearchMatches([])
          return
        }

        const content = editorRef.current.textContent || ''
        const query = caseSensitive ? searchQuery : searchQuery.toLowerCase()
        const searchIn = caseSensitive ? content : content.toLowerCase()
        
        const matches: SearchMatch[] = []
        let index = searchIn.indexOf(query)
        
        // Limit matches to prevent performance issues
        let matchCount = 0
        
        while (index !== -1 && matchCount < MAX_SEARCH_MATCHES) {
          matches.push({
            index,
            length: searchQuery.length,
            text: content.substring(index, index + searchQuery.length)
          })
          index = searchIn.indexOf(query, index + 1)
          matchCount++
        }

        if (matchCount >= MAX_SEARCH_MATCHES) {
          console.warn(`Search limited to ${MAX_SEARCH_MATCHES} matches`)
        }

        setSearchMatches(matches)
        setCurrentMatchIndex(0)
        
        if (matches.length > 0) {
          highlightMatch(0)
        }
      } catch (error) {
        console.error('Error performing search:', error)
        setSearchMatches([])
      }
    }, [searchQuery, caseSensitive, highlightMatch])

    const nextMatch = useCallback(() => {
      try {
        if (searchMatches.length === 0) return
        const nextIndex = (currentMatchIndex + 1) % searchMatches.length
        setCurrentMatchIndex(nextIndex)
        highlightMatch(nextIndex)
      } catch (error) {
        console.error('Error navigating to next match:', error)
      }
    }, [currentMatchIndex, searchMatches, highlightMatch])

    const previousMatch = useCallback(() => {
      try {
        if (searchMatches.length === 0) return
        const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length
        setCurrentMatchIndex(prevIndex)
        highlightMatch(prevIndex)
      } catch (error) {
        console.error('Error navigating to previous match:', error)
      }
    }, [currentMatchIndex, searchMatches, highlightMatch])

    const replaceCurrentMatch = useCallback(() => {
      if (searchMatches.length === 0 || !editorRef.current) return
      
      try {
        highlightMatch(currentMatchIndex)
        const replaced = insertPlainTextAtSelection(replaceQuery)

        if (replaced) {
          normalizeEditorContent(editorRef.current)
          mergeAdjacentLists(editorRef.current)
          scheduleChecklistNormalization()
        }
        
        emitChange()
        performSearch()
      } catch (error) {
        console.error('Error replacing current match:', error)
      }
    }, [currentMatchIndex, replaceQuery, searchMatches, highlightMatch, insertPlainTextAtSelection, emitChange, performSearch, scheduleChecklistNormalization])

    const replaceAllMatches = useCallback(() => {
      if (!editorRef.current || !searchQuery) return
      
      try {
        const contentRoot = editorRef.current
        const flags = caseSensitive ? 'g' : 'gi'
        
        // Escape special regex characters
        const escapedQuery = searchQuery.replace(REGEX_ESCAPE_PATTERN, '\\$&')
        const regex = new RegExp(escapedQuery, flags)
        
        const textNodes: Text[] = []
        const walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT, null)
        let node = walker.nextNode()

        while (node) {
          if (node.nodeType === Node.TEXT_NODE) {
            textNodes.push(node as Text)
          }
          node = walker.nextNode()
        }

        let matchCount = 0
        textNodes.forEach((textNode) => {
          const value = textNode.textContent || ''
          if (!value) return
          const matches = value.match(regex)
          if (matches) {
            matchCount += matches.length
          }
        })
        
        if (matchCount >= MAX_REPLACE_MATCHES) {
          console.warn(`Too many matches (${matchCount}+) for replace all operation, limit is ${MAX_REPLACE_MATCHES}`)
          return
        }

        if (matchCount === 0) {
          return
        }
        
        // Replace text-only nodes to avoid corrupting HTML structure/attributes
        textNodes.forEach((textNode) => {
          const value = textNode.textContent || ''
          if (!value) return
          textNode.textContent = value.replace(regex, replaceQuery)
        })

        normalizeEditorContent(editorRef.current)
        mergeAdjacentLists(editorRef.current)
        scheduleChecklistNormalization()
        emitChange()
        performSearch()
      } catch (error) {
        console.error('Error replacing all matches:', error)
      }
    }, [searchQuery, replaceQuery, caseSensitive, emitChange, performSearch, scheduleChecklistNormalization])

    // Horizontal rule
    const insertHorizontalRule = useCallback(() => {
      if (disabled || !editorRef.current || !editorRef.current.isConnected) return
      
      if (!ensureSelectionWithinBlock()) return
      
      const editor = editorRef.current
      
      try {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
          console.warn('No selection for horizontal rule insertion')
          return
        }
        
        const range = selection.getRangeAt(0)
        
        // Validate range is connected
        if (!range.startContainer.isConnected) {
          console.warn('Selection not connected for horizontal rule')
          return
        }
        
        const hr = document.createElement('hr')
        
        try {
          range.insertNode(hr)
        } catch (e) {
          console.error('Error inserting horizontal rule node:', e)
          return
        }
        
        const p = document.createElement('p')
        p.appendChild(document.createElement('br'))
        
        if (hr.parentNode && hr.isConnected) {
          try {
            hr.parentNode.insertBefore(p, hr.nextSibling)
            
            // Use improved cursor positioning with validation
            if (p.isConnected && editor.isConnected) {
              positionCursorInElement(p, 'start', editor)
            }
          } catch (e) {
            console.error('Error inserting paragraph after hr:', e)
          }
        } else {
          console.warn('Horizontal rule has no parent or not connected, cannot insert paragraph')
        }
        
        emitChange()
      } catch (error) {
        console.error('Error inserting horizontal rule:', error)
      }
    }, [disabled, emitChange, ensureSelectionWithinBlock])

    const createRootLevelBlock = useCallback(() => {
      if (!editorRef.current || !editorRef.current.isConnected) return null

      try {
        const editor = editorRef.current
        
        const newBlock = document.createElement('div')
        newBlock.setAttribute('data-block', 'true')
        newBlock.className = BLOCK_ROOT_CLASS

        const paragraph = document.createElement('p')
        paragraph.appendChild(document.createElement('br'))
        newBlock.appendChild(paragraph)

        const selection = window.getSelection()
        let anchorBlock: HTMLElement | null = null
        if (selection && selection.rangeCount > 0) {
          try {
            const anchorNode = selection.getRangeAt(0).startContainer
            if (anchorNode.isConnected) {
              anchorBlock = (anchorNode instanceof HTMLElement ? anchorNode : anchorNode.parentElement)?.closest(
                '[data-block-id]'
              ) as HTMLElement | null
            }
          } catch (e) {
            console.warn('Error getting anchor block:', e)
          }
        }

        try {
          if (anchorBlock && anchorBlock.isConnected && anchorBlock.parentElement === editor) {
            anchorBlock.insertAdjacentElement('afterend', newBlock)
          } else {
            editor.appendChild(newBlock)
          }
        } catch (e) {
          console.error('Error inserting new block:', e)
          return null
        }

        ensureBlockId(newBlock)
        
        // Verify block was successfully inserted
        if (!newBlock.isConnected) {
          console.warn('New block not connected after insertion')
          return null
        }
        
        const target = (newBlock.querySelector('p, div, span') as HTMLElement | null) ?? newBlock
        
        try {
          positionCursorInElement(target, 'start', editor)
        } catch (e) {
          console.warn('Error positioning cursor in new block:', e)
        }
        
        try {
          normalizeEditorContent(editor)
        } catch (e) {
          console.warn('Error normalizing editor content:', e)
        }
        
        emitChange()
        updateBlockMetadata()
        return newBlock
      } catch (error) {
        console.error('Error creating root level block:', error)
        return null
      }
    }, [emitChange, ensureBlockId, updateBlockMetadata])

    const deleteActiveBlock = useCallback(() => {
      if (!editorRef.current || !editorRef.current.isConnected || !activeBlockId) return

      try {
        const editor = editorRef.current
        const escapeSelector = (value: string) =>
          value.replace(/[\\"]/g, '\\$&')
        const block = editor.querySelector(
          `[data-block-id="${escapeSelector(activeBlockId)}"]`
        ) as HTMLElement | null
        if (!block) return

        // Determine the sibling to focus after deletion
        const nextSibling = block.nextElementSibling as HTMLElement | null
        const prevSibling = block.previousElementSibling as HTMLElement | null
        const targetSibling = nextSibling || prevSibling

        block.remove()

        // Ensure there is always at least one block left
        if (!editor.querySelector('[data-block]')) {
          const newBlock = createEmptyBlock()
          editor.appendChild(newBlock)
          ensureBlockId(newBlock)
          const focusTarget = (newBlock.querySelector('p, div, span') as HTMLElement | null) ?? newBlock
          positionCursorInElement(focusTarget, 'start', editor)
          setActiveBlockId(newBlock.getAttribute('data-block-id'))
        } else if (targetSibling) {
          ensureBlockId(targetSibling)
          const focusTarget = (targetSibling.querySelector('p, div, span, li, blockquote') as HTMLElement | null) ?? targetSibling
          positionCursorInElement(focusTarget, 'start', editor)
          setActiveBlockId(targetSibling.getAttribute('data-block-id'))
        }

        emitChange()
        updateBlockMetadata()
      } catch (error) {
        console.error('Error deleting active block:', error)
      }
    }, [activeBlockId, createEmptyBlock, emitChange, ensureBlockId, updateBlockMetadata])

    /**
     * Ensure the editor always has at least one block for writing
     * Creates a default block if the editor is empty
     */
    const ensureDefaultBlock = useCallback(() => {
      enforceBlockStructure({ preserveSelection: true, forceCursorInside: true })
    }, [enforceBlockStructure])

    const applyHistoryAction = useCallback(
      (action: 'undo' | 'redo') => {
        if (!historyManagerRef.current) return

        if (action === 'undo') {
          historyManagerRef.current.undo()
        } else {
          historyManagerRef.current.redo()
        }

        enforceBlockStructure({ preserveSelection: true, forceCursorInside: true })
        emitChange()
      },
      [emitChange, enforceBlockStructure]
    )

    /**
     * Execute a rich text command
     * This is the main entry point for all formatting commands
     */
    const executeRichTextCommand = useCallback((cmd: RichTextCommand) => {
      switch (cmd) {
        case 'bold':
          execCommand('bold')
          break
        case 'italic':
          execCommand('italic')
          break
        case 'underline':
          execCommand('underline')
          break
        case 'strike':
          execCommand('strikeThrough')
          break
        case 'code':
          applyCode()
          break
        case 'unordered-list':
          execCommand('insertUnorderedList')
          break
        case 'ordered-list':
          execCommand('insertOrderedList')
          break
        case 'blockquote':
          execCommand('formatBlock', 'blockquote')
          break
        case 'checklist':
          toggleChecklist()
          break
        case 'heading1':
          applyHeading(1)
          break
        case 'heading2':
          applyHeading(2)
          break
        case 'heading3':
          applyHeading(3)
          break
        case 'horizontal-rule':
          insertHorizontalRule()
          break
        case 'link':
          insertLink()
          break
        case 'undo':
          applyHistoryAction('undo')
          break
        case 'redo':
          applyHistoryAction('redo')
          break
      }
    }, [execCommand, applyCode, toggleChecklist, applyHeading, insertHorizontalRule, insertLink, applyHistoryAction])

    const handleBlockTypeChange = useCallback((value: string) => {
      if (disabled || !editorRef.current || !editorRef.current.isConnected) return
      
      try {
        switch (value) {
          case 'heading1':
            applyHeading(1)
            break
          case 'heading2':
            applyHeading(2)
            break
          case 'heading3':
            applyHeading(3)
            break
          case 'blockquote':
            execCommand('formatBlock', 'blockquote')
            break
          case 'paragraph':
          case 'p':
            execCommand('formatBlock', 'p')
            break
          default:
            console.warn('Unknown block type:', value)
        }
      } catch (error) {
        console.error('Error in handleBlockTypeChange:', error)
      }
    }, [disabled, applyHeading, execCommand])

    const scrollToHeading = useCallback((headingId: string) => {
      if (!editorRef.current || !headingId) return
      
      const escapedId = typeof CSS !== 'undefined' && CSS.escape 
        ? CSS.escape(headingId)
        : headingId.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&')
      const heading = editorRef.current.querySelector(`#${escapedId}`)
      if (heading && heading instanceof HTMLElement) {
        const editorRect = editorRef.current.getBoundingClientRect()
        const headingRect = heading.getBoundingClientRect()
        
        const scrollTop = editorRef.current.scrollTop + (headingRect.top - editorRect.top) - 16
        
        editorRef.current.scrollTo({
          top: scrollTop,
          behavior: 'smooth'
        })
      }
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        focus: () => editorRef.current?.focus(),
        getHTML: () => sanitize(editorRef.current?.innerHTML ?? ''),
        getMarkdown: () => htmlToMarkdown(editorRef.current?.innerHTML ?? ''),
        getHeadings,
        getRootElement: () => editorRef.current,
        scrollToHeading,
        queryCommandState: (command: string) => {
          try {
            const context = getSelectionContext(editorRef.current)
            const element = context?.element
            if (!element) return false
            
            switch (command) {
              case 'bold':
                return !!element?.closest('strong, b')
              case 'italic':
                return !!element?.closest('em, i')
              case 'underline':
                return !!element?.closest('u')
              case 'strikeThrough':
                return !!element?.closest('s, strike')
              case 'code':
                return !!element?.closest('code')
              case 'insertUnorderedList':
                return !!element?.closest('ul')
              case 'insertOrderedList':
                return !!element?.closest('ol')
              case 'heading1':
                return !!element?.closest('h1')
              case 'heading2':
                return !!element?.closest('h2')
              case 'heading3':
                return !!element?.closest('h3')
              case 'blockquote':
                return !!element?.closest('blockquote')
              default:
                try {
                  return document.queryCommandState?.(command) ?? false
                } catch {
                  return false
                }
            }
          } catch {
            return false
          }
        },
        showLinkDialog: () => {
          insertLink()
        },
        showSearchDialog: () => {
          setShowSearchDialog(true)
        },
        showTableDialog: () => {
          saveSelection()
          openTableDialog(3, 3)
        },
        requestNoteLink: () => {
          saveSelection()
          onCustomCommand?.('note-link')
        },
        insertCustomBlock: (type: string, payload?: any) => {
          return insertCustomBlock(type, payload)
        },
        getBlockPayloads: () => {
          if (!editorRef.current) return []
          const nodes = Array.from(editorRef.current.querySelectorAll('[data-block][data-block-type]'))
          return nodes.map((n) => {
            const type = n.getAttribute('data-block-type') || ''
            const raw = n.getAttribute('data-block-payload')
            let payload: any = undefined
            if (raw) {
              try {
                payload = JSON.parse(decodeURIComponent(raw))
              } catch {}
            }
            return { type, payload, node: n }
          })
        },
        exec: (command: RichTextCommand) => {
          executeRichTextCommand(command)
        }
      }),
      [sanitize, getHeadings, scrollToHeading, executeRichTextCommand, insertCustomBlock, saveSelection, onCustomCommand, insertLink, openTableDialog]
    )

    // Initialize history manager
    useEffect(() => {
      if (editorRef.current && !historyManagerRef.current) {
        const manager = new HistoryManager(editorRef.current)
        manager.initialize()
        historyManagerRef.current = manager
        debouncedCaptureRef.current = createDebouncedCapture(manager)
      }
    }, [])

    useEffect(() => {
      if (!editorRef.current) return

      try {
        const editorEl = editorRef.current
        
        // Validate editor is still connected to DOM
        if (!editorEl.isConnected) {
          console.warn('Editor not connected to DOM during value sync')
          return
        }
        
        const sanitizedValue = sanitize(value || '')

        // Only update if value has actually changed to prevent unnecessary renders
        if (lastSyncedValueRef.current !== sanitizedValue) {
          // Skip DOM clobbering when the editor is focused – the user is
          // actively typing and the DOM is the source of truth.  The only
          // time we need to force-write innerHTML is when an *external*
          // source changed the value (e.g. loading a different note, undo
          // from the parent, or a collaborative update).
          const editorHasFocus = editorEl === document.activeElement || editorEl.contains(document.activeElement)
          if (editorHasFocus) {
            // The parent state will catch up on the next emitChange – just
            // update our tracking ref so we don't keep re-entering.
            lastSyncedValueRef.current = sanitizedValue
            return
          }

          // Store cursor position before update
          const savedCursorPos = saveCursorPosition()
          
          editorEl.innerHTML = sanitizedValue
          lastSyncedValueRef.current = sanitizedValue
          
          // Restore cursor position after update if it was valid
          if (savedCursorPos) {
            try {
              restoreCursorPosition(savedCursorPos, editorEl)
            } catch (error) {
              console.warn('Could not restore cursor position:', error)
            }
          }
          
          if (historyManagerRef.current) {
            try {
              historyManagerRef.current.capture()
            } catch (error) {
              console.error('Error capturing history:', error)
            }
          }

          // Only run post-sync maintenance when we actually wrote innerHTML
          scheduleChecklistNormalization()
          rehydrateExistingBlocks()
          updateBlockMetadata()
        }

        // Ensure editor always has a default block when empty
        ensureDefaultBlock()
      } catch (error) {
        console.error('Error synchronizing editor value:', error)
      }
    }, [sanitize, value, scheduleChecklistNormalization, rehydrateExistingBlocks, updateBlockMetadata, ensureDefaultBlock])

    useEffect(() => {
      if (!editorRef.current) return

      const handleCheckboxChange = (event: Event) => {
        const target = event.target as HTMLInputElement | null
        if (!target || target.type !== 'checkbox') return
        target.setAttribute('data-checked', target.checked ? 'true' : 'false')
        if (target.checked) {
          target.setAttribute('checked', 'true')
        } else {
          target.removeAttribute('checked')
        }
        // Update progress on the parent checklist
        const parentList = getClosestList(target)
        if (parentList) {
          updateChecklistProgress(parentList)
        }
        emitChange()
      }

      const el = editorRef.current
      el.addEventListener('change', handleCheckboxChange)
      return () => {
        el.removeEventListener('change', handleCheckboxChange)
      }
    }, [emitChange])

    // Initialize image block interactions (resize and delete)
    useEffect(() => {
      if (!editorRef.current) return
      
      // Dynamically import and initialize image block interactions
      let cleanupFn: (() => void) | undefined = undefined
      
      const initImageBlocks = async () => {
        try {
          const { initializeImageBlockInteractions } = await import('@/lib/editor/imageBlock')
          cleanupFn = initializeImageBlockInteractions(editorRef.current!, emitChange)
        } catch (error) {
          console.error('Failed to initialize image block interactions:', error)
        }
      }
      
      initImageBlocks()
      
      return () => {
        if (cleanupFn) {
          cleanupFn()
        }
      }
    }, [emitChange])

    // Initialize list drag-to-reorder
    useEffect(() => {
      if (!editorRef.current) return
      const cleanup = initListDragReorder(editorRef.current, () => {
        if (editorRef.current) {
          normalizeAllLists(editorRef.current)
        }
        emitChange()
      })
      return cleanup
    }, [emitChange])

    const handleInput = () => {
      try {
        // Validate editor is still connected to DOM
        if (!editorRef.current || !editorRef.current.isConnected) {
          console.warn('Editor disconnected during input')
          return
        }
        enforceBlockStructure({ preserveSelection: true, forceCursorInside: true })
        emitChange()
      } catch (error) {
        console.error('Error in handleInput:', error)
      }
    }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    try {
      // Validate editor state
      if (disabled || !editorRef.current || !editorRef.current.isConnected) {
        return
      }

      if (!ensureSelectionWithinBlock()) {
        return
      }

      // Handle autoformatting
      if (autoformatEnabled && shouldApplyAutoformat(event.nativeEvent)) {
        try {
          const selection = window.getSelection()
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            const node = range.startContainer
            
            // Check for inline autoformatting (bold, italic, etc.)
            if (node.nodeType === Node.TEXT_NODE && event.key === ' ') {
              const textNode = node as Text
              const cursorOffset = range.startOffset
              
              if (applyAutoformat(textNode, cursorOffset)) {
                event.preventDefault()
                emitChange()
                return
              }
            }
            
            // Check for list prefix patterns (at start of line)
            if (event.key === ' ') {
              const textNode = node.nodeType === Node.TEXT_NODE ? node as Text : null
              if (textNode) {
                const text = textNode.textContent?.substring(0, range.startOffset) || ''
                const lineStart = text.lastIndexOf('\n') + 1
                const lineText = text.substring(lineStart)
                const action = checkListPrefixPattern(lineText)
                
                if (action) {
                  event.preventDefault()
                  
                  // Remove the pattern text
                  const patternLength = lineText.length
                  const removeRange = document.createRange()
                  removeRange.setStart(textNode, range.startOffset - patternLength)
                  removeRange.setEnd(textNode, range.startOffset)
                  removeRange.deleteContents()
                  
                  // Apply the formatting
                  switch (action) {
                    case 'unordered-list':
                      execCommand('insertUnorderedList')
                      break
                    case 'ordered-list':
                      execCommand('insertOrderedList')
                      break
                    case 'checklist':
                      toggleChecklist()
                      break
                    case 'heading1':
                      applyHeading(1)
                      break
                    case 'heading2':
                      applyHeading(2)
                      break
                    case 'heading3':
                      applyHeading(3)
                      break
                    case 'blockquote':
                      execCommand('formatBlock', 'blockquote')
                      break
                    case 'horizontal-rule':
                      insertHorizontalRule()
                      break
                  }
                  
                  emitChange()
                  return
                }
              }
            }
          }
        } catch (error) {
          console.error('Error in autoformatting:', error)
        }
      }
      
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        try {
          event.preventDefault()
          createRootLevelBlock()
          return
        } catch (error) {
          console.error('Error creating root level block:', error)
        }
      }

      // Handle Tab/Shift+Tab for list indent/outdent
      if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        try {
          const selection = window.getSelection()
          if (selection && selection.anchorNode) {
            const li = getClosestListItem(selection.anchorNode)
            if (li) {
              event.preventDefault()
              const editor = editorRef.current
              if (event.shiftKey) {
                outdentListItems(editor)
              } else {
                indentListItems(editor)
              }
              normalizeAllLists(editor)
              emitChange()
              return
            }
          }
        } catch (error) {
          console.error('Error handling Tab indent/outdent:', error)
        }
      }

      // Handle Backspace at start of list item
      if (event.key === 'Backspace' && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        try {
          const editor = editorRef.current
          if (handleListBackspace(editor)) {
            event.preventDefault()
            normalizeAllLists(editor)
            emitChange()
            return
          }
        } catch (error) {
          console.error('Error handling list Backspace:', error)
        }
      }

      // Handle Enter key for list items (bullet, ordered, checklist)
      if (event.key === 'Enter' && !event.shiftKey) {
        try {
          const selection = window.getSelection()
          if (!selection || !selection.anchorNode) {
            return
          }
          
          const currentListItem = getClosestListItem(selection.anchorNode)
          if (currentListItem && currentListItem.isConnected) {
            const editor = editorRef.current
            if (handleListEnter(editor)) {
              event.preventDefault()
              normalizeAllLists(editor)
              emitChange()
              return
            }
          }
        } catch (error) {
          console.error('Error handling list Enter key:', error)
        }
      }

      // Handle keyboard shortcuts
      try {
        if (!(event.metaKey || event.ctrlKey)) return
        const key = event.key.toLowerCase()

        if (key === 'b' && !event.shiftKey) {
          event.preventDefault()
          execCommand('bold')
        } else if (key === 'i') {
          event.preventDefault()
          execCommand('italic')
        } else if (key === 'u') {
          event.preventDefault()
          execCommand('underline')
        } else if (event.shiftKey && key === 'x') {
          event.preventDefault()
          execCommand('strikeThrough')
        } else if (event.shiftKey && key === 'c') {
          event.preventDefault()
          toggleChecklist()
        } else if (event.shiftKey && key === 'b') {
          event.preventDefault()
          execCommand('formatBlock', 'blockquote')
        } else if (event.shiftKey && key === 'l') {
          event.preventDefault()
          execCommand('insertUnorderedList')
        } else if (event.shiftKey && key === 'o') {
          event.preventDefault()
          execCommand('insertOrderedList')
        } else if (event.altKey && key === '1') {
          event.preventDefault()
          applyHeading(1)
        } else if (event.altKey && key === '2') {
          event.preventDefault()
          applyHeading(2)
        } else if (event.altKey && key === '3') {
          event.preventDefault()
          applyHeading(3)
        } else if (key === '`') {
          event.preventDefault()
          applyCode()
        } else if (key === 'k') {
          event.preventDefault()
          insertLink()
        } else if (key === 'f') {
          event.preventDefault()
          setShowSearchDialog(true)
        } else if (key === 'z') {
          event.preventDefault()
          if (event.shiftKey) {
            applyHistoryAction('redo')
          } else {
            applyHistoryAction('undo')
          }
        }
      } catch (error) {
        console.error('Error handling keyboard shortcut:', error)
      }
    } catch (error) {
      console.error('Critical error in handleKeyDown:', error)
    }
  }

    const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
      if (disabled) return
      event.preventDefault()

      try {
        const finalizeInsertion = () => {
          try {
            if (editorRef.current) {
              enforceBlockStructure({ preserveSelection: true, forceCursorInside: true })
              normalizeEditorContent(editorRef.current)
              mergeAdjacentLists(editorRef.current)
            }
            scheduleChecklistNormalization()
            emitChange()
          } catch (error) {
            console.error('Error finalizing paste:', error);
          }
        }

        const html = event.clipboardData.getData('text/html')
        const text = event.clipboardData.getData('text/plain')

        if (html) {
          try {
            const sanitized = sanitize(html)
            if (insertHTMLAtSelection(sanitized)) {
              finalizeInsertion()
            }
          } catch (error) {
            console.error('Error pasting HTML:', error);
            // Fallback to plain text
            if (text && insertPlainTextAtSelection(text)) {
              finalizeInsertion()
            }
          }
          return
        }

        if (!text) {
          return
        }

        if (looksLikeMarkdown(text)) {
          const selectionSnapshot = saveSelectionUtil()
          markdownToHtml(text).then((convertedHtml) => {
            try {
              if (selectionSnapshot) {
                restoreSelectionUtil(selectionSnapshot)
              }

              const sanitized = sanitize(convertedHtml)
              if (insertHTMLAtSelection(sanitized)) {
                finalizeInsertion()
              }
            } catch (error) {
              console.error('Error pasting markdown:', error);
            }
          }).catch(error => {
            console.error('Error converting markdown:', error);
            // Fallback to plain text
            try {
              if (insertPlainTextAtSelection(text)) {
                finalizeInsertion()
              }
            } catch (e) {
              console.error('Error in markdown fallback:', e);
            }
          })
          return
        }

        const trimmed = text.trim()
        const urlPattern = /^https?:\/\/.+/i

        if (urlPattern.test(trimmed)) {
          try {
            const selection = window.getSelection()
            const selectedText = selection?.toString()

            if (selectedText && selectedText.length > 0 && selection && selection.rangeCount > 0) {
              const link = document.createElement('a')
              link.href = trimmed
              link.target = '_blank'
              link.rel = 'noopener noreferrer'
              link.textContent = selectedText

              const range = selection.getRangeAt(0)
              range.deleteContents()
              range.insertNode(link)

              const newRange = document.createRange()
              if (link.childNodes.length > 0) {
                newRange.setStart(link, link.childNodes.length)
              } else {
                newRange.setStartAfter(link)
              }
              newRange.collapse(true)
              selection.removeAllRanges()
              selection.addRange(newRange)

              finalizeInsertion()
              return
            }

            const fragment = document.createDocumentFragment()
            const anchor = document.createElement('a')
            anchor.href = trimmed
            anchor.target = '_blank'
            anchor.rel = 'noopener noreferrer'
            anchor.textContent = trimmed
            fragment.appendChild(anchor)

            if (insertFragmentAtSelection(fragment)) {
              finalizeInsertion()
            }
          } catch (error) {
            console.error('Error pasting URL:', error);
            // Fallback to plain text
            if (insertPlainTextAtSelection(text)) {
              finalizeInsertion()
            }
          }
          return
        }

        if (insertPlainTextAtSelection(text)) {
          finalizeInsertion()
        }
      } catch (error) {
        console.error('Critical error in handlePaste:', error);
      }
    }

    const toolbarButtonClass =
      'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-white text-slate-600 shadow-sm hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alpine-500 disabled:opacity-40'

    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <EditorToolbar
          onCommand={executeRichTextCommand}
          onBlockTypeChange={handleBlockTypeChange}
          onUndo={() => applyHistoryAction('undo')}
          onRedo={() => applyHistoryAction('redo')}
          onNewBlock={createRootLevelBlock}
          onDeleteBlock={deleteActiveBlock}
          onToggleBlockPanel={() => setBlockPanelOpen((prev) => !prev)}
          onToggleBlockOutlines={() => setShowBlockOutlines((prev) => !prev)}
          blockPanelOpen={blockPanelOpen}
          showBlockOutlines={showBlockOutlines}
          activeBlockId={activeBlockId}
          activeBlockType={blockMetadata.find((block) => block.id === activeBlockId)?.type}
          activeFormats={activeFormats}
          disabled={disabled}
        />

        <div className="flex-1 min-h-0 overflow-hidden">
          <div
            ref={editorRef}
            className="h-full w-full overflow-y-auto whitespace-pre-wrap break-words p-3 focus:outline-none sm:p-4"
            contentEditable={!disabled}
            data-placeholder={placeholder}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            suppressContentEditableWarning
            spellCheck
            role="textbox"
            aria-label="Rich text editor"
            aria-multiline="true"
            aria-disabled={disabled}
          />

          {blockPanelOpen && (
            <div className="fixed right-4 top-24 z-50 w-80 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Block navigator</p>
                  <p className="text-xs text-slate-500">{blockMetadata.length} blocks</p>
                </div>
                <button
                  className="text-slate-400 transition hover:text-slate-600"
                  onClick={() => setBlockPanelOpen(false)}
                  aria-label="Close block navigator"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {blockMetadata.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-500">Start typing to create blocks.</p>
                ) : (
                  blockMetadata.map((block) => (
                    <button
                      key={block.id}
                      className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-slate-50 ${
                        activeBlockId === block.id ? 'bg-alpine-50/80 ring-1 ring-alpine-200' : ''
                      }`}
                      onClick={() => focusBlockById(block.id)}
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <span>Block {block.index}</span>
                        <span>{block.type}</span>
                      </div>
                      <p className="text-sm text-slate-700">
                        {block.textPreview}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <LinkDialog
          isOpen={showLinkDialog}
          linkUrl={linkUrl}
          linkText={linkText}
          linkUrlError={linkUrlError}
          recentLinks={recentLinks}
          onClose={resetLinkDialog}
          onApply={applyLink}
          onUrlChange={(value) => {
            setLinkUrl(value)
            setLinkUrlError('')
          }}
          onTextChange={setLinkText}
          onUseRecent={(recent) => {
            setLinkUrl(recent.url)
            setLinkText(recent.text)
            setLinkUrlError('')
          }}
        />

        <LinkPopover
          isOpen={showLinkPopover}
          top={linkPopoverPos.top}
          left={linkPopoverPos.left}
          linkElement={hoveredLinkElement}
          copiedLink={copiedLink}
          onMouseEnter={keepPopoverOpen}
          onMouseLeave={hideLinkPopover}
          onOpen={openLink}
          onEdit={editLink}
          onCopy={copyLinkUrl}
          onRemove={removeLink}
        />

        <SearchReplaceDialog
          isOpen={showSearchDialog}
          searchQuery={searchQuery}
          replaceQuery={replaceQuery}
          caseSensitive={caseSensitive}
          searchMatchesCount={searchMatches.length}
          currentMatchIndex={currentMatchIndex}
          onClose={resetSearchDialog}
          onSearchQueryChange={setSearchQuery}
          onReplaceQueryChange={setReplaceQuery}
          onCaseSensitiveChange={setCaseSensitive}
          onFind={performSearch}
          onPrevious={previousMatch}
          onNext={nextMatch}
          onReplace={replaceCurrentMatch}
          onReplaceAll={replaceAllMatches}
        />
        <TableInsertDialog
          isOpen={showTableDialog}
          tableRows={tableRows}
          tableCols={tableCols}
          hoverRows={hoverRows}
          hoverCols={hoverCols}
          onClose={closeTableDialog}
          onHoverCell={(rows, cols) => {
            setHoverRows(rows)
            setHoverCols(cols)
          }}
          onHoverLeave={() => {
            setHoverRows(null)
            setHoverCols(null)
          }}
          onSelectSize={(rows, cols) => {
            setTableRows(rows)
            setTableCols(cols)
          }}
          onInsert={() => {
            closeTableDialog()
            insertCustomBlock('table', { rows: tableRows, cols: tableCols })
            forceWebViewFocus()
          }}
        />
        <TableToolbar
          isVisible={tableToolbarVisible}
          top={tableToolbarPos.top}
          left={tableToolbarPos.left}
          dimensionsLabel={getTableDimensionsLabel()}
          onAddRow={addTableRow}
          onDeleteRow={deleteTableRow}
          onAddCol={addTableCol}
          onDeleteCol={deleteTableCol}
          onDeleteTable={deleteTable}
        />
        <style jsx global>{`
          [data-block-outline='true'] {
            outline: 2px dashed rgba(59, 130, 246, 0.75);
            outline-offset: 6px;
            border-radius: 12px;
          }
        `}</style>
      </div>
    )
  }
)

RichTextEditor.displayName = 'RichTextEditor'

export default RichTextEditor