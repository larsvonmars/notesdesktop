import type { FolderNode } from '@/lib/folders'
import type { NoteSummary } from '@/lib/notes'

export interface ContextFolderGroup {
  folder: FolderNode
  notes: NoteSummary[]
  children: ContextFolderGroup[]
}

export interface ContextProjectGroup {
  key: string
  label: string
  color?: string | null
  notes: NoteSummary[]
  folders: ContextFolderGroup[]
}

export function truncateAtBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const slice = text.slice(0, maxChars)
  const paragraphBoundary = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '))
  if (paragraphBoundary >= Math.floor(maxChars * 0.65)) {
    return slice.slice(0, paragraphBoundary + 1).trimEnd()
  }
  const wordBoundary = slice.lastIndexOf(' ')
  if (wordBoundary >= Math.floor(maxChars * 0.65)) {
    return slice.slice(0, wordBoundary).trimEnd()
  }
  return slice.trimEnd()
}

export function sortNotesByTitle<T extends { title: string }>(notes: T[]): T[] {
  return [...notes].sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'))
}

export function appendMapValue<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const existing = map.get(key)
  if (existing) {
    existing.push(value)
    return
  }

  map.set(key, [value])
}

export function buildContextFolderGroups(
  nodes: FolderNode[],
  notesByFolderId: Map<string, NoteSummary[]>
): ContextFolderGroup[] {
  return nodes.flatMap((node) => {
    const children = buildContextFolderGroups(node.children, notesByFolderId)
    const notes = sortNotesByTitle(notesByFolderId.get(node.id) ?? [])
    if (notes.length === 0 && children.length === 0) {
      return []
    }

    return [{ folder: node, notes, children }]
  })
}

export function countNotesInFolderGroup(folderGroup: ContextFolderGroup): number {
  return folderGroup.notes.length + folderGroup.children.reduce((total, child) => total + countNotesInFolderGroup(child), 0)
}

export function countNotesInProjectGroup(projectGroup: ContextProjectGroup): number {
  return projectGroup.notes.length + projectGroup.folders.reduce((total, folder) => total + countNotesInFolderGroup(folder), 0)
}
