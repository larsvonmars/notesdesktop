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

// ============================================================================
// TIMETABLE (Weekly Recurring Schedule)
// ============================================================================

export interface TimetableEntry extends CalendarEvent {
  recurrence_pattern?: RecurrencePattern
}

/**
 * Get all timetable entries (parent events with category='timetable')
 */
export async function getTimetableEntries(): Promise<TimetableEntry[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*, recurrence_patterns(*)')
    .eq('category', 'timetable')
    .eq('is_recurring', true)
    .is('parent_event_id', null)
    .eq('is_cancelled', false)
    .order('start_time', { ascending: true })

  if (error) throw error

  return (data || []).map((row: any) => ({
    ...row,
    recurrence_pattern: row.recurrence_patterns || undefined,
  }))
}

/**
 * Create a new timetable entry with a weekly recurrence pattern
 */
export async function createTimetableEntry(
  title: string,
  startTime: string, // HH:MM format
  endTime: string,   // HH:MM format
  daysOfWeek: number[], // 0=Sunday, 1=Monday, etc.
  options?: {
    description?: string
    location?: string
    projectId?: string
    color?: string
  }
): Promise<TimetableEntry> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Create recurrence pattern first
  const pattern = await createRecurrencePattern('weekly', {
    interval: 1,
    daysOfWeek,
  })

  // Create a reference date using the first day of the week
  // Use today's date as base, adjust to first matching day
  const now = new Date()
  const today = now.getDay()
  const firstDay = daysOfWeek.sort((a, b) => a - b)[0]
  const daysUntilFirst = (firstDay - today + 7) % 7
  const refDate = new Date(now)
  refDate.setDate(refDate.getDate() + daysUntilFirst)

  const [startH, startM] = startTime.split(':').map(Number)
  const [endH, endM] = endTime.split(':').map(Number)

  const start = new Date(refDate)
  start.setHours(startH, startM, 0, 0)

  const end = new Date(refDate)
  end.setHours(endH, endM, 0, 0)

  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      user_id: user.id,
      title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      description: options?.description || null,
      location: options?.location || null,
      project_id: options?.projectId || null,
      is_all_day: false,
      category: 'timetable',
      color: options?.color || '#8B5CF6',
      is_recurring: true,
      recurrence_pattern_id: pattern.id,
    })
    .select()
    .single()

  if (error) throw error

  return { ...data, recurrence_pattern: pattern }
}

/**
 * Update a timetable entry and its recurrence pattern
 */
export async function updateTimetableEntry(
  id: string,
  updates: {
    title?: string
    startTime?: string // HH:MM
    endTime?: string   // HH:MM
    daysOfWeek?: number[]
    description?: string
    location?: string
    projectId?: string | null
    color?: string
  }
): Promise<TimetableEntry> {
  const existing = await getEvent(id)
  if (!existing) throw new Error('Timetable entry not found')

  // Update recurrence pattern if days changed
  if (updates.daysOfWeek && existing.recurrence_pattern_id) {
    await supabase
      .from('recurrence_patterns')
      .update({ days_of_week: updates.daysOfWeek })
      .eq('id', existing.recurrence_pattern_id)
  }

  // Build event updates
  const eventUpdates: any = {}
  if (updates.title !== undefined) eventUpdates.title = updates.title
  if (updates.description !== undefined) eventUpdates.description = updates.description
  if (updates.location !== undefined) eventUpdates.location = updates.location
  if (updates.projectId !== undefined) eventUpdates.project_id = updates.projectId
  if (updates.color !== undefined) eventUpdates.color = updates.color

  if (updates.startTime || updates.endTime) {
    const refDate = new Date(existing.start_time)
    if (updates.startTime) {
      const [h, m] = updates.startTime.split(':').map(Number)
      const newStart = new Date(refDate)
      newStart.setHours(h, m, 0, 0)
      eventUpdates.start_time = newStart.toISOString()
    }
    if (updates.endTime) {
      const [h, m] = updates.endTime.split(':').map(Number)
      const newEnd = new Date(refDate)
      newEnd.setHours(h, m, 0, 0)
      eventUpdates.end_time = newEnd.toISOString()
    }
  }

  const updated = await updateEvent(id, eventUpdates)

  // Fetch updated recurrence pattern
  let recurrence_pattern: RecurrencePattern | undefined
  if (updated.recurrence_pattern_id) {
    const { data } = await supabase
      .from('recurrence_patterns')
      .select('*')
      .eq('id', updated.recurrence_pattern_id)
      .single()
    recurrence_pattern = data || undefined
  }

  return { ...updated, recurrence_pattern }
}

/**
 * Delete a timetable entry and its recurrence pattern
 */
export async function deleteTimetableEntry(id: string): Promise<void> {
  const existing = await getEvent(id)
  if (!existing) throw new Error('Timetable entry not found')

  // Delete event first (cascade will handle children)
  await deleteEvent(id)

  // Delete recurrence pattern
  if (existing.recurrence_pattern_id) {
    await deleteRecurrencePattern(existing.recurrence_pattern_id)
  }
}

/**
 * Generate virtual timetable instances for a given date range.
 * These are not stored in the database - they are computed on-demand
 * from the parent timetable entries and their recurrence patterns.
 */
export function generateTimetableInstances(
  entries: TimetableEntry[],
  rangeStart: Date,
  rangeEnd: Date
): (CalendarEvent & { parentEntryId: string })[] {
  const instances: (CalendarEvent & { parentEntryId: string })[] = []

  for (const entry of entries) {
    const pattern = entry.recurrence_pattern
    if (!pattern || !pattern.days_of_week) continue

    // Extract time from parent event
    const parentStart = new Date(entry.start_time)
    const parentEnd = new Date(entry.end_time)
    const startHours = parentStart.getHours()
    const startMinutes = parentStart.getMinutes()
    const endHours = parentEnd.getHours()
    const endMinutes = parentEnd.getMinutes()

    // Iterate through each day in the range
    const current = new Date(rangeStart)
    current.setHours(0, 0, 0, 0)
    const end = new Date(rangeEnd)
    end.setHours(23, 59, 59, 999)

    while (current <= end) {
      const dayOfWeek = current.getDay()

      if (pattern.days_of_week.includes(dayOfWeek)) {
        // Check pattern end date
        if (pattern.end_date && current > new Date(pattern.end_date)) {
          break
        }

        const instanceStart = new Date(current)
        instanceStart.setHours(startHours, startMinutes, 0, 0)

        const instanceEnd = new Date(current)
        instanceEnd.setHours(endHours, endMinutes, 0, 0)

        instances.push({
          ...entry,
          id: `${entry.id}_${current.toISOString().split('T')[0]}`,
          start_time: instanceStart.toISOString(),
          end_time: instanceEnd.toISOString(),
          parent_event_id: entry.id,
          parentEntryId: entry.id,
        })
      }

      current.setDate(current.getDate() + 1)
    }
  }

  // Sort by start time
  instances.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  return instances
}

/**
 * Get the next N upcoming timetable instances from now
 */
export async function getUpcomingTimetableEntries(limit: number = 5): Promise<(CalendarEvent & { parentEntryId: string })[]> {
  const entries = await getTimetableEntries()
  if (entries.length === 0) return []

  const now = new Date()
  // Look ahead 4 weeks to find enough instances
  const futureEnd = new Date(now)
  futureEnd.setDate(futureEnd.getDate() + 28)

  const instances = generateTimetableInstances(entries, now, futureEnd)

  // Filter to only future instances (start_time > now)
  const upcoming = instances.filter(inst => new Date(inst.start_time) > now)

  return upcoming.slice(0, limit)
}

/**
 * Get timetable instances for a specific week (Mon-Sun)
 */
export function getTimetableInstancesForWeek(
  entries: TimetableEntry[],
  weekStart: Date
): (CalendarEvent & { parentEntryId: string })[] {
  const start = new Date(weekStart)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return generateTimetableInstances(entries, start, end)
}

/**
 * Helper: extract HH:MM time string from a Date or ISO string
 */
export function extractTime(dateOrIso: Date | string): string {
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

/**
 * Helper: get the Monday of a given week
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  // Adjust to Monday (day 1). If Sunday (day 0), go back 6 days
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Helper: day of week labels (Monday-first)
 */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKDAY_FULL_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * Convert Monday-first index (0=Mon) to JS day (0=Sun)
 */
export function mondayIndexToJsDay(index: number): number {
  return index === 6 ? 0 : index + 1
}

/**
 * Convert JS day (0=Sun) to Monday-first index (0=Mon)
 */
export function jsDayToMondayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1
}
