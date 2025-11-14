import { supabase } from './supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarEvent {
  id: string
  user_id: string
  task_id: string | null
  note_id: string | null
  project_id: string | null
  title: string
  description: string | null
  location: string | null
  start_time: string
  end_time: string
  is_all_day: boolean
  timezone: string
  recurrence_pattern_id: string | null
  is_recurring: boolean
  parent_event_id: string | null
  category: string | null
  color: string
  attendees: any | null
  meeting_url: string | null
  meeting_platform: string | null
  is_cancelled: boolean
  created_at: string
  updated_at: string
}

export interface RecurrencePattern {
  id: string
  user_id: string
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
  interval: number
  days_of_week: number[] | null
  day_of_month: number | null
  month_of_year: number | null
  end_date: string | null
  occurrence_count: number | null
  timezone: string
  created_at: string
}

export interface Reminder {
  id: string
  user_id: string
  task_id: string | null
  event_id: string | null
  remind_at: string
  notification_type: 'app' | 'email' | 'both'
  is_sent: boolean
  sent_at: string | null
  message: string | null
  created_at: string
}

export interface TimeEntry {
  id: string
  user_id: string
  task_id: string | null
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  notes: string | null
  created_at: string
}

// ============================================================================
// CALENDAR EVENTS
// ============================================================================

export async function getEvents(filters?: {
  startDate?: Date
  endDate?: Date
  taskId?: string
  projectId?: string
  noteId?: string
  category?: string
  includeRecurring?: boolean
}): Promise<CalendarEvent[]> {
  let query = supabase
    .from('calendar_events')
    .select('*')
    .eq('is_cancelled', false)
    .order('start_time', { ascending: true })

  if (filters?.startDate) {
    query = query.gte('start_time', filters.startDate.toISOString())
  }

  if (filters?.endDate) {
    query = query.lte('start_time', filters.endDate.toISOString())
  }

  if (filters?.taskId) {
    query = query.eq('task_id', filters.taskId)
  }

  if (filters?.projectId) {
    query = query.eq('project_id', filters.projectId)
  }

  if (filters?.noteId) {
    query = query.eq('note_id', filters.noteId)
  }

  if (filters?.category) {
    query = query.eq('category', filters.category)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

export async function getEvent(id: string): Promise<CalendarEvent | null> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createEvent(
  title: string,
  startTime: Date,
  endTime: Date,
  options?: {
    description?: string
    location?: string
    taskId?: string
    noteId?: string
    projectId?: string
    isAllDay?: boolean
    category?: string
    color?: string
    attendees?: any
    meetingUrl?: string
    meetingPlatform?: string
  }
): Promise<CalendarEvent> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      user_id: user.id,
      title,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      description: options?.description || null,
      location: options?.location || null,
      task_id: options?.taskId || null,
      note_id: options?.noteId || null,
      project_id: options?.projectId || null,
      is_all_day: options?.isAllDay || false,
      category: options?.category || null,
      color: options?.color || '#3B82F6',
      attendees: options?.attendees || null,
      meeting_url: options?.meetingUrl || null,
      meeting_platform: options?.meetingPlatform || null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateEvent(
  id: string,
  updates: Partial<Omit<CalendarEvent, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function cancelEvent(id: string): Promise<CalendarEvent> {
  return updateEvent(id, { is_cancelled: true })
}

// ============================================================================
// RECURRENCE PATTERNS
// ============================================================================

export async function createRecurrencePattern(
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom',
  options?: {
    interval?: number
    daysOfWeek?: number[]
    dayOfMonth?: number
    monthOfYear?: number
    endDate?: Date
    occurrenceCount?: number
    timezone?: string
  }
): Promise<RecurrencePattern> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('recurrence_patterns')
    .insert({
      user_id: user.id,
      frequency,
      interval: options?.interval || 1,
      days_of_week: options?.daysOfWeek || null,
      day_of_month: options?.dayOfMonth || null,
      month_of_year: options?.monthOfYear || null,
      end_date: options?.endDate?.toISOString() || null,
      occurrence_count: options?.occurrenceCount || null,
      timezone: options?.timezone || 'UTC',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteRecurrencePattern(id: string): Promise<void> {
  const { error } = await supabase
    .from('recurrence_patterns')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ============================================================================
// REMINDERS
// ============================================================================

export async function getReminders(filters?: {
  taskId?: string
  eventId?: string
  includeSent?: boolean
}): Promise<Reminder[]> {
  let query = supabase
    .from('reminders')
    .select('*')
    .order('remind_at', { ascending: true })

  if (filters?.taskId) {
    query = query.eq('task_id', filters.taskId)
  }

  if (filters?.eventId) {
    query = query.eq('event_id', filters.eventId)
  }

  if (!filters?.includeSent) {
    query = query.eq('is_sent', false)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

export async function createReminder(
  remindAt: Date,
  options: {
    taskId?: string
    eventId?: string
    notificationType?: 'app' | 'email' | 'both'
    message?: string
  }
): Promise<Reminder> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (!options.taskId && !options.eventId) {
    throw new Error('Either taskId or eventId must be provided')
  }

  const { data, error } = await supabase
    .from('reminders')
    .insert({
      user_id: user.id,
      task_id: options.taskId || null,
      event_id: options.eventId || null,
      remind_at: remindAt.toISOString(),
      notification_type: options.notificationType || 'app',
      message: options.message || null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await supabase
    .from('reminders')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function markReminderAsSent(id: string): Promise<Reminder> {
  const { data, error } = await supabase
    .from('reminders')
    .update({
      is_sent: true,
      sent_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// TIME TRACKING
// ============================================================================

export async function getTimeEntries(filters?: {
  taskId?: string
  startDate?: Date
  endDate?: Date
}): Promise<TimeEntry[]> {
  let query = supabase
    .from('time_entries')
    .select('*')
    .order('started_at', { ascending: false })

  if (filters?.taskId) {
    query = query.eq('task_id', filters.taskId)
  }

  if (filters?.startDate) {
    query = query.gte('started_at', filters.startDate.toISOString())
  }

  if (filters?.endDate) {
    query = query.lte('started_at', filters.endDate.toISOString())
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

export async function startTimeTracking(taskId: string, notes?: string): Promise<TimeEntry> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Check if there's already an active time entry
  const { data: activeEntries } = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', user.id)
    .is('ended_at', null)
    .limit(1)

  if (activeEntries && activeEntries.length > 0) {
    throw new Error('You already have an active time entry. Please stop it first.')
  }

  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      user_id: user.id,
      task_id: taskId,
      started_at: new Date().toISOString(),
      notes,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function stopTimeTracking(id: string): Promise<TimeEntry> {
  const { data: entry, error: fetchError } = await supabase
    .from('time_entries')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError) throw fetchError

  const endedAt = new Date()
  const startedAt = new Date(entry.started_at)
  const durationMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)

  const { data, error } = await supabase
    .from('time_entries')
    .update({
      ended_at: endedAt.toISOString(),
      duration_minutes: durationMinutes,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getActiveTimeEntry(): Promise<TimeEntry | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from('time_entries')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  
  if (hours === 0) {
    return `${mins}m`
  } else if (mins === 0) {
    return `${hours}h`
  } else {
    return `${hours}h ${mins}m`
  }
}

export function getEventDuration(event: CalendarEvent): number {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  return Math.round((end.getTime() - start.getTime()) / 60000)
}
