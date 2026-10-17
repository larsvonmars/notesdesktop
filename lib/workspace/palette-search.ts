import type { FolderNode } from '@/lib/folders'

export interface FlatFolder {
  id: string
  name: string
  path: string
}

/** Depth-first flattening that keeps a human-readable "Parent / Child" path. */
export function flattenFolderTree(nodes: FolderNode[], trail: string[] = []): FlatFolder[] {
  return nodes.flatMap((node) => {
    const path = [...trail, node.name]
    return [
      { id: node.id, name: node.name, path: path.join(' / ') },
      ...flattenFolderTree(node.children, path),
    ]
  })
}

/** Case-insensitive match against a label and an optional hint/subtitle. */
export function matchesPaletteQuery(label: string, hint: string | undefined, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return (
    label.toLowerCase().includes(normalized) ||
    (hint?.toLowerCase().includes(normalized) ?? false)
  )
}
