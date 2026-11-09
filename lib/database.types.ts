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

export type LearnDeckRow = {
  id: string
  user_id: string
  title: string
  description: string | null
  color: string
  created_at: string
  updated_at: string
}

export type LearnCardRow = {
  id: string
  deck_id: string
  user_id: string
  front: string
  back: string
  mastered: boolean
  created_at: string
  due_date: string | null
  ease_factor: number | null
  interval_days: number | null
  correct_count: number | null
  incorrect_count: number | null
}

export type LearnUserStatsRow = {
  id: string
  xp: number
  level: number
  streak: number
  last_studied_at: string | null
  total_cards_reviewed: number
  updated_at: string
  daily_goal: number
  streak_reminder_enabled: boolean
  total_sessions: number
  total_correct: number
}

export type LearnStudySessionRow = {
  id: string
  user_id: string
  deck_id: string | null
  cards_reviewed: number
  xp_earned: number
  completed_at: string
  mode: string | null
  correct_count: number
}

export type LearnUserBadgeRow = {
  id: string
  user_id: string
  badge_id: string
  earned_at: string
}

export type LearnProfileRow = {
  id: string
  username: string | null
  created_at: string
}

export type LearnDocumentRow = {
  id: string
  user_id: string
  filename: string
  file_path: string
  file_size: number
  status: string
  deck_id: string | null
  created_at: string
}

export type LearnDeckWithCountsRow = {
  id: string
  user_id: string
  title: string
  description: string | null
  color: string
  created_at: string
  updated_at: string
  card_count: number
  mastered_count: number
  last_studied: string | null
}

type InsertOf<Row, RequiredKeys extends keyof Row> = Partial<Row> & Pick<Row, RequiredKeys>
type UpdateOf<Row> = Partial<Row>

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
      learn_decks: {
        Row: LearnDeckRow
        Insert: InsertOf<LearnDeckRow, 'user_id' | 'title'>
        Update: UpdateOf<LearnDeckRow>
        Relationships: []
      }
      learn_cards: {
        Row: LearnCardRow
        Insert: InsertOf<LearnCardRow, 'deck_id' | 'user_id' | 'front' | 'back'>
        Update: UpdateOf<LearnCardRow>
        Relationships: []
      }
      learn_user_stats: {
        Row: LearnUserStatsRow
        Insert: InsertOf<LearnUserStatsRow, 'id'>
        Update: UpdateOf<LearnUserStatsRow>
        Relationships: []
      }
      learn_study_sessions: {
        Row: LearnStudySessionRow
        Insert: InsertOf<LearnStudySessionRow, 'user_id' | 'deck_id' | 'cards_reviewed'>
        Update: UpdateOf<LearnStudySessionRow>
        Relationships: []
      }
      learn_user_badges: {
        Row: LearnUserBadgeRow
        Insert: InsertOf<LearnUserBadgeRow, 'user_id' | 'badge_id'>
        Update: UpdateOf<LearnUserBadgeRow>
        Relationships: []
      }
      learn_profiles: {
        Row: LearnProfileRow
        Insert: InsertOf<LearnProfileRow, 'id'>
        Update: UpdateOf<LearnProfileRow>
        Relationships: []
      }
      learn_documents: {
        Row: LearnDocumentRow
        Insert: InsertOf<LearnDocumentRow, 'user_id' | 'filename' | 'file_path' | 'file_size'>
        Update: UpdateOf<LearnDocumentRow>
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
    Functions: {
      get_decks_with_counts: {
        Args: { user_id_param: string }
        Returns: LearnDeckWithCountsRow[]
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
