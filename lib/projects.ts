import { supabase } from './supabase'

export interface QuickLink {
  id: string
  label: string
  url: string
  icon?: string | null
}

export interface Project {
  id: string
  user_id: string
  name: string
  description: string | null
  color: string
  position: number
  quick_links: QuickLink[]
  created_at: string
  updated_at: string
  /** Set when the project is archived (hidden from the active workspace). */
  archived_at?: string | null
}

export interface CreateProjectInput {
  name: string
  description?: string | null
  color?: string
  position?: number
}

export interface UpdateProjectInput {
  name?: string
  description?: string | null
  color?: string
  position?: number
  quick_links?: QuickLink[]
}

/**
 * Fetch the current user's ACTIVE (non-archived) projects.
 */
export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .is('archived_at', null)
    .order('position', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Fetch the current user's ARCHIVED projects (most recently archived first).
 */
export async function getArchivedProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Get a single project by ID
 */
export async function getProject(id: string): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/**
 * Create a new project
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // If no position provided, append to end
  let position = input.position
  if (position === undefined) {
    const { data: existing } = await supabase
      .from('projects')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
    
    position = existing && existing.length > 0 ? existing[0].position + 1 : 0
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? '#3B82F6',
      position,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Update an existing project
 */
export async function updateProject(
  id: string,
  input: UpdateProjectInput
): Promise<Project> {
  const updates: any = {}
  
  if (input.name !== undefined) updates.name = input.name
  if (input.description !== undefined) updates.description = input.description
  if (input.color !== undefined) updates.color = input.color
  if (input.position !== undefined) updates.position = input.position
  if (input.quick_links !== undefined) updates.quick_links = input.quick_links

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Archive a project: hides it (and its folders/notes) from the active
 * workspace without deleting anything. Returns the updated project.
 */
export async function archiveProject(id: string): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Restore an archived project back into the active workspace.
 */
export async function restoreProject(id: string): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update({
      archived_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Delete a project. Child folders/notes keep their rows but their project_id
 * is set to NULL by the database FK (ON DELETE SET NULL), so they become
 * unfiled rather than being destroyed.
 */
export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Move a folder to a project
 * Note: This also updates all notes in the folder to have the same project_id
 * for consistency.
 */
export async function moveFolderToProject(
  folderId: string,
  projectId: string | null
): Promise<void> {
  // Update the folder's project
  const { error: folderError } = await supabase
    .from('folders')
    .update({ 
      project_id: projectId,
      updated_at: new Date().toISOString()
    })
    .eq('id', folderId)

  if (folderError) throw folderError
  
  // Update all notes in this folder to match the new project
  // This ensures folder-project-note consistency
  const { error: notesError } = await supabase
    .from('notes')
    .update({ 
      project_id: projectId,
      updated_at: new Date().toISOString()
    })
    .eq('folder_id', folderId)

  if (notesError) throw notesError
}

/**
 * Move a note to a project
 */
export async function moveNoteToProject(
  noteId: string,
  projectId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .update({ 
      project_id: projectId,
      updated_at: new Date().toISOString()
    })
    .eq('id', noteId)

  if (error) throw error
}

/**
 * Get count of folders in a project
 */
export async function getProjectFolderCount(projectId: string): Promise<number> {
  const { count, error } = await supabase
    .from('folders')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (error) throw error
  return count || 0
}

/**
 * Get count of notes in a project
 */
export async function getProjectNoteCount(projectId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notes')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (error) throw error
  return count || 0
}

/**
 * Subscribe to real-time project changes
 */
export function subscribeToProjects(
  userId: string,
  callback: (payload: any) => void
): () => void {
  const channel = supabase
    .channel('project-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'projects',
        filter: `user_id=eq.${userId}`,
      },
      callback
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/**
 * Update only the quick_links for a project
 */
export async function updateProjectQuickLinks(
  projectId: string,
  quickLinks: QuickLink[]
): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update({ quick_links: quickLinks })
    .eq('id', projectId)
    .select()
    .single()

  if (error) throw error
  return data
}
