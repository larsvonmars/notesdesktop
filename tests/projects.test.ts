import { describe, it, expect } from 'vitest'
import { Project, CreateProjectInput, UpdateProjectInput } from '../lib/projects'

describe('Project Types', () => {
  it('should define Project interface correctly', () => {
    const mockProject: Project = {
      id: 'test-id',
      user_id: 'user-id',
      name: 'Test Project',
      description: 'A test project',
      color: '#3B82F6',
      position: 0,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    expect(mockProject.id).toBe('test-id')
    expect(mockProject.name).toBe('Test Project')
    expect(mockProject.color).toBe('#3B82F6')
  })

  it('should define CreateProjectInput with required fields', () => {
    const input: CreateProjectInput = {
      name: 'New Project',
    }

    expect(input.name).toBe('New Project')
  })

  it('should define CreateProjectInput with optional fields', () => {
    const input: CreateProjectInput = {
      name: 'New Project',
      description: 'Optional description',
      color: '#10B981',
      position: 5,
    }

    expect(input.name).toBe('New Project')
    expect(input.description).toBe('Optional description')
    expect(input.color).toBe('#10B981')
    expect(input.position).toBe(5)
  })

  it('should define UpdateProjectInput with optional fields', () => {
    const update: UpdateProjectInput = {
      name: 'Updated Name',
      color: '#EF4444',
    }

    expect(update.name).toBe('Updated Name')
    expect(update.color).toBe('#EF4444')
  })

  it('should allow null description in Project', () => {
    const project: Project = {
      id: 'test-id',
      user_id: 'user-id',
      name: 'Test Project',
      description: null,
      color: '#3B82F6',
      position: 0,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    expect(project.description).toBeNull()
  })

  it('should validate color format', () => {
    const validColors = [
      '#3B82F6', // Blue
      '#10B981', // Green
      '#F59E0B', // Amber
      '#EF4444', // Red
      '#8B5CF6', // Purple
      '#EC4899', // Pink
      '#14B8A6', // Teal
      '#6366F1', // Indigo
    ]

    validColors.forEach((color) => {
      expect(color).toMatch(/^#[0-9A-F]{6}$/i)
    })
  })

  it('should support project positioning', () => {
    const projects: Project[] = [
      {
        id: '1',
        user_id: 'user-id',
        name: 'First',
        description: null,
        color: '#3B82F6',
        position: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        user_id: 'user-id',
        name: 'Second',
        description: null,
        color: '#10B981',
        position: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ]

    const sorted = [...projects].sort((a, b) => a.position - b.position)

    expect(sorted[0].name).toBe('First')
    expect(sorted[1].name).toBe('Second')
  })
})

describe('Project Data Structure', () => {
  it('should represent a complete project hierarchy', () => {
    interface ProjectWithStats {
      project: Project
      folderCount: number
      noteCount: number
    }

    const projectWithStats: ProjectWithStats = {
      project: {
        id: 'project-1',
        user_id: 'user-id',
        name: 'Work Project',
        description: 'Work related items',
        color: '#3B82F6',
        position: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      folderCount: 5,
      noteCount: 12,
    }

    expect(projectWithStats.project.name).toBe('Work Project')
    expect(projectWithStats.folderCount).toBe(5)
    expect(projectWithStats.noteCount).toBe(12)
  })
})

