import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

interface LinkPopoverPosition {
  top: number
  left: number
}

interface UseLinkPopoverOptions {
  editorRef: RefObject<HTMLElement | null>
  ignoreSelector?: string
  hideDelayMs?: number
  verticalOffsetPx?: number
}

export function useLinkPopover({
  editorRef,
  ignoreSelector = '[data-block-type="note-link"]',
  hideDelayMs = 200,
  verticalOffsetPx = 8,
}: UseLinkPopoverOptions) {
  const [showLinkPopover, setShowLinkPopover] = useState(false)
  const [linkPopoverPos, setLinkPopoverPos] = useState<LinkPopoverPosition>({ top: 0, left: 0 })
  const [hoveredLinkElement, setHoveredLinkElement] = useState<HTMLAnchorElement | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copiedResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHideTimer = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }, [])

  const clearCopiedResetTimer = useCallback(() => {
    if (copiedResetTimeoutRef.current) {
      clearTimeout(copiedResetTimeoutRef.current)
      copiedResetTimeoutRef.current = null
    }
  }, [])

  const hideLinkPopoverNow = useCallback(() => {
    clearHideTimer()
    setShowLinkPopover(false)
    setHoveredLinkElement(null)
  }, [clearHideTimer])

  const showLinkPopoverForElement = useCallback(
    (linkElement: HTMLAnchorElement) => {
      clearHideTimer()

      const rect = linkElement.getBoundingClientRect()
      const top = rect.bottom + window.scrollY + verticalOffsetPx
      const left = rect.left + window.scrollX

      setLinkPopoverPos({ top, left })
      setHoveredLinkElement(linkElement)
      setShowLinkPopover(true)
    },
    [clearHideTimer, verticalOffsetPx]
  )

  const hideLinkPopover = useCallback(() => {
    clearHideTimer()
    hideTimeoutRef.current = setTimeout(() => {
      setShowLinkPopover(false)
      setHoveredLinkElement(null)
      hideTimeoutRef.current = null
    }, hideDelayMs)
  }, [clearHideTimer, hideDelayMs])

  const keepPopoverOpen = useCallback(() => {
    clearHideTimer()
  }, [clearHideTimer])

  const copyLinkUrl = useCallback(
    async (url: string) => {
      try {
        await navigator.clipboard.writeText(url)
        setCopiedLink(true)

        clearCopiedResetTimer()
        copiedResetTimeoutRef.current = setTimeout(() => {
          setCopiedLink(false)
          copiedResetTimeoutRef.current = null
        }, 2000)
      } catch (error) {
        console.error('Failed to copy link:', error)
      }
    },
    [clearCopiedResetTimer]
  )

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      const linkElement = target.closest('a[href]') as HTMLAnchorElement | null
      if (linkElement && !linkElement.closest(ignoreSelector)) {
        showLinkPopoverForElement(linkElement)
      }
    }

    const handleMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const relatedTarget = event.relatedTarget as HTMLElement | null

      if (
        target &&
        target.closest('a[href]') &&
        !relatedTarget?.closest('a[href]') &&
        !relatedTarget?.closest('.link-popover')
      ) {
        hideLinkPopover()
      }
    }

    editor.addEventListener('mouseover', handleMouseOver)
    editor.addEventListener('mouseout', handleMouseOut)

    return () => {
      editor.removeEventListener('mouseover', handleMouseOver)
      editor.removeEventListener('mouseout', handleMouseOut)
    }
  }, [editorRef, hideLinkPopover, ignoreSelector, showLinkPopoverForElement])

  useEffect(() => {
    return () => {
      clearHideTimer()
      clearCopiedResetTimer()
    }
  }, [clearHideTimer, clearCopiedResetTimer])

  return {
    showLinkPopover,
    linkPopoverPos,
    hoveredLinkElement,
    copiedLink,
    showLinkPopoverForElement,
    hideLinkPopover,
    hideLinkPopoverNow,
    keepPopoverOpen,
    copyLinkUrl,
  }
}
