/**
 * List Handling Utilities
 * Dedicated utilities for creating, merging, and managing lists
 */

import { saveSelection, restoreSelection, type SelectionSnapshot } from './commandDispatcher'

/**
 * Get the closest list item ancestor
 */
export function getClosestListItem(node: Node | null): HTMLLIElement | null {
  if (!node) return null
  
  let current = node
  while (current && current !== document.body) {
    if (current instanceof HTMLLIElement) {
      // Validate element is still connected
      if (current.isConnected) {
        return current
      }
      return null
    }
    current = current.parentNode
  }
  return null
}

/**
 * Get the closest list (ul/ol) ancestor
 */
export function getClosestList(node: Node | null): HTMLUListElement | HTMLOListElement | null {
  if (!node) return null
  
  let current = node
  while (current && current !== document.body) {
    if (current instanceof HTMLUListElement || current instanceof HTMLOListElement) {
      // Validate element is still connected
      if (current.isConnected) {
        return current
      }
      return null
    }
    current = current.parentNode
  }
  return null
}

/**
 * Create a list around selected blocks
 */
export function createList(
  type: 'ul' | 'ol',
  editorElement?: HTMLElement | null
): void {
  try {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      console.warn('No selection for list creation')
      return
    }
    
    const range = selection.getRangeAt(0)
    
    // Validate range is in document
    if (!document.body.contains(range.commonAncestorContainer)) {
      console.warn('Selection range not in document')
      return
    }
    
    // Check if we're already in a list
    const existingListItem = getClosestListItem(range.startContainer)
    
    if (existingListItem && existingListItem.isConnected) {
      // Already in a list, just toggle the list type or remove from list
      const list = existingListItem.parentElement as HTMLUListElement | HTMLOListElement
      if (!list || !list.isConnected) {
        console.warn('List element not connected')
        return
      }
      
      if (list.tagName.toLowerCase() === type) {
        // Same type - remove from list
        removeFromList(existingListItem)
      } else {
        // Different type - convert list
        convertListType(list, type)
      }
      return
    }
    
    // Create new list
    const list = document.createElement(type)
    const listItem = document.createElement('li')
    
    // Save selection
    const snapshot = saveSelection()
    
    if (range.collapsed) {
      // No selection - insert empty list item
      listItem.appendChild(document.createElement('br'))
      list.appendChild(listItem)
      
      try {
        range.insertNode(list)
      } catch (error) {
        console.error('Failed to insert list:', error)
        return
      }
      
      // Move cursor into the list item
      try {
        const newRange = document.createRange()
        newRange.setStart(listItem, 0)
        newRange.collapse(true)
        selection.removeAllRanges()
        selection.addRange(newRange)
      } catch (error) {
        console.warn('Failed to position cursor in new list:', error)
      }
    } else {
      // Has selection - wrap it in list
      try {
        const contents = range.extractContents()
        listItem.appendChild(contents)
        list.appendChild(listItem)
        range.insertNode(list)
        
        // Restore selection
        if (snapshot) {
          try {
            restoreSelection(snapshot)
          } catch (error) {
            // If restoration fails, put cursor at end of list item
            const newRange = document.createRange()
            newRange.selectNodeContents(listItem)
            newRange.collapse(false)
            selection.removeAllRanges()
            selection.addRange(newRange)
          }
        }
      } catch (error) {
        console.error('Failed to create list with selection:', error)
      }
    }
  } catch (error) {
    console.error('Error in createList:', error)
  }
}

/**
 * Remove a list item from its list
 */
function removeFromList(listItem: HTMLLIElement): void {
  try {
    // Validate list item is connected
    if (!listItem.isConnected) {
      console.warn('List item not connected during removal')
      return
    }
    
    const list = listItem.parentElement
    if (!list || !list.isConnected) {
      console.warn('List not found or not connected')
      return
    }
    
    // Create a paragraph with the list item's content
    const p = document.createElement('p')
    
    // Move content (excluding checkboxes)
    Array.from(listItem.childNodes).forEach(node => {
      if (!(node instanceof HTMLInputElement && node.type === 'checkbox')) {
        try {
          p.appendChild(node.cloneNode(true))
        } catch (error) {
          console.warn('Failed to clone node:', error)
        }
      }
    })
    
    // If paragraph is empty, add a br
    if (p.textContent?.trim() === '') {
      p.appendChild(document.createElement('br'))
    }
    
    // Insert paragraph before or after the list
    const parent = list.parentNode
    if (!parent || !parent.isConnected) {
      console.warn('List parent not available')
      return
    }
    
    try {
      if (listItem === list.firstChild) {
        parent.insertBefore(p, list)
      } else {
        parent.insertBefore(p, list.nextSibling)
      }
    } catch (error) {
      console.error('Failed to insert paragraph:', error)
      return
    }
    
    // Remove the list item
    try {
      list.removeChild(listItem)
    } catch (error) {
      console.error('Failed to remove list item:', error)
      return
    }
    
    // Remove the list if it's now empty
    if (list.children.length === 0) {
      try {
        list.remove()
      } catch (error) {
        console.warn('Failed to remove empty list:', error)
      }
    }
  } catch (error) {
    console.error('Error in removeFromList:', error)
  }
}

/**
 * Convert a list from one type to another
 */
function convertListType(
  list: HTMLUListElement | HTMLOListElement,
  newType: 'ul' | 'ol'
): void {
  try {
    // Validate list is connected
    if (!list.isConnected) {
      console.warn('List not connected during conversion')
      return
    }
    
    const currentType = list.tagName.toLowerCase()
    if (currentType === newType) return
    
    const newList = document.createElement(newType)
    
    // Copy attributes safely
    try {
      Array.from(list.attributes).forEach(attr => {
        newList.setAttribute(attr.name, attr.value)
      })
    } catch (error) {
      console.warn('Failed to copy list attributes:', error)
    }
    
    // Move all children safely using array
    const children = Array.from(list.childNodes)
    children.forEach(child => {
      try {
        newList.appendChild(child)
      } catch (error) {
        console.warn('Failed to move list child:', error)
      }
    })
    
    // Replace the list
    const parent = list.parentNode
    if (!parent || !parent.isConnected) {
      console.warn('List parent not available for replacement')
      return
    }
    
    try {
      parent.replaceChild(newList, list)
    } catch (error) {
      console.error('Failed to replace list:', error)
    }
  } catch (error) {
    console.error('Error in convertListType:', error)
  }
}

/**
 * Toggle list type (ul <-> ol)
 */
export function toggleListType(
  type: 'ul' | 'ol',
  editorElement?: HTMLElement | null
): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  
  const range = selection.getRangeAt(0)
  const list = getClosestList(range.startContainer)
  
  if (list) {
    convertListType(list, type)
  } else {
    createList(type, editorElement)
  }
}

/**
 * Create or update checkbox for a list item
 */
export function createCheckbox(): HTMLInputElement {
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = 'align-middle mr-2 checklist-checkbox'
  checkbox.setAttribute('data-checked', 'false')
  return checkbox
}

/**
 * Add checkbox to a list item
 */
export function addCheckboxToListItem(listItem: HTMLLIElement): void {
  // Check if checkbox already exists
  const existingCheckbox = listItem.querySelector('input[type="checkbox"]')
  if (existingCheckbox) return
  
  const checkbox = createCheckbox()
  listItem.insertBefore(checkbox, listItem.firstChild)
  
  // Mark as checklist item
  listItem.classList.add('checklist-item')
  listItem.setAttribute('data-checklist', 'true')
  
  // Mark parent list as checklist
  const list = listItem.parentElement
  if (list) {
    list.classList.add('checklist-list')
    list.setAttribute('data-checklist', 'true')
  }
}

/**
 * Remove checkbox from a list item
 */
export function removeCheckboxFromListItem(listItem: HTMLLIElement): void {
  const checkbox = listItem.querySelector('input[type="checkbox"]')
  if (checkbox) {
    checkbox.remove()
  }
  
  listItem.classList.remove('checklist-item')
  listItem.removeAttribute('data-checklist')
  
  // Check if parent list still has checkboxes
  const list = listItem.parentElement
  if (list) {
    const hasCheckboxes = !!list.querySelector('input[type="checkbox"]')
    if (!hasCheckboxes) {
      list.classList.remove('checklist-list')
      list.removeAttribute('data-checklist')
    }
  }
}

/**
 * Toggle checklist state for current list/list item
 */
export function toggleChecklistState(editorElement?: HTMLElement | null): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  
  const range = selection.getRangeAt(0)
  const listItem = getClosestListItem(range.startContainer)
  
  if (!listItem) {
    // Not in a list - create a checklist
    const snapshot = saveSelection()
    createList('ul', editorElement)
    
    // Add checkbox to the new list item
    setTimeout(() => {
      const newListItem = getClosestListItem(window.getSelection()?.getRangeAt(0)?.startContainer ?? null)
      if (newListItem) {
        addCheckboxToListItem(newListItem)
      }
    }, 0)
    
    return
  }
  
  // In a list - toggle checkbox
  const hasCheckbox = !!listItem.querySelector('input[type="checkbox"]')
  
  if (hasCheckbox) {
    removeCheckboxFromListItem(listItem)
  } else {
    addCheckboxToListItem(listItem)
  }
}

/**
 * Convert entire list to checklist
 */
export function convertListToChecklist(list: HTMLUListElement | HTMLOListElement): void {
  Array.from(list.children).forEach(child => {
    if (child instanceof HTMLLIElement) {
      addCheckboxToListItem(child)
    }
  })
}

/**
 * Convert checklist back to regular list
 */
export function convertChecklistToRegularList(list: HTMLUListElement | HTMLOListElement): void {
  Array.from(list.children).forEach(child => {
    if (child instanceof HTMLLIElement) {
      removeCheckboxFromListItem(child)
    }
  })
}

/**
 * Merge adjacent lists of the same type
 */
export function mergeAdjacentLists(editorElement: HTMLElement): void {
  const lists = editorElement.querySelectorAll('ul, ol')
  
  lists.forEach(list => {
    const next = list.nextElementSibling
    
    if (
      next &&
      next.tagName === list.tagName &&
      list.getAttribute('data-checklist') === next.getAttribute('data-checklist')
    ) {
      // Merge next into current
      while (next.firstChild) {
        list.appendChild(next.firstChild)
      }
      next.remove()
    }
  })
}
