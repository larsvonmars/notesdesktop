# Task & Calendar Management System

## Overview

A comprehensive task management and calendar system with sophisticated features including:

- ✅ **Task Management**: Create, organize, and track tasks with priorities, due dates, and statuses
- 📅 **Calendar Integration**: Schedule events with reminders and recurring patterns
- ⏱️ **Time Tracking**: Track time spent on tasks
- 📊 **Progress Tracking**: Subtasks and completion percentages
- 🏷️ **Tags & Lists**: Organize tasks with custom tags and task lists
- 🔔 **Reminders**: Set up notifications for tasks and events
- 🔄 **Recurring Tasks/Events**: Support for daily, weekly, monthly, and custom patterns
- 📈 **Statistics & Insights**: View task completion stats and productivity metrics

## Database Schema

### Tables Created

1. **task_lists** - Organize tasks into lists/projects
2. **tasks** - Main task entries with full metadata
3. **subtasks** - Break down tasks into smaller steps
4. **calendar_events** - Calendar events with time slots
5. **recurrence_patterns** - Define recurring schedules
6. **tags** - Custom tags for organization
7. **task_tags** & **event_tags** - Many-to-many relationships
8. **reminders** - Notification system
9. **time_entries** - Time tracking for tasks

### Setup Instructions

1. **Run the SQL Schema**:
   - Open Supabase Dashboard → SQL Editor
   - Copy contents from `TASK_CALENDAR_SCHEMA.sql`
   - Execute the query
   - Verify all tables are created in Table Editor

2. **Verify Security**:
   - All tables have Row Level Security (RLS) enabled
   - Users can only access their own data
   - Proper foreign key constraints ensure data integrity

## Components

### TaskCalendarModal

Sophisticated modal with three view modes:

#### Features

**Tasks View**:
- Filterable task list (all, today, week, overdue, starred, completed)
- Priority indicators (low, medium, high, urgent)
- Quick actions: complete, star, start timer, delete
- Task lists sidebar for organization
- Active timer indicator
- Create tasks with full metadata

**Calendar View**:
- Month view with day cells
- Shows events and tasks on specific dates
- Navigation between months
- "Today" quick button
- Visual indicators for events and tasks

**Timeline View**:
- Chronological list of upcoming events
- Shows event times, locations, and meeting links
- Quick access to meeting URLs
- Event details display

#### Usage

```tsx
import TaskCalendarModal from '@/components/TaskCalendarModal'

<TaskCalendarModal
  isOpen={showTaskCalendar}
  onClose={() => setShowTaskCalendar(false)}
  initialView="tasks" // or 'calendar', 'timeline'
  linkedNoteId={currentNote?.id}
  linkedProjectId={currentNote?.project_id}
/>
```

### UnifiedPanel Enhancement

Added a new "Tasks" tab with:

**Quick Add**:
- Fast task creation input
- Automatically links to current note/project
- Enter key to submit

**Task Stats**:
- Visual stats dashboard
- Shows todo, in progress, completed counts
- Highlights overdue tasks

**Recent Tasks List**:
- Shows up to 10 recent tasks
- Toggle completion status
- Star/unstar tasks
- Priority and due date indicators
- Link to full task calendar

**Integration**:
```tsx
<UnifiedPanel
  // ... existing props
  onOpenTaskCalendar={() => setShowTaskCalendar(true)}
/>
```

## API Functions

### Tasks (`lib/tasks.ts`)

```typescript
// Task Lists
getTaskLists() // Get all task lists
createTaskList(name, options?) // Create new list
updateTaskList(id, updates) // Update list
deleteTaskList(id) // Delete list

// Tasks
getTasks(filters?) // Get tasks with optional filters
getTaskWithDetails(id) // Get task with full details
createTask(title, options?) // Create new task
updateTask(id, updates) // Update task
deleteTask(id) // Delete task
completeTask(id) // Mark as complete
uncompleteTask(id) // Mark as incomplete
toggleTaskStar(id, isStarred) // Star/unstar
archiveTask(id) // Archive task

// Subtasks
getSubtasks(parentTaskId) // Get task's subtasks
createSubtask(parentTaskId, title) // Create subtask
toggleSubtask(id, isCompleted) // Toggle completion
deleteSubtask(id) // Delete subtask

// Tags
getTags() // Get all tags
createTag(name, color?) // Create tag
addTagToTask(taskId, tagId) // Add tag to task
removeTagFromTask(taskId, tagId) // Remove tag

// Statistics
getTaskStats() // Get comprehensive stats
```

### Calendar Events (`lib/events.ts`)

```typescript
// Events
getEvents(filters?) // Get events with filters
getEvent(id) // Get single event
createEvent(title, startTime, endTime, options?) // Create event
updateEvent(id, updates) // Update event
deleteEvent(id) // Delete event
cancelEvent(id) // Cancel event

// Recurrence
createRecurrencePattern(frequency, options?) // Create pattern
deleteRecurrencePattern(id) // Delete pattern

// Reminders
getReminders(filters?) // Get reminders
createReminder(remindAt, options) // Create reminder
deleteReminder(id) // Delete reminder
markReminderAsSent(id) // Mark as sent

// Time Tracking
getTimeEntries(filters?) // Get time entries
startTimeTracking(taskId, notes?) // Start timer
stopTimeTracking(id) // Stop timer
getActiveTimeEntry() // Get active timer
deleteTimeEntry(id) // Delete entry

// Utilities
formatDuration(minutes) // Format duration string
getEventDuration(event) // Calculate event duration
```

## Features in Detail

### Task Management

**Priority Levels**:
- Low (gray)
- Medium (blue)
- High (orange)
- Urgent (red)

**Status Options**:
- To Do
- In Progress
- Waiting
- Completed
- Cancelled

**Filters Available**:
- All tasks
- Due today
- Due this week
- Overdue
- Starred
- Completed

### Time Tracking

- Start/stop timers for tasks
- Automatic duration calculation
- Manual time entry support
- Track time per task
- View time entries history
- Only one active timer at a time

### Task Lists

- Create custom lists/categories
- Color coding for visual organization
- Icons for personalization
- Set default list
- Sort order customization

### Tags

- Create reusable tags
- Custom colors
- Apply multiple tags per task
- Filter by tags

### Subtasks

- Break down complex tasks
- Track completion percentage
- Independent completion status
- Reorderable

### Calendar Events

**Event Types**:
- Meetings
- Deadlines
- Personal events
- Custom categories

**Event Features**:
- Start and end times
- All-day event support
- Location tracking
- Meeting URLs (Zoom, Meet, Teams, etc.)
- Attendee management
- Recurring events

### Recurring Patterns

**Frequencies Supported**:
- Daily
- Weekly (specific days)
- Monthly (specific day of month)
- Yearly (specific month and day)
- Custom intervals

**End Conditions**:
- Specific end date
- After X occurrences
- Never (ongoing)

### Reminders

**Notification Types**:
- In-app notifications
- Email notifications
- Both

**Reminder Options**:
- Custom reminder time
- Attach to tasks or events
- Custom message
- Track sent status

## Integration Examples

### Adding Task Calendar to Dashboard

```tsx
'use client'

import { useState } from 'react'
import TaskCalendarModal from '@/components/TaskCalendarModal'
import UnifiedPanel from '@/components/UnifiedPanel'

export default function Dashboard() {
  const [showTaskCalendar, setShowTaskCalendar] = useState(false)
  
  return (
    <>
      {/* Your existing dashboard content */}
      
      <UnifiedPanel
        // ... existing props
        onOpenTaskCalendar={() => setShowTaskCalendar(true)}
      />
      
      <TaskCalendarModal
        isOpen={showTaskCalendar}
        onClose={() => setShowTaskCalendar(false)}
      />
    </>
  )
}
```

### Creating a Task from Code

```tsx
import { createTask } from '@/lib/tasks'

async function handleCreateTask() {
  const task = await createTask('Review documentation', {
    description: 'Go through all the API docs',
    priority: 'high',
    dueDate: new Date('2025-11-20'),
    estimatedMinutes: 60,
    noteId: currentNoteId,
  })
  
  console.log('Created task:', task)
}
```

### Creating an Event

```tsx
import { createEvent } from '@/lib/events'

async function scheduleEvent() {
  const event = await createEvent(
    'Team Meeting',
    new Date('2025-11-15T10:00:00'),
    new Date('2025-11-15T11:00:00'),
    {
      description: 'Weekly sync',
      location: 'Conference Room A',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      category: 'meeting',
    }
  )
}
```

### Filtering Tasks

```tsx
import { getTasks } from '@/lib/tasks'

// Get all high priority tasks
const highPriorityTasks = await getTasks({ priority: 'high' })

// Get overdue tasks
const now = new Date()
const overdueTasks = await getTasks({ 
  dueBefore: now,
  includeCompleted: false 
})

// Get tasks for specific project
const projectTasks = await getTasks({ 
  projectId: 'project-uuid' 
})

// Get starred tasks
const starredTasks = await getTasks({ isStarred: true })
```

## Keyboard Shortcuts

- `Cmd/Ctrl + \` - Toggle UnifiedPanel
- `Enter` - Submit quick task (when input focused)

## Statistics Available

```typescript
interface TaskStats {
  total: number           // Total tasks
  todo: number           // Tasks to do
  in_progress: number    // Tasks in progress
  completed: number      // Completed tasks
  overdue: number        // Overdue tasks
  due_today: number      // Due today
  due_this_week: number  // Due this week
  starred: number        // Starred tasks
}
```

## Performance Optimizations

1. **Lazy Loading**: Tasks only load when tab is opened
2. **Filtered Queries**: Only fetch necessary data
3. **Indexed Queries**: All common queries use database indexes
4. **Real-time Ready**: Set up for Supabase real-time subscriptions
5. **Optimistic Updates**: UI updates before API confirmation

## Security

- ✅ Row Level Security on all tables
- ✅ User isolation (can only see own data)
- ✅ Proper foreign key constraints
- ✅ Secure authentication via Supabase
- ✅ Input validation on all forms

## Future Enhancements

Potential features to add:

1. **Real-time Sync**: Use Supabase subscriptions for live updates
2. **Kanban Board**: Visual task board view
3. **Task Dependencies**: Link tasks that depend on each other
4. **File Attachments**: Attach files to tasks/events
5. **Comments**: Add notes and comments to tasks
6. **Bulk Operations**: Select and modify multiple tasks
7. **Export/Import**: Export data to CSV/JSON
8. **Custom Views**: Save custom filter combinations
9. **Productivity Reports**: Weekly/monthly reports
10. **Email Reminders**: Automated email notifications
11. **Mobile Optimization**: Better mobile experience
12. **Drag & Drop**: Reorder tasks and change priorities
13. **Dark Mode**: Full dark mode support
14. **Keyboard Navigation**: Full keyboard support
15. **Quick Filters**: Saved filter presets

## Troubleshooting

### Tasks not loading
- Check Supabase connection
- Verify RLS policies are correct
- Check browser console for errors

### Can't create tasks
- Verify authentication
- Check user_id in database
- Ensure all required fields are provided

### Calendar not showing events
- Check date filters
- Verify event times are in correct timezone
- Check RLS policies

## Support

For issues or questions:
1. Check the schema was run correctly in Supabase
2. Verify all imports are correct
3. Check browser console for errors
4. Review Supabase logs for server errors

## License

This feature is part of the Notes Desktop application.
