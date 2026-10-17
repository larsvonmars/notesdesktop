import { createFolder, type Folder } from '@/lib/folders'
import { createNote, getNote, type NoteSummary, type NoteType } from '@/lib/notes'

export interface DeletedFolderRow {
  id: string
  name: string
  parent_id: string | null
  project_id: string | null
}

export interface DeletedNoteRow {
  title: string
  content: string
  note_type: NoteType
  folder_id: string | null
  project_id: string | null
}

/** Everything needed to recreate a folder subtree after deletion. */
export interface DeletedFolderSnapshot {
  folders: DeletedFolderRow[]
  notes: DeletedNoteRow[]
}

/** Ids of a folder plus all of its descendants. */
export function collectFolderSubtreeIds(folderId: string, folders: Folder[]): Set<string> {
  const ids = new Set<string>()
  const visit = (id: string) => {
    if (ids.has(id)) return
    ids.add(id)
    for (const child of folders) {
      if (child.parent_id === id) visit(child.id)
    }
  }
  visit(folderId)
  return ids
}

/**
 * Capture a folder subtree and the notes inside it. Note bodies are fetched
 * lazily so the undo restores real content rather than empty notes.
 */
export async function captureDeletedFolder(
  folderId: string,
  folders: Folder[],
  allNotes: NoteSummary[]
): Promise<DeletedFolderSnapshot> {
  const ids = collectFolderSubtreeIds(folderId, folders)

  const folderRows: DeletedFolderRow[] = folders
    .filter((folder) => ids.has(folder.id))
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      parent_id: folder.parent_id,
      project_id: folder.project_id,
    }))

  const noteRows = allNotes.filter((note) => note.folder_id && ids.has(note.folder_id))
  const fullNotes = await Promise.all(
    noteRows.map(async (note) => {
      const full = await getNote(note.id)
      if (!full) return null
      return {
        title: full.title,
        content: full.content,
        note_type: full.note_type,
        folder_id: full.folder_id,
        project_id: full.project_id ?? null,
      } satisfies DeletedNoteRow
    })
  )

  return { folders: folderRows, notes: fullNotes.filter((note): note is DeletedNoteRow => note !== null) }
}

/**
 * Recreate a captured subtree (parents first) and its notes. Returns the new
 * id of the subtree root, or null when there was nothing to restore.
 */
export async function restoreDeletedFolder(snapshot: DeletedFolderSnapshot): Promise<string | null> {
  const idMap = new Map<string, string>()
  const snapshotIds = new Set(snapshot.folders.map((folder) => folder.id))
  let remaining = [...snapshot.folders]

  // Create parents before their children; ids outside the snapshot are kept.
  while (remaining.length > 0) {
    const ready = remaining.filter(
      (folder) =>
        !folder.parent_id ||
        !snapshotIds.has(folder.parent_id) ||
        idMap.has(folder.parent_id)
    )

    if (ready.length === 0) break

    for (const folder of ready) {
      const created = await createFolder({
        name: folder.name,
        parent_id: folder.parent_id ? idMap.get(folder.parent_id) ?? folder.parent_id : null,
        project_id: folder.project_id,
      })
      idMap.set(folder.id, created.id)
    }

    remaining = remaining.filter((folder) => !idMap.has(folder.id))
  }

  for (const note of snapshot.notes) {
    await createNote({
      title: note.title,
      content: note.content,
      note_type: note.note_type,
      folder_id: note.folder_id ? idMap.get(note.folder_id) ?? null : null,
      project_id: note.project_id,
    })
  }

  const root = snapshot.folders[0]
  return root ? idMap.get(root.id) ?? null : null
}
