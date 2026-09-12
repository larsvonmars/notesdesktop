import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import SelectionToolbar from '../components/SelectionToolbar'
import { useFloatingToolbar } from '../lib/editor/useFloatingToolbar'
import type { RichTextCommand } from '../components/RichTextEditor'

const events: string[] = []

const log = (message: string) => {
  events.push(message)
  const logElement = document.getElementById('log')
  if (logElement) logElement.textContent = events.join('\n')
}

function Harness() {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [docked, setDocked] = useState(false)
  const [activeFormats] = useState<Set<string>>(new Set())

  const { state, toolbarRef, refresh, ensureEditorSelection, hide, reset } = useFloatingToolbar({
    getEditorElement: () => editorRef.current,
    enabled: true,
    docked,
  })

  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const harness = {
      events,
      log,
      getToolbarState: () => ({ ...stateRef.current }),
      reset: () => reset(),
      hide: () => hide(),
    }
    ;(window as unknown as { harness: typeof harness }).harness = harness
  }, [hide, reset])

  const handleCommand = useCallback(
    (command: RichTextCommand) => {
      const before = window.getSelection()?.toString() ?? ''
      const restored = ensureEditorSelection()
      const after = window.getSelection()?.toString() ?? ''
      const editorHasFocus = document.activeElement === editorRef.current

      log(
        `command=${command} selectionBefore="${before}" restore=${restored} selectionAfter="${after}" editorFocused=${editorHasFocus}`
      )

      if (restored) {
        switch (command) {
          case 'bold':
            document.execCommand('bold')
            break
          case 'italic':
            document.execCommand('italic')
            break
          case 'heading1':
            document.execCommand('formatBlock', false, 'h1')
            break
          case 'copy':
            log(`copy-captured="${after}"`)
            break
          default:
            break
        }
      }

      refresh()
      log(`html-after-command=${editorRef.current?.innerHTML.replace(/\s+/g, ' ')}`)
    },
    [ensureEditorSelection, refresh]
  )

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const onFocusOut = () => log(`editor-focus-out -> ${document.activeElement?.tagName ?? 'null'}`)
    editor.addEventListener('focusout', onFocusOut)
    return () => editor.removeEventListener('focusout', onFocusOut)
  }, [])

  return (
    <>
      <h1>Selection toolbar harness</h1>
      <div className="controls">
        <label>
          <input
            id="docked-toggle"
            type="checkbox"
            checked={docked}
            onChange={(event) => setDocked(event.target.checked)}
          />{' '}
          docked (touch layout)
        </label>
        <button id="focus-stealer" type="button" onMouseDown={() => log('focus-stealer-pointerdown')}>
          external button
        </button>
      </div>

      <div id="editor" ref={editorRef} contentEditable suppressContentEditableWarning>
        <p>First paragraph near the top of the page with selectable words.</p>
        <p>Second paragraph used for multi-line drag selection testing.</p>
        <p>Third paragraph that sits lower down in the editor area.</p>
      </div>

      <SelectionToolbar
        ref={toolbarRef}
        top={state.top}
        left={state.left}
        docked={docked}
        visible={state.visible}
        activeFormats={activeFormats}
        onCommand={handleCommand}
        onDismiss={hide}
      />
    </>
  )
}

const container = document.getElementById('root') as HTMLDivElement
createRoot(container).render(<Harness />)
