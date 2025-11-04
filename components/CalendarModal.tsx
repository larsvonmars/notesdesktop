'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { X, Plus, Calendar as CalendarIcon, Clock, Edit2, Trash2, Check, ChevronLeft, ChevronRight, Target, Filter } from 'lucide-react'
import {
  CalendarEvent,
  getCalendarEvents,
  getCalendarEventsByProject,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  subscribeToCalendarEvents,
} from '@/lib/calendar'
import { Project, getProjects } from '@/lib/projects'
import { useAuth } from '@/lib/auth-context'
import DayEventsModal from './DayEventsModal'

interface CalendarModalProps {
  isOpen: boolean
  onClose: () => void
}

interface EventFormData {
  title: string
  description: string
  start_date: string
  start_time: string
  end_date: string
  end_time: string
  all_day: boolean
  color: string
  project_id: string | null
}

const COLOR_OPTIONS = [
  { value: '#3B82F6', label: 'Blue' },
  { value: '#EF4444', label: 'Red' },
  { value: '#10B981', label: 'Green' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#6366F1', label: 'Indigo' },
  { value: '#14B8A6', label: 'Teal' },
]

export default function CalendarModal({ isOpen, onClose }: CalendarModalProps) {
  const { user } = useAuth()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showEventForm, setShowEventForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
  const [calendarViewMode, setCalendarViewMode] = useState<'month' | 'week'>('month')
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null)
  const [showProjectFilter, setShowProjectFilter] = useState(false)
  const [showDayModal, setShowDayModal] = useState(false)
  const [dayModalDate, setDayModalDate] = useState<Date | null>(null)

  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    start_date: '',
    start_time: '09:00',
    end_date: '',
    end_time: '10:00',
    all_day: false,
    color: '#3B82F6',
    project_id: null,
  })

  // Load events
  const loadEvents = useCallback(async () => {
    try {
      setIsLoading(true)
      const fetchedEvents = filterProjectId !== null && filterProjectId !== 'all'
        ? await getCalendarEventsByProject(filterProjectId === 'none' ? null : filterProjectId)
        : await getCalendarEvents()
      setEvents(fetchedEvents)
    } catch (error) {
      console.error('Error loading events:', error)
    } finally {
      setIsLoading(false)
    }
  }, [filterProjectId])

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      const fetchedProjects = await getProjects()
      setProjects(fetchedProjects)
    } catch (error) {
      console.error('Error loading projects:', error)
    }
  }, [])

  useEffect(() => {
    if (isOpen && user) {
      loadEvents()
      loadProjects()
    }
  }, [isOpen, user, loadEvents, loadProjects])

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user || !isOpen) return

    const unsubscribe = subscribeToCalendarEvents(user.id, (payload) => {
      console.log('Real-time calendar event update:', payload)
      loadEvents()
    })

    return unsubscribe
  }, [user, isOpen, loadEvents])

  const handleCreateOrUpdateEvent = async () => {
    if (!formData.title.trim()) return

    try {
      const startDateTime = formData.all_day
        ? `${formData.start_date}T00:00:00Z`
        : `${formData.start_date}T${formData.start_time}:00Z`
      
      const endDateTime = formData.all_day
        ? `${formData.end_date}T23:59:59Z`
        : `${formData.end_date}T${formData.end_time}:00Z`

      const eventData = {
        title: formData.title,
        description: formData.description || null,
        start_date: startDateTime,
        end_date: endDateTime,
        all_day: formData.all_day,
        color: formData.color,
        project_id: formData.project_id,
      }

      if (editingEvent) {
        await updateCalendarEvent(editingEvent.id, eventData)
      } else {
        await createCalendarEvent(eventData)
      }

      await loadEvents()
      resetForm()
    } catch (error) {
      console.error('Error saving event:', error)
      alert('Failed to save event. Please try again.')
    }
  }

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return

    try {
      await deleteCalendarEvent(eventId)
      await loadEvents()
      resetForm()
    } catch (error) {
      console.error('Error deleting event:', error)
      alert('Failed to delete event. Please try again.')
    }
  }

  const handleEditEvent = (event: CalendarEvent) => {
    const startDate = new Date(event.start_date)
    const endDate = new Date(event.end_date)

    setFormData({
      title: event.title,
      description: event.description || '',
      start_date: startDate.toISOString().split('T')[0],
      start_time: startDate.toTimeString().slice(0, 5),
      end_date: endDate.toISOString().split('T')[0],
      end_time: endDate.toTimeString().slice(0, 5),
      all_day: event.all_day,
      color: event.color,
      project_id: event.project_id || null,
    })
    setEditingEvent(event)
    setShowEventForm(true)
  }

  const resetForm = () => {
    const today = new Date().toISOString().split('T')[0]
    setFormData({
      title: '',
      description: '',
      start_date: selectedDate ? selectedDate.toISOString().split('T')[0] : today,
      start_time: '09:00',
      end_date: selectedDate ? selectedDate.toISOString().split('T')[0] : today,
      end_time: '10:00',
      all_day: false,
      color: '#3B82F6',
      project_id: filterProjectId && filterProjectId !== 'all' && filterProjectId !== 'none' ? filterProjectId : null,
    })
    setEditingEvent(null)
    setShowEventForm(false)
  }

  const handleNewEvent = () => {
    resetForm()
    setShowEventForm(true)
  }

  const handleDayClick = (date: Date) => {
    setDayModalDate(date)
    setSelectedDate(date)
    setShowDayModal(true)
  }

  const handleDayModalCreateEvent = () => {
    setShowDayModal(false)
    handleNewEvent()
  }

  const handleDayModalEditEvent = (event: CalendarEvent) => {
    setShowDayModal(false)
    handleEditEvent(event)
  }

  // Calendar grid generation
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days: (Date | null)[] = []

    // Add empty cells for days before the month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day))
    }

    return days
  }

  const getEventsForDate = (date: Date) => {
    return events.filter((event) => {
      const eventStart = new Date(event.start_date)
      const eventEnd = new Date(event.end_date)
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      
      return dateOnly >= new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate()) &&
             dateOnly <= new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate())
    })
  }

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

  const goToToday = () => {
    setCurrentMonth(new Date())
    setCurrentWeek(new Date())
  }

  // Week view helpers
  const getWeekDays = (date: Date) => {
    const days: Date[] = []
    const startOfWeek = new Date(date)
    const dayOfWeek = startOfWeek.getDay()
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek) // Start from Sunday

    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek)
      day.setDate(startOfWeek.getDate() + i)
      days.push(day)
    }

    return days
  }

  const goToPreviousWeek = () => {
    const newWeek = new Date(currentWeek)
    newWeek.setDate(newWeek.getDate() - 7)
    setCurrentWeek(newWeek)
  }

  const goToNextWeek = () => {
    const newWeek = new Date(currentWeek)
    newWeek.setDate(newWeek.getDate() + 7)
    setCurrentWeek(newWeek)
  }

  const getWeekRange = (date: Date) => {
    const weekDays = getWeekDays(date)
    const start = weekDays[0]
    const end = weekDays[6]
    
    if (start.getMonth() === end.getMonth()) {
      return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${end.getDate()}, ${end.getFullYear()}`
    } else if (start.getFullYear() === end.getFullYear()) {
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${end.getFullYear()}`
    } else {
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
  }

  const formatEventTime = (event: CalendarEvent) => {
    if (event.all_day) return 'All day'
    
    const start = new Date(event.start_date)
    const end = new Date(event.end_date)
    
    return `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }

  const upcomingEvents = events
    .filter((event) => new Date(event.start_date) >= new Date())
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
    .slice(0, 5)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <CalendarIcon size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Calendar & Reminders</h2>
              <p className="text-sm text-gray-500">Manage your events and todos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Close"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Main Calendar/List View */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* View Toggle and Controls */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    viewMode === 'calendar'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Calendar
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  List
                </button>

                {/* Project Filter */}
                <div className="relative ml-4">
                  <button
                    onClick={() => setShowProjectFilter(!showProjectFilter)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                      filterProjectId ? 'bg-purple-100 text-purple-700 border border-purple-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Filter size={16} />
                    {filterProjectId === 'all' || !filterProjectId ? 'All Events' : 
                     filterProjectId === 'none' ? 'No Project' :
                     projects.find(p => p.id === filterProjectId)?.name || 'Project'}
                  </button>
                  
                  {showProjectFilter && (
                    <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto">
                      <div className="p-2">
                        <button
                          onClick={() => {
                            setFilterProjectId(null)
                            setShowProjectFilter(false)
                          }}
                          className={`w-full text-left px-3 py-2 rounded hover:bg-gray-100 ${
                            !filterProjectId || filterProjectId === 'all' ? 'bg-gray-100 font-medium' : ''
                          }`}
                        >
                          All Events
                        </button>
                        <button
                          onClick={() => {
                            setFilterProjectId('none')
                            setShowProjectFilter(false)
                          }}
                          className={`w-full text-left px-3 py-2 rounded hover:bg-gray-100 ${
                            filterProjectId === 'none' ? 'bg-gray-100 font-medium' : ''
                          }`}
                        >
                          No Project
                        </button>
                        <div className="border-t border-gray-200 my-2"></div>
                        {projects.map((project) => (
                          <button
                            key={project.id}
                            onClick={() => {
                              setFilterProjectId(project.id)
                              setShowProjectFilter(false)
                            }}
                            className={`w-full text-left px-3 py-2 rounded hover:bg-gray-100 flex items-center gap-2 ${
                              filterProjectId === project.id ? 'bg-gray-100 font-medium' : ''
                            }`}
                          >
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: project.color }}
                            />
                            {project.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={handleNewEvent}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Plus size={16} />
                New Event
              </button>
            </div>

            {/* Calendar View */}
            {viewMode === 'calendar' && (
              <div>
                {/* Navigation and View Toggle */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900">
                    {calendarViewMode === 'month' 
                      ? currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                      : getWeekRange(currentWeek)
                    }
                  </h3>
                  <div className="flex items-center gap-2">
                    {/* Week/Month Toggle */}
                    <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                      <button
                        onClick={() => setCalendarViewMode('month')}
                        className={`px-3 py-1.5 text-sm rounded transition-colors ${
                          calendarViewMode === 'month'
                            ? 'bg-white text-gray-900 shadow-sm font-medium'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Month
                      </button>
                      <button
                        onClick={() => setCalendarViewMode('week')}
                        className={`px-3 py-1.5 text-sm rounded transition-colors ${
                          calendarViewMode === 'week'
                            ? 'bg-white text-gray-900 shadow-sm font-medium'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Week
                      </button>
                    </div>
                    
                    <button
                      onClick={goToToday}
                      className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                    >
                      Today
                    </button>
                    <button
                      onClick={calendarViewMode === 'month' ? goToPreviousMonth : goToPreviousWeek}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                    >
                      <ChevronLeft size={20} className="text-gray-600" />
                    </button>
                    <button
                      onClick={calendarViewMode === 'month' ? goToNextMonth : goToNextWeek}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                    >
                      <ChevronRight size={20} className="text-gray-600" />
                    </button>
                  </div>
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Month View */}
                {calendarViewMode === 'month' && (
                  <div className="grid grid-cols-7 gap-1">
                    {getDaysInMonth(currentMonth).map((day, index) => {
                      const isToday = day && day.toDateString() === new Date().toDateString()
                      const dayEvents = day ? getEventsForDate(day) : []

                      return (
                        <div
                          key={index}
                          className={`min-h-[100px] p-2 border rounded-lg ${
                            day
                              ? 'bg-white hover:bg-gray-50 cursor-pointer'
                              : 'bg-gray-50'
                          } ${isToday ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'}`}
                          onClick={() => {
                            if (day) {
                              handleDayClick(day)
                            }
                          }}
                        >
                          {day && (
                            <>
                              <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                                {day.getDate()}
                              </div>
                              <div className="space-y-1">
                                {dayEvents.slice(0, 2).map((event) => (
                                  <div
                                    key={event.id}
                                    className="text-xs p-1 rounded truncate cursor-pointer hover:opacity-80"
                                    style={{ backgroundColor: `${event.color}20`, color: event.color }}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleEditEvent(event)
                                    }}
                                    title={event.title}
                                  >
                                    {event.title}
                                  </div>
                                ))}
                                {dayEvents.length > 2 && (
                                  <div className="text-xs text-gray-500">
                                    +{dayEvents.length - 2} more
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Week View */}
                {calendarViewMode === 'week' && (
                  <div className="grid grid-cols-7 gap-1">
                    {getWeekDays(currentWeek).map((day, index) => {
                      const isToday = day.toDateString() === new Date().toDateString()
                      const dayEvents = getEventsForDate(day)

                      return (
                        <div
                          key={index}
                          className={`min-h-[400px] p-2 border rounded-lg bg-white hover:bg-gray-50 cursor-pointer ${
                            isToday ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'
                          }`}
                          onClick={() => handleDayClick(day)}
                        >
                          <div className={`text-sm font-medium mb-2 text-center ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                            <div className="text-xs text-gray-500 uppercase mb-0.5">
                              {day.toLocaleDateString('en-US', { weekday: 'short' })}
                            </div>
                            <div className={`text-lg ${isToday ? 'bg-blue-600 text-white w-8 h-8 rounded-full mx-auto flex items-center justify-center' : ''}`}>
                              {day.getDate()}
                            </div>
                          </div>
                          <div className="space-y-1 overflow-y-auto max-h-[340px]">
                            {dayEvents
                              .sort((a, b) => {
                                if (a.all_day && !b.all_day) return -1
                                if (!a.all_day && b.all_day) return 1
                                return new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
                              })
                              .map((event) => (
                                <div
                                  key={event.id}
                                  className="text-xs p-2 rounded cursor-pointer hover:opacity-90 border"
                                  style={{ 
                                    backgroundColor: `${event.color}15`, 
                                    borderColor: event.color,
                                    color: '#1f2937'
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleEditEvent(event)
                                  }}
                                  title={event.title}
                                >
                                  <div className="font-semibold truncate mb-0.5" style={{ color: event.color }}>
                                    {event.title}
                                  </div>
                                  <div className="text-gray-600 flex items-center gap-1">
                                    <Clock size={10} />
                                    {event.all_day ? 'All day' : new Date(event.start_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                  </div>
                                  {event.project_id && (
                                    <div className="text-gray-600 flex items-center gap-1 mt-0.5">
                                      <Target size={10} />
                                      <span className="truncate text-[10px]">
                                        {projects.find(p => p.id === event.project_id)?.name}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            {dayEvents.length === 0 && (
                              <div className="text-xs text-gray-400 text-center py-4">
                                No events
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <div className="space-y-2">
                {isLoading ? (
                  <div className="text-center py-12 text-gray-500">Loading events...</div>
                ) : events.length === 0 ? (
                  <div className="text-center py-12">
                    <CalendarIcon size={48} className="text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No events yet. Create your first event!</p>
                  </div>
                ) : (
                  events.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => handleEditEvent(event)}
                    >
                      <div
                        className="w-1 h-full rounded-full flex-shrink-0"
                        style={{ backgroundColor: event.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 mb-1">{event.title}</h4>
                        {event.description && (
                          <p className="text-sm text-gray-600 mb-2">{event.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <CalendarIcon size={12} />
                            {new Date(event.start_date).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {formatEventTime(event)}
                          </span>
                          {event.project_id && (
                            <span className="flex items-center gap-1">
                              <Target size={12} />
                              <span className="font-medium" style={{ color: projects.find(p => p.id === event.project_id)?.color }}>
                                {projects.find(p => p.id === event.project_id)?.name}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteEvent(event.id)
                        }}
                        className="p-2 hover:bg-red-50 rounded transition-colors"
                        title="Delete event"
                      >
                        <Trash2 size={16} className="text-red-500" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Sidebar - Upcoming Events */}
          <div className="w-80 border-l border-gray-200 bg-gray-50 p-6 overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Events</h3>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-gray-500">No upcoming events</p>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((event) => (
                  <div
                    key={event.id}
                    className="p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow cursor-pointer"
                    onClick={() => handleEditEvent(event)}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: event.color }}
                      />
                      <h4 className="font-medium text-gray-900 text-sm flex-1">{event.title}</h4>
                    </div>
                    <div className="text-xs text-gray-500 space-y-1 ml-5">
                      <div className="flex items-center gap-1">
                        <CalendarIcon size={10} />
                        {new Date(event.start_date).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatEventTime(event)}
                      </div>
                      {event.project_id && (
                        <div className="flex items-center gap-1">
                          <Target size={10} />
                          <span className="font-medium" style={{ color: projects.find(p => p.id === event.project_id)?.color }}>
                            {projects.find(p => p.id === event.project_id)?.name}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Event Form Modal */}
      {showEventForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-lg w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {editingEvent ? 'Edit Event' : 'New Event'}
            </h3>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Event title"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Event description"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {/* All Day Toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="all-day"
                  checked={formData.all_day}
                  onChange={(e) => setFormData({ ...formData, all_day: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="all-day" className="text-sm font-medium text-gray-700">
                  All day event
                </label>
              </div>

              {/* Start Date/Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {!formData.all_day && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* End Date/Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {!formData.all_day && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setFormData({ ...formData, color: color.value })}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        formData.color === color.value
                          ? 'border-gray-900 scale-110'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>

              {/* Project */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project (optional)
                </label>
                <select
                  value={formData.project_id || ''}
                  onChange={(e) => setFormData({ ...formData, project_id: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">No Project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                {formData.project_id && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                    <Target size={14} />
                    <span>
                      Linked to: {projects.find(p => p.id === formData.project_id)?.name}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between mt-6">
              <div>
                {editingEvent && (
                  <button
                    onClick={() => handleDeleteEvent(editingEvent.id)}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateOrUpdateEvent}
                  disabled={!formData.title.trim() || !formData.start_date || !formData.end_date}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingEvent ? 'Save Changes' : 'Create Event'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Day Events Modal */}
      {dayModalDate && (
        <DayEventsModal
          isOpen={showDayModal}
          onClose={() => setShowDayModal(false)}
          date={dayModalDate}
          events={getEventsForDate(dayModalDate)}
          projects={projects}
          onEditEvent={handleDayModalEditEvent}
          onCreateEvent={handleDayModalCreateEvent}
        />
      )}
    </div>
  )
}
