import { supabase } from './supabase'

export interface Folder {
  id: string
  user_id: string
  name: string
  parent_id: string | null
  project_id: string | null
  position: number
  created_at: string
  updated_at: string
}

export interface CreateFolderInput {
  name: string
  parent_id?: string | null
  project_id?: string | null
  position?: number
}

export interface UpdateFolderInput {
  name?: string
  parent_id?: string | null
  project_id?: string | null
  position?: number
}

/**
 * Fetch all folders for the current user
 */
export async function getFolders(): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .order('position', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Fetch root-level folders (no parent)
 */
export async function getRootFolders(): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .is('parent_id', null)
    .order('position', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Fetch subfolders of a specific folder
 */
export async function getSubfolders(parentId: string): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('parent_id', parentId)
    .order('position', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Get a single folder by ID
 */
export async function getFolder(id: string): Promise<Folder | null> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/**
 * Create a new folder
 */
export async function createFolder(input: CreateFolderInput): Promise<Folder> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Not authenticated')

  // Get the next position if not provided
  let position = input.position ?? 0
  if (position === 0) {
    // Build query to count folders at the target level
    const query = supabase
      .from('folders')
      .select('*', { count: 'exact', head: true })
    
    // Use .is() for null checks, .eq() for non-null values
    if (input.parent_id === null || input.parent_id === undefined) {
      query.is('parent_id', null)
    } else {
      query.eq('parent_id', input.parent_id)
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
    .from('folders')
    .insert({
      name: input.name,
      parent_id: input.parent_id || null,
      project_id: input.project_id ?? null,
      position,
      user_id: user.id,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Update an existing folder
 */
export async function updateFolder(id: string, input: UpdateFolderInput): Promise<Folder> {
  const { data, error } = await supabase
    .from('folders')
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
 * Delete a folder (and optionally move its contents)
 */
export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Check if a folder is a descendant of another folder
 * Used to prevent circular references when moving folders
 */
async function isDescendantOf(
  potentialDescendantId: string,
  potentialAncestorId: string
): Promise<boolean> {
  // Walk up the tree from potentialDescendantId to check if we hit potentialAncestorId
  let currentId: string | null = potentialDescendantId
  const visited = new Set<string>()
  
  while (currentId) {
    // Prevent infinite loops in case of existing circular references
    if (visited.has(currentId)) {
      console.warn('Circular reference detected in folder hierarchy')
      return true
    }
    visited.add(currentId)
    
    if (currentId === potentialAncestorId) {
      return true
    }
    
    const { data: folder }: { data: { parent_id: string | null } | null } = await supabase
      .from('folders')
      .select('parent_id')
      .eq('id', currentId)
      .single()
    
    currentId = folder?.parent_id ?? null
  }
  
  return false
}

/**
 * Move a folder to a new parent
 * Note: When moving to a new parent, the folder inherits the parent's project.
 * When moving to root, the folder keeps its current project unless the parent had one.
 * All notes in the folder are also updated to match the new project for consistency.
 */
export async function moveFolder(
  folderId: string,
  newParentId: string | null,
  newPosition?: number
): Promise<Folder> {
  // Prevent moving a folder to itself
  if (folderId === newParentId) {
    throw new Error('Cannot move a folder into itself')
  }

  // Prevent circular references: ensure newParentId is not a descendant of folderId
  if (newParentId !== null) {
    const wouldCreateCycle = await isDescendantOf(newParentId, folderId)
    if (wouldCreateCycle) {
      throw new Error('Cannot move a folder into one of its subfolders')
    }
  }

  // Determine target project:
  // - If moving into a folder, inherit that folder's project
  // - If moving to root, keep current project (could be null)
  let targetProjectId: string | null = null

  if (newParentId) {
    // Inherit project from new parent
    const { data: parentFolder } = await supabase
      .from('folders')
      .select('project_id')
      .eq('id', newParentId)
      .single()

    targetProjectId = parentFolder?.project_id ?? null
  } else {
    // Moving to root - keep current project
    const { data: folderRecord } = await supabase
      .from('folders')
      .select('project_id')
      .eq('id', folderId)
      .single()

    targetProjectId = folderRecord?.project_id ?? null
  }

  // If position is not provided, calculate it
  let position = newPosition
  if (position === undefined) {
    // Build query to count folders at the target level
    const query = supabase
      .from('folders')
      .select('*', { count: 'exact', head: true })
    
    // Use .is() for null checks, .eq() for non-null values
    if (newParentId === null) {
      query.is('parent_id', null)
    } else {
      query.eq('parent_id', newParentId)
    }

    if (targetProjectId === null) {
      query.is('project_id', null)
    } else {
      query.eq('project_id', targetProjectId)
    }
    
    const { count } = await query
    position = (count || 0) + 1
  }
  
  // Update the folder with new parent, position, and project
  const updatedFolder = await updateFolder(folderId, {
    parent_id: newParentId,
    position,
    project_id: targetProjectId,
  })

  // Also update all notes in this folder to match the new project
  // This ensures folder-project-note consistency
  const { error: notesError } = await supabase
    .from('notes')
    .update({ 
      project_id: targetProjectId,
      updated_at: new Date().toISOString()
    })
    .eq('folder_id', folderId)

  if (notesError) {
    console.error('Failed to update notes project_id:', notesError)
    // Don't throw - the folder move succeeded, notes can be fixed later
  }

  return updatedFolder
}

/**
 * Get folder breadcrumb path (from root to folder)
 */
export async function getFolderPath(folderId: string): Promise<Folder[]> {
  const path: Folder[] = []
  let currentId: string | null = folderId

  while (currentId) {
    const folder = await getFolder(currentId)
    if (!folder) break
    
    path.unshift(folder) // Add to beginning
    currentId = folder.parent_id
  }

  return path
}

/**
 * Build a nested folder tree structure
 */
export function buildFolderTree(folders: Folder[]): FolderNode[] {
  const folderMap = new Map<string, FolderNode>()
  const rootFolders: FolderNode[] = []

  // Create nodes for all folders
  folders.forEach(folder => {
    folderMap.set(folder.id, {
      ...folder,
      children: [],
      expanded: false,
    })
  })

  // Build the tree structure
  folders.forEach(folder => {
    const node = folderMap.get(folder.id)!
    
    if (folder.parent_id) {
      const parent = folderMap.get(folder.parent_id)
      if (parent) {
        parent.children.push(node)
      }
    } else {
      rootFolders.push(node)
    }
  })

  return rootFolders
}

export interface FolderNode extends Folder {
  children: FolderNode[]
  expanded: boolean
}

/**
 * Subscribe to real-time changes for folders
 */
export function subscribeToFolders(
  userId: string,
  callback: (payload: any) => void
) {
  const channel = supabase
    .channel('folders-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'folders',
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
 * Reorder folders within the same parent
 */
export async function reorderFolders(
  folderId: string,
  newPosition: number,
  parentId: string | null
): Promise<void> {
  // Get all sibling folders
  const query = supabase
    .from('folders')
    .select('id, position')
    .order('position')
  
  // Use .is() for null checks, .eq() for non-null values
  if (parentId === null) {
    query.is('parent_id', null)
  } else {
    query.eq('parent_id', parentId)
  }
  
  const { data: siblings } = await query

  if (!siblings) return

  // Update positions
  const updates = siblings.map((sibling, index) => {
    if (sibling.id === folderId) {
      return { id: sibling.id, position: newPosition }
    } else if (index >= newPosition) {
      return { id: sibling.id, position: index + 1 }
    } else {
      return { id: sibling.id, position: index }
    }
  })

  // Update all positions in batch
  for (const update of updates) {
    await supabase
      .from('folders')
      .update({ position: update.position })
      .eq('id', update.id)
  }
}
