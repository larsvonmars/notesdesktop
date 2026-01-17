import { supabase } from './supabase'

export type NoteType = 'rich-text' | 'drawing' | 'mindmap'

export interface Note {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  user_id: string
  folder_id: string | null
  project_id: string | null
  position: number
  note_type: NoteType
}

export interface CreateNoteInput {
  title: string
  content: string
  folder_id?: string | null
  project_id?: string | null
  position?: number
  note_type?: NoteType
}

export interface UpdateNoteInput {
  title?: string
  content?: string
  folder_id?: string | null
  project_id?: string | null
  position?: number
  note_type?: NoteType
}

/**
 * Fetch all notes for the current user
 */
export async function getNotes(): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Fetch a single note by ID
 */
export async function getNote(id: string): Promise<Note | null> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/**
 * Create a new note
 * Note: If a folder_id is provided but project_id is not, the folder's project is automatically inherited.
 */
export async function createNote(input: CreateNoteInput): Promise<Note> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')

  // Determine the project_id:
  // 1. If explicitly provided, use it
  // 2. If folder_id is provided, inherit the folder's project
  // 3. Otherwise, null
  let resolvedProjectId: string | null = null
  if (input.project_id !== undefined) {
    resolvedProjectId = input.project_id
  } else if (input.folder_id) {
    // Inherit the folder's project
    const { data: folderRecord } = await supabase
      .from('folders')
      .select('project_id')
      .eq('id', input.folder_id)
      .single()
    resolvedProjectId = folderRecord?.project_id ?? null
  }

  // Get the next position if not provided
  let position = input.position ?? 0
  if (position === 0) {
    // Build query to count notes in the target folder
    const query = supabase
      .from('notes')
      .select('*', { count: 'exact', head: true })
    
    // Use .is() for null checks, .eq() for non-null values
    if (input.folder_id === null || input.folder_id === undefined) {
      query.is('folder_id', null)
    } else {
      query.eq('folder_id', input.folder_id)
    }

    if (resolvedProjectId === null) {
      query.is('project_id', null)
    } else {
      query.eq('project_id', resolvedProjectId)
    }
    
    const { count } = await query
    position = (count || 0) + 1
  }

  const { data, error } = await supabase
    .from('notes')
    .insert({
      title: input.title,
      content: input.content,
      folder_id: input.folder_id || null,
      project_id: resolvedProjectId,
      position,
      user_id: user.id,
      note_type: input.note_type || 'rich-text',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Update an existing note
 */
export async function updateNote(id: string, input: UpdateNoteInput): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Delete a note
 */
export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Get notes in a specific folder
 */
export async function getNotesByFolder(folderId: string | null): Promise<Note[]> {
  const query = supabase
    .from('notes')
    .select('*')
    .order('position', { ascending: true })

  if (folderId === null) {
    query.is('folder_id', null)
  } else {
    query.eq('folder_id', folderId)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

/**
 * Get notes that belong to a specific project
 */
export async function getNotesByProject(projectId: string | null): Promise<Note[]> {
  const query = supabase
    .from('notes')
    .select('*')
    .order('position', { ascending: true })

  if (projectId === null) {
    query.is('project_id', null)
  } else {
    query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

/**
 * Get the project_id for a folder (helper function)
 */
export async function getFolderProjectId(folderId: string): Promise<string | null> {
  const { data: folderRecord } = await supabase
    .from('folders')
    .select('project_id')
    .eq('id', folderId)
    .single()
  
  return folderRecord?.project_id ?? null
}

/**
 * Move a note to a different folder
 * Note: Moving a note to a folder automatically assigns the folder's project.
 * Moving a note to root (null folder) clears the project unless explicitly specified.
 */
export async function moveNote(
  noteId: string,
  newFolderId: string | null,
  newPosition?: number,
  newProjectId?: string | null
): Promise<Note> {
  let targetProjectId: string | null

  // Determine the target project:
  // 1. If newProjectId is explicitly provided, use it
  // 2. If moving to a folder, inherit that folder's project
  // 3. If moving to root (null folder), clear the project
  if (newProjectId !== undefined) {
    targetProjectId = newProjectId
  } else if (newFolderId) {
    // Inherit the folder's project
    targetProjectId = await getFolderProjectId(newFolderId)
  } else {
    // Moving to root - clear the project for consistency
    targetProjectId = null
  }

  // If position is not provided, calculate it
  let position = newPosition
  if (position === undefined) {
    // Build query to count notes in the target folder
    const query = supabase
      .from('notes')
      .select('*', { count: 'exact', head: true })
    
    // Use .is() for null checks, .eq() for non-null values
    if (newFolderId === null) {
      query.is('folder_id', null)
    } else {
      query.eq('folder_id', newFolderId)
    }

    if (targetProjectId === null) {
      query.is('project_id', null)
    } else {
      query.eq('project_id', targetProjectId)
    }
    
    const { count } = await query
    position = (count || 0) + 1
  }
  
  const payload: UpdateNoteInput = {
    folder_id: newFolderId,
    position,
    project_id: targetProjectId,
  }

  return updateNote(noteId, payload)
}

/**
 * Search notes by title or content
 * Note: Uses parameterized queries via Supabase's textSearch for safety
 */
export async function searchNotes(query: string): Promise<Note[]> {
  // Sanitize the query to prevent SQL injection
  // Escape special characters used in LIKE patterns
  const sanitizedQuery = query
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/%/g, '\\%')    // Escape percent signs
    .replace(/_/g, '\\_')    // Escape underscores
    .replace(/'/g, "''")     // Escape single quotes

  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .or(`title.ilike.%${sanitizedQuery}%,content.ilike.%${sanitizedQuery}%`)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Subscribe to real-time changes for notes
 */
export function subscribeToNotes(
  userId: string,
  callback: (payload: any) => void
) {
  const channel = supabase
    .channel('notes-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notes',
        filter: `user_id=eq.${userId}`,
      },
      callback
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
