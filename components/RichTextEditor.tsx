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
  normalizeEditorContent,
  sanitizeInlineNodes
} from '@/lib/editor/domNormalizer'
import {
  toggleListType,
  toggleChecklistState,
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
  | `highlight:${string}`
  | `color:${string}`
  | `font-size:${string}`

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
  customBlocks?: CustomBlockDescriptor[]
  onCustomCommand?: (commandId: string) => void
}

const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: [
    'a', 'b', 'strong', 'i', 'em', 'u', 's', 'code', 'pre', 'p', 'br',
    'div', 'span', 'blockquote', 'ul', 'ol', 'li', 'hr', 'input',
    'h1', 'h2', 'h3', 'mark', 'img', 'button', 'svg', 'path', 'table',
    'thead', 'tbody', 'tr', 'td', 'th'
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'type', 'checked', 'data-checked',
    'id', 'data-block', 'data-block-type', 'data-block-payload',
    'data-note-id', 'data-note-title', 'data-folder-id',
    'data-file-path', 'data-file-name', 'src', 'alt', 'width', 'height',
    'data-direction', 'aria-label', 'title', 'draggable',
    'contenteditable', 'xmlns', 'viewBox', 'fill', 'stroke',
    'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd',
    'colspan', 'rowspan', 'data-checklist'
  ],
  ALLOW_DATA_ATTR: true
}

// Type describing a custom block renderer/parser that callers can register
export interface CustomBlockDescriptor {
  type: string
  render: (payload?: any) => string
  parse?: (el: HTMLElement) => any
}

// Performance limits
const MAX_SEARCH_MATCHES = 1000
const MAX_REPLACE_MATCHES = 1000

// Regex patterns
const REGEX_ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g
const EXTRA_BLANK_LINES_PATTERN = /\n{3,}/g
const ZERO_WIDTH_CHARS_PATTERN = /[\u200B-\u200D\uFEFF]/g

const BASIC_PASTE_WRAPPER_TAGS = new Set(['DIV', 'P', 'SPAN', 'BR'])
const SEMANTIC_PASTE_SELECTOR =
  'a,ul,ol,li,pre,code,blockquote,table,thead,tbody,tr,td,th,h1,h2,h3,h4,h5,h6,img,hr,strong,b,em,i,u,s,mark,[data-block],[data-block-type]'

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

const normalizePastedText = (text: string): string => {
  const normalizedLineEndings = text.replace(/\r\n?|\u2028|\u2029/g, '\n')
  const withoutInvisible = normalizedLineEndings
    .replace(/\u00A0/g, ' ')
    .replace(ZERO_WIDTH_CHARS_PATTERN, '')

  const lines = withoutInvisible
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))

  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift()
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }

  return lines.join('\n').replace(EXTRA_BLANK_LINES_PATTERN, '\n\n')
}

const STRUCTURED_LINE_PATTERN = /^(\s*([-*+]\s|\d+\.\s|>\s|#{1,6}\s|```|~~~|\|))/

const collapseSoftWrappedLines = (text: string): string => {
  if (!text.includes('\n')) {
    return text
  }

  const paragraphs = text.split(/\n{2,}/)

  const normalizedParagraphs = paragraphs.map((paragraph) => {
    const lines = paragraph.split('\n')
    if (lines.length <= 1) {
      return paragraph
    }

    const hasStructuredLines = lines.some((line) => STRUCTURED_LINE_PATTERN.test(line.trimStart()))
    const hasIndentedCode = lines.some((line) => /^\s{4,}\S/.test(line))
    if (hasStructuredLines || hasIndentedCode) {
      return paragraph
    }

    const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
    if (nonEmptyLines.length <= 1) {
      return paragraph
    }

    const shortLineCount = nonEmptyLines.filter((line) => line.trim().length <= 35).length
    const mostlyShortLines = shortLineCount / nonEmptyLines.length >= 0.7
    if (mostlyShortLines) {
      return paragraph
    }

    return nonEmptyLines.map((line) => line.trim()).join(' ')
  })

  return normalizedParagraphs.join('\n\n')
}

const shouldPreferPlainTextOverHtml = (html: string, plainText: string): boolean => {
  if (!plainText.trim()) return false

  try {
    const template = document.createElement('template')
    template.innerHTML = html

    if (template.content.querySelector(SEMANTIC_PASTE_SELECTOR)) {
      return false
    }

    const elements = Array.from(template.content.querySelectorAll('*'))
    const hasOnlyBasicWrappers =
      elements.length > 0 && elements.every((el) => BASIC_PASTE_WRAPPER_TAGS.has(el.tagName))

    const htmlText = normalizePastedText(template.content.textContent || '')
    if (!htmlText) {
      return true
    }

    const compact = (value: string) => value.replace(/\s+/g, ' ').trim()
    if (compact(htmlText) === compact(plainText)) {
      return true
    }

    return hasOnlyBasicWrappers
  } catch (error) {
    console.warn('Unable to inspect pasted HTML, defaulting to plain text heuristic:', error)
    return false
  }
}

/**
 * Ensure the editor has at least one paragraph for writing.
 */
const ensureEditorHasContent = (editor: HTMLDivElement) => {
  if (editor.childNodes.length === 0 || (editor.textContent || '').trim() === '') {
    if (!editor.querySelector('p, h1, h2, h3, ul, ol, blockquote, hr, table, div[data-block]')) {
      const p = document.createElement('p')
      p.appendChild(document.createElement('br'))
      editor.appendChild(p)
    }
  }
}

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  ({ value, onChange, disabled, placeholder, customBlocks, onCustomCommand }, ref) => {
    const customBlocksRef = useRef<CustomBlockDescriptor[] | undefined>(undefined)
      const editorRef = useRef<HTMLDivElement | null>(null)
    const historyManagerRef = useRef<HistoryManager | null>(null)
    const debouncedCaptureRef = useRef<(() => void) | null>(null)
    const lastSyncedValueRef = useRef<string>('')
    const pendingExternalValueRef = useRef<string | null>(null)
    const mutationObserverRef = useRef<MutationObserver | null>(null)
    const checklistNormalizationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isProcessingCommandRef = useRef<boolean>(false)
    const activeFormatsFrameRef = useRef<number | null>(null)
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
    const [autoformatEnabled] = useState(true)
    const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())

    const isSelectionInsideEditor = useCallback(() => {
      return isSelectionInsideRoot(editorRef.current)
    }, [])

    const queryCommandStateLocal = useCallback((command: string) => {
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
          case 'checklist':
            return !!element?.closest('ul[data-checklist="true"], ol[data-checklist="true"]')
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
    }, [])

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

        if (element.closest('strong, b')) formats.add('bold')
        if (element.closest('em, i')) formats.add('italic')
        if (element.closest('u')) formats.add('underline')
        if (element.closest('s, strike')) formats.add('strike')
        if (element.closest('code')) formats.add('code')
        if (element.closest('ul')) formats.add('unordered-list')
        if (element.closest('ol')) formats.add('ordered-list')
        if (element.closest('ul[data-checklist="true"], ol[data-checklist="true"]')) {
          formats.add('checklist')
        }
        if (element.closest('h1')) formats.add('heading1')
        if (element.closest('h2')) formats.add('heading2')
        if (element.closest('h3')) formats.add('heading3')
        if (element.closest('blockquote')) formats.add('blockquote')

        setActiveFormats(formats)
      } catch (error) {
        console.error('Error updating active formats:', error)
        setActiveFormats(new Set())
      }
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

    const insertFragmentAtSelection = useCallback(
      (fragment: DocumentFragment) => {
        if (!editorRef.current) return false

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
      []
    )

    const insertCustomBlockAtSelection = useCallback(
      (html: string) => {
        const temp = document.createElement('div')
        temp.innerHTML = html
        const firstChild = temp.firstChild as HTMLElement

        if (firstChild && firstChild.getAttribute && firstChild.getAttribute('data-block') === 'true') {
          return insertFragmentAtSelection(document.createRange().createContextualFragment(html))
        }

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
      const handleSelection = () => {
        if (!isSelectionInsideEditor()) {
          setActiveFormats(new Set())
          return
        }
        scheduleActiveFormatsUpdate()
      }

      document.addEventListener('selectionchange', handleSelection)
      return () => document.removeEventListener('selectionchange', handleSelection)
    }, [isSelectionInsideEditor, scheduleActiveFormatsUpdate])

    const sanitize = useCallback(
      (html: string) => {
        if (typeof window === 'undefined') return html
        return DOMPurify.sanitize(html, SANITIZE_CONFIG) as string
      },
      []
    )

    const forceWebViewFocus = useCallback(() => {
      if (!editorRef.current) return
      editorRef.current.blur()
      setTimeout(() => {
        editorRef.current?.focus()
      }, 50)
    }, [])

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
        if (!editorRef.current.isConnected) {
          console.warn('Editor disconnected, skipping change emission')
          return
        }

        const sanitized = sanitize(editorRef.current.innerHTML)

        if (sanitized !== lastSyncedValueRef.current) {
          lastSyncedValueRef.current = sanitized
          onChange(sanitized)
          if (debouncedCaptureRef.current) {
            debouncedCaptureRef.current()
          }
        }

        scheduleActiveFormatsUpdate()
      } catch (error) {
        console.error('Error emitting change:', error)
      }
    }, [onChange, sanitize, scheduleActiveFormatsUpdate])

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

              // Ensure there's a paragraph after block-level custom blocks for continued editing
              const selection = window.getSelection()
              if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0)
                const container = range.commonAncestorContainer

                let blockElement: HTMLElement | null = null
                if (container.nodeType === Node.ELEMENT_NODE) {
                  blockElement = (container as HTMLElement).querySelector('[data-block="true"]')
                  if (!blockElement && (container as HTMLElement).hasAttribute('data-block')) {
                    blockElement = container as HTMLElement
                  }
                } else if (container.parentElement) {
                  blockElement = container.parentElement.closest('[data-block="true"]') as HTMLElement
                }

                if (blockElement && blockElement.getAttribute('data-block-type') === type) {
                  const blockLevelTypes = ['image', 'table', 'file']
                  const isBlockLevel = blockLevelTypes.includes(type)
                  const hasNextSibling = blockElement.nextElementSibling

                  if (isBlockLevel && !hasNextSibling) {
                    const paragraph = document.createElement('p')
                    paragraph.appendChild(document.createElement('br'))
                    blockElement.parentNode?.insertBefore(paragraph, blockElement.nextSibling)

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

    // Rehydrate existing custom blocks in the editor
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

    const toggleTableOutlines = useCallback(() => {
      try {
        const editor = editorRef.current
        if (!editor) return

        const table = getClosestFromSelection('table', editor) as HTMLElement | null
        if (!table) return

        if (table.getAttribute('data-no-outline') === 'true') {
          table.removeAttribute('data-no-outline')
        } else {
          table.setAttribute('data-no-outline', 'true')
        }

        emitChange()
      } catch (error) {
        console.error('Error toggling table outlines:', error)
      }
    }, [emitChange])

    // Editor click handler to detect note link clicks
    useEffect(() => {
      const editorElement = editorRef.current
      if (!editorElement) return

      const handleClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null
        if (!target || !editorElement.contains(target)) {
          return
        }

        const noteLinkElement = target.closest('[data-block-type="note-link"]') as HTMLElement | null
        if (noteLinkElement) {
          event.preventDefault()
          const noteId = noteLinkElement.getAttribute('data-note-id')
          if (noteId) {
            window.dispatchEvent(new CustomEvent('note-link-click', {
              detail: { noteId }
            }))
          }
          return
        }
      }

      editorElement.addEventListener('click', handleClick)

      return () => {
        editorElement.removeEventListener('click', handleClick)
      }
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

        if (isProcessingCommandRef.current) {
          console.warn('Command execution already in progress, skipping:', command)
          return
        }

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
          console.error('Error in execCommand:', error)
          try {
            if (editorRef.current && editorRef.current.isConnected) {
              normalizeEditorContent(editorRef.current)
            }
          } catch (e) {
            console.error('Failed to recover from execCommand error:', e)
          }
        } finally {
          isProcessingCommandRef.current = false
        }
      },
      [disabled, emitChange]
    )

    const applyCode = useCallback(() => {
      if (disabled || !editorRef.current || !editorRef.current.isConnected) return

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
        console.error('Error in applyCode:', error)
      }
    }, [disabled, emitChange])

    const applyHighlight = useCallback((color: string | null) => {
      if (disabled || !editorRef.current) return

      try {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return

        const range = selection.getRangeAt(0)
        if (range.collapsed) return

        if (color === null) {
          // remove highlight: unwrap spans with data-highlight that intersect the selection
          const walker = document.createTreeWalker(range.commonAncestorContainer as Node, NodeFilter.SHOW_ELEMENT, null)
          const toRemove: HTMLElement[] = []
          // Also check the ancestor itself
          const ancestor = range.commonAncestorContainer as HTMLElement
          if (ancestor.nodeType === Node.ELEMENT_NODE && ancestor.hasAttribute?.('data-highlight')) {
            toRemove.push(ancestor)
          }
          let node = walker.nextNode() as HTMLElement | null
          while (node) {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              node.hasAttribute &&
              node.hasAttribute('data-highlight') &&
              range.intersectsNode(node)
            ) {
              toRemove.push(node)
            }
            node = walker.nextNode() as HTMLElement | null
          }

          toRemove.forEach((el) => {
            const parent = el.parentNode
            while (el.firstChild) parent?.insertBefore(el.firstChild, el)
            parent?.removeChild(el)
          })

          emitChange()
          return
        }

        // Wrap selection in span with data-highlight attribute
        const span = document.createElement('span')
        span.setAttribute('data-highlight', color)

        try {
          const frag = range.extractContents()
          span.appendChild(frag)
          range.insertNode(span)

          // Keep the styled text selected so the toolbar stays visible
          const newRange = document.createRange()
          newRange.selectNodeContents(span)
          selection.removeAllRanges()
          selection.addRange(newRange)
        } catch (e) {
          console.error('Error applying highlight:', e)
        }

        emitChange()
      } catch (error) {
        console.error('Error in applyHighlight:', error)
      }
    }, [disabled, emitChange])

    const applyColor = useCallback((colorKey: string | null) => {
      if (disabled || !editorRef.current) return

      try {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        const range = selection.getRangeAt(0)
        if (range.collapsed) return

        if (colorKey === 'default' || colorKey === null) {
          // remove color spans that intersect the selection
          const walker = document.createTreeWalker(range.commonAncestorContainer as Node, NodeFilter.SHOW_ELEMENT, null)
          const toRemove: HTMLElement[] = []
          const ancestor = range.commonAncestorContainer as HTMLElement
          if (ancestor.nodeType === Node.ELEMENT_NODE && ancestor.hasAttribute?.('data-color')) {
            toRemove.push(ancestor)
          }
          let node = walker.nextNode() as HTMLElement | null
          while (node) {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              node.hasAttribute &&
              node.hasAttribute('data-color') &&
              range.intersectsNode(node)
            ) {
              toRemove.push(node)
            }
            node = walker.nextNode() as HTMLElement | null
          }

          toRemove.forEach((el) => {
            const parent = el.parentNode
            while (el.firstChild) parent?.insertBefore(el.firstChild, el)
            parent?.removeChild(el)
          })

          emitChange()
          return
        }

        const span = document.createElement('span')
        span.setAttribute('data-color', colorKey)

        try {
          const frag = range.extractContents()
          span.appendChild(frag)
          range.insertNode(span)

          // Keep the styled text selected so the toolbar stays visible
          const newRange = document.createRange()
          newRange.selectNodeContents(span)
          selection.removeAllRanges()
          selection.addRange(newRange)
        } catch (e) {
          console.error('Error applying color:', e)
        }

        emitChange()
      } catch (error) {
        console.error('Error in applyColor:', error)
      }
    }, [disabled, emitChange])

    const applyFontSize = useCallback((sizeKey: string | null) => {
      if (disabled || !editorRef.current) return

      try {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        const range = selection.getRangeAt(0)
        if (range.collapsed) return

        if (sizeKey === 'clear' || sizeKey === null) {
          // remove font-size spans that intersect the selection
          const walker = document.createTreeWalker(range.commonAncestorContainer as Node, NodeFilter.SHOW_ELEMENT, null)
          const toRemove: HTMLElement[] = []
          const ancestor = range.commonAncestorContainer as HTMLElement
          if (ancestor.nodeType === Node.ELEMENT_NODE && ancestor.hasAttribute?.('data-font-size')) {
            toRemove.push(ancestor)
          }
          let node = walker.nextNode() as HTMLElement | null
          while (node) {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              node.hasAttribute &&
              node.hasAttribute('data-font-size') &&
              range.intersectsNode(node)
            ) {
              toRemove.push(node)
            }
            node = walker.nextNode() as HTMLElement | null
          }

          toRemove.forEach((el) => {
            const parent = el.parentNode
            while (el.firstChild) parent?.insertBefore(el.firstChild, el)
            parent?.removeChild(el)
          })

          emitChange()
          return
        }

        const span = document.createElement('span')
        span.setAttribute('data-font-size', sizeKey)

        try {
          const frag = range.extractContents()
          span.appendChild(frag)
          range.insertNode(span)

          // Keep the styled text selected so the toolbar stays visible
          const newRange = document.createRange()
          newRange.selectNodeContents(span)
          selection.removeAllRanges()
          selection.addRange(newRange)
        } catch (e) {
          console.error('Error applying font size:', e)
        }

        emitChange()
      } catch (error) {
        console.error('Error in applyFontSize:', error)
      }
    }, [disabled, emitChange])

    const toggleChecklist = useCallback(() => {
      if (disabled || !editorRef.current || !editorRef.current.isConnected) return

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
        console.error('Error in toggleChecklist:', error)
      }
    }, [disabled, emitChange])

    const applyHeading = useCallback(
      (level: 1 | 2 | 3) => {
        if (disabled || !editorRef.current || !editorRef.current.isConnected) return

        const editor = editorRef.current

        try {
          editor.focus()
        } catch (e) {
          console.warn('Error focusing editor:', e)
          return
        }

        try {
          applyBlockFormat(`h${level}` as 'h1' | 'h2' | 'h3', editor)

          setTimeout(() => {
            try {
              if (!editor.isConnected) return

              const selection = window.getSelection()
              let targetHeading: HTMLElement | null = null

              if (selection && selection.rangeCount > 0) {
                try {
                  const range = selection.getRangeAt(0)
                  if (!range.startContainer.isConnected) return

                  let node: Node | null = range.startContainer

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

              if (targetHeading && targetHeading.isConnected && !targetHeading.id) {
                try {
                  targetHeading.id = generateHeadingId(targetHeading.textContent || '')
                } catch (e) {
                  console.warn('Error generating heading ID:', e)
                }
              }

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
          try {
            if (editor.isConnected) {
              normalizeEditorContent(editor)
            }
          } catch (e) {
            console.error('Failed to recover from applyHeading error:', e)
          }
        }
      },
      [disabled, emitChange]
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

    const saveSelection = useCallback(() => {
      savedSelectionRef.current = saveSelectionRange(editorRef.current)
    }, [])

    const restoreSelection = useCallback(() => {
      restoreSelectionRange(savedSelectionRef.current, editorRef.current)
    }, [])

    const validateUrl = useCallback((url: string): { valid: boolean; error: string } => {
      if (!url.trim()) {
        return { valid: false, error: 'URL is required' }
      }

      try {
        const trimmed = url.trim()
        const lowerTrimmed = trimmed.toLowerCase()

        if (lowerTrimmed.startsWith('javascript:') ||
            lowerTrimmed.startsWith('data:') ||
            lowerTrimmed.startsWith('vbscript:')) {
          return { valid: false, error: 'Invalid or dangerous protocol' }
        }

        let testUrl = trimmed
        if (!testUrl.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:/)) {
          testUrl = 'https://' + testUrl
        }

        const urlObj = new URL(testUrl)

        if (!['http:', 'https:', 'mailto:', 'tel:'].includes(urlObj.protocol)) {
          return { valid: false, error: 'Invalid protocol. Use http, https, mailto, or tel' }
        }

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

    const normalizeUrl = useCallback((url: string): string => {
      const trimmed = url.trim()
      if (!trimmed) return trimmed

      const lowerTrimmed = trimmed.toLowerCase()

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
        const validation = validateUrl(linkUrl)
        if (!validation.valid) {
          setLinkUrlError(validation.error)
          return
        }

        const normalizedUrl = normalizeUrl(linkUrl)

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

        addToRecentLinks(normalizedUrl, linkText || normalizedUrl)

        resetLinkDialog()
        emitChange()

        applyCursorOperation(() => {
          editorRef.current?.focus()
        }, CURSOR_TIMING.MEDIUM)
      } catch (error) {
        console.error('Error applying link:', error)
        setLinkUrlError('Failed to create link')
      }
    }, [linkUrl, linkText, restoreSelection, emitChange, validateUrl, normalizeUrl, addToRecentLinks, resetLinkDialog])

    const editLink = useCallback((linkElement: HTMLAnchorElement) => {
      setLinkUrl(linkElement.getAttribute('href') || '')
      setLinkText(linkElement.textContent || '')
      setLinkUrlError('')
      hideLinkPopoverNow()

      const range = document.createRange()
      range.selectNodeContents(linkElement)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)

      saveSelection()
      setShowLinkDialog(true)
    }, [saveSelection, hideLinkPopoverNow])

    const removeLink = useCallback((linkElement: HTMLAnchorElement) => {
      const text = linkElement.textContent || ''
      const textNode = document.createTextNode(text)
      linkElement.parentNode?.replaceChild(textNode, linkElement)
      hideLinkPopoverNow()
      emitChange()
    }, [emitChange, hideLinkPopoverNow])

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

        if (!selection) return

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

            range.setStart(node, offset)
            range.setEnd(node, endOffset)
            break
          }
          currentPos += nodeLength
          node = walker.nextNode()
        }

        selection.removeAllRanges()
        selection.addRange(range)

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
      if (searchMatches.length === 0) return
      const nextIndex = (currentMatchIndex + 1) % searchMatches.length
      setCurrentMatchIndex(nextIndex)
      highlightMatch(nextIndex)
    }, [currentMatchIndex, searchMatches, highlightMatch])

    const previousMatch = useCallback(() => {
      if (searchMatches.length === 0) return
      const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length
      setCurrentMatchIndex(prevIndex)
      highlightMatch(prevIndex)
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
          console.warn(`Too many matches (${matchCount}+) for replace all operation`)
          return
        }

        if (matchCount === 0) return

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

    const insertHorizontalRule = useCallback(() => {
      if (disabled || !editorRef.current || !editorRef.current.isConnected) return

      const editor = editorRef.current

      try {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return

        const range = selection.getRangeAt(0)
        if (!range.startContainer.isConnected) return

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

            if (p.isConnected && editor.isConnected) {
              positionCursorInElement(p, 'start', editor)
            }
          } catch (e) {
            console.error('Error inserting paragraph after hr:', e)
          }
        }

        emitChange()
      } catch (error) {
        console.error('Error inserting horizontal rule:', error)
      }
    }, [disabled, emitChange])

    const applyHistoryAction = useCallback(
      (action: 'undo' | 'redo') => {
        if (!historyManagerRef.current) return

        if (action === 'undo') {
          historyManagerRef.current.undo()
        } else {
          historyManagerRef.current.redo()
        }

        emitChange()
      },
      [emitChange]
    )

    const executeRichTextCommand = useCallback((cmd: RichTextCommand) => {
      // Support highlight, color and font-size commands like 'highlight:yellow', 'color:red', 'font-size:16'
      if (typeof cmd === 'string') {
        if (cmd.startsWith('highlight:')) {
          const parts = cmd.split(':')
          const color = parts[1]
          if (color === 'clear') {
            applyHighlight(null)
          } else {
            applyHighlight(color)
          }
          return
        }

        if (cmd.startsWith('color:')) {
          const parts = cmd.split(':')
          const color = parts[1]
          if (color === 'clear') {
            applyColor('default')
          } else {
            applyColor(color)
          }
          return
        }

        if (cmd.startsWith('font-size:')) {
          const parts = cmd.split(':')
          const size = parts[1]
          if (size === 'clear') {
            applyFontSize('clear')
          } else {
            applyFontSize(size)
          }
          return
        }
      }
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
              case 'checklist':
                return !!element?.closest('ul[data-checklist="true"], ol[data-checklist="true"]')
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

        if (!editorEl.isConnected) {
          console.warn('Editor not connected to DOM during value sync')
          return
        }

        const sanitizedValue = sanitize(value || '')

        if (lastSyncedValueRef.current !== sanitizedValue) {
          const editorHasFocus = editorEl === document.activeElement || editorEl.contains(document.activeElement)
          if (editorHasFocus) {
            pendingExternalValueRef.current = sanitizedValue
            return
          }

          const savedCursorPos = saveCursorPosition()

          editorEl.innerHTML = sanitizedValue
          lastSyncedValueRef.current = sanitizedValue
          pendingExternalValueRef.current = null

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

          scheduleChecklistNormalization()
          rehydrateExistingBlocks()
        }

        ensureEditorHasContent(editorEl)
      } catch (error) {
        console.error('Error synchronizing editor value:', error)
      }
    }, [sanitize, value, scheduleChecklistNormalization, rehydrateExistingBlocks])

    const flushPendingExternalValue = useCallback(() => {
      const editorEl = editorRef.current
      const pendingValue = pendingExternalValueRef.current
      if (!editorEl || !editorEl.isConnected || !pendingValue) return

      try {
        const currentSanitized = sanitize(editorEl.innerHTML)
        if (currentSanitized === pendingValue) {
          lastSyncedValueRef.current = pendingValue
          pendingExternalValueRef.current = null
          return
        }

        editorEl.innerHTML = pendingValue
        lastSyncedValueRef.current = pendingValue
        pendingExternalValueRef.current = null

        if (historyManagerRef.current) {
          try {
            historyManagerRef.current.capture()
          } catch (error) {
            console.error('Error capturing history after pending value flush:', error)
          }
        }

        scheduleChecklistNormalization()
        rehydrateExistingBlocks()
        ensureEditorHasContent(editorEl)
      } catch (error) {
        console.error('Error flushing pending external value:', error)
      }
    }, [sanitize, scheduleChecklistNormalization, rehydrateExistingBlocks])

    const handleEditorBlur = useCallback(() => {
      window.setTimeout(() => {
        flushPendingExternalValue()
      }, 0)
    }, [flushPendingExternalValue])

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

    // Initialize image block interactions
    useEffect(() => {
      if (!editorRef.current) return

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
        if (!editorRef.current || !editorRef.current.isConnected) {
          console.warn('Editor disconnected during input')
          return
        }
        emitChange()
      } catch (error) {
        console.error('Error in handleInput:', error)
      }
    }

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
      try {
        if (disabled || !editorRef.current || !editorRef.current.isConnected) {
          return
        }

        // Handle autoformatting
        if (autoformatEnabled && shouldApplyAutoformat(event.nativeEvent)) {
          try {
            const selection = window.getSelection()
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0)
              const node = range.startContainer

              if (node.nodeType === Node.TEXT_NODE && event.key === ' ') {
                const textNode = node as Text
                const cursorOffset = range.startOffset

                if (applyAutoformat(textNode, cursorOffset)) {
                  event.preventDefault()
                  emitChange()
                  return
                }
              }

              if (event.key === ' ') {
                const textNode = node.nodeType === Node.TEXT_NODE ? node as Text : null
                if (textNode) {
                  const text = textNode.textContent?.substring(0, range.startOffset) || ''
                  const lineStart = text.lastIndexOf('\n') + 1
                  const lineText = text.substring(lineStart)
                  const action = checkListPrefixPattern(lineText)

                  if (action) {
                    event.preventDefault()

                    const patternLength = lineText.length
                    const removeRange = document.createRange()
                    removeRange.setStart(textNode, range.startOffset - patternLength)
                    removeRange.setEnd(textNode, range.startOffset)
                    removeRange.deleteContents()

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

        // Handle Enter key for list items
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
              normalizeEditorContent(editorRef.current)
              mergeAdjacentLists(editorRef.current)
            }
            scheduleChecklistNormalization()

            // Reapply editor link classes to pasted links so they match editor styling
            if (editorRef.current) {
              const links = editorRef.current.querySelectorAll('a')
              links.forEach((link) => {
                ;(link as HTMLAnchorElement).className =
                  'text-alpine-600 hover:text-alpine-800 underline decoration-alpine-400 decoration-2 underline-offset-2 transition-colors cursor-pointer inline-flex items-center gap-1'
              })
            }

            emitChange()
          } catch (error) {
            console.error('Error finalizing paste:', error)
          }
        }

        const html = event.clipboardData.getData('text/html')
        const rawText = event.clipboardData.getData('text/plain')
        const text = normalizePastedText(rawText)
        // Use normalized text directly; do not collapse soft-wrapped lines to avoid
        // altering user-intended line breaks/spaces.
        const textForPlainPaste = text

        if (text && looksLikeMarkdown(text)) {
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
              console.error('Error pasting markdown:', error)
            }
          }).catch(error => {
            console.error('Error converting markdown:', error)
            try {
              if (textForPlainPaste && insertPlainTextAtSelection(textForPlainPaste)) {
                finalizeInsertion()
              }
            } catch (e) {
              console.error('Error in markdown fallback:', e)
            }
          })
          return
        }

        if (html) {
          if (textForPlainPaste && shouldPreferPlainTextOverHtml(html, textForPlainPaste)) {
            if (insertPlainTextAtSelection(textForPlainPaste)) {
              finalizeInsertion()
            }
            return
          }

          try {
            const sanitized = sanitize(html)
            if (insertHTMLAtSelection(sanitized)) {
              finalizeInsertion()
            }
          } catch (error) {
            console.error('Error pasting HTML:', error)
            if (textForPlainPaste && insertPlainTextAtSelection(textForPlainPaste)) {
              finalizeInsertion()
            }
          }
          return
        }

        if (!textForPlainPaste) {
          return
        }

        const trimmed = textForPlainPaste.trim()
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
            console.error('Error pasting URL:', error)
            if (insertPlainTextAtSelection(textForPlainPaste)) {
              finalizeInsertion()
            }
          }
          return
        }

        if (insertPlainTextAtSelection(textForPlainPaste)) {
          finalizeInsertion()
        }
      } catch (error) {
        console.error('Critical error in handlePaste:', error)
      }
    }

    // Determine outlines visibility for the currently selected table (per-table)
    const currentTable = typeof window !== 'undefined' ? getClosestFromSelection('table', editorRef.current) as HTMLElement | null : null
    const outlinesVisibleForToolbar = currentTable ? currentTable.getAttribute('data-no-outline') !== 'true' : true

    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-hidden">
          <div
            ref={editorRef}
            className="h-full w-full overflow-y-auto whitespace-pre-wrap break-words p-3 focus:outline-none sm:p-4"
            contentEditable={!disabled}
            data-placeholder={placeholder}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={handleEditorBlur}
            suppressContentEditableWarning
            spellCheck
            role="textbox"
            aria-label="Rich text editor"
            aria-multiline="true"
            aria-disabled={disabled}
          />
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
          outlinesVisible={outlinesVisibleForToolbar}
          onToggleOutlines={toggleTableOutlines}
        />
      </div>
    )
  }
)

RichTextEditor.displayName = 'RichTextEditor'

export default RichTextEditor
