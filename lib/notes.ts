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
 */
export async function createNote(input: CreateNoteInput): Promise<Note> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')

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

    if (input.project_id === null || input.project_id === undefined) {
      query.is('project_id', null)
    } else {
      query.eq('project_id', input.project_id)
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
      project_id: input.project_id ?? null,
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
 * Move a note to a different folder
 */
export async function moveNote(
  noteId: string,
  newFolderId: string | null,
  newPosition?: number,
  newProjectId?: string | null
): Promise<Note> {
  let targetProjectId: string | null | undefined = newProjectId

  if (targetProjectId === undefined) {
    if (newFolderId) {
      const { data: folderRecord } = await supabase
        .from('folders')
        .select('project_id')
        .eq('id', newFolderId)
        .single()

      targetProjectId = folderRecord?.project_id ?? null
    } else {
      const { data: noteRecord } = await supabase
        .from('notes')
        .select('project_id')
        .eq('id', noteId)
        .single()

      targetProjectId = noteRecord?.project_id ?? null
    }
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
    } else if (targetProjectId !== undefined) {
      query.eq('project_id', targetProjectId)
    }
    
    const { count } = await query
    position = (count || 0) + 1
  }
  
  const payload: UpdateNoteInput = {
    folder_id: newFolderId,
    position,
  }

  if (newProjectId !== undefined) {
    payload.project_id = newProjectId
  }

  if (newProjectId === undefined && newFolderId !== null && targetProjectId !== undefined) {
    payload.project_id = targetProjectId
  }

  return updateNote(noteId, payload)
}

/**
 * Search notes by title or content
 */
export async function searchNotes(query: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
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
