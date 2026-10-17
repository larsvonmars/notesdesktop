/**
 * Database types for the tables this app reads and writes directly.
 *
 * These were written by hand for the core workspace tables. Regenerate them
 * from the live project once the Supabase CLI is linked:
 *
 *   npx supabase gen types typescript --linked > lib/database.types.ts
 *
 * Unknown tables intentionally fall back to untyped rows so the rest of the
 * data layer keeps compiling until it is migrated to generated types.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type NoteTypeRow =
  | 'rich-text'
  | 'drawing'
  | 'mindmap'
  | 'bullet-journal'
  | 'data-sheet'
  | 'pdf-annotation'

export type NotesRow = {
  id: string
  user_id: string
  title: string
  content: string
  folder_id: string | null
  project_id: string | null
  position: number
  note_type: NoteTypeRow
  created_at: string
  updated_at: string
}

export type NotesInsert = {
  id?: string
  user_id: string
  title: string
  content?: string
  folder_id?: string | null
  project_id?: string | null
  position?: number
  note_type?: NoteTypeRow
  created_at?: string
  updated_at?: string
}

export type NotesUpdate = {
  id?: string
  user_id?: string
  title?: string
  content?: string
  folder_id?: string | null
  project_id?: string | null
  position?: number
  note_type?: NoteTypeRow
  created_at?: string
  updated_at?: string
}

export type FoldersRow = {
  id: string
  user_id: string
  name: string
  parent_id: string | null
  project_id: string | null
  position: number
  created_at: string
  updated_at: string
}

export type FoldersInsert = {
  id?: string
  user_id: string
  name: string
  parent_id?: string | null
  project_id?: string | null
  position?: number
  created_at?: string
  updated_at?: string
}

export type FoldersUpdate = {
  id?: string
  user_id?: string
  name?: string
  parent_id?: string | null
  project_id?: string | null
  position?: number
  created_at?: string
  updated_at?: string
}

export type QuickLinkRow = {
  id: string
  label: string
  url: string
  icon?: string | null
}

export type ProjectsRow = {
  id: string
  user_id: string
  name: string
  description: string | null
  color: string
  position: number
  quick_links: QuickLinkRow[]
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type ProjectsInsert = {
  id?: string
  user_id: string
  name: string
  description?: string | null
  color?: string
  position?: number
  quick_links?: QuickLinkRow[]
  created_at?: string
  updated_at?: string
  archived_at?: string | null
}

export type ProjectsUpdate = {
  id?: string
  user_id?: string
  name?: string
  description?: string | null
  color?: string
  position?: number
  quick_links?: QuickLinkRow[]
  created_at?: string
  updated_at?: string
  archived_at?: string | null
}

export type Database = {
  public: {
    Tables: {
      notes: {
        Row: NotesRow
        Insert: NotesInsert
        Update: NotesUpdate
        Relationships: []
      }
      folders: {
        Row: FoldersRow
        Insert: FoldersInsert
        Update: FoldersUpdate
        Relationships: []
      }
      projects: {
        Row: ProjectsRow
        Insert: ProjectsInsert
        Update: ProjectsUpdate
        Relationships: []
      }
      [key: string]: {
        Row: any
        Insert: any
        Update: any
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
