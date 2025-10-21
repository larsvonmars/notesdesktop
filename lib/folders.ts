import { supabase } from './supabase'

export interface Folder {
  id: string
  user_id: string
  name: string
  parent_id: string | null
  position: number
  created_at: string
  updated_at: string
}

export interface CreateFolderInput {
  name: string
  parent_id?: string | null
  position?: number
}

export interface UpdateFolderInput {
  name?: string
  parent_id?: string | null
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
    
    const { count } = await query
    position = (count || 0) + 1
  }

  const { data, error } = await supabase
    .from('folders')
    .insert({
      name: input.name,
      parent_id: input.parent_id || null,
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
 * Move a folder to a new parent
 */
export async function moveFolder(
  folderId: string,
  newParentId: string | null,
  newPosition?: number
): Promise<Folder> {
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
    
    const { count } = await query
    position = (count || 0) + 1
  }
  
  return updateFolder(folderId, {
    parent_id: newParentId,
    position,
  })
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
