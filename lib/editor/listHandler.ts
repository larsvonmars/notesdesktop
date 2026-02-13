/**
 * List & Checklist Handling Utilities
 *
 * Comprehensive system for managing bullet lists, ordered lists, and checklists
 * inside a contenteditable editor.
 *
 * Features
 * ────────
 *  • Create / toggle / convert between UL, OL, and checklist
 *  • Indent & outdent with Tab / Shift-Tab (up to MAX_NESTING levels)
 *  • Smart Enter: split items, exit on empty, continue checklist state
 *  • Backspace at start: outdent → unwrap
 *  • Drag-to-reorder list items
 *  • Checklist progress tracking (data-checklist-progress)
 *  • Merge adjacent same-type lists
 *  • Full normalization after any mutation
 */

import {
  saveSelection,
  restoreSelection,
  type SelectionSnapshot,
} from './commandDispatcher'

// ─── constants ──────────────────────────────────────────────────────────────

/** Maximum nesting depth for lists */
export const MAX_NESTING = 6

/** CSS class names */
const CLS = {
  checklistList: 'checklist-list',
  checklistItem: 'checklist-item',
  checkbox: 'checklist-checkbox',
  dragHandle: 'list-drag-handle',
  dragging: 'list-item-dragging',
  dropTarget: 'list-item-drop-target',
  nested: 'nested-list',
} as const

// ─── DOM helpers ────────────────────────────────────────────────────────────

/** Walk up the tree to find the closest LI */
export function getClosestListItem(node: Node | null): HTMLLIElement | null {
  let current: Node | null = node
  while (current && current !== document.body) {
    if (current instanceof HTMLLIElement) return current
    current = current.parentNode
  }
  return null
}

/** Walk up the tree to find the closest UL/OL */
export function getClosestList(
  node: Node | null,
): HTMLUListElement | HTMLOListElement | null {
  let current: Node | null = node
  while (current && current !== document.body) {
    if (
      current instanceof HTMLUListElement ||
      current instanceof HTMLOListElement
    )
      return current
    current = current.parentNode
  }
  return null
}

/** Get the nesting depth of a list item (1 = top-level) */
export function getListDepth(li: HTMLLIElement): number {
  let depth = 0
  let el: Node | null = li
  while (el) {
    if (
      el instanceof HTMLUListElement ||
      el instanceof HTMLOListElement
    )
      depth++
    el = el.parentNode
  }
  return depth
}

/** Return all `li` elements that overlap the current selection. */
function getSelectedListItems(
  editorEl: HTMLElement,
): HTMLLIElement[] {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return []

  const range = selection.getRangeAt(0)
  const allItems = Array.from(editorEl.querySelectorAll('li')) as HTMLLIElement[]

  if (range.collapsed) {
    const li = getClosestListItem(range.startContainer)
    return li ? [li] : []
  }

  return allItems.filter((li) => range.intersectsNode(li))
}

// ─── checkbox helpers ───────────────────────────────────────────────────────

/** Create a new checklist checkbox element */
export function createCheckbox(checked = false): HTMLInputElement {
  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.className = `align-middle mr-2 ${CLS.checkbox}`
  cb.checked = checked
  cb.setAttribute('data-checked', checked ? 'true' : 'false')
  return cb
}

/** Add a checkbox to a list item (idempotent) */
export function addCheckboxToListItem(li: HTMLLIElement): HTMLInputElement {
  const existing = li.querySelector(
    `:scope > input[type="checkbox"]`,
  ) as HTMLInputElement | null

  if (existing) {
    existing.classList.add(CLS.checkbox, 'align-middle', 'mr-2')
    markChecklistItem(li, true)
    ensureTextNode(li)
    return existing
  }

  const cb = createCheckbox()
  li.insertBefore(cb, li.firstChild)
  markChecklistItem(li, true)
  ensureTextNode(li)
  return cb
}

/** Remove the checkbox from a list item */
export function removeCheckboxFromListItem(li: HTMLLIElement): void {
  const cb = li.querySelector(':scope > input[type="checkbox"]')
  if (cb) cb.remove()
  markChecklistItem(li, false)
}

/** Toggle the checked state of a list item's checkbox */
export function toggleCheckboxState(li: HTMLLIElement): void {
  const cb = li.querySelector(
    ':scope > input[type="checkbox"]',
  ) as HTMLInputElement | null
  if (!cb) return
  cb.checked = !cb.checked
  cb.setAttribute('data-checked', cb.checked ? 'true' : 'false')
  if (cb.checked) {
    cb.setAttribute('checked', 'true')
  } else {
    cb.removeAttribute('checked')
  }
}

// ─── mark / unmark helpers ──────────────────────────────────────────────────

function markChecklistItem(li: HTMLLIElement, on: boolean): void {
  if (on) {
    li.classList.add(CLS.checklistItem)
    li.setAttribute('data-checklist', 'true')
  } else {
    li.classList.remove(CLS.checklistItem)
    li.removeAttribute('data-checklist')
  }
  markChecklistList(
    li.parentElement as HTMLUListElement | HTMLOListElement | null,
    on,
  )
}

function markChecklistList(
  list: HTMLUListElement | HTMLOListElement | null | undefined,
  on: boolean,
): void {
  if (!list) return
  if (on) {
    list.classList.add(CLS.checklistList)
    list.setAttribute('data-checklist', 'true')
  } else {
    // Only remove if no remaining checkboxes
    const hasAny = !!list.querySelector('input[type="checkbox"]')
    if (!hasAny) {
      list.classList.remove(CLS.checklistList)
      list.removeAttribute('data-checklist')
    }
  }
}

function ensureTextNode(el: HTMLElement): Text {
  const existing = Array.from(el.childNodes).find(
    (n): n is Text => n.nodeType === Node.TEXT_NODE,
  )
  if (existing) return existing
  const t = document.createTextNode('')
  el.appendChild(t)
  return t
}

// ─── list creation / conversion ─────────────────────────────────────────────

/**
 * Create a list of the given type around the current selection.
 * If already inside a list of the same type → removes from list.
 * If already in a different list type → converts.
 */
export function createList(
  type: 'ul' | 'ol',
  editorElement?: HTMLElement | null,
): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  const existingLi = getClosestListItem(range.startContainer)

  if (existingLi) {
    const list = existingLi.parentElement as
      | HTMLUListElement
      | HTMLOListElement
      | null
    if (!list) return
    if (list.tagName.toLowerCase() === type) {
      unwrapListItem(existingLi)
    } else {
      convertListType(list, type)
    }
    return
  }

  // Create a fresh list
  const list = document.createElement(type)
  const li = document.createElement('li')

  const snapshot = saveSelection()

  if (range.collapsed) {
    // If inside a <p> or other block, consume its content
    const block = findParentBlock(range.startContainer)
    if (block && block !== editorElement) {
      while (block.firstChild) li.appendChild(block.firstChild)
      block.parentNode?.replaceChild(list, block)
    } else {
      li.appendChild(document.createElement('br'))
      range.insertNode(list)
    }
    list.appendChild(li)
    positionCursorIn(li)
  } else {
    const contents = range.extractContents()
    li.appendChild(contents)
    list.appendChild(li)
    range.insertNode(list)
    if (snapshot) {
      try {
        restoreSelection(snapshot)
      } catch {
        positionCursorIn(li, 'end')
      }
    }
  }
}

function findParentBlock(node: Node | null): HTMLElement | null {
  let current: Node | null = node
  while (current) {
    if (
      current instanceof HTMLElement &&
      /^(P|DIV|BLOCKQUOTE|H[1-6])$/i.test(current.tagName)
    )
      return current
    current = current.parentNode
  }
  return null
}

/** Unwrap a single LI: move its content out of the list into a <p> */
export function unwrapListItem(li: HTMLLIElement): void {
  const list = li.parentElement
  if (!list) return

  const p = document.createElement('p')

  Array.from(li.childNodes).forEach((node) => {
    if (node instanceof HTMLInputElement && node.type === 'checkbox') return
    if (node instanceof HTMLElement && node.classList.contains(CLS.dragHandle)) return
    p.appendChild(node.cloneNode(true))
  })

  if (!p.textContent?.trim()) {
    p.appendChild(document.createElement('br'))
  }

  // Place after the list so content order is preserved
  if (li.nextElementSibling) {
    // Split the list in two around this item
    const afterList = document.createElement(
      list.tagName.toLowerCase() as 'ul' | 'ol',
    )
    // Copy checklist attributes
    if (list.getAttribute('data-checklist') === 'true') {
      afterList.setAttribute('data-checklist', 'true')
      afterList.classList.add(CLS.checklistList)
    }
    let next: Element | null = li.nextElementSibling
    while (next) {
      const following: Element | null = next.nextElementSibling
      afterList.appendChild(next)
      next = following
    }
    list.parentNode?.insertBefore(p, list.nextSibling)
    if (afterList.children.length > 0) {
      p.parentNode?.insertBefore(afterList, p.nextSibling)
    }
  } else {
    list.parentNode?.insertBefore(p, list.nextSibling)
  }

  li.remove()
  if (list.children.length === 0) list.remove()

  positionCursorIn(p, 'end')
}

/** Convert list to a different type (UL↔OL), preserving children & attributes */
export function convertListType(
  list: HTMLUListElement | HTMLOListElement,
  newType: 'ul' | 'ol',
): void {
  if (list.tagName.toLowerCase() === newType) return

  const newList = document.createElement(newType)
  Array.from(list.attributes).forEach((attr) =>
    newList.setAttribute(attr.name, attr.value),
  )
  while (list.firstChild) newList.appendChild(list.firstChild)
  list.parentNode?.replaceChild(newList, list)
}

/** Toggle between types: if already that type → remove, otherwise create/convert */
export function toggleListType(
  type: 'ul' | 'ol',
  editorElement?: HTMLElement | null,
): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  const list = getClosestList(range.startContainer)

  if (list) {
    if (list.tagName.toLowerCase() === type) {
      // Same type: unwrap
      const li = getClosestListItem(range.startContainer)
      if (li) unwrapListItem(li)
    } else {
      convertListType(list, type)
    }
  } else {
    createList(type, editorElement)
  }
}

// ─── checklist toggle ───────────────────────────────────────────────────────

/** Toggle checklist state for the current selection */
export function toggleChecklistState(
  editorElement?: HTMLElement | null,
): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  const li = getClosestListItem(range.startContainer)

  if (!li) {
    // Not in a list — create a fresh UL + checkbox
    createList('ul', editorElement)
    setTimeout(() => {
      const newLi = getClosestListItem(
        window.getSelection()?.getRangeAt(0)?.startContainer ?? null,
      )
      if (newLi) addCheckboxToListItem(newLi)
    }, 0)
    return
  }

  const list = li.parentElement as HTMLUListElement | HTMLOListElement | null
  if (!list) return

  const isChecklist = !!li.querySelector('input[type="checkbox"]')

  if (isChecklist) {
    // Remove checkboxes from entire list
    Array.from(list.querySelectorAll('li')).forEach((child) => {
      removeCheckboxFromListItem(child as HTMLLIElement)
    })
  } else {
    // Add checkboxes to entire list
    Array.from(list.querySelectorAll('li')).forEach((child) => {
      addCheckboxToListItem(child as HTMLLIElement)
    })
  }
  updateChecklistProgress(list)
}

// ─── indent / outdent ───────────────────────────────────────────────────────

/**
 * Indent the list item(s) at the current selection by nesting inside the
 * previous sibling's sub-list.
 */
export function indentListItems(editorEl: HTMLElement): boolean {
  const items = getSelectedListItems(editorEl)
  if (items.length === 0) return false

  let didIndent = false

  for (const li of items) {
    if (getListDepth(li) >= MAX_NESTING) continue

    const prev = li.previousElementSibling as HTMLLIElement | null
    if (!prev) continue // can't indent the first item

    const parentList = li.parentElement as HTMLUListElement | HTMLOListElement
    const tag = parentList.tagName.toLowerCase() as 'ul' | 'ol'

    // Find or create a sub-list inside the previous sibling
    let subList = prev.querySelector(`:scope > ${tag}`) as
      | HTMLUListElement
      | HTMLOListElement
      | null
    if (!subList) {
      subList = document.createElement(tag)
      subList.classList.add(CLS.nested)
      // Inherit checklist state
      if (parentList.getAttribute('data-checklist') === 'true') {
        subList.setAttribute('data-checklist', 'true')
        subList.classList.add(CLS.checklistList)
      }
      prev.appendChild(subList)
    }

    subList.appendChild(li)
    didIndent = true
  }

  return didIndent
}

/**
 * Outdent the list item(s) at the current selection by moving them up
 * one level in the list hierarchy.
 */
export function outdentListItems(editorEl: HTMLElement): boolean {
  const items = getSelectedListItems(editorEl)
  if (items.length === 0) return false

  let didOutdent = false

  // Process in reverse so indices stay stable
  for (let i = items.length - 1; i >= 0; i--) {
    const li = items[i]
    const parentList = li.parentElement as
      | HTMLUListElement
      | HTMLOListElement
      | null
    if (!parentList) continue

    const grandparentLi = parentList.parentElement
    if (
      !grandparentLi ||
      !(grandparentLi instanceof HTMLLIElement)
    ) {
      // Already at top level → unwrap out of list entirely
      unwrapListItem(li)
      didOutdent = true
      continue
    }

    const grandparentList = grandparentLi.parentElement
    if (!grandparentList) continue

    // Move any siblings *after* li into a new sub-list appended to li
    const following: HTMLLIElement[] = []
    let next = li.nextElementSibling
    while (next) {
      following.push(next as HTMLLIElement)
      next = next.nextElementSibling
    }

    if (following.length > 0) {
      const tag = parentList.tagName.toLowerCase() as 'ul' | 'ol'
      const remainder = document.createElement(tag)
      if (parentList.getAttribute('data-checklist') === 'true') {
        remainder.setAttribute('data-checklist', 'true')
        remainder.classList.add(CLS.checklistList)
      }
      remainder.classList.add(CLS.nested)
      following.forEach((f) => remainder.appendChild(f))
      li.appendChild(remainder)
    }

    // Insert li after the grandparent LI
    grandparentList.insertBefore(li, grandparentLi.nextSibling)

    // If the old sub-list is now empty, remove it
    if (parentList.children.length === 0) parentList.remove()

    didOutdent = true
  }

  return didOutdent
}

// ─── smart Enter ────────────────────────────────────────────────────────────

/**
 * Handle Enter inside a list item.
 * Returns true if the event was handled (caller should preventDefault).
 */
export function handleListEnter(
  editorEl: HTMLElement,
): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false

  const range = selection.getRangeAt(0)
  const li = getClosestListItem(range.startContainer)
  if (!li) return false

  const list = li.parentElement as HTMLUListElement | HTMLOListElement | null
  if (!list) return false

  const itemText = getItemTextContent(li)

  // ── empty item → exit / outdent ──
  if (itemText.length === 0) {
    const depth = getListDepth(li)
    if (depth > 1) {
      // Outdent one level
      outdentListItems(editorEl)
    } else {
      // Top level: remove from list, insert paragraph after
      const p = document.createElement('p')
      p.appendChild(document.createElement('br'))
      list.parentNode?.insertBefore(p, list.nextSibling)
      li.remove()
      if (list.children.length === 0) list.remove()
      positionCursorIn(p)
    }
    return true
  }

  // ── split item at cursor ──
  const newLi = document.createElement('li')

  // Extract content after the cursor into the new LI
  const afterRange = document.createRange()
  afterRange.setStart(range.endContainer, range.endOffset)

  // Find the last content node (excluding sub-lists) to set end boundary
  let lastContentNode: Node | null = null
  for (let i = li.childNodes.length - 1; i >= 0; i--) {
    const child = li.childNodes[i]
    if (child instanceof HTMLUListElement || child instanceof HTMLOListElement) continue
    if (child instanceof HTMLElement && child.classList.contains(CLS.dragHandle)) continue
    lastContentNode = child
    break
  }

  if (lastContentNode) {
    if (lastContentNode.nodeType === Node.TEXT_NODE) {
      afterRange.setEnd(lastContentNode, lastContentNode.textContent?.length ?? 0)
    } else {
      afterRange.setEndAfter(lastContentNode)
    }
  } else {
    afterRange.setEndAfter(li.lastChild!)
  }

  const afterContents = afterRange.extractContents()

  // Move any nested sub-list from the old li to the new one
  const subList = li.querySelector(':scope > ul, :scope > ol')
  if (subList) newLi.appendChild(subList)

  if (afterContents.textContent?.trim() || afterContents.querySelector('*')) {
    newLi.appendChild(afterContents)
  } else {
    newLi.appendChild(document.createElement('br'))
  }

  // If old li is now empty (only has checkbox), give it a <br>
  if (!getItemTextContent(li)) {
    const hasOnlyCheckbox = li.childNodes.length <= 2 &&
      li.querySelector(':scope > input[type="checkbox"]')
    if (hasOnlyCheckbox || li.childNodes.length === 0) {
      if (!li.querySelector('br')) {
        li.appendChild(document.createElement('br'))
      }
    }
  }

  // Insert after the current li
  li.parentElement?.insertBefore(newLi, li.nextSibling)

  // Copy checklist state
  const isChecklist = !!li.querySelector(
    ':scope > input[type="checkbox"]',
  )
  if (isChecklist) {
    addCheckboxToListItem(newLi)
  }

  positionCursorIn(newLi)

  return true
}

// ─── smart Backspace ────────────────────────────────────────────────────────

/**
 * Handle Backspace at the very start of a list item.
 * Returns true if the event was handled.
 */
export function handleListBackspace(editorEl: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false

  const range = selection.getRangeAt(0)
  if (!range.collapsed) return false

  const li = getClosestListItem(range.startContainer)
  if (!li) return false

  // Only act if cursor is at the very start of the LI's text
  if (!isCursorAtStartOfItem(li, range)) return false

  const depth = getListDepth(li)
  if (depth > 1) {
    outdentListItems(editorEl)
  } else {
    unwrapListItem(li)
  }
  return true
}

function isCursorAtStartOfItem(li: HTMLLIElement, range: Range): boolean {
  // Walk the LI's child nodes (skipping checkboxes / drag handles) to find
  // the first text-bearing node.
  for (const child of Array.from(li.childNodes)) {
    if (child instanceof HTMLInputElement && child.type === 'checkbox') continue
    if (child instanceof HTMLElement && child.classList.contains(CLS.dragHandle)) continue
    if (child.nodeType === Node.TEXT_NODE && !child.textContent) continue
    if (child instanceof HTMLUListElement || child instanceof HTMLOListElement) continue

    if (child.nodeType === Node.TEXT_NODE) {
      return range.startContainer === child && range.startOffset === 0
    }
    if (child instanceof HTMLElement) {
      if (child.contains(range.startContainer)) {
        if (range.startContainer === child && range.startOffset === 0) return true
        if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
          const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT)
          const first = walker.firstChild()
          return first === range.startContainer
        }
      }
      return false
    }
  }
  return true // empty item
}

// ─── checklist progress ─────────────────────────────────────────────────────

/**
 * Recalculate and update the data-checklist-progress attribute on a list.
 * Returns {checked, total}.
 */
export function updateChecklistProgress(
  list: HTMLUListElement | HTMLOListElement,
): { checked: number; total: number } {
  const checkboxes = list.querySelectorAll(
    'input[type="checkbox"]',
  ) as NodeListOf<HTMLInputElement>
  const total = checkboxes.length
  const checked = Array.from(checkboxes).filter((cb) => cb.checked).length

  if (total > 0) {
    list.setAttribute('data-checklist-progress', `${checked}/${total}`)
    list.setAttribute('data-checklist-percent', String(Math.round((checked / total) * 100)))
  } else {
    list.removeAttribute('data-checklist-progress')
    list.removeAttribute('data-checklist-percent')
  }

  return { checked, total }
}

// ─── drag-to-reorder ────────────────────────────────────────────────────────

let draggedItem: HTMLLIElement | null = null

/** Attach drag-and-drop listeners to all LIs inside the editor. Returns a cleanup function. */
export function initListDragReorder(
  editorEl: HTMLElement,
  onReorder?: () => void,
): () => void {
  const onDragStart = (e: DragEvent) => {
    const li = (e.target as HTMLElement).closest('li') as HTMLLIElement | null
    if (!li) return
    draggedItem = li
    li.classList.add(CLS.dragging)
    e.dataTransfer?.setData('text/plain', '')
    e.dataTransfer!.effectAllowed = 'move'
  }

  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    if (!draggedItem) return
    const target = (e.target as HTMLElement).closest('li') as HTMLLIElement | null
    if (!target || target === draggedItem) return

    editorEl
      .querySelectorAll(`.${CLS.dropTarget}`)
      .forEach((el) => el.classList.remove(CLS.dropTarget))

    target.classList.add(CLS.dropTarget)
    e.dataTransfer!.dropEffect = 'move'
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    if (!draggedItem) return

    const target = (e.target as HTMLElement).closest('li') as HTMLLIElement | null
    if (!target || target === draggedItem) return

    // Only reorder within the same list level
    if (target.parentElement !== draggedItem.parentElement) return

    const rect = target.getBoundingClientRect()
    const midY = rect.top + rect.height / 2

    if (e.clientY < midY) {
      target.parentElement?.insertBefore(draggedItem, target)
    } else {
      target.parentElement?.insertBefore(draggedItem, target.nextSibling)
    }

    onReorder?.()
  }

  const onDragEnd = () => {
    if (draggedItem) {
      draggedItem.classList.remove(CLS.dragging)
    }
    editorEl
      .querySelectorAll(`.${CLS.dropTarget}`)
      .forEach((el) => el.classList.remove(CLS.dropTarget))
    draggedItem = null
  }

  editorEl.addEventListener('dragstart', onDragStart)
  editorEl.addEventListener('dragover', onDragOver)
  editorEl.addEventListener('drop', onDrop)
  editorEl.addEventListener('dragend', onDragEnd)

  return () => {
    editorEl.removeEventListener('dragstart', onDragStart)
    editorEl.removeEventListener('dragover', onDragOver)
    editorEl.removeEventListener('drop', onDrop)
    editorEl.removeEventListener('dragend', onDragEnd)
  }
}

// ─── full normalization ─────────────────────────────────────────────────────

/**
 * Normalize all lists inside the editor:
 *  1. Ensure every checkbox-bearing LI has correct classes
 *  2. Ensure parent lists have correct checklist markers
 *  3. Add nesting-depth data attributes for CSS styling
 *  4. Update progress counters
 *  5. Merge adjacent same-type lists
 */
export function normalizeAllLists(editorEl: HTMLElement): void {
  // 1 + 2: checklist markers
  const allItems = editorEl.querySelectorAll('li')
  allItems.forEach((item) => {
    const li = item as HTMLLIElement
    const cb = li.querySelector(
      ':scope > input[type="checkbox"]',
    ) as HTMLInputElement | null

    if (cb) {
      cb.classList.add(CLS.checkbox, 'align-middle', 'mr-2')
      if (!cb.hasAttribute('data-checked')) {
        cb.setAttribute('data-checked', cb.checked ? 'true' : 'false')
      }
      markChecklistItem(li, true)
      ensureTextNode(li)
    } else if (
      li.classList.contains(CLS.checklistItem) ||
      li.getAttribute('data-checklist') === 'true'
    ) {
      markChecklistItem(li, false)
    }
  })

  // 3: nesting depth
  const allLists = editorEl.querySelectorAll('ul, ol')
  allLists.forEach((list) => {
    const items = list.querySelectorAll(':scope > li')
    items.forEach((li) => {
      const depth = getListDepth(li as HTMLLIElement)
      ;(li as HTMLElement).setAttribute('data-list-depth', String(depth))
    })
  })

  // 4: progress
  allLists.forEach((list) => {
    const hasCheckboxes = !!list.querySelector('input[type="checkbox"]')
    markChecklistList(list as HTMLUListElement | HTMLOListElement, hasCheckboxes)
    if (hasCheckboxes) {
      updateChecklistProgress(list as HTMLUListElement | HTMLOListElement)
    }
  })

  // 5: merge adjacent same-type lists
  mergeAdjacentLists(editorEl)
}

// ─── merge adjacent ─────────────────────────────────────────────────────────

/** Merge adjacent lists of the same type */
export function mergeAdjacentLists(editorEl: HTMLElement): void {
  const lists = editorEl.querySelectorAll('ul, ol')
  lists.forEach((list) => {
    const next = list.nextElementSibling
    if (
      next &&
      next.tagName === list.tagName &&
      list.getAttribute('data-checklist') === next.getAttribute('data-checklist')
    ) {
      while (next.firstChild) list.appendChild(next.firstChild)
      next.remove()
    }
  })
}

// ─── convert entire list ────────────────────────────────────────────────────

export function convertListToChecklist(
  list: HTMLUListElement | HTMLOListElement,
): void {
  Array.from(list.querySelectorAll('li')).forEach((li) =>
    addCheckboxToListItem(li as HTMLLIElement),
  )
  markChecklistList(list, true)
  updateChecklistProgress(list)
}

export function convertChecklistToRegularList(
  list: HTMLUListElement | HTMLOListElement,
): void {
  Array.from(list.querySelectorAll('li')).forEach((li) =>
    removeCheckboxFromListItem(li as HTMLLIElement),
  )
  markChecklistList(list, false)
  list.removeAttribute('data-checklist-progress')
  list.removeAttribute('data-checklist-percent')
}

// ─── private util ───────────────────────────────────────────────────────────

/** Position cursor at start or end of an element */
function positionCursorIn(
  el: HTMLElement,
  position: 'start' | 'end' = 'start',
): void {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()

  if (position === 'start') {
    // Skip checkbox / drag handle when positioning
    let target: Node = el
    for (const child of Array.from(el.childNodes)) {
      if (child instanceof HTMLInputElement && child.type === 'checkbox') continue
      if (child instanceof HTMLElement && child.classList.contains(CLS.dragHandle)) continue
      if (child instanceof HTMLUListElement || child instanceof HTMLOListElement) continue
      target = child
      break
    }
    if (target.nodeType === Node.TEXT_NODE) {
      range.setStart(target, 0)
    } else {
      range.setStart(target, 0)
    }
    range.collapse(true)
  } else {
    range.selectNodeContents(el)
    range.collapse(false)
  }

  selection.removeAllRanges()
  selection.addRange(range)
}

/** Get text content of a list item, excluding checkbox, drag handle, and sub-lists */
function getItemTextContent(li: HTMLLIElement): string {
  return Array.from(li.childNodes)
    .filter((node) => {
      if (node instanceof HTMLInputElement && node.type === 'checkbox') return false
      if (node instanceof HTMLUListElement || node instanceof HTMLOListElement) return false
      if (node instanceof HTMLElement && node.classList.contains(CLS.dragHandle)) return false
      return true
    })
    .map((node) => node.textContent ?? '')
    .join('')
    .trim()
}
