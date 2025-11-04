'use client'

import { X, Plus, Calendar as CalendarIcon, Clock, Edit2, Target } from 'lucide-react'
import { CalendarEvent } from '@/lib/calendar'
import { Project } from '@/lib/projects'

interface DayEventsModalProps {
  isOpen: boolean
  onClose: () => void
  date: Date
  events: CalendarEvent[]
  projects: Project[]
  onEditEvent: (event: CalendarEvent) => void
  onCreateEvent: () => void
}

export default function DayEventsModal({
  isOpen,
  onClose,
  date,
  events,
  projects,
  onEditEvent,
  onCreateEvent,
}: DayEventsModalProps) {
  if (!isOpen) return null

  const formatEventTime = (event: CalendarEvent) => {
    if (event.all_day) return 'All day'
    
    const start = new Date(event.start_date)
    const end = new Date(event.end_date)
    
    return `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  }

  const isToday = date.toDateString() === new Date().toDateString()
  const dateString = date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isToday ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
              <CalendarIcon size={20} className={isToday ? 'text-blue-600' : 'text-gray-600'} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{dateString}</h2>
              {isToday && (
                <p className="text-sm text-blue-600 font-medium">Today</p>
              )}
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

        {/* Events List */}
        <div className="flex-1 overflow-y-auto p-6">
          {events.length === 0 ? (
            <div className="text-center py-12">
              <CalendarIcon size={48} className="text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">No events scheduled for this day</p>
              <button
                onClick={onCreateEvent}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Plus size={16} />
                Create Event
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {events
                .sort((a, b) => {
                  // Sort all-day events first, then by start time
                  if (a.all_day && !b.all_day) return -1
                  if (!a.all_day && b.all_day) return 1
                  return new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
                })
                .map((event) => (
                  <div
                    key={event.id}
                    className="group p-4 border border-gray-200 rounded-lg hover:shadow-md hover:border-gray-300 cursor-pointer transition-all"
                    onClick={() => onEditEvent(event)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-1 h-full rounded-full flex-shrink-0 self-stretch"
                        style={{ backgroundColor: event.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold text-gray-900 text-lg group-hover:text-blue-600 transition-colors">
                            {event.title}
                          </h3>
                          <Edit2 size={16} className="text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0 ml-2" />
                        </div>
                        
                        {event.description && (
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">{event.description}</p>
                        )}
                        
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                          <span className="flex items-center gap-1.5">
                            <Clock size={14} />
                            {formatEventTime(event)}
                          </span>
                          
                          {event.project_id && (
                            <span className="flex items-center gap-1.5">
                              <Target size={14} />
                              <span 
                                className="font-medium"
                                style={{ color: projects.find(p => p.id === event.project_id)?.color }}
                              >
                                {projects.find(p => p.id === event.project_id)?.name}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {events.length > 0 && (
          <div className="border-t border-gray-200 p-4 bg-gray-50">
            <button
              onClick={onCreateEvent}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Plus size={16} />
              Add Event for This Day
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
