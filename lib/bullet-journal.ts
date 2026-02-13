import { supabase } from './supabase'

// ============================================================================
// TYPES
// ============================================================================

export type BulletSignifier =
  | 'task'
  | 'event'
  | 'note'
  | 'completed'
  | 'migrated'
  | 'scheduled'
  | 'irrelevant'

export interface BulletJournalEntry {
  id: string
  user_id: string
  note_id: string
  signifier: BulletSignifier
  content: string
  indent_level: number
  sort_order: number
  entry_date: string | null
  migrated_to: string | null
  migrated_from: string | null
  linked_task_id: string | null
  is_starred: boolean
  is_priority: boolean
  is_inspiration: boolean
  created_at: string
  updated_at: string
}

export interface CreateBulletEntryInput {
  note_id: string
  signifier?: BulletSignifier
  content: string
  indent_level?: number
  sort_order?: number
  entry_date?: string | null
  linked_task_id?: string | null
  is_starred?: boolean
  is_priority?: boolean
  is_inspiration?: boolean
}

export interface UpdateBulletEntryInput {
  signifier?: BulletSignifier
  content?: string
  indent_level?: number
  sort_order?: number
  entry_date?: string | null
  linked_task_id?: string | null
  is_starred?: boolean
  is_priority?: boolean
  is_inspiration?: boolean
  migrated_to?: string | null
  migrated_from?: string | null
}

// ============================================================================
// SIGNIFIER DISPLAY HELPERS
// ============================================================================

export const SIGNIFIER_SYMBOLS: Record<BulletSignifier, string> = {
  task: '•',
  event: '○',
  note: '–',
  completed: '×',
  migrated: '>',
  scheduled: '<',
  irrelevant: '—',
}

export const SIGNIFIER_LABELS: Record<BulletSignifier, string> = {
  task: 'Task',
  event: 'Event',
  note: 'Note',
  completed: 'Completed',
  migrated: 'Migrated',
  scheduled: 'Scheduled',
  irrelevant: 'Irrelevant',
}

/** Cycle order when pressing a shortcut on a bullet */
const SIGNIFIER_CYCLE: BulletSignifier[] = [
  'task',
  'event',
  'note',
  'completed',
  'migrated',
  'scheduled',
  'irrelevant',
]

export function nextSignifier(current: BulletSignifier): BulletSignifier {
  const idx = SIGNIFIER_CYCLE.indexOf(current)
  return SIGNIFIER_CYCLE[(idx + 1) % SIGNIFIER_CYCLE.length]
}

/** Task-specific cycle: task → completed → migrated → scheduled → task */
export function cycleTaskSignifier(current: BulletSignifier): BulletSignifier {
  const taskCycle: BulletSignifier[] = ['task', 'completed', 'migrated', 'scheduled']
  const idx = taskCycle.indexOf(current)
  if (idx === -1) return current // not a task-type signifier
  return taskCycle[(idx + 1) % taskCycle.length]
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

export async function getEntriesForNote(noteId: string): Promise<BulletJournalEntry[]> {
  const { data, error } = await supabase
    .from('bullet_journal_entries')
    .select('*')
    .eq('note_id', noteId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data || []
}

export async function getEntriesByDate(
  noteId: string,
  date: string
): Promise<BulletJournalEntry[]> {
  const { data, error } = await supabase
    .from('bullet_journal_entries')
    .select('*')
    .eq('note_id', noteId)
    .eq('entry_date', date)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data || []
}

export async function getEntriesByDateRange(
  noteId: string,
  startDate: string,
  endDate: string
): Promise<BulletJournalEntry[]> {
  const { data, error } = await supabase
    .from('bullet_journal_entries')
    .select('*')
    .eq('note_id', noteId)
    .gte('entry_date', startDate)
    .lte('entry_date', endDate)
    .order('entry_date', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createEntry(
  input: CreateBulletEntryInput
): Promise<BulletJournalEntry> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('bullet_journal_entries')
    .insert({
      user_id: user.id,
      note_id: input.note_id,
      signifier: input.signifier || 'task',
      content: input.content,
      indent_level: input.indent_level || 0,
      sort_order: input.sort_order ?? 0,
      entry_date: input.entry_date ?? null,
      linked_task_id: input.linked_task_id ?? null,
      is_starred: input.is_starred ?? false,
      is_priority: input.is_priority ?? false,
      is_inspiration: input.is_inspiration ?? false,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateEntry(
  id: string,
  input: UpdateBulletEntryInput
): Promise<BulletJournalEntry> {
  const { data, error } = await supabase
    .from('bullet_journal_entries')
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from('bullet_journal_entries')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function bulkUpdateSortOrder(
  entries: { id: string; sort_order: number }[]
): Promise<void> {
  // Update each entry's sort_order — Supabase doesn't support bulk upsert
  // on partial columns easily, so we do individual updates
  const promises = entries.map(({ id, sort_order }) =>
    supabase
      .from('bullet_journal_entries')
      .update({ sort_order })
      .eq('id', id)
  )
  const results = await Promise.all(promises)
  const err = results.find((r) => r.error)
  if (err?.error) throw err.error
}

export async function migrateEntry(
  entryId: string,
  targetNoteId: string,
  targetDate: string | null,
  targetSortOrder: number
): Promise<BulletJournalEntry> {
  // 1. Mark the original as migrated
  await updateEntry(entryId, { signifier: 'migrated' })

  // 2. Fetch the original to clone its content
  const { data: original, error: fetchErr } = await supabase
    .from('bullet_journal_entries')
    .select('*')
    .eq('id', entryId)
    .single()

  if (fetchErr || !original) throw fetchErr || new Error('Entry not found')

  // 3. Create new entry in the target spread
  const newEntry = await createEntry({
    note_id: targetNoteId,
    signifier: 'task',
    content: original.content,
    indent_level: original.indent_level,
    sort_order: targetSortOrder,
    entry_date: targetDate,
    linked_task_id: original.linked_task_id,
    is_starred: original.is_starred,
    is_priority: original.is_priority,
    is_inspiration: original.is_inspiration,
  })

  // 4. Link original → new and new → original
  await updateEntry(entryId, { migrated_to: newEntry.id })
  await updateEntry(newEntry.id, { migrated_from: entryId })

  return newEntry
}

/**
 * Get a summary count of entries by signifier for a given note.
 * Useful for monthly logs / overview.
 */
export async function getEntrySummary(noteId: string) {
  const entries = await getEntriesForNote(noteId)
  const summary: Record<BulletSignifier, number> = {
    task: 0,
    event: 0,
    note: 0,
    completed: 0,
    migrated: 0,
    scheduled: 0,
    irrelevant: 0,
  }
  for (const e of entries) {
    summary[e.signifier]++
  }
  return {
    total: entries.length,
    bySignifier: summary,
    starred: entries.filter((e) => e.is_starred).length,
    priority: entries.filter((e) => e.is_priority).length,
  }
}
