'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  X,
  FolderTree,
  FileText,
  Plus,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  Loader2,
  MoreVertical,
  PenTool,
  Network,
  Folder,
  Search,
  Target as TargetIcon,
} from 'lucide-react'
import { Note } from './NoteEditor'
import { FolderNode } from '@/lib/folders'
import { supabase } from '@/lib/supabase'
import {
  Project,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getProjectFolderCount,
  getProjectNoteCount,
  subscribeToProjects,
} from '@/lib/projects'

interface ProjectManagerProps {
  isOpen: boolean
  onClose: () => void
  
  // Data
  folders: FolderNode[]
  notes: Note[]
  
  // Callbacks
  onSelectNote?: (note: Note) => void
  onSelectFolder?: (folderId: string | null) => void
  onCreateProject?: () => void
  onMoveNoteToProject?: (noteId: string, projectId: string | null) => void
  onMoveFolderToProject?: (folderId: string, projectId: string | null) => void
}

interface ProjectWithStats extends Project {
  folderCount?: number
  noteCount?: number
}

export default function ProjectManager({
  isOpen,
  onClose,
  folders,
  notes,
  onSelectNote,
  onSelectFolder,
  onMoveNoteToProject,
  onMoveFolderToProject,
}: ProjectManagerProps) {
  const [projects, setProjects] = useState<ProjectWithStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState<Project | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState<Project | null>(null)
  
  // Form states
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectColor, setProjectColor] = useState('#3B82F6')
  
  const inputRef = useRef<HTMLInputElement>(null)

  // Load projects on mount
  useEffect(() => {
    if (isOpen) {
      loadProjects()
    }
  }, [isOpen])

  // Subscribe to real-time updates
  useEffect(() => {
    let unsubscribe: (() => void) | undefined

    const setupSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isOpen) return

      unsubscribe = subscribeToProjects(user.id, () => {
        loadProjects()
      })
    }

    setupSubscription()

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [isOpen])

  const loadProjects = async () => {
    try {
      setIsLoading(true)
      const fetchedProjects = await getProjects()
      
      // Load stats for each project
      const projectsWithStats = await Promise.all(
        fetchedProjects.map(async (project) => {
          const [folderCount, noteCount] = await Promise.all([
            getProjectFolderCount(project.id),
            getProjectNoteCount(project.id),
          ])
          
          return {
            ...project,
            folderCount,
            noteCount,
          }
        })
      )
      
      setProjects(projectsWithStats)
    } catch (error) {
      console.error('Error loading projects:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateProject = async () => {
    const name = projectName.trim()
    if (!name) return

    try {
      await createProject({
        name,
        description: projectDescription.trim() || null,
        color: projectColor,
      })
      
      setShowCreateModal(false)
      setProjectName('')
      setProjectDescription('')
      setProjectColor('#3B82F6')
      
      loadProjects()
    } catch (error) {
      console.error('Error creating project:', error)
      alert('Failed to create project. Please try again.')
    }
  }

  const handleUpdateProject = async () => {
    if (!showEditModal) return
    
    const name = projectName.trim()
    if (!name) return

    try {
      await updateProject(showEditModal.id, {
        name,
        description: projectDescription.trim() || null,
        color: projectColor,
      })
      
      setShowEditModal(null)
      setProjectName('')
      setProjectDescription('')
      setProjectColor('#3B82F6')
      
      loadProjects()
    } catch (error) {
      console.error('Error updating project:', error)
      alert('Failed to update project. Please try again.')
    }
  }

  const handleDeleteProject = async () => {
    if (!showDeleteModal) return

    try {
      await deleteProject(showDeleteModal.id)
      setShowDeleteModal(null)
      loadProjects()
    } catch (error) {
      console.error('Error deleting project:', error)
      alert('Failed to delete project. Please try again.')
    }
  }

  const openCreateModal = () => {
    setProjectName('')
    setProjectDescription('')
    setProjectColor('#3B82F6')
    setShowCreateModal(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const openEditModal = (project: Project) => {
    setProjectName(project.name)
    setProjectDescription(project.description || '')
    setProjectColor(project.color)
    setShowEditModal(project)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  // Get folders and notes for a project
  const getProjectItems = (projectId: string | null) => {
    // For now, we'll show placeholder - in a real implementation,
    // you'd filter by project_id from the database
    const projectFolders = folders.filter((f: any) => f.project_id === projectId)
    const projectNotes = notes.filter((n: any) => n.project_id === projectId)
    
    return { folders: projectFolders, notes: projectNotes }
  }

  // Filter projects by search
  const filteredProjects = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return projects
    
    return projects.filter((p) => 
      p.name.toLowerCase().includes(query) || 
      p.description?.toLowerCase().includes(query)
    )
  }, [projects, searchQuery])

  // Color presets
  const colorPresets = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#6366F1', // Indigo
  ]

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
              <TargetIcon size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Project Manager</h2>
              <p className="text-sm text-gray-600">Organize your work into projects</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search and Create */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              New Project
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-blue-500" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-12">
              {searchQuery ? (
                <>
                  <Search size={48} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-600">No projects found matching &quot;{searchQuery}&quot;</p>
                </>
              ) : (
                <>
                  <TargetIcon size={48} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-600 mb-2">No projects yet</p>
                  <p className="text-sm text-gray-400">Create your first project to get started</p>
                  <button
                    onClick={openCreateModal}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Create Project
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProjects.map((project) => {
                const isExpanded = expandedProjects.has(project.id)
                const items = getProjectItems(project.id)
                
                return (
                  <div
                    key={project.id}
                    className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-sm transition-shadow"
                  >
                    {/* Project Header */}
                    <div
                      className="flex items-center gap-3 p-3 bg-white hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleProject(project.id)}
                    >
                      <button className="p-1">
                        {isExpanded ? (
                          <ChevronDown size={16} className="text-gray-600" />
                        ) : (
                          <ChevronRight size={16} className="text-gray-600" />
                        )}
                      </button>
                      
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {project.name}
                        </h3>
                        {project.description && (
                          <p className="text-sm text-gray-500 truncate">
                            {project.description}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <Folder size={14} />
                          <span>{project.folderCount || 0}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText size={14} />
                          <span>{project.noteCount || 0}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditModal(project)
                          }}
                          className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                          title="Edit project"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowDeleteModal(project)
                          }}
                          className="p-1.5 hover:bg-red-100 text-red-600 rounded transition-colors"
                          title="Delete project"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    
                    {/* Project Content (when expanded) */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 bg-gray-50 p-3">
                        <div className="space-y-2">
                          {/* Folders in this project */}
                          {items.folders.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                                Folders
                              </div>
                              <div className="space-y-1">
                                {items.folders.map((folder: any) => (
                                  <button
                                    key={folder.id}
                                    onClick={() => onSelectFolder?.(folder.id)}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 bg-white hover:bg-blue-50 rounded text-sm text-gray-700 transition-colors"
                                  >
                                    <FolderTree size={14} className="text-amber-500" />
                                    <span>{folder.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Notes in this project */}
                          {items.notes.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                                Notes
                              </div>
                              <div className="space-y-1">
                                {items.notes.map((note) => (
                                  <button
                                    key={note.id}
                                    onClick={() => onSelectNote?.(note)}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 bg-white hover:bg-blue-50 rounded text-sm text-gray-700 transition-colors"
                                  >
                                    {note.note_type === 'drawing' ? (
                                      <PenTool size={14} className="text-purple-500" />
                                    ) : note.note_type === 'mindmap' ? (
                                      <Network size={14} className="text-green-500" />
                                    ) : (
                                      <FileText size={14} className="text-blue-500" />
                                    )}
                                    <span>{note.title || 'Untitled'}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {items.folders.length === 0 && items.notes.length === 0 && (
                            <div className="text-center py-4 text-sm text-gray-400">
                              No items in this project yet
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}</span>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Create/Edit Project Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {showCreateModal ? 'Create New Project' : 'Edit Project'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My Awesome Project"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      showCreateModal ? handleCreateProject() : handleUpdateProject()
                    } else if (e.key === 'Escape') {
                      setShowCreateModal(false)
                      setShowEditModal(null)
                    }
                  }}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="What's this project about?"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <div className="flex gap-2">
                  {colorPresets.map((color) => (
                    <button
                      key={color}
                      onClick={() => setProjectColor(color)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        projectColor === color ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setShowEditModal(null)
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={showCreateModal ? handleCreateProject : handleUpdateProject}
                disabled={!projectName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {showCreateModal ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={24} className="text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  Delete Project?
                </h3>
                <p className="text-sm text-gray-600">
                  Are you sure you want to delete &quot;{showDeleteModal.name}&quot;?
                  <span className="block mt-1 text-gray-500">
                    Folders and notes will be moved to &quot;No Project&quot;. This action cannot be undone.
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDeleteModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
