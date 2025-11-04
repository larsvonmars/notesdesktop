# Calendar & Reminders Feature

## Overview
The Calendar & Reminders feature allows users to create, manage, and view calendar events directly within the Notes Desktop application. Events can be accessed via a dedicated button in the bottom toolbar.

## Features

### Calendar Modal
- **Full Calendar View**: Monthly calendar grid showing all events
- **List View**: Detailed list of all events with sorting
- **Upcoming Events Sidebar**: Quick view of the next 5 upcoming events
- **Real-time Updates**: Events sync automatically using Supabase real-time subscriptions

### Event Management
- **Create Events**: Add new calendar events with title, description, dates, and times
- **Edit Events**: Modify existing events
- **Delete Events**: Remove unwanted events
- **All-Day Events**: Option to create all-day events without specific times
- **Color Coding**: Choose from 8 different colors to categorize events
- **Event Descriptions**: Add detailed descriptions to events

### Date and Time
- **Start and End Dates**: Set specific date ranges for events
- **Time Selection**: Choose specific start and end times (for non-all-day events)
- **Calendar Navigation**: Navigate between months easily
- **Today Button**: Quick jump to current date
- **Date Selection**: Click any date on the calendar to create an event for that day

## User Interface

### Bottom Toolbar Button
A "Calendar" button with a purple calendar icon appears in the bottom toolbar next to the "Projects" button:
- Icon: Calendar icon in purple
- Hover effect: Purple background highlight
- Accessible from any note view

### Calendar Modal Layout
The modal is divided into three main sections:

1. **Header**
   - Title and description
   - Close button

2. **Main Content Area**
   - View toggle (Calendar/List)
   - New Event button
   - Calendar grid or list view
   - Month navigation controls

3. **Sidebar**
   - Upcoming events (next 5)
   - Quick access to event details

### Event Form
When creating or editing an event:
- Title (required)
- Description (optional)
- All-day toggle
- Start date and time
- End date and time
- Color picker (8 colors)
- Save/Delete buttons

## Database Schema

The feature uses the existing `calendar_events` table in Supabase:

```sql
CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  all_day boolean DEFAULT false,
  color text DEFAULT '#3B82F6',
  user_id uuid NOT NULL,
  note_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES auth.users(id),
  FOREIGN KEY (note_id) REFERENCES public.notes(id)
);
```

## Technical Implementation

### Files Created/Modified

1. **`lib/calendar.ts`**
   - Calendar event CRUD operations
   - Date range queries
   - Real-time subscription setup
   - Type definitions for CalendarEvent

2. **`components/CalendarModal.tsx`**
   - Full calendar UI implementation
   - Event form with validation
   - Calendar grid generation
   - List view with event details
   - Real-time event updates

3. **`components/NoteEditor.tsx`**
   - Added Calendar button to bottom toolbar
   - Imported CalendarModal component
   - Added state management for modal visibility

### Key Functions

#### Library Functions (`lib/calendar.ts`)
- `getCalendarEvents()`: Fetch all events for current user
- `getCalendarEventsByDateRange()`: Get events within date range
- `getCalendarEventById()`: Get single event details
- `createCalendarEvent()`: Create new event
- `updateCalendarEvent()`: Update existing event
- `deleteCalendarEvent()`: Delete event
- `subscribeToCalendarEvents()`: Real-time subscription

#### Component Features
- Calendar grid generation with proper week alignment
- Event filtering by date
- Form validation
- Color selection
- Time formatting
- Month navigation

## Usage

### Opening the Calendar
1. Look for the "Calendar" button in the bottom toolbar
2. Click the button to open the Calendar & Reminders modal

### Creating an Event
1. Click the "New Event" button or click on a specific date in the calendar
2. Fill in the event details:
   - Enter a title (required)
   - Add a description (optional)
   - Toggle "All day" if needed
   - Select start and end dates
   - Choose start and end times (if not all-day)
   - Pick a color for the event
3. Click "Create Event" to save

### Editing an Event
1. In Calendar view: Click on an event in the calendar grid
2. In List view: Click on an event card
3. In Sidebar: Click on an upcoming event
4. Modify the event details
5. Click "Save Changes"

### Deleting an Event
1. Open the event for editing (see above)
2. Click the "Delete" button
3. Confirm the deletion

### Viewing Events
- **Calendar View**: See events visually on the calendar grid
- **List View**: See all events in a sortable list
- **Upcoming Events**: Check the sidebar for the next 5 upcoming events

## Styling

### Color Scheme
- Primary: Purple accent (#8B5CF6) for the calendar button
- Event colors: 8 options (Blue, Red, Green, Amber, Purple, Pink, Indigo, Teal)
- Modal: White background with gray borders
- Hover states: Subtle color transitions

### Responsive Design
- Maximum modal width: 5xl (80rem)
- Maximum height: 90vh
- Scrollable content areas
- Fixed header and sidebar

## Future Enhancements

Potential improvements for future versions:
1. **Todo List Integration**: Separate todos from calendar events
2. **Recurring Events**: Support for daily, weekly, monthly repeating events
3. **Notifications**: Browser/desktop notifications for upcoming events
4. **Note Linking**: Link calendar events to specific notes (note_id field)
5. **Event Categories**: Filter and group events by categories
6. **Calendar Export**: Export events to iCal format
7. **Event Search**: Search through calendar events
8. **Month/Week/Day Views**: Additional calendar view options
9. **Drag and Drop**: Move events by dragging in calendar view
10. **Time Zone Support**: Handle multiple time zones

## Known Limitations

- Events are stored in UTC and displayed in local time
- No recurring events support yet
- No reminder/notification system yet
- Calendar only shows one month at a time
- No integration with external calendars (Google Calendar, etc.)

## Testing

To test the calendar feature:
1. Start the development server: `npm run dev`
2. Log in to the application
3. Click the "Calendar" button in the bottom toolbar
4. Create a few test events with different dates and colors
5. Navigate between months
6. Switch between Calendar and List views
7. Edit and delete events
8. Check that real-time updates work (open in multiple tabs)

## Accessibility

- Keyboard navigation support
- Focus management in modals
- Color contrast compliance
- Screen reader friendly labels
- Escape key to close modals
- Enter key to submit forms
