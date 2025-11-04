import { supabase } from './supabase'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  start_date: string
  end_date: string
  all_day: boolean
  color: string
  user_id: string
  note_id: string | null
  project_id?: string | null
  created_at: string
  updated_at: string
}

export interface CreateCalendarEventData {
  title: string
  description?: string | null
  start_date: string
  end_date: string
  all_day?: boolean
  color?: string
  note_id?: string | null
  project_id?: string | null
}

export interface UpdateCalendarEventData {
  title?: string
  description?: string | null
  start_date?: string
  end_date?: string
  all_day?: boolean
  color?: string
  note_id?: string | null
  project_id?: string | null
}

/**
 * Get all calendar events for the current user
 */
export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .order('start_date', { ascending: true })

  if (error) {
    console.error('Error fetching calendar events:', error)
    throw error
  }

  return data || []
}

/**
 * Get calendar events within a date range
 */
export async function getCalendarEventsByDateRange(
  startDate: string,
  endDate: string
): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .gte('start_date', startDate)
    .lte('end_date', endDate)
    .order('start_date', { ascending: true })

  if (error) {
    console.error('Error fetching calendar events by date range:', error)
    throw error
  }

  return data || []
}

/**
 * Get calendar events by project
 */
export async function getCalendarEventsByProject(
  projectId: string | null
): Promise<CalendarEvent[]> {
  const query = supabase
    .from('calendar_events')
    .select('*')
    .order('start_date', { ascending: true })

  if (projectId === null) {
    query.is('project_id', null)
  } else {
    query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching calendar events by project:', error)
    throw error
  }

  return data || []
}

/**
 * Get a single calendar event by ID
 */
export async function getCalendarEventById(id: string): Promise<CalendarEvent | null> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching calendar event:', error)
    throw error
  }

  return data
}

/**
 * Create a new calendar event
 */
export async function createCalendarEvent(
  eventData: CreateCalendarEventData
): Promise<CalendarEvent> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .insert([
      {
        ...eventData,
        user_id: user.id,
        color: eventData.color || '#3B82F6',
        all_day: eventData.all_day || false,
      },
    ])
    .select()
    .single()

  if (error) {
    console.error('Error creating calendar event:', error)
    throw error
  }

  return data
}

/**
 * Update an existing calendar event
 */
export async function updateCalendarEvent(
  id: string,
  updates: UpdateCalendarEventData
): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating calendar event:', error)
    throw error
  }

  return data
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(id: string): Promise<void> {
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)

  if (error) {
    console.error('Error deleting calendar event:', error)
    throw error
  }
}

/**
 * Subscribe to real-time calendar event updates
 */
export function subscribeToCalendarEvents(
  userId: string,
  callback: (payload: any) => void
) {
  const subscription = supabase
    .channel('calendar_events_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'calendar_events',
        filter: `user_id=eq.${userId}`,
      },
      callback
    )
    .subscribe()

  return () => {
    subscription.unsubscribe()
  }
}
