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
  position: number
  note_type: NoteType
}

export interface CreateNoteInput {
  title: string
  content: string
  folder_id?: string | null
  position?: number
  note_type?: NoteType
}

export interface UpdateNoteInput {
  title?: string
  content?: string
  folder_id?: string | null
  position?: number
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
    const { count } = await supabase
      .from('notes')
      .select('*', { count: 'exact', head: true })
      .eq('folder_id', input.folder_id || null)
    
    position = (count || 0) + 1
  }

  const { data, error } = await supabase
    .from('notes')
    .insert({
      title: input.title,
      content: input.content,
      folder_id: input.folder_id || null,
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
 * Move a note to a different folder
 */
export async function moveNote(
  noteId: string,
  newFolderId: string | null,
  newPosition?: number
): Promise<Note> {
  return updateNote(noteId, {
    folder_id: newFolderId,
    position: newPosition,
  })
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
